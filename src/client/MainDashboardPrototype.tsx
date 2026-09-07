// PROTOTYPE V3: the selected time-zone direction, with scenario controls in ?scenario=.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DashboardAction, HomeAssistantState, MyKidKindergartenItem } from '../shared/entities';
import type { DepartureBriefingPayload } from '../shared/departureBriefing';
import { calendarEvents, forecastPoints, jacobWeeklyPlan, mykidKindergarten, stateValue } from './dashboardModel';
import { buildLiveBriefingViewModel, currentLiveBriefingMode } from './briefingModel';
import { classifyClimateValue, type ClimateMetric, type ClimateRoomType } from './roomClimate';

const Icon = ({ children, filled = false }: { children: string; filled?: boolean }) => <span className="material-symbols-outlined" style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden="true">{children}</span>;
const numberState = (state?: HomeAssistantState) => { const value = Number(stateValue(state)); return Number.isFinite(value) ? value : undefined; };
const reading = (value: number | undefined, unit = '') => value === undefined ? '—' : `${value.toLocaleString('nb-NO', { maximumFractionDigits: 1 })}${unit}`;
const dayKey = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });
const dayLabel = (date: Date, now: Date) => dayKey(date) === dayKey(now) ? 'I dag' : dayKey(date) === dayKey(new Date(now.getTime() + 86_400_000)) ? 'I morgen' : date.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' });
const timeLabel = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '';

type Scenario = 'calm' | 'arrival' | 'doorbell' | 'warning';
type Period = 'now' | 'later' | 'tomorrow' | 'week';
type Detail = { title: string; icon: string; body: ReactNode };
type PrototypeProps = {
  states: Record<string, HomeAssistantState>;
  showWeather: () => void;
  openLights: () => void;
  openHeatPump: () => void;
  openVacuum: () => void;
  openVehicles: () => void;
  openMode: () => void;
  openKlaraAi: () => void;
  openDeparture: () => void;
  hasDepartureBriefing: boolean;
  departureBriefings?: DepartureBriefingPayload;
  action: (key: DashboardAction) => void;
};

const roomDefinitions: Array<{ id: string; name: string; icon: string; type: ClimateRoomType; values: Array<[string, ClimateMetric, string, string]> }> = [
  { id: 'living', name: 'Stue', icon: 'weekend', type: 'living_room', values: [['Temperatur', 'temperature', 'roomLiving', '°'], ['Fukt', 'humidity', 'roomLivingHumidity', ' %'], ['CO₂', 'co2', 'roomLivingCo2', ' ppm']] },
  { id: 'bedroom', name: 'Soverom HA', icon: 'bed', type: 'bedroom', values: [['Temperatur', 'temperature', 'roomBedroom', '°'], ['Fukt', 'humidity', 'roomBedroomHumidity', ' %'], ['CO₂', 'co2', 'roomBedroomCo2', ' ppm']] },
  { id: 'jacob', name: 'Soverom Jacob', icon: 'child_care', type: 'bedroom', values: [['Temperatur', 'temperature', 'roomBathroom', '°'], ['Fukt', 'humidity', 'roomBathroomHumidity', ' %'], ['CO₂', 'co2', 'roomBathroomCo2', ' ppm']] },
  { id: 'bathroom', name: 'Bad', icon: 'bathroom', type: 'bathroom', values: [['Temperatur', 'temperature', 'roomFirstFloorBathroom', '°'], ['Fukt', 'humidity', 'roomFirstFloorBathroomHumidity', ' %']] },
];

function Surface({ icon, eyebrow, title, className = '', onClick, headerAction, children }: { icon: string; eyebrow?: string; title: string; className?: string; onClick?: () => void; headerAction?: () => void; children: ReactNode }) {
  const content = <><header><span className="ppf-surface-icon"><Icon>{icon}</Icon></span><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div>{headerAction ? <button type="button" className="ppf-surface-open" aria-label={`Vis detaljer for ${title}`} onClick={headerAction}><Icon>arrow_outward</Icon></button> : onClick && <Icon>arrow_outward</Icon>}</header>{children}</>;
  return onClick ? <button type="button" className={`ppf-surface ${className}`} onClick={onClick}>{content}</button> : <section className={`ppf-surface ${className}`}>{content}</section>;
}

