import { describe, expect, it } from 'vitest';
import { completedAwayIntervals, normalizeTimeline, selectAwayReview, type ActivityPayload } from './activity';

const cameraFeed: ActivityPayload['cameraEvents'] = {
  status: 'available',
  groups: [{
    id: 'camera-event:bod:parkering:1',
    occurredAt: '2026-09-10T12:00:00.000Z',
    camera: 'Bod',
    zone: 'Parkering',
    objects: ['person', 'car'],
    reviewCount: 2,
    latestReviewId: '1787914200.123456-abc123',
    reviews: [{
      id: '1787914200.123456-abc123',
      occurredAt: '2026-09-10T12:00:00.000Z',
      objects: ['person'],
      camera: 'Bod',
      zone: 'Parkering',
      monitoringMode: 'armed',
      thumbnailPath: '/api/activity/review/4e654ee5-63e2-40e0-94b1-9d80ce7b3573/thumbnail',
      mediaPath: '/api/activity/review/4e654ee5-63e2-40e0-94b1-9d80ce7b3572/preview',
    }],
  }],
};

describe('camera event contract', () => {
  it('represents available, expired, none, unavailable, and inactive camera feeds', () => {
    const statuses: ActivityPayload['cameraEvents']['status'][] = ['available', 'expired', 'none', 'unavailable', 'inactive'];
    expect(statuses).toEqual(['available', 'expired', 'none', 'unavailable', 'inactive']);
    expect(cameraFeed.groups[0].reviews[0]).toMatchObject({ objects: ['person'], monitoringMode: 'armed' });
  });
});

describe('completedAwayIntervals', () => {
  it('does not treat baseline Borte or its repeated state as a departure edge', () => {
    expect(completedAwayIntervals([
      { state: 'Borte', changedAt: '2026-09-09T13:00:00Z', baseline: true },
      { state: 'Borte', changedAt: '2026-09-09T14:00:00Z' },
      { state: 'Hjemme', changedAt: '2026-09-10T12:53:00Z' },
    ])).toEqual([]);
  });
  it('returns the completed interval after a leading Hjemme state', () => {
    expect(completedAwayIntervals([
      { state: 'Hjemme', changedAt: '2026-09-10T06:00:00+02:00' },
      { state: 'Borte', changedAt: '2026-09-10T07:50:00+02:00' },
      { state: 'Hjemme', changedAt: '2026-09-10T14:53:00+02:00' },
    ])).toEqual([{ startedAt: '2026-09-10T07:50:00+02:00', endedAt: '2026-09-10T14:53:00+02:00' }]);
  });

  it('ignores repeated states and invalid timestamps', () => {
    expect(completedAwayIntervals([
      { state: 'Borte', changedAt: 'not-a-date' },
      { state: 'Hjemme', changedAt: '2026-09-10T06:00:00+02:00' },
      { state: 'Borte', changedAt: '2026-09-10T07:50:00+02:00' },
      { state: 'Borte', changedAt: '2026-09-10T08:00:00+02:00' },
      { state: 'Hjemme', changedAt: '2026-09-10T14:53:00+02:00' },
      { state: 'Hjemme', changedAt: '2026-09-10T15:00:00+02:00' },
    ])).toEqual([{ startedAt: '2026-09-10T07:50:00+02:00', endedAt: '2026-09-10T14:53:00+02:00' }]);
  });

  it('returns completed intervals newest first and excludes an open interval', () => {
    expect(completedAwayIntervals([
      { state: 'Borte', changedAt: '2026-09-08T07:50:00+02:00' },
      { state: 'Hjemme', changedAt: '2026-09-08T14:53:00+02:00' },
      { state: 'Borte', changedAt: '2026-09-09T07:50:00+02:00' },
      { state: 'Hjemme', changedAt: '2026-09-09T14:53:00+02:00' },
      { state: 'Borte', changedAt: '2026-09-10T07:50:00+02:00' },
    ])).toEqual([
      { startedAt: '2026-09-09T07:50:00+02:00', endedAt: '2026-09-09T14:53:00+02:00' },
      { startedAt: '2026-09-08T07:50:00+02:00', endedAt: '2026-09-08T14:53:00+02:00' },
    ]);
  });
});

describe('selectAwayReview', () => {
  const interval = { startedAt: '2026-09-10T07:50:00+02:00', endedAt: '2026-09-10T14:53:00+02:00' };

  it('prefers the newest alert inside the completed Away interval', () => {
    expect(selectAwayReview([
      { id: 'outside', camera: 'Bod', start_time: 1_789_044_800, severity: 'alert' },
      { id: 'alert-earlier', camera: 'Bod', start_time: 1_789_020_400, severity: 'alert' },
      { id: 'detection-later', camera: 'Bod', start_time: 1_789_024_600, severity: 'detection' },
      { id: 'alert-later', camera: 'Bod', start_time: 1_789_022_400, severity: 'alert' },
    ], interval)).toMatchObject({ id: 'alert-later' });
  });

  it('uses the newest detection when no alert is in the interval', () => {
    expect(selectAwayReview([
      { id: 'before', camera: 'Bod', start_time: 1_789_019_000, severity: 'alert' },
      { id: 'detection-earlier', camera: 'Bod', start_time: 1_789_020_400, severity: 'detection' },
      { id: 'detection-later', camera: 'Bod', start_time: 1_789_022_400, severity: 'detection' },
    ], interval)).toMatchObject({ id: 'detection-later' });
  });
});

describe('normalizeTimeline', () => {
  it('seeds previous state from baselines without emitting baseline or repeated rows', () => {
    expect(normalizeTimeline([
      { entityId: 'lock.front', state: 'locked', changedAt: '2026-09-09T13:00:00Z', baseline: true },
      { entityId: 'lock.front', state: 'locked', changedAt: '2026-09-10T12:00:00Z' },
      { entityId: 'lock.front', state: 'unlocked', changedAt: '2026-09-10T12:01:00Z' },
    ])).toEqual([{ entityId: 'lock.front', state: 'unlocked', changedAt: '2026-09-10T12:01:00Z' }]);
  });
  it('drops invalid, unavailable, and repeated transitions before sorting newest first', () => {
    expect(normalizeTimeline([
      { entityId: 'lock.front_door', state: 'locked', changedAt: '2026-09-10T07:50:00+02:00' },
      { entityId: 'lock.front_door', state: 'locked', changedAt: '2026-09-10T08:00:00+02:00' },
      { entityId: 'binary_sensor.doorbell', state: 'unavailable', changedAt: '2026-09-10T08:30:00+02:00' },
      { entityId: 'binary_sensor.doorbell', state: 'on', changedAt: '2026-09-10T09:00:00+02:00' },
      { entityId: 'binary_sensor.doorbell', state: 'off', changedAt: 'not-a-date' },
      { entityId: 'lock.front_door', state: 'unlocked', changedAt: '2026-09-10T10:00:00+02:00' },
    ])).toEqual([
      { entityId: 'lock.front_door', state: 'unlocked', changedAt: '2026-09-10T10:00:00+02:00' },
      { entityId: 'binary_sensor.doorbell', state: 'on', changedAt: '2026-09-10T09:00:00+02:00' },
      { entityId: 'lock.front_door', state: 'locked', changedAt: '2026-09-10T07:50:00+02:00' },
    ]);
  });
});
