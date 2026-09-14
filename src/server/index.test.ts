import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('express', () => ({
  default: Object.assign(vi.fn(), { static: vi.fn() }),
}));

vi.mock('./app', () => ({
  createApp: vi.fn(() => ({ use: vi.fn(), get: vi.fn(), listen: vi.fn() })),
}));

describe('parseActivityEntityConfig', () => {
  beforeAll(() => {
    vi.stubEnv('HA_URL', 'http://ha:8123');
    vi.stubEnv('HA_TOKEN', 'test-token');
    vi.stubEnv('HA_FRIGATE_EVENT_ENTITY_IDS', '');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('filters blank Frigate entity entries', async () => {
    const { parseActivityEntityConfig } = await import('./index');

    expect(parseActivityEntityConfig(' binary_sensor.ringeklokke_visitor ', ' image.driveway_person, ,image.front_door_person, ', ' input_number.monitoring_mode ')).toEqual({
      doorbellVisitor: 'binary_sensor.ringeklokke_visitor',
      frigateEvents: ['image.driveway_person', 'image.front_door_person'],
      securityMode: 'input_number.monitoring_mode',
    });
  });

  it('accepts an empty Frigate entity list', async () => {
    const { parseActivityEntityConfig } = await import('./index');

    expect(parseActivityEntityConfig(undefined, ' , ')).toEqual({
      doorbellVisitor: '',
      frigateEvents: [],
      securityMode: 'input_number.toggle_security_mode',
    });
  });

  it('redacts invalid Frigate entity configuration values', async () => {
    const { parseActivityEntityConfig } = await import('./index');

    const configuredValue = 'sensor.private_camera_event';
    try {
      parseActivityEntityConfig(undefined, configuredValue);
      throw new Error('Expected Frigate entity configuration to fail');
    } catch (error) {
      expect((error as Error).message).toContain('HA_FRIGATE_EVENT_ENTITY_IDS');
      expect((error as Error).message).not.toContain(configuredValue);
    }
  });

  it('rejects a security mode entity outside input_number', async () => {
    const { parseActivityEntityConfig } = await import('./index');
    expect(() => parseActivityEntityConfig(undefined, undefined, 'sensor.private_mode'))
      .toThrow(/HA_SECURITY_MODE_ENTITY_ID/);
  });
});
