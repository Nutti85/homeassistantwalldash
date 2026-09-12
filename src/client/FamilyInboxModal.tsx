import { useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { JacobWeeklyPlanSnapshot, MyKidKindergartenSnapshot } from '../shared/entities';
import type { FamilyMessage, FamilyMessageSource, FamilyReadReceipt } from './familyInbox';
const dayKey = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
type FamilyMessageFreshness = 'today' | 'dated' | 'persistent';
const osloWeekday = (date: Date): string => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', weekday: 'short' }).format(date);
export const isStaleFamilyItem = (item: { title: string; details?: string; date?: string }, freshness: FamilyMessageFreshness, now: Date): boolean => {
  const content = `${item.title} ${item.details ?? ''}`;
  if (/\bgod\s+helg\b/i.test(content) && !['Fri', 'Sat', 'Sun'].includes(osloWeekday(now))) return true;
  if (freshness === 'today' && item.date && !Number.isNaN(Date.parse(item.date))) return dayKey(new Date(item.date)) !== dayKey(now);
  if (freshness === 'dated' && item.date && !Number.isNaN(Date.parse(item.date))) return dayKey(new Date(item.date)) < dayKey(now);
  return false;
};

const weekdayNames = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const planWeekNumber = (value: string | undefined): number | undefined => {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
};
const planItemWhen = (item: JacobWeeklyPlanSnapshot['events'][number]): string => {
  const weekday = item.weekday?.toLocaleLowerCase('nb-NO').match(/søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag/)?.[0];
  if (weekday) return weekday;
  if (!item.date || Number.isNaN(Date.parse(item.date))) return '';
  return weekdayNames[new Date(`${item.date}T12:00:00`).getDay()];
};
const weekdayOrder = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const chronologicalPlanItems = (items: JacobWeeklyPlanSnapshot['events']): JacobWeeklyPlanSnapshot['events'] => [...items].sort((left, right) => {
  const leftOrder = weekdayOrder.indexOf(planItemWhen(left));
  const rightOrder = weekdayOrder.indexOf(planItemWhen(right));
  return (leftOrder === -1 ? weekdayOrder.length : leftOrder) - (rightOrder === -1 ? weekdayOrder.length : rightOrder);
});
const localDayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const mykidDetailSections = (plan: MyKidKindergartenSnapshot, now = new Date()) => {
  const today = localDayKey(now);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDayKey(tomorrow);
  const dated = (date: string) => plan.events.filter((item) => item.date?.slice(0, 10) === date);
  const newsletters = [...plan.newsletters].sort((left, right) => Date.parse(right.published_at ?? right.date ?? '') - Date.parse(left.published_at ?? left.date ?? ''));
  return {
    today: [...plan.today.filter((item) => !isStaleFamilyItem(item, 'today', now)), ...dated(today)].filter((item, index, items) => items.findIndex((candidate) => `${candidate.date ?? ''}-${candidate.title}` === `${item.date ?? ''}-${item.title}`) === index),
    tomorrow: dated(tomorrowKey),
    upcoming: plan.events.filter((item) => item.date?.slice(0, 10) !== today && item.date?.slice(0, 10) !== tomorrowKey),
    newsletters,
  };
};

export function FamilyDetailBody({ source, jacob, nicolai }: { source: FamilyMessageSource; jacob?: JacobWeeklyPlanSnapshot; nicolai?: MyKidKindergartenSnapshot }) {
  const plan = source === 'Jacob' ? jacob : nicolai;
  if (!plan) return <p className="ppf-family-detail-empty">Ingen {source === 'Jacob' ? 'skoleplan' : 'MyKid-informasjon'} er tilgjengelig ennå.</p>;

  const renderJacobItems = (items: JacobWeeklyPlanSnapshot['events']) => items.length ? <ul className="ppf-family-detail-list">{chronologicalPlanItems(items).map((item, index) => <li key={`${item.date ?? item.weekday ?? 'item'}-${item.title}-${index}`}><span>{item.subject ?? planItemWhen(item)}</span><strong>{item.title}</strong>{item.details && <p>{item.details}</p>}</li>)}</ul> : <p className="ppf-family-detail-empty">Ingen oppføringer.</p>;
  const renderMyKidItems = (items: MyKidKindergartenSnapshot['events']) => items.length ? <ul className="ppf-family-detail-list">{items.map((item, index) => <li key={`${item.date ?? 'item'}-${item.title}-${index}`}><span>{item.date ?? item.time ?? ''}</span><strong>{item.title}</strong>{item.details && <p>{item.details}</p>}</li>)}</ul> : <p className="ppf-family-detail-empty">Ingen oppføringer.</p>;

  if (source === 'Jacob') {
    const jacob = plan as JacobWeeklyPlanSnapshot;
    return <div className="ppf-family-detail-body">{jacob.summary && <p className="ppf-family-detail-summary">{jacob.summary}</p>}<section><h3>Skoledager</h3>{jacob.school_schedule.length ? <ul className="ppf-family-detail-schedule">{jacob.school_schedule.map((item, index) => <li key={`${item.title}-${index}`}><strong>{weekdayNames[index + 1] ?? `Dag ${index + 1}`}</strong><span>{item.time ?? item.title}</span>{item.details && <p>{item.details}</p>}</li>)}</ul> : <p className="ppf-family-detail-empty">Ingen timeplan.</p>}</section><section><h3>Hendelser</h3>{renderJacobItems(jacob.events)}</section><section><h3>Påminnelser</h3>{renderJacobItems(jacob.reminders)}</section><section><h3>Lekser</h3>{renderJacobItems(jacob.homework)}</section><section><h3>Temaer</h3>{jacob.topics.length ? <ul className="ppf-family-detail-notes">{jacob.topics.map((topic, index) => <li key={`${topic}-${index}`}>{topic}</li>)}</ul> : <p className="ppf-family-detail-empty">Ingen temaer.</p>}</section><section><h3>Meldinger til hjemmet</h3>{jacob.messages.length ? <ul className="ppf-family-detail-notes">{jacob.messages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul> : <p className="ppf-family-detail-empty">Ingen meldinger.</p>}</section></div>;
  }

  const mykid = plan as MyKidKindergartenSnapshot;
  const sections = mykidDetailSections(mykid);
  return <div className="ppf-family-detail-body">{mykid.summary && <p className="ppf-family-detail-summary">{mykid.summary}</p>}<section><h3>I dag</h3>{renderMyKidItems(sections.today)}</section><section><h3>I morgen</h3>{renderMyKidItems(sections.tomorrow)}</section><section><h3>Oppslagstavle</h3>{renderMyKidItems(mykid.noticeboard)}</section><section><h3>Siste nyhetsbrev</h3>{renderMyKidItems(sections.newsletters)}</section><section><h3>Kommende hendelser</h3>{renderMyKidItems(sections.upcoming)}</section><section><h3>Ukeplaner</h3>{renderMyKidItems(mykid.weeklyPlans)}</section><section><h3>Bursdager</h3>{renderMyKidItems(mykid.birthdays)}</section></div>;
}

export const familyDetailTitle = (source: FamilyMessageSource, plan?: JacobWeeklyPlanSnapshot): string => {
  if (source === 'Nicolai') return 'MyKid · full oversikt';
  const firstDatedItem = plan && [...plan.events, ...plan.reminders, ...plan.homework].find((item) => item.date)?.date;
  const week = planWeekNumber(plan?.week_start ?? firstDatedItem);
  return week === undefined ? 'Jacobs skoleplan' : `Jacobs skoleplan – uke ${week}`;
};

export type FamilyInboxTab = 'messages' | 'Jacob' | 'Nicolai';
export type FamilyMessageFilter = 'unread' | 'all';

export interface FamilyInboxModalProps {
  messages: FamilyMessage[];
  receipts: FamilyReadReceipt[];
  jacob?: JacobWeeklyPlanSnapshot;
  nicolai?: MyKidKindergartenSnapshot;
  openTab: FamilyInboxTab;
  onTabChange: (tab: FamilyInboxTab) => void;
  messageFilter: FamilyMessageFilter;
  onFilterChange: (filter: FamilyMessageFilter) => void;
  selectedMessageId?: string;
  onSelectMessage: (id: string | undefined) => void;
  onReadChange: (id: string, read: boolean) => void;
  onClose: () => void;
}

const familyTabs: Array<{ value: FamilyInboxTab; label: string; source?: string }> = [
  { value: 'messages', label: 'Beskjeder' },
  { value: 'Jacob', label: 'Jacob', source: 'Zokrates' },
  { value: 'Nicolai', label: 'Nicolai', source: 'MyKid' },
];
const filters: Array<{ value: FamilyMessageFilter; label: string }> = [
  { value: 'unread', label: 'Ulest' }, { value: 'all', label: 'Alle' },
];

function moveTab<Value extends string>(event: KeyboardEvent<HTMLButtonElement>, values: Value[], value: Value, change: (value: Value) => void) {
  const index = values.indexOf(value);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1
    : event.key === 'ArrowRight' ? (index + 1) % values.length
      : event.key === 'ArrowLeft' ? (index + values.length - 1) % values.length : undefined;
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  change(values[next]);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}

// Mount while open. The caller owns selection and receipts so the dashboard and
// modal share one read state; person snapshots never pass through that filter.
export function FamilyInboxModal({ messages, receipts, jacob, nicolai, openTab, onTabChange, messageFilter, onFilterChange, selectedMessageId, onSelectMessage, onReadChange, onClose }: FamilyInboxModalProps) {
  const id = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const readIds = new Set(receipts.map((receipt) => receipt.id));
  const visibleMessages = messages.filter((message) => messageFilter === 'all' || !readIds.has(message.id));
  const selected = visibleMessages.find((message) => message.id === selectedMessageId);

  useLayoutEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeRef.current?.focus();
    const containFocus = (event: FocusEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) closeRef.current?.focus();
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeCallback.current();
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const stops = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
        .filter((node) => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert], [aria-hidden="true"]'));
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('focusin', containFocus);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('focusin', containFocus);
      document.removeEventListener('keydown', handleKey, true);
      if (invoker?.isConnected) invoker.focus();
    };
  }, []);

  // A read action or refreshed snapshot can remove the focused row/control.
  // Recover focus without resetting it for ordinary controlled prop updates.
  useLayoutEffect(() => {
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) closeRef.current?.focus();
  }, [openTab, messageFilter, selected, messages]);

  return <div className="ppf-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="ppf-modal ppf-family-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <header><span className="material-symbols-outlined" aria-hidden="true">mark_email_unread</span><h2 id={`${id}-title`}>Beskjeder</h2><button ref={closeRef} type="button" aria-label="Lukk" onClick={onClose}><span className="material-symbols-outlined" aria-hidden="true">close</span></button></header>
      <div className="ppf-family-tabs" role="tablist" aria-label="Familie">
        {familyTabs.map((tab) => <button key={tab.value} type="button" role="tab" id={`${id}-tab-${tab.value}`} aria-controls={`${id}-panel-${tab.value}`} aria-selected={openTab === tab.value} tabIndex={openTab === tab.value ? 0 : -1} onClick={() => onTabChange(tab.value)} onKeyDown={(event) => moveTab(event, familyTabs.map((item) => item.value), tab.value, onTabChange)}><span>{tab.label}</span>{tab.source && <small>{tab.source}</small>}</button>)}
      </div>
      {familyTabs.map((tab) => <div key={tab.value} className="ppf-family-panel" role="tabpanel" id={`${id}-panel-${tab.value}`} aria-labelledby={`${id}-tab-${tab.value}`} hidden={openTab !== tab.value} tabIndex={0}>
        {openTab === tab.value && (tab.value === 'messages' ? <>
          <p className="ppf-family-helper">Leste meldinger fjernes fra forsiden, men er fortsatt tilgjengelige her.</p>
          <div className="ppf-family-filters" role="tablist" aria-label="Filtrer beskjeder">
            {filters.map((filter) => <button key={filter.value} type="button" role="tab" id={`${id}-filter-${filter.value}`} aria-controls={`${id}-filter-panel-${filter.value}`} aria-selected={messageFilter === filter.value} tabIndex={messageFilter === filter.value ? 0 : -1} onClick={() => onFilterChange(filter.value)} onKeyDown={(event) => moveTab(event, filters.map((item) => item.value), filter.value, onFilterChange)}>{filter.label}</button>)}
          </div>
          {filters.map((filter) => <div key={filter.value} className="ppf-family-inbox" role="tabpanel" id={`${id}-filter-panel-${filter.value}`} aria-labelledby={`${id}-filter-${filter.value}`} hidden={messageFilter !== filter.value} tabIndex={0}>
            {messageFilter === filter.value && <>
              {visibleMessages.length ? <ul className="ppf-family-message-list" aria-label="Beskjeder">{visibleMessages.map((message) => <li key={message.id}><button type="button" aria-label={`Åpne beskjed: ${message.title} · ${message.source} · ${readIds.has(message.id) ? 'Lest' : 'Ulest'}`} aria-pressed={selected?.id === message.id} onClick={() => onSelectMessage(message.id)}>
                <span className={`ppf-source ppf-source-${message.source.toLowerCase()}`}>{message.source}</span>
                <strong>{message.title}</strong><span className="ppf-family-read-status">{readIds.has(message.id) ? 'Lest' : 'Ulest'}</span>
              </button></li>)}</ul> : <p className="ppf-family-detail-empty" role="status">{messageFilter === 'unread' ? 'Ingen uleste beskjeder' : 'Ingen beskjeder er tilgjengelige ennå'}</p>}
              {selected && <article className="ppf-family-message-detail" aria-labelledby={`${id}-subject`}>
                <span className={`ppf-source ppf-source-${selected.source.toLowerCase()}`}>{selected.source}</span>
                <h3 id={`${id}-subject`}>{selected.title}</h3><p>{selected.body}</p>
                <button type="button" className="ppf-family-read-action" aria-label={`${readIds.has(selected.id) ? 'Marker som ulest' : 'Marker som lest'}: ${selected.title}`} onClick={() => onReadChange(selected.id, !readIds.has(selected.id))}>{readIds.has(selected.id) ? 'Marker som ulest' : 'Marker som lest'}</button>
              </article>}
            </>}
          </div>)}
        </> : <><p className="ppf-family-person-title">{familyDetailTitle(tab.value, jacob)}</p><FamilyDetailBody source={tab.value} jacob={jacob} nicolai={nicolai}/></>)}
      </div>)}
    </section>
  </div>;
}
