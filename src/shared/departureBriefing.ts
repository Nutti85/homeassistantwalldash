export type DepartureVehicleId = 'eqb' | 'e2008';
export type DepartureSourceQuality = 'fresh' | 'stale' | 'missing' | 'unavailable';

export interface DepartureVehicleSnapshot {
  id: DepartureVehicleId;
  name: string;
  socPercent?: number;
  rangeKm?: number;
  quality: DepartureSourceQuality;
  observedAt?: string;
  ageMinutes?: number;
  recommended?: boolean;
}

export interface DepartureWeatherSnapshot {
  quality: DepartureSourceQuality;
  temperatureC?: number;
  condition?: string;
  precipitation?: string;
  wind?: string;
  observedAt?: string;
  ageMinutes?: number;
  message?: string;
}

export interface DepartureChargeEstimate {
  minMinutes: number;
  maxMinutes: number;
}

export interface DepartureTripBriefing {
  tripId: string;
  revisionKey: string;
  eventTitle: string;
  destination: string;
  eventStartAt: string;
  eventEndAt?: string;
  briefingAt?: string;
  departureAt?: string;
  suggestedVehicle: DepartureVehicleId;
  vehicles: DepartureVehicleSnapshot[];
  outboundDriveMinutes?: number;
  returnDriveMinutes?: number;
  chargeEstimate?: DepartureChargeEstimate;
  chargeStopCount?: number;
  totalTravelMinutes?: number;
  estimatedHomeAt?: string;
  homeWeather?: DepartureWeatherSnapshot;
  destinationWeather?: DepartureWeatherSnapshot;
  clothingAdvice?: string;
  delayMinutes?: number;
  warnings?: string[];
  sourceNotes?: string[];
}

export interface DepartureBriefingPayload {
  briefings: DepartureTripBriefing[];
  conflicts: string[];
}
