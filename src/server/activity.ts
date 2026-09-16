import { completedAwayIntervals, selectAwayReview, type ActivityEvent, type ActivityPayload, type AwayCapture, type AwayInterval, type CameraEventFeed, type CameraEventGroup, type CameraObject, type CameraReview, type FrigateReviewItem, type HomeHistoryPoint } from '../shared/activity';
import { randomUUID } from 'node:crypto';
import { defaultDashboardEntityIds } from '../shared/entities';
import { FrigateClient, FrigateCommunicationError } from './frigate';
import type { ActivityEntityConfig, HomeAssistantClient } from './homeAssistant';

export interface ActivityConfig extends ActivityEntityConfig {
  home: string;
  frontDoorLock: string;
}

interface ResolvedMedia {
  id: string;
  review: FrigateReviewItem;
  start: number;
  end: number;
  source: 'preview' | 'clip';
  expiresAt: number;
  available: boolean;
  version: number;
}

type MonitoringMode = CameraReview['monitoringMode'];
type CameraReviewMediaStatus = 'available' | 'expired' | 'unavailable';
const cameraObjectOrder: CameraObject[] = ['person', 'car', 'dog'];
const supportedCameraNames = new Set(['bakside', 'bod', 'gaardsplassenwide', 'hagen']);
const monitoringMode = (state: string): 1 | 2 | 3 | undefined => {
  const value = Number(state.trim());
  return value === 1 || value === 2 || value === 3 ? value : undefined;
};
const cameraObjects = (review: FrigateReviewItem, allowed: Map<string, Set<CameraObject>>): CameraObject[] => {
  const configured = allowed.get(normalizeName(review.camera));
  if (!configured || !supportedCameraNames.has(normalizeName(review.camera))) return [];
  const values = strings(review.data?.objects).map((value) => value.toLowerCase());
  return cameraObjectOrder.filter((object) => configured.has(object) && values.includes(object));
};
const cameraZone = (review: FrigateReviewItem): string | undefined => {
  const zones = [...new Set(strings(review.data?.zones))].sort((left, right) => normalizeName(left).localeCompare(normalizeName(right)));
  return zones.length ? zones.join(', ') : undefined;
};
const cameraMonitoringMode = (points: HomeHistoryPoint[], at: number): MonitoringMode | undefined => {
  let state: 1 | 2 | 3 | undefined;
  for (const point of [...points].sort((left, right) => Date.parse(left.changedAt) - Date.parse(right.changedAt))) {
    const changedAt = Date.parse(point.changedAt);
    if (!Number.isFinite(changedAt) || changedAt > at) continue;
    state = monitoringMode(point.state);
  }
  return state === 1 ? 'armed' : state === 2 ? 'notifications' : undefined;
};
const currentMonitoringMode = (points: HomeHistoryPoint[], at: number): 1 | 2 | 3 | undefined => {
  let state: 1 | 2 | 3 | undefined;
  let hasKnownState = false;
  for (const point of [...points].sort((left, right) => Date.parse(left.changedAt) - Date.parse(right.changedAt))) {
    const changedAt = Date.parse(point.changedAt);
    if (!Number.isFinite(changedAt) || changedAt > at) continue;
    const next = monitoringMode(point.state);
    state = next;
    hasKnownState = next !== undefined;
  }
  return hasKnownState ? state : undefined;
};
const configuredCameraObjects = (entities: string[]): Map<string, Set<CameraObject>> => {
  const allowed = new Map<string, Set<CameraObject>>();
  for (const entity of entities) {
    const identity = detectionIdentity(entity);
    if (!identity.object || !cameraObjectOrder.includes(identity.object as CameraObject)) continue;
    const camera = normalizeName(identity.camera);
    if (!camera) continue;
    const objects = allowed.get(camera) ?? new Set<CameraObject>();
    objects.add(identity.object as CameraObject);
    allowed.set(camera, objects);
  }
  return allowed;
};
const toCameraReview = (item: FrigateReviewItem, objects: CameraObject[], mode: MonitoringMode): CameraReview => ({
  id: item.id,
  occurredAt: new Date(item.start_time * 1000).toISOString(),
  objects,
  camera: item.camera,
  ...(cameraZone(item) ? { zone: cameraZone(item) } : {}),
  monitoringMode: mode,
});
const groupKey = (review: CameraReview) => `${normalizeName(review.camera)}:${normalizeName(review.zone ?? '')}`;
const cameraGroupId = (reviews: CameraReview[]) => {
  const first = reviews[0];
  return `camera-event:${normalizeName(first.camera)}:${normalizeName(first.zone ?? '')}:${Date.parse(first.occurredAt)}`;
};
export const groupCameraReviews = (items: FrigateReviewItem[], points: HomeHistoryPoint[], configuredEntities: string[], start: Date, end: Date): CameraEventGroup[] => {
  const allowed = configuredCameraObjects(configuredEntities);
  const eligible = items.flatMap((item) => {
    if (!Number.isFinite(item.start_time)) return [] as CameraReview[];
    const occurredAt = item.start_time * 1000;
    if (occurredAt < start.getTime() || occurredAt > end.getTime()) return [] as CameraReview[];
    const objects = cameraObjects(item, allowed);
    const mode = cameraMonitoringMode(points, occurredAt);
    return mode && objects.length ? [toCameraReview(item, objects, mode)] : [] as CameraReview[];
  }).sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id.localeCompare(right.id));

  const open = new Map<string, CameraReview[]>();
  for (const review of eligible) {
    const key = groupKey(review);
    const current = open.get(key);
    const firstAt = current ? Date.parse(current[0].occurredAt) : Number.NaN;
    if (!current || Date.parse(review.occurredAt) - firstAt > 10 * 60_000) open.set(key, [review]);
    else current.push(review);
  }
  return [...open.values()].map((reviews) => {
    const ordered = [...reviews].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.id.localeCompare(left.id));
    const objects = cameraObjectOrder.filter((object) => ordered.some((review) => review.objects.includes(object)));
    return {
      id: cameraGroupId(ordered), occurredAt: ordered[0].occurredAt, camera: ordered[0].camera,
      ...(ordered[0].zone ? { zone: ordered[0].zone } : {}), objects, reviewCount: ordered.length,
      latestReviewId: ordered[0].id, reviews: ordered,
    };
  }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.id.localeCompare(left.id));
};

