import { describe, expect, it, vi } from 'vitest';
import { ActivityService } from './activity';
import { FrigateClient } from './frigate';
import type { ActivityPayload, FrigateReviewItem, HomeHistoryPoint } from '../shared/activity';

const config = { home: 'input_select.home_state', frontDoorLock: 'lock.front', doorbellVisitor: 'binary_sensor.visitor', frigateEvents: ['image.gaardsplassen_wide_car', 'image.bod_person'] };
const now = new Date('2026-08-28T15:00:00+02:00');
const dayMs = 24 * 60 * 60 * 1000;
const at = (time: string) => `2026-08-28T${time}:00+02:00`;
const point = (state: string, time: string): HomeHistoryPoint => ({ state, changedAt: at(time) });
const awayHistory = { [config.home]: [point('Hjemme', '07:00'), point('Borte', '07:50'), point('Hjemme', '14:53')] };
const start = Date.parse(at('14:50')) / 1000;
const review = { id: `${start}.123456-abc123`, camera: 'Gaardsplassen_Wide', start_time: start, end_time: start + 20, severity: 'alert', data: { objects: ['car'], zones: ['Parkering'] } };
const crossingReview = { ...review, start_time: Date.parse(at('14:52')) / 1000, end_time: Date.parse(at('14:54')) / 1000 };
const detectionHistory = {
  [config.frigateEvents[0]]: [point(at('14:52'), '14:52')],
  [config.frontDoorLock]: [point('locked', '13:00'), point('unlocked', '14:00')],
};
const mediaId = (path: string | undefined): string => {
  expect(path).toMatch(/^\/api\/activity\/review\/[0-9a-f-]{36}\/(preview|thumbnail)$/);
  return path!.split('/')[4];
};

function setup(history: Record<string, HomeHistoryPoint[]> = awayHistory, reviews: FrigateReviewItem[] = [review], preview = 200, clip = 200, serviceConfig = config) {
  const historySource = { getActivityHistory: vi.fn(async (_start: Date, _end: Date) => history) };
  const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/review') return Response.json(reviews);
    if (url.pathname.endsWith('.webp')) return new Response('image', { headers: { 'content-type': 'image/webp' } });
    const status = url.pathname.endsWith('/preview') ? preview : clip;
    return new Response(status === 200 ? 'video' : 'private error', { status, headers: { 'content-type': 'video/mp4' } });
  });
  const service = new ActivityService(historySource, new FrigateClient('http://private:5000', fetcher), serviceConfig);
  return { service, historySource, fetcher };
}

const cameraConfig = {
  ...config,
  securityMode: 'input_number.toggle_security_mode',
  frigateEvents: [
    'image.bakside_person', 'image.bakside_car', 'image.bakside_dog',
    'image.bod_person', 'image.bod_car', 'image.bod_dog',
    'image.gaardsplassen_wide_person', 'image.gaardsplassen_wide_car', 'image.gaardsplassen_wide_dog',
    'image.hagen_person', 'image.hagen_car', 'image.hagen_dog',
  ],
};
const cameraAt = (minutes: number) => new Date(Date.parse('2026-08-28T12:00:00.000Z') + minutes * 60_000);
const cameraReview = (minutes: number, overrides: Partial<FrigateReviewItem> = {}): FrigateReviewItem => ({
  id: `${Math.floor(cameraAt(minutes).getTime() / 1000)}.123456-${String(Math.abs(minutes)).padStart(6, '0')}`,
  camera: 'Gaardsplassen_Wide', start_time: cameraAt(minutes).getTime() / 1000, end_time: cameraAt(minutes).getTime() / 1000 + 20,
  severity: 'alert', data: { objects: ['person'], zones: ['Parkering'] }, ...overrides,
});

