import type { AiReportMode } from './api';
import { conditionIcon, conditionLabel, currentTemperatureNumber, forecastPoints, stateValue, type ForecastPoint } from './dashboardModel';
import type { HomeAssistantState } from '../shared/entities';

const OSLO_TIME_ZONE = 'Europe/Oslo';

export type BriefingMetricId = 'weather' | 'temperature' | 'wind' | 'rain' | 'clothing';
export type BriefingPracticalId = 'calendar' | 'travel' | 'school' | 'kindergarten' | 'home' | 'warnings';
export type BriefingTone = 'default' | 'positive' | 'notice' | 'warning' | 'muted';

export interface BriefingItem<Id extends string> {
  id: Id;
  label: string;
  icon: string;
  value: string;
  context: string;
  tone: BriefingTone;
}

export interface BriefingPeriod {
  startAt: string;
  endAt: string;
  label: string;
  source: 'current-and-forecast' | 'forecast';
}

export interface BriefingViewModel {
  period: BriefingPeriod;
  metrics: BriefingItem<BriefingMetricId>[];
  practical: BriefingItem<BriefingPracticalId>[];
}

export interface BriefingReport {
  mode: AiReportMode;
  publishedAt: string;
}

const focusedPeriods: Record<Exclude<AiReportMode, 'full'>, { startHour: number; endHour: number; label: string }> = {
  morning: { startHour: 6, endHour: 9, label: 'Morgen' },
  midday: { startHour: 9, endHour: 15, label: 'Formiddag' },
  afternoon: { startHour: 16, endHour: 19, label: 'Ettermiddag' },
  evening: { startHour: 19, endHour: 23, label: 'Kveld' },
};

const osloDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OSLO_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
};

const osloOffsetMinutes = (date: Date): number => {
  const value = new Intl.DateTimeFormat('en-US', { timeZone: OSLO_TIME_ZONE, timeZoneName: 'shortOffset' })
    .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
};

const osloLocalDateTime = ({ year, month, day }: ReturnType<typeof osloDateParts>, hour: number): Date => {
  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour));
  return new Date(localAsUtc.getTime() - osloOffsetMinutes(localAsUtc) * 60_000);
};

const addOsloDays = ({ year, month, day }: ReturnType<typeof osloDateParts>, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

const osloShortTime = (date: Date) => {
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: OSLO_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  return `${weekday} ${hour}:${minute}`.trim();
};

export const briefingPeriod = (mode: AiReportMode, publishedAt: string): BriefingPeriod => {
  const published = new Date(publishedAt);
  if (mode === 'full') {
    const startAt = published.toISOString();
    const end = new Date(published.getTime() + 24 * 60 * 60 * 1000);
    return {
      startAt,
      endAt: end.toISOString(),
      label: `Neste 24 timer · ${osloShortTime(published)}–${osloShortTime(end)}`,
      source: 'current-and-forecast',
    };
  }

  const focused = focusedPeriods[mode];
  const publishedParts = osloDateParts(published);
  let start = osloLocalDateTime(publishedParts, focused.startHour);
  let end = osloLocalDateTime(publishedParts, focused.endHour);
  if (published.getTime() >= end.getTime()) {
    const nextDate = addOsloDays(publishedParts, 1);
    start = osloLocalDateTime(nextDate, focused.startHour);
    end = osloLocalDateTime(nextDate, focused.endHour);
  }
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    label: `${focused.label} · ${String(focused.startHour).padStart(2, '0')}:00–${String(focused.endHour).padStart(2, '0')}:00`,
    source: 'forecast',
  };
};

export const forecastPointsInPeriod = (points: ForecastPoint[], period: BriefingPeriod): ForecastPoint[] => {
  const start = Date.parse(period.startAt);
  const end = Date.parse(period.endAt);
  return points.filter((point) => {
    const timestamp = Date.parse(point.datetime);
    return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
  });
};

export const roundTemperature = (value: number): number => Math.round(value * 2) / 2;
export const roundWind = (value: number): number => Math.round(value);

const numberState = (state: HomeAssistantState | undefined): number | undefined => {
  const value = Number(stateValue(state));
  return Number.isFinite(value) ? value : undefined;
};

