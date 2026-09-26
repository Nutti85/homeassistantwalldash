import type { DashboardAction, FanSpeed, HeatPumpMode, HomeAssistantState, LightCommand, LightControlKey } from '../shared/entities';
import type { DepartureBriefingPayload } from '../shared/departureBriefing';
import type { ActivityEvent, CameraEventGroup, ActivityPayload, CameraEventFeed, CameraObject, CameraReview } from '../shared/activity';

export interface DashboardResponse {
  states: Record<string, HomeAssistantState>;
  departureBriefings?: DepartureBriefingPayload;
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

const isActivityDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const activityMediaPath = /^\/api\/activity\/review\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(preview|thumbnail)$/;
const activityReviewId = /^\d{10}(?:\.\d{1,6})?-[a-z0-9]{6}$/;
const isActivityPath = (value: unknown, kind: 'preview' | 'thumbnail'): boolean => (
  typeof value === 'string' && activityMediaPath.test(value) && value.endsWith(`/${kind}`)
);
const isActivityEvent = (value: unknown): value is ActivityEvent => (
  isPlainObject(value)
  && typeof value.id === 'string'
  && typeof value.kind === 'string' && ['doorbell', 'lock', 'home', 'frigate'].includes(value.kind)
  && isActivityDate(value.occurredAt)
  && typeof value.title === 'string'
  && typeof value.tone === 'string' && ['default', 'safe', 'notice'].includes(value.tone)
  && (value.detail === undefined || typeof value.detail === 'string')
  && (value.mediaPath === undefined || isActivityPath(value.mediaPath, 'preview'))
);
const cameraObjects: CameraObject[] = ['person', 'car', 'dog'];
const isCameraObject = (value: unknown): value is CameraObject => typeof value === 'string' && cameraObjects.includes(value as CameraObject);
const isMonitoringMode = (value: unknown): value is CameraReview['monitoringMode'] => value === 'armed' || value === 'notifications';
const isCameraReview = (value: unknown): value is CameraReview => (
  isPlainObject(value)
  && typeof value.id === 'string' && activityReviewId.test(value.id)
  && isActivityDate(value.occurredAt)
  && Array.isArray(value.objects) && value.objects.length > 0 && value.objects.every(isCameraObject)
  && typeof value.camera === 'string' && value.camera.length > 0
  && (value.zone === undefined || typeof value.zone === 'string')
  && isMonitoringMode(value.monitoringMode)
  && (value.mediaPath === undefined || isActivityPath(value.mediaPath, 'preview'))
  && (value.thumbnailPath === undefined || isActivityPath(value.thumbnailPath, 'thumbnail'))
);
const isActivityEventGroup = (value: unknown): value is CameraEventGroup => {
  if (!isPlainObject(value)
    || typeof value.id !== 'string' || !value.id
    || !isActivityDate(value.occurredAt)
    || typeof value.camera !== 'string' || value.camera.length === 0
    || (value.zone !== undefined && typeof value.zone !== 'string')
    || !Array.isArray(value.objects) || value.objects.length === 0 || !value.objects.every(isCameraObject)
    || typeof value.reviewCount !== 'number' || !Number.isInteger(value.reviewCount) || value.reviewCount <= 0
    || typeof value.latestReviewId !== 'string' || !activityReviewId.test(value.latestReviewId)
    || !Array.isArray(value.reviews) || value.reviews.length !== value.reviewCount || !value.reviews.every(isCameraReview)) return false;
  return value.reviews.some((review) => review.id === value.latestReviewId);
};
const isCameraEventFeed = (value: unknown): value is CameraEventFeed => (
  isPlainObject(value)
  && typeof value.status === 'string' && ['available', 'expired', 'none', 'unavailable', 'inactive'].includes(value.status)
  && Array.isArray(value.groups) && value.groups.every(isActivityEventGroup)
);
const isActivityPayload = (value: unknown): value is ActivityPayload => {
  if (!isPlainObject(value) || !isActivityDate(value.generatedAt) || !isCameraEventFeed(value.cameraEvents) || !isPlainObject(value.awayCapture)
    || !Array.isArray(value.timeline) || !value.timeline.every(isActivityEvent)) return false;
  const capture = value.awayCapture;
  return typeof capture.status === 'string' && ['available', 'expired', 'none', 'unavailable'].includes(capture.status)
    && (capture.awayStartedAt === undefined || isActivityDate(capture.awayStartedAt))
    && (capture.homeReturnedAt === undefined || isActivityDate(capture.homeReturnedAt))
    && (capture.event === undefined || isActivityEvent(capture.event))
    && (capture.mediaPath === undefined || isActivityPath(capture.mediaPath, 'preview'))
    && (capture.thumbnailPath === undefined || isActivityPath(capture.thumbnailPath, 'thumbnail'));
};

export const getActivity = async (): Promise<ActivityPayload> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch('/api/activity', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(fallbackError);
    const body: unknown = await response.json();
    if (!isActivityPayload(body)) throw new Error(fallbackError);
    return body;
  } catch {
    throw new Error(fallbackError);
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export interface ActivityUpdateSource {
  addEventListener(type: 'activity', listener: EventListener): void;
  removeEventListener(type: 'activity', listener: EventListener): void;
  close(): void;
}

export type ActivityUpdateSourceFactory = (url: string) => ActivityUpdateSource;

/** Subscribes to payload-free activity notifications and coalesces one event-loop burst. */
export const subscribeToActivityUpdates = (
  onActivity: () => void,
  createSource: ActivityUpdateSourceFactory = (url) => new EventSource(url),
): (() => void) => {
  const source = createSource('/api/activity/updates');
  let queued = false;
  const listener: EventListener = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      onActivity();
    });
  };
  source.addEventListener('activity', listener);
  return () => {
    source.removeEventListener('activity', listener);
    source.close();
  };
};

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