describe('ActivityService', () => {
  it('filters reviews by security mode, allowlisted objects, cameras, and the seven-day boundary', async () => {
    const reviews = [
      cameraReview(0, { data: { objects: ['person', 'cat'], zones: ['Parkering'] } }),
      cameraReview(6, { data: { objects: ['car'], zones: ['Parkering'] } }),
      cameraReview(7, { data: { objects: ['dog'], zones: ['Parkering'] } }),
      cameraReview(8, { camera: 'Bod', data: { objects: ['person'], zones: ['Bod'] } }),
      cameraReview(9, { camera: 'Hagen', data: { objects: ['cat'], zones: ['Hagen'] } }),
      cameraReview(12, { camera: 'Unknown', data: { objects: ['person'], zones: ['Parkering'] } }),
      cameraReview(-8 * 24 * 60, { data: { objects: ['person'], zones: ['Parkering'] } }),
    ];
    const history = {
      [cameraConfig.securityMode]: [
        { state: '2', changedAt: new Date(now.getTime() - 7 * dayMs).toISOString(), baseline: true },
        { state: '1', changedAt: cameraAt(0).toISOString() },
        { state: '3', changedAt: cameraAt(7).toISOString() },
        { state: '1', changedAt: cameraAt(8).toISOString() },
      ],
    };
    const { service } = setup(history, reviews, 200, 200, cameraConfig);

    const feed = (await service.getActivity(now)).cameraEvents;

    expect(feed.status).toBe('available');
    expect(feed.groups).toHaveLength(2);
    const driveway = feed.groups.find((group) => group.camera === 'Gaardsplassen_Wide')!;
    expect(driveway).toMatchObject({ camera: 'Gaardsplassen_Wide', zone: 'Parkering', objects: ['person', 'car'], reviewCount: 2 });
    expect(driveway.reviews.map(({ objects }) => objects)).toEqual([['car'], ['person']]);
    expect(feed.groups.find((group) => group.camera === 'Bod')).toMatchObject({ camera: 'Bod', zone: 'Bod', objects: ['person'], reviewCount: 1 });
  });

  it('keeps a review that starts armed before deactivation and omits reviews that start while deactivated', async () => {
    const reviews = [cameraReview(6, { end_time: cameraAt(8).getTime() / 1000 }), cameraReview(8, { data: { objects: ['dog'], zones: ['Parkering'] } })];
    const history = {
      [cameraConfig.securityMode]: [
        { state: '1', changedAt: new Date(cameraAt(0).getTime() - 60_000).toISOString(), baseline: true },
        { state: '3', changedAt: cameraAt(7).toISOString() },
        { state: '1', changedAt: cameraAt(10).toISOString() },
      ],
    };
    const { service } = setup(history, reviews, 200, 200, cameraConfig);

    const feed = (await service.getActivity(now)).cameraEvents;

    expect(feed.groups).toHaveLength(1);
    expect(feed.groups[0].reviews[0].monitoringMode).toBe('armed');
  });

  it('returns inactive for current mode three and emits the same grouped camera rows in the timeline', async () => {
    const history = {
      [cameraConfig.securityMode]: [{ state: '3', changedAt: new Date(now.getTime() - 60_000).toISOString(), baseline: true }],
      [cameraConfig.home]: [point('Hjemme', '14:00')],
    };
    const { service } = setup(history, [cameraReview(0)], 200, 200, cameraConfig);

    const payload = await service.getActivity(now);

    expect(payload.cameraEvents).toMatchObject({ status: 'inactive', groups: [] });
    expect(payload.timeline.some((event) => event.kind === 'frigate')).toBe(false);
  });

  it('returns unavailable when the security mode history has no known current state', async () => {
    const { service } = setup({}, [cameraReview(0)], 200, 200, cameraConfig);

    expect((await service.getActivity(now)).cameraEvents).toEqual({ status: 'unavailable', groups: [] });
  });

  it('groups the same camera and zone through the ten-minute boundary independent of review order', async () => {
    const reviews = [cameraReview(10), cameraReview(0), cameraReview(5), cameraReview(11, { data: { objects: ['dog'], zones: ['Side'] } })];
    const history = { [cameraConfig.securityMode]: [{ state: '2', changedAt: new Date(now.getTime() - 7 * dayMs).toISOString(), baseline: true }] };

    const { service } = setup(history, reviews, 200, 200, cameraConfig);
    const groups = (await service.getActivity(now)).cameraEvents.groups;

    expect(groups).toHaveLength(2);
    const mainGroup = groups.find((group) => group.zone === 'Parkering')!;
    const sideGroup = groups.find((group) => group.zone === 'Side')!;
    expect(mainGroup).toMatchObject({ reviewCount: 3, objects: ['person'] });
    expect(mainGroup.reviews.map((item) => item.id)).toEqual([cameraReview(10).id, cameraReview(5).id, cameraReview(0).id]);
    expect(sideGroup).toMatchObject({ reviewCount: 1, objects: ['dog'] });
  });

  it('issues only same-origin media capabilities per review and keeps expired metadata beside live siblings', async () => {
    const live = cameraReview(0);
    const expired = cameraReview(1, { data: { objects: ['car'], zones: ['Parkering'] } });
    const { service, fetcher } = setup({ [cameraConfig.securityMode]: [{ state: '2', changedAt: new Date(now.getTime() - 7 * dayMs).toISOString(), baseline: true }] }, [live, expired], 200, 200, cameraConfig);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes(`/review/${expired.id}/preview`) || url.includes(`thumb-${expired.camera}-${expired.id}`)) return new Response('missing', { status: 404 });
      return original(input, init);
    });

    const group = (await service.getActivity(now)).cameraEvents.groups[0];
    const liveReview = group.reviews.find(({ id }) => id === live.id)!;
    const expiredReview = group.reviews.find(({ id }) => id === expired.id)!;

    expect(liveReview.mediaPath).toMatch(/^\/api\/activity\/review\/[0-9a-f-]{36}\/preview$/);
    expect(liveReview.thumbnailPath).toMatch(/^\/api\/activity\/review\/[0-9a-f-]{36}\/thumbnail$/);
    expect(expiredReview).toMatchObject({ id: expired.id, camera: expired.camera, objects: ['car'] });
    expect(expiredReview.mediaPath).toBeUndefined();
    expect(expiredReview.thumbnailPath).toBeUndefined();
    expect(JSON.stringify(group)).not.toContain('http://private');
    expect(JSON.stringify(group)).not.toContain('/api/Gaardsplassen_Wide/');

    await (await service.getReviewMedia(liveReview.mediaPath!.split('/')[4])).body?.cancel();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/api/review/${live.id}/preview?format=mp4`);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/clip.mp4'))).toBe(false);
  });
  it('resolves twelve delayed recording matches before the client deadline with bounded upstream concurrency', async () => {
    vi.useFakeTimers();
    try {
      const reviews = Array.from({ length: 12 }, (_, index) => ({ ...review,
        id: `${start - index * 60}.123456-abc123`, start_time: start - index * 60, end_time: start - index * 60 + 20,
      }));
      const history = { [config.frigateEvents[0]]: reviews.map((item) => ({ state: new Date(item.start_time * 1000).toISOString(), changedAt: new Date(item.start_time * 1000).toISOString() })) };
      const { service, fetcher } = setup(history, reviews);
      const original = fetcher.getMockImplementation()!;
      let active = 0;
      let peak = 0;
      fetcher.mockImplementation(async (input, init) => {
        if (new URL(String(input)).pathname.endsWith('/preview')) {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 900));
          active -= 1;
        }
        return original(input, init);
      });
      let payload: ActivityPayload | undefined;
      const pending = service.getActivity(now).then((result) => { payload = result; });
      await vi.advanceTimersByTimeAsync(3000);
      expect(payload, 'all matches should resolve within three seconds, below the ten-second client deadline').toBeDefined();
      expect(payload!.timeline).toHaveLength(12);
      expect(new Set(payload!.timeline.map((event) => mediaId(event.mediaPath))).size).toBe(12);
      expect(peak).toBeLessThanOrEqual(4);
      await pending;
    } finally {
      await vi.runAllTimersAsync();
      vi.useRealTimers();
    }
  });

  it('returns trusted timeline metadata when a long media queue exhausts its activity budget', async () => {
    vi.useFakeTimers();
    try {
      const reviews = Array.from({ length: 48 }, (_, index) => ({ ...review,
        id: `${start - index * 60}.123456-abc123`, start_time: start - index * 60, end_time: start - index * 60 + 20,
      }));
      const history = { [config.frigateEvents[0]]: reviews.map((item) => ({ state: new Date(item.start_time * 1000).toISOString(), changedAt: new Date(item.start_time * 1000).toISOString() })) };
      const { service, fetcher } = setup(history, reviews);
      const original = fetcher.getMockImplementation()!;
      fetcher.mockImplementation(async (input, init) => {
        if (new URL(String(input)).pathname.endsWith('/preview')) await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 900);
          const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort, { once: true });
        });
        return original(input, init);
      });
      let payload: ActivityPayload | undefined;
      const pending = service.getActivity(now).then((result) => { payload = result; });
      await vi.advanceTimersByTimeAsync(8_500);
      expect(payload, 'optional media probes must not hold the activity response past its budget').toBeDefined();
      expect(payload!.timeline).toHaveLength(48);
      expect(payload!.timeline.some((event) => event.mediaPath)).toBe(true);
      await pending;
    } finally {
      await vi.runAllTimersAsync();
      vi.useRealTimers();
    }
  });

  it('renews expired generations with different URLs without reviving old media or thumbnail IDs', async () => {
    const clock = vi.spyOn(Date, 'now');
    const epoch = Date.now();
    clock.mockReturnValue(epoch);
    try {
      const { service } = setup();
      const first = (await service.getActivity(now)).awayCapture;
      const firstMedia = mediaId(first.mediaPath);
      const firstThumbnail = mediaId(first.thumbnailPath);
      clock.mockReturnValue(epoch + 4 * 60 * 1000);
      expect((await service.getActivity(now)).awayCapture.mediaPath).toBe(first.mediaPath);
      clock.mockReturnValue(epoch + 6 * 60 * 1000);
      await expect(service.getReviewMedia(firstMedia)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
      const renewed = (await service.getActivity(now)).awayCapture;
      expect(renewed.mediaPath).not.toBe(first.mediaPath);
      expect(renewed.thumbnailPath).not.toBe(first.thumbnailPath);
      await expect(service.getReviewMedia(firstMedia)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
      await expect(service.getReviewThumbnail(firstThumbnail)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
      await (await service.getReviewMedia(mediaId(renewed.mediaPath))).body?.cancel();
      await (await service.getReviewThumbnail(mediaId(renewed.thumbnailPath))).body?.cancel();
    } finally { clock.mockRestore(); }
  });

  it('retains narrowed restrictions even when the narrower recording probe fails', async () => {
    const { service, historySource, fetcher } = setup(detectionHistory, [crossingReview]);
    const broad = await service.getActivity(now);
    const capability = mediaId(broad.timeline.find((event) => event.kind === 'frigate')?.mediaPath);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith('clip.mp4') ? new Response('missing', { status: 404 }) : original(input, init));
    historySource.getActivityHistory.mockResolvedValue(awayHistory);
    expect((await service.getActivity(now)).awayCapture.status).toBe('expired');
    await expect(service.getReviewMedia(capability)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
    historySource.getActivityHistory.mockResolvedValue(detectionHistory);
    const afterFailure = await service.getActivity(now);
    expect(afterFailure.timeline.find((event) => event.kind === 'frigate')?.mediaPath).toBeUndefined();
  });

  it('keeps Away-clamped media after a later Away lookup failure and successful timeline match', async () => {
    const { service, historySource, fetcher } = setup(awayHistory, [crossingReview]);
    const initial = await service.getActivity(now);
    historySource.getActivityHistory.mockImplementation(async (from) => {
      if (from.toISOString() === '2026-07-29T13:00:00.000Z') throw new Error('history unavailable');
      return detectionHistory;
    });
    const payload = await service.getActivity(now);
    expect(payload.awayCapture.status).toBe('unavailable');
    const response = await service.getReviewMedia(mediaId(initial.awayCapture.mediaPath));
    await response.body?.cancel();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/start/${crossingReview.start_time}/end/${Date.parse(at('14:53')) / 1000}/clip.mp4`);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/preview?'))).toBe(false);
  });

  it('narrows a previously issued timeline preview when Away later resolves the same review', async () => {
    const { service, historySource, fetcher } = setup(detectionHistory, [crossingReview]);
    const initial = await service.getActivity(now);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/preview?'))).toBe(true);
    historySource.getActivityHistory.mockResolvedValue(awayHistory);
    await service.getActivity(now);
    const response = await service.getReviewMedia(mediaId(initial.timeline.find((event) => event.kind === 'frigate')?.mediaPath));
    await response.body?.cancel();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/start/${crossingReview.start_time}/end/${Date.parse(at('14:53')) / 1000}/clip.mp4`);
  });

  it('does not let an older in-flight timeline preview overwrite a newer Away restriction', async () => {
    const { service, historySource, fetcher } = setup(detectionHistory, [crossingReview]);
    let entered!: () => void;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = fetcher.getMockImplementation()!;
    let firstPreview = true;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).includes('/preview?') && firstPreview) {
        firstPreview = false;
        entered();
        await gate;
      }
      return original(input, init);
    });
    const broad = service.getActivity(now);
    await pending;
    historySource.getActivityHistory.mockResolvedValue(awayHistory);
    const restricted = await service.getActivity(now);
    release();
    await broad;
    const response = await service.getReviewMedia(mediaId(restricted.awayCapture.mediaPath));
    await response.body?.cancel();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/start/${crossingReview.start_time}/end/${Date.parse(at('14:53')) / 1000}/clip.mp4`);
  });

  it('uses unchanged home and lock baselines only to seed state, never as events', async () => {
    const { service, historySource } = setup();
    historySource.getActivityHistory.mockImplementation(async (from) => ({
      [config.home]: [{ state: 'Hjemme', changedAt: from.toISOString(), baseline: true }],
      [config.frontDoorLock]: [{ state: 'locked', changedAt: from.toISOString(), baseline: true }, point('locked', '14:00')],
      [config.doorbellVisitor]: [{ state: 'off', changedAt: from.toISOString(), baseline: true }, point('on', '14:10')],
    }));
    const payload = await service.getActivity(now);
    expect(payload.timeline.map((row) => row.kind)).toEqual(['doorbell']);
    expect(payload.awayCapture.status).toBe('none');
  });

  it('records a doorbell event when history starts with an actual on state', async () => {
    const { service } = setup({
      [config.doorbellVisitor]: [point('on', '14:10'), point('off', '14:11')],
    });

    const timeline = (await service.getActivity(now)).timeline;

    expect(timeline.filter((event) => event.kind === 'doorbell')).toEqual([
      expect.objectContaining({ title: 'Noen ringte på', occurredAt: '2026-08-28T12:10:00.000Z' }),
    ]);
  });

  it('finds a real multi-day departure in the longer lookup rather than using baseline Borte', async () => {
    const { service, historySource } = setup();
    const departure = '2026-08-18T07:50:00+02:00';
    historySource.getActivityHistory.mockImplementation(async (from) => ({
      [config.home]: [
        { state: 'Borte', changedAt: from.toISOString(), baseline: true },
        ...(from.getTime() < Date.parse(departure) ? [{ state: 'Hjemme', changedAt: '2026-08-17T12:00:00Z' }, { state: 'Borte', changedAt: departure }] : []),
        point('Hjemme', '14:53'),
      ],
    }));
    const payload = await service.getActivity(now);
    expect(payload.awayCapture.awayStartedAt).toBe(departure);
    expect(payload.timeline.map((row) => row.title)).toEqual(['Huset er hjemme']);
    expect(historySource.getActivityHistory.mock.calls.map(([from]) => from.toISOString())).toEqual([
      '2026-08-27T13:00:00.000Z', '2026-08-21T13:00:00.000Z', '2026-07-29T13:00:00.000Z',
    ]);
  });

  it('selects the 14:50 car alert inside the completed 07:50–14:53 Away interval', async () => {
    const { service } = setup();
    const payload = await service.getActivity(now);
    expect(payload.awayCapture).toMatchObject({ status: 'available', awayStartedAt: at('07:50'), homeReturnedAt: at('14:53'), event: { occurredAt: '2026-08-28T12:50:00.000Z', title: 'Bil registrert', detail: 'Parkering · Gaardsplassen Wide', tone: 'default' } });
    mediaId(payload.awayCapture.mediaPath);
    expect(payload.generatedAt).toBe('2026-08-28T13:00:00.000Z');
    expect(JSON.stringify(payload)).not.toMatch(/private|token|entity_picture|http:/);
    expect(JSON.stringify(payload)).not.toContain(review.id);
  });

  it('prefers an alert over a later detection and excludes reviews outside Away', async () => {
    const { service, fetcher } = setup(awayHistory, [
      { ...review, id: `${start}.123456-def456`, start_time: start + 30, end_time: start + 50, severity: 'detection' },
      { ...review, id: `${start}.123456-ghi789`, start_time: start + 240, end_time: start + 260 }, review,
    ]);
    const payload = await service.getActivity(now);
    await (await service.getReviewMedia(mediaId(payload.awayCapture.mediaPath))).body?.cancel();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/review/${review.id}/preview?`);
  });

  it.each([[404, 200, 'available'], [404, 404, 'expired'], [410, 410, 'expired'], [500, 500, 'unavailable']] as const)('maps preview %i / recording %i to %s', async (preview, clip, status) => {
    const { service, fetcher } = setup(awayHistory, [review], preview, clip);
    const capture = (await service.getActivity(now)).awayCapture;
    expect(capture.status).toBe(status);
    expect(capture.event?.title).toBe('Bil registrert');
    if (status === 'available') {
      mediaId(capture.mediaPath);
      expect(fetcher.mock.calls.some(([url]) => String(url).endsWith(`/start/${start}/end/${start + 20}/clip.mp4`))).toBe(true);
      expect(await (await service.getReviewMedia(mediaId(capture.mediaPath))).text()).toBe('video');
    } else expect(capture.mediaPath).toBeUndefined();
  });

  it('returns none for no review and never probes unrelated footage', async () => {
    const { service, fetcher } = setup(awayHistory, []);
    expect((await service.getActivity(now)).awayCapture.status).toBe('none');
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).pathname === '/api/review')).toBe(true);
  });

  it('returns HA-only rows when Frigate fails or is not configured', async () => {
    const { service, fetcher } = setup();
    fetcher.mockRejectedValue(new Error('private failure token=secret'));
    for (const candidate of [service, new ActivityService({ getActivityHistory: async () => awayHistory }, undefined, config)]) {
      const payload = await candidate.getActivity(now);
      expect(payload.awayCapture.status).toBe('unavailable');
      expect(payload.timeline.map((row) => row.title)).toEqual(['Huset er hjemme', 'Huset er borte', 'Huset er hjemme']);
      expect(JSON.stringify(payload)).not.toMatch(/private|secret/);
    }
  });

  it('does not infer Away or timeline events when HA history fails', async () => {
    const { service, historySource, fetcher } = setup();
    historySource.getActivityHistory.mockRejectedValue(new Error('private HA token'));
    await expect(service.getActivity(now)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('extends sparse timelines to seven days and searches Away separately to thirty days', async () => {
    const { service, historySource } = setup({});
    const later = new Date('2026-09-10T15:00:00+02:00');
    historySource.getActivityHistory.mockImplementation(async (from) => from.toISOString() === '2026-08-11T13:00:00.000Z' ? awayHistory : {});
    const payload = await service.getActivity(later);
    expect(historySource.getActivityHistory.mock.calls.map(([from]) => from.toISOString())).toEqual(['2026-09-09T13:00:00.000Z', '2026-09-03T13:00:00.000Z', '2026-08-11T13:00:00.000Z']);
    expect(payload.timeline).toEqual([]);
    expect(payload.awayCapture.status).toBe('available');
  });

  it('keeps a 24-hour timeline once there are three meaningful events', async () => {
    const { service, historySource } = setup();
    await service.getActivity(now);
    expect(historySource.getActivityHistory.mock.calls.map(([from]) => from.toISOString())).toEqual(['2026-08-27T13:00:00.000Z']);
  });

  it('keeps confirmed recent events if the extended history query fails', async () => {
    const { service, historySource } = setup({ [config.frontDoorLock]: [point('locked', '14:00')] });
    historySource.getActivityHistory.mockResolvedValueOnce({ [config.frontDoorLock]: [point('locked', '14:00')] }).mockRejectedValue(new Error('extended failure'));
    const payload = await service.getActivity(now);
    expect(payload.timeline.map((event) => event.title)).toEqual(['Døren er låst']);
    expect(payload.awayCapture.status).toBe('unavailable');
  });

  it('only includes configured meaningful edges and uses safe tone only for locked state', async () => {
    const { service } = setup({
      ...awayHistory,
      [config.frontDoorLock]: [point('locked', '13:00'), point('locked', '13:01'), point('unavailable', '13:02'), point('locked', '13:03'), point('unlocked', '13:04')],
      [config.doorbellVisitor]: [point('on', '13:10'), point('off', '13:11'), point('on', '13:12'), point('on', '13:13'), point('off', '13:14')],
      'binary_sensor.motion': [point('off', '13:20'), point('on', '13:21')],
      'image.unconfigured_person': [point(at('14:10'), '14:10')],
    });
    const timeline = (await service.getActivity(now)).timeline;
    expect(timeline.map((row) => row.kind)).toEqual(['home', 'doorbell', 'doorbell', 'lock', 'lock', 'home', 'home']);
    expect(timeline.filter((row) => row.tone === 'safe').map((row) => row.title)).toEqual(['Døren er låst']);
    expect(timeline.filter((row) => row.kind === 'doorbell').map((row) => row.occurredAt)).toEqual(['2026-08-28T11:12:00.000Z', '2026-08-28T11:10:00.000Z']);
  });

  it('matches detection timestamps to nearest same-camera/object review within 30 seconds', async () => {
    const nearest = { ...review, id: `${start}.123456-def456`, start_time: start + 5, end_time: start + 20 };
    const { service, fetcher } = setup({ ...awayHistory, [config.frigateEvents[0]]: [point(at('14:50'), '14:50'), point(at('14:50'), '14:51')], [config.frigateEvents[1]]: [point(at('14:20'), '14:20')] }, [
      { ...review, camera: 'Bod', start_time: start + 4 },
      { ...review, data: { objects: ['person'], zones: [] }, start_time: start + 4 },
      { ...review, start_time: start - 40 }, nearest,
    ]);
    const detections = (await service.getActivity(now)).timeline.filter((row) => row.kind === 'frigate');
    expect(detections).toHaveLength(2);
    expect(detections[0]).toMatchObject({ title: 'Bil registrert' });
    await (await service.getReviewMedia(mediaId(detections[0].mediaPath))).body?.cancel();
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/review/${nearest.id}/preview?`);
    expect(detections[1]).toMatchObject({ title: 'Person registrert', detail: 'Bod' });
    expect(detections[1].mediaPath).toBeUndefined();
  });

  it.each([['07:50', '07:51'], ['14:52', '14:54']] as const)('never serves padded preview outside Away (%s–%s)', async (from, to) => {
    const item = { ...review, start_time: Date.parse(at(from)) / 1000, end_time: Date.parse(at(to)) / 1000 };
    const { service, fetcher } = setup(awayHistory, [item]);
    const capture = (await service.getActivity(now)).awayCapture;
    expect(capture.status).toBe('available');
    await (await service.getReviewMedia(mediaId(capture.mediaPath))).body?.cancel();
    expect(fetcher.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/preview'))).toBe(false);
    const clips = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/clip.mp4'));
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every(([url]) => String(url).includes(`/end/${Math.min(item.end_time, Date.parse(at('14:53')) / 1000)}/`))).toBe(true);
  });

  it('rejects unknown or malformed media IDs and forwards cancellation only for issued media', async () => {
    const { service, fetcher } = setup();
    await expect(service.getReviewMedia(review.id)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
    const payload = await service.getActivity(now);
    await expect(service.getReviewMedia('../secret')).rejects.toThrow('Aktivitet er ikke tilgjengelig');
    const controller = new AbortController();
    const media = await service.getReviewMedia(mediaId(payload.awayCapture.mediaPath), controller.signal);
    controller.abort();
    expect(fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
    await media.body?.cancel();
  });

  it('issues a thumbnail only for selected Away metadata even when its recording expired', async () => {
    const { service } = setup(awayHistory, [review], 404, 404);
    await expect(service.getReviewThumbnail(review.id)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
    const capture = (await service.getActivity(now)).awayCapture;
    expect(capture.status).toBe('expired');
    expect(await (await service.getReviewThumbnail(mediaId(capture.thumbnailPath))).text()).toBe('image');
    await expect(service.getReviewThumbnail(`${start}.123456-def456`)).rejects.toThrow('Aktivitet er ikke tilgjengelig');
  });

  it('omits expired thumbnails while retaining the event description', async () => {
    const { service, fetcher } = setup();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith('.webp') ? new Response('missing', { status: 404 }) : original(input, init));
    const capture = (await service.getActivity(now)).awayCapture;
    expect(capture.thumbnailPath).toBeUndefined();
    expect(capture.event?.title).toBe('Bil registrert');
  });

  it('clamps open-ended reviews and does not expand Away media when matching its timeline detection', async () => {
    const item = { ...review, end_time: undefined, start_time: Date.parse(at('14:52')) / 1000 };
    const { service, fetcher } = setup({ ...awayHistory, [config.frigateEvents[0]]: [point(at('14:52'), '14:52')] }, [item]);
    const payload = await service.getActivity(now);
    expect(payload.awayCapture.status).toBe('available');
    expect(payload.timeline.find((event) => event.kind === 'frigate')?.mediaPath).toBe(payload.awayCapture.mediaPath);
    await (await service.getReviewMedia(mediaId(payload.awayCapture.mediaPath))).body?.cancel();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/preview?'))).toBe(false);
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain(`/start/${item.start_time}/end/${item.start_time + 30}/clip.mp4`);
  });
});
