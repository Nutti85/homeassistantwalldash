import type { HomeAssistantState, JacobPlanItem, JacobWeeklyPlanSnapshot, MyKidKindergartenItem, MyKidKindergartenSnapshot } from '../shared/entities';

export const unavailableLabel = 'Ikke tilgjengelig';
const unavailableStates = new Set(['unknown', 'unavailable', 'none', '']);

export const stateValue = (state: HomeAssistantState | undefined): string | undefined =>
  state && !unavailableStates.has(state.state.toLowerCase()) ? state.state : undefined;

const planText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const planScalar = (value: unknown): string | number | undefined => typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const planItems = (value: unknown): JacobPlanItem[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const title = planText(row.title ?? row.name ?? row.summary ?? row.message ?? row.description);
    if (!title) return [];
    return [{
      ...(planText(row.date) ? { date: planText(row.date) } : {}),
      ...(planText(row.weekday) ? { weekday: planText(row.weekday) } : {}),
      ...(planText(row.time) ? { time: planText(row.time) } : {}),
      title,
      ...(planText(row.details ?? row.description) ? { details: planText(row.details ?? row.description) } : {}),
      ...(planText(row.subject) ? { subject: planText(row.subject) } : {}),
    }];
  });
};
const planStrings = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((item) => { const text = planText(item); return text ? [text] : []; }) : [];

export const jacobWeeklyPlan = (state: HomeAssistantState | undefined): JacobWeeklyPlanSnapshot | undefined => {
  if (!stateValue(state)) return undefined;
  const attributes = state?.attributes ?? {};
  return {
    summary: planText(attributes.summary) ?? '',
    ...(planText(attributes.week_start) ? { week_start: planText(attributes.week_start) } : {}),
    ...(planText(attributes.week_end) ? { week_end: planText(attributes.week_end) } : {}),
    ...(planText(attributes.source_updated_at) ? { source_updated_at: planText(attributes.source_updated_at) } : {}),
    ...(planScalar(attributes.plan_id) !== undefined ? { plan_id: planScalar(attributes.plan_id) } : {}),
    events: planItems(attributes.events),
    reminders: planItems(attributes.reminders),
    homework: planItems(attributes.homework),
    school_schedule: planItems(attributes.school_schedule),
    topics: planStrings(attributes.topics),
    messages: planStrings(attributes.messages),
  };
};

const mykidItems = (value: unknown): MyKidKindergartenItem[] => planItems(value).map((item) => ({
  ...(item.date ? { date: item.date } : {}),
  ...(item.time ? { time: item.time } : {}),
  title: item.title,
  ...(item.details ? { details: item.details } : {}),
  ...(item.published_at ? { published_at: item.published_at } : {}),
}));

export const mykidKindergarten = (state: HomeAssistantState | undefined): MyKidKindergartenSnapshot | undefined => {
  if (!stateValue(state)) return undefined;
  const attributes = state?.attributes ?? {};
  return {
    summary: planText(attributes.summary) ?? '',
    health: planText(attributes.health) ?? 'unavailable',
    ...(planText(attributes.source_updated_at) ? { source_updated_at: planText(attributes.source_updated_at) } : {}),
    events: mykidItems(attributes.events),
    noticeboard: mykidItems(attributes.noticeboard),
    weeklyPlans: mykidItems(attributes.weekly_plans),
    newsletters: mykidItems(attributes.newsletters),
    birthdays: mykidItems(attributes.birthdays),
    today: mykidItems(attributes.today),
  };
};

