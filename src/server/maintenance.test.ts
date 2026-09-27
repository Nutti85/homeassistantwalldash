import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type DashboardClient } from './app';

const client = { getDashboardStates: vi.fn(), execute: vi.fn(), setTemperature: vi.fn() } as DashboardClient;
const snapshot = {
  schemaVersion: 1, observedAt: '2026-09-27T10:00:00Z', checkedAt: '2026-09-27T10:01:00Z', sourceAvailable: false,
  devices: [{ id: 'd1', name: 'Dimmer', area: 'Stue', batteryEntityId: 'sensor.dimmer_battery', level: 1, batteryType: 'CR2450', quantity: 1, replaceable: true, status: 'critical', action: 'Bytt batteri', evidenceUpdatedAt: '2026-09-27T09:00:00Z' }],
  tasks: [
    { id: 't1', deviceId: 'd1', kind: 'replace_battery', summary: 'Bytt batteri', description: 'Dimmer i stuen', due: null, status: 'needs_action' },
    { id: 't2', deviceId: 'd1', kind: 'replace_battery', summary: 'Allerede gjort', description: 'Ferdig', due: null, status: 'completed' },
  ],
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('maintenance API', () => {
  it('reads authenticated snapshot, maps only incomplete tasks, and preserves stale source status', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot)));
    vi.stubGlobal('fetch', fetch);
    const response = await request(createApp(client, { maintenanceFeedUrl: 'https://n8n.example/webhook/maintenance/v1/snapshot', maintenanceFeedKey: 'secret' })).get('/api/maintenance');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetch).toHaveBeenCalledWith('https://n8n.example/webhook/maintenance/v1/snapshot', expect.objectContaining({ headers: { 'X-Maintenance-Feed-Key': 'secret' } }));
    expect(response.body).toMatchObject({ sourceAvailable: false, tasks: [{ id: 't1', device: { batteryType: 'CR2450' } }] });
    expect(response.body.tasks).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('keeps maintenance failure separate from home states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    const app = createApp(client, { maintenanceFeedUrl: 'https://n8n.example/feed', maintenanceFeedKey: 'secret' });
    expect((await request(app).get('/api/maintenance')).status).toBe(502);
    expect((await request(app).get('/api/states')).status).toBe(200);
  });

  it('rejects malformed top level and skips malformed tasks', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...snapshot, schemaVersion: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...snapshot, tasks: [{ id: 'bad' }] })));
    vi.stubGlobal('fetch', fetch);
    const app = createApp(client, { maintenanceFeedUrl: 'https://n8n.example/feed', maintenanceFeedKey: 'secret' });
    expect((await request(app).get('/api/maintenance')).status).toBe(502);
    expect((await request(app).get('/api/maintenance')).body.tasks).toEqual([]);
  });

  it('accepts a never-observed empty snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...snapshot, observedAt: null, devices: [], tasks: [] }))));
    const response = await request(createApp(client, { maintenanceFeedUrl: 'https://n8n.example/feed', maintenanceFeedKey: 'secret' })).get('/api/maintenance');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ observedAt: null, sourceAvailable: false, tasks: [] });
  });
});
