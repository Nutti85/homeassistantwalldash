import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { V2WeatherCard } from './V2WeatherCard';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({
  entity_id,
  state: value,
  attributes,
});
const reading = (value: number, category: string) => ({
  value,
  category,
  observedAt: '2026-09-23T11:45:00.000Z',
  source: 'open-meteo',
});
const jsonResponse = (body: unknown, ok = true): Response => ({ ok, json: async () => body }) as Response;
const baseStates = (): Record<string, HomeAssistantState> => ({
  weatherDaily: state('sensor.weather_daily', 'sunny', { current_temperature: 12.4, apparent_temperature: 10.3 }),
  netatmoOutdoorTemperatureTrend: state('sensor.temperature_trend', 'rising'),
  netatmoPressure: state('sensor.pressure', '1020.4', { unit_of_measurement: 'hPa' }),
  netatmoPressureTrend: state('sensor.pressure_trend', '-1'),
  netatmoOutdoorHumidity: state('sensor.outdoor_humidity', '76'),
  netatmoWindAngle: state('sensor.wind_angle', '225'),
  netatmoWindDirection: state('sensor.wind_direction', 'SV'),
  netatmoWindSpeed: state('sensor.wind_speed', '4.2'),
  netatmoWindGust: state('sensor.wind_gust', '7.8'),
  netatmoRainLastHour: state('sensor.rain_last_hour', '0.4'),
  netatmoRainToday: state('sensor.rain_today', '1.8'),
});
const renderCard = (states: Record<string, HomeAssistantState> = {}, onDetails = vi.fn()) => render(
  <V2WeatherCard states={{ ...baseStates(), ...states }} onDetails={onDetails}/>,
);
const setFetch = (fetcher: typeof fetch) => vi.stubGlobal('fetch', fetcher);

