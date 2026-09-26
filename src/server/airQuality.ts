export type AirQualityCategory =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous';

export interface AirQualityReading {
  value: number;
  category: AirQualityCategory;
  observedAt: string;
  source: 'open-meteo';
}

export interface AirQualityServiceOptions {
  latitude: number;
  longitude: number;
  fetcher?: typeof fetch;
  now?: () => number;
}

interface CachedReading {
  reading: AirQualityReading;
  fetchedAt: number;
}

const cacheDurationMs = 30 * 60_000;
const maxObservationAgeMs = 2 * 60 * 60_000;
const apiUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export const usAqiCategory = (value: number): AirQualityCategory | undefined => {
  if (!Number.isInteger(value) || value < 0 || value > 500) return undefined;
  if (value <= 50) return 'good';
  if (value <= 100) return 'moderate';
  if (value <= 150) return 'sensitive';
  if (value <= 200) return 'unhealthy';
  if (value <= 300) return 'very-unhealthy';
  return 'hazardous';
};

const utcTimestamp = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/.exec(value);
  if (!match) return undefined;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fraction = ''] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number((fraction + '000').slice(0, 3));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second
    || date.getUTCMilliseconds() !== millisecond
  ) return undefined;

  return date.getTime();
};

const readCurrent = (body: unknown, now: number): AirQualityReading | undefined => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const current = (body as Record<string, unknown>).current;
  if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;

  const row = current as Record<string, unknown>;
  const value = row.us_aqi;
  if (typeof value !== 'number') return undefined;
  const category = usAqiCategory(value);
  const observedAtMs = utcTimestamp(row.time);
  if (!category || observedAtMs === undefined || now - observedAtMs > maxObservationAgeMs) return undefined;

  return {
    value,
    category,
    observedAt: new Date(observedAtMs).toISOString(),
    source: 'open-meteo',
  };
};

export class AirQualityService {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private cached?: CachedReading;
  private inFlight?: Promise<AirQualityReading | null>;

  constructor(private readonly options: AirQualityServiceOptions) {
    if (!Number.isFinite(options.latitude) || options.latitude < -90 || options.latitude > 90) {
      throw new RangeError('Air quality latitude must be between -90 and 90');
    }
    if (!Number.isFinite(options.longitude) || options.longitude < -180 || options.longitude > 180) {
      throw new RangeError('Air quality longitude must be between -180 and 180');
    }
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  getCurrent(): Promise<AirQualityReading | null> {
    const now = this.now();
    if (this.cached && now - this.cached.fetchedAt < cacheDurationMs && this.isObservationFresh(this.cached.reading, now)) {
      return Promise.resolve(this.cached.reading);
    }
    if (this.inFlight) return this.inFlight;

    const refresh = this.refresh().finally(() => {
      if (this.inFlight === refresh) this.inFlight = undefined;
    });
    this.inFlight = refresh;
    return refresh;
  }

  private async refresh(): Promise<AirQualityReading | null> {
    try {
      const url = new URL(apiUrl);
      url.search = new URLSearchParams({
        latitude: String(this.options.latitude),
        longitude: String(this.options.longitude),
        current: 'us_aqi',
        timezone: 'GMT',
      }).toString();

      const response = await this.fetcher(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return this.freshCachedReading();
      const reading = readCurrent(await response.json(), this.now());
      if (!reading) return this.freshCachedReading();

      this.cached = { reading, fetchedAt: this.now() };
      return reading;
    } catch {
      return this.freshCachedReading();
    }
  }

  private freshCachedReading(): AirQualityReading | null {
    const reading = this.cached?.reading;
    return reading && this.isObservationFresh(reading, this.now()) ? reading : null;
  }

  private isObservationFresh(reading: AirQualityReading, now: number): boolean {
    return now - Date.parse(reading.observedAt) <= maxObservationAgeMs;
  }
}