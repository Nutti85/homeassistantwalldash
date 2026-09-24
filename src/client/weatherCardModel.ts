import type { HomeAssistantState } from '../shared/entities';
import { forecastPoints, meteoAlarmEntries, stateValue } from './dashboardModel';

export type WeatherTrend = 'up' | 'down' | 'stable' | 'unknown';
export type PressureClass = 'Lavtrykk' | 'Normalt trykk' | 'Høytrykk';

export type SeasonalSignal =
  | { kind: 'pollen'; species: string; level: number; label: string }
  | { kind: 'alert'; label: string; detail: string }
  | { kind: 'frost'; minimum: number }
  | { kind: 'daylight'; label: string; time: string }
  | { kind: 'unavailable' };

export interface V2WeatherCardModel {
  condition?: string;
  temperature?: number;
  feelsLike?: number;
  temperatureTrend: WeatherTrend;
  windSpeed?: number;
  windGust?: number;
  windBearing?: number;
  pressure?: number;
  pressureClass?: PressureClass;
  pressureTrend: WeatherTrend;
  humidity?: number;
  rainLastHour?: number;
  rainToday?: number;
  seasonalSignal: SeasonalSignal;
}

const osloTimeZone = 'Europe/Oslo';
const unavailableStates = new Set(['unknown', 'unavailable', 'none', '']);

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim() || unavailableStates.has(value.trim().toLowerCase())) return undefined;
  const parsed = Number(value.trim().replace('−', '-'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const stateNumber = (state: HomeAssistantState | undefined): number | undefined => finiteNumber(stateValue(state));
const nonNegativeStateNumber = (state: HomeAssistantState | undefined): number | undefined => {
  const value = stateNumber(state);
  return value !== undefined && value >= 0 ? value : undefined;
};

const temperatureFromWeather = (state: HomeAssistantState | undefined): number | undefined => (
  finiteNumber(state?.attributes.current_temperature)
  ?? stateNumber(state)
);

const trend = (state: HomeAssistantState | undefined): WeatherTrend => {
  const raw = stateValue(state);
  if (!raw) return 'unknown';
  const value = raw.trim().toLowerCase().replace('−', '-');
  const numeric = Number(value);
  if (numeric === 1) return 'up';
  if (numeric === -1) return 'down';
  if (numeric === 0) return 'stable';
  if (['up', 'rising', 'rise', 'increasing', 'stiger', 'stigende'].includes(value)) return 'up';
  if (['down', 'falling', 'fall', 'decreasing', 'synker', 'synkende'].includes(value)) return 'down';
  if (['stable', 'steady', 'unchanged', 'stabil', 'stabilt'].includes(value)) return 'stable';
  return 'unknown';
};

const pressureUnitIsHpa = (state: HomeAssistantState | undefined): boolean => {
  const unit = state?.attributes.unit_of_measurement;
  return typeof unit === 'string' && ['hpa', 'mbar', 'millibar'].includes(unit.trim().toLowerCase());
};

const pressureClassFor = (value: number | undefined): PressureClass | undefined => {
  if (value === undefined) return undefined;
  if (value <= 1008) return 'Lavtrykk';
  if (value >= 1018) return 'Høytrykk';
  return 'Normalt trykk';
};

const pollenSpecies = [
  { key: 'pollenAlder', label: 'Or' },
  { key: 'pollenBirch', label: 'Bjørk' },
  { key: 'pollenGrass', label: 'Gress' },
  { key: 'pollenHazel', label: 'Hassel' },
  { key: 'pollenMugwort', label: 'Burot' },
  { key: 'pollenWillow', label: 'Selje' },
] as const;

const pollenLabelFor = (level: number, reportedLabel: unknown): string => {
  if (level === 0) return 'Ingen';
  if (typeof reportedLabel === 'string' && reportedLabel.trim()) return reportedLabel.trim();
  const labels = ['Ingen', 'Lav', 'Moderat', 'Høy', 'Ekstrem'];
  return labels[level] ?? ('Nivå ' + level.toLocaleString('nb-NO', { maximumFractionDigits: 1 }));
};

export const pollenLevelReading = (state: HomeAssistantState | undefined): { level?: number; label: string } => {
  const available = stateValue(state);
  if (available === undefined) return { label: '—' };
  const level = finiteNumber(available) ?? finiteNumber(state?.attributes.level);
  if (level === undefined || level < 0) return { label: '—' };
  return { level, label: pollenLabelFor(level, state?.attributes.level_name) };
};

const pollenSignal = (states: Record<string, HomeAssistantState>): SeasonalSignal | undefined => {
  if (stateValue(states.pollenForecast) === undefined) return undefined;
  let selected: { species: string; level: number; label: string } | undefined;

  for (const pollen of pollenSpecies) {
    const reading = pollenLevelReading(states[pollen.key]);
    if (reading.level === undefined) continue;
    if (!selected || reading.level > selected.level) {
      selected = { species: pollen.label, level: reading.level, label: reading.label };
    }
  }

  return selected ? { kind: 'pollen', ...selected } : undefined;
};

type LocalDateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const osloPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: osloTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const osloParts = (date: Date): LocalDateParts => {
  const values = Object.fromEntries(osloPartsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
};

const utcFromOsloLocal = (parts: LocalDateParts, millisecond = 0): number => {
  const intendedWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
  let candidate = intendedWallTime;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = osloParts(new Date(candidate));
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second, millisecond);
    const correction = intendedWallTime - actualWallTime;
    if (correction === 0) break;
    candidate += correction;
  }

  return candidate;
};

const addOsloCalendarDays = (parts: LocalDateParts, amount: number): LocalDateParts => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: parts.hour, minute: parts.minute, second: parts.second };
};

