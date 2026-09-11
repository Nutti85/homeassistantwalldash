import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import type { HomeAssistantClient, VacuumAction } from './homeAssistant';
import { isActivityMediaId, type ActivityService } from './activity';
import { lightControlKeys, type DashboardAction, type FanSpeed, type HeatPumpMode, type LightCommand, type LightControlKey } from '../shared/entities';

type DashboardActionResult = Awaited<ReturnType<HomeAssistantClient['execute']>>;
type DashboardStates = Awaited<ReturnType<HomeAssistantClient['getDashboardStates']>>;

export interface DashboardClient {
  getDashboardStates(): Promise<DashboardStates>;
  execute(action: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed): Promise<DashboardActionResult>;
  executeLight?(light: LightControlKey, command: LightCommand): Promise<DashboardActionResult>;
  executeVacuum?(action: VacuumAction, option?: string): Promise<DashboardActionResult>;
  setTemperature(temperature: number): Promise<DashboardActionResult>;
  getCameraImage?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
  getCameraStream?(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }>;
  getCourtyardCameraImage?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
  getCourtyardCameraStream?(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }>;
  getVacuumMap?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
}

export interface AiReport {
  report: string;
  title?: string;
  mode?: 'full' | 'morning' | 'midday' | 'afternoon' | 'evening';
  publishedAt: string;
}

export interface AppServices {
  activity?: ActivityService;
  aiReportSecret?: string;
  aiReportSourceUrl?: string;
  aiReportRefreshUrl?: string;
  aiReportStorePath?: string;
}

const actions = new Set<DashboardAction>(['home', 'guestMode', 'guestVoucher', 'morning', 'evening', 'night', 'cooling', 'heatPump', 'fanSpeed', 'securityMode', 'lockDoor', 'unlockDoor']);
const vacuumActions = new Set<VacuumAction>(['start', 'pause', 'dock', 'locate', 'full', 'gang', 'kjokken', 'lounge', 'stue', 'morgen', 'natt', 'vacMop', 'kitchenRefill', 'cleaningMode', 'mopMode', 'mopIntensity', 'volume']);
const updateError = { error: 'Kunne ikke oppdatere smarthuset. Prøv igjen.' };
const aiReportSourceCacheMs = 1_500;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const loadAiReport = (storePath: string): AiReport | undefined => {
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as unknown;
    if (!isRecord(parsed) || typeof parsed.report !== 'string' || !parsed.report.trim() || typeof parsed.publishedAt !== 'string') return undefined;
    return {
      report: parsed.report,
      ...(typeof parsed.title === 'string' && parsed.title.trim() ? { title: parsed.title } : {}),
      ...(parsed.mode === 'full' || parsed.mode === 'morning' || parsed.mode === 'midday' || parsed.mode === 'afternoon' || parsed.mode === 'evening' ? { mode: parsed.mode } : {}),
      publishedAt: parsed.publishedAt,
    };
  } catch {
    return undefined;
  }
};

const saveAiReport = (storePath: string, report: AiReport): void => {
  try {
    mkdirSync(path.dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify(report), 'utf8');
  } catch {
    // The in-memory report remains available if persistence is temporarily unavailable.
  }
};

const isHomeOption = (value: unknown): value is 'Hjemme' | 'Borte' => value === 'Hjemme' || value === 'Borte';
const isHeatPumpMode = (value: unknown): value is HeatPumpMode => value === 'cool' || value === 'heat' || value === 'heat_cool' || value === 'fan_only';
const isFanSpeed = (value: unknown): value is FanSpeed => value === 'quiet' || value === 'medium' || value === 'strong';
const lightControls = new Set<string>(lightControlKeys);
const isLightCommand = (value: Record<string, unknown>): value is LightCommand => (
  (Object.keys(value).length === 1 && typeof value.on === 'boolean')
  || (Object.keys(value).length === 1 && typeof value.brightness === 'number' && Number.isInteger(value.brightness) && value.brightness >= 1 && value.brightness <= 100)
);

const sendClientError = (_error: unknown, response: Response): void => {
  response.status(502).json(updateError);
};

export const waitForWritable = (response: Response): Promise<void> => new Promise((resolve) => {
  const resume = () => {
    response.off('drain', resume);
    response.off('close', resume);
    resolve();
  };
  response.once('drain', resume);
  response.once('close', resume);
});