beforeEach(() => {
  setFetch(vi.fn(async () => jsonResponse({ value: null })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('V2WeatherCard', () => {
  it('matches the J weather hierarchy and keeps the condition name out of the visible temperature block', () => {
    renderCard();
    const card = screen.getByRole('button', { name: /Åpne detaljert vær/ });

    expect(card).toHaveClass('ppf-weather-j');
    expect(card.querySelector('.ppf-weather-j-condition-icon')).toBeInTheDocument();
    expect(card.querySelector('.ppf-weather-j-compass')).toBeInTheDocument();
    expect(screen.getByText('12,4°C')).toBeInTheDocument();
    expect(screen.getByText('Følt som 10,3°C')).toBeInTheDocument();
    expect(screen.queryByText('Sol', { selector: ':not(.open-signal *)' })).not.toBeInTheDocument();
    expect(card.querySelector('button')).toBeNull();
    expect(card.getAttribute('aria-label')).toContain('Temperaturtrend: Stigende');
    expect(card.getAttribute('aria-label')).toContain('Trykktrend: Synkende');
  });

  it('places the live compass before wind and gust copy and exposes direction words', () => {
    renderCard();
    const card = screen.getByRole('button', { name: /Åpne detaljert vær/ });
    const compass = card.querySelector('.ppf-weather-j-compass')!;
    const wind = card.querySelector('.ppf-weather-j-wind-copy')!;

    expect(Boolean(compass.compareDocumentPosition(wind) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(wind).toHaveTextContent('Vind4,2 m/sKast7,8 m/s');
    expect(card.getAttribute('aria-label')).toContain('Vindretning SV');
    expect(card.getAttribute('aria-label')).toContain('Pilen peker mot NØ');
  });

  it('places pressure, humidity, and rain before the AQI and seasonal row', () => {
    const { container } = renderCard();
    const card = container.querySelector('.ppf-weather-j')!;
    const rowOrder = Array.from(card.children, (row) => {
      if (row.classList.contains('ppf-weather-j-top')) return 'current';
      if (row.classList.contains('ppf-weather-j-measurements')) return 'measurements';
      if (row.classList.contains('ppf-weather-j-signals')) return 'signals';
      return 'unknown';
    });
    const accessibleLabel = card.getAttribute('aria-label')!;

    expect(rowOrder).toEqual(['current', 'measurements', 'signals']);
    expect(accessibleLabel.indexOf('Trykk ')).toBeLessThan(accessibleLabel.indexOf('US AQI '));
  });

  it('shows US AQI value, Norwegian category, six bands, and a marker at the live position', async () => {
    setFetch(vi.fn(async () => jsonResponse(reading(225, 'very-unhealthy'))));
    renderCard();
    const card = await screen.findByRole('button', { name: /US AQI 225, Svært usunn/ });

    expect(await screen.findByText('US AQI')).toBeInTheDocument();
    expect(screen.getByText('Svært usunn')).toBeInTheDocument();
    expect(screen.getByText('Svært usunn')).toHaveStyle({ color: '#a284be' });
    expect(card.querySelectorAll('.ppf-weather-j-aqi-segment')).toHaveLength(6);
    expect(card.querySelector('.ppf-weather-j-aqi-marker')).toHaveStyle({ left: '70.8%' });
    expect(card.querySelector('.ppf-weather-j-aqi-scale')).toHaveAttribute('aria-label', 'US AQI-skala. Verdi 225, kategori Svært usunn.');
  });

  it('marks valid zero pollen as Ingen and shows the Norwegian species', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T07:00:00.000Z'));
    renderCard({
      pollenForecast: state('sensor.pollen_forecast', 'Tilgjengelig'),
      pollenAlder: state('sensor.pollen_alder', '0', { level_name: 'Lav' }),
    });

    expect(screen.getByText('Pollenvarsel')).toBeInTheDocument();
    expect(screen.getByText('Ingen')).toBeInTheDocument();
    expect(screen.getByText('Or')).toBeInTheDocument();
  });

  it('shows an active alert before frost when pollen is unavailable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T07:00:00.000Z'));
    renderCard({
      pollenForecast: state('sensor.pollen_forecast', 'unavailable'),
      meteoAlarm: state('sensor.meteo_alarm', 'on', { event: 'wind', eventAwarenessName: 'Vindvarsel', riskMatrixColor: 'Yellow', area: 'Sandefjord' }),
      weatherHourly: state('sensor.weather_hourly', 'forecast', {
        forecast: [{ datetime: '2026-09-23T16:00:00+00:00', temperature: -2 }],
      }),
    });

    expect(screen.getByText('Vindvarsel')).toBeInTheDocument();
    expect(screen.getByText('Gult nivå · Sandefjord')).toBeInTheDocument();
  });

  it('shows overnight frost, the next daylight event, and a quiet unavailable state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T06:00:00.000Z'));
    const frost = renderCard({
      weatherHourly: state('sensor.weather_hourly', 'forecast', {
        forecast: [{ datetime: '2026-09-23T07:00:00+00:00', temperature: -2.7 }],
      }),
    });
    expect(screen.getByText('Frost i natt')).toBeInTheDocument();
    expect(screen.getByText('−2,7°C')).toBeInTheDocument();
    frost.unmount();

    vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
    const daylight = renderCard({
      weatherHourly: state('sensor.weather_hourly', 'forecast', {
        forecast: [{ datetime: '2026-09-23T18:00:00+02:00', temperature: 1.2 }],
      }),
      sun: state('sun.sun', 'above_horizon', {
        next_rising: '2026-09-24T04:15:00+00:00',
        next_setting: '2026-09-23T17:10:00+00:00',
      }),
    });
    expect(screen.getByText('Solnedgang')).toBeInTheDocument();
    expect(screen.getByText('19:10')).toBeInTheDocument();
    daylight.unmount();

    vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
    renderCard();
    expect(document.querySelector('.ppf-weather-j-seasonal-unavailable')).toHaveTextContent('Ikke tilgjengelig');
    expect(screen.getByText('Ingen varsler eller prognoser')).toBeInTheDocument();
  });

  it('makes last-hour rain primary and today secondary', () => {
    renderCard();

    expect(screen.getByText('Luftfuktighet')).toBeInTheDocument();
    expect(screen.getByText('Regn siste time')).toBeInTheDocument();
    expect(document.querySelector('.ppf-weather-j-rain .ppf-weather-j-metric-value')).toHaveTextContent('0,4 mm');
    expect(screen.getByText('I dag: 1,8 mm')).toBeInTheDocument();
  });

  it('opens detailed weather with pointer, Enter, and Space activation', () => {
    const onDetails = vi.fn();
    renderCard({}, onDetails);
    const card = screen.getByRole('button', { name: /Åpne detaljert vær/ });

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });

    expect(onDetails).toHaveBeenCalledTimes(3);
  });

  it('shows AQI unavailable after a failed request while keeping live weather visible', async () => {
    setFetch(vi.fn(async () => { throw new Error('network unavailable'); }));
    renderCard();

    expect(screen.getByText('12,4°C')).toBeInTheDocument();
    expect(document.querySelector('.ppf-weather-j-air-signal .is-unavailable')).toHaveTextContent('Ikke tilgjengelig');
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  it('fetches immediately, refreshes every thirty minutes, and aborts the active request on unmount', async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const fetcher = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      firstSignal ??= init?.signal as AbortSignal | undefined;
      return jsonResponse(reading(42, 'good'));
    });
    setFetch(fetcher);
    const view = renderCard();

    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(firstSignal?.aborted).toBe(true);
  });
});
