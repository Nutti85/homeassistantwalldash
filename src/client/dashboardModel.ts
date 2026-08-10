import type { HomeAssistantState } from '../shared/entities';

export const unavailableLabel = 'Ikke tilgjengelig';
const unavailableStates = new Set(['unknown', 'unavailable', 'none', '']);

export const stateValue = (state: HomeAssistantState | undefined): string | undefined =>
  state && !unavailableStates.has(state.state.toLowerCase()) ? state.state : undefined;

export const homeLabel = (state: Pick<HomeAssistantState, 'state'> | undefined): string =>
  !state || unavailableStates.has(state.state.toLowerCase()) ? unavailableLabel : state.state;

export const booleanLabel = (state: Pick<HomeAssistantState, 'state'> | undefined): string => {
  if (!state || unavailableStates.has(state.state.toLowerCase())) return unavailableLabel;
  return state.state === 'on' ? 'På' : state.state === 'off' ? 'Av' : state.state;
};

export const temperatureNumber = (state: HomeAssistantState | undefined): number | undefined => {
  const value = state?.attributes.temperature;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const currentTemperatureNumber = (state: HomeAssistantState | undefined): number | undefined => {
  const attribute = state?.attributes.current_temperature;
  if (typeof attribute === 'number' && Number.isFinite(attribute)) return attribute;
  const value = Number(stateValue(state));
  return Number.isFinite(value) ? value : undefined;
};

export const temperatureValue = (state: HomeAssistantState | undefined): string => {
  const value = temperatureNumber(state);
  if (value !== undefined) return `${value} °C`;
  const current = currentTemperatureNumber(state);
  return current !== undefined ? `${current} °C nå · settpunkt mangler` : unavailableLabel;
};

export interface ForecastPoint {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation?: number;
  precipitationProbability?: number;
  windSpeed?: number;
  windGustSpeed?: number;
  cloudCoverage?: number;
}

const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const text = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;

export const forecastPoints = (state: HomeAssistantState | undefined): ForecastPoint[] => {
  const forecast = state?.attributes.forecast;
  if (!Array.isArray(forecast)) return [];
  return forecast.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const datetime = text(row.datetime);
    if (!datetime || Number.isNaN(Date.parse(datetime))) return [];
    return [{
      datetime,
      condition: text(row.condition),
      temperature: finite(row.temperature),
      templow: finite(row.templow),
      precipitation: finite(row.precipitation),
      precipitationProbability: finite(row.precipitation_probability),
      windSpeed: finite(row.wind_speed),
      windGustSpeed: finite(row.wind_gust_speed),
      cloudCoverage: finite(row.cloud_coverage),
    }];
  });
};

export const securityPresentation = (state: HomeAssistantState | undefined) => {
  const value = Number(stateValue(state));
  if (value === 1) return { label: 'Mode: Armert', icon: 'shield_lock', tone: 'safe' } as const;
  if (value === 2) return { label: 'Mode: Notifikasjoner', icon: 'pause_circle', tone: 'notice' } as const;
  if (value === 3) return { label: 'Mode: Deaktivert', icon: 'shield_off', tone: 'danger' } as const;
  return { label: 'Mode: Ukjent', icon: 'help', tone: 'muted' } as const;
};

export const isRepairNeeded = (state: HomeAssistantState | undefined): boolean => {
  const value = stateValue(state)?.toLowerCase();
  return value !== undefined && !['ok', 'healthy', 'on', 'clear', '0'].includes(value);
};

export const conditionLabel = (condition?: string): string => ({
  rainy: 'Regn', pouring: 'Kraftig regn', cloudy: 'Skyet', partlycloudy: 'Delvis skyet',
  sunny: 'Sol', clear: 'Klart', snowy: 'Snø', fog: 'Tåke', lightning: 'Tordenvær',
}[condition?.toLowerCase() ?? ''] ?? (condition || 'Ikke tilgjengelig'));

export const conditionIcon = (condition?: string): string => {
  const value = condition?.toLowerCase() ?? '';
  if (value.includes('rain') || value === 'pouring') return 'rainy';
  if (value.includes('snow')) return 'weather_snowy';
  if (value.includes('sun') || value === 'clear') return 'sunny';
  if (value.includes('partly')) return 'partly_cloudy_day';
  return 'cloud';
};
