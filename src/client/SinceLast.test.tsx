import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, ActivityPayload, AwayCapture } from '../shared/activity';
import type { FamilyMessage } from './familyInbox';
import { ActivityTimeline, AwayCaptureCard, FamilyInboxCard, SinceLast } from './SinceLast';

const mediaPath = '/api/activity/review/01234567-89ab-4cde-8123-456789abcdef/preview';
const thumbnailPath = mediaPath.replace('/preview', '/thumbnail');
const event: ActivityEvent = { id: 'capture', kind: 'frigate', occurredAt: '2026-09-10T12:50:00Z', title: 'Bil registrert', detail: 'Parkering · Gårdsplassen', tone: 'default', mediaPath };
const available: AwayCapture = { status: 'available', event, mediaPath, thumbnailPath };
const now = new Date('2026-09-12T00:30:00+02:00');
const messages: FamilyMessage[] = [
  { id: 'old', source: 'Jacob', title: 'Eldre beskjed', body: 'Eldre tekst', publishedAt: '2026-09-08T12:00:00Z' },
  { id: 'read', source: 'Jacob', title: 'Allerede lest', body: 'Lest tekst', publishedAt: '2026-09-12T00:00:00+02:00' },
  { id: 'new', source: 'Nicolai', title: 'Ny beskjed', body: 'Hele den nye beskjeden', publishedAt: '2026-09-11T23:50:00+02:00' },
  { id: 'middle', source: 'Jacob', title: 'Husk gymtøy', body: 'Ta med gymtøy', publishedAt: '2026-09-08T23:00:00+02:00' },
];
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(['away', 'timeline'] as const)('%s recording activation', (surface) => {
  const show = () => render(surface === 'away' ? <AwayCaptureCard capture={available}/> : <ActivityTimeline events={[event]}/>);

  it('starts the issued recording only after the user presses play', () => {
    const { container } = show();
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Spill av opptak fra/ }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.instances[0]).toBe(container.querySelector('video'));
    expect(container.querySelector('video')).toHaveAttribute('src', mediaPath);
    expect(container.querySelector('video')).toHaveFocus();
  });

  it.each(['reject', 'throw'] as const)('keeps native playback controls usable when play fails via %s', async (mode) => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    if (mode === 'reject') play.mockRejectedValueOnce(new DOMException('User activation required', 'NotAllowedError'));
    else play.mockImplementationOnce(() => { throw new DOMException('Playback interrupted', 'AbortError'); });
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: /Spill av opptak fra/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Avspillingen startet ikke. Prøv avspillingsknappen i videoen.'));
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('src', mediaPath);
    expect(video).toHaveFocus();
    expect(screen.queryByText('Opptaket er ikke lenger tilgjengelig')).not.toBeInTheDocument();
    fireEvent.play(video);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('AwayCaptureCard', () => {
  it('shows event context in Oslo time and plays only the issued same-origin media after activation', () => {
    const { container } = render(<AwayCaptureCard capture={available}/>);
    expect(screen.getByRole('heading', { name: 'SIST MENS HUSET VAR BORTE' })).toBeInTheDocument();
    expect(screen.getByText('Bil registrert')).toBeInTheDocument();
    expect(screen.getByText('Parkering · Gårdsplassen')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveTextContent('14:50');
    expect(screen.getByRole('img')).toHaveAttribute('src', thumbnailPath);
    expect(container.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Spill av opptak fra.*Gårdsplassen/ }));
    expect(container.querySelector('video')).toHaveAttribute('src', mediaPath);
    expect(container.querySelector('video')).toHaveAttribute('controls');
    expect(container.querySelector('video')).not.toHaveAttribute('autoplay');
    expect(container.querySelector('video')).toHaveFocus();
  });

  it.each([
    ['expired', 'Opptaket er ikke lenger tilgjengelig'],
    ['none', 'Ingen registrerte hendelser mens huset var borte'],
    ['unavailable', 'Kunne ikke hente hendelser fra sist huset var borte'],
  ] as const)('explains %s without a media request or play control', (status, copy) => {
    const { container } = render(<AwayCaptureCard capture={{ ...available, status, thumbnailPath: undefined }}/>);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Spill av/ })).not.toBeInTheDocument();
    expect(container.querySelector('video, img')).toBeNull();
    if (status === 'expired') expect(screen.getByText('Bil registrert')).toBeInTheDocument();
  });

  it('keeps the safe thumbnail and event context when the recording has expired', () => {
    const { container } = render(<AwayCaptureCard capture={{ ...available, status: 'expired', mediaPath: undefined }}/>);
    expect(screen.getByRole('img')).toHaveAttribute('src', thumbnailPath);
    expect(screen.getByText('Bil registrert')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveTextContent('14:50');
    expect(screen.getByText('Opptaket er ikke lenger tilgjengelig')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Spill av/ })).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Opptaket er ikke lenger tilgjengelig')).toBeInTheDocument();
  });

  it.each(['https://camera.invalid/thumbnail', '//camera.invalid/thumbnail', `${thumbnailPath}?url=secret`])('rejects unsafe expired thumbnails: %s', (path) => {
    render(<AwayCaptureCard capture={{ ...available, status: 'expired', mediaPath: undefined, thumbnailPath: path }}/>);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Opptaket er ikke lenger tilgjengelig')).toBeInTheDocument();
  });

  it('reserves loading geometry without flashing empty or unavailable copy', () => {
    render(<AwayCaptureCard loading/>);
    expect(screen.getByRole('region', { name: 'SIST MENS HUSET VAR BORTE' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Henter hendelser');
    expect(screen.queryByText(/Ingen registrerte|Kunne ikke/)).not.toBeInTheDocument();
  });

  it.each(['https://camera.invalid/video', '//camera.invalid/video', '/api/camera/stream', `${mediaPath}?url=secret`])('never renders an unsafe media path: %s', (path) => {
    const { container } = render(<AwayCaptureCard capture={{ ...available, mediaPath: path, thumbnailPath: path }}/>);
    expect(container.querySelector('video, img')).toBeNull();
    expect(screen.queryByRole('button', { name: /Spill av/ })).not.toBeInTheDocument();
    expect(screen.getByText('Opptaket er ikke lenger tilgjengelig')).toBeInTheDocument();
  });

  it('recovers from thumbnail failure and removes play after recording failure', () => {
    const { container } = render(<AwayCaptureCard capture={available}/>);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Spill av/ }));
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByText('Opptaket er ikke lenger tilgjengelig')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: /Spill av/ })).not.toBeInTheDocument();
  });
});