const proxyCameraStream = async (
  request: Request,
  response: Response,
  getStream: () => Promise<{ body: ReadableStream<Uint8Array>; contentType: string }>,
): Promise<void> => {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelStream = () => { void reader?.cancel(); };
  request.once('aborted', cancelStream);
  response.once('close', cancelStream);
  try {
    const stream = await getStream();
    reader = stream.body.getReader();
    response.set({
      'Content-Type': stream.contentType,
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.socket?.setNoDelay(true);
    response.setTimeout(0);
    response.flushHeaders();
    while (!response.destroyed) {
      const { done, value } = await reader.read();
      if (done) break;
      // Do not accumulate old frames when a client is temporarily slow.
      if (!response.write(value)) {
        await waitForWritable(response);
      }
    }
    if (!response.destroyed) response.end();
  } catch (error) {
    if (!response.headersSent) sendClientError(error, response);
    else if (!response.destroyed) response.end();
  } finally {
    request.off('aborted', cancelStream);
    response.off('close', cancelStream);
    await reader?.cancel();
  }
};

const sendActivityError = (response: Response, status: number): void => {
  response.set('Cache-Control', 'no-store').status(status).json({ error: 'Aktivitet er ikke tilgjengelig' });
};

const proxyActivityMedia = async (
  request: Request,
  response: Response,
  contentType: 'video/mp4' | 'image/webp',
  getMedia: (signal: AbortSignal) => Promise<globalThis.Response>,
): Promise<void> => {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  };
  request.once('aborted', cancel);
  response.once('close', cancel);
  try {
    const upstream = await getMedia(controller.signal);
    if (!upstream.ok || !upstream.body || upstream.headers.get('content-type')?.split(';')[0].trim() !== contentType) {
      await upstream.body?.cancel().catch(() => undefined);
      throw new Error('Unavailable media');
    }
    reader = upstream.body.getReader();
    if (response.destroyed || controller.signal.aborted) return;
    // Read before sending headers so an initial upstream failure remains a generic JSON error.
    let chunk = await reader.read();
    if (response.destroyed || controller.signal.aborted) return;
    response.set({
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=30',
      'X-Content-Type-Options': 'nosniff',
    });
    while (!chunk.done && !response.destroyed) {
      if (!response.write(chunk.value)) await waitForWritable(response);
      if (response.destroyed) break;
      chunk = await reader.read();
    }
    if (!response.destroyed) response.end();
  } catch {
    if (!response.destroyed) {
      if (!response.headersSent) sendActivityError(response, 502);
      else response.destroy();
    }
  } finally {
    request.off('aborted', cancel);
    response.off('close', cancel);
    controller.abort();
    await reader?.cancel().catch(() => undefined);
  }
};

export const createApp = (client: DashboardClient, services: AppServices = {}): Express => {
  const { activity, aiReportSecret = '', aiReportSourceUrl = '', aiReportRefreshUrl = '', aiReportStorePath = '' } = services;
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  let aiReport: AiReport | undefined = aiReportStorePath ? loadAiReport(aiReportStorePath) : undefined;
  let aiReportSourceCheckedAt = 0;

  app.get('/health', (_request: Request, response: Response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/activity', async (_request: Request, response: Response) => {
    if (!activity) { sendActivityError(response, 503); return; }
    try { response.set('Cache-Control', 'no-store').json(await activity.getActivity()); }
    catch { sendActivityError(response, 502); }
  });

  for (const { route, method, contentType } of [
    { route: 'preview', method: 'getReviewMedia', contentType: 'video/mp4' },
    { route: 'thumbnail', method: 'getReviewThumbnail', contentType: 'image/webp' },
  ] as const) {
    app.get(`/api/activity/review/:id/${route}`, async (request: Request, response: Response) => {
      const id = request.params.id;
      if (typeof id !== 'string' || !isActivityMediaId(id) || Object.keys(request.query).length > 0) {
        sendActivityError(response, 400); return;
      }
      if (!activity) { sendActivityError(response, 503); return; }
      await proxyActivityMedia(request, response, contentType, (signal) => activity[method](id, signal));
    });
  }

  app.post('/api/ai-report', (request: Request, response: Response) => {
    if (!aiReportSecret || request.get('X-AI-Report-Secret') !== aiReportSecret) { response.sendStatus(401); return; }
    const body = request.body as unknown;
    if (!isRecord(body) || typeof body.report !== 'string' || !body.report.trim() || body.report.length > 200_000
      || (body.title !== undefined && typeof body.title !== 'string')
      || (body.mode !== undefined && body.mode !== 'full' && body.mode !== 'morning' && body.mode !== 'midday' && body.mode !== 'afternoon' && body.mode !== 'evening')
      || (body.publishedAt !== undefined && (typeof body.publishedAt !== 'string' || !Number.isFinite(Date.parse(body.publishedAt))))) { response.sendStatus(400); return; }
    aiReport = { report: body.report.trim(), ...(typeof body.title === 'string' && body.title.trim() ? { title: body.title.trim().slice(0, 160) } : {}), ...(typeof body.mode === 'string' ? { mode: body.mode as AiReport['mode'] } : {}), publishedAt: typeof body.publishedAt === 'string' ? body.publishedAt : new Date().toISOString() };
    if (aiReportStorePath) saveAiReport(aiReportStorePath, aiReport);
    response.status(202).json({ publishedAt: aiReport.publishedAt });
  });

  app.get('/api/ai-report', async (_request: Request, response: Response) => {
    if (aiReport && (!aiReportSourceUrl || Date.now() - aiReportSourceCheckedAt < aiReportSourceCacheMs)) {
      response.set('Cache-Control', 'no-store').json(aiReport);
      return;
    }
    if (aiReportSourceUrl) {
      try {
        const upstream = await fetch(`${aiReportSourceUrl.replace(/\/$/, '')}/api/ai-report`, { cache: 'no-store' });
        aiReportSourceCheckedAt = Date.now();
        if (upstream.status === 204) {
          if (aiReport) response.set('Cache-Control', 'no-store').json(aiReport);
          else response.sendStatus(204);
          return;
        }
        if (!upstream.ok) {
          if (aiReport) response.set('Cache-Control', 'no-store').json(aiReport);
          else response.sendStatus(502);
          return;
        }
        const candidate = JSON.parse(await upstream.text()) as unknown;
        if (!isRecord(candidate) || typeof candidate.report !== 'string' || !candidate.report.trim() || typeof candidate.publishedAt !== 'string') {
          if (aiReport) response.set('Cache-Control', 'no-store').json(aiReport);
          else response.sendStatus(502);
          return;
        }
        aiReport = {
          report: candidate.report.trim(),
          ...(typeof candidate.title === 'string' && candidate.title.trim() ? { title: candidate.title.trim().slice(0, 160) } : {}),
          ...(candidate.mode === 'full' || candidate.mode === 'morning' || candidate.mode === 'midday' || candidate.mode === 'afternoon' || candidate.mode === 'evening' ? { mode: candidate.mode } : {}),
          publishedAt: candidate.publishedAt,
        };
        if (aiReportStorePath) saveAiReport(aiReportStorePath, aiReport);
        response.set('Cache-Control', 'no-store').json(aiReport);
      } catch {
        if (aiReport) response.set('Cache-Control', 'no-store').json(aiReport);
        else response.sendStatus(502);
      }
      return;
    }
    response.sendStatus(204);
  });

  app.post('/api/ai-report/refresh', async (request: Request, response: Response) => {
    if (!aiReportRefreshUrl) { response.status(503).json({ error: 'AI-oppdatering er ikke konfigurert.' }); return; }
    const body = isRecord(request.body) ? request.body : {};
    const mode = body.mode === 'full' || body.mode === 'morning' || body.mode === 'midday' || body.mode === 'afternoon' || body.mode === 'evening'
      ? body.mode
      : body.mode === undefined || body.mode === 'on_demand'
        ? 'on_demand'
        : undefined;
    if (!mode) { response.sendStatus(400); return; }
    const requestedAt = typeof body.requestedAt === 'string' && Number.isFinite(Date.parse(body.requestedAt))
      ? body.requestedAt
      : new Date().toISOString();
    try {
      const upstream = await fetch(aiReportRefreshUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, requestedAt }) });
      if (!upstream.ok) { response.status(502).json({ error: 'Kunne ikke starte AI-oppdateringen. Prøv igjen.' }); return; }
      response.sendStatus(202);
    } catch { response.status(502).json({ error: 'Kunne ikke starte AI-oppdateringen. Prøv igjen.' }); }
  });

  app.get('/api/states', async (_request: Request, response: Response) => {
    try {
      response.json(await client.getDashboardStates());
    } catch (error) {
      sendClientError(error, response);
    }
  });

  app.get('/api/camera', async (_request: Request, response: Response) => {
    if (!client.getCameraImage) { response.sendStatus(404); return; }
    try {
      const image = await client.getCameraImage();
      response.type(image.contentType).send(Buffer.from(image.bytes));
    } catch (error) {
      sendClientError(error, response);
    }
  });

  app.get('/api/camera/stream', async (request: Request, response: Response) => {
    if (!client.getCameraStream) { response.sendStatus(404); return; }
    await proxyCameraStream(request, response, () => client.getCameraStream!());
  });

  app.get('/api/courtyard-camera', async (_request: Request, response: Response) => {
    if (!client.getCourtyardCameraImage) { response.sendStatus(404); return; }
    try {
      const image = await client.getCourtyardCameraImage();
      response.type(image.contentType).send(Buffer.from(image.bytes));
    } catch (error) {
      sendClientError(error, response);
    }
  });

  app.get('/api/vacuum-map', async (_request: Request, response: Response) => {
    if (!client.getVacuumMap) { response.sendStatus(404); return; }
    try { const image = await client.getVacuumMap(); response.type(image.contentType).send(Buffer.from(image.bytes)); } catch (error) { sendClientError(error, response); }
  });

  app.get('/api/courtyard-camera/stream', async (request: Request, response: Response) => {
    if (!client.getCourtyardCameraStream) { response.sendStatus(404); return; }
    await proxyCameraStream(request, response, () => client.getCourtyardCameraStream!());
  });

  app.post('/api/actions/:action', async (request: Request, response: Response) => {
    const action = request.params.action;
    if (!actions.has(action as DashboardAction)) {
      response.sendStatus(404);
      return;
    }

    const body = request.body as unknown;
    if (!isRecord(body)) {
      response.sendStatus(400);
      return;
    }

    if (action === 'home') {
      if (!isHomeOption(body.option)) {
        response.sendStatus(400);
        return;
      }
    } else if (action === 'heatPump') {
      if (!isHeatPumpMode(body.mode)) {
        response.sendStatus(400);
        return;
      }
    } else if (action === 'fanSpeed') {
      if (!isFanSpeed(body.fanMode)) {
        response.sendStatus(400);
        return;
      }
    } else if (Object.keys(body).length !== 0) {
      response.sendStatus(400);
      return;
    }

    try {
      response.json(await client.execute(
        action as DashboardAction,
        action === 'home'
          ? body.option as 'Hjemme' | 'Borte'
          : action === 'heatPump'
            ? body.mode as HeatPumpMode
            : action === 'fanSpeed'
              ? body.fanMode as FanSpeed
              : undefined,
      ));
    } catch (error) {
      sendClientError(error, response);
    }
  });

  app.post('/api/vacuum/:action', async (request: Request, response: Response) => {
    const action = request.params.action as VacuumAction;
    if (!vacuumActions.has(action) || !client.executeVacuum) { response.sendStatus(404); return; }
    const body = request.body as unknown;
    if (!isRecord(body) || (body.option !== undefined && typeof body.option !== 'string')) { response.sendStatus(400); return; }
    if ((action === 'cleaningMode' || action === 'mopMode' || action === 'mopIntensity' || action === 'volume') && !body.option) { response.sendStatus(400); return; }
    if (!(action === 'cleaningMode' || action === 'mopMode' || action === 'mopIntensity' || action === 'volume') && Object.keys(body).length !== 0) { response.sendStatus(400); return; }
    try { response.json(await client.executeVacuum(action, body.option as string | undefined)); } catch (error) { sendClientError(error, response); }
  });

  app.post('/api/lights/:light', async (request: Request, response: Response) => {
    const light = request.params.light;
    const body = request.body as unknown;
    if (!client.executeLight || typeof light !== 'string' || !lightControls.has(light)) { response.sendStatus(404); return; }
    if (!isRecord(body) || !isLightCommand(body)) { response.sendStatus(400); return; }
    try { response.json(await client.executeLight(light as LightControlKey, body)); } catch (error) { sendClientError(error, response); }
  });

  app.post('/api/temperature', async (request: Request, response: Response) => {
    const body = request.body as unknown;
    if (!isRecord(body) || typeof body.temperature !== 'number' || !Number.isFinite(body.temperature)) {
      response.sendStatus(400);
      return;
    }

    try {
      response.json(await client.setTemperature(body.temperature));
    } catch (error) {
      sendClientError(error, response);
    }
  });

  return app;
};
