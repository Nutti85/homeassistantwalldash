import { useEffect, useRef, type RefObject } from 'react';
import type { DepartureBriefingPayload, DepartureSourceQuality, DepartureTripBriefing, DepartureVehicleSnapshot, DepartureWeatherSnapshot } from '../shared/departureBriefing';

const osloTime = (value?: string): string | undefined => {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' }).format(new Date(value));
};

const duration = (minutes?: number): string => minutes === undefined ? 'Ikke tilgjengelig' : `${minutes} min`;
const chargeDuration = (trip: DepartureTripBriefing): string => trip.chargeEstimate ? `${trip.chargeEstimate.minMinutes}–${trip.chargeEstimate.maxMinutes} min` : 'Ingen lading nødvendig';
const stopLabel = (count?: number): string => count === undefined ? 'Uavklart antall stopp' : `${count} ${count === 1 ? 'ladestopp' : 'ladestopp'}`;
const qualityLabel = (quality: DepartureSourceQuality): string => quality === 'stale' ? 'Gammel status' : quality === 'missing' ? 'Mangler' : quality === 'unavailable' ? 'Utilgjengelig' : '';

const departureLabel = (trip: DepartureTripBriefing, now: Date): string => {
  if (!trip.departureAt || Date.parse(trip.departureAt) <= now.getTime()) return 'Dra nå';
  return `Dra kl. ${osloTime(trip.departureAt) ?? '—'}`;
};

const isActive = (trip: DepartureTripBriefing, now: Date): boolean => {
  const start = Date.parse(trip.eventStartAt);
  const end = trip.eventEndAt ? Date.parse(trip.eventEndAt) : Number.POSITIVE_INFINITY;
  return Number.isFinite(start) && now.getTime() >= start && now.getTime() < end;
};

const isDue = (trip: DepartureTripBriefing, now: Date): boolean => {
  const briefingAt = trip.briefingAt ? Date.parse(trip.briefingAt) : Number.NaN;
  const eventStartAt = Date.parse(trip.eventStartAt);
  return Number.isFinite(briefingAt) && Number.isFinite(eventStartAt) && briefingAt <= now.getTime() && now.getTime() < eventStartAt;
};

const weatherText = (weather?: DepartureWeatherSnapshot): string => {
  if (!weather || weather.quality !== 'fresh' && weather.quality !== 'stale') return weather?.message ?? 'Får ikke hentet været på stedet';
  const temperature = weather.temperatureC === undefined ? 'Temperatur ikke tilgjengelig' : `${weather.temperatureC.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} °C`;
  return [temperature, weather.condition, weather.precipitation, weather.wind].filter(Boolean).join(' · ');
};

const vehicleStatus = (vehicle: DepartureVehicleSnapshot): string => {
  if (vehicle.quality === 'stale' && vehicle.ageMinutes !== undefined) return `Batteridata er ${vehicle.ageMinutes} min gammel`;
  const quality = qualityLabel(vehicle.quality);
  return quality || 'Oppdatert';
};

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const BriefingIcon = ({ children }: { children: string }) => <span className="material-symbols-outlined" aria-hidden="true">{children}</span>;

export function DepartureBriefingModal({ payload, onClose, closeButtonRef, now = new Date() }: { payload: DepartureBriefingPayload; onClose: () => void; closeButtonRef?: RefObject<HTMLButtonElement>; now?: Date }) {
  const internalCloseRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = closeButtonRef ?? internalCloseRef;
  const briefings = [...payload.briefings].sort((left, right) => (Date.parse(left.departureAt ?? left.eventStartAt) || Number.MAX_SAFE_INTEGER) - (Date.parse(right.departureAt ?? right.eventStartAt) || Number.MAX_SAFE_INTEGER));

  useEffect(() => { closeRef.current?.focus(); }, [closeRef]);

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div className="departure-briefing-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="departure-briefing-modal" role="dialog" aria-modal="true" aria-labelledby="departure-briefing-title" onKeyDown={onDialogKeyDown} tabIndex={-1}>
    <header className="departure-briefing-header">
        <div className="departure-briefing-brand"><span className="departure-briefing-orb"><BriefingIcon>north_east</BriefingIcon></span><div><span className="departure-briefing-eyebrow">Klara · avreise</span><h2 id="departure-briefing-title">Avreisebriefing</h2><p>{briefings.length === 1 ? 'Én kommende biltur' : `${briefings.length} samtidige bilturer`}</p></div></div>
        <button ref={closeRef} className="departure-briefing-close" type="button" aria-label="Lukk avreisebriefingen" onClick={onClose}><BriefingIcon>close</BriefingIcon></button>
      </header>
      {payload.conflicts.length > 0 && <section className="departure-briefing-conflicts" aria-labelledby="departure-conflicts-title"><h3 id="departure-conflicts-title">Bilkonflikt</h3>{payload.conflicts.map((conflict) => <p key={conflict}>{conflict}</p>)}</section>}
      <div className="departure-briefing-scroll">
        {briefings.map((trip) => <DepartureTripCard key={trip.tripId} trip={trip} now={now} />)}
      </div>
    </section>
  </div>;
}

