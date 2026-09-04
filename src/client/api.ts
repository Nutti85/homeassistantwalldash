import type { DashboardAction, FanSpeed, HeatPumpMode, HomeAssistantState, LightCommand, LightControlKey } from '../shared/entities';

export interface DashboardResponse {
  states: Record<string, HomeAssistantState>;
}

export type AiReportMode = 'full' | 'morning' | 'midday' | 'afternoon' | 'evening';

export interface AiReportResponse {
  report: string;
  title?: string;
  mode?: AiReportMode;
  publishedAt: string;
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

export const getAiReport = async (): Promise<AiReportResponse | undefined> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch('/api/ai-report', { signal: controller.signal, cache: 'no-store' });
    if (response.status === 204) return undefined;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok || !isPlainObject(body) || typeof body.report !== 'string' || typeof body.publishedAt !== 'string') throw new Error(fallbackError);
    return {
      report: body.report,
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      ...(body.mode === 'full' || body.mode === 'morning' || body.mode === 'midday' || body.mode === 'afternoon' || body.mode === 'evening' ? { mode: body.mode } : {}),
      publishedAt: body.publishedAt,
    };
  } catch {
    throw new Error(fallbackError);
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

/**
 * Report intents sent to n8n. `on_demand` is retained so older n8n workflows
 * can continue to work while they are updated to use `full`.
 */
export type AiReportRefreshMode = AiReportMode | 'on_demand';

export const requestAiReportRefresh = async (mode: AiReportRefreshMode = 'full'): Promise<void> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch('/api/ai-report/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, requestedAt: new Date().toISOString() }),
      signal: controller.signal,
    });
  } catch {
    throw new Error('Kunne ikke starte AI-oppdateringen. Prøv igjen.');
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => undefined);
  if (isPlainObject(body) && typeof body.error === 'string') throw new Error(body.error);
  throw new Error('Kunne ikke starte AI-oppdateringen. Prøv igjen.');
};

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
