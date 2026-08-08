import { useEffect, useRef, useState } from 'react';
import type { DashboardAction, FanSpeed, HeatPumpMode, HomeAssistantState } from '../shared/entities';
import * as browserApi from './api';
import { temperatureNumber, temperatureValue } from './dashboardModel';

export interface DashboardApi {
  getStates(): Promise<{ states: Record<string, HomeAssistantState> }>;
  runAction(action: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed): Promise<{ states: Record<string, HomeAssistantState> }>;
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
  const action = (key: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed) => { void confirm(key, () => api.runAction(key, option)); };
  const targetTemperature = temperatureNumber(states.climate);
  const currentTemperature = states.climate?.attributes.current_temperature;
  const temperatureBaseline = targetTemperature ?? (typeof currentTemperature === 'number' ? currentTemperature : undefined);
  const adjustTemperature = (offset: number) => { if (temperatureBaseline !== undefined) void confirm('temperature', () => api.setTemperature(temperatureBaseline + offset)); };
  const outdoor = states.outdoor?.state && !['unknown', 'unavailable'].includes(states.outdoor.state) ? `${states.outdoor.state}°C Ute` : '— °C Ute';
  const indoorReading = typeof states.climate?.attributes.current_temperature === 'number'
    ? `${states.climate.attributes.current_temperature}°C`
    : temperatureValue(states.climate);
  const guestOn = states.guestMode?.state === 'on';
  const homeMode = states.homeMode?.state && !['unknown', 'unavailable'].includes(states.homeMode.state) ? states.homeMode.state : '—';
  const guestVoucher = states.guestVoucher?.state;
  const hasGuestVoucher = Boolean(guestVoucher && !['unknown', 'unavailable'].includes(guestVoucher));
  const coolingOn = states.cooling?.state === 'on';
  const heatPumpMode = states.climate?.state === 'cool' || states.climate?.state === 'heat' || states.climate?.state === 'heat_cool' || states.climate?.state === 'fan_only'
    ? states.climate.state
    : undefined;
  const heatPumpStatus = heatPumpMode === 'cool'
    ? (coolingOn ? 'Automatisk kjøling aktiv' : 'Kjøling')
    : heatPumpMode === 'heat'
      ? 'Varme'
      : heatPumpMode === 'heat_cool'
        ? 'Balansert drift'
        : heatPumpMode === 'fan_only'
          ? 'Vifte'
          : 'Velg driftsmodus';
  const fanSpeed = typeof states.climate?.attributes.fan_mode === 'string' ? states.climate.attributes.fan_mode : undefined;
  const fanSpeedDisabled = pending.fanSpeed || heatPumpMode === 'cool' || heatPumpMode === undefined;

