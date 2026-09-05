import type { AiReportMode } from './api';
import { buildChargingAdvice, chargingPreparationAdvice } from './briefingAdvice';
import { briefingCopy } from './briefingCopy';
import { calendarTrips, relevantTrips, tripDeparture } from './briefingTravel';
import { resolveBriefingPeriod, type BriefingMode } from './briefingPeriod';
import { calendarEvents, conditionIcon, conditionLabel, currentTemperatureNumber, meteoAlarmEntries, mykidKindergarten, jacobWeeklyPlan, securityPresentation, forecastPoints, stateValue, type CalendarEvent, type ForecastPoint } from './dashboardModel';
import type { HomeAssistantState } from '../shared/entities';

const OSLO_TIME_ZONE = 'Europe/Oslo';

export type BriefingMetricId = 'weather' | 'temperature' | 'wind' | 'rain' | 'clothing';
export type BriefingPracticalId = 'calendar' | 'travel' | 'school' | 'kindergarten' | 'home' | 'warnings' | 'charging';
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

const osloDayKey = (date: Date): string => date.toLocaleDateString('en-CA', { timeZone: OSLO_TIME_ZONE });
const periodDayKeys = (period: BriefingPeriod): Set<string> => {
  const days = new Set<string>();
  for (let timestamp = Date.parse(period.startAt); timestamp < Date.parse(period.endAt); timestamp += 24 * 60 * 60 * 1000) days.add(osloDayKey(new Date(timestamp)));
  days.add(osloDayKey(new Date(Date.parse(period.endAt) - 1)));
  return days;
};
const formatOsloDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: OSLO_TIME_ZONE }).format(date).replace(' kl. ', ' ');
};
const formatItemContext = (title: string, date?: string, time?: string): string => {
  const when = time && !Number.isNaN(Date.parse(time)) ? formatOsloDateTime(time) : date && !Number.isNaN(Date.parse(date)) ? new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeZone: OSLO_TIME_ZONE }).format(new Date(`${date}T12:00:00Z`)) : time || date || '';
  return when ? `${title} · ${when}` : title;
};
const eventOverlapsPeriod = (event: CalendarEvent, period: BriefingPeriod): boolean => {
  const start = Date.parse(event.start);
  const end = event.end ? Date.parse(event.end) : start + 1;
  return start < Date.parse(period.endAt) && end > Date.parse(period.startAt);
};
const calendarBriefing = (state: HomeAssistantState | undefined, period: BriefingPeriod): BriefingItem<'calendar'> => {
  if (!stateValue(state)) return unavailable('calendar', 'Kalender', 'calendar_month');
  const events = calendarEvents(state);
  const relevant = events.filter((event) => eventOverlapsPeriod(event, period)).slice(0, 2);
  if (relevant.length) return { id: 'calendar', label: 'Kalender', icon: 'calendar_month', value: relevant[0].title, context: relevant.map((event) => event.allDay ? `${event.title} · Hele dagen` : formatItemContext(event.title, undefined, event.start)).join(' · '), tone: 'default' };
  const next = events.find((event) => Date.parse(event.start) >= Date.parse(period.endAt));
  return { id: 'calendar', label: 'Kalender', icon: 'calendar_month', value: 'Ingen avtaler i perioden', context: next ? `Neste: ${formatItemContext(next.title, undefined, next.start)}` : 'Ingen kommende avtaler', tone: 'muted' };
};

const travelValue = (state: HomeAssistantState | undefined): string => {
  const value = numberState(state);
  return value === undefined ? 'Ikke tilgjengelig' : `${roundWind(value)} min`;
};
const travelBriefing = (andreas: HomeAssistantState | undefined, hege: HomeAssistantState | undefined): BriefingItem<'travel'> => ({
  id: 'travel', label: 'Reise', icon: 'route', value: `Andreas: ${travelValue(andreas)}`, context: `Hege: ${travelValue(hege)}`, tone: andreas || hege ? 'default' : 'muted',
});