function FutureHorizon({ period, setPeriod }: { period: Period; setPeriod: (value: Period) => void }) {
  const periods: Array<[Period, string]> = [['later', 'Resten av dagen'], ['tomorrow', 'I morgen'], ['week', '7 dager']];
  return <div className="ppf-future-horizon" role="tablist" aria-label="Velg hvor langt frem kalenderen skal vise">{periods.map(([value, label]) => <button type="button" role="tab" aria-selected={period === value} className={period === value ? 'is-active' : ''} key={value} onClick={() => setPeriod(value)}>{label}</button>)}</div>;
}

function WeatherFocus({ states, showWeather }: Pick<PrototypeProps, 'states' | 'showWeather'>) {
  const now = new Date();
  const model = buildLiveBriefingViewModel(currentLiveBriefingMode(now), states, now);
  const metric = (id: 'weather' | 'temperature' | 'wind' | 'rain' | 'clothing') => model.metrics.find((item) => item.id === id)!;
  const weather = metric('weather'); const temperature = metric('temperature'); const wind = metric('wind'); const rain = metric('rain'); const clothing = metric('clothing');
  const direction = stateValue(states.netatmoWindDirection) ?? '—';
  const clothingIcons = [clothing.icon, ...(/regntøy|paraply/i.test(clothing.context) ? ['umbrella'] : []), ...(/vindtett/i.test(clothing.context) ? ['air'] : [])];
  return <Surface icon="partly_cloudy_day" eyebrow={model.period.label} title="Vær og forhold" className="ppf-weather" onClick={showWeather}>
    <div className="ppf-weather-tiles">
      <span><Icon>{weather.icon}</Icon><small>Vær</small><b>{weather.value}</b><em>{weather.context}</em></span>
      <span><Icon>thermostat</Icon><small>Temperatur</small><b>{temperature.value}</b><em>{temperature.context}</em></span>
      <span><Icon>air</Icon><small>Vind</small><b>{wind.value}</b><em>{direction} · {wind.context}</em></span>
      <span><Icon>rainy</Icon><small>Regn</small><b>{rain.value}</b><em>{rain.context}</em></span>
      <span className="ppf-clothing-tile" role="img" aria-label={`${clothing.value}. ${clothing.context}`} title={`${clothing.value}. ${clothing.context}`}><small>Klær</small><b className="ppf-clothing-icons">{clothingIcons.map((icon, index) => <Icon key={`${icon}-${index}`}>{icon}</Icon>)}</b></span>
    </div>
  </Surface>;
}

function UrgentStrip({ states, scenario, openDetail }: { states: PrototypeProps['states']; scenario: Scenario; openDetail: (detail: Detail) => void }) {
  const lightning = numberState(states.lightningDistance);
  const items = [
    ...(scenario === 'warning' || (lightning !== undefined && lightning < 15) ? [{ icon: 'thunderstorm', title: 'Lyn i nærheten', text: `${reading(scenario === 'warning' ? 7.4 : lightning, ' km')} til nærmeste registrerte lyn` }] : []),
    ...(scenario === 'warning' || stateValue(states.frontDoorLock) === 'unlocked' ? [{ icon: 'lock_open', title: 'Ytterdøren er ulåst', text: 'Sist endret for 8 minutter siden' }] : []),
    ...(scenario === 'warning' ? [{ icon: 'electric_car', title: 'Lading stoppet', text: 'Peugeot · kontroller Zaptec-kabelen' }] : []),
  ];
  if (!items.length) return null;
  return <aside className="ppf-urgent" aria-label="Viktig nå">{items.map((item) => <button type="button" key={item.title} onClick={() => openDetail({ title: item.title, icon: item.icon, body: <p>{item.text}. Dette er en prototype på hvordan varselet kan utvides med kilde, tidspunkt og anbefalt handling.</p> })}><Icon>{item.icon}</Icon><span><strong>{item.title}</strong><small>{item.text}</small></span><Icon>chevron_right</Icon></button>)}</aside>;
}