  return <main className="stitch-canvas">
    <header className="stitch-header"><div className="outdoor"><Icon>cloud</Icon><span>{outdoor}</span></div><button ref={repairButton} type="button" className="repair-fab" onClick={() => setRepairOpen(true)}><Icon>build</Icon><span>Reparer smarthuset</span></button></header>
    {errors.load && <p className="load-error" role="alert">{errors.load}</p>}
    <div className="stitch-grid">
      <section className="stitch-card home-card" role="group" aria-label="Hjemmestatus">
        <div className="card-top"><div className="icon-tile"><Icon filled>{states.home?.state === 'Borte' ? 'sensor_door' : 'home'}</Icon></div><output className="home-mode-preview" aria-label="Husmodus">{homeMode}</output></div>
        <div className="card-bottom"><h2>Status</h2><div className="segmented"><button type="button" className={states.home?.state === 'Hjemme' ? 'selected' : ''} disabled={pending.home} onClick={() => action('home', 'Hjemme')}>Hjemme</button><button type="button" className={states.home?.state === 'Borte' ? 'selected' : ''} disabled={pending.home} onClick={() => action('home', 'Borte')}>Borte</button></div>{errors.home && <p role="alert">{errors.home}</p>}</div>
      </section>
      <section className={`stitch-card guest-card ${guestOn ? 'guest-active' : ''}`} role="group" aria-label="Gjestemodus">
        <div className="card-top"><div className={`icon-tile ${guestOn ? 'guest-icon-active' : ''}`}><Icon>groups</Icon></div></div>
        <div className="guest-voucher"><p>Koble til WiFi <strong>GH_Guest</strong> og bruk koden.</p><div className="guest-voucher-code"><output aria-label="Tilgangskode">{hasGuestVoucher ? guestVoucher : '—'}</output><button type="button" disabled={pending.guestVoucher} onClick={() => action('guestVoucher')}>Ny kode</button></div><p>Gyldig for gjeldende gjest.</p></div>
        <div className="card-bottom guest-bottom"><h2>Gjestemodus</h2><button type="button" className={`toggle ${guestOn ? 'toggle-on' : ''}`} role="switch" aria-checked={guestOn} aria-label={guestOn ? 'Slå av Gjestemodus' : 'Slå på Gjestemodus'} disabled={pending.guestMode} onClick={() => action('guestMode')}><span /></button></div>{errors.guestMode && <p role="alert">{errors.guestMode}</p>}{errors.guestVoucher && <p role="alert">{errors.guestVoucher}</p>}
      </section>
      <button type="button" className="stitch-card scene-card morning-card" disabled={pending.morning} onClick={() => action('morning')}><div className="icon-tile scene-icon morning"><Icon>wb_sunny</Icon></div><div className="card-bottom"><h2>Trykk for Morgenmodus</h2><p>Start dagen</p></div>{errors.morning && <span role="alert">{errors.morning}</span>}</button>
      <button type="button" className="stitch-card scene-card" disabled={pending.evening} onClick={() => action('evening')}><div className="icon-tile scene-icon evening"><Icon>routine</Icon></div><div className="card-bottom"><h2>Trykk for Kveldsmodus</h2><p>Demp belysning og lås dør</p></div>{errors.evening && <span role="alert">{errors.evening}</span>}</button>
      <button type="button" className="stitch-card scene-card" disabled={pending.night} onClick={() => action('night')}><div className="icon-tile scene-icon night"><Icon filled>bedtime</Icon></div><div className="card-bottom"><h2>Trykk for Nattmodus</h2><p>Låser dører og skrur av lys etter 10 minutter</p></div>{errors.night && <span role="alert">{errors.night}</span>}</button>
      <section className="stitch-card climate-card" role="group" aria-label="Varmepumpe">
        <div className="climate-content">
          <div className="climate-info">
            <div className="climate-heading"><div className="icon-tile climate-icon"><Icon>mode_fan</Icon></div><div><h2>Varmepumpe</h2><p role="status">{heatPumpStatus}</p></div></div>
            <div className="heat-pump-modes" role="group" aria-label="Velg varmepumpens driftsmodus">
              <button type="button" className={heatPumpMode === 'cool' ? 'selected' : ''} aria-pressed={heatPumpMode === 'cool'} disabled={pending.heatPump} onClick={() => action('heatPump', 'cool')}><Icon>ac_unit</Icon><span>Kjøling</span><small>cool</small></button>
              <button type="button" className={heatPumpMode === 'heat' ? 'selected' : ''} aria-pressed={heatPumpMode === 'heat'} disabled={pending.heatPump} onClick={() => action('heatPump', 'heat')}><Icon>wb_sunny</Icon><span>Varme</span><small>heat</small></button>
              <button type="button" className={heatPumpMode === 'heat_cool' ? 'selected' : ''} aria-pressed={heatPumpMode === 'heat_cool'} disabled={pending.heatPump} onClick={() => action('heatPump', 'heat_cool')}><Icon>swap_vert</Icon><span>Balansert</span><small>heat / cool</small></button>
              <button type="button" className={heatPumpMode === 'fan_only' ? 'selected' : ''} aria-pressed={heatPumpMode === 'fan_only'} disabled={pending.heatPump} onClick={() => action('heatPump', 'fan_only')}><Icon>mode_fan</Icon><span>Vifte</span><small>fan only</small></button>
            </div>
            <div className="fan-speed-section">
              <span>Viftehastighet</span>
              <div className="fan-speed-modes" role="group" aria-label="Velg viftehastighet">
                <button type="button" className={fanSpeed === 'quiet' ? 'selected' : ''} aria-pressed={fanSpeed === 'quiet'} disabled={fanSpeedDisabled} onClick={() => action('fanSpeed', 'quiet')}>Stille</button>
                <button type="button" className={fanSpeed === 'medium' ? 'selected' : ''} aria-pressed={fanSpeed === 'medium'} disabled={fanSpeedDisabled} onClick={() => action('fanSpeed', 'medium')}>Medium</button>
                <button type="button" className={fanSpeed === 'strong' ? 'selected' : ''} aria-pressed={fanSpeed === 'strong'} disabled={fanSpeedDisabled} onClick={() => action('fanSpeed', 'strong')}>Sterk</button>
              </div>
              {heatPumpMode === 'cool' && <small>Styres av kjølingsautomatikken</small>}
            </div>
            {errors.heatPump && <p role="alert">{errors.heatPump}</p>}{errors.fanSpeed && <p role="alert">{errors.fanSpeed}</p>}
          </div>
          <div className="temperature-panel"><span>Måltemperatur</span><div className="stepper"><button type="button" aria-label="Senk temperatur" disabled={pending.temperature || temperatureBaseline === undefined} onClick={() => adjustTemperature(-1)}><Icon>remove</Icon></button><output aria-label="Temperatur">{targetTemperature ?? '—'}<small>°C</small></output><button type="button" aria-label="Øk temperatur" disabled={pending.temperature || temperatureBaseline === undefined} onClick={() => adjustTemperature(1)}><Icon>add</Icon></button></div><p>Inne: <strong>{indoorReading}</strong></p>{targetTemperature === undefined && <em>Velg driftsmodus før du angir måltemperatur</em>}{errors.temperature && <p role="alert">{errors.temperature}</p>}</div>
        </div>
      </section>
    </div>
    {repairOpen && <div className="repair-backdrop" role="presentation"><section className="repair-modal" role="dialog" aria-modal="true" aria-labelledby="repair-title"><header><div><Icon>warning</Icon><h2 id="repair-title">Systemreparasjon (8080)</h2></div><button ref={closeButton} type="button" aria-label="Lukk" onClick={() => setRepairOpen(false)}><Icon>close</Icon></button></header><div className="repair-frame"><iframe title="Reparer smarthuset" src="http://192.168.1.127:8080/" /></div></section></div>}
  </main>;
}
