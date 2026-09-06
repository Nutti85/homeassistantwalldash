import type { DepartureBriefingPayload, DepartureTripBriefing } from '../shared/departureBriefing';

export const departureDismissedStorageKey = 'walldash.departure-briefing.dismissed';

export interface DepartureDismissal {
  tripId: string;
  revisionKey: string;
  dismissedAt: string;
}

export const readDepartureDismissals = (storage: Storage = window.localStorage): DepartureDismissal[] => {
  try {
    const value: unknown = JSON.parse(storage.getItem(departureDismissedStorageKey) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is DepartureDismissal => Boolean(item) && typeof item === 'object' && typeof (item as DepartureDismissal).tripId === 'string' && typeof (item as DepartureDismissal).revisionKey === 'string' && typeof (item as DepartureDismissal).dismissedAt === 'string');
  } catch {
    return [];
  }
};

export const writeDepartureDismissals = (dismissals: DepartureDismissal[], storage: Storage = window.localStorage): void => {
  storage.setItem(departureDismissedStorageKey, JSON.stringify(dismissals.slice(-40)));
};

export const isDepartureDismissed = (trip: DepartureTripBriefing, dismissals: DepartureDismissal[]): boolean => dismissals.some((item) => item.tripId === trip.tripId && item.revisionKey === trip.revisionKey);

export const isDepartureDue = (trip: DepartureTripBriefing, now: Date): boolean => {
  const briefingAt = trip.briefingAt ? Date.parse(trip.briefingAt) : Number.NaN;
  const eventStartAt = Date.parse(trip.eventStartAt);
  return Number.isFinite(briefingAt) && Number.isFinite(eventStartAt) && briefingAt <= now.getTime() && now.getTime() < eventStartAt;
};

export const departureBriefingsDue = (payload: DepartureBriefingPayload | undefined, now: Date, dismissals: DepartureDismissal[]): DepartureTripBriefing[] => payload?.briefings.filter((trip) => isDepartureDue(trip, now) && !isDepartureDismissed(trip, dismissals)) ?? [];

export const departureBriefingsActive = (payload: DepartureBriefingPayload | undefined, now: Date): DepartureTripBriefing[] => payload?.briefings.filter((trip) => {
  const start = Date.parse(trip.eventStartAt);
  const end = trip.eventEndAt ? Date.parse(trip.eventEndAt) : Number.POSITIVE_INFINITY;
  return Number.isFinite(start) && now.getTime() >= start && now.getTime() < end;
}) ?? [];