function ArrivalEvidence({ scenario, openDetail }: { scenario: Scenario; openDetail: (detail: Detail) => void }) {
  if (scenario !== 'arrival') return null;
  return <Surface icon="videocam" eyebrow="Kamera utløst" title="Aktivitet ved huset" className="ppf-camera-activity">
    <div className="ppf-capture-row">{[
      { time: '14:42', title: 'Bil registrert', path: '/api/courtyard-camera/stream', icon: 'directions_car' },
      { time: '16:08', title: 'Person ved inngangen', path: '/api/camera/stream', icon: 'person' },
    ].map((capture) => <button type="button" key={capture.time} onClick={() => openDetail({ title: capture.title, icon: capture.icon, body: <div className="ppf-large-capture"><img src={capture.path} alt={capture.title}/><p>Frigate-hendelse · {capture.time}. I en produksjonsversjon vises lagret snapshot, sone, kamera og hendelsesvarighet her.</p></div> })}><img src={capture.path} alt=""/><span><b>{capture.time}</b><small>{capture.title}</small></span></button>)}</div>
  </Surface>;
}

function DeparturePreview({ payload, openDeparture }: { payload?: DepartureBriefingPayload; openDeparture: () => void }) {
  const trip = payload?.briefings[0];
  if (!trip) return null;
  const departure = trip.departureAt ? timeLabel(trip.departureAt) : undefined;
  return <button type="button" className="ppf-departure-preview" onClick={openDeparture}><span className="ppf-surface-icon"><Icon>route</Icon></span><span><small>Avreisebriefing klar</small><strong>{trip.eventTitle}</strong><em>{departure ? `Dra ca. ${departure}` : 'Åpne for reisetid, bilvalg og vær'}</em></span><Icon>chevron_right</Icon></button>;
}

