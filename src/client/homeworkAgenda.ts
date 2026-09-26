import type { JacobPlanItem } from '../shared/entities';

export const homeworkCompletionStorageKey = 'smarthjem-jacob-homework-completed-v1';

const browserStorage = (): Storage | undefined => {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
};

const dateOnly = (value: string): Date | undefined => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(result.getTime()) ? undefined : result;
};

const startOfDay = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const homeworkId = (item: JacobPlanItem): string => [item.date, item.subject, item.title, item.details].map((part) => part?.trim().toLocaleLowerCase('nb-NO') ?? '').join('\u0000');

export const isHomeworkActive = (item: JacobPlanItem, now: Date): boolean => {
  if (!item.date) return false;
  const dueDate = dateOnly(item.date);
  if (!dueDate) return false;
  const monday = new Date(dueDate);
  monday.setDate(dueDate.getDate() - ((dueDate.getDay() + 6) % 7));
  const today = startOfDay(now);
  return today >= monday && today <= dueDate;
};

const completedIds = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];

export const readCompletedHomework = (storage: Storage | undefined = browserStorage()): string[] => {
  try { return completedIds(JSON.parse(storage?.getItem(homeworkCompletionStorageKey) ?? '[]')); } catch { return []; }
};

export const writeCompletedHomework = (ids: string[], storage: Storage | undefined = browserStorage()): string[] => {
  const completed = completedIds(ids);
  try { storage?.setItem(homeworkCompletionStorageKey, JSON.stringify(completed)); } catch { /* Completion remains active for this view if storage is unavailable. */ }
  return completed;
};