const forecastTimestamp = (value: string): number | undefined => {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(value);
  if (!match) {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!dateOnly) return undefined;
    return utcFromOsloLocal({ year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]), hour: 0, minute: 0, second: 0 });
  }

  const [, year, month, day, hour, minute, second = '0', fraction = ''] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) };
  const timestamp = utcFromOsloLocal(parts, Number((fraction + '000').slice(0, 3)));
  const actual = osloParts(new Date(timestamp));
  if (actual.year !== parts.year || actual.month !== parts.month || actual.day !== parts.day
    || actual.hour !== parts.hour || actual.minute !== parts.minute || actual.second !== parts.second) return undefined;
  return timestamp;
};

const nightWindow = (now: Date): { start: number; end: number } => {
  const today = osloParts(now);
  const beforeNine = today.hour < 9;
  const startDay = beforeNine ? addOsloCalendarDays(today, -1) : today;
  const endDay = beforeNine ? today : addOsloCalendarDays(today, 1);

  return {
    start: utcFromOsloLocal({ ...startDay, hour: 18, minute: 0, second: 0 }),
    end: utcFromOsloLocal({ ...endDay, hour: 9, minute: 0, second: 0 }),
  };
};

const frostMinimum = (states: Record<string, HomeAssistantState>, now: Date): number | undefined => {
  const window = nightWindow(now);
  const temperatures = forecastPoints(states.weatherHourly).flatMap((point) => {
    const timestamp = forecastTimestamp(point.datetime);
    return timestamp !== undefined && timestamp >= window.start && timestamp <= window.end && point.temperature !== undefined
      ? [point.temperature]
      : [];
  });
  if (!temperatures.length) return undefined;
  const minimum = Math.min(...temperatures);
  return minimum < 0 ? minimum : undefined;
};

const activeAlertSignal = (states: Record<string, HomeAssistantState>, now: Date): SeasonalSignal | undefined => {
  const severityRank = { red: 0, orange: 1, yellow: 2 };
  const alert = meteoAlarmEntries(states.meteoAlarm, undefined, now)
    .sort((left, right) => (severityRank[left.severity ?? 'yellow'] ?? 3) - (severityRank[right.severity ?? 'yellow'] ?? 3))[0];
  if (!alert) return undefined;

  const severity = alert.severity === 'red' ? 'Rødt nivå' : alert.severity === 'orange' ? 'Oransje nivå' : alert.severity === 'yellow' ? 'Gult nivå' : undefined;
  const detail = [severity, alert.area].filter(Boolean).join(' · ') || alert.description || 'MeteoAlarm';
  return { kind: 'alert', label: alert.name, detail };
};