export const isActivityMediaId = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);

const dayMs = 24 * 60 * 60 * 1000;
const activityBudgetMs = 8_000;
const unavailable = () => new Error('Aktivitet er ikke tilgjengelig');
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const displayName = (value: string) => value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const cameraDisplayName = (value: string) => value.replace(/^Gaardsplassen_Wide$/i, 'Gårdsplassen').replace(/_/g, ' ');
const objectNames: Record<string, string> = { person: 'Person', car: 'Bil', dog: 'Hund', cat: 'Katt', bicycle: 'Sykkel', motorcycle: 'Motorsykkel', truck: 'Lastebil', bus: 'Buss', bird: 'Fugl' };
const objectLabel = (value: string) => objectNames[value.toLowerCase()] ?? 'Objekt';
const cameraObjectText = (objects: CameraObject[]) => objects.map((object, index) => index === 0 ? objectLabel(object) : objectLabel(object).toLowerCase()).join(' og ');
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
    id: `frigate:${review.camera}:${review.start_time}`, kind: 'frigate', occurredAt: new Date(review.start_time * 1000).toISOString(),
    title: objectLabel(object),
    detail: [zone && displayName(zone), displayName(review.camera)].filter(Boolean).join(' · '), tone: 'default',
  };
};

/** Combines trusted recorder edges with media capabilities issued only for matched reviews. */
export class ActivityService {
  private readonly resolvedMedia = new Map<string, ResolvedMedia>();
  private readonly resolvedReviewMedia = new Map<string, ResolvedMedia>();
  private readonly resolvedThumbnails = new Map<string, { id: string; camera: string; expiresAt: number }>();

  public constructor(
    private readonly homeAssistant: Pick<HomeAssistantClient, 'getActivityHistory'>,
    private readonly frigate?: FrigateClient,
    private readonly config: ActivityConfig = { home: defaultDashboardEntityIds.home, frontDoorLock: defaultDashboardEntityIds.frontDoorLock, doorbellVisitor: '', frigateEvents: [] },
  ) {}