type AgendaItem = { source: 'Felles' | 'Jacob' | 'Nicolai'; title: string; detail?: string; date: Date; end?: Date; time?: string; allDay?: boolean; briefing?: boolean };
type FamilyMessage = { source: 'Jacob' | 'Nicolai'; title: string; body?: string; date?: string };
const isMessageLike = (item: { title: string; details?: string }) => /god helg|i dag har vi|vi var |nyhetsbrev|brev|oppslag|referat|ukeplan|informasjon fra/i.test(item.title) || (item.details?.length ?? 0) > 140;
const practicalKindergartenSignals = /\b(?:tur(?:dag)?|utflukt|skitur|ski(?:dag)?|svømm(?:ing)?|foreldremøte|foreldresamtale|planleggingsdag|dugnad|temadag|sommerfest|juleavslutning|avslutning|karneval|teater|konsert|fotografering|overnatting|sovedag|stengt|fridag|husk|ta med|medbring|lever(?:e|ing)?|hent(?:e|ing)?|påmelding|klær|utstyr|sekk|matpakke|regntøy|gummistøvler|badetøy)\b/i;
const isPracticalKindergartenItem = (item: MyKidKindergartenItem) => practicalKindergartenSignals.test(`${item.title} ${item.details ?? ''}`);
const planDate = (date: string, time?: string): Date => {
  if (time && !Number.isNaN(Date.parse(time))) return new Date(time);
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  return new Date(`${date}T${match ? `${match[1].padStart(2, '0')}:${match[2]}:00` : '12:00:00'}`);
};
const planTime = (time?: string): string | undefined => time && !Number.isNaN(Date.parse(time)) ? timeLabel(time) : time;
function agendaItems(states: PrototypeProps['states'], now: Date): AgendaItem[] {
  const calendar = calendarEvents(states.calendar).flatMap((event): AgendaItem[] => {
    if (Number.isNaN(Date.parse(event.start))) return [];
    const end = event.end && !Number.isNaN(Date.parse(event.end)) ? new Date(event.end) : undefined;
    return [{ source: 'Felles', title: event.title, date: new Date(event.start), end, time: event.allDay ? 'Hele dagen' : timeLabel(event.start), allDay: event.allDay, detail: event.allDay ? 'Felles kalender' : `${timeLabel(event.start)}–${timeLabel(event.end)}`, briefing: /reise|fly|tog|ferie|tur/i.test(event.title) }];
  });
  const school = jacobWeeklyPlan(states.jacobWeeklyPlan);
  const schoolItems = [...(school?.events ?? []), ...(school?.reminders ?? []), ...(school?.homework ?? [])].flatMap((item): AgendaItem[] => !item.date || Number.isNaN(Date.parse(item.date)) ? [] : [{ source: 'Jacob', title: item.title, detail: item.details ?? item.subject, date: planDate(item.date, item.time), time: planTime(item.time), allDay: !item.time }]);
  const kindergarten = mykidKindergarten(states.mykidKindergarten);
  const kinderItems = [...(kindergarten?.today ?? []), ...(kindergarten?.events ?? [])].filter(isPracticalKindergartenItem).flatMap((item: MyKidKindergartenItem): AgendaItem[] => !item.date || Number.isNaN(Date.parse(item.date)) ? [] : [{ source: 'Nicolai', title: item.title, detail: item.details, date: planDate(item.date, item.time), time: planTime(item.time), allDay: !item.time }]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const future = [...calendar, ...schoolItems, ...kinderItems].filter((item) => item.allDay ? item.date.getTime() >= today.getTime() : (item.end ?? item.date).getTime() >= now.getTime()).sort((a, b) => a.date.getTime() - b.date.getTime() || (a.time ?? '').localeCompare(b.time ?? ''));
  return future.length ? future : [
    { source: 'Jacob', title: 'Gym · husk innesko', detail: 'Ta med gymtøy og drikkeflaske', date: now, time: '10:15' },
    { source: 'Nicolai', title: 'Turdag og varmmat', detail: 'Klær etter været. Mat serveres i barnehagen.', date: new Date(now.getTime() + 86_400_000), time: '09:30' },
    { source: 'Felles', title: 'Familiebesøk i Oslo', detail: 'Avreise etter frokost', date: new Date(now.getTime() + 2 * 86_400_000), time: '10:00', briefing: true },
  ];
}

function familyMessages(states: PrototypeProps['states']): FamilyMessage[] {
  const kindergarten = mykidKindergarten(states.mykidKindergarten);
  const kindergartenMessages = [...(kindergarten?.noticeboard ?? []), ...(kindergarten?.newsletters ?? []), ...(kindergarten?.weeklyPlans ?? []), ...(kindergarten?.today ?? []).filter(isMessageLike), ...(kindergarten?.events ?? []).filter(isMessageLike)]
    .map((item) => ({ source: 'Nicolai' as const, title: item.title, body: item.details, date: item.date ?? item.published_at }));
  const school = jacobWeeklyPlan(states.jacobWeeklyPlan);
  const schoolMessages = (school?.messages ?? []).map((message) => ({ source: 'Jacob' as const, title: message.length > 54 ? `${message.slice(0, 51)}…` : message, body: message, date: school?.source_updated_at }));
  const messages = [...new Map([...kindergartenMessages, ...schoolMessages]
    .map((message) => [`${message.source}:${message.title}:${message.body ?? ''}`, message])).values()]
    .sort((a, b) => (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0));
  return messages.length ? messages : [{ source: 'Nicolai', title: 'God helg til dere alle! ❤️', body: 'Et lite brev fra barnehagen om uken som har gått.' }];
}

function MessagesArea({ states, openDetail }: { states: PrototypeProps['states']; openDetail: (detail: Detail) => void }) {
  const messages = familyMessages(states).slice(0, 3);
  return <Surface icon="mark_email_unread" eyebrow="Brev og oppdateringer" title="Nye beskjeder" className="ppf-messages"><div className="ppf-message-list">{messages.map((message, index) => <button type="button" key={`${message.source}-${message.title}-${index}`} onClick={() => openDetail({ title: message.title, icon: message.source === 'Jacob' ? 'school' : 'child_care', body: <><p>{message.body ?? 'Ingen flere detaljer er registrert.'}</p><dl className="ppf-detail-list"><div><dt>Gjelder</dt><dd>{message.source}</dd></div><div><dt>Mottatt</dt><dd>{message.date ? dayLabel(new Date(message.date), new Date()) : 'Nylig'}</dd></div></dl></> })}><span className={`ppf-source ppf-source-${message.source.toLowerCase()}`}>{message.source}</span><span><strong>{message.title}</strong><small>{message.body ?? 'Trykk for å lese hele beskjeden'}</small></span><Icon>chevron_right</Icon></button>)}</div></Surface>;
}

function Agenda({ states, period, openDetail, openDeparture, hasDepartureBriefing }: Pick<PrototypeProps, 'states' | 'openDeparture' | 'hasDepartureBriefing'> & { period: Period; openDetail: (detail: Detail) => void }) {
  const now = new Date();
  const items = agendaItems(states, now);
  const filtered = items.filter((item) => period === 'now' || period === 'later' ? dayKey(item.date) === dayKey(now) : period === 'tomorrow' ? dayKey(item.date) === dayKey(new Date(now.getTime() + 86_400_000)) : item.date.getTime() < now.getTime() + 7 * 86_400_000);
  const visible = filtered.slice(0, period === 'week' ? 1 : 2);
  const grouped = Object.entries(visible.reduce<Record<string, AgendaItem[]>>((days, item) => { (days[dayKey(item.date)] ??= []).push(item); return days; }, {}));
  const openAll = () => openDetail({ title: period === 'week' ? 'Dette skjer de neste 7 dagene' : period === 'tomorrow' ? 'Dette skjer i morgen' : 'Dette skjer resten av dagen', icon: 'calendar_month', body: <div className="ppf-agenda-modal-list">{filtered.map((item, index) => <div key={`${item.source}-${item.title}-${index}`}><span className={`ppf-source ppf-source-${item.source.toLowerCase()}`}>{item.source}</span><span><small>{dayLabel(item.date, now)} · {item.time || 'Hele dagen'}</small><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}</span></div>)}</div> });
  return <Surface icon="calendar_month" eyebrow="Neste" title={period === 'week' ? 'Dette skjer denne uken' : 'Det familien må vite'} className="ppf-agenda">
    <div className="ppf-agenda-days">{grouped.length ? grouped.map(([key, dayItems]) => <section key={key}><h3>{dayLabel(dayItems![0].date, now)}</h3><div>{dayItems!.map((item, index) => <button type="button" key={`${item.source}-${item.title}-${index}`} onClick={() => item.briefing && hasDepartureBriefing ? openDeparture() : openDetail({ title: item.title, icon: item.source === 'Jacob' ? 'school' : item.source === 'Nicolai' ? 'child_care' : 'event', body: <><p>{item.detail ?? 'Ingen flere detaljer er registrert.'}</p><dl className="ppf-detail-list"><div><dt>Kilde</dt><dd>{item.source}</dd></div><div><dt>Tid</dt><dd>{item.time || 'Hele dagen'}</dd></div></dl></> })}><span className={`ppf-source ppf-source-${item.source.toLowerCase()}`}>{item.source}</span><span><b>{item.time || 'Hele dagen'}</b><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span>{(item.briefing || (hasDepartureBriefing && /reise|tur/i.test(item.title))) && <em title="Reisebriefing tilgjengelig"><Icon>route</Icon></em>}<Icon>chevron_right</Icon></button>)}</div></section>) : <p className="ppf-empty">Ingenting planlagt i denne perioden.</p>}{filtered.length > visible.length && <button type="button" className="ppf-agenda-more" onClick={openAll}>+{filtered.length - visible.length} flere <Icon>arrow_outward</Icon></button>}</div>
  </Surface>;
}

