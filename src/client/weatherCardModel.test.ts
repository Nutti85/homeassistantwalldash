import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { buildV2WeatherCardModel } from './weatherCardModel';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({
  entity_id,
  state: value,
  attributes,
});
const baseStates = (): Record<string, HomeAssistantState> => ({
  weatherDaily: state('sensor.weather_daily', 'sunny', { current_temperature: 12.4, apparent_temperature: 10.3 }),
  outdoor: state('sensor.outdoor', '11.6'),
  netatmoPressure: state('sensor.pressure', '1013', { unit_of_measurement: 'hPa' }),
  netatmoPressureTrend: state('sensor.pressure_trend', 'rising'),
  netatmoOutdoorHumidity: state('sensor.outdoor_humidity', '76'),
  netatmoOutdoorTemperatureTrend: state('sensor.temperature_trend', 'stable'),
  netatmoWindAngle: state('sensor.wind_angle', '225'),
  netatmoWindDirection: state('sensor.wind_direction', 'SV'),
  netatmoWindSpeed: state('sensor.wind_speed', '4.2'),
  netatmoWindGust: state('sensor.wind_gust', '7.8'),
  netatmoRainLastHour: state('sensor.rain_last_hour', '0.4'),
  netatmoRainToday: state('sensor.rain_today', '1.8'),
});
const model = (overrides: Record<string, HomeAssistantState>, now = new Date('2026-09-23T07:00:00.000Z')) =>
  buildV2WeatherCardModel({ ...baseStates(), ...overrides }, now);
const pollenState = (entityId: string, level: string, attributes: Record<string, unknown> = {}) => state(entityId, level, attributes);
const nightForecast = (...points: Array<{ datetime: string; temperature: number }>) =>
  state('sensor.weather_hourly', 'forecast', { forecast: points });

