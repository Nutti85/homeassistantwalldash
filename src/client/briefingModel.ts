import type { AiReportMode } from './api';
import { forecastPoints, type ForecastPoint } from './dashboardModel';
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

const unavailable = <Id extends string>(id: Id, label: string, icon: string): BriefingItem<Id> => ({
  id, label, icon, value: 'Ikke tilgjengelig', context: 'Kilde mangler eller er utilgjengelig', tone: 'muted',
});

export const buildBriefingViewModel = (report: BriefingReport, states: Record<string, HomeAssistantState>, _now = new Date()): BriefingViewModel => ({
  period: briefingPeriod(report.mode, report.publishedAt),
  metrics: [
    unavailable('weather', 'Vær', 'partly_cloudy_day'),
    unavailable('temperature', 'Temperatur', 'device_thermostat'),
    unavailable('wind', 'Vind', 'air'),
    unavailable('rain', 'Regn', 'rainy'),
    unavailable('clothing', 'Klær', 'checkroom'),
  ],
  practical: [
    unavailable('calendar', 'Kalender', 'calendar_month'),
    unavailable('travel', 'Reise', 'route'),
    unavailable('school', 'Skole', 'school'),
    unavailable('kindergarten', 'Barnehage', 'child_care'),
    unavailable('home', 'Hjemmet', 'home'),
    unavailable('warnings', 'Varsler', 'warning'),
  ],
});

export const briefingForecastPoints = (states: Record<string, HomeAssistantState>, period: BriefingPeriod): ForecastPoint[] =>
  forecastPointsInPeriod(forecastPoints(states.weatherHourly), period);
