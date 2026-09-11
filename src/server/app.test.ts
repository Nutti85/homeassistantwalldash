import { mkdtempSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { get as httpGet } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, waitForWritable, type DashboardClient } from './app';
import { ActivityService } from './activity';
import { FrigateClient } from './frigate';
import type { ActivityPayload } from '../shared/activity';

const confirmedGuestMode = {
  states: {
    guestMode: { entity_id: 'input_boolean.toggle', state: 'on', attributes: {} },
  },
};

const dashboardStates = {
  states: {
    home: { entity_id: 'input_select.home_state', state: 'Hjemme', attributes: {} },
    homeMode: { entity_id: 'input_select.home_mode', state: 'Ettermiddag', attributes: {} },
    guestMode: { entity_id: 'input_boolean.toggle', state: 'on', attributes: {} },
    guestVoucher: { entity_id: 'sensor.voucher', state: 'K7M9-P2Q4', attributes: {} },
    morning: { entity_id: 'automation.morning', state: 'off', attributes: {} },
    evening: { entity_id: 'script.evening', state: 'off', attributes: {} },
    night: { entity_id: 'script.night', state: 'off', attributes: {} },
    cooling: { entity_id: 'automation.cooling', state: 'on', attributes: {} },
    climate: { entity_id: 'climate.test', state: 'heat', attributes: {} },
    outdoor: { entity_id: 'sensor.outdoor', state: '20', attributes: {} },
  },
};

const createClient = (): DashboardClient => ({
  getDashboardStates: vi.fn(),
  execute: vi.fn(),
  executeLight: vi.fn(),
  setTemperature: vi.fn(),
});

const activityError = { error: 'Aktivitet er ikke tilgjengelig' };
const capability = '4e654ee5-63e2-40e0-94b1-9d80ce7b3572';
const emptyActivity = (): ActivityService => new ActivityService({ getActivityHistory: async () => ({}) });
const mediaRoutes = [
  { route: 'preview', method: 'getReviewMedia', contentType: 'video/mp4' },
  { route: 'thumbnail', method: 'getReviewThumbnail', contentType: 'image/webp' },
] as const;

