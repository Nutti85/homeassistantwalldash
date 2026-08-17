import type { DashboardAction, FanSpeed, HeatPumpMode, HomeAssistantState, LightCommand, LightControlKey } from '../shared/entities';

export interface DashboardResponse {
  states: Record<string, HomeAssistantState>;
}

const fallbackError = 'Kunne ikke oppdatere smarthuset. Prøv igjen.';
const requestTimeoutMs = 10_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isHomeAssistantState = (value: unknown): value is HomeAssistantState => (
  isPlainObject(value)
  && typeof value.entity_id === 'string'
  && typeof value.state === 'string'
  && isPlainObject(value.attributes)
);

const isDashboardResponse = (value: unknown): value is DashboardResponse => (
  isPlainObject(value)
  && isPlainObject(value.states)
  && Object.values(value.states).every(isHomeAssistantState)
);

const readResponse = async (response: Response): Promise<DashboardResponse> => {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      throw new Error(body.error);
    }
    throw new Error(fallbackError);
  }

  if (!isDashboardResponse(body)) {
    throw new Error(fallbackError);
  }
  return body;
};

const request = async (path: string, init?: RequestInit): Promise<DashboardResponse> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: controller.signal });
  } catch {
    throw new Error(fallbackError);
  } finally {
    globalThis.clearTimeout(timeout);
  }
  return readResponse(response);
};

export const getStates = async (): Promise<DashboardResponse> => request('/api/states');

export const runAction = async (
  action: DashboardAction,
  option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed,
): Promise<DashboardResponse> => request(`/api/actions/${action}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(action === 'home' ? { option } : action === 'heatPump' ? { mode: option } : action === 'fanSpeed' ? { fanMode: option } : {}),
});

export const setTemperature = async (temperature: number): Promise<DashboardResponse> => request('/api/temperature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ temperature }),
});

export const runVacuumAction = async (action: string, option?: string): Promise<DashboardResponse> => request(`/api/vacuum/${action}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(option === undefined ? {} : { option }),
});

export const runLightCommand = async (light: LightControlKey, command: LightCommand): Promise<DashboardResponse> => request(`/api/lights/${light}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(command),
});