const periodWeekdays = (period: BriefingPeriod): Set<string> => {
  const values = new Set<string>();
  for (let timestamp = Date.parse(period.startAt); timestamp < Date.parse(period.endAt); timestamp += 60 * 60 * 1000) values.add(new Intl.DateTimeFormat('nb-NO', { weekday: 'long', timeZone: OSLO_TIME_ZONE }).format(new Date(timestamp)).toLocaleLowerCase('nb-NO'));
  return values;
};
const itemMatchesPeriod = (item: { date?: string; weekday?: string; time?: string }, period: BriefingPeriod): boolean => {
  const days = periodDayKeys(period);
  if (item.date && days.has(item.date.slice(0, 10))) return true;
  if (item.time && !Number.isNaN(Date.parse(item.time))) {
    const timestamp = Date.parse(item.time);
    if (timestamp >= Date.parse(period.startAt) && timestamp < Date.parse(period.endAt)) return true;
  }
  if (item.weekday) {
    const weekday = periodWeekdays(period);
    return [...weekday].some((day) => item.weekday!.toLocaleLowerCase('nb-NO').includes(day));
  }
  return false;
};
const itemText = (item: { title: string; date?: string; weekday?: string; time?: string; details?: string }): string => {
  const when = item.time || item.date || item.weekday;
  return item.details ? `${item.title} · ${item.details}` : formatItemContext(item.title, when && !item.time ? when : undefined, item.time);
};
const schoolBriefing = (state: HomeAssistantState | undefined, period: BriefingPeriod): BriefingItem<'school'> => {
  const plan = jacobWeeklyPlan(state);
  if (!plan) return unavailable('school', 'Skole', 'school');
  const items = [...plan.events, ...plan.reminders, ...plan.homework, ...plan.school_schedule].filter((item) => itemMatchesPeriod(item, period)).slice(0, 2);
  return items.length ? { id: 'school', label: 'Skole', icon: 'school', value: items[0].title, context: items.map(itemText).join(' · '), tone: 'default' } : { id: 'school', label: 'Skole', icon: 'school', value: 'Ingen skole denne perioden', context: 'Ingen relevant planpunkt', tone: 'muted' };
};
const kindergartenBriefing = (state: HomeAssistantState | undefined, period: BriefingPeriod, now: Date): BriefingItem<'kindergarten'> => {
  const plan = mykidKindergarten(state);
  if (!plan || plan.health === 'unavailable') return unavailable('kindergarten', 'Barnehage', 'child_care');
  const currentDay = osloDayKey(now);
  const todayItems = plan.today.filter((item) => itemMatchesPeriod(item, period) || (!item.date && !item.time && periodDayKeys(period).has(currentDay)));
  const items = [...todayItems, ...plan.events, ...plan.birthdays, ...plan.weeklyPlans, ...plan.noticeboard, ...plan.newsletters].filter((item, index, all) => index < todayItems.length || itemMatchesPeriod(item, period)).slice(0, 2);
  return items.length ? { id: 'kindergarten', label: 'Barnehage', icon: 'child_care', value: items[0].title, context: items.map(itemText).join(' · '), tone: 'default' } : { id: 'kindergarten', label: 'Barnehage', icon: 'child_care', value: 'Ingen plan denne perioden', context: 'Ingen relevant planpunkt', tone: 'muted' };
};

const homeBriefing = (lock: HomeAssistantState | undefined, security: HomeAssistantState | undefined): BriefingItem<'home'> => {
  const lockValue = stateValue(lock);
  const door = lockValue === 'locked' ? 'Låst' : lockValue === 'unlocked' ? 'Ulåst' : 'Ytterdør: Ikke tilgjengelig';
  const securityValue = security ? securityPresentation(security).label : 'Ikke tilgjengelig';
  return { id: 'home', label: 'Hjemmet', icon: lockValue === 'locked' ? 'lock' : 'home', value: door, context: securityValue, tone: lockValue === 'locked' || securityValue === 'Armert' ? 'positive' : 'default' };
};

