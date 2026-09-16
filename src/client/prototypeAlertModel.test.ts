import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { prototypeAlertDescriptors } from './prototypeAlertModel';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });
const now = new Date('2026-09-16T10:00:00+02:00');

describe('prototypeAlertDescriptors', () => {
  it('derives event-specific MET alerts and filters expired warnings', () => {
    const alerts = prototypeAlertDescriptors({ meteoAlarm: state('sensor.met', 'on', { alerts: [
      { event: 'rainFlood', eventAwarenessName: 'Styrtregn', riskMatrixColor: 'Orange', expires: '2026-09-16T12:00:00+02:00' },
      { event: 'snow', eventAwarenessName: 'Gammel snø', riskMatrixColor: 'Yellow', expires: '2026-09-16T09:00:00+02:00' },
    ] }) }, 'calm', now);

    expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'meteo', icon: 'rainy_heavy', title: 'Styrtregn' })]));
    expect(alerts.map((alert) => alert.title)).not.toContain('Gammel snø');
  });

  it('derives lightning, gust, and aurora descriptors from their active source values', () => {
    const alerts = prototypeAlertDescriptors({
      lightningDistance: state('sensor.lightning', '8.2'),
      weatherHourly: state('weather.hourly', 'rainy', { forecast: [{ datetime: '2026-09-16T11:00:00+02:00', wind_gust_speed: 11.8 }] }),
      auroraVisibility: state('binary_sensor.aurora', 'on'),
    }, 'calm', now);

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'lightning', title: 'Lyn i nærheten' }),
      expect.objectContaining({ kind: 'windGust', title: 'Kraftige vindkast' }),
      expect.objectContaining({ kind: 'aurora', title: 'Nordlys synlig' }),
    ]));
  });

  it('does not surface a gust alert for a strong forecast that is more than three hours away', () => {
    const alerts = prototypeAlertDescriptors({
      weatherHourly: state('weather.hourly', 'rainy', { forecast: [
        { datetime: '2026-09-16T10:00:00+02:00', wind_gust_speed: 5 },
        { datetime: '2026-09-16T14:00:00+02:00', wind_gust_speed: 14 },
      ] }),
    }, 'calm', now);

    expect(alerts.some((alert) => alert.kind === 'windGust')).toBe(false);
  });

  it('adds stopped charging only in the warning scenario and never emits an unlocked door', () => {
    const states = { frontDoorLock: state('lock.front_door', 'unlocked') };
    expect(prototypeAlertDescriptors(states, 'calm', now).map((alert) => alert.title)).not.toContain('Ytterdøren er ulåst');
    expect(prototypeAlertDescriptors(states, 'warning', now)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'charging', title: 'Lading stoppet' })]));
  });
});
