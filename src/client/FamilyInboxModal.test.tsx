import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JacobWeeklyPlanSnapshot, MyKidKindergartenSnapshot } from '../shared/entities';
import { FamilyInboxModal, type FamilyInboxTab, type FamilyMessageFilter } from './FamilyInboxModal';
import { setFamilyMessageRead, type FamilyMessage, type FamilyReadReceipt } from './familyInbox';

const messages: FamilyMessage[] = [
  { id: 'internal-jacob', source: 'Jacob', title: 'Husk innesko', body: 'Husk innesko og drikkeflaske. Hele beskjeden til hjemmet.', publishedAt: '2026-09-10T08:00:00Z' },
  { id: 'internal-nicolai', source: 'Nicolai', title: 'Turdag', body: 'Vi går på tur til skogen. Ta med varme klær.', publishedAt: '2026-09-09T08:00:00Z' },
];
const jacob: JacobWeeklyPlanSnapshot = {
  summary: 'En spennende skoleuke.', week_start: '2026-09-07',
  school_schedule: [{ title: 'Skole', time: '08:30–13:00', details: 'Oppmøte ved klasserommet.' }],
  events: [{ title: 'Fredagstur', weekday: 'fredag', details: 'Vi besøker biblioteket.' }, { title: 'Mandagssamling', weekday: 'mandag' }],
  reminders: [{ title: 'Husk gymtøy', weekday: 'tirsdag', details: 'Innesko i posen.' }],
  homework: [{ title: 'Les side 10', subject: 'Norsk', details: 'Les høyt hjemme.' }],
  topics: ['Brøk og geometri'], messages: [messages[0].body],
};
const nicolai: MyKidKindergartenSnapshot = {
  summary: 'Nyheter fra barnehagen.', health: 'ok',
  today: [{ title: 'Maling i dag', date: '2026-09-11', details: 'Vi maler med høstfarger.' }],
  events: [{ title: 'Tur i morgen', date: '2026-09-12', details: 'Ta med sekk.' }, { title: 'Foreldremøte', date: '2026-09-20', details: 'Møt på avdelingen.' }],
  noticeboard: [{ title: messages[1].title, details: messages[1].body }],
  newsletters: [{ title: 'Nyhetsbrev september', published_at: '2026-09-10', details: 'Alle detaljene fra måneden.' }],
  weeklyPlans: [{ title: 'Ukeplan 37', details: 'Hele ukens aktiviteter.' }],
  birthdays: [{ title: 'Bursdag i gruppen', details: 'Vi feirer sammen.' }],
};