function DepartureTripCard({ trip, now }: { trip: DepartureTripBriefing; now: Date }) {
  const delay = trip.delayMinutes && trip.delayMinutes > 0 ? `Forsinket ${trip.delayMinutes} min` : undefined;
  const charge = chargeDuration(trip);
  const total = trip.totalTravelMinutes ?? (trip.outboundDriveMinutes ?? 0) + (trip.returnDriveMinutes ?? 0) + (trip.chargeEstimate?.maxMinutes ?? 0);
  return <article className="departure-trip-card" aria-labelledby={`departure-trip-${trip.tripId}`}>
    <div className="departure-trip-hero"><div><span className="departure-label">Avreise</span><strong>{departureLabel(trip, now)}</strong>{delay && <span className="departure-delay">{delay}</span>}</div><div className="departure-trip-date"><span>{osloTime(trip.eventStartAt)}–{osloTime(trip.eventEndAt) ?? '—'}</span><small>Hendelsen starter</small></div></div>
    <header className="departure-trip-heading"><div><span className="departure-trip-eyebrow">{trip.eventTitle}</span><h3 id={`departure-trip-${trip.tripId}`}>{trip.destination}</h3></div><span className="departure-trip-icon"><BriefingIcon>location_on</BriefingIcon></span></header>
    <div className="departure-travel-facts" aria-label="Reisetid og lading"><div><span>Kjøring</span><strong>{duration(trip.outboundDriveMinutes)}</strong></div><div><span>Lading <em>Anslag</em></span><strong>{charge}</strong><small>{stopLabel(trip.chargeStopCount)}</small></div><div><span>Total reisetid</span><strong>{duration(total)}</strong></div></div>
    {trip.warnings?.map((warning) => <p className="departure-trip-warning" key={warning}><BriefingIcon>warning</BriefingIcon>{warning}</p>)}
    {trip.sourceNotes?.map((note) => <p className="departure-trip-note" key={note}><BriefingIcon>info</BriefingIcon>{note}</p>)}
    <section className="departure-vehicles" aria-labelledby={`departure-vehicles-${trip.tripId}`}><div className="departure-section-heading"><h4 id={`departure-vehicles-${trip.tripId}`}>Biler</h4><span>Foreslått bil kan endres</span></div><div className="departure-vehicle-grid">{trip.vehicles.map((vehicle) => <DepartureVehicleCard key={vehicle.id} vehicle={vehicle} recommended={vehicle.id === trip.suggestedVehicle || vehicle.recommended === true} />)}</div></section>
    <div className="departure-weather-grid"><DepartureWeatherCard title="Hjemme ved avreise" weather={trip.homeWeather}/><DepartureWeatherCard title="På destinasjonen" weather={trip.destinationWeather}/></div>
    <footer className="departure-trip-footer"><div><span>Hjemkomst</span><strong>{trip.estimatedHomeAt ? `Hjemme ca. ${osloTime(trip.estimatedHomeAt)}` : 'Retur er ikke beregnet'}</strong></div><div><span>Bekledning</span><strong>{trip.clothingAdvice ? trip.clothingAdvice : 'Bekledning: Ikke tilgjengelig'}</strong></div></footer>
  </article>;
}

function DepartureVehicleCard({ vehicle, recommended }: { vehicle: DepartureVehicleSnapshot; recommended: boolean }) {
  return <div className={`departure-vehicle-card${recommended ? ' departure-vehicle-recommended' : ''}`}><div className="departure-vehicle-heading"><strong>{vehicle.name}</strong>{recommended && <span>Foreslått</span>}</div><div className="departure-vehicle-values"><div><span>SoC</span><strong>{vehicle.socPercent === undefined ? '—' : `${vehicle.socPercent} %`}</strong></div><div><span>Rekkevidde</span><strong>{vehicle.rangeKm === undefined ? '—' : `${vehicle.rangeKm} km`}</strong></div></div><small className={vehicle.quality === 'stale' ? 'departure-stale' : ''}>{vehicleStatus(vehicle)}</small></div>;
}

function DepartureWeatherCard({ title, weather }: { title: string; weather?: DepartureWeatherSnapshot }) {
  return <section className={`departure-weather-card${weather?.quality === 'missing' || weather?.quality === 'unavailable' || !weather ? ' departure-weather-missing' : ''}`}><h4>{title}</h4><p>{weatherText(weather)}</p>{weather?.quality === 'stale' && <small>{weather.ageMinutes ? `Værdata er ${weather.ageMinutes} min gammel` : 'Værdata er gammel'}</small>}</section>;
}

export function DepartureBriefingStatus({ briefings, onOpen, buttonRef, now = new Date() }: { briefings: DepartureTripBriefing[]; onOpen: () => void; buttonRef?: RefObject<HTMLButtonElement>; now?: Date }) {
  const active = briefings.find((trip) => isActive(trip, now));
  const due = active ?? briefings.find((trip) => isDue(trip, now));
  if (!due) return null;
  const statusLabel = active ? 'Aktiv reise' : 'Avreise snart';
  return <button ref={buttonRef} className="departure-briefing-status" type="button" aria-label={active ? 'Åpne aktiv avreisebriefing' : 'Åpne avreisebriefing'} onClick={onOpen}><span className="departure-status-dot" aria-hidden="true"/><span><strong>{statusLabel}</strong><small>{due.destination}</small></span><BriefingIcon>north_east</BriefingIcon></button>;
}
