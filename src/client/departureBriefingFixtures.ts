import type { DepartureBriefingPayload, DepartureTripBriefing, DepartureVehicleSnapshot, DepartureWeatherSnapshot } from '../shared/departureBriefing';

export const departureFixtureNow = new Date('2026-09-08T06:00:00+02:00');

const vehicle = (id: DepartureVehicleSnapshot['id'], name: string, overrides: Partial<DepartureVehicleSnapshot> = {}): DepartureVehicleSnapshot => ({
  id,
  name,
  quality: 'fresh',
  socPercent: id === 'eqb' ? 78 : 64,
  rangeKm: id === 'eqb' ? 312 : 218,
  ...overrides,
});

const weather = (overrides: Partial<DepartureWeatherSnapshot> = {}): DepartureWeatherSnapshot => ({
  quality: 'fresh',
  temperatureC: 12,
  condition: 'opphold',
  precipitation: '0 mm',
  wind: '3 m/s',
  ...overrides,
});

const baseTrip = (overrides: Partial<DepartureTripBriefing> = {}): DepartureTripBriefing => ({
  tripId: 'trip-short',
  revisionKey: 'trip-short-v1',
  eventTitle: 'Turntrening',
  destination: 'Lillehammer turnhall',
  eventStartAt: '2026-09-08T08:50:00+02:00',
  eventEndAt: '2026-09-08T17:00:00+02:00',
  briefingAt: '2026-09-08T07:55:00+02:00',
  departureAt: '2026-09-08T08:20:00+02:00',
  suggestedVehicle: 'eqb',
  vehicles: [
    vehicle('eqb', 'Mercedes EQB', { recommended: true }),
    vehicle('e2008', 'Peugeot e-2008'),
  ],
  outboundDriveMinutes: 28,
  returnDriveMinutes: 28,
  chargeStopCount: 0,
  totalTravelMinutes: 56,
  estimatedHomeAt: '2026-09-08T18:08:00+02:00',
  homeWeather: weather(),
  destinationWeather: weather({ temperatureC: 11, condition: 'lettskyet', wind: '4 m/s' }),
  clothingAdvice: 'Jakke og lag',
  ...overrides,
});

export const departureBriefingFixtures: Record<string, DepartureBriefingPayload> = {
  short: { briefings: [baseTrip()], conflicts: [] },
  'one-stop': {
    briefings: [baseTrip({
      tripId: 'trip-one-stop',
      revisionKey: 'trip-one-stop-v1',
      eventTitle: 'Klatrekurs',
      destination: 'Drammen klatrepark',
      departureAt: '2026-09-08T09:00:00+02:00',
      eventStartAt: '2026-09-08T09:45:00+02:00',
      outboundDriveMinutes: 39,
      returnDriveMinutes: 40,
      chargeEstimate: { minMinutes: 25, maxMinutes: 35 },
      chargeStopCount: 1,
      totalTravelMinutes: 104,
      estimatedHomeAt: '2026-09-08T17:59:00+02:00',
    })],
    conflicts: [],
  },
  'long-trip': {
    briefings: [baseTrip({
      tripId: 'trip-long',
      revisionKey: 'trip-long-v1',
      eventTitle: 'Helgesamling',
      destination: 'Trondheim spektrum',
      departureAt: '2026-09-08T07:10:00+02:00',
      eventStartAt: '2026-09-08T11:30:00+02:00',
      outboundDriveMinutes: 260,
      returnDriveMinutes: 260,
      chargeEstimate: { minMinutes: 78, maxMinutes: 96 },
      chargeStopCount: 2,
      totalTravelMinutes: 694,
      estimatedHomeAt: '2026-09-08T22:04:00+02:00',
      warnings: ['Langtur – kontroller ruten i ABRP'],
    })],
    conflicts: [],
  },
  simultaneous: {
    briefings: [
      baseTrip({ tripId: 'trip-early', revisionKey: 'trip-early-v1' }),
      baseTrip({
        tripId: 'trip-late',
        revisionKey: 'trip-late-v1',
        eventTitle: 'Svømmetrening',
        destination: 'Oslo svømmehall',
        departureAt: '2026-09-08T09:05:00+02:00',
        eventStartAt: '2026-09-08T09:45:00+02:00',
        suggestedVehicle: 'e2008',
        vehicles: [
          vehicle('eqb', 'Mercedes EQB'),
          vehicle('e2008', 'Peugeot e-2008', { recommended: true }),
        ],
      }),
    ],
    conflicts: [],
  },
  'same-car-conflict': {
    briefings: [
      baseTrip({ tripId: 'trip-conflict-early', revisionKey: 'trip-conflict-early-v1' }),
      baseTrip({
        tripId: 'trip-conflict-late',
        revisionKey: 'trip-conflict-late-v1',
        eventTitle: 'Svømmetrening',
        destination: 'Oslo svømmehall',
        departureAt: '2026-09-08T09:05:00+02:00',
        eventStartAt: '2026-09-08T09:45:00+02:00',
      }),
    ],
    conflicts: ['To reiser ser ut til å bruke EQB samtidig. Sjekk bilfordelingen.'],
  },
  'stale-battery': {
    briefings: [baseTrip({
      tripId: 'trip-stale',
      revisionKey: 'trip-stale-v1',
      departureAt: '2026-09-08T09:10:00+02:00',
      eventStartAt: '2026-09-08T09:50:00+02:00',
      chargeStopCount: undefined,
      chargeEstimate: undefined,
      vehicles: [
        vehicle('eqb', 'Mercedes EQB', { recommended: true, quality: 'stale', ageMinutes: 47 }),
        vehicle('e2008', 'Peugeot e-2008', { quality: 'fresh' }),
      ],
      sourceNotes: ['Lading kan ikke beregnes sikkert'],
    })],
    conflicts: [],
  },
  'missing-destination-weather': {
    briefings: [baseTrip({
      tripId: 'trip-missing-weather',
      revisionKey: 'trip-missing-weather-v1',
      destinationWeather: { quality: 'missing', message: 'Får ikke hentet været på stedet' },
      clothingAdvice: undefined,
    })],
    conflicts: [],
  },
  'now-delayed': {
    briefings: [baseTrip({
      tripId: 'trip-now',
      revisionKey: 'trip-now-v1',
      departureAt: '2026-09-08T05:48:00+02:00',
      eventStartAt: '2026-09-08T06:20:00+02:00',
      eventEndAt: '2026-09-08T08:00:00+02:00',
      delayMinutes: 12,
    })],
    conflicts: [],
  },
};

