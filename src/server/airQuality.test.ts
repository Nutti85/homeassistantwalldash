import { describe, expect, it, vi } from 'vitest';
import { AirQualityService, usAqiCategory } from './airQuality';

const nowAt = '2026-09-23T12:00:00.000Z';
const currentPayload = (usAqi: unknown, time = '2026-09-23T11:45') => ({
  current: { us_aqi: usAqi, time },
});
const jsonResponse = (body: unknown, ok = true): Response => ({
  ok,
  json: async () => body,
}) as Response;

describe('AirQualityService', () => {
  it('returns a categorized current US AQI reading with an explicit UTC timestamp', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse(currentPayload(42)));
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => Date.parse(nowAt) });

    await expect(service.getCurrent()).resolves.toEqual({
      value: 42,
      category: 'good',
      observedAt: '2026-09-23T11:45:00.000Z',
      source: 'open-meteo',
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://air-quality-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/air-quality');
    expect(url.searchParams.get('latitude')).toBe('59.1');
    expect(url.searchParams.get('longitude')).toBe('10.2');
    expect(url.searchParams.get('current')).toBe('us_aqi');
    expect(url.searchParams.get('timezone')).toBe('GMT');
  });

  it.each([
    [0, 'good'], [50, 'good'], [51, 'moderate'], [100, 'moderate'],
    [101, 'sensitive'], [150, 'sensitive'], [151, 'unhealthy'], [200, 'unhealthy'],
    [201, 'very-unhealthy'], [300, 'very-unhealthy'], [301, 'hazardous'], [500, 'hazardous'],
  ] as const)('maps US AQI %i to %s', (value, category) => {
    expect(usAqiCategory(value)).toBe(category);
  });

  it.each([
    ['numeric string', '42'],
    ['fractional value', 42.5],
    ['negative value', -1],
    ['value above the supported scale', 501],
    ['missing value', undefined],
  ])('returns unavailable for a %s', async (_description, value) => {
    const fetcher = vi.fn(async () => jsonResponse(currentPayload(value)));
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => Date.parse(nowAt) });

    await expect(service.getCurrent()).resolves.toBeNull();
  });

  it('rejects an observation older than two hours', async () => {
    const fetcher = vi.fn(async () => jsonResponse(currentPayload(42, '2026-09-23T09:59')));
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => Date.parse(nowAt) });

    await expect(service.getCurrent()).resolves.toBeNull();
  });

  it('refreshes after thirty minutes while reusing a recent successful response', async () => {
    let now = Date.parse(nowAt);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentPayload(42)))
      .mockResolvedValueOnce(jsonResponse(currentPayload(51, '2026-09-23T12:30')));
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => now });

    const first = await service.getCurrent();
    now += 29 * 60_000;
    const cached = await service.getCurrent();
    expect(cached).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 60_000;
    await expect(service.getCurrent()).resolves.toMatchObject({ value: 51, category: 'moderate' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refreshes into one upstream request', async () => {
    let resolveResponse!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetcher = vi.fn(() => pendingResponse);
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => Date.parse(nowAt) });

    const first = service.getCurrent();
    const second = service.getCurrent();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveResponse(jsonResponse(currentPayload(42)));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: 42, category: 'good', observedAt: '2026-09-23T11:45:00.000Z', source: 'open-meteo' },
      { value: 42, category: 'good', observedAt: '2026-09-23T11:45:00.000Z', source: 'open-meteo' },
    ]);
  });

  it('uses a still-current cached observation after a refresh failure and rejects it after two hours', async () => {
    let now = Date.parse(nowAt);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentPayload(42)))
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockRejectedValueOnce(new Error('network unavailable'));
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => now });

    const first = await service.getCurrent();
    now += 31 * 60_000;
    await expect(service.getCurrent()).resolves.toEqual(first);

    now = Date.parse('2026-09-23T13:46:00.000Z');
    await expect(service.getCurrent()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('returns unavailable when there is no cached response and the upstream request fails', async () => {
    const fetcher = vi.fn(async () => { throw new Error('network unavailable'); });
    const service = new AirQualityService({ latitude: 59.1, longitude: 10.2, fetcher, now: () => Date.parse(nowAt) });

    await expect(service.getCurrent()).resolves.toBeNull();
  });
});