const daylightSignal = (state: HomeAssistantState | undefined, now: Date): SeasonalSignal | undefined => {
  const candidates = [
    { key: 'next_rising', label: 'Soloppgang' },
    { key: 'next_setting', label: 'Solnedgang' },
  ].flatMap((candidate) => {
    const value = state?.attributes[candidate.key];
    if (typeof value !== 'string') return [];
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > now.getTime()
      ? [{ label: candidate.label, timestamp }]
      : [];
  }).sort((left, right) => left.timestamp - right.timestamp);

  const next = candidates[0];
  if (!next) return undefined;
  return {
    kind: 'daylight',
    label: next.label,
    time: new Intl.DateTimeFormat('nb-NO', { timeZone: osloTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(next.timestamp)),
  };
};

const seasonalSignalFor = (states: Record<string, HomeAssistantState>, now: Date): SeasonalSignal => (
  pollenSignal(states)
  ?? activeAlertSignal(states, now)
  ?? (() => {
    const minimum = frostMinimum(states, now);
    return minimum === undefined ? undefined : { kind: 'frost' as const, minimum };
  })()
  ?? daylightSignal(states.sun, now)
  ?? { kind: 'unavailable' }
);

const windDirectionBearing = (state: HomeAssistantState | undefined): number | undefined => {
  const value = stateValue(state);
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase().replaceAll('ØST', 'Ø').replaceAll('VEST', 'V').replaceAll('NORD', 'N').replaceAll('SØR', 'S');
  const directions: Record<string, number> = {
    N: 0, NØ: 45, NE: 45, NO: 45, Ø: 90, E: 90, SØ: 135, SE: 135,
    S: 180, SV: 225, SW: 225, V: 270, W: 270, NV: 315, NW: 315,
  };
  const number = finiteNumber(value);
  if (number !== undefined && number >= 0 && number <= 360) return number % 360;
  return directions[normalized];
};

const windBearingFor = (states: Record<string, HomeAssistantState>): number | undefined => {
  const angle = finiteNumber(stateValue(states.netatmoWindAngle))
    ?? finiteNumber(states.netatmoWindAngle?.attributes.angle);
  if (angle !== undefined && angle >= 0 && angle <= 360) return angle % 360;
  return windDirectionBearing(states.netatmoWindDirection);
};

export const buildV2WeatherCardModel = (
  states: Record<string, HomeAssistantState>,
  now: Date,
): V2WeatherCardModel => {
  const dailyWeather = states.weatherDaily;
  const condition = stateValue(dailyWeather) ?? stateValue(states.weatherHourly) ?? forecastPoints(dailyWeather)[0]?.condition;
  const temperature = temperatureFromWeather(dailyWeather)
    ?? stateNumber(states.outdoor)
    ?? finiteNumber(states.outdoor?.attributes.temperature);
  const feelsLike = finiteNumber(dailyWeather?.attributes.apparent_temperature)
    ?? finiteNumber(dailyWeather?.attributes.feels_like)
    ?? finiteNumber(states.weatherHourly?.attributes.apparent_temperature)
    ?? finiteNumber(states.outdoor?.attributes.apparent_temperature);

  const rawPressure = stateNumber(states.netatmoPressure);
  const pressure = pressureUnitIsHpa(states.netatmoPressure) ? rawPressure : undefined;
  const humidity = stateNumber(states.netatmoOutdoorHumidity);
  const humidityValue = humidity !== undefined && humidity >= 0 && humidity <= 100 ? humidity : undefined;

  return {
    ...(condition ? { condition } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(feelsLike !== undefined ? { feelsLike } : {}),
    temperatureTrend: trend(states.netatmoOutdoorTemperatureTrend),
    windSpeed: nonNegativeStateNumber(states.netatmoWindSpeed),
    windGust: nonNegativeStateNumber(states.netatmoWindGust),
    windBearing: windBearingFor(states),
    ...(pressure !== undefined ? { pressure, pressureClass: pressureClassFor(pressure) } : {}),
    pressureTrend: trend(states.netatmoPressureTrend),
    humidity: humidityValue,
    rainLastHour: nonNegativeStateNumber(states.netatmoRainLastHour),
    rainToday: nonNegativeStateNumber(states.netatmoRainToday),
    seasonalSignal: seasonalSignalFor(states, now),
  };
};