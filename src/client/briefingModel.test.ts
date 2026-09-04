import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { briefingPeriod, buildBriefingViewModel } from './briefingModel';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });

const osloTime = (value: string) => new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

describe('briefing periods', () => {
  it.each([
    ['morning', '06:00', '09:00', 'Morgen · 06:00–09:00'],
    ['midday', '09:00', '15:00', 'Formiddag · 09:00–15:00'],
    ['afternoon', '16:00', '19:00', 'Ettermiddag · 16:00–19:00'],
    ['evening', '19:00', '23:00', 'Kveld · 19:00–23:00'],
  ] as const)('maps %s to its fixed Oslo interval', (mode, start, end, label) => {
    const period = briefingPeriod(mode, '2026-09-04T22:00:00+02:00');
    expect(period.label).toBe(label);
    expect(osloTime(period.startAt)).toBe(start);
    expect(osloTime(period.endAt)).toBe(end);
  });

  it('uses the 24 hours after publication for a full report', () => {
    const period = briefingPeriod('full', '2026-09-04T22:00:00+02:00');
    expect(Date.parse(period.endAt) - Date.parse(period.startAt)).toBe(24 * 60 * 60 * 1000);
    expect(period.label).toMatch(/^Neste 24 timer/);
  });
});

describe('briefing view model ordering', () => {
  it('always returns the approved metric and practical order', () => {
    const report = { mode: 'evening' as const, publishedAt: '2026-09-04T22:00:00+02:00' };
    const model = buildBriefingViewModel(report, {
      weatherHourly: state('sensor.hourly', 'rainy', { forecast: [] }),
    }, new Date('2026-09-04T22:05:00+02:00'));

    expect(model.metrics.map(({ id }) => id)).toEqual(['weather', 'temperature', 'wind', 'rain', 'clothing']);
    expect(model.practical.map(({ id }) => id)).toEqual(['calendar', 'travel', 'school', 'kindergarten', 'home', 'warnings']);
  });
});