const severityLabel: Record<'yellow' | 'orange' | 'red', string> = { yellow: 'Gult nivå', orange: 'Oransje nivå', red: 'Rødt nivå' };
const warningsBriefing = (states: Record<string, HomeAssistantState>, period: BriefingPeriod, now: Date): BriefingItem<'warnings'> => {
  const meteo = meteoAlarmEntries(states.meteoAlarm, period, now);
  const lightning = numberState(states.lightningDistance);
  const gusts = forecastPointsInPeriod(forecastPoints(states.weatherHourly), period).flatMap((point) => point.windGustSpeed === undefined ? [] : [point.windGustSpeed]);
  const hasGustWarning = gusts.some((gust) => gust >= 10);
  const aurora = stateValue(states.auroraVisibility)?.toLocaleLowerCase('nb-NO') === 'on';
  const warnings = [
    ...meteo.map((alert) => `${alert.name}${alert.severity ? ` · ${severityLabel[alert.severity]}` : ''}`),
    ...(lightning !== undefined && lightning < 10 ? [`Lyn ${lightning.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km`] : []),
    ...(hasGustWarning ? ['Vindkastvarsel'] : []),
    ...(aurora ? ['Nordlys'] : []),
  ];
  return warnings.length ? { id: 'warnings', label: 'Varsler', icon: 'warning', value: warnings[0], context: warnings.slice(1, 2).join(' · ') || 'Se varsel for detaljer', tone: 'warning' } : { id: 'warnings', label: 'Varsler', icon: 'warning', value: 'Ingen varsler', context: 'Ingen aktive eller overlappende varsler', tone: 'positive' };
};

const unavailable = <Id extends string>(id: Id, label: string, icon: string): BriefingItem<Id> => ({
  id, label, icon, value: 'Ikke tilgjengelig', context: 'Kilde mangler eller er utilgjengelig', tone: 'muted',
});

const buildViewModelForPeriod = (period: BriefingPeriod, states: Record<string, HomeAssistantState>, now = new Date()): BriefingViewModel => {
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
      calendarBriefing(states.calendar, period),
      travelBriefing(states.andreasTravelTime, states.hegeTravelTime),
      schoolBriefing(states.jacobWeeklyPlan, period),
      kindergartenBriefing(states.mykidKindergarten, period, now),
      homeBriefing(states.frontDoorLock, states.securityMode),
      warningsBriefing(states, period, now),
    ],
  };
};

export const buildBriefingViewModel = (report: BriefingReport, states: Record<string, HomeAssistantState>, now = new Date()): BriefingViewModel =>
  buildViewModelForPeriod(briefingPeriod(report.mode, report.publishedAt), states, now);

const sourceAvailable = (state: HomeAssistantState | undefined): boolean => {
  const value = state?.state.trim().toLowerCase();
  return !!state && !!state.entity_id && !!value && !['unknown', 'unavailable', 'none', 'null'].includes(value);
};

const sourceReading = (state: HomeAssistantState | undefined, now: Date, maxAgeMs = 5 * 60_000) => {
  const value = Number(stateValue(state));
  const observed = [state?.last_reported, state?.last_updated, state?.last_changed, state?.attributes.timestamp]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => Date.parse(item)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const quality = !state?.entity_id ? 'unconfigured' as const
    : !Number.isFinite(value) ? 'unknown' as const
      : observed === undefined ? 'unknown' as const
        : now.getTime() - observed > maxAgeMs ? 'stale' as const : 'available' as const;
  return { value: Number.isFinite(value) ? value : undefined, observedAt: observed === undefined ? undefined : new Date(observed).toISOString(), fetchedAt: now.toISOString(), quality };
};