function PrepareCard({ states }: { states: PrototypeProps['states'] }) {
  const tomorrow = agendaItems(states, new Date()).find((item) => dayKey(item.date) === dayKey(new Date(Date.now() + 86_400_000)));
  const snowy = forecastPoints(states.weatherDaily).some((point) => /snow/i.test(point.condition ?? ''));
  const text = snowy ? 'Legg frem varme klær i kveld. Det kan komme snø, så beregn litt ekstra tid i morgen.' : tomorrow ? `Gjør klart det dere trenger til «${tomorrow.title}» i kveld${tomorrow.source !== 'Felles' ? ` for ${tomorrow.source}` : ''}.` : 'Det er ingenting som trenger forberedelse akkurat nå.';
  return <Surface icon="auto_awesome" eyebrow="Klara foreslår" title="Forbered dette" className="ppf-prepare"><p>{text}</p><small className="ppf-ai-note"><Icon>info</Icon>Forslag basert på kalender og vær · kontroller viktige detaljer</small></Surface>;
}

function RoomExceptions({ states, openDetail }: { states: PrototypeProps['states']; openDetail: (detail: Detail) => void }) {
  const rooms = roomDefinitions.flatMap((room) => {
    const readings = room.values.map(([label, metric, key, unit]) => ({ label, metric, value: numberState(states[key]), unit, status: classifyClimateValue(numberState(states[key]), metric, room.type) }));
    const exceptions = readings.filter((item) => item.status !== 'good' && item.value !== undefined);
    return exceptions.length ? [{ ...room, readings, exceptions }] : [];
  });
  const visible = rooms.length ? rooms : [{ ...roomDefinitions[2], readings: [{ label: 'CO₂', metric: 'co2' as const, value: 1180, unit: ' ppm', status: 'high_warning' as const }], exceptions: [{ label: 'CO₂', metric: 'co2' as const, value: 1180, unit: ' ppm', status: 'high_warning' as const }] }];
  const roomSummary = <div className="ppf-room-summary">{visible.map((room) => <section key={room.id}><h3><Icon>{room.icon}</Icon>{room.name}</h3><div className="ppf-room-details">{room.readings.map((item) => <span key={item.label}><small>{item.label}</small><b>{reading(item.value, item.unit)}</b></span>)}</div></section>)}</div>;
  return <Surface icon="home_health" eyebrow="Avvik først" title="Rom som trenger oppmerksomhet" className="ppf-rooms" headerAction={() => openDetail({ title: 'Rom som trenger oppmerksomhet', icon: 'home_health', body: roomSummary })}><div className="ppf-room-list">{visible.slice(0, 3).map((room) => <button type="button" key={room.id} onClick={() => openDetail({ title: room.name, icon: room.icon, body: <div className="ppf-room-details">{room.readings.map((item) => <span key={item.label}><small>{item.label}</small><b>{reading(item.value, item.unit)}</b></span>)}</div> })}><Icon>{room.icon}</Icon><span><strong>{room.name}</strong><small>{room.exceptions.map((item) => `${item.label} ${reading(item.value, item.unit)}`).join(' · ')}</small></span><i/><Icon>chevron_right</Icon></button>)}</div></Surface>;
}

