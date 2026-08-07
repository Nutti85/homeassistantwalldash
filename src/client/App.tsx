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

interface CardProps {
  title: string;
  status: string;
  icon: string;
  children: React.ReactNode;
  error?: string;
}

const Card = ({ title, status, icon, children, error }: CardProps) => (
  <section className={`card card-${title.toLowerCase().replaceAll(' ', '-')}`} role="group" aria-label={title}>
    <div className="card-heading"><span className="card-icon" aria-hidden="true">{icon}</span><h2>{title}</h2></div>
    <p className="card-status" role="status" aria-live="polite" aria-label={`${title} status`}>{status}</p>
    <div className="card-actions">{children}</div>
    {error && <p role="alert">{error}</p>}
  </section>
);

export default function App({ api = browserApi }: { api?: DashboardApi }) {
  const [states, setStates] = useState<Record<string, HomeAssistantState>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repairOpen, setRepairOpen] = useState(false);
  const repairButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!repairOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRepairOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [repairOpen]);

  const wasRepairOpen = useRef(false);
  useEffect(() => {
    if (!repairOpen && wasRepairOpen.current) repairButton.current?.focus();
    wasRepairOpen.current = repairOpen;
  }, [repairOpen]);

  useEffect(() => {
    let active = true;
    api.getStates().then(
      ({ states: confirmed }) => { if (active) setStates(confirmed); },
      () => { if (active) setErrors({ load: updateError }); },
    );
    return () => { active = false; };
  }, [api]);

  const confirm = async (key: string, operation: () => Promise<{ states: Record<string, HomeAssistantState> }>) => {
    setPending((current) => ({ ...current, [key]: true }));
    setErrors((current) => ({ ...current, [key]: '' }));
    try {
      const { states: confirmed } = await operation();
      setStates((current) => ({ ...current, ...confirmed }));
    } catch {
      setErrors((current) => ({ ...current, [key]: updateError }));
    } finally {
      setPending((current) => {
        const { [key]: _completed, ...remaining } = current;
        return remaining;
      });
    }
  };

  const action = (key: DashboardAction, option?: 'Hjemme' | 'Borte') => {
    void confirm(key, () => api.runAction(key, option));
  };

  const coolingTemperature = temperatureNumber(states.climate);
  const adjustTemperature = (offset: number) => {
    if (coolingTemperature !== undefined) {
      void confirm('temperature', () => api.setTemperature(coolingTemperature + offset));
    }
  };

  return (
    <main className="dashboard">
      <header className="dashboard-header"><div><p className="eyebrow">HJEMMEKONTROLL</p><h1>Smarthjem</h1><p className="subtitle">Rask kontroll av husets viktigste moduser</p></div><div className="live-indicator"><span aria-hidden="true" />Live status</div></header>
      {errors.load && <p role="alert">{errors.load}</p>}
      <Card title="Hjemmestatus" icon="⌂" status={homeLabel(states.home)} error={errors.home}>
        <button type="button" disabled={pending.home} onClick={() => action('home', 'Hjemme')}>Hjemme</button>
        <button type="button" disabled={pending.home} onClick={() => action('home', 'Borte')}>Borte</button>
      </Card>
      <Card title="Gjestemodus" icon="♙" status={booleanLabel(states.guestMode)} error={errors.guestMode}>
        <button type="button" disabled={pending.guestMode} onClick={() => action('guestMode')}>Gjestemodus</button>
      </Card>
      <Card title="Morgenmodus" icon="☀" status={booleanLabel(states.morning)} error={errors.morning}>
        <button type="button" disabled={pending.morning} onClick={() => action('morning')}>Morgenmodus</button>
      </Card>
      <Card title="Kveldsmodus" icon="◐" status={booleanLabel(states.evening)} error={errors.evening}>
        <button type="button" disabled={pending.evening} onClick={() => action('evening')}>Kveldsmodus</button>
      </Card>
      <Card title="Nattamodus" icon="☾" status={booleanLabel(states.night)} error={errors.night}>
        <button type="button" disabled={pending.night} onClick={() => action('night')}>Nattamodus</button>
      </Card>
      <Card title="Kjøl huset" icon="❄" status={booleanLabel(states.cooling)} error={errors.cooling || errors.temperature}>
        <button type="button" disabled={pending.cooling} onClick={() => action('cooling')}>Kjøl huset</button>
        <div className="temperature-control"><button type="button" aria-label="Senk temperatur" disabled={pending.temperature || coolingTemperature === undefined} onClick={() => adjustTemperature(-1)}>−</button><output aria-label="Temperatur">{temperatureValue(states.climate)}</output><button type="button" aria-label="Øk temperatur" disabled={pending.temperature || coolingTemperature === undefined} onClick={() => adjustTemperature(1)}>+</button></div>
      </Card>
      <Card title="Reparer smarthuset" icon="⚠" status="Åpner hjelp og diagnostikk">
        <button ref={repairButton} className="repair-button" type="button" onClick={() => setRepairOpen(true)}>Reparer smarthuset</button>
      </Card>
      {repairOpen && <div className="modal-backdrop" role="presentation"><section className="repair-modal" role="dialog" aria-modal="true" aria-labelledby="repair-title"><div><h2 id="repair-title">Reparer smarthuset</h2><button ref={closeButton} type="button" onClick={() => setRepairOpen(false)}>Lukk</button></div><iframe title="Reparer smarthuset" src="http://192.168.1.127:8080/" /></section></div>}
    </main>
  );
}
