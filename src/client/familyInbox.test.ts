import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { familyMessages, familyReceiptStorageKey, readFamilyReceipts, setFamilyMessageRead, writeFamilyReceipts } from './familyInbox';

const state = (entity_id: string, attributes: Record<string, unknown>): HomeAssistantState => ({ entity_id, state: 'Oppdatert', attributes });

const emptyJacob = { summary: '', events: [], reminders: [], homework: [], school_schedule: [], topics: [], messages: [] };
const emptyMyKid = { summary: '', health: 'ok', events: [], noticeboard: [], weekly_plans: [], newsletters: [], birthdays: [], today: [] };
const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    value: (key: string) => values.get(key),
  } as Storage & { value(key: string): string | undefined };
};

describe('familyMessages', () => {
  it('retains MyKid upstream IDs and the source publication date', () => {
    const messages = familyMessages({ mykidKindergarten: state('sensor.mykid_kindergarten', {
      ...emptyMyKid,
      noticeboard: [{ id: 'notice-42', title: 'Husk ull', details: 'Ta med ekstra skift.', published_at: '2026-09-07T08:30:00Z' }],
    }) });

    expect(messages).toEqual([{
      id: 'notice-42', source: 'Nicolai', title: 'Husk ull', body: 'Ta med ekstra skift.', publishedAt: '2026-09-07T08:30:00Z',
    }]);
  });

  it('derives one deterministic MyKid fallback ID from the source fields', () => {
    const states = { mykidKindergarten: state('sensor.mykid_kindergarten', {
      ...emptyMyKid,
      newsletters: [{ title: 'Ny uke', details: 'Detaljene er her.', published_at: '2026-09-06T09:00:00Z' }],
    }) };

    const [first] = familyMessages(states);
    const [second] = familyMessages(states);

    expect(first?.id).toMatch(/^mykid-[a-z0-9]+$/);
    expect(second?.id).toBe(first?.id);
  });

  it('derives Jacob IDs from normalized complete bodies independent of source refresh and array position', () => {
    const first = familyMessages({ jacobWeeklyPlan: state('sensor.jacob_weekly_plan', {
      ...emptyJacob, source_updated_at: '2026-09-01T08:00:00Z', messages: ['  Husk\n gymtøy  '],
    }) });
    const refreshed = familyMessages({ jacobWeeklyPlan: state('sensor.jacob_weekly_plan', {
      ...emptyJacob, source_updated_at: '2026-09-08T08:00:00Z', messages: ['En annen melding', 'Husk gymtøy'],
    }) });

    expect(refreshed.find((message) => message.body === 'Husk gymtøy')?.id).toBe(first[0]?.id);
  });

  it('sorts dated messages newest first without changing their source dates', () => {
    const messages = familyMessages({
      jacobWeeklyPlan: state('sensor.jacob_weekly_plan', { ...emptyJacob, source_updated_at: '2026-09-02T08:00:00Z', messages: ['Jacob melding'] }),
      mykidKindergarten: state('sensor.mykid_kindergarten', { ...emptyMyKid, newsletters: [
        { id: 'newest', title: 'Nyeste', published_at: '2026-09-03T08:00:00Z' },
        { id: 'oldest', title: 'Eldste', published_at: '2026-09-01T08:00:00Z' },
      ] }),
    });

    expect(messages.map((message) => message.id)).toEqual(['newest', expect.any(String), 'oldest']);
    expect(messages[0]?.publishedAt).toBe('2026-09-03T08:00:00Z');
    expect(messages[1]?.publishedAt).toBe('2026-09-02T08:00:00Z');
  });

  it('collapses duplicate stable IDs into one row', () => {
    const messages = familyMessages({ mykidKindergarten: state('sensor.mykid_kindergarten', {
      ...emptyMyKid,
      noticeboard: [{ id: 'same', title: 'Oppslag', published_at: '2026-09-03T08:00:00Z' }],
      newsletters: [{ id: 'same', title: 'Nyhetsbrev', published_at: '2026-09-02T08:00:00Z' }],
    }) });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.title).toBe('Oppslag');
  });
});

describe('family read receipts', () => {
  const now = new Date('2026-09-10T12:00:00Z');

  it('returns no receipts from empty or malformed storage', () => {
    expect(readFamilyReceipts(memoryStorage(), now)).toEqual([]);
    expect(readFamilyReceipts(memoryStorage({ [familyReceiptStorageKey]: '{not json' }), now)).toEqual([]);
  });

  it('adds a read receipt and removes it when restored to unread', () => {
    const read = setFamilyMessageRead([], 'notice-42', true, now);

    expect(read).toEqual([{ id: 'notice-42', readAt: '2026-09-10T12:00:00.000Z' }]);
    expect(setFamilyMessageRead(read, 'notice-42', false, now)).toEqual([]);
  });

  it('replaces a duplicate receipt when a message is marked read again', () => {
    const receipts = setFamilyMessageRead([
      { id: 'notice-42', readAt: '2026-09-01T12:00:00.000Z' },
      { id: 'notice-42', readAt: '2026-09-02T12:00:00.000Z' },
    ], 'notice-42', true, now);

    expect(receipts).toEqual([{ id: 'notice-42', readAt: '2026-09-10T12:00:00.000Z' }]);
  });

  it('prunes receipts older than 365 days and stores IDs with timestamps only', () => {
    const storage = memoryStorage();
    writeFamilyReceipts([
      { id: 'keep', readAt: '2025-09-10T12:00:00.000Z' },
      { id: 'discard', readAt: '2025-09-10T11:59:59.999Z' },
    ], storage, now);

    expect(JSON.parse(storage.value(familyReceiptStorageKey)!)).toEqual([{ id: 'keep', readAt: '2025-09-10T12:00:00.000Z' }]);
  });

  it('does not remove read messages from the complete normalized collection', () => {
    const messages = familyMessages({ mykidKindergarten: state('sensor.mykid_kindergarten', {
      ...emptyMyKid, noticeboard: [{ id: 'notice-42', title: 'Husk ull', published_at: '2026-09-07T08:30:00Z' }],
    }) });
    const receipts = setFamilyMessageRead([], 'notice-42', true, now);

    expect(messages.some((message) => receipts.some((receipt) => receipt.id === message.id))).toBe(true);
  });
});
