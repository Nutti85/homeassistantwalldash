import { describe, expect, it, vi } from 'vitest';
import { HomeAssistantClient } from './homeAssistant';
import { defaultDashboardEntityIds, type DashboardEntityIds } from '../shared/entities';

const entities = (overrides: Record<string, string>) => ({
  ...Object.fromEntries(Object.keys(defaultDashboardEntityIds).map(key => [key, ''])), ...overrides,
}) as DashboardEntityIds;
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

describe('briefing source contract', () => {
  it('preserves source clocks without treating a successful fetch as a fresh vehicle reading', async () => {
    const source = { entity_id: 'sensor.car', state: '27', attributes: { timestamp: '2026-06-01T12:00:00', retrievalstatus: 'VALID' }, last_updated: '2026-09-05T18:00:00Z', last_reported: '2026-09-05T18:01:00Z', last_changed: '2026-06-01T10:00:00Z' };
    const fetcher = vi.fn(async (url: string) => response(url.endsWith('/states/sensor.car') ? source : []));
    const result = await new HomeAssistantClient('http://ha', 'secret', fetcher as typeof fetch, entities({ carAndreasBattery: 'sensor.car' })).getDashboardStates();
    expect(result.states.carAndreasBattery).toEqual(source);
  });

  it('keeps calendar identity, cancellation, location and existing route metadata', async () => {
    const event = { uid: 'event-1', recurrence_id: 'instance-2', status: 'cancelled', summary: 'Appointment', location: 'Meeting place', start: { dateTime: '2026-09-06T10:00:00+02:00' }, end: { dateTime: '2026-09-06T11:00:00+02:00' }, travel_minutes: 20, travel_updated_at: '2026-09-06T07:55:00Z' };
    const fetcher = vi.fn(async (url: string) => response(url.includes('/calendars/') ? [event] : url.endsWith('/states/calendar.test') ? { entity_id: 'calendar.test', state: 'off', attributes: {} } : []));
    const result = await new HomeAssistantClient('http://ha', 'secret', fetcher as typeof fetch, entities({ calendar: 'calendar.test' })).getDashboardStates();
    expect(result.states.calendar?.attributes.events).toEqual([event]);
  });

  it.each([true, false])('uses authoritative dated workday events for tomorrow (working=%s)', async working => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T21:30:00Z'));
    try {
      const fetcher = vi.fn(async (url: string) => response(url.includes('/calendars/') ? (working ? [{ start: { date: '2026-09-07' }, end: { date: '2026-09-08' } }] : []) : url.endsWith('/states/calendar.work') ? { entity_id: 'calendar.work', state: 'off', attributes: {} } : []));
      const result = await new HomeAssistantClient('http://ha', 'secret', fetcher as typeof fetch, entities({ workdayTomorrow: 'calendar.work' })).getDashboardStates();
      expect(result.states.workdayTomorrow).toMatchObject({ state: working ? 'on' : 'off', attributes: { date: '2026-09-07' } });
    } finally { vi.useRealTimers(); }
  });
});