describe('activity API', () => {
  it('returns the typed activity payload without caching personal activity', async () => {
    const activity = emptyActivity();
    const payload: ActivityPayload = {
      generatedAt: '2026-09-10T12:00:00.000Z', awayCapture: { status: 'none' },
      timeline: [{ id: 'lock:1', kind: 'lock', occurredAt: '2026-09-10T11:00:00.000Z', title: 'Døren er låst', tone: 'safe' }],
    };
    vi.spyOn(activity, 'getActivity').mockResolvedValue(payload);
    const response = await request(createApp(createClient(), { activity })).get('/api/activity').expect(200);
    expect(response.body).toEqual(payload);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each(['/api/activity', ...mediaRoutes.map(({ route }) => `/api/activity/review/${capability}/${route}`)])('returns safe 503 without an activity service: %s', async (route) => {
    await request(createApp(createClient())).get(route).expect(503, activityError);
  });

  it('redacts upstream activity errors', async () => {
    const activity = emptyActivity();
    vi.spyOn(activity, 'getActivity').mockRejectedValue(new Error('http://private:5000 token=secret'));
    await request(createApp(createClient(), { activity })).get('/api/activity').expect(502, activityError);
  });

  for (const { route, method, contentType } of mediaRoutes) {
    it(`streams ${route} with fixed safe content and cache headers`, async () => {
      const activity = emptyActivity();
      const media = vi.spyOn(activity, method).mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': contentType, 'Set-Cookie': 'token=secret', 'Location': 'http://private:5000', 'Cache-Control': 'public, max-age=9999' },
      }));
      const response = await request(createApp(createClient(), { activity })).get(`/api/activity/review/${capability}/${route}`).expect(200);
      expect(response.body).toEqual(Buffer.from([1, 2, 3]));
      expect(response.headers['content-type']).toBe(contentType);
      expect(response.headers['cache-control']).toBe('private, max-age=30');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
      expect(media).toHaveBeenCalledWith(capability, expect.any(AbortSignal));
    });

    it.each(['url=http://private', 'camera=Bod', 'start=123&end=456', 'entity_id=image.bod_person', 'unused=1', '=value'])
      (`rejects every query parameter on ${route}: %s`, async (query) => {
        const activity = emptyActivity();
        const media = vi.spyOn(activity, method);
        await request(createApp(createClient(), { activity })).get(`/api/activity/review/${capability}/${route}?${query}`).expect(400, activityError);
        expect(media).not.toHaveBeenCalled();
      });

    it.each(['1787914200.123456-abc123', 'not-a-uuid', 'https%3A%2F%2Fprivate'])
      (`rejects raw review IDs and malformed capabilities on ${route}: %s`, async (id) => {
        const activity = emptyActivity();
        const media = vi.spyOn(activity, method);
        await request(createApp(createClient(), { activity })).get(`/api/activity/review/${id}/${route}`).expect(400, activityError);
        expect(media).not.toHaveBeenCalled();
      });

    it(`rejects an unissued ${route} capability`, async () => {
      await request(createApp(createClient(), { activity: emptyActivity() })).get(`/api/activity/review/${capability}/${route}`).expect(502, activityError);
    });

    it(`redacts ${route} failures before streaming`, async () => {
      const activity = emptyActivity();
      vi.spyOn(activity, method).mockRejectedValue(new Error('http://private:5000 token=secret'));
      const response = await request(createApp(createClient(), { activity })).get(`/api/activity/review/${capability}/${route}`).expect(502, activityError);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each(['bad-status', 'bad-type', 'empty-body', 'read-error'])(`rejects invalid upstream ${route} responses: %s`, async (failure) => {
      const activity = emptyActivity();
      const body = failure === 'empty-body' ? null : failure === 'read-error'
        ? new ReadableStream({ start(controller) { controller.error(new Error('private token')); } }) : 'private token';
      vi.spyOn(activity, method).mockResolvedValue(new Response(body, {
        status: failure === 'bad-status' ? 500 : 200,
        headers: { 'Content-Type': failure === 'bad-type' ? 'text/html' : contentType },
      }));
      await request(createApp(createClient(), { activity })).get(`/api/activity/review/${capability}/${route}`).expect(502, activityError);
    });

    it.each(['before headers', 'during streaming'])(`aborts upstream ${route} work on browser disconnect %s`, async (phase) => {
      const activity = emptyActivity();
      const server = createApp(createClient(), { activity }).listen(0);
      let upstreamSignal: AbortSignal | undefined;
      let cancelled = false;
      try {
        await new Promise<void>((resolve, reject) => {
          const address = server.address();
          if (!address || typeof address === 'string') throw new Error('Missing test server port');
          vi.spyOn(activity, method).mockImplementation(async (_id: string, signal?: AbortSignal) => {
            upstreamSignal = signal;
            signal!.addEventListener('abort', () => resolve(), { once: true });
            if (phase === 'before headers') {
              browser.destroy();
              return new Promise<Response>((_resolve, fail) => signal!.addEventListener('abort', () => fail(new Error('cancelled')), { once: true }));
            }
            return new Response(new ReadableStream({
              start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
              cancel() { cancelled = true; },
            }), { headers: { 'Content-Type': contentType } });
          });
          const browser = httpGet(`http://127.0.0.1:${address.port}/api/activity/review/${capability}/${route}`, (response) => {
            if (response.statusCode !== 200) { response.resume(); reject(new Error(`Expected streaming route, got ${response.statusCode}`)); return; }
            response.once('data', () => browser.destroy());
          });
          browser.on('error', (error: NodeJS.ErrnoException) => { if (error.code !== 'ECONNRESET') reject(error); });
        });
        expect(upstreamSignal?.aborted).toBe(true);
        if (phase === 'during streaming') await vi.waitFor(() => expect(cancelled).toBe(true));
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }

  it('serves only issued, live media and thumbnail URLs without reviving expired URLs', async () => {
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const history = { 'input_select.home_state': [{ state: 'Borte', changedAt: iso(-3600000) }, { state: 'Hjemme', changedAt: iso(-600000) }] };
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/review') return Response.json([{ id: '1787914200.123456-abc123', camera: 'Bod', start_time: (now - 1800000) / 1000, end_time: (now - 1740000) / 1000, severity: 'alert' }]);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': url.pathname.endsWith('.webp') ? 'image/webp' : 'video/mp4' } });
    };
    const activity = new ActivityService({ getActivityHistory: async () => history }, new FrigateClient('http://private:5000', fetcher));
    const app = createApp(createClient(), { activity });
    const initial = await request(app).get('/api/activity').expect(200);
    const paths = [initial.body.awayCapture.mediaPath, initial.body.awayCapture.thumbnailPath];
    for (const mediaPath of paths) {
      expect(mediaPath).toMatch(/^\/api\/activity\/review\/[0-9a-f-]{36}\/(preview|thumbnail)$/);
      await request(app).get(mediaPath).expect(200);
    }
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 360000);
    try {
      await request(app).get('/api/activity').expect(200);
      for (const mediaPath of paths) await request(app).get(mediaPath).expect(502, activityError);
    } finally { clock.mockRestore(); }
  });
});

