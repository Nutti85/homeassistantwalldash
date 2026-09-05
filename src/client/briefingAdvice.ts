import type { HomeAssistantState } from '../shared/entities';

export type ChargingStatus = 'charging' | 'connected' | 'idle' | 'unknown';
export type ChargingConfidence = 'confirmed' | 'inferred' | 'unknown' | 'conflict';

export interface ChargingObservation {
  status: ChargingStatus;
  confidence: ChargingConfidence;
  vehicle?: 'andreas' | 'hege';
  powerKw?: number;
}

export interface ChargingAdvice {
  observation: ChargingObservation;
  text: string;
  context: string;
}

export interface Advice {
  id: string;
  prepareAt: string;
  dueAt: string;
  reviewAt: string;
  expiresAt: string;
  category: 'charging';
  severity: 'notice';
  text: string;
  sourceQuality: 'available' | 'stale' | 'unknown' | 'unconfigured';
}

const unavailable = new Set(['', 'unknown', 'unavailable', 'none', 'null']);
const available = (state: HomeAssistantState | undefined): boolean => !!state && !unavailable.has(state.state.trim().toLowerCase());
const numericState = (state: HomeAssistantState | undefined): number | undefined => {
  if (!available(state)) return undefined;
  const value = Number(state?.state);
  return Number.isFinite(value) ? value : undefined;
};
const timestamp = (state: HomeAssistantState | undefined): number | undefined => {
  const values = [state?.last_reported, state?.last_updated, state?.last_changed, state?.attributes.timestamp]
    .filter((value): value is string => typeof value === 'string');
  const parsed = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  return parsed.length ? Math.max(...parsed) : undefined;
};
const fresh = (state: HomeAssistantState | undefined, now: Date, maxAgeMs: number): boolean => {
  const observed = timestamp(state);
  return observed !== undefined && observed <= now.getTime() && now.getTime() - observed <= maxAgeMs;
};
const on = (state: HomeAssistantState | undefined): boolean => state?.state.trim().toLowerCase() === 'on';
const modeSaysCharging = (state: HomeAssistantState | undefined): boolean => {
  const value = state?.state.trim().toLowerCase() ?? '';
  return value.includes('charging') || value === 'charge';
};
const configured = (state: HomeAssistantState | undefined): boolean => !!state?.entity_id;

export const observeCharging = (states: Record<string, HomeAssistantState>, now: Date): ChargingObservation | undefined => {
  const chargerStates = [states.chargerMode, states.chargerPower, states.chargerPlug, states.chargerCharging, states.chargerConnectivity];
  if (!chargerStates.some(configured) && !configured(states.carAndreasChargingPower) && !configured(states.carHegeChargingPower)) return undefined;

  const connectivityKnown = states.chargerConnectivity ? fresh(states.chargerConnectivity, now, 30 * 60_000) && available(states.chargerConnectivity) : true;
  const plugKnown = states.chargerPlug ? fresh(states.chargerPlug, now, 30 * 60_000) && available(states.chargerPlug) : true;
  const chargingKnown = states.chargerCharging ? fresh(states.chargerCharging, now, 30 * 60_000) && available(states.chargerCharging) : true;
  const modeKnown = states.chargerMode ? fresh(states.chargerMode, now, 30 * 60_000) && available(states.chargerMode) : true;
  const powerKnown = states.chargerPower ? fresh(states.chargerPower, now, 30 * 60_000) && numericState(states.chargerPower) !== undefined : true;
  if (![connectivityKnown, plugKnown, chargingKnown, modeKnown, powerKnown].every(Boolean)) return { status: 'unknown', confidence: 'unknown' };

  const chargerPower = numericState(states.chargerPower);
  const powerKw = chargerPower === undefined ? undefined : chargerPower > 100 ? chargerPower / 1000 : chargerPower;
  const homeInUse = (states.chargerPlug ? on(states.chargerPlug) : false)
    && ((states.chargerCharging ? on(states.chargerCharging) : false) || modeSaysCharging(states.chargerMode) || (powerKw ?? 0) > 0.1);
  const homeConnected = states.chargerPlug ? on(states.chargerPlug) : modeSaysCharging(states.chargerMode);

  const andreasPower = numericState(states.carAndreasChargingPower);
  const hegePower = numericState(states.carHegeChargingPower);
  const andreasActive = andreasPower !== undefined && andreasPower > 0.1 && fresh(states.carAndreasChargingPower, now, 30 * 60_000);
  const hegeActive = hegePower !== undefined && hegePower > 0.1 && fresh(states.carHegeChargingPower, now, 30 * 60_000);
  if (!homeInUse) return { status: homeConnected ? 'connected' : 'idle', confidence: 'unknown', powerKw };
  if (andreasActive && hegeActive) return { status: 'charging', confidence: 'conflict', powerKw };
  if (andreasActive) {
    const directVehicle = states.chargerMode?.attributes.vehicle === 'andreas' || states.chargerMode?.attributes.car === 'andreas';
    return { status: 'charging', confidence: directVehicle ? 'confirmed' : 'inferred', vehicle: 'andreas', powerKw };
  }
  if (hegeActive) return { status: 'charging', confidence: 'inferred', vehicle: 'hege', powerKw };
  return { status: 'charging', confidence: 'unknown', powerKw };
};

export const buildChargingAdvice = (states: Record<string, HomeAssistantState>, now: Date, includeUnknown = false): ChargingAdvice | undefined => {
  const observation = observeCharging(states, now);
  if (!observation || (observation.status === 'unknown' && !includeUnknown)) return undefined;
  if (observation.status === 'charging' && observation.vehicle === 'andreas') {
    return {
      observation,
      text: observation.confidence === 'confirmed' ? 'Andreas sin bil lader hjemme.' : 'Det ser ut som Andreas sin bil lader hjemme.',
      context: 'Laderen er tilkoblet og lader nå.',
    };
  }
  if (observation.status === 'charging') return { observation, text: 'Hjemmeladeren er i bruk.', context: 'Får ikke bekreftet hvilken bil som lader.' };
  if (observation.status === 'connected') return { observation, text: 'Hjemmeladeren er tilkoblet, men bilen lader ikke.', context: 'Sjekk kabelen før en tur.' };
  if (observation.status === 'unknown') return { observation, text: 'Får ikke sjekket ladingen nå.', context: 'Se i bilappen før du drar.' };
  return undefined;
};

export const chargingPreparationAdvice = (tripId: string, departureAt: Date, sourceQuality: Advice['sourceQuality'] = 'unknown'): Advice => {
  const departure = departureAt.getTime();
  return {
    id: `charging:${tripId}`,
    prepareAt: new Date(departure - 12 * 60 * 60_000).toISOString(),
    dueAt: new Date(departure - 60 * 60_000).toISOString(),
    reviewAt: new Date(departure - 30 * 60_000).toISOString(),
    expiresAt: departureAt.toISOString(),
    category: 'charging',
    severity: 'notice',
    text: 'Koble til bilen i kveld.',
    sourceQuality,
  };
};