function Harness({ items = messages, missingPlans = false }: { items?: FamilyMessage[]; missingPlans?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FamilyInboxTab>('messages');
  const [filter, setFilter] = useState<FamilyMessageFilter>('unread');
  const [selected, setSelected] = useState<string>();
  const [receipts, setReceipts] = useState<FamilyReadReceipt[]>([]);
  return <><button onClick={() => setOpen(true)}>Se alle</button><button>Utenfor</button>{open && <FamilyInboxModal
    messages={items} receipts={receipts} jacob={missingPlans ? undefined : jacob} nicolai={missingPlans ? undefined : nicolai}
    openTab={tab} onTabChange={setTab} messageFilter={filter} onFilterChange={setFilter}
    selectedMessageId={selected} onSelectMessage={setSelected}
    onReadChange={(id, read) => setReceipts((current) => setFamilyMessageRead(current, id, read))}
    onClose={() => setOpen(false)}
  />}</>;
}

function openModal(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props}/>);
  const invoker = screen.getByRole('button', { name: 'Se alle' });
  invoker.focus();
  fireEvent.click(invoker);
  return invoker;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T10:00:00+02:00')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('FamilyInboxModal', () => {
  it('offers the ordered person tabs and explicit reversible read state without auto-reading detail', () => {
    openModal();
    const dialog = screen.getByRole('dialog', { name: 'Beskjeder' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const tabs = within(screen.getByRole('tablist', { name: 'Familie' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Beskjeder', 'JacobZokrates', 'NicolaiMyKid']);
    expect(screen.getByRole('tab', { name: 'Ulest' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Leste meldinger fjernes fra forsiden, men er fortsatt tilgjengelige her.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Åpne beskjed: Husk innesko/ }));
    expect(screen.getByText(messages[0].body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marker som lest: Husk innesko' })).toHaveTextContent('Marker som lest');
    fireEvent.click(screen.getByRole('tab', { name: 'Alle' }));
    expect(screen.queryByText('Lest', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marker som lest: Husk innesko' }));
    const list = screen.getByRole('list', { name: 'Beskjeder' });
    expect(within(list).getByText('Lest')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Åpne beskjed: Husk innesko · Jacob · Lest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marker som ulest: Husk innesko' })).toHaveTextContent('Marker som ulest');
    fireEvent.click(screen.getByRole('tab', { name: 'Ulest' }));
    expect(screen.queryByRole('button', { name: /Åpne beskjed: Husk innesko/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Alle' }));
    fireEvent.click(screen.getByRole('button', { name: /Åpne beskjed: Husk innesko/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Marker som ulest: Husk innesko' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Ulest' }));
    expect(screen.getByRole('button', { name: /Åpne beskjed: Husk innesko/ })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('internal-jacob');
  });

  it('preserves every complete person section after every message is marked read', () => {
    openModal();
    for (const title of ['Husk innesko', 'Turdag']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Åpne beskjed: ${title}`) }));
      fireEvent.click(screen.getByRole('button', { name: `Marker som lest: ${title}` }));
    }
    expect(screen.getByText('Ingen uleste beskjeder')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Jacob Zokrates' }));
    const school = screen.getByRole('tabpanel', { name: 'Jacob Zokrates' });
    expect(within(school).getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual(['Skoledager', 'Hendelser', 'Påminnelser', 'Lekser', 'Temaer', 'Meldinger til hjemmet']);
    expect(school).toHaveTextContent('Jacobs skoleplan – uke 37');
    for (const text of ['En spennende skoleuke.', '08:30–13:00', 'Oppmøte ved klasserommet.', 'Vi besøker biblioteket.', 'Innesko i posen.', 'Les høyt hjemme.', 'Brøk og geometri', messages[0].body]) expect(within(school).getByText(text)).toBeInTheDocument();
    expect(within(school).getByText('Mandagssamling').compareDocumentPosition(within(school).getByText('Fredagstur')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Nicolai MyKid' }));
    const kindergarten = screen.getByRole('tabpanel', { name: 'Nicolai MyKid' });
    expect(within(kindergarten).getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual(['I dag', 'I morgen', 'Oppslagstavle', 'Siste nyhetsbrev', 'Kommende hendelser', 'Ukeplaner', 'Bursdager']);
    expect(kindergarten).toHaveTextContent('MyKid · full oversikt');
    for (const text of ['Nyheter fra barnehagen.', 'Vi maler med høstfarger.', 'Ta med sekk.', messages[1].body, 'Alle detaljene fra måneden.', 'Møt på avdelingen.', 'Hele ukens aktiviteter.', 'Vi feirer sammen.']) expect(within(kindergarten).getByText(text)).toBeInTheDocument();
  });

  it('distinguishes an empty inbox and absent person snapshots', () => {
    openModal({ items: [], missingPlans: true });
    expect(screen.getByText('Ingen uleste beskjeder')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Alle' }));
    expect(screen.getByText('Ingen beskjeder er tilgjengelige ennå')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Jacob Zokrates' }));
    expect(screen.getByText('Ingen skoleplan er tilgjengelig ennå.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Nicolai MyKid' }));
    expect(screen.getByText('Ingen MyKid-informasjon er tilgjengelig ennå.')).toBeInTheDocument();
  });

  it('moves initial focus to close and restores the invoker for every dismissal path', () => {
    const invoker = openModal();
    for (const method of ['escape', 'backdrop', 'close']) {
      expect(screen.getByRole('button', { name: 'Lukk' })).toHaveFocus();
      fireEvent.mouseDown(screen.getByRole('dialog'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      if (method === 'escape') fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      if (method === 'backdrop') fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
      if (method === 'close') fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(invoker).toHaveFocus();
      if (method !== 'close') fireEvent.click(invoker);
    }
  });

  it('keeps focus inside through wrapping, outside focus attempts and disappearing read controls', () => {
    openModal();
    const close = screen.getByRole('button', { name: 'Lukk' });
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    const lastRow = screen.getByRole('button', { name: /Åpne beskjed: Turdag/ });
    expect(lastRow).toHaveFocus();
    fireEvent.keyDown(lastRow, { key: 'Tab' });
    expect(close).toHaveFocus();
    screen.getByRole('button', { name: 'Utenfor' }).focus();
    expect(close).toHaveFocus();
    fireEvent.click(lastRow);
    const action = screen.getByRole('button', { name: 'Marker som lest: Turdag' });
    action.focus();
    fireEvent.click(action);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    expect(screen.queryByRole('button', { name: /Åpne beskjed: Turdag/ })).not.toBeInTheDocument();
  });

  it('uses roving tab stops with Arrow, Home and End keys in both tablists', () => {
    openModal();
    const tabs = within(screen.getByRole('tablist', { name: 'Familie' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[2]).toHaveFocus();
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
    const unread = screen.getByRole('tab', { name: 'Ulest' });
    unread.focus();
    fireEvent.keyDown(unread, { key: 'ArrowRight' });
    const all = screen.getByRole('tab', { name: 'Alle' });
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute('aria-selected', 'true');
    expect(unread).toHaveAttribute('tabindex', '-1');
    expect(document.getElementById(all.getAttribute('aria-controls')!)).toHaveAttribute('role', 'tabpanel');
    fireEvent.keyDown(all, { key: 'Home' });
    expect(unread).toHaveFocus();
  });
});