function ContextNudges({ states, openVehicles, openDetail }: Pick<PrototypeProps, 'states' | 'openVehicles'> & { openDetail: (detail: Detail) => void }) {
  const now = new Date();
  const workdayMorning = now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() < 10;
  const batteries = [{ name: 'Mercedes', value: numberState(states.carAndreasBattery) }, { name: 'Peugeot', value: numberState(states.carHegeBattery) }];
  const low = batteries.find((car) => car.value !== undefined && car.value < 30);
  const power = numberState(states.energyPower); const price = numberState(states.energyPrice);
  return <div className="ppf-nudges">{workdayMorning && <button type="button" onClick={openVehicles}><Icon>route</Icon><span><small>Til jobb nå</small><b>{reading(numberState(states.andreasTravelTime), ' min')}</b></span></button>}{low && <button type="button" className="is-warning" onClick={openVehicles}><Icon>battery_alert</Icon><span><small>{low.name}</small><b>{reading(low.value, ' %')}</b></span></button>}<button type="button" onClick={() => openDetail({ title: 'Strøm akkurat nå', icon: 'bolt', body: <><p>Huset bruker {reading(power === undefined ? undefined : power / 1000, ' kW')} akkurat nå. Strømprisen er {reading(price, ' kr/kWh')}.</p><dl className="ppf-detail-list"><div><dt>Effekt nå</dt><dd>{reading(power === undefined ? undefined : power / 1000, ' kW')}</dd></div><div><dt>Pris</dt><dd>{reading(price, ' kr/kWh')}</dd></div></dl></> })}><Icon>bolt</Icon><span><small>{price !== undefined && price < .8 ? 'Fint tidspunkt å bruke strøm' : 'Strøm akkurat nå'}</small><b>{reading(power === undefined ? undefined : power / 1000, ' kW')} · {reading(price, ' kr')}</b></span><Icon>arrow_outward</Icon></button></div>;
}

