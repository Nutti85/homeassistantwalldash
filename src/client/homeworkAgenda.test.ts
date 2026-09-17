import { describe, expect, it } from 'vitest';
import type { JacobPlanItem } from '../shared/entities';
import { homeworkCompletionStorageKey, homeworkId, isHomeworkActive, readCompletedHomework, writeCompletedHomework } from './homeworkAgenda';

const homework: JacobPlanItem = { date: '2026-09-11', subject: 'Norsk', title: 'Les kapittel 2', details: 'Skriv tre setninger.' };

const storage = (values: Record<string, string> = {}) => {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    value: (key: string) => data.get(key),
  } as unknown as Storage & { value: (key: string) => string | undefined };
};

describe('Jacob homework agenda', () => {
  it('keeps Friday homework active from Monday through Friday only', () => {
    expect(isHomeworkActive(homework, new Date('2026-09-07T08:00:00+02:00'))).toBe(true);
    expect(isHomeworkActive(homework, new Date('2026-09-11T22:00:00+02:00'))).toBe(true);
    expect(isHomeworkActive(homework, new Date('2026-09-06T22:00:00+02:00'))).toBe(false);
    expect(isHomeworkActive(homework, new Date('2026-09-12T08:00:00+02:00'))).toBe(false);
  });

  it('persists the stable homework ID when it is completed', () => {
    const browserStorage = storage();
    const id = homeworkId(homework);

    expect(readCompletedHomework(browserStorage)).toEqual([]);
    expect(writeCompletedHomework([id], browserStorage)).toEqual([id]);
    expect(readCompletedHomework(browserStorage)).toEqual([id]);
    expect(browserStorage.value(homeworkCompletionStorageKey)).toBe(JSON.stringify([id]));
  });
});
