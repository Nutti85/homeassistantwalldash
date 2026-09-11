import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActivity, getAiReport, getStates, requestAiReportRefresh } from './api';
import type { ActivityPayload } from '../shared/activity';

const activityPayload: ActivityPayload = {
  generatedAt: '2026-09-10T12:00:00.000Z',
  awayCapture: {
    status: 'available',
    mediaPath: '/api/activity/review/4e654ee5-63e2-40e0-94b1-9d80ce7b3572/preview',
    thumbnailPath: '/api/activity/review/4e654ee5-63e2-40e0-94b1-9d80ce7b3573/thumbnail',
  },
  timeline: [{ id: 'lock:1', kind: 'lock', occurredAt: '2026-09-10T11:00:00.000Z', title: 'Døren er låst', tone: 'safe' }],
};
const communicationError = 'Kunne ikke oppdatere smarthuset. Prøv igjen.';

describe('browser dashboard API', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('loads the complete typed activity payload from the fixed same-origin endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(activityPayload));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getActivity()).resolves.toEqual(activityPayload);
    expect(fetchMock).toHaveBeenCalledWith('/api/activity', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  });

  it.each(['available', 'expired', 'none', 'unavailable'] as const)('accepts the %s Away capture state', async (status) => {
    const payload = { generatedAt: activityPayload.generatedAt, awayCapture: { status }, timeline: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(getActivity()).resolves.toEqual(payload);
  });

  it.each([
    null, [], {},
    { ...activityPayload, generatedAt: undefined },
    { ...activityPayload, generatedAt: 12 },
    { ...activityPayload, generatedAt: 'invalid date' },
    { ...activityPayload, awayCapture: undefined },
    { ...activityPayload, awayCapture: null },
    { ...activityPayload, awayCapture: [] },
    { ...activityPayload, awayCapture: {} },
    { ...activityPayload, awayCapture: { status: 'unexpected' } },
    { ...activityPayload, awayCapture: { status: ['none'] } },
    { ...activityPayload, timeline: undefined },
    { ...activityPayload, timeline: {} },
    { ...activityPayload, timeline: [null] },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], kind: 'motion' }] },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], kind: ['lock'] }] },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], occurredAt: 'invalid' }] },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], title: undefined }] },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], tone: 'bad' }] },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], tone: ['safe'] }] },
    { ...activityPayload, awayCapture: { status: 'expired', event: {} } },
    { ...activityPayload, awayCapture: { status: 'available', mediaPath: 'http://private:5000/video' } },
    { ...activityPayload, awayCapture: { status: 'available', thumbnailPath: '//private/thumbnail' } },
    { ...activityPayload, timeline: [{ ...activityPayload.timeline[0], mediaPath: '/api/activity/review/raw-id/preview?camera=Bod' }] },
  ])('rejects malformed activity payload %# with the dashboard communication error', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(getActivity()).rejects.toThrow(communicationError);
  });

  it.each([200, 502, 503])('uses a generic error for non-JSON activity responses (%i)', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream failure', { status })));
    await expect(getActivity()).rejects.toThrow(communicationError);
  });

  it('does not display upstream error bodies from a failed activity request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'token=secret' }, { status: 502 })));
    await expect(getActivity()).rejects.toThrow(communicationError);
  });

  it('normalizes activity network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network failure')));
    await expect(getActivity()).rejects.toThrow(communicationError);
  });

  it('aborts a stalled activity request at the dashboard timeout', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      signal = init.signal!;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })));
    const pending = expect(getActivity()).rejects.toThrow(communicationError);
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a successful response without valid confirmed states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ states: { guestMode: { state: 'on' } } }), { status: 200 })));

    await expect(getStates()).rejects.toThrow('Kunne ikke oppdatere smarthuset. Prøv igjen.');
  });

  it('rejects non-JSON successful responses with the safe fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));

    await expect(getStates()).rejects.toThrow('Kunne ikke oppdatere smarthuset. Prøv igjen.');
  });

  it('ignores the removed arrival report mode when reading a published report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: 'Rapport', mode: 'coming_home', publishedAt: '2026-08-23T08:00:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAiReport()).resolves.toEqual({ report: 'Rapport', publishedAt: '2026-08-23T08:00:00.000Z' });
  });

  it('forwards the requested scheduled report mode and trigger time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestAiReportRefresh('evening');

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-report/refresh', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"mode":"evening"'),
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).requestedAt).toEqual(expect.any(String));
  });

  it('requests the focused morning report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestAiReportRefresh('morning');

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ mode: 'morning' });
  });

  it('requests the focused evening report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestAiReportRefresh('evening');

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ mode: 'evening' });
  });

  it('bypasses the browser cache when polling for a published report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: 'Ny rapport', publishedAt: '2026-08-23T08:00:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getAiReport();

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-report', expect.objectContaining({ cache: 'no-store' }));
  });
});
