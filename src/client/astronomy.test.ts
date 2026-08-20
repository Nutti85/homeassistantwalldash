import { describe, expect, it } from 'vitest';
import { getMoonIllumination, getMoonPosition, getSunEvents, getSunPosition } from './astronomy';

describe('astronomical positions', () => {
  it('places the equinox sun close to overhead near the equator at noon', () => {
    const position = getSunPosition(new Date('2024-03-20T12:00:00Z'), 0, 0);
    expect(position.altitude).toBeGreaterThan(87);
    expect(position.altitude).toBeLessThanOrEqual(90);
    expect(position.azimuth).toBeGreaterThanOrEqual(0);
    expect(position.azimuth).toBeLessThan(360);
  });

  it('tracks continuous illumination through full and new moon', () => {
    const fullMoon = getMoonIllumination(new Date('2024-03-25T07:00:00Z'));
    const newMoon = getMoonIllumination(new Date('2024-04-08T18:21:00Z'));
    expect(fullMoon.fraction).toBeGreaterThan(0.99);
    expect(newMoon.fraction).toBeLessThan(0.01);
  });

  it('returns a valid topocentric moon position for Sandefjord', () => {
    const position = getMoonPosition(new Date('2026-08-21T12:00:00Z'));
    expect(position.altitude).toBeGreaterThanOrEqual(-90);
    expect(position.altitude).toBeLessThanOrEqual(90);
    expect(position.azimuth).toBeGreaterThanOrEqual(0);
    expect(position.azimuth).toBeLessThan(360);
    expect(position.distance).toBeGreaterThan(350_000);
    expect(position.distance).toBeLessThan(410_000);
  });

  it('calculates local sunrise and sunset for today and tomorrow', () => {
    const events = getSunEvents(new Date('2026-08-21T12:00:00+02:00'));
    expect(events.rising?.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })).toMatch(/^05:(4[5-9]|5[0-3])$/);
    expect(events.setting?.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })).toMatch(/^20:5[0-7]$/);
  });
});
