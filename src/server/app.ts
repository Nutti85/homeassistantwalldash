import express, { type Express, type Request, type Response } from 'express';
import type { HomeAssistantClient } from './homeAssistant';
import type { DashboardAction, FanSpeed, HeatPumpMode } from '../shared/entities';

type DashboardActionResult = Awaited<ReturnType<HomeAssistantClient['execute']>>;
type DashboardStates = Awaited<ReturnType<HomeAssistantClient['getDashboardStates']>>;

export interface DashboardClient {
  getDashboardStates(): Promise<DashboardStates>;
  execute(action: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed): Promise<DashboardActionResult>;
  setTemperature(temperature: number): Promise<DashboardActionResult>;
  getCameraImage?(): Promise<{ bytes: ArrayBuffer; contentType: string }>;
}

const actions = new Set<DashboardAction>(['home', 'guestMode', 'guestVoucher', 'morning', 'evening', 'night', 'cooling', 'heatPump', 'fanSpeed', 'securityMode', 'lockDoor', 'unlockDoor']);
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
