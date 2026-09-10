import { describe, expect, it } from 'vitest';
import { completedAwayIntervals, normalizeTimeline, selectAwayReview } from './activity';

describe('completedAwayIntervals', () => {
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
