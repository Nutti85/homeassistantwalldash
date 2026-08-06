import type { DashboardAction, HomeAssistantState } from '../shared/entities';

export interface DashboardResponse {
  states: Record<string, HomeAssistantState>;
}

const fallbackError = 'Kunne ikke oppdatere smarthuset. Prøv igjen.';

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
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(fallbackError);
  }
  return readResponse(response);
};

export const getStates = async (): Promise<DashboardResponse> => request('/api/states');

export const runAction = async (
  action: DashboardAction,
  option?: 'Hjemme' | 'Borte',
): Promise<DashboardResponse> => request(`/api/actions/${action}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(action === 'home' ? { option } : {}),
});

export const setTemperature = async (temperature: number): Promise<DashboardResponse> => request('/api/temperature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ temperature }),
});
