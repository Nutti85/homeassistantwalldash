import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { briefingPeriod, buildBriefingViewModel, clothingAdvice, roundTemperature, roundWind } from './briefingModel';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });

const osloTime = (value: string) => new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

describe('briefing periods', () => {
  it.each([
    ['morning', '06:00', '09:00', 'Morgen · 06:00–09:00'],
    ['midday', '09:00', '15:00', 'Formiddag · 09:00–15:00'],
    ['afternoon', '16:00', '19:00', 'Ettermiddag · 16:00–19:00'],
    ['evening', '19:00', '23:00', 'Kveld · 19:00–23:00'],
  ] as const)('maps %s to its fixed Oslo interval', (mode, start, end, label) => {
    const period = briefingPeriod(mode, '2026-09-04T22:00:00+02:00');
    expect(period.label).toBe(label);
    expect(osloTime(period.startAt)).toBe(start);
    expect(osloTime(period.endAt)).toBe(end);
  });

  it('uses the 24 hours after publication for a full report', () => {
    const period = briefingPeriod('full', '2026-09-04T22:00:00+02:00');
    expect(Date.parse(period.endAt) - Date.parse(period.startAt)).toBe(24 * 60 * 60 * 1000);
    expect(period.label).toMatch(/^Neste 24 timer/);
  });
});

describe('briefing view model ordering', () => {
  it('always returns the approved metric and practical order', () => {
    const report = { mode: 'evening' as const, publishedAt: '2026-09-04T22:00:00+02:00' };
    const model = buildBriefingViewModel(report, {
      weatherHourly: state('sensor.hourly', 'rainy', { forecast: [] }),
    }, new Date('2026-09-04T22:05:00+02:00'));

    expect(model.metrics.map(({ id }) => id)).toEqual(['weather', 'temperature', 'wind', 'rain', 'clothing']);
    expect(model.practical.map(({ id }) => id)).toEqual(['calendar', 'travel', 'school', 'kindergarten', 'home', 'warnings']);
  });
});

describe('briefing weather metrics', () => {
  const fullReport = { mode: 'full' as const, publishedAt: '2026-09-04T22:00:00+02:00' };
  const fullForecast = [
    { datetime: '2026-09-04T20:00:00Z', condition: 'partlycloudy', temperature: 11.02, precipitation: 0, precipitation_probability: 10, wind_speed: 2.1, wind_gust_speed: 5.6 },
    { datetime: '2026-09-05T02:00:00Z', condition: 'rainy', temperature: 12.25, precipitation: 0.1, precipitation_probability: 45, wind_speed: 3.4, wind_gust_speed: 5.6 },
    { datetime: '2026-09-05T08:00:00Z', condition: 'sunny', temperature: 17.51, precipitation: 0, precipitation_probability: 20, wind_speed: 1.8, wind_gust_speed: 5.6 },
    { datetime: '2026-09-05T20:00:00Z', temperature: 15, wind_speed: 2, wind_gust_speed: 5 },
  ];

  it('uses the current outdoor and Netatmo readings only inside the active period', () => {
    const model = buildBriefingViewModel(fullReport, {
      outdoor: state('sensor.outdoor', '12.7'),
      netatmoWindSpeed: state('sensor.wind', '0.0'),
      netatmoWindGust: state('sensor.gust', '0.56'),
      netatmoRain: state('sensor.rain', '0'),
      netatmoRainToday: state('sensor.rain_today', '8.3'),
      weatherHourly: state('sensor.hourly', 'rainy', { forecast: fullForecast }),
    }, new Date('2026-09-04T22:05:00+02:00'));

    expect(model.metrics[0]).toMatchObject({ id: 'weather', value: 'Regn' });
    expect(model.metrics[1]).toMatchObject({
      id: 'temperature', value: '12,5 °C', context: expect.stringContaining('11,0–17,5 °C'),
    });
    expect(model.metrics[2]).toMatchObject({
      id: 'wind', value: '0 m/s', context: expect.stringContaining('kast opptil 6 m/s'),
    });
    expect(model.metrics[3]).toMatchObject({
      id: 'rain', value: '0 mm', context: expect.stringContaining('8,3 mm i dag'),
    });
  });

  it('uses only the future named interval instead of current readings', () => {
    const model = buildBriefingViewModel({ mode: 'morning', publishedAt: '2026-09-04T22:00:00+02:00' }, {
      outdoor: state('sensor.outdoor', '30'),
      netatmoWindSpeed: state('sensor.wind', '20'),
      netatmoWindGust: state('sensor.gust', '22'),
      netatmoRain: state('sensor.rain', '9'),
      weatherHourly: state('sensor.hourly', 'cloudy', { forecast: [
        { datetime: '2026-09-05T03:00:00Z', condition: 'cloudy', temperature: 4 },
        { datetime: '2026-09-05T04:00:00Z', condition: 'cloudy', temperature: 6, wind_speed: 2, wind_gust_speed: 4, precipitation: 0, precipitation_probability: 15 },
        { datetime: '2026-09-05T05:00:00Z', condition: 'sunny', temperature: 7, wind_speed: 3, wind_gust_speed: 5, precipitation: 0.1, precipitation_probability: 20 },
        { datetime: '2026-09-05T06:00:00Z', condition: 'partlycloudy', temperature: 8, wind_speed: 2, wind_gust_speed: 4, precipitation: 0, precipitation_probability: 10 },
        { datetime: '2026-09-05T07:00:00Z', temperature: 20 },
      ] }),
    }, new Date('2026-09-04T22:05:00+02:00'));

    expect(model.metrics[1].value).toBe('6,0–8,0 °C');
    expect(model.metrics[1].value).not.toContain('30');
    expect(model.metrics[2].value).toBe('3 m/s');
    expect(model.metrics[2].value).not.toContain('20');
    expect(model.metrics[3].value).toBe('0,1 mm');
  });
});

describe('briefing rounding and clothing rules', () => {
  it.each([
    [12.24, 12], [12.25, 12.5], [12.74, 12.5], [12.75, 13],
  ])('rounds temperature %s to the nearest half degree', (input, expected) => {
    expect(roundTemperature(input)).toBe(expected);
  });

  it.each([[0.4, 0], [0.5, 1], [3.49, 3], [3.5, 4]])('rounds wind %s to a whole m/s', (input, expected) => {
    expect(roundWind(input)).toBe(expected);
  });

  it.each([
    [4.9, 'Varm jakke og lag'],
    [5, 'Jakke og lag'],
    [12, 'Lett jakke eller genser'],
    [18, 'Lette klær'],
  ])('chooses deterministic clothing at %s °C', (temperature, primary) => {
    expect(clothingAdvice([{ datetime: '2026-09-05T06:00:00Z', temperature }])).toMatchObject({ primary });
  });

  it('adds rainwear and a windproof layer at the agreed boundaries', () => {
    expect(clothingAdvice([{ datetime: '2026-09-05T06:00:00Z', temperature: 12, precipitation: 0, precipitationProbability: 40, windGustSpeed: 10 }]).additions)
      .toEqual(['Regntøy eller paraply', 'Vindtett lag']);
    expect(clothingAdvice([{ datetime: '2026-09-05T06:00:00Z', temperature: 12, precipitation: 0.2, precipitationProbability: 0, windGustSpeed: 9.9 }]).additions)
      .toEqual(['Regntøy eller paraply']);
  });
});
