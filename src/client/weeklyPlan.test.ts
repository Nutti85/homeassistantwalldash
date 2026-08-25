import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { jacobWeeklyPlan } from './dashboardModel';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });

describe('jacobWeeklyPlan', () => {
  it('parses the full structured snapshot while preserving readable fields', () => {
    const result = jacobWeeklyPlan(state('sensor.jacob_weekly_plan', 'Denne uken', {
      summary: 'Jacob har prøve og fotball denne uken.',
      week_start: '2026-08-24',
      events: [{ date: '2026-08-25', weekday: 'tirsdag', time: '16:00', title: 'Fotball', details: 'Kunstgress' }],
      reminders: [{ weekday: 'fredag', title: 'Ta med innesko' }],
      homework: [{ subject: 'Matte', title: 'Lekse side 12' }],
      school_schedule: [{ weekday: 'mandag', title: 'Skole' }],
      topics: ['Brøk'], messages: ['Husk gymtøy'],
    }));
    expect(result).toMatchObject({ summary: 'Jacob har prøve og fotball denne uken.', events: [{ title: 'Fotball' }], reminders: [{ title: 'Ta med innesko' }], homework: [{ subject: 'Matte' }], topics: ['Brøk'] });
  });

  it('returns an empty safe snapshot for malformed collections', () => {
    expect(jacobWeeklyPlan(state('sensor.jacob_weekly_plan', 'Ukjent', { summary: 42, events: 'bad', reminders: null }))).toMatchObject({ summary: '', events: [], reminders: [], homework: [], school_schedule: [], topics: [], messages: [] });
  });

  it('returns undefined for an unavailable entity', () => {
    expect(jacobWeeklyPlan(state('sensor.jacob_weekly_plan', 'unavailable'))).toBeUndefined();
  });
});