const dateOnlyInOslo = (date: Date): string => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
const addOsloDay = (date: Date, days: number): string => {
  const value = new Date(`${dateOnlyInOslo(date)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const departureFor = (state: HomeAssistantState | undefined, now: Date, days: number): Date | undefined => {
  const raw = stateValue(state)?.trim();
  if (!raw) return undefined;
  if (Number.isFinite(Date.parse(raw)) && /\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw);
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const day = addOsloDay(now, days);
  const localAsUtc = new Date(`${day}T${String(Number(match[1])).padStart(2, '0')}:${match[2]}:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'shortOffset' }).formatToParts(localAsUtc).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+1';
  const offsetMatch = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = offsetMatch ? (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] ?? 0)) * (offsetMatch[1] === '-' ? -1 : 1) : 60;
  return new Date(localAsUtc.getTime() - offsetMinutes * 60_000);
};
const confirmedWorkday = (states: Record<string, HomeAssistantState>, date: string, days: number): boolean => {
  const candidate = states[days === 0 ? 'workdayToday' : 'workdayTomorrow'] ?? states.workday;
  if (!sourceAvailable(candidate) || candidate?.state.trim().toLowerCase() !== 'on') return false;
  const statedDate = typeof candidate?.attributes.date === 'string' ? candidate.attributes.date.slice(0, 10) : undefined;
  return !statedDate || statedDate === date;
};
const commuteTrip = (states: Record<string, HomeAssistantState>, now: Date): import('../shared/briefing').Trip | undefined => {
  const departureState = states.carAndreasDeparture;
  for (const days of [0, 1]) {
    const departure = departureFor(departureState, now, days);
    if (!departure) continue;
    const date = dateOnlyInOslo(departure);
    if (!confirmedWorkday(states, date, days)) continue;
    return {
      id: `commute:andreas:${date}`,
      kind: 'commute',
      startsAt: departure.toISOString(),
      person: 'Andreas',
      minutes: sourceReading(states.andreasTravelTime, now),
    };
  }
  return undefined;
};
const liveTripsForPeriod = (states: Record<string, HomeAssistantState>, period: BriefingPeriod, now: Date) => {
  const calendar = calendarTrips(calendarEvents(states.calendar));
  const commute = commuteTrip(states, now);
  const candidates = [...calendar, ...(commute ? [commute] : [])];
  const scoped = candidates.filter((trip) => Date.parse(trip.startsAt) >= Date.parse(period.startAt) && Date.parse(trip.startsAt) < Date.parse(period.endAt));
  const isRollingOrFuture = period.label.startsWith('Neste døgn') || Date.parse(period.startAt) > now.getTime();
  const relevant = isRollingOrFuture ? scoped : relevantTrips(candidates, now, true).filter((trip) => scoped.some((candidate) => candidate.id === trip.id));
  if (commute && period.label.includes('Kveld') && Date.parse(commute.startsAt) > now.getTime()
    && Date.parse(commute.startsAt) - now.getTime() <= 24 * 60 * 60_000 && !relevant.some((trip) => trip.id === commute.id)) return [commute, ...relevant];
  return relevant;
};
const liveTravelItem = (trip: ReturnType<typeof liveTripsForPeriod>[number] | undefined, now: Date) => {
  if (!trip) return undefined;
  const destination = trip.destination ? ` til ${trip.destination}` : '';
  const title = trip.kind === 'commute' ? 'Andreas skal på jobb' : trip.title ?? `Avtale${destination}`;
  const departure = tripDeparture(trip, now);
  const startTime = new Date(trip.startsAt).toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
  const context = departure
    ? `Dra senest kl. ${departure.toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })} · ${trip.minutes?.value} min reisetid.`
    : `${trip.kind === 'commute' ? 'Avreise' : 'Starter'} kl. ${startTime}. ${briefingCopy.travelTimeUnavailable}`;
  return { id: 'travel' as const, label: 'Reise', icon: 'route', value: title, context, tone: 'default' as const };
};
const liveWarningItem = (states: Record<string, HomeAssistantState>, period: BriefingPeriod, now: Date) => {
  const item = warningsBriefing(states, period, now);
  if (item.value !== 'Ingen varsler') return item;
  if (sourceAvailable(states.meteoAlarm) || sourceAvailable(states.lightningDistance) || sourceAvailable(states.auroraVisibility)) {
    return { ...item, value: 'Ingen aktive varsler', context: 'Det er ikke registrert noe varsel akkurat nå.' };
  }
  return { ...item, value: briefingCopy.warningsUnavailable, context: 'Prøv igjen litt senere.', tone: 'muted' as const };
};
const latestForecastTime = (states: Record<string, HomeAssistantState>): string => {
  const timestamps = forecastPoints(states.weatherHourly)
    .map((point) => Date.parse(point.datetime))
    .filter((timestamp) => Number.isFinite(timestamp));
  const latest = timestamps.length ? Math.max(...timestamps) : undefined;
  return latest === undefined ? 'senere' : new Date(latest).toLocaleTimeString('nb-NO', {
    timeZone: OSLO_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(/:00$/, '');
};
const liveLanguage = (model: BriefingViewModel, states: Record<string, HomeAssistantState>): BriefingViewModel => ({
  ...model,
  metrics: model.metrics.map((item) => {
    if (item.id === 'weather' && !sourceAvailable(states.weatherHourly)) return { ...item, value: 'Ikke tilgjengelig', context: briefingCopy.weatherUnavailable, tone: 'muted' as const };
    if (['temperature', 'wind', 'rain'].includes(item.id) && item.value === 'Ikke tilgjengelig') return { ...item, context: briefingCopy.weatherUnavailable };
    if (item.context.toLocaleLowerCase('nb-NO').includes('prognose mangler')) return { ...item, context: briefingCopy.noForecast };
    if (item.context.toLocaleLowerCase('nb-NO').includes('delvis prognose')) {
      const last = item.context.split('·').at(-1)?.trim();
      return { ...item, context: last?.startsWith('Delvis') ? briefingCopy.partialForecast(latestForecastTime(states)) : item.context };
    }
    return item;
  }),
  practical: model.practical.map((item) => {
    if (item.value !== 'Ikke tilgjengelig') return item;
    const fallback = item.id === 'calendar' ? 'Får ikke sjekket kalenderen nå.'
      : item.id === 'school' ? 'Får ikke sjekket skoleplanen nå.'
        : item.id === 'kindergarten' ? 'Får ikke sjekket barnehageplanen nå.'
          : item.id === 'home' ? 'Får ikke sjekket hjemmet nå.'
            : item.context;
    return fallback === item.context ? item : { ...item, context: fallback };
  }),
});

export const buildLiveBriefingViewModel = (mode: BriefingMode, states: Record<string, HomeAssistantState>, now = new Date()): BriefingViewModel => {
  const period = resolveBriefingPeriod(mode, now);
  const base = liveLanguage(buildViewModelForPeriod(period, states, now), states);
  const trips = liveTripsForPeriod(states, period, now);
  const trip = trips[0];
  const travel = liveTravelItem(trip, now);
  const charging = buildChargingAdvice(states, now, travel !== undefined);
  const practical = base.practical
    .filter((item) => item.id !== 'travel' && item.id !== 'charging')
    .map((item) => item.id === 'warnings' ? liveWarningItem(states, period, now) : item)
    .map((item) => item.id === 'school' && item.value === 'Ingen skole denne perioden' ? { ...item, value: 'Ingen opplysninger om skole akkurat nå.', context: 'Sjekk skoleplanen senere.', tone: 'muted' as const } : item)
    .map((item) => item.id === 'kindergarten' && item.value === 'Ingen plan denne perioden' ? { ...item, value: 'Ingen opplysninger fra barnehagen akkurat nå.', context: 'Sjekk barnehageplanen senere.', tone: 'muted' as const } : item);
  const preparation = trip?.kind === 'commute' ? chargingPreparationAdvice(trip.id, new Date(trip.startsAt)) : undefined;
  const chargingItem = charging ?? (preparation && now.getTime() >= Date.parse(preparation.prepareAt) && now.getTime() < Date.parse(preparation.dueAt)
    ? { text: preparation.text, context: 'Andreas skal dra snart. Sjekk bilen etter at du har koblet til.', observation: { status: 'unknown' as const, confidence: 'unknown' as const } }
    : undefined);
  return { ...base, practical: [...practical, ...(travel ? [travel] : []), ...(chargingItem ? [{ id: 'charging' as const, label: 'Lading', icon: 'ev_station', value: chargingItem.text, context: chargingItem.context, tone: chargingItem.observation.confidence === 'unknown' ? 'muted' as const : 'default' as const }] : [])] };
};

export const briefingForecastPoints = (states: Record<string, HomeAssistantState>, period: BriefingPeriod): ForecastPoint[] =>
  forecastPointsInPeriod(forecastPoints(states.weatherHourly), period);