const validDate = (value: unknown): string | undefined => typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : undefined;
const calendarTimestamp = (value: unknown): string | undefined => {
  const direct = validDate(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const timestamp = value as Record<string, unknown>;
  return validDate(timestamp.dateTime ?? timestamp.date);
};

export interface CalendarEvent { title: string; start: string; end?: string; allDay: boolean }

export const calendarEvents = (state: HomeAssistantState | undefined): CalendarEvent[] => {
  const attributes = state?.attributes ?? {};
  const rawEvents = Array.isArray(attributes.events) ? attributes.events : Array.isArray(attributes.data) ? attributes.data : [attributes];
  return rawEvents.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const start = calendarTimestamp(row.start ?? row.start_time ?? row.begin);
    if (!start) return [];
    const end = calendarTimestamp(row.end ?? row.end_time ?? row.finish);
    const title = [row.title, row.summary, row.message, row.description].find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? 'Uten tittel';
    const startValue = row.start;
    const allDay = row.all_day === true || (
      !!startValue && typeof startValue === 'object' && !Array.isArray(startValue)
      && typeof (startValue as Record<string, unknown>).date === 'string'
    );
    return [{ title, start, end, allDay }];
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

export type AlertSeverity = 'yellow' | 'orange' | 'red';
export type MeteoAlert = { events: string[]; severity?: AlertSeverity; name: string; description?: string; consequences?: string; instruction?: string; area?: string; response?: string; seriousness?: string; startsAt?: string; endsAt?: string; incidentName?: string; altitude?: string };

export const meteoEventMeta: Record<string, { label: string; icon: string }> = {
  wind: { label: 'Vindkast', icon: 'air' }, gale: { label: 'Kuling', icon: 'air' }, rain: { label: 'Regn', icon: 'rainy' }, rainFlood: { label: 'Styrtregn', icon: 'rainy' }, snow: { label: 'Snø', icon: 'ac_unit' }, blowingSnow: { label: 'Snøfokk', icon: 'ac_unit' }, ice: { label: 'Is / is på vei', icon: 'severe_cold' }, stormSurge: { label: 'Høy vannstand', icon: 'tsunami' }, polarLow: { label: 'Polart lavtrykk', icon: 'cyclone' }, forestFire: { label: 'Skogbrannfare', icon: 'local_fire_department' }, icing: { label: 'Ising', icon: 'severe_cold' }, lightning: { label: 'Mye lyn', icon: 'thunderstorm' },
};

export const meteoAlarmSeverity = (value?: string): AlertSeverity | undefined => {
  const normalized = value?.trim().toLocaleLowerCase('nb-NO');
  if (normalized?.includes('red') || normalized?.includes('rødt')) return 'red';
  if (normalized?.includes('orange') || normalized?.includes('oransje')) return 'orange';
  if (normalized?.includes('yellow') || normalized?.includes('gult')) return 'yellow';
  return undefined;
};

export const attrText = (attributes: Record<string, unknown>, ...keys: string[]) => {
  const value = keys.map((key) => attributes[key]).find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : undefined;
};

export const attrEvents = (attributes: Record<string, unknown>) => {
  const value = attributes.event;
  return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;|]/) : []).map((event) => String(event).trim()).filter(Boolean);
};

export const isoTimes = (value?: string) => value?.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g) ?? [];

export const parseMeteoAlert = (attributes: Record<string, unknown>, state?: string): MeteoAlert => {
  const [startsAt, endsAt] = [attrText(attributes, 'onset', 'effective', 'startsAt', 'start'), attrText(attributes, 'expires', 'ends', 'endsAt', 'end')];
  const stateTimes = isoTimes(state);
  const events = attrEvents(attributes);
  const name = attrText(attributes, 'eventAwarenessName', 'headline', 'title') ?? (events.map((event) => meteoEventMeta[event]?.label ?? event).join(' · ') || state?.split(',')[0]?.trim() || 'Farevarsel');
  return { events, severity: meteoAlarmSeverity(attrText(attributes, 'riskMatrixColor', 'awareness_level') ?? state), name, description: attrText(attributes, 'description'), consequences: attrText(attributes, 'consequences'), instruction: attrText(attributes, 'instruction'), area: attrText(attributes, 'area', 'areaDesc'), response: attrText(attributes, 'awarenessResponse'), seriousness: attrText(attributes, 'awarenessSeriousness'), startsAt: startsAt ?? stateTimes[0], endsAt: endsAt ?? stateTimes[1], incidentName: attrText(attributes, 'incidentName'), altitude: attrText(attributes, 'altitude', 'ceiling') };
};

export const meteoAlarmEntries = (
  state?: HomeAssistantState,
  period?: { startAt: string; endAt: string },
  now = new Date(),
): MeteoAlert[] => {
  if (!state || !state.state || ['0', 'ingen farevarsel', 'unavailable', 'unknown'].includes(state.state.trim().toLocaleLowerCase('nb-NO'))) return [];
  const alerts = state.attributes.alerts;
  const parsedAlerts = Array.isArray(alerts)
    ? alerts.filter((alert): alert is Record<string, unknown> => typeof alert === 'object' && alert !== null && !Array.isArray(alert)).map((alert) => parseMeteoAlert(alert))
    : [parseMeteoAlert(state.attributes, state.state)];
  return parsedAlerts.filter((alert) => {
    if (!period) return !alert.endsAt || !Number.isFinite(Date.parse(alert.endsAt)) || Date.parse(alert.endsAt) >= now.getTime();
    const starts = alert.startsAt ? Date.parse(alert.startsAt) : Number.NEGATIVE_INFINITY;
    const ends = alert.endsAt ? Date.parse(alert.endsAt) : Number.POSITIVE_INFINITY;
    return starts < Date.parse(period.endAt) && ends >= Date.parse(period.startAt);
  });
};

export const securityPresentation = (state: HomeAssistantState | undefined) => {
  const value = Number(stateValue(state));
  if (value === 1) return { label: 'Armert', icon: 'shield_lock', tone: 'safe' } as const;
  if (value === 2) return { label: 'Notifikasjoner', icon: 'pause_circle', tone: 'notice' } as const;
  if (value === 3) return { label: 'Deaktivert', icon: 'shield', tone: 'danger' } as const;
  return { label: 'Ukjent', icon: 'help', tone: 'muted' } as const;
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
