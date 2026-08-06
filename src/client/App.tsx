import { useEffect, useState } from 'react';
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
  children: React.ReactNode;
  error?: string;
}

const Card = ({ title, children, error }: CardProps) => (
  <section role="group" aria-label={title}>
    <h2>{title}</h2>
    {children}
    {error && <p role="alert">{error}</p>}
  </section>
);

export default function App({ api = browserApi }: { api?: DashboardApi }) {
  const [states, setStates] = useState<Record<string, HomeAssistantState>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    <main>
      <h1>Smarthjem</h1>
      {errors.load && <p role="alert">{errors.load}</p>}
      <Card title="Hjemmestatus" error={errors.home}>
        <p>{homeLabel(states.home)}</p>
        <button type="button" disabled={pending.home} onClick={() => action('home', 'Hjemme')}>Hjemme</button>
        <button type="button" disabled={pending.home} onClick={() => action('home', 'Borte')}>Borte</button>
      </Card>
      <Card title="Gjestemodus" error={errors.guestMode}>
        <p>{booleanLabel(states.guestMode)}</p>
        <button type="button" disabled={pending.guestMode} onClick={() => action('guestMode')}>Gjestemodus</button>
      </Card>
      <Card title="Morgenmodus" error={errors.morning}>
        <p>{booleanLabel(states.morning)}</p>
        <button type="button" disabled={pending.morning} onClick={() => action('morning')}>Morgenmodus</button>
      </Card>
      <Card title="Kveldsmodus" error={errors.evening}>
        <p>{booleanLabel(states.evening)}</p>
        <button type="button" disabled={pending.evening} onClick={() => action('evening')}>Kveldsmodus</button>
      </Card>
      <Card title="Nattamodus" error={errors.night}>
        <p>{booleanLabel(states.night)}</p>
        <button type="button" disabled={pending.night} onClick={() => action('night')}>Nattamodus</button>
      </Card>
      <Card title="Kjøl huset" error={errors.cooling || errors.temperature}>
        <p>{booleanLabel(states.cooling)}</p>
        <button type="button" disabled={pending.cooling} onClick={() => action('cooling')}>Kjøl huset</button>
        <button type="button" aria-label="Senk temperatur" disabled={pending.temperature || coolingTemperature === undefined} onClick={() => adjustTemperature(-1)}>−</button>
        <output>{temperatureValue(states.climate)}</output>
        <button type="button" aria-label="Øk temperatur" disabled={pending.temperature || coolingTemperature === undefined} onClick={() => adjustTemperature(1)}>+</button>
      </Card>
      <Card title="Reparer smarthuset">
        <button type="button">Reparer smarthuset</button>
      </Card>
    </main>
  );
}
