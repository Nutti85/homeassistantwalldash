import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type DashboardClient } from './app';

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
    const app = createApp(createClient(), 'n8n-secret');
    await request(app).post('/api/ai-report').send({ report: 'Hei' }).expect(401);

    const publishedAt = '2026-08-22T08:00:00.000Z';
    await request(app).post('/api/ai-report').set('X-AI-Report-Secret', 'n8n-secret')
      .send({ title: 'Morgenbrief', report: 'Første linje\nAndre linje', publishedAt }).expect(202);
    const result = await request(app).get('/api/ai-report').expect(200);
    expect(result.body).toEqual({ title: 'Morgenbrief', report: 'Første linje\nAndre linje', publishedAt });
  });

  it('uses the configured report source when no local report has been published', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ report: '## Vær\nSol.', publishedAt: '2026-08-22T08:00:00.000Z' }), { status: 200 }));
    const result = await request(createApp(createClient(), '', 'http://192.168.1.50:3100')).get('/api/ai-report').expect(200);
    expect(result.body.report).toBe('## Vær\nSol.');
    expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.50:3100/api/ai-report', { cache: 'no-store' });
    fetchMock.mockRestore();
  });

  it('starts an on-demand AI report through the configured n8n webhook', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await request(createApp(createClient(), '', '', 'http://n8n.test/webhook/refresh'))
      .post('/api/ai-report/refresh').send({ mode: 'on_demand', requestedAt: '2026-08-23T12:00:00.000Z' }).expect(202);
    expect(fetchMock).toHaveBeenCalledWith('http://n8n.test/webhook/refresh', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ mode: 'on_demand', requestedAt: '2026-08-23T12:00:00.000Z' }),
    }));
    fetchMock.mockRestore();
  });

  it('forwards focused report intents and rejects unsupported modes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const app = createApp(createClient(), '', '', 'http://n8n.test/webhook/refresh');
    await request(app).post('/api/ai-report/refresh').send({ mode: 'coming_home' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ mode: 'coming_home' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'morning' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ mode: 'morning' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'afternoon' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({ mode: 'afternoon' });
    await request(app).post('/api/ai-report/refresh').send({ mode: 'midday' }).expect(202);
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({ mode: 'midday' });
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
});
