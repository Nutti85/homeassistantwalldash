import { describe, expect, it } from 'vitest';
import { formatJacobWeeklyPlan, type WeeklyPlanDatabaseRows } from './weeklyPlanFormatter';

describe('formatJacobWeeklyPlan', () => {
  it('formats and sorts database rows into a Home Assistant snapshot', () => {
    const input: WeeklyPlanDatabaseRows = {
      plan: { weekly_plan_id: 17, title: 'Uke 35', plan_week_start: '2026-08-24', created_at: '2026-08-23T18:00:00Z' },
      homework: [{ subject: 'Matte', task: 'Lekse side 12', due_date: '2026-08-25', due_date_text: 'tirsdag' }],
      events: [
        { title: 'Fotball', event_date: '2026-08-25', date_text: 'tirsdag', start_time: '16:00', details: 'Kunstgress' },
        { title: 'Foreldremøte', event_date: '2026-08-24', date_text: 'mandag', start_time: '18:00' },
      ],
      reminders: [{ reminder: 'Ta med innesko', reminder_date: '2026-08-29', date_text: 'fredag' }],
      topics: [{ subject: 'Naturfag', topic: 'Vannets kretsløp' }],
      messages: [{ message: 'Husk gymtøy' }],
      schedule: [{ weekday: 'mandag', start_time: '08:30', end_time: '14:00' }],
    };

    const result = formatJacobWeeklyPlan(input);

    expect(result.state).toBe('Uke 35');
    expect(result.attributes).toMatchObject({
      summary: '2 avtaler, 1 lekse og 1 påminnelse denne uken.',
      plan_id: 17,
      week_start: '2026-08-24',
      events: [{ title: 'Foreldremøte', date: '2026-08-24' }, { title: 'Fotball', time: '16:00' }],
      homework: [{ subject: 'Matte', title: 'Lekse side 12', date: '2026-08-25' }],
      reminders: [{ title: 'Ta med innesko', date: '2026-08-29' }],
      topics: ['Naturfag: Vannets kretsløp'], messages: ['Husk gymtøy'],
    });
    expect(result.attributes.school_schedule).toEqual([{ weekday: 'mandag', time: '08:30–14:00', title: 'Skole' }]);
  });

  it('publishes a safe empty snapshot when no plan rows are available', () => {
    expect(formatJacobWeeklyPlan({})).toEqual({
      state: 'Ukjent',
      attributes: { summary: '', events: [], reminders: [], homework: [], school_schedule: [], topics: [], messages: [] },
    });
  });
});
