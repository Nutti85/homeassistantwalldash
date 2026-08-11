import type { HomeAssistantState } from '../shared/entities';

export const unavailableLabel = 'Ikke tilgjengelig';
const unavailableStates = new Set(['unknown', 'unavailable', 'none', '']);

export const stateValue = (state: HomeAssistantState | undefined): string | undefined =>
  state && !unavailableStates.has(state.state.toLowerCase()) ? state.state : undefined;

const validDate = (value: unknown): string | undefined => typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : undefined;

export interface CalendarEvent { title: string; start: string; end?: string; allDay: boolean }

export const calendarEvents = (state: HomeAssistantState | undefined): CalendarEvent[] => {
  const attributes = state?.attributes ?? {};
  const rawEvents = Array.isArray(attributes.events) ? attributes.events : Array.isArray(attributes.data) ? attributes.data : [attributes];
  return rawEvents.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const start = validDate(row.start ?? row.start_time ?? row.begin);
    if (!start) return [];
    const end = validDate(row.end ?? row.end_time ?? row.finish);
    const title = [row.title, row.summary, row.message, row.description].find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? 'Uten tittel';
    return [{ title, start, end, allDay: row.all_day === true }];
  }).sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
};

const localDateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const calendarDayKey = (value: string): string => localDateKey(new Date(value));
export const formatCalendarTime = (value: string | undefined): string => value ? new Date(value).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '—';
export const calendarEventOccursOnDay = (event: CalendarEvent, dayKey: string): boolean => {
  const startDay = calendarDayKey(event.start);
  if (!event.end) return startDay === dayKey;
  const endDay = calendarDayKey(event.end);
  return startDay === endDay ? startDay === dayKey : startDay <= dayKey && dayKey < endDay;
};

export const wasteDaysUntil = (state: HomeAssistantState | undefined): number | undefined => {
  const explicit = state?.attributes.days_until ?? state?.attributes.days;
  const numeric = Number(explicit ?? stateValue(state));
  if (Number.isFinite(numeric)) return Math.max(0, Math.ceil(numeric));
  const value = stateValue(state);
  const leadingNumber = value?.match(/^\s*(\d+)/)?.[1];
  if (leadingNumber) return Number(leadingNumber);
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  const today = new Date();
  const target = new Date(value);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.max(0, Math.ceil((startTarget - startToday) / 86_400_000));
};

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
