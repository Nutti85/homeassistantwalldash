import type { DashboardAction, HomeAssistantState } from '../shared/entities';

export interface DashboardResponse {
  states: Record<string, HomeAssistantState>;
}

const fallbackError = 'Kunne ikke oppdatere smarthuset. Prøv igjen.';

const readResponse = async (response: Response): Promise<DashboardResponse> => {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      throw new Error(body.error);
    }
    throw new Error(fallbackError);
  }

  return body as DashboardResponse;
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
