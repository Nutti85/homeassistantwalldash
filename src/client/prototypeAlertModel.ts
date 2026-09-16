import type { HomeAssistantState } from '../shared/entities';
import { forecastPoints, meteoAlarmEntries, meteoEventMeta, stateValue, type MeteoAlert } from './dashboardModel';

export type PrototypeAlertKind = 'meteo' | 'lightning' | 'windGust' | 'aurora' | 'charging';
export type PrototypeAlertScenario = 'calm' | 'arrival' | 'doorbell' | 'warning';

export type PrototypeAlertDescriptor = {
  kind: PrototypeAlertKind;
  title: string;
  icon: string;
  summary: string;
  meteo?: MeteoAlert;
  value?: string;
  source: string;
};

const numberState = (state?: HomeAssistantState) => {
  const value = Number(stateValue(state));
  return Number.isFinite(value) ? value : undefined;
};

const formattedNumber = (value: number) => value.toLocaleString('nb-NO', { maximumFractionDigits: 1 });

export const prototypeAlertDescriptors = (
  states: Record<string, HomeAssistantState>,
  scenario: PrototypeAlertScenario,
  now = new Date(),
): PrototypeAlertDescriptor[] => {
  const meteo = meteoAlarmEntries(states.meteoAlarm, undefined, now).map((alert) => ({
    kind: 'meteo' as const,
    title: alert.name,
    icon: meteoEventMeta[alert.events[0] ?? '']?.icon ?? 'warning',
    summary: [alert.severity === 'red' ? 'Rødt nivå' : alert.severity === 'orange' ? 'Oransje nivå' : alert.severity === 'yellow' ? 'Gult nivå' : undefined, alert.area].filter(Boolean).join(' · ') || 'MET farevarsel',
    meteo: alert,
    source: 'MET Norge',
  }));
  const lightningDistance = scenario === 'warning' ? 7.4 : numberState(states.lightningDistance);
  const maximumGust = forecastPoints(states.weatherHourly).reduce<number | undefined>((maximum, point) => point.windGustSpeed === undefined ? maximum : maximum === undefined ? point.windGustSpeed : Math.max(maximum, point.windGustSpeed), undefined);
  const auroraActive = stateValue(states.auroraVisibility)?.toLocaleLowerCase('nb-NO') === 'on';

  return [
    ...meteo,
    ...(lightningDistance !== undefined && lightningDistance < 10 ? [{ kind: 'lightning' as const, title: 'Lyn i nærheten', icon: 'thunderstorm', value: `${formattedNumber(lightningDistance)} km`, summary: `${formattedNumber(lightningDistance)} km til nærmeste registrerte lyn`, source: 'Blitzortung' }] : []),
    ...(maximumGust !== undefined && maximumGust >= 10 ? [{ kind: 'windGust' as const, title: 'Kraftige vindkast', icon: 'airwave', value: `${formattedNumber(maximumGust)} m/s`, summary: `Varslet vindkast på opptil ${formattedNumber(maximumGust)} m/s`, source: 'MET timevarsel' }] : []),
    ...(auroraActive ? [{ kind: 'aurora' as const, title: 'Nordlys synlig', icon: 'graphic_eq', summary: 'Nordlysvarsel er aktivt nå', source: 'Aurora visibility sensor' }] : []),
    ...(scenario === 'warning' ? [{ kind: 'charging' as const, title: 'Lading stoppet', icon: 'electric_car', summary: 'Peugeot · kontroller Zaptec-kabelen', source: 'Zaptec / Peugeot' }] : []),
  ];
};