describe('dashboard API', () => {
  it('returns a health status', async () => {
    const response = await request(createApp(createClient())).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns dashboard states from the client', async () => {
    const client = createClient();
    vi.mocked(client.getDashboardStates).mockResolvedValue(dashboardStates);

    const response = await request(createApp(client)).get('/api/states');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(dashboardStates);
  });

  it('executes a known guestMode action and returns the confirmed state', async () => {
    const client = createClient();
    vi.mocked(client.execute).mockResolvedValue(confirmedGuestMode);

    const response = await request(createApp(client)).post('/api/actions/guestMode').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(confirmedGuestMode);
    expect(client.execute).toHaveBeenCalledWith('guestMode', undefined);
  });

  it('executes the guest-voucher action', async () => {
    const client = createClient();
    vi.mocked(client.execute).mockResolvedValue({ states: { guestVoucher: { entity_id: 'sensor.voucher', state: 'K7M9-P2Q4', attributes: {} } } });

    const response = await request(createApp(client)).post('/api/actions/guestVoucher').send({});

    expect(response.status).toBe(200);
    expect(client.execute).toHaveBeenCalledWith('guestVoucher', undefined);
  });

  it('returns 404 for an unknown action without invoking the client', async () => {
    const client = createClient();

    const response = await request(createApp(client)).post('/api/actions/turn_on').send({});

    expect(response.status).toBe(404);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid home option without invoking the client', async () => {
    const client = createClient();

    const response = await request(createApp(client)).post('/api/actions/home').send({ option: 'Away' });

    expect(response.status).toBe(400);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('forwards a heat-pump mode to the dashboard client', async () => {
    const client = createClient();
    vi.mocked(client.execute).mockResolvedValue({ states: {} });

    const response = await request(createApp(client)).post('/api/actions/heatPump').send({ mode: 'heat_cool' });

    expect(response.status).toBe(200);
    expect(client.execute).toHaveBeenCalledWith('heatPump', 'heat_cool');
  });

  it('rejects an invalid heat-pump mode without invoking the client', async () => {
    const client = createClient();

    const response = await request(createApp(client)).post('/api/actions/heatPump').send({ mode: 'dry' });

    expect(response.status).toBe(400);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('forwards a fan speed to the dashboard client', async () => {
    const client = createClient();
    vi.mocked(client.execute).mockResolvedValue({ states: {} });

    const response = await request(createApp(client)).post('/api/actions/fanSpeed').send({ fanMode: 'quiet' });

    expect(response.status).toBe(200);
    expect(client.execute).toHaveBeenCalledWith('fanSpeed', 'quiet');
  });

  it('rejects an unsupported fan speed', async () => {
    const client = createClient();

    const response = await request(createApp(client)).post('/api/actions/fanSpeed').send({ fanMode: 'turbo' });

    expect(response.status).toBe(400);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid temperature without invoking the client', async () => {
    const client = createClient();

    const response = await request(createApp(client)).post('/api/temperature').send({ temperature: '21' });

    expect(response.status).toBe(400);
    expect(client.setTemperature).not.toHaveBeenCalled();
  });

  it('normalizes client errors without leaking their detail', async () => {
    const client = createClient();
    vi.mocked(client.execute).mockRejectedValue(new Error('upstream token: secret-123'));

    const response = await request(createApp(client)).post('/api/actions/guestMode').send({});

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Kunne ikke oppdatere smarthuset. Prøv igjen.' });
    expect(response.text).not.toContain('secret-123');
  });

  it('forwards a valid temperature to the client', async () => {
    const client = createClient();
    const result = { states: { climate: { entity_id: 'climate.test', state: 'heat', attributes: {} } } };
    vi.mocked(client.setTemperature).mockResolvedValue(result);

    const response = await request(createApp(client)).post('/api/temperature').send({ temperature: 21.5 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(client.setTemperature).toHaveBeenCalledWith(21.5);
  });

  it('accepts a complete n8n AI report only with the configured secret', async () => {
    const app = createApp(createClient(), { aiReportSecret: 'n8n-secret' });
    await request(app).post('/api/ai-report').send({ report: 'Hei' }).expect(401);

    const publishedAt = '2026-08-22T08:00:00.000Z';
    await request(app).post('/api/ai-report').set('X-AI-Report-Secret', 'n8n-secret')
      .send({ title: 'Morgenbrief', mode: 'morning', report: 'Første linje\nAndre linje', publishedAt }).expect(202);
    const result = await request(app).get('/api/ai-report').expect(200);
    expect(result.body).toEqual({ title: 'Morgenbrief', mode: 'morning', report: 'Første linje\nAndre linje', publishedAt });
    await request(app).post('/api/ai-report').set('X-AI-Report-Secret', 'n8n-secret')
      .send({ mode: 'bedtime', report: 'Ugyldig modus' }).expect(400);
    await request(app).post('/api/ai-report').set('X-AI-Report-Secret', 'n8n-secret')
      .send({ mode: 'coming_home', report: 'Ugyldig modus' }).expect(400);
  });

  it('restores the latest AI report after an app restart when persistence is configured', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'walldash-ai-report-'));
    const storePath = path.join(directory, 'report.json');
    try {
      await request(createApp(createClient(), { aiReportSecret: 'n8n-secret', aiReportStorePath: storePath })).post('/api/ai-report')
        .set('X-AI-Report-Secret', 'n8n-secret')
        .send({ title: 'Kveldsrapport', report: 'Rapporten overlever omstart.', publishedAt: '2026-08-23T20:00:00.000Z' })
        .expect(202);
      const restored = await request(createApp(createClient(), { aiReportSecret: 'n8n-secret', aiReportStorePath: storePath })).get('/api/ai-report').expect(200);
      expect(restored.body).toEqual({ title: 'Kveldsrapport', report: 'Rapporten overlever omstart.', publishedAt: '2026-08-23T20:00:00.000Z' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses the configured report source when no local report has been published', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ report: '## Vær\nSol.', publishedAt: '2026-08-22T08:00:00.000Z' }), { status: 200 }));
    const result = await request(createApp(createClient(), { aiReportSourceUrl: 'http://192.168.1.50:3100' })).get('/api/ai-report').expect(200);
    expect(result.body.report).toBe('## Vær\nSol.');
    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.50:3100/api/ai-report', { cache: 'no-store' });
    fetchMock.mockRestore();
  });

  it('caches a valid report loaded from the configured report source', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ report: '## Vær\nSol.', publishedAt: '2026-08-22T08:00:00.000Z' }), { status: 200 }));
    const app = createApp(createClient(), { aiReportSourceUrl: 'http://192.168.1.50:3100' });
    await request(app).get('/api/ai-report').expect(200);
    await request(app).get('/api/ai-report').expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('revalidates a cached source report so a newly published report is discovered', async () => {
    let now = 10_000;
    const nowMock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: 'Gammel rapport', publishedAt: '2026-08-23T08:00:00.000Z' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: 'Ny rapport', publishedAt: '2026-08-23T08:05:00.000Z' }), { status: 200 }));
    const app = createApp(createClient(), { aiReportSourceUrl: 'http://192.168.1.50:3100' });
    await request(app).get('/api/ai-report').expect(200, { report: 'Gammel rapport', publishedAt: '2026-08-23T08:00:00.000Z' });
    now += 1_501;
    await request(app).get('/api/ai-report').expect(200, { report: 'Ny rapport', publishedAt: '2026-08-23T08:05:00.000Z' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
    nowMock.mockRestore();
  });

  it('starts an on-demand AI report through the configured n8n webhook', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await request(createApp(createClient(), { aiReportRefreshUrl: 'http://n8n.test/webhook/refresh' }))
      .post('/api/ai-report/refresh').send({ mode: 'on_demand', requestedAt: '2026-08-23T12:00:00.000Z' }).expect(202);
    expect(fetchMock).toHaveBeenCalledWith('http://n8n.test/webhook/refresh', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ mode: 'on_demand', requestedAt: '2026-08-23T12:00:00.000Z' }),
    }));
    fetchMock.mockRestore();
  });

  it('forwards focused report intents and rejects unsupported modes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const app = createApp(createClient(), { aiReportRefreshUrl: 'http://n8n.test/webhook/refresh' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'coming_home' }).expect(400);
    await request(app).post('/api/ai-report/refresh').send({ mode: 'morning' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ mode: 'morning' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'afternoon' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ mode: 'afternoon' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'midday' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({ mode: 'midday' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'evening' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({ mode: 'evening' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'bedtime' }).expect(400);
    fetchMock.mockRestore();
  });

  it('forwards allowlisted light commands and rejects arbitrary entities', async () => {
    const client = createClient();
    vi.mocked(client.executeLight!).mockResolvedValue({ states: { lightCove: { entity_id: 'light.cove', state: 'on', attributes: {} } } });

    const response = await request(createApp(client)).post('/api/lights/lightCove').send({ brightness: 44 });

    expect(response.status).toBe(200);
    expect(client.executeLight!).toHaveBeenCalledWith('lightCove', { brightness: 44 });
    await request(createApp(client)).post('/api/lights/light.anything').send({ on: true }).expect(404);
    await request(createApp(client)).post('/api/lights/lightCove').send({ brightness: 0 }).expect(400);
  });

  it('proxies a camera stream without caching it', async () => {
    const client = createClient();
    client.getCameraStream = vi.fn().mockResolvedValue({
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }),
      contentType: 'application/octet-stream',
    });

    const response = await request(createApp(client)).get('/api/camera/stream');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store, no-transform');
    expect(response.headers['content-type']).toContain('application/octet-stream');
    expect(client.getCameraStream).toHaveBeenCalledOnce();
  });

  it('removes the unused camera backpressure listener after draining', async () => {
    const response = new EventEmitter();
    const writable = waitForWritable(response as never);
    expect(response.listenerCount('drain')).toBe(1);
    expect(response.listenerCount('close')).toBe(1);

    response.emit('drain');
    await writable;

    expect(response.listenerCount('drain')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });
});