function BottomControls(props: PrototypeProps) {
  const locked = stateValue(props.states.frontDoorLock) === 'locked';
  const securityOn = Number(stateValue(props.states.securityMode)) > 0;
  const controls: Array<[string, string, () => void]> = [['lightbulb', 'Lys', props.openLights], ['mode_fan', 'Klima', props.openHeatPump], ['vacuum', 'Støvsuger', props.openVacuum], ['directions_car', 'Biler', props.openVehicles], ['tune', 'Modus', props.openMode], ['auto_awesome', 'Klara', props.openKlaraAi]];
  return <nav className="ppf-bottom-controls" aria-label="Hjemkontroller"><div className="ppf-home-controls">{controls.map(([icon, label, action]) => <button type="button" key={label} onClick={action}><Icon>{icon}</Icon><span>{label}</span></button>)}</div><div className="ppf-safety-controls" aria-label="Sikkerhet"><button type="button" className={locked ? 'is-active' : ''} onClick={() => props.action(locked ? 'unlockDoor' : 'lockDoor')}><Icon>{locked ? 'lock' : 'lock_open'}</Icon><span>{locked ? 'Låst' : 'Lås døren'}</span></button><button type="button" className={securityOn ? 'is-active' : ''} onClick={() => props.action('securityMode')}><Icon>shield</Icon><span>{securityOn ? 'Overvåket' : 'Start overvåking'}</span></button></div></nav>;
}

function PrototypeSwitcher({ scenario }: { scenario: Scenario }) {
  const scenarios: Scenario[] = ['calm', 'arrival', 'doorbell', 'warning'];
  const update = (nextScenario: Scenario) => { const params = new URLSearchParams(window.location.search); params.set('variant', 'C'); params.set('scenario', nextScenario); window.history.replaceState({}, '', `${window.location.pathname}?${params}`); window.dispatchEvent(new PopStateEvent('popstate')); };
  return <aside className="ppf-prototype-switcher" aria-label="Prototypescenario"><span><small>Prototype v3</small><b>C · Tidssoner</b></span><select aria-label="Vis dynamisk tilstand" value={scenario} onChange={(event) => update(event.target.value as Scenario)}>{scenarios.map((value) => <option key={value} value={value}>{value === 'calm' ? 'Rolig' : value === 'arrival' ? 'Kameraer utløst' : value === 'doorbell' ? 'Ringeklokke' : 'Varsler'}</option>)}</select></aside>;
}

function DetailModal({ detail, close }: { detail: Detail; close: () => void }) {
  return <div className="ppf-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="ppf-modal" role="dialog" aria-modal="true" aria-label={detail.title}><header><span><Icon>{detail.icon}</Icon></span><h2>{detail.title}</h2><button type="button" aria-label="Lukk" onClick={close}><Icon>close</Icon></button></header><div>{detail.body}</div></section></div>;
}

