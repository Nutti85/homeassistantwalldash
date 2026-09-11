import { completedAwayIntervals, selectAwayReview, type ActivityEvent, type ActivityPayload, type AwayCapture, type AwayInterval, type FrigateReviewItem, type HomeHistoryPoint } from '../shared/activity';
import { defaultDashboardEntityIds } from '../shared/entities';
import { FrigateClient, FrigateCommunicationError, isFrigateReviewId } from './frigate';
import type { ActivityEntityConfig, HomeAssistantClient } from './homeAssistant';

export interface ActivityConfig extends ActivityEntityConfig {
  home: string;
  frontDoorLock: string;
}

interface ResolvedMedia {
  review: FrigateReviewItem;
  start: number;
  end: number;
  source: 'preview' | 'clip';
  expiresAt: number;
}

const dayMs = 24 * 60 * 60 * 1000;
const unavailable = () => new Error('Aktivitet er ikke tilgjengelig');
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const displayName = (value: string) => value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const objectNames: Record<string, string> = { person: 'Person', car: 'Bil', dog: 'Hund', cat: 'Katt', bicycle: 'Sykkel', motorcycle: 'Motorsykkel', truck: 'Lastebil', bus: 'Buss', bird: 'Fugl' };
const objectLabel = (value: string) => objectNames[value.toLowerCase()] ?? 'Objekt';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && /^[\p{L}\p{N}_ -]{1,80}$/u.test(entry)) : [];
const mediaPath = (id: string) => `/api/activity/review/${id}/preview`;
const detectionIdentity = (entity: string) => {
  const name = entity.slice('image.'.length);
  const separator = name.lastIndexOf('_');
  return { camera: name.slice(0, separator), object: name.slice(separator + 1).toLowerCase() };
};

const reviewEvent = (review: FrigateReviewItem): ActivityEvent => {
  const object = strings(review.data?.objects)[0] ?? '';
  const zone = strings(review.data?.zones)[0];
  return {
    id: `frigate:${review.id}`, kind: 'frigate', occurredAt: new Date(review.start_time * 1000).toISOString(),
    title: `${objectLabel(object)} registrert`,
    detail: [zone && displayName(zone), displayName(review.camera)].filter(Boolean).join(' · '), tone: 'default',
  };
};

/** Combines trusted recorder edges with media capabilities issued only for matched reviews. */
export class ActivityService {
  private readonly resolvedMedia = new Map<string, ResolvedMedia>();
  private readonly resolvedThumbnails = new Map<string, { camera: string; expiresAt: number }>();

  public constructor(
    private readonly homeAssistant: Pick<HomeAssistantClient, 'getActivityHistory'>,
    private readonly frigate?: FrigateClient,
    private readonly config: ActivityConfig = { home: defaultDashboardEntityIds.home, frontDoorLock: defaultDashboardEntityIds.frontDoorLock, doorbellVisitor: '', frigateEvents: [] },
  ) {}

  public async getActivity(now = new Date()): Promise<ActivityPayload> {
    if (!Number.isFinite(now.getTime())) throw unavailable();
    const payload: ActivityPayload = { generatedAt: now.toISOString(), awayCapture: { status: 'unavailable' }, timeline: [] };
    let timelineStart = new Date(now.getTime() - dayMs);
    let history: Record<string, HomeHistoryPoint[]>;
    try { history = await this.homeAssistant.getActivityHistory(timelineStart, now); }
    catch { return payload; }

    payload.timeline = this.timeline(history, timelineStart, now);
    if (payload.timeline.length < 3) {
      const weekStart = new Date(now.getTime() - 7 * dayMs);
      try {
        history = await this.homeAssistant.getActivityHistory(weekStart, now);
        timelineStart = weekStart;
        payload.timeline = this.timeline(history, timelineStart, now);
      } catch { /* Keep the confirmed 24-hour timeline. */ }
    }

    let interval = this.latestAway(history, now);
    let awayHistoryAvailable = true;
    if (!interval) {
      try {
        // Away capture has an independent bounded lookback, beyond the recent timeline.
        interval = this.latestAway(await this.homeAssistant.getActivityHistory(new Date(now.getTime() - 30 * dayMs), now), now);
      } catch { awayHistoryAvailable = false; }
    }
    const probes = new Map<string, Promise<'available' | 'expired' | 'unavailable'>>();
    if (this.frigate && awayHistoryAvailable) {
      payload.awayCapture = interval ? await this.awayCapture(interval, probes) : { status: 'none' };
    }

    const detections = payload.timeline.filter((event) => event.kind === 'frigate');
    if (this.frigate && detections.length) {
      try {
        const reviews = await this.frigate.getReviewItems(new Date(timelineStart.getTime() - 30_000), now);
        for (const event of detections) {
          const entity = this.config.frigateEvents.find((candidate) => event.id.startsWith(`${candidate}:`));
          if (!entity) continue;
          const identity = detectionIdentity(entity);
          const matched = reviews.filter((item) => normalizeName(item.camera) === normalizeName(identity.camera)
            && strings(item.data?.objects).some((object) => normalizeName(object) === normalizeName(identity.object))
            && Math.abs(item.start_time * 1000 - Date.parse(event.occurredAt)) <= 30_000)
            .sort((left, right) => Math.abs(left.start_time * 1000 - Date.parse(event.occurredAt)) - Math.abs(right.start_time * 1000 - Date.parse(event.occurredAt)))[0];
          if (matched && await this.probe(matched, now.getTime() / 1000, probes) === 'available') event.mediaPath = mediaPath(matched.id);
        }
      } catch { /* HA detections remain informative without Frigate. */ }
    }
    return payload;
  }

