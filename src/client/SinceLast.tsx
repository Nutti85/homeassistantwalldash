import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivityEvent, ActivityPayload, AwayCapture } from '../shared/activity';
import { formatFamilyMessageDate, type FamilyMessage, type FamilyReadReceipt } from './familyInbox';

const Icon = ({ children }: { children: string }) => <span className="material-symbols-outlined" aria-hidden="true">{children}</span>;
const validTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const localDate = (value: string) => validTime(value) === undefined ? 'Ukjent dato' : new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
// Only server-issued capabilities are ever handed to the browser media elements.
const safeMediaPath = (value: string | undefined, type: 'preview' | 'thumbnail') => value && new RegExp(`^/api/activity/review/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/${type}$`).test(value) ? value : undefined;
const expiredCopy = 'Opptaket er ikke lenger tilgjengelig';

function Module({ title, icon, children, loading = false, action, className = '' }: { title: string; icon: string; children: ReactNode; loading?: boolean; action?: ReactNode; className?: string }) {
  const id = useId();
  return <section className={`ppf-surface ppf-since-module ${className}`} aria-labelledby={id} aria-busy={loading}>
    <header><span className="ppf-surface-icon"><Icon>{icon}</Icon></span><h3 id={id}>{title}</h3>{action}</header>{children}
  </section>;
}

function Loading({ rows = 1, label = 'Henter hendelser' }: { rows?: number; label?: string }) {
  return <div className="ppf-since-loading" role="status"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <span className="ppf-since-skeleton" aria-hidden="true" key={index}/>)}</div>;
}

function RecordingDialog({ path, label, failed, onClose, onFailed }: { path: string; label: string; failed: boolean; onClose: () => void; onFailed: () => void }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  useLayoutEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (!failed) video.current?.focus(); else closeRef.current?.focus();
    let active = true;
    const cannotStart = () => { if (active) setPlaybackBlocked(true); };
    if (!failed) try { void video.current?.play()?.catch(cannotStart); } catch { cannotStart(); }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const stops: HTMLElement[] = [closeRef.current, video.current].filter((item): item is HTMLButtonElement | HTMLVideoElement => item !== null);
        const first = stops[0]; const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { active = false; document.removeEventListener('keydown', keydown, true); if (invoker?.isConnected) invoker.focus(); };
  }, [failed, onClose]);
  return <div className="ppf-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="ppf-modal ppf-recording-modal" role="dialog" aria-modal="true" aria-labelledby={id}><header><span><Icon>videocam</Icon></span><h2 id={id}>Opptak fra {label}</h2><button ref={closeRef} type="button" aria-label="Lukk opptak" onClick={onClose}><Icon>close</Icon></button></header><div>{failed ? <p className="ppf-since-state" role="status">{expiredCopy}</p> : <><video ref={video} tabIndex={0} src={path} controls playsInline preload="metadata" aria-label={`Opptak fra ${label}`} onPlay={() => setPlaybackBlocked(false)} onError={onFailed}/>{playbackBlocked && <p className="ppf-since-state" role="status">Avspillingen startet ikke. Prøv avspillingsknappen i videoen.</p>}</>}</div></section></div>;
}