export function MainDashboardPrototype(props: PrototypeProps) {
  const readQuery = () => { const params = new URLSearchParams(window.location.search); return { scenario: (['calm', 'arrival', 'doorbell', 'warning'].includes(params.get('scenario') ?? '') ? params.get('scenario') : 'calm') as Scenario, showScenarioControls: import.meta.env.DEV || params.has('scenario') }; };
  const [query, setQuery] = useState(readQuery);
  const [period, setPeriod] = useState<Period>('later');
  const [detail, setDetail] = useState<Detail>();
  const [doorbellOpen, setDoorbellOpen] = useState(query.scenario === 'doorbell');
  useEffect(() => { document.documentElement.classList.add('prototype-active'); document.body.classList.add('prototype-active'); const sync = () => setQuery(readQuery()); window.addEventListener('popstate', sync); return () => { document.documentElement.classList.remove('prototype-active'); document.body.classList.remove('prototype-active'); window.removeEventListener('popstate', sync); }; }, []);
  useEffect(() => setDoorbellOpen(query.scenario === 'doorbell'), [query.scenario]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDetail(undefined); setDoorbellOpen(false); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  const now = useMemo(() => new Date(), [period]);
  const isWorkday = now.getDay() >= 1 && now.getDay() <= 5;
  const common = { states: props.states, period, openDetail: setDetail };
  const header = <header className="ppf-v3-header"><div className="ppf-v3-brand"><span><Icon filled>auto_awesome</Icon></span><div><small>Klara AI</small><strong>Hjemmeoversikt</strong></div></div><time><b>{now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</b><span>{now.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}</span></time><div className="ppf-v3-day"><i/><span><small>I dag</small><strong>{isWorkday ? 'Arbeidsdag' : 'Fridag'}</strong></span></div></header>;
  const weather = <WeatherFocus states={props.states} showWeather={props.showWeather}/>;
  const agenda = <Agenda {...common} openDeparture={props.openDeparture} hasDepartureBriefing={props.hasDepartureBriefing}/>;
  const past = <p className="ppf-stream-empty">Ingen hendelser som trenger oppmerksomhet.</p>;
  const cameras = <ArrivalEvidence scenario={query.scenario} openDetail={setDetail}/>;
  const rooms = <RoomExceptions states={props.states} openDetail={setDetail}/>;
  const prepare = <PrepareCard states={props.states}/>;
  const nudges = <ContextNudges states={props.states} openVehicles={props.openVehicles} openDetail={setDetail}/>;
  const messages = <MessagesArea states={props.states} openDetail={setDetail}/>;
  return <div className={`main-dashboard-prototype ppf-variant-c ppf-scenario-${query.scenario}`}>
    <UrgentStrip states={props.states} scenario={query.scenario} openDetail={setDetail}/>
    <div className="ppf-c-head">{header}</div><div className="ppf-c-zones"><section className="ppf-zone ppf-zone-past"><h2><Icon>history</Icon>Det som har skjedd</h2>{past}{messages}</section><section className="ppf-zone ppf-zone-now"><h2><Icon>radio_button_checked</Icon>Akkurat nå</h2>{cameras}{weather}{nudges}{rooms}</section><section className="ppf-zone ppf-zone-future"><div className="ppf-zone-heading"><h2><Icon>east</Icon>Dette skjer</h2><FutureHorizon period={period} setPeriod={setPeriod}/></div><DeparturePreview payload={props.departureBriefings} openDeparture={props.openDeparture}/>{agenda}{prepare}</section></div>
    <BottomControls {...props}/>
    {query.showScenarioControls && <PrototypeSwitcher scenario={query.scenario}/>}
    {detail && <DetailModal detail={detail} close={() => setDetail(undefined)}/>} 
    {doorbellOpen && <div className="ppf-doorbell-backdrop"><section className="ppf-doorbell-modal" role="dialog" aria-modal="true" aria-label="Noen ringer på"><header><span><i/>Ringeklokke · nå</span><button type="button" aria-label="Lukk kamera" onClick={() => setDoorbellOpen(false)}><Icon>close</Icon></button></header><img src="/api/camera/stream" alt="Direktevideo fra ringeklokke"/><footer><Icon>doorbell</Icon><span><strong>Noen ringer på</strong><small>Direkte fra Reolink</small></span></footer></section></div>}
  </div>;
}