  /** Only server-issued IDs resolve; upstream coordinates never come from the browser. */
  public async getReviewMedia(id: string, signal?: AbortSignal): Promise<Response> {
    const media = isFrigateReviewId(id) ? this.resolvedMedia.get(id) : undefined;
    if (!media || media.expiresAt < Date.now() || !this.frigate) throw unavailable();
    try {
      return media.source === 'preview'
        ? await this.frigate.getReviewPreview(id, signal)
        : await this.frigate.getRecordingClip(media.review.camera, media.start, media.end, signal);
    } catch { throw unavailable(); }
  }

  public async getReviewThumbnail(id: string, signal?: AbortSignal): Promise<Response> {
    const thumbnail = isFrigateReviewId(id) ? this.resolvedThumbnails.get(id) : undefined;
    if (!thumbnail || thumbnail.expiresAt < Date.now() || !this.frigate) throw unavailable();
    try { return await this.frigate.getReviewThumbnail(id, thumbnail.camera, signal); }
    catch { throw unavailable(); }
  }

  private latestAway(history: Record<string, HomeHistoryPoint[]>, now: Date): AwayInterval | undefined {
    return completedAwayIntervals((history[this.config.home] ?? []).filter((point) => Date.parse(point.changedAt) <= now.getTime()))[0];
  }

  private async awayCapture(interval: AwayInterval, probes: Map<string, Promise<'available' | 'expired' | 'unavailable'>>): Promise<AwayCapture> {
    const capture: AwayCapture = { status: 'unavailable', awayStartedAt: interval.startedAt, homeReturnedAt: interval.endedAt };
    try {
      const reviews = await this.frigate!.getReviewItems(new Date(interval.startedAt), new Date(interval.endedAt));
      const review = selectAwayReview(reviews, interval);
      if (!review) return { ...capture, status: 'none' };
      capture.event = reviewEvent(review);
      capture.status = await this.probe(review, Date.parse(interval.endedAt) / 1000, probes, Date.parse(interval.startedAt) / 1000);
      if (capture.status === 'available') {
        capture.mediaPath = mediaPath(review.id);
        capture.event.mediaPath = capture.mediaPath;
      }
      this.resolvedThumbnails.delete(review.id);
      try {
        const thumbnail = await this.frigate!.getReviewThumbnail(review.id, review.camera);
        await thumbnail.body?.cancel();
        const now = Date.now();
        for (const [id, entry] of this.resolvedThumbnails) if (entry.expiresAt < now) this.resolvedThumbnails.delete(id);
        if (this.resolvedThumbnails.size >= 500) this.resolvedThumbnails.delete(this.resolvedThumbnails.keys().next().value!);
        this.resolvedThumbnails.set(review.id, { camera: review.camera, expiresAt: now + 5 * 60 * 1000 });
        capture.thumbnailPath = `/api/activity/review/${review.id}/thumbnail`;
      } catch { /* A missing thumbnail does not hide known event metadata. */ }
    } catch { /* Keep the generic unavailable state. */ }
    return capture;
  }