describe('buildV2WeatherCardModel', () => {
  it('uses current weather, apparent temperature, live wind, and separate rain sensors', () => {
    expect(model({})).toMatchObject({
      condition: 'sunny',
      temperature: 12.4,
      feelsLike: 10.3,
      temperatureTrend: 'stable',
      windSpeed: 4.2,
      windGust: 7.8,
      windBearing: 225,
      rainLastHour: 0.4,
      rainToday: 1.8,
    });
  });

  it.each([
    ['1020.4', 'Høytrykk'],
    ['1008', 'Lavtrykk'],
    ['1013', 'Normalt trykk'],
  ])('classifies %s hPa as %s', (value, pressureClass) => {
    expect(model({
      netatmoPressure: state('sensor.pressure', value, { unit_of_measurement: 'hPa' }),
    })).toMatchObject({ pressure: Number(value), pressureClass });
  });

  it.each([
    ['1', 'up'],
    ['-1', 'down'],
    ['0', 'stable'],
    ['up', 'up'],
    ['falling', 'down'],
    ['stable', 'stable'],
    ['unknown', 'unknown'],
    ['unavailable', 'unknown'],
  ])('normalizes a %s temperature trend to %s', (value, trend) => {
    expect(model({
      netatmoOutdoorTemperatureTrend: state('sensor.temperature_trend', value),
    }).temperatureTrend).toBe(trend);
  });

  it('shows unavailable readings without deriving zero or a pressure class', () => {
    const result = model({
      weatherDaily: state('sensor.weather_daily', 'sunny', { current_temperature: 'unknown' }),
      outdoor: state('sensor.outdoor', 'unavailable'),
      netatmoPressure: state('sensor.pressure', 'not a number', { unit_of_measurement: 'hPa' }),
      netatmoPressureTrend: state('sensor.pressure_trend', 'unavailable'),
      netatmoOutdoorHumidity: state('sensor.outdoor_humidity', 'unknown'),
      netatmoWindSpeed: state('sensor.wind_speed', 'unknown'),
      netatmoWindGust: state('sensor.wind_gust', 'not a number'),
      netatmoRainLastHour: state('sensor.rain_last_hour', 'unavailable'),
      netatmoRainToday: state('sensor.rain_today', 'unknown'),
    });

    expect(result.temperature).toBeUndefined();
    expect(result.pressure).toBeUndefined();
    expect(result.pressureClass).toBeUndefined();
    expect(result.humidity).toBeUndefined();
    expect(result.windSpeed).toBeUndefined();
    expect(result.windGust).toBeUndefined();
    expect(result.rainLastHour).toBeUndefined();
    expect(result.rainToday).toBeUndefined();
    expect(result.pressureTrend).toBe('unknown');
  });

  it('does not classify a numeric pressure without an hPa-compatible unit', () => {
    const result = model({
      netatmoPressure: state('sensor.pressure', '1020.4', { unit_of_measurement: 'kPa' }),
    });

    expect(result.pressure).toBeUndefined();
    expect(result.pressureClass).toBeUndefined();
  });

  it('treats a valid pollen level of zero as Ingen during the pollen season', () => {
    expect(model({
      pollenForecast: state('sensor.pollen_forecast', 'Tilgjengelig'),
      pollenAlder: pollenState('sensor.alder', '0', { level_name: 'Lav' }),
    }).seasonalSignal).toEqual({ kind: 'pollen', species: 'Or', level: 0, label: 'Ingen' });
  });

  it('selects the highest available pollen level', () => {
    expect(model({
      pollenForecast: state('sensor.pollen_forecast', 'Tilgjengelig'),
      pollenAlder: pollenState('sensor.alder', '1'),
      pollenBirch: pollenState('sensor.birch', '2'),
      pollenGrass: pollenState('sensor.grass', '3'),
    }).seasonalSignal).toMatchObject({ kind: 'pollen', species: 'Gress', level: 3, label: 'Høy' });
  });

  it.each([
    ['pollenAlder', 'pollenBirch', 'Or'],
    ['pollenBirch', 'pollenGrass', 'Bjørk'],
    ['pollenGrass', 'pollenHazel', 'Gress'],
    ['pollenHazel', 'pollenMugwort', 'Hassel'],
    ['pollenMugwort', 'pollenWillow', 'Burot'],
  ])('breaks equal pollen levels in the specified order (%s before %s)', (first, second, expectedSpecies) => {
    const entityIds: Record<string, string> = {
      pollenAlder: 'sensor.alder',
      pollenBirch: 'sensor.birch',
      pollenGrass: 'sensor.grass',
      pollenHazel: 'sensor.hazel',
      pollenMugwort: 'sensor.mugwort',
      pollenWillow: 'sensor.willow',
    };
    expect(model({
      pollenForecast: state('sensor.pollen_forecast', 'Tilgjengelig'),
      [first]: pollenState(entityIds[first], '2'),
      [second]: pollenState(entityIds[second], '2'),
    }).seasonalSignal).toMatchObject({ kind: 'pollen', species: expectedSpecies, level: 2 });
  });

  it('prioritizes active pollen over an alert and frost', () => {
    expect(model({
      pollenForecast: state('sensor.pollen_forecast', 'Tilgjengelig'),
      pollenBirch: pollenState('sensor.birch', '1'),
      meteoAlarm: state('sensor.meteo_alarm', 'on', { event: 'wind', eventAwarenessName: 'Vindvarsel' }),
      weatherHourly: nightForecast({ datetime: '2026-09-23T16:00:00+00:00', temperature: -2 }),
    }).seasonalSignal.kind).toBe('pollen');
  });

  it('shows an active MeteoAlarm warning before forecast frost', () => {
    expect(model({
      pollenForecast: state('sensor.pollen_forecast', 'unavailable'),
      meteoAlarm: state('sensor.meteo_alarm', 'on', {
        event: 'wind', eventAwarenessName: 'Vindvarsel', riskMatrixColor: 'Yellow', area: 'Sandefjord',
      }),
      weatherHourly: nightForecast({ datetime: '2026-09-23T16:00:00+00:00', temperature: -2 }),
    }).seasonalSignal).toEqual({
      kind: 'alert', label: 'Vindvarsel', detail: 'Gult nivå · Sandefjord',
    });
  });

  it('finds the previous night minimum before 09:00 in Europe/Oslo', () => {
    expect(model({
      weatherHourly: nightForecast(
        { datetime: '2026-09-22T16:30:00+00:00', temperature: -1.4 },
        { datetime: '2026-09-23T07:00:00+00:00', temperature: -2.7 },
        { datetime: '2026-09-23T07:01:00+00:00', temperature: -9 },
      ),
    }, new Date('2026-09-23T06:00:00.000Z')).seasonalSignal).toEqual({ kind: 'frost', minimum: -2.7 });
  });

  it('finds the upcoming night minimum from 09:00 onward', () => {
    expect(model({
      weatherHourly: nightForecast(
        { datetime: '2026-09-23T15:59:00+00:00', temperature: -9 },
        { datetime: '2026-09-23T16:00:00+00:00', temperature: -1.4 },
        { datetime: '2026-09-24T07:00:00+00:00', temperature: -3.2 },
      ),
    }, new Date('2026-09-23T07:00:00.000Z')).seasonalSignal).toEqual({ kind: 'frost', minimum: -3.2 });
  });

  it('keeps the overnight window correct across the Europe/Oslo spring DST change', () => {
    expect(model({
      weatherHourly: nightForecast(
        { datetime: '2026-03-28T16:59:00+00:00', temperature: -9 },
        { datetime: '2026-03-28T17:00:00+00:00', temperature: -1.8 },
        { datetime: '2026-03-29T07:00:00+00:00', temperature: -0.2 },
      ),
    }, new Date('2026-03-29T06:00:00.000Z')).seasonalSignal).toEqual({ kind: 'frost', minimum: -1.8 });
  });

  it('uses the next available sunrise or sunset when no pollen, alert, or frost is available', () => {
    expect(model({
      weatherHourly: nightForecast({ datetime: '2026-09-23T18:00:00+02:00', temperature: 1.2 }),
      sun: state('sun.sun', 'above_horizon', {
        next_rising: '2026-09-24T04:15:00+00:00',
        next_setting: '2026-09-23T17:10:00+00:00',
      }),
    }, new Date('2026-09-23T12:00:00.000Z')).seasonalSignal).toEqual({
      kind: 'daylight', label: 'Solnedgang', time: '19:10',
    });
  });

  it('uses a quiet unavailable state when no signal source has current data', () => {
    expect(model({
      pollenForecast: state('sensor.pollen_forecast', 'unavailable'),
      meteoAlarm: state('sensor.meteo_alarm', '0'),
      weatherHourly: nightForecast({ datetime: '2026-09-23T18:00:00+02:00', temperature: 1.2 }),
      sun: state('sun.sun', 'unavailable'),
    }).seasonalSignal).toEqual({ kind: 'unavailable' });
  });
});