const formatTemperature = (value: number): string => `${roundTemperature(value).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;
const formatTemperatureRange = (values: number[]): string => {
  const rounded = values.map(roundTemperature);
  const lowest = Math.min(...rounded);
  const highest = Math.max(...rounded);
  return lowest === highest ? formatTemperature(lowest) : `${formatTemperature(lowest).replace(' °C', '')}–${formatTemperature(highest)}`;
};
const formatWind = (value: number): string => `${roundWind(value)} m/s`;
const formatRain = (value: number): string => value === 0 ? '0 mm' : `${value.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;
const appendPartial = (context: string, partial: boolean): string => partial ? `${context} · Delvis prognose` : context;

const forecastIsPartial = (points: ForecastPoint[], period: BriefingPeriod): boolean => {
  if (!points.length) return true;
  const ordered = [...points].sort((left, right) => Date.parse(left.datetime) - Date.parse(right.datetime));
  const start = Date.parse(period.startAt);
  const end = Date.parse(period.endAt);
  const intervals = ordered.slice(1).map((point, index) => Date.parse(point.datetime) - Date.parse(ordered[index].datetime)).filter((value) => value > 0);
  const cadence = intervals.length ? Math.min(...intervals) : 60 * 60 * 1000;
  return Date.parse(ordered[0].datetime) > start || Date.parse(ordered.at(-1)?.datetime ?? '') + cadence < end;
};

export interface ClothingAdvice {
  icon: string;
  primary: string;
  additions: string[];
}

export const clothingAdvice = (points: ForecastPoint[]): ClothingAdvice => {
  const temperatures = points.flatMap((point) => point.temperature === undefined ? [] : [point.temperature]);
  const lowest = temperatures.length ? Math.min(...temperatures) : undefined;
  const primary = lowest === undefined ? 'Ikke tilgjengelig' : lowest < 5 ? 'Varm jakke og lag' : lowest < 12 ? 'Jakke og lag' : lowest < 18 ? 'Lett jakke eller genser' : 'Lette klær';
  const additions: string[] = [];
  if (points.some((point) => (point.precipitationProbability ?? 0) >= 40 || (point.precipitation ?? 0) >= 0.2)) additions.push('Regntøy eller paraply');
  if (points.some((point) => (point.windGustSpeed ?? 0) >= 10)) additions.push('Vindtett lag');
  return { icon: 'checkroom', primary, additions };
};

const unavailable = <Id extends string>(id: Id, label: string, icon: string): BriefingItem<Id> => ({
  id, label, icon, value: 'Ikke tilgjengelig', context: 'Kilde mangler eller er utilgjengelig', tone: 'muted',
});

export const buildBriefingViewModel = (report: BriefingReport, states: Record<string, HomeAssistantState>, now = new Date()): BriefingViewModel => {
  const period = briefingPeriod(report.mode, report.publishedAt);
  const allForecast = forecastPoints(states.weatherHourly);
  const points = forecastPointsInPeriod(allForecast, period);
  const partial = forecastIsPartial(allForecast, period);
  const active = now.getTime() >= Date.parse(period.startAt) && now.getTime() < Date.parse(period.endAt);
  const currentTemperature = active ? currentTemperatureNumber(states.outdoor) : undefined;
  const currentWind = active ? numberState(states.netatmoWindSpeed) : undefined;
  const currentGust = active ? numberState(states.netatmoWindGust) : undefined;
  const currentRain = active ? numberState(states.netatmoRain) : undefined;
  const forecastTemperatures = points.flatMap((point) => point.temperature === undefined ? [] : [point.temperature]);
  const temperatureValues = currentTemperature === undefined ? forecastTemperatures : [currentTemperature, ...forecastTemperatures];
  const forecastWindSpeeds = points.flatMap((point) => point.windSpeed === undefined ? [] : [point.windSpeed]);
  const forecastGusts = points.flatMap((point) => point.windGustSpeed === undefined ? [] : [point.windGustSpeed]);
  const forecastRain = points.flatMap((point) => point.precipitation === undefined ? [] : [point.precipitation]);
  const forecastProbabilities = points.flatMap((point) => point.precipitationProbability === undefined ? [] : [point.precipitationProbability]);
  const clothingPoints = currentTemperature === undefined ? points : [{ datetime: now.toISOString(), temperature: currentTemperature, windGustSpeed: currentGust, precipitation: currentRain }, ...points];
  const clothes = clothingAdvice(clothingPoints);
  const weatherCondition = active ? stateValue(states.weatherHourly) ?? points[0]?.condition : points[0]?.condition ?? stateValue(states.weatherHourly);
  const temperature = temperatureValues.length
    ? currentTemperature === undefined ? {
      value: formatTemperatureRange(temperatureValues),
      context: appendPartial('prognose · lavest–høyest i perioden', partial),
      tone: 'default' as const,
    } : {
      value: formatTemperature(currentTemperature),
      context: appendPartial(`${formatTemperatureRange(temperatureValues)} lavest–høyest i perioden`, partial),
      tone: 'default' as const,
    }
    : { value: 'Ikke tilgjengelig', context: 'Prognose mangler', tone: 'muted' as const };
  const windValue = currentWind ?? (forecastWindSpeeds.length ? Math.max(...forecastWindSpeeds) : undefined);
  const periodGust = [currentGust, ...forecastGusts].filter((value): value is number => value !== undefined);
  const maxGust = periodGust.length ? Math.max(...periodGust) : undefined;
  const wind = windValue !== undefined
    ? { value: formatWind(windValue), context: appendPartial(`maks i perioden · kast opptil ${maxGust === undefined ? 'Ikke tilgjengelig' : formatWind(maxGust)}`, partial), tone: 'default' as const }
    : { value: 'Ikke tilgjengelig', context: 'Prognose mangler', tone: 'muted' as const };
  const rainValue = currentRain ?? (forecastRain.length ? forecastRain.reduce((sum, value) => sum + value, 0) : undefined);
  const rainToday = active ? numberState(states.netatmoRainToday) : undefined;
  const rainContext = rainToday !== undefined
    ? `${formatRain(rainToday)} i dag${forecastProbabilities.length ? ` · høyeste sannsynlighet ${roundWind(Math.max(...forecastProbabilities))} %` : ''}`
    : forecastRain.length
      ? `sum i perioden · høyeste sannsynlighet ${forecastProbabilities.length ? `${roundWind(Math.max(...forecastProbabilities))} %` : 'Ikke tilgjengelig'}`
      : 'Prognose mangler';
  const rain = rainValue !== undefined
    ? { value: formatRain(rainValue), context: appendPartial(rainContext, partial), tone: 'default' as const }
    : { value: 'Ikke tilgjengelig', context: 'Prognose mangler', tone: 'muted' as const };
  return {
    period,
    metrics: [
      { id: 'weather', label: 'Vær', icon: conditionIcon(weatherCondition), value: conditionLabel(weatherCondition), context: active ? 'nå' : 'prognose', tone: 'default' },
      { id: 'temperature', label: 'Temperatur', icon: 'device_thermostat', value: temperature.value, context: temperature.context, tone: temperature.tone },
      { id: 'wind', label: 'Vind', icon: 'air', value: wind.value, context: wind.context, tone: wind.tone },
      { id: 'rain', label: 'Regn', icon: 'rainy', value: rain.value, context: rain.context, tone: rain.tone },
      { id: 'clothing', label: 'Klær', icon: clothes.icon, value: clothes.primary, context: clothes.additions.join(' · ') || 'For perioden', tone: clothes.primary === 'Ikke tilgjengelig' ? 'muted' : 'default' },
    ],
    practical: [
      unavailable('calendar', 'Kalender', 'calendar_month'),
      unavailable('travel', 'Reise', 'route'),
      unavailable('school', 'Skole', 'school'),
      unavailable('kindergarten', 'Barnehage', 'child_care'),
      unavailable('home', 'Hjemmet', 'home'),
      unavailable('warnings', 'Varsler', 'warning'),
    ],
  };
};

export const briefingForecastPoints = (states: Record<string, HomeAssistantState>, period: BriefingPeriod): ForecastPoint[] =>
  forecastPointsInPeriod(forecastPoints(states.weatherHourly), period);
