import { useEffect, useRef, useState } from 'react';
import type { DashboardAction, HomeAssistantState } from '../shared/entities';
import * as browserApi from './api';
import { booleanLabel, homeLabel, temperatureNumber, temperatureValue } from './dashboardModel';

export interface DashboardApi {
  getStates(): Promise<{ states: Record<string, HomeAssistantState> }>;
  runAction(action: DashboardAction, option?: 'Hjemme' | 'Borte'): Promise<{ states: Record<string, HomeAssistantState> }>;
  setTemperature(temperature: number): Promise<{ states: Record<string, HomeAssistantState> }>;
}

const updateError = 'Kunne ikke oppdatere smarthuset. Prøv igjen.';
const Icon = ({ children, filled = false }: { children: string; filled?: boolean }) => <span className="material-symbols-outlined" style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden="true">{children}</span>;

export default function App({ api = browserApi }: { api?: DashboardApi }) {
  const [states, setStates] = useState<Record<string, HomeAssistantState>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repairOpen, setRepairOpen] = useState(false);
  const repairButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasRepairOpen = useRef(false);

  useEffect(() => {
    let active = true;
    api.getStates().then(({ states: confirmed }) => { if (active) setStates(confirmed); }, () => { if (active) setErrors({ load: updateError }); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!repairOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRepairOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [repairOpen]);
  useEffect(() => { if (!repairOpen && wasRepairOpen.current) repairButton.current?.focus(); wasRepairOpen.current = repairOpen; }, [repairOpen]);

  const confirm = async (key: string, operation: () => Promise<{ states: Record<string, HomeAssistantState> }>) => {
    setPending((current) => ({ ...current, [key]: true }));
    setErrors((current) => ({ ...current, [key]: '' }));
    try { const { states: confirmed } = await operation(); setStates((current) => ({ ...current, ...confirmed })); }
    catch { setErrors((current) => ({ ...current, [key]: updateError })); }
    finally { setPending((current) => { const { [key]: _done, ...remaining } = current; return remaining; }); }
  };
  const action = (key: DashboardAction, option?: 'Hjemme' | 'Borte') => { void confirm(key, () => api.runAction(key, option)); };
  const targetTemperature = temperatureNumber(states.climate);
  const adjustTemperature = (offset: number) => { if (targetTemperature !== undefined) void confirm('temperature', () => api.setTemperature(targetTemperature + offset)); };
  const outdoor = states.outdoor?.state && !['unknown', 'unavailable'].includes(states.outdoor.state) ? `${states.outdoor.state}°C Ute` : '— °C Ute';
  const indoorReading = typeof states.climate?.attributes.current_temperature === 'number'
    ? `${states.climate.attributes.current_temperature}°C`
    : temperatureValue(states.climate);
  const guestOn = states.guestMode?.state === 'on';
  const coolingOn = states.cooling?.state === 'on';

  return <main className="stitch-canvas">
    <header className="stitch-header"><h1>Kontrollpanel</h1><div className="outdoor"><Icon>cloud</Icon><span>{outdoor}</span></div></header>
    {errors.load && <p className="load-error" role="alert">{errors.load}</p>}
    <div className="stitch-grid">
      <section className="stitch-card home-card" role="group" aria-label="Hjemmestatus">
        <div className="card-top"><div className="icon-tile"><Icon filled>{states.home?.state === 'Borte' ? 'sensor_door' : 'home'}</Icon></div><span className={`pill ${states.home?.state === 'Hjemme' ? 'pill-active' : ''}`} role="status" aria-label="Hjemmestatus status">{homeLabel(states.home)}</span></div>
        <div className="card-bottom"><h2>Status</h2><div className="segmented"><button type="button" className={states.home?.state === 'Hjemme' ? 'selected' : ''} disabled={pending.home} onClick={() => action('home', 'Hjemme')}>Hjemme</button><button type="button" className={states.home?.state === 'Borte' ? 'selected' : ''} disabled={pending.home} onClick={() => action('home', 'Borte')}>Borte</button></div>{errors.home && <p role="alert">{errors.home}</p>}</div>
      </section>
      <section className={`stitch-card guest-card ${guestOn ? 'guest-active' : ''}`} role="group" aria-label="Gjestemodus">
        <div className="card-top"><div className={`icon-tile ${guestOn ? 'guest-icon-active' : ''}`}><Icon>groups</Icon></div><span className={guestOn ? 'guest-status-on' : 'muted-status'} role="status" aria-label="Gjestemodus status">{booleanLabel(states.guestMode)}</span></div>
        <div className="card-bottom guest-bottom"><div><h2>Gjestemodus</h2><p>Begrens tilgang</p></div><button type="button" className={`toggle ${guestOn ? 'toggle-on' : ''}`} role="switch" aria-checked={guestOn} aria-label={guestOn ? 'Slå av Gjestemodus' : 'Slå på Gjestemodus'} disabled={pending.guestMode} onClick={() => action('guestMode')}><span /></button></div>{errors.guestMode && <p role="alert">{errors.guestMode}</p>}
      </section>
      <button type="button" className="stitch-card scene-card morning-card" disabled={pending.morning} onClick={() => action('morning')}><div className="icon-tile scene-icon morning"><Icon>wb_sunny</Icon></div><div className="card-bottom"><h2>Morgenmodus</h2><p>Start dagen</p></div>{errors.morning && <span role="alert">{errors.morning}</span>}</button>
      <button type="button" className="stitch-card scene-card" disabled={pending.evening} onClick={() => action('evening')}><div className="icon-tile scene-icon evening"><Icon>routine</Icon></div><div className="card-bottom"><h2>Kveldsmodus</h2><p>Demp belysning</p></div>{errors.evening && <span role="alert">{errors.evening}</span>}</button>
      <button type="button" className="stitch-card scene-card" disabled={pending.night} onClick={() => action('night')}><div className="icon-tile scene-icon night"><Icon filled>bedtime</Icon></div><div className="card-bottom"><h2>Nattmodus</h2><p>Lås dører, skru av lys</p></div>{errors.night && <span role="alert">{errors.night}</span>}</button>
      <section className="stitch-card climate-card" role="group" aria-label="Kjøl huset"><div className="climate-content"><div className="climate-info"><div className="climate-heading"><div className="icon-tile climate-icon"><Icon>ac_unit</Icon></div><div><h2>Kjøl huset</h2><p>Daikin AP19531</p></div></div><div className="climate-action"><button type="button" disabled={pending.cooling} onClick={() => action('cooling')}>{coolingOn ? 'Slå Av' : 'Slå På'}</button><span role="status" aria-label="Kjøl huset status">{coolingOn ? 'Automatisk kjøling' : booleanLabel(states.cooling)}</span></div>{errors.cooling && <p role="alert">{errors.cooling}</p>}</div><div className="temperature-panel"><span>Måltemperatur</span><div className="stepper"><button type="button" aria-label="Senk temperatur" disabled={pending.temperature || targetTemperature === undefined} onClick={() => adjustTemperature(-1)}><Icon>remove</Icon></button><output aria-label="Temperatur">{targetTemperature ?? '—'}<small>°C</small></output><button type="button" aria-label="Øk temperatur" disabled={pending.temperature || targetTemperature === undefined} onClick={() => adjustTemperature(1)}><Icon>add</Icon></button></div><p>Inne: <strong>{indoorReading}</strong></p>{targetTemperature === undefined && <em>Settpunkt ikke rapportert</em>}{errors.temperature && <p role="alert">{errors.temperature}</p>}</div></div></section>
    </div>
    <button ref={repairButton} type="button" className="repair-fab" onClick={() => setRepairOpen(true)}><Icon>build</Icon><span>Reparer smarthuset</span></button>
    {repairOpen && <div className="repair-backdrop" role="presentation"><section className="repair-modal" role="dialog" aria-modal="true" aria-labelledby="repair-title"><header><div><Icon>warning</Icon><h2 id="repair-title">Systemreparasjon (8080)</h2></div><button ref={closeButton} type="button" aria-label="Lukk" onClick={() => setRepairOpen(false)}><Icon>close</Icon></button></header><div className="repair-frame"><iframe title="Reparer smarthuset" src="http://192.168.1.127:8080/" /></div></section></div>}
  </main>;
}