describe('FamilyInboxCard', () => {
  it('shows two newest unread previews and the combined count, and opens the selected message without reading it', () => {
    const open = vi.fn();
    render(<FamilyInboxCard messages={messages} receipts={[{ id: 'read', readAt: now.toISOString() }]} onOpen={open} now={now}/>);
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Nicolai');
    expect(rows[0]).toHaveTextContent('Ny beskjed');
    expect(rows[0]).toHaveTextContent('i går');
    expect(rows[1]).toHaveTextContent('Husk gymtøy');
    expect(rows[1]).toHaveTextContent('4 dager');
    expect(screen.getByText('3 uleste')).toBeInTheDocument();
    expect(screen.queryByText('Allerede lest')).not.toBeInTheDocument();
    expect(screen.queryByText('Eldre beskjed')).not.toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByRole('button'));
    expect(open).toHaveBeenCalledWith('new');
    fireEvent.click(screen.getByRole('button', { name: 'Se alle beskjeder' }));
    expect(open).toHaveBeenLastCalledWith();
  });

  it('keeps the full inbox reachable when no unread messages remain', () => {
    render(<FamilyInboxCard messages={messages} receipts={messages.map(({ id }) => ({ id, readAt: now.toISOString() }))} onOpen={() => {}} now={now}/>);
    expect(screen.getByText('Ingen uleste beskjeder')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se alle beskjeder' })).toBeEnabled();
  });

  it.each([
    ['2026-03-30T00:10:00+02:00', '2026-03-28T23:50:00+01:00', 'i forgårs'],
    ['2026-10-26T00:10:00+01:00', '2026-10-25T00:05:00+02:00', 'i går'],
    ['2026-09-12T00:10:00+02:00', 'invalid', 'Ukjent dato'],
  ])('uses Oslo calendar days across DST and tolerates missing dates (%s)', (current, publishedAt, expected) => {
    render(<FamilyInboxCard messages={[{ ...messages[0], publishedAt }]} receipts={[]} onOpen={() => {}} now={new Date(current)}/>);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('ActivityTimeline', () => {
  const events: ActivityEvent[] = Array.from({ length: 7 }, (_, index) => ({ id: `row-${index}`, kind: 'home', occurredAt: `2026-09-11T${10 + index}:00:00Z`, title: `Hendelse ${index}`, tone: 'default', mediaPath }));
  it('shows five newest rows and opens a labelled full timeline with keyboard dismissal and focus return', () => {
    render(<ActivityTimeline events={events}/>);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Hendelse 6');
    expect(screen.queryByText('Hendelse 0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Spill av/ })).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'Se alle hendelser' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Hendelser' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(7);
    expect(within(dialog).getByRole('button', { name: 'Lukk' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.querySelector('.ppf-activity-modal-body')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(within(dialog).getByRole('button', { name: 'Lukk' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('only offers playback on matched Frigate rows and never on informational events', () => {
    const { container } = render(<ActivityTimeline events={[event, { ...event, id: 'no-media', title: 'Person registrert', mediaPath: undefined }, events[0]]}/>);
    expect(screen.queryByRole('button', { name: 'Se alle hendelser' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Spill av/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Spill av/ }));
    expect(container.querySelector('video')).toHaveAttribute('src', mediaPath);
  });

  it('distinguishes initial loading from confirmed empty events', () => {
    const { rerender } = render(<ActivityTimeline events={[]} loading/>);
    expect(screen.queryByText('Ingen nye hendelser')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hendelser' })).toHaveAttribute('aria-busy', 'true');
    rerender(<ActivityTimeline events={[]}/>);
    expect(screen.getByText('Ingen nye hendelser')).toBeInTheDocument();
  });
});

it('keeps family messages usable independently of failed activity and preserves module order', () => {
  const activity: ActivityPayload = { generatedAt: now.toISOString(), awayCapture: { status: 'unavailable' }, timeline: [] };
  render(<SinceLast activity={activity} messages={messages} receipts={[]} onOpenFamily={() => {}} now={now}/>);
  expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['SIST MENS HUSET VAR BORTE', 'Beskjeder', 'Hendelser']);
  expect(screen.getByText('Kunne ikke hente hendelser fra sist huset var borte')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Se alle beskjeder' })).toBeEnabled();
});

it('shows loading in all three modules until initial activity resolves without flashing empty family copy', () => {
  const props = { messages: [], receipts: [], onOpenFamily: () => {}, now };
  const { rerender } = render(<SinceLast {...props} activityLoading/>);
  const regions = screen.getAllByRole('region');
  expect(regions).toHaveLength(3);
  for (const region of regions) {
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(within(region).getByRole('status')).toBeInTheDocument();
  }
  expect(screen.queryByText('Ingen uleste beskjeder')).not.toBeInTheDocument();
  expect(screen.queryByText('0 uleste')).not.toBeInTheDocument();
  rerender(<SinceLast {...props} activityLoading={false} activity={{ generatedAt: now.toISOString(), awayCapture: { status: 'none' }, timeline: [] }}/>);
  expect(screen.getByText('Ingen uleste beskjeder')).toBeInTheDocument();
  expect(screen.getByText('Ingen nye hendelser')).toBeInTheDocument();
  for (const region of screen.getAllByRole('region')) expect(region).toHaveAttribute('aria-busy', 'false');
});

it('keeps confirmed unread messages actionable while the initial activity request is loading', () => {
  const onOpenFamily = vi.fn();
  const props = { messages: [messages[2]], receipts: [], onOpenFamily, now };
  const { rerender } = render(<SinceLast {...props} activityLoading/>);
  const family = screen.getByRole('region', { name: 'Beskjeder' });
  expect(family).toHaveAttribute('aria-busy', 'true');
  expect(within(family).getByText('1 ulest')).toBeInTheDocument();
  fireEvent.click(within(family).getByRole('button', { name: 'Åpne beskjed: Ny beskjed · Nicolai' }));
  expect(onOpenFamily).toHaveBeenCalledWith('new');
  rerender(<SinceLast {...props} activityLoading={false}/>);
  expect(family).toHaveAttribute('aria-busy', 'false');
  expect(within(family).getByText('Ny beskjed')).toBeInTheDocument();
});
