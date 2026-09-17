import type { HomeAssistantState, MyKidKindergartenItem } from '../shared/entities';
import { jacobWeeklyPlan, mykidKindergarten } from './dashboardModel';

export type FamilyMessageSource = 'Jacob' | 'Nicolai';

export interface FamilyMessage {
  id: string;
  source: FamilyMessageSource;
  title: string;
  body: string;
  publishedAt?: string;
}

export interface FamilyReadReceipt {
  id: string;
  readAt: string;
}

export const familyReceiptStorageKey = 'smarthjem-family-message-reads-v1';

const osloDateFormatter = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeZone: 'Europe/Oslo' });
const osloDateTimeFormatter = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' });

export const formatFamilyMessageDate = (value: string | undefined): string => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Ukjent dato';
  // A date without a time is a calendar date, not midnight UTC. Use noon UTC
  // so it remains the same date when formatted for Oslo.
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return osloDateFormatter.format(new Date(`${value}T12:00:00Z`));
  return osloDateTimeFormatter.format(new Date(value));
};

const normalizedText = (value: string): string => value.normalize('NFC').replace(/\s+/gu, ' ').trim();

// FNV-1a over UTF-16 code units is deterministic in every supported browser.
const browserHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const publishedAt = (item: MyKidKindergartenItem): string | undefined => item.published_at ?? item.date;
const mykidId = (item: MyKidKindergartenItem): string => item.id ?? `mykid-${browserHash([
  'Nicolai', item.published_at ?? '', item.title, item.details ?? '',
].map(normalizedText).join('\u0000'))}`;
const validTime = (value: string | undefined): number => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

const mykidMessages = (items: MyKidKindergartenItem[]): FamilyMessage[] => items.map((item) => ({
  id: mykidId(item),
  source: 'Nicolai',
  title: normalizedText(item.title),
  body: normalizedText(item.details ?? item.title),
  ...(publishedAt(item) ? { publishedAt: publishedAt(item) } : {}),
}));

const mykidTodayMessage = (items: MyKidKindergartenItem[]): FamilyMessage[] => {
  const body = items.map((item) => normalizedText(item.details ?? item.title)).filter(Boolean).join('\n\n');
  if (!body) return [];
  const published = items.map(publishedAt).find((value): value is string => !!value);
  return [{
    id: `mykid-today-${browserHash(items.map((item) => [item.id ?? '', item.published_at ?? item.date ?? '', item.title, item.details ?? ''].map(String).map(normalizedText).join('\u0000')).join('\u0001'))}`,
    source: 'Nicolai',
    title: 'Dagen min',
    body,
    ...(published ? { publishedAt: published } : {}),
  }];
};

export const familyMessages = (states: Record<string, HomeAssistantState>): FamilyMessage[] => {
  const mykid = mykidKindergarten(states.mykidKindergarten);
  const jacob = jacobWeeklyPlan(states.jacobWeeklyPlan);
  const nicolai = mykidMessages([
    ...(mykid?.noticeboard ?? []),
    ...(mykid?.newsletters ?? []),
    ...(mykid?.weeklyPlans ?? []),
    ...(mykid?.events ?? []),
  ]).concat(mykidTodayMessage(mykid?.today ?? []));
  const jacobMessages = (jacob?.messages ?? []).flatMap((message): FamilyMessage[] => {
    const body = normalizedText(message);
    if (!body) return [];
    return [{
      id: `jacob-${browserHash(normalizedText(`Jacob\u0000${body}`))}`,
      source: 'Jacob',
      title: body,
      body,
      ...(jacob?.source_updated_at ? { publishedAt: jacob.source_updated_at } : {}),
    }];
  });
  const unique = new Map<string, FamilyMessage>();
  [...nicolai, ...jacobMessages]
    .sort((left, right) => validTime(right.publishedAt) - validTime(left.publishedAt))
    .forEach((message) => { if (!unique.has(message.id)) unique.set(message.id, message); });
  return [...unique.values()];
};

const cutoff = (now: Date): number => now.getTime() - 365 * 24 * 60 * 60 * 1_000;
const validReceipt = (value: unknown, now: Date): FamilyReadReceipt | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.id !== 'string' || !receipt.id || typeof receipt.readAt !== 'string') return undefined;
  const readAt = Date.parse(receipt.readAt);
  return Number.isFinite(readAt) && readAt >= cutoff(now) ? { id: receipt.id, readAt: receipt.readAt } : undefined;
};

const cleanReceipts = (receipts: unknown, now: Date): FamilyReadReceipt[] => {
  if (!Array.isArray(receipts)) return [];
  const unique = new Map<string, FamilyReadReceipt>();
  for (const candidate of receipts) {
    const receipt = validReceipt(candidate, now);
    if (!receipt) continue;
    const previous = unique.get(receipt.id);
    if (!previous || Date.parse(receipt.readAt) >= Date.parse(previous.readAt)) unique.set(receipt.id, receipt);
  }
  return [...unique.values()];
};

const browserStorage = (): Storage | undefined => {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
};

export const readFamilyReceipts = (storage: Storage | undefined = browserStorage(), now = new Date()): FamilyReadReceipt[] => {
  if (!storage) return [];
  try {
    const value = storage.getItem(familyReceiptStorageKey);
    if (!value) return [];
    const clean = cleanReceipts(JSON.parse(value), now);
    const canonical = JSON.stringify(clean);
    if (value !== canonical) {
      try { storage.setItem(familyReceiptStorageKey, canonical); } catch { /* Reading remains available when device storage is full or disabled. */ }
    }
    return clean;
  } catch {
    return [];
  }
};

export const writeFamilyReceipts = (receipts: FamilyReadReceipt[], storage: Storage | undefined = browserStorage(), now = new Date()): FamilyReadReceipt[] => {
  const clean = cleanReceipts(receipts, now);
  if (!storage) return clean;
  try { storage.setItem(familyReceiptStorageKey, JSON.stringify(clean)); } catch { /* Device storage is optional presentation state. */ }
  return clean;
};

export const setFamilyMessageRead = (receipts: FamilyReadReceipt[], id: string, read: boolean, now = new Date()): FamilyReadReceipt[] => {
  const withoutMessage = cleanReceipts(receipts, now).filter((receipt) => receipt.id !== id);
  return read ? [...withoutMessage, { id, readAt: now.toISOString() }] : withoutMessage;
};