  private probe(review: FrigateReviewItem, until: number, probes: Map<string, Promise<'available' | 'expired' | 'unavailable'>>, since = 0): Promise<'available' | 'expired' | 'unavailable'> {
    const existing = probes.get(review.id);
    if (existing) return existing;
    const pending = this.resolveMedia(review, since, until);
    probes.set(review.id, pending);
    return pending;
  }

  private async resolveMedia(review: FrigateReviewItem, since: number, until: number): Promise<'available' | 'expired' | 'unavailable'> {
    this.resolvedMedia.delete(review.id);
    const start = Math.max(since, review.start_time);
    const end = Math.min(until, review.end_time ?? review.start_time + 30, start + 300);
    if (end <= start) return 'expired';
    // Frigate 0.17 adds eight seconds to review previews. Never cross the HA interval.
    const previewAllowed = review.end_time !== undefined && review.start_time - 8 >= since && review.end_time + 8 <= until && review.end_time - review.start_time + 16 <= 300;
    let failed = false;
    for (const source of (previewAllowed ? ['preview', 'clip'] : ['clip']) as Array<'preview' | 'clip'>) {
      try {
        const response = source === 'preview'
          ? await this.frigate!.getReviewPreview(review.id)
          : await this.frigate!.getRecordingClip(review.camera, start, end);
        await response.body?.cancel(); // Probe availability without buffering or persisting footage.
        const now = Date.now();
        for (const [id, media] of this.resolvedMedia) if (media.expiresAt < now) this.resolvedMedia.delete(id);
        if (this.resolvedMedia.size >= 500) this.resolvedMedia.delete(this.resolvedMedia.keys().next().value!);
        this.resolvedMedia.set(review.id, { review, start, end, source, expiresAt: now + 5 * 60 * 1000 });
        return 'available';
      } catch (error) {
        if (!(error instanceof FrigateCommunicationError && error.mediaMissing)) failed = true;
      }
    }
    return failed ? 'unavailable' : 'expired';
  }

  private timeline(history: Record<string, HomeHistoryPoint[]>, start: Date, end: Date): ActivityEvent[] {
    const events: ActivityEvent[] = [];
    const ids = new Set([this.config.home, this.config.frontDoorLock, this.config.doorbellVisitor, ...this.config.frigateEvents].filter(Boolean));
    for (const entity of ids) {
      let previous: string | undefined;
      const seenDetections = new Set<number>();
      const points = [...(history[entity] ?? [])].filter((point) => !point.entityId || point.entityId === entity)
        .filter((point) => Number.isFinite(Date.parse(point.changedAt)))
        .sort((left, right) => Date.parse(left.changedAt) - Date.parse(right.changedAt));
      for (const point of points) {
        const state = point.state.trim();
        if (!state || ['unavailable', 'unknown'].includes(state.toLowerCase())) continue;
        const prior = previous;
        previous = state;
        if (state === prior) continue;
        let occurred = Date.parse(point.changedAt);
        let event: Pick<ActivityEvent, 'kind' | 'title' | 'detail' | 'tone'> | undefined;
        if (entity === this.config.home && ['Hjemme', 'Borte'].includes(state)) {
          event = { kind: 'home', title: state === 'Hjemme' ? 'Huset er hjemme' : 'Huset er borte', tone: 'default' };
        } else if (entity === this.config.frontDoorLock && ['locked', 'unlocked'].includes(state)) {
          event = { kind: 'lock', title: state === 'locked' ? 'Døren er låst' : 'Døren er låst opp', tone: state === 'locked' ? 'safe' : 'default' };
        } else if (entity === this.config.doorbellVisitor && prior === 'off' && state === 'on') {
          event = { kind: 'doorbell', title: 'Noen ringte på', tone: 'default' };
        } else if (this.config.frigateEvents.includes(entity) && /^\d{4}-\d{2}-\d{2}T/.test(state)) {
          occurred = Date.parse(state);
          if (seenDetections.has(occurred)) continue;
          seenDetections.add(occurred);
          const identity = detectionIdentity(entity);
          event = { kind: 'frigate', title: `${objectLabel(identity.object)} registrert`, detail: displayName(identity.camera), tone: 'default' };
        }
        if (!event || !Number.isFinite(occurred) || occurred < start.getTime() || occurred > end.getTime()) continue;
        const occurredAt = new Date(occurred).toISOString();
        events.push({ id: `${entity}:${occurredAt}`, occurredAt, ...event });
      }
    }
    return events.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  }
}
