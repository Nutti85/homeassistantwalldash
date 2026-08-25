import type { JacobPlanItem, JacobWeeklyPlanSnapshot } from './entities';

type PlanRow = Record<string, unknown>;
export interface WeeklyPlanDatabaseRows {
  plan?: PlanRow;
  homework?: PlanRow[];
  events?: PlanRow[];
  reminders?: PlanRow[];
  topics?: PlanRow[];
  messages?: PlanRow[];
  schedule?: PlanRow[];
}

const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const date = (value: unknown): string | undefined => {
  const candidate = text(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined;
};
const time = (value: unknown): string | undefined => text(value);
const sortRows = (left: JacobPlanItem, right: JacobPlanItem): number => `${left.date ?? '9999-99-99'}T${left.time ?? '99:99'}`.localeCompare(`${right.date ?? '9999-99-99'}T${right.time ?? '99:99'}`);
const item = (row: PlanRow, title: unknown, dateValue: unknown, weekday: unknown, details?: unknown, subject?: unknown, itemTime?: unknown): JacobPlanItem | undefined => {
  const safeTitle = text(title);
  if (!safeTitle) return undefined;
  return {
    ...(date(dateValue) ? { date: date(dateValue) } : {}),
    ...(text(weekday) ? { weekday: text(weekday) } : {}),
    ...(time(itemTime) ? { time: time(itemTime) } : {}),
    title: safeTitle,
    ...(text(details) ? { details: text(details) } : {}),
    ...(text(subject) ? { subject: text(subject) } : {}),
  };
};

export const formatJacobWeeklyPlan = (input: WeeklyPlanDatabaseRows): { state: string; attributes: JacobWeeklyPlanSnapshot } => {
  const plan = input.plan ?? {};
  const events = (input.events ?? []).flatMap((row) => { const value = item(row, row.title, row.event_date, row.date_text, row.details, undefined, row.start_time); return value ? [value] : []; }).sort(sortRows);
  const reminders = (input.reminders ?? []).flatMap((row) => { const value = item(row, row.reminder, row.reminder_date, row.date_text, row.evidence_text); return value ? [value] : []; }).sort(sortRows);
  const homework = (input.homework ?? []).flatMap((row) => { const value = item(row, row.task, row.due_date, row.due_date_text, row.evidence_text, row.subject); return value ? [value] : []; }).sort(sortRows);
  const school_schedule = (input.schedule ?? []).flatMap((row) => {
    const start = time(row.start_time);
    const end = time(row.end_time);
    const value = item(row, 'Skole', undefined, row.weekday, undefined, undefined, start && end ? `${start}–${end}` : start);
    return value ? [value] : [];
  });
  const topics = (input.topics ?? []).flatMap((row) => { const subject = text(row.subject); const topic = text(row.topic); return subject && topic ? [`${subject}: ${topic}`] : [topic ?? subject].filter((value): value is string => Boolean(value)); });
  const messages = (input.messages ?? []).flatMap((row) => { const value = text(row.message); return value ? [value] : []; });
  const parts = [events.length ? `${events.length} ${events.length === 1 ? 'avtale' : 'avtaler'}` : '', homework.length ? `${homework.length} ${homework.length === 1 ? 'lekse' : 'lekser'}` : '', reminders.length ? `${reminders.length} ${reminders.length === 1 ? 'påminnelse' : 'påminnelser'}` : ''].filter(Boolean);
  const summary = parts.length ? `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} og ${parts.at(-1)}` : parts[0]} denne uken.` : '';
  const attributes: JacobWeeklyPlanSnapshot = {
    summary,
    ...(date(plan.plan_week_start) ? { week_start: date(plan.plan_week_start) } : {}),
    ...(text(plan.plan_week_end) ? { week_end: text(plan.plan_week_end) } : {}),
    ...(text(plan.created_at) ? { source_updated_at: text(plan.created_at) } : {}),
    ...(typeof plan.weekly_plan_id === 'string' || typeof plan.weekly_plan_id === 'number' ? { plan_id: plan.weekly_plan_id } : {}),
    events, reminders, homework, school_schedule, topics, messages,
  };
  return { state: text(plan.title) ?? 'Ukjent', attributes };
};