function Recording({ path, thumbnail, label }: { path: string; thumbnail?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  if (failed && !open) return <p className="ppf-since-state" role="status">{expiredCopy}</p>;
  return <div className={`ppf-recording${thumbnail ? ' ppf-recording-preview' : ''}`}>
    {thumbnail && !thumbnailFailed && <img src={thumbnail} alt={`Siste registrering: ${label}`} onError={() => setThumbnailFailed(true)}/>}<button type="button" className="ppf-recording-play" aria-label={`Spill av opptak fra ${label}`} onClick={() => setOpen(true)}><Icon>play_arrow</Icon><span>Spill av</span></button>
    {open && <RecordingDialog path={path} label={label} failed={failed} onClose={() => setOpen(false)} onFailed={() => setFailed(true)}/>}
  </div>;
}

export function AwayCaptureCard({ capture, loading = false }: { capture?: AwayCapture; loading?: boolean }) {
  const [failedThumbnail, setFailedThumbnail] = useState<string>();
  const media = capture?.status === 'available' ? safeMediaPath(capture.mediaPath, 'preview') : undefined;
  const thumbnail = media || capture?.status === 'expired' ? safeMediaPath(capture?.thumbnailPath, 'thumbnail') : undefined;
  const event = capture?.event;
  const hasContext = event && (capture.status === 'available' || capture.status === 'expired');
  const copy = capture?.status === 'none' ? 'Ingen registrerte hendelser mens huset var borte'
    : !capture || capture.status === 'unavailable' ? 'Kunne ikke hente hendelser fra sist huset var borte' : expiredCopy;
  return <Module title="SIST MENS HUSET VAR BORTE" icon="history" className="ppf-away-capture" loading={loading && !capture}>
    {loading && !capture ? <Loading/> : <>
      {hasContext && <div className="ppf-away-context"><strong>{event.title}</strong>{event.detail && <span>{event.detail}</span>}<time dateTime={event.occurredAt}>{localDate(event.occurredAt)}</time></div>}
      {media && event ? <Recording key={media} path={media} thumbnail={thumbnail} label={`${event.detail ?? event.title} · ${localDate(event.occurredAt)}`}/> : <>
        {thumbnail && thumbnail !== failedThumbnail && event && <div className="ppf-recording ppf-recording-preview"><img src={thumbnail} alt={`Siste registrering: ${event.detail ?? event.title} · ${localDate(event.occurredAt)}`} onError={() => setFailedThumbnail(thumbnail)}/></div>}
        <p className="ppf-since-state">{copy}</p>
      </>}
    </>}
  </Module>;
}

interface FamilyInboxCardProps {
  messages: FamilyMessage[];
  receipts: FamilyReadReceipt[];
  onOpen: (id?: string) => void;
  now?: Date;
  loading?: boolean;
}

export function FamilyInboxCard({ messages, receipts, onOpen, loading = false }: FamilyInboxCardProps) {
  const readIds = new Set(receipts.map(({ id }) => id));
  const unread = messages.filter(({ id }) => !readIds.has(id)).sort((left, right) => (validTime(right.publishedAt) ?? 0) - (validTime(left.publishedAt) ?? 0));
  return <Module title="Beskjeder" icon="mark_email_unread" className="ppf-inbox-card" loading={loading} action={<button type="button" className="ppf-since-more" aria-label="Se alle beskjeder" onClick={() => onOpen()}>Se alle</button>}>
    {loading && !unread.length ? <Loading rows={2} label="Henter beskjeder"/> : <>
    <p className="ppf-unread-count" aria-live="polite">{unread.length} {unread.length === 1 ? 'ulest' : 'uleste'}</p>
    {unread.length ? <ol className="ppf-inbox-preview" aria-label="Uleste beskjeder">{unread.slice(0, 2).map((message) => <li key={message.id}><button type="button" aria-label={`Åpne beskjed: ${message.title} · ${message.source}`} onClick={() => onOpen(message.id)}><span className={`ppf-source ppf-source-${message.source.toLowerCase()}`}>{message.source}</span><strong>{message.title}</strong><time dateTime={validTime(message.publishedAt) === undefined ? undefined : message.publishedAt}>{formatFamilyMessageDate(message.publishedAt)}</time><Icon>chevron_right</Icon></button></li>)}</ol> : <p className="ppf-since-state">Ingen uleste beskjeder</p>}
    </>}
  </Module>;
}

function TimelineRows({ events }: { events: ActivityEvent[] }) {
  const icons = { doorbell: 'doorbell', lock: 'lock', home: 'home', frigate: 'videocam' };
  return <ol className="ppf-activity-list" aria-label="Nylige hendelser">{events.map((event) => {
    const media = event.kind === 'frigate' ? safeMediaPath(event.mediaPath, 'preview') : undefined;
    return <li key={event.id} className={event.tone === 'safe' && (event.kind === 'lock' || event.kind === 'home') ? 'is-safe' : ''}><Icon>{icons[event.kind]}</Icon><div className="ppf-activity-copy"><strong>{event.title}</strong>{event.detail && <span>{event.detail}</span>}<time dateTime={event.occurredAt}>{localDate(event.occurredAt)}</time>{media && <Recording key={media} path={media} label={`${event.detail ?? event.title} · ${localDate(event.occurredAt)}`}/>}</div></li>;
  })}</ol>;
}

function TimelineDialog({ events, onClose }: { events: ActivityEvent[]; onClose: () => void }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeRef.current?.focus();
    const contain = (event: FocusEvent) => { if (!ref.current?.contains(event.target as Node)) closeRef.current?.focus(); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const stops = [...(ref.current?.querySelectorAll<HTMLElement>('button, video[controls], [tabindex="0"]') ?? [])];
      const first = stops[0]; const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    };
    document.addEventListener('focusin', contain);
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('focusin', contain); document.removeEventListener('keydown', keydown, true); if (invoker?.isConnected) invoker.focus(); };
  }, []);
  return <div className="ppf-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="ppf-modal ppf-activity-modal" role="dialog" aria-modal="true" aria-labelledby={id}><header><span><Icon>history</Icon></span><h2 id={id}>Tidslinje</h2><button ref={closeRef} type="button" aria-label="Lukk" onClick={onClose}><Icon>close</Icon></button></header><div className="ppf-activity-modal-body" tabIndex={0}><TimelineRows events={events}/></div></section></div>;
}

export function ActivityTimeline({ events, loading = false }: { events: ActivityEvent[]; loading?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...events].sort((left, right) => (validTime(right.occurredAt) ?? 0) - (validTime(left.occurredAt) ?? 0));
  return <><Module title="Tidslinje" icon="format_list_bulleted" className="ppf-activity-card" loading={loading} action={sorted.length > 5 && <button type="button" className="ppf-since-more" aria-label="Se alle hendelser" onClick={() => setExpanded(true)}>Se alle</button>}>
    {loading && !events.length ? <Loading rows={3}/> : sorted.length ? <TimelineRows events={sorted.slice(0, 5)}/> : <p className="ppf-since-state">Ingen nye hendelser</p>}
  </Module>{expanded && <TimelineDialog events={sorted} onClose={() => setExpanded(false)}/>}</>;
}

export interface SinceLastProps {
  activity?: ActivityPayload;
  activityLoading?: boolean;
  activityStale?: boolean;
  messages: FamilyMessage[];
  receipts: FamilyReadReceipt[];
  onOpenFamily: (id?: string) => void;
  now?: Date;
}

export function SinceLast({ activity, activityLoading = false, activityStale = false, messages, receipts, onOpenFamily, now }: SinceLastProps) {
  return <div className="ppf-since-last"><FamilyInboxCard messages={messages} receipts={receipts} onOpen={onOpenFamily} now={now} loading={activityLoading && !activity}/><ActivityTimeline events={activity?.timeline ?? []} loading={activityLoading && !activity}/>{activityStale && <p className="ppf-since-stale" role="status">Hendelsene kan være utdaterte</p>}</div>;
}