export const departureBriefingFixturePayload = (name: string): DepartureBriefingPayload => {
  const fixture = departureBriefingFixtures[name];
  if (!fixture) throw new Error(`Unknown departure briefing fixture: ${name}`);
  return fixture;
};

const shiftIso = (value: string | undefined, shiftMs: number): string | undefined => value ? new Date(Date.parse(value) + shiftMs).toISOString() : undefined;

/**
 * Keeps the named fixture's relative timing, but moves it around the current
 * clock so the local demo query is useful for visual QA without date fakery in
 * the production view-model.
 */
export const departureBriefingDemoPayload = (name: string, now = new Date()): DepartureBriefingPayload => {
  const fixture = departureBriefingFixturePayload(name);
  const anchor = name === 'now-delayed'
    ? Date.parse(fixture.briefings[0]?.eventStartAt ?? now.toISOString())
    : Date.parse(fixture.briefings[0]?.briefingAt ?? now.toISOString());
  const target = name === 'now-delayed' ? now.getTime() - 10 * 60_000 : now.getTime() - 5 * 60_000;
  const shiftMs = target - anchor;
  return {
    conflicts: [...fixture.conflicts],
    briefings: fixture.briefings.map((trip) => ({
      ...trip,
      eventStartAt: shiftIso(trip.eventStartAt, shiftMs) ?? trip.eventStartAt,
      eventEndAt: shiftIso(trip.eventEndAt, shiftMs),
      briefingAt: shiftIso(trip.briefingAt, shiftMs),
      departureAt: shiftIso(trip.departureAt, shiftMs),
      estimatedHomeAt: shiftIso(trip.estimatedHomeAt, shiftMs),
      vehicles: trip.vehicles.map((vehicle) => ({ ...vehicle })),
      warnings: trip.warnings ? [...trip.warnings] : undefined,
      sourceNotes: trip.sourceNotes ? [...trip.sourceNotes] : undefined,
    })),
  };
};

export const departureBriefingFixtureFromQuery = (search: string): DepartureBriefingPayload | undefined => {
  const name = new URLSearchParams(search).get('departure-demo');
  return name ? departureBriefingDemoPayload(name) : undefined;
};
