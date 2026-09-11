export type ActivityEventKind = 'doorbell' | 'lock' | 'home' | 'frigate';

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  occurredAt: string;
  title: string;
  detail?: string;
  tone: 'default' | 'safe' | 'notice';
  mediaPath?: string;
}

export interface AwayCapture {
  status: 'available' | 'expired' | 'none' | 'unavailable';
  awayStartedAt?: string;
  homeReturnedAt?: string;
  event?: ActivityEvent;
  thumbnailPath?: string;
  mediaPath?: string;
}

export interface ActivityPayload {
  generatedAt: string;
  awayCapture: AwayCapture;
  timeline: ActivityEvent[];
}

export interface HomeHistoryPoint {
  entityId?: string;
  state: string;
  changedAt: string;
  friendlyName?: string;
  /** Recorder state at query start, not a transition with a known occurrence time. */
  baseline?: boolean;
}

export interface FrigateReviewItem {
  id: string;
  camera: string;
  start_time: number;
  end_time?: number;
  severity: string;
  data?: Record<string, unknown>;
}

export interface AwayInterval {
  startedAt: string;
  endedAt: string;
}

const timestamp = (value: string): number | undefined => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const completedAwayIntervals = (points: HomeHistoryPoint[]): AwayInterval[] => {
  const transitions = points
    .map((point) => ({ point, at: timestamp(point.changedAt) }))
    .filter((entry): entry is { point: HomeHistoryPoint; at: number } => entry.at !== undefined)
    .sort((left, right) => left.at - right.at);

  const intervals: AwayInterval[] = [];
  let awayStartedAt: string | undefined;
  let previous: string | undefined;

  for (const { point } of transitions) {
    if (point.baseline) {
      previous = point.state;
      awayStartedAt = undefined;
      continue;
    }
    if (point.state === 'Borte' && previous !== 'Borte' && !awayStartedAt) {
      awayStartedAt = point.changedAt;
    }

    if (point.state === 'Hjemme' && awayStartedAt) {
      intervals.push({ startedAt: awayStartedAt, endedAt: point.changedAt });
      awayStartedAt = undefined;
    }
    if (point.state === 'Borte' || point.state === 'Hjemme') previous = point.state;
  }

  return intervals.sort((left, right) => timestamp(right.startedAt)! - timestamp(left.startedAt)!);
};

export const selectAwayReview = (
  items: FrigateReviewItem[],
  interval: AwayInterval,
): FrigateReviewItem | undefined => {
  const startedAt = timestamp(interval.startedAt);
  const endedAt = timestamp(interval.endedAt);
  if (startedAt === undefined || endedAt === undefined) return undefined;

  const reviewItems = items
    .filter((item) => Number.isFinite(item.start_time))
    .filter((item) => {
      const occurredAt = item.start_time * 1_000;
      return occurredAt >= startedAt && occurredAt <= endedAt;
    })
    .sort((left, right) => right.start_time - left.start_time);

  return reviewItems.find((item) => item.severity === 'alert')
    ?? reviewItems.find((item) => item.severity === 'detection');
};

export const normalizeTimeline = (points: HomeHistoryPoint[]): HomeHistoryPoint[] => {
  const chronological = points
    .map((point) => ({ point, at: timestamp(point.changedAt) }))
    .filter((entry): entry is { point: HomeHistoryPoint; at: number } => (
      entry.at !== undefined && entry.point.state.trim() !== '' && entry.point.state.toLowerCase() !== 'unavailable'
    ))
    .sort((left, right) => left.at - right.at);
  const previousStates = new Map<string, string>();
  const normalized: Array<{ point: HomeHistoryPoint; at: number }> = [];

  for (const entry of chronological) {
    const entityId = entry.point.entityId ?? '';
    const state = entry.point.state.trim().toLowerCase();
    if (previousStates.get(entityId) === state) continue;
    previousStates.set(entityId, state);
    if (entry.point.baseline) continue;
    normalized.push(entry);
  }

  return normalized.sort((left, right) => right.at - left.at).map(({ point }) => point);
};
