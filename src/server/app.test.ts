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
