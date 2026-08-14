import express, { type Express, type Request, type Response } from 'express';
import type { HomeAssistantClient, VacuumAction } from './homeAssistant';
import type { DashboardAction, FanSpeed, HeatPumpMode } from '../shared/entities';

type DashboardActionResult = Awaited<ReturnType<HomeAssistantClient['execute']>>;
type DashboardStates = Awaited<ReturnType<HomeAssistantClient['getDashboardStates']>>;

export interface DashboardClient {
  getDashboardStates(): Promise<DashboardStates>;
  execute(action: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed): Promise<DashboardActionResult>;
  executeVacuum?(action: VacuumAction, option?: string): Promise<DashboardActionResult>;
  setTemperature(temperature: number): Promise<DashboardActionResult>;
  getCameraImage?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
  getCameraStream?(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }>;
  getCourtyardCameraImage?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
  getCourtyardCameraStream?(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }>;
  getVacuumMap?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
}

const actions = new Set<DashboardAction>(['home', 'guestMode', 'guestVoucher', 'morning', 'evening', 'night', 'cooling', 'heatPump', 'fanSpeed', 'securityMode', 'lockDoor', 'unlockDoor']);
const vacuumActions = new Set<VacuumAction>(['start', 'pause', 'dock', 'locate', 'full', 'gang', 'kjokken', 'lounge', 'stue', 'morgen', 'natt', 'vacMop', 'kitchenRefill', 'cleaningMode', 'mopMode', 'mopIntensity', 'volume']);
const updateError = { error: 'Kunne ikke oppdatere smarthuset. Prøv igjen.' };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isHomeOption = (value: unknown): value is 'Hjemme' | 'Borte' => value === 'Hjemme' || value === 'Borte';
const isHeatPumpMode = (value: unknown): value is HeatPumpMode => value === 'cool' || value === 'heat' || value === 'heat_cool' || value === 'fan_only';
const isFanSpeed = (value: unknown): value is FanSpeed => value === 'quiet' || value === 'medium' || value === 'strong';

const sendClientError = (_error: unknown, response: Response): void => {
  response.status(502).json(updateError);
};

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
        await new Promise<void>((resolve) => {
          response.once('drain', resolve);
          response.once('close', resolve);
        });
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

export const createApp = (client: DashboardClient): Express => {
  const app = express();
  app.use(express.json());

  app.get('/health', (_request: Request, response: Response) => {
    response.json({ status: 'ok' });
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
