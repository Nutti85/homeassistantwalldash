export type Reading<T> = {value?:T; observedAt?:string; fetchedAt:string; quality:'available'|'stale'|'unknown'|'unconfigured'};
export type Trip = {id:string;startsAt:string;person?:string;vehicle?:'andreas'|'hege';destination?:string;kind:'commute'|'calendar';minutes?:Reading<number>;distanceKm?:Reading<number>;title?:string};