  public async getActivity(now = new Date()): Promise<ActivityPayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), activityBudgetMs);
    try {
      return await this.getActivityWithSignal(now, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getActivityWithSignal(now: Date, activitySignal: AbortSignal): Promise<ActivityPayload> {
    if (!Number.isFinite(now.getTime())) throw unavailable();
    const cameraFeedEnabled = Boolean(this.frigate && this.config.securityMode && this.config.frigateEvents.length);
    const weekStart = new Date(now.getTime() - 7 * dayMs);
    const payload: ActivityPayload = { generatedAt: now.toISOString(), cameraEvents: { status: 'unavailable', groups: [] }, awayCapture: { status: 'unavailable' }, timeline: [] };
    let timelineStart = cameraFeedEnabled ? weekStart : new Date(now.getTime() - dayMs);
    let history: Record<string, HomeHistoryPoint[]>;
    try { history = await this.homeAssistant.getActivityHistory(timelineStart, now, activitySignal); }
    catch { throw unavailable(); }

    payload.timeline = this.timeline(history, timelineStart, now);
    if (payload.timeline.length < 3) {
      try {
        history = await this.homeAssistant.getActivityHistory(weekStart, now, activitySignal);
        timelineStart = weekStart;
        payload.timeline = this.timeline(history, timelineStart, now);
      } catch { /* Keep the confirmed 24-hour timeline. */ }
    }

    let cameraGroups: CameraEventGroup[] = [];
    if (cameraFeedEnabled) {
      try {
        const securityPoints = history[this.config.securityMode!] ?? [];
        const currentMode = currentMonitoringMode(securityPoints, now.getTime());
        if (currentMode === 3) {
          payload.cameraEvents = { status: 'inactive', groups: [] };
        } else if (currentMode === undefined) {
          payload.cameraEvents = { status: 'unavailable', groups: [] };
        } else {
          const reviews = await this.frigate!.getReviewItems(weekStart, now, activitySignal);
          cameraGroups = groupCameraReviews(reviews, securityPoints, this.config.frigateEvents, weekStart, now);
          await this.resolveCameraGroupMedia(cameraGroups, now, activitySignal);
          payload.cameraEvents = {
            status: cameraGroups.length && cameraGroups.every((group) => group.reviews.every((review) => !review.mediaPath && !review.thumbnailPath)) ? 'expired' : cameraGroups.length ? 'available' : 'none',
            groups: cameraGroups,
          };
        }
      } catch {
        payload.cameraEvents = { status: 'unavailable', groups: [] };
      }
      payload.timeline = this.timeline(history, timelineStart, now, cameraGroups);
    }

    let interval = this.latestAway(history, now);
    let awayHistoryAvailable = true;
    if (!interval) {
      try {
        // Away capture has an independent bounded lookback, beyond the recent timeline.
        interval = this.latestAway(await this.homeAssistant.getActivityHistory(new Date(now.getTime() - 30 * dayMs), now, activitySignal), now);
      } catch { awayHistoryAvailable = false; }
    }
    const probes = new Map<string, Promise<'available' | 'expired' | 'unavailable'>>();
    if (this.frigate && awayHistoryAvailable) {
      payload.awayCapture = interval ? await this.awayCapture(interval, probes, activitySignal) : { status: 'none' };
    }

    const detections = payload.timeline.filter((event) => event.kind === 'frigate');
    if (this.frigate && detections.length) {
      try {
        const reviews = await this.frigate.getReviewItems(new Date(timelineStart.getTime() - 30_000), now, activitySignal);
        // Share a bounded queue so media latency does not accumulate per event.
        // Away resolves first, retaining the stricter interval for shared reviews.
        const remaining = detections.values();
        await Promise.all(Array.from({ length: Math.min(4, detections.length) }, async () => {
          for (const event of remaining) {
            const entity = this.config.frigateEvents.find((candidate) => event.id.startsWith(`${candidate}:`));
            if (!entity) continue;
            const identity = detectionIdentity(entity);
            const matched = reviews.filter((item) => normalizeName(item.camera) === normalizeName(identity.camera)
              && strings(item.data?.objects).some((object) => normalizeName(object) === normalizeName(identity.object))
              && Math.abs(item.start_time * 1000 - Date.parse(event.occurredAt)) <= 30_000)
              .sort((left, right) => Math.abs(left.start_time * 1000 - Date.parse(event.occurredAt)) - Math.abs(right.start_time * 1000 - Date.parse(event.occurredAt)))[0];
            if (matched && await this.probe(matched, now.getTime() / 1000, probes, 0, activitySignal) === 'available') event.mediaPath = this.issuedMediaPath(matched.id);
          }
        }));
      } catch { /* HA detections remain informative without Frigate. */ }
    }
    return payload;
  }

  /** Only server-issued IDs resolve; upstream coordinates never come from the browser. */
  public async getReviewMedia(id: string, signal?: AbortSignal): Promise<Response> {
    const media = isActivityMediaId(id) ? [...this.resolvedReviewMedia.values(), ...this.resolvedMedia.values()].find((entry) => entry.id === id) : undefined;
    if (!media || media.expiresAt <= Date.now() || !media.available || !this.frigate) throw unavailable();
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const version = media.version;
        const response = media.source === 'preview'
          ? await this.frigate.getReviewPreview(media.review.id, signal)
          : await this.frigate.getRecordingClip(media.review.camera, media.start, media.end, signal);
        if (media.version === version && media.available && media.expiresAt > Date.now()) return response;
        await response.body?.cancel();
        if (!media.available || media.expiresAt <= Date.now()) break;
      }
      throw unavailable();
    } catch { throw unavailable(); }
  }

  public async getReviewThumbnail(id: string, signal?: AbortSignal): Promise<Response> {
    const entry = isActivityMediaId(id) ? [...this.resolvedThumbnails.entries()].find(([, thumbnail]) => thumbnail.id === id) : undefined;
    if (!entry || entry[1].expiresAt <= Date.now() || !this.frigate) throw unavailable();
    try {
      const response = await this.frigate.getReviewThumbnail(entry[0], entry[1].camera, signal);
      if (entry[1].expiresAt > Date.now()) return response;
      await response.body?.cancel();
      throw unavailable();
    }
    catch { throw unavailable(); }
  }

  private issuedMediaPath(reviewId: string): string | undefined {
    const media = this.resolvedMedia.get(reviewId);
    return media?.available && media.expiresAt > Date.now() ? mediaPath(media.id) : undefined;
  }

  private issuedReviewMediaPath(reviewId: string): string | undefined {
    const media = this.resolvedReviewMedia.get(reviewId);
    return media?.available && media.expiresAt > Date.now() ? mediaPath(media.id) : undefined;
  }

  private async resolveCameraGroupMedia(groups: CameraEventGroup[], now: Date, signal: AbortSignal): Promise<void> {
    const reviews = groups.flatMap((group) => group.reviews);
    const remaining = reviews.values();
    await Promise.all(Array.from({ length: Math.min(4, reviews.length) }, async () => {
      for (const review of remaining) {
        const status = await this.resolveReviewMedia(review, now, signal);
        if (status === 'available') review.mediaPath = this.issuedReviewMediaPath(review.id);
        try { review.thumbnailPath = await this.issueThumbnail(review, signal); } catch { /* Metadata remains available without a thumbnail. */ }
      }
    }));
  }

  private async resolveReviewMedia(review: CameraReview, _now: Date, signal: AbortSignal): Promise<CameraReviewMediaStatus> {
    const currentTime = Date.now();
    for (const [id, entry] of this.resolvedReviewMedia) if (entry.expiresAt <= currentTime) this.resolvedReviewMedia.delete(id);
    let media = this.resolvedReviewMedia.get(review.id);
    if (media && media.review.camera !== review.camera) return 'unavailable';
    if (media?.available && media.expiresAt > currentTime) return 'available';
    if (!media) {
      if (this.resolvedReviewMedia.size >= 500) this.resolvedReviewMedia.delete(this.resolvedReviewMedia.keys().next().value!);
      media = {
        id: randomUUID(), review: { id: review.id, camera: review.camera, start_time: Date.parse(review.occurredAt) / 1000, severity: 'detection' },
        start: Date.parse(review.occurredAt) / 1000, end: Date.parse(review.occurredAt) / 1000 + 30,
        source: 'preview', expiresAt: currentTime + 5 * 60 * 1000, available: false, version: 0,
      };
      this.resolvedReviewMedia.set(review.id, media);
    }
    try {
      const response = await this.frigate!.getReviewPreview(review.id, signal);
      await response.body?.cancel();
      media.available = true;
      return 'available';
    } catch (error) {
      media.available = false;
      return error instanceof FrigateCommunicationError && error.mediaMissing ? 'expired' : 'unavailable';
    }
  }

  private async issueThumbnail(review: CameraReview, signal: AbortSignal): Promise<string | undefined> {
    const response = await this.frigate!.getReviewThumbnail(review.id, review.camera, signal);
    await response.body?.cancel();
    const currentTime = Date.now();
    for (const [id, entry] of this.resolvedThumbnails) if (entry.expiresAt <= currentTime) this.resolvedThumbnails.delete(id);
    let capability = this.resolvedThumbnails.get(review.id);
    if (!capability) {
      if (this.resolvedThumbnails.size >= 500) this.resolvedThumbnails.delete(this.resolvedThumbnails.keys().next().value!);
      capability = { id: randomUUID(), camera: review.camera, expiresAt: currentTime + 5 * 60 * 1000 };
      this.resolvedThumbnails.set(review.id, capability);
    }
    return `/api/activity/review/${capability.id}/thumbnail`;
  }

  private latestAway(history: Record<string, HomeHistoryPoint[]>, now: Date): AwayInterval | undefined {
    return completedAwayIntervals((history[this.config.home] ?? []).filter((point) => Date.parse(point.changedAt) <= now.getTime()))[0];
  }

  private async awayCapture(interval: AwayInterval, probes: Map<string, Promise<'available' | 'expired' | 'unavailable'>>, signal: AbortSignal): Promise<AwayCapture> {
    const capture: AwayCapture = { status: 'unavailable', awayStartedAt: interval.startedAt, homeReturnedAt: interval.endedAt };
    try {
      const reviews = await this.frigate!.getReviewItems(new Date(interval.startedAt), new Date(interval.endedAt), signal);
      const review = selectAwayReview(reviews, interval);
      if (!review) return { ...capture, status: 'none' };
      capture.event = reviewEvent(review);
      capture.status = await this.probe(review, Date.parse(interval.endedAt) / 1000, probes, Date.parse(interval.startedAt) / 1000, signal);
      if (capture.status === 'available') {
        capture.mediaPath = this.issuedMediaPath(review.id);
        capture.event.mediaPath = capture.mediaPath;
      }
      try {
        const thumbnail = await this.frigate!.getReviewThumbnail(review.id, review.camera, signal);
        await thumbnail.body?.cancel();
        const now = Date.now();
        for (const [id, entry] of this.resolvedThumbnails) if (entry.expiresAt <= now) this.resolvedThumbnails.delete(id);
        let capability = this.resolvedThumbnails.get(review.id);
        if (!capability) {
          if (this.resolvedThumbnails.size >= 500) this.resolvedThumbnails.delete(this.resolvedThumbnails.keys().next().value!);
          capability = { id: randomUUID(), camera: review.camera, expiresAt: now + 5 * 60 * 1000 };
          this.resolvedThumbnails.set(review.id, capability);
        }
        capture.thumbnailPath = `/api/activity/review/${capability.id}/thumbnail`;
      } catch { /* A missing thumbnail does not hide known event metadata. */ }
    } catch { /* Keep the generic unavailable state. */ }
    return capture;
  }

  private probe(review: FrigateReviewItem, until: number, probes: Map<string, Promise<'available' | 'expired' | 'unavailable'>>, since = 0, signal?: AbortSignal): Promise<'available' | 'expired' | 'unavailable'> {
    const existing = probes.get(review.id);
    if (existing) return existing;
    const pending = this.resolveMedia(review, since, until, signal);
    probes.set(review.id, pending);
    return pending;
  }

  private async resolveMedia(review: FrigateReviewItem, since: number, until: number, signal?: AbortSignal): Promise<'available' | 'expired' | 'unavailable'> {
    const start = Math.max(since, review.start_time);
    const end = Math.min(until, review.end_time ?? review.start_time + 30, start + 300);
    // Frigate 0.17 adds eight seconds to review previews. Never cross the HA interval.
    const previewAllowed = review.end_time !== undefined && review.start_time - 8 >= since && review.end_time + 8 <= until && review.end_time - review.start_time + 16 <= 300;
    const now = Date.now();
    for (const [id, entry] of this.resolvedMedia) if (entry.expiresAt <= now) this.resolvedMedia.delete(id);
    let media = this.resolvedMedia.get(review.id);
    if (media) {
      if (media.review.camera !== review.camera) return 'unavailable';
      const nextStart = Math.max(media.start, start);
      const nextEnd = Math.min(media.end, end);
      const nextSource = media.source === 'clip' || !previewAllowed || nextStart !== media.start || nextEnd !== media.end ? 'clip' : 'preview';
      if (nextStart !== media.start || nextEnd !== media.end || nextSource !== media.source) {
        media.start = nextStart;
        media.end = nextEnd;
        media.source = nextSource;
        media.version += 1;
        media.available = false;
      }
    } else {
      if (this.resolvedMedia.size >= 500) this.resolvedMedia.delete(this.resolvedMedia.keys().next().value!);
      media = { id: randomUUID(), review, start, end, source: previewAllowed ? 'preview' : 'clip', expiresAt: now + 5 * 60 * 1000, available: false, version: 0 };
      this.resolvedMedia.set(review.id, media);
    }
    // Commit restrictions before awaiting upstream: older in-flight probes cannot widen them.
    if (media.end <= media.start) return 'expired';
    let failed = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const version = media.version;
      try {
        const response = media.source === 'preview'
          ? await this.frigate!.getReviewPreview(review.id, signal)
          : await this.frigate!.getRecordingClip(review.camera, media.start, media.end, signal);
        await response.body?.cancel(); // Probe availability without buffering or persisting footage.
        if (this.resolvedMedia.get(review.id) !== media || media.expiresAt <= Date.now()) return 'unavailable';
        if (media.version !== version) continue;
        media.available = true;
        return 'available';
      } catch (error) {
        if (this.resolvedMedia.get(review.id) !== media || media.expiresAt <= Date.now()) return 'unavailable';
        if (media.version !== version) continue;
        if (!(error instanceof FrigateCommunicationError && error.mediaMissing)) failed = true;
        media.available = false;
        if (media.source === 'clip') return failed ? 'unavailable' : 'expired';
        media.source = 'clip';
        media.version += 1;
      }
    }
    return 'unavailable';
  }

  private timeline(history: Record<string, HomeHistoryPoint[]>, start: Date, end: Date, cameraGroups?: CameraEventGroup[]): ActivityEvent[] {
    const events: ActivityEvent[] = [];
    const ids = new Set([this.config.home, this.config.frontDoorLock, this.config.doorbellVisitor, ...(cameraGroups ? [] : this.config.frigateEvents)].filter(Boolean));
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
        if (point.baseline) continue;
        if (state === prior) continue;
        let occurred = Date.parse(point.changedAt);
        let event: Pick<ActivityEvent, 'kind' | 'title' | 'detail' | 'tone'> | undefined;
        if (entity === this.config.home && ['Hjemme', 'Borte'].includes(state)) {
          event = { kind: 'home', title: state === 'Hjemme' ? 'Huset er hjemme' : 'Huset er borte', tone: 'default' };
        } else if (entity === this.config.frontDoorLock && ['locked', 'unlocked'].includes(state)) {
          event = { kind: 'lock', title: state === 'locked' ? 'Døren er låst' : 'Døren er låst opp', tone: state === 'locked' ? 'safe' : 'default' };
        } else if (entity === this.config.doorbellVisitor && state === 'on' && prior !== 'on') {
          event = { kind: 'doorbell', title: 'Noen ringte på', tone: 'default' };
        } else if (this.config.frigateEvents.includes(entity) && /^\d{4}-\d{2}-\d{2}T/.test(state)) {
          occurred = Date.parse(state);
          if (seenDetections.has(occurred)) continue;
          seenDetections.add(occurred);
          const identity = detectionIdentity(entity);
          event = { kind: 'frigate', title: objectLabel(identity.object), detail: displayName(identity.camera), tone: 'default' };
        }
        if (!event || !Number.isFinite(occurred) || occurred < start.getTime() || occurred > end.getTime()) continue;
        const occurredAt = new Date(occurred).toISOString();
        events.push({ id: `${entity}:${occurredAt}`, occurredAt, ...event });
      }
    }
    if (cameraGroups) {
      events.push(...cameraGroups.map((group) => ({
        id: group.id,
        kind: 'frigate' as const,
        occurredAt: group.occurredAt,
        title: cameraObjectText(group.objects),
        detail: [group.zone && displayName(group.zone), cameraDisplayName(group.camera)].filter(Boolean).join(' · '),
        tone: 'default' as const,
        ...(group.reviews[0]?.mediaPath ? { mediaPath: group.reviews[0].mediaPath } : {}),
      })));
    }
    return events.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  }
}
