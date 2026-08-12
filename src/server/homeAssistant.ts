import { type DashboardAction, type DashboardEntityIds, type DashboardStateKey, defaultDashboardEntityIds, guestVoucherCreateButtonEntityId, type FanSpeed, type HeatPumpMode, type HomeAssistantState } from '../shared/entities';

type DashboardStates = { states: Partial<Record<DashboardStateKey, HomeAssistantState>> };
type CommandResult = { states: Partial<Record<DashboardStateKey, HomeAssistantState>> };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const findBroadcastBody = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const body = findBroadcastBody(item);
      if (body) return body;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const serviceData = value.service_data;
  if (
    value.domain === 'rest_command'
    && value.service === 'klara_inbox_broadcast'
    && isRecord(serviceData)
    && typeof serviceData.body === 'string'
    && serviceData.body.trim()
  ) {
    return serviceData.body.trim();
  }

  for (const child of Object.values(value)) {
    const body = findBroadcastBody(child);
    if (body) return body;
  }
  return undefined;
};

const services: Partial<Record<DashboardAction, string>> = {
  guestMode: 'input_boolean/turn_on',
  guestVoucher: 'button/press',
  morning: 'automation/trigger',
  evening: 'script/turn_on',
  night: 'script/turn_on',
  cooling: 'automation/turn_on',
  securityMode: 'script/turn_on',
  lockDoor: 'lock/lock',
  unlockDoor: 'lock/unlock',
};

const communicationError = () => new Error('Kunne ikke kommunisere med Home Assistant');

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export class HomeAssistantClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly entities: DashboardEntityIds = defaultDashboardEntityIds,
    private readonly guestVoucherCreateButtonId: string = guestVoucherCreateButtonEntityId,
    private readonly weatherAutomationTraceId = '',
  ) {}

  public async getDashboardStates(): Promise<DashboardStates> {
    const states = {} as Record<DashboardStateKey, HomeAssistantState>;
    for (const [key, entityId] of Object.entries(this.entities) as [DashboardStateKey, string][]) {
      if (!entityId) {
        states[key] = { entity_id: '', state: 'unavailable', attributes: {} };
        continue;
      }
      try {
        const state = await this.getState(entityId);
        states[key] = key === 'calendar'
          ? await this.getCalendarState(state)
          : state;
      } catch {
        states[key] = { entity_id: entityId, state: 'unavailable', attributes: {} };
      }
    }
    if (this.weatherAutomationTraceId) {
      try {
        const summary = await this.getWeatherSummaryFromTrace();
        if (summary) states.weatherSummary = summary;
      } catch {
        // Keep the unavailable summary state when the trace is not reachable.
      }
    }
    return { states };
  }

  private async getWeatherSummaryFromTrace(): Promise<HomeAssistantState | undefined> {
    const trace = await this.callTrace('trace/list');
    if (!Array.isArray(trace)) return undefined;
    const runs = trace.filter(isRecord).sort((left, right) => {
      const leftStart = isRecord(left.timestamp) && typeof left.timestamp.start === 'string' ? left.timestamp.start : '';
      const rightStart = isRecord(right.timestamp) && typeof right.timestamp.start === 'string' ? right.timestamp.start : '';
      return rightStart.localeCompare(leftStart);
    });
    const runIdValue = runs.find((run) => typeof run.run_id === 'string')?.run_id;
    if (typeof runIdValue !== 'string') return undefined;
    const runId = runIdValue;
    const fullTrace = await this.callTrace('trace/get', runId);
    const body = findBroadcastBody(fullTrace);
    if (!body) return undefined;
    return {
      entity_id: `automation.${this.weatherAutomationTraceId}`,
      state: body,
      attributes: { source: 'automation trace', automation_id: this.weatherAutomationTraceId },
    };
  }

  private async callTrace(type: 'trace/list' | 'trace/get', runId?: string): Promise<unknown> {
    const websocketUrl = `${this.baseUrl.replace(/^http/, 'ws')}/api/websocket`;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(websocketUrl);
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        socket.close();
        callback();
      };
      const fail = () => finish(() => reject(communicationError()));
      socket.addEventListener('error', fail);
      socket.addEventListener('close', () => { if (!settled) reject(communicationError()); });
      socket.addEventListener('message', (event) => {
        let message: unknown;
        try { message = JSON.parse(String(event.data)); } catch { fail(); return; }
        if (!isRecord(message)) return;
        if (message.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: this.token }));
          return;
        }
        if (message.type === 'auth_ok') {
          socket.send(JSON.stringify({
            id: 1,
            type,
            domain: 'automation',
            item_id: this.weatherAutomationTraceId,
            ...(runId ? { run_id: runId } : {}),
          }));
          return;
        }
        if (message.type === 'result' && message.id === 1) {
          if (message.success !== true) { fail(); return; }
          finish(() => resolve(message.result));
        }
      });
    });
  }

  public async execute(action: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed): Promise<CommandResult> {
    try {
      if (action === 'home') {
        if (option !== 'Hjemme' && option !== 'Borte') {
          throw communicationError();
        }
        await this.request('input_select/select_option', {
          entity_id: this.entities.home,
          option,
        });
        return { states: { home: await this.getState(this.entities.home) } };
      }

      if (action === 'heatPump') {
        if (option !== 'cool' && option !== 'heat' && option !== 'heat_cool' && option !== 'fan_only') {
          throw communicationError();
        }
        await this.request(option === 'cool' ? 'automation/turn_on' : 'automation/turn_off', {
          entity_id: this.entities.cooling,
        });
        await this.request('climate/set_hvac_mode', {
          entity_id: this.entities.climate,
          hvac_mode: option,
        });
        return {
          states: {
            cooling: await this.getState(this.entities.cooling),
            climate: await this.getState(this.entities.climate),
          },
        };
      }

      if (action === 'fanSpeed') {
        if (option !== 'quiet' && option !== 'medium' && option !== 'strong') {
          throw communicationError();
        }
        await this.request('climate/set_fan_mode', {
          entity_id: this.entities.climate,
          fan_mode: option,
        });
        return { states: { climate: await this.getState(this.entities.climate) } };
      }

      if (action === 'guestVoucher') {
        const previousVoucher = await this.getState(this.entities.guestVoucher);
        await this.request('button/press', { entity_id: this.guestVoucherCreateButtonId });
        return { states: { guestVoucher: await this.waitForChangedState(this.entities.guestVoucher, previousVoucher) } };
      }

      if (action === 'securityMode' || action === 'lockDoor' || action === 'unlockDoor') {
        const entityKey = action === 'securityMode' ? 'securityMode' : 'frontDoorLock';
        const service = action === 'securityMode' ? 'script/turn_on' : action === 'lockDoor' ? 'lock/lock' : 'lock/unlock';
        const serviceEntityId = action === 'securityMode' ? 'script.toggle_security_mode_script' : this.entities.frontDoorLock;
        await this.request(service, { entity_id: serviceEntityId });
        return { states: { [entityKey]: await this.getState(this.entities[entityKey]) } };
      }

      let service = services[action as Exclude<DashboardAction, 'home' | 'heatPump' | 'fanSpeed'>];
      if (!service) {
        throw communicationError();
      }
      const entityId = this.entities[action];
      if (action === 'cooling' || action === 'guestMode') {
        const current = await this.getState(entityId);
        if (action === 'cooling') {
          service = current.state === 'on' ? 'automation/turn_off' : 'automation/turn_on';
        } else {
          service = current.state === 'on' ? 'input_boolean/turn_off' : 'input_boolean/turn_on';
        }
      }
      await this.request(service, { entity_id: entityId });
      return { states: { [action]: await this.getState(entityId) } };
    } catch {
      throw communicationError();
    }
  }

  public async getCameraImage(): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    if (!this.entities.doorbellCamera) throw communicationError();
    const response = await this.fetcher(`${this.baseUrl}/api/camera_proxy/${this.entities.doorbellCamera}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) throw communicationError();
    return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'image/jpeg' };
  }

  public async getCameraStream(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
    if (!this.entities.doorbellCamera) throw communicationError();
    const response = await this.fetcher(`${this.baseUrl}/api/camera_proxy_stream/${this.entities.doorbellCamera}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok || !response.body) throw communicationError();
    return { body: response.body, contentType: response.headers.get('content-type') || 'multipart/x-mixed-replace' };
  }

  public async setTemperature(temperature: number): Promise<CommandResult> {
    if (!Number.isFinite(temperature)) {
      throw new Error('Ugyldig temperatur');
    }

    try {
      let climate = await this.getState(this.entities.climate);
      if (climate.state === 'fan_only') {
        const modes = climate.attributes.hvac_modes;
        if (!Array.isArray(modes) || !modes.includes('cool')) {
          throw communicationError();
        }
        await this.request('climate/set_hvac_mode', {
          entity_id: this.entities.climate,
          hvac_mode: 'cool',
        });
        climate = await this.getState(this.entities.climate);
      }
      const minTemperature = climate.attributes.min_temp;
      const maxTemperature = climate.attributes.max_temp;
      const hasMinTemperature = Object.prototype.hasOwnProperty.call(climate.attributes, 'min_temp');
      const hasMaxTemperature = Object.prototype.hasOwnProperty.call(climate.attributes, 'max_temp');
      const minBound = isFiniteNumber(minTemperature) ? minTemperature : undefined;
      const maxBound = isFiniteNumber(maxTemperature) ? maxTemperature : undefined;
      if (
        (hasMinTemperature && minBound === undefined)
        || (hasMaxTemperature && maxBound === undefined)
        || (minBound !== undefined && maxBound !== undefined && minBound > maxBound)
      ) {
        throw communicationError();
      }
      const clampedTemperature = Math.max(
        minBound ?? -Infinity,
        Math.min(
          temperature,
          maxBound ?? Infinity,
        ),
      );

      await this.request('climate/set_temperature', {
        entity_id: this.entities.climate,
        temperature: clampedTemperature,
      });
      return { states: { climate: await this.getState(this.entities.climate) } };
    } catch {
      throw communicationError();
    }
  }

  private async request(service: string, body?: Record<string, unknown>): Promise<Response> {
    const response = await this.fetcher(`${this.baseUrl}/api/services/${service}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw communicationError();
    }
    return response;
  }

  private async getState(entityId: string): Promise<HomeAssistantState> {
    const response = await this.fetcher(`${this.baseUrl}/api/states/${entityId}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw communicationError();
    }
    const payload: unknown = await response.json();
    if (
      !isPlainObject(payload)
      || payload.entity_id !== entityId
      || typeof payload.state !== 'string'
      || !isPlainObject(payload.attributes)
    ) {
      throw communicationError();
    }
    return {
      entity_id: payload.entity_id,
      state: payload.state,
      attributes: payload.attributes,
    };
  }

  private async getCalendarState(state: HomeAssistantState): Promise<HomeAssistantState> {
    // Calendar entities only expose the currently active event in their state.
    // Fetch an explicit range so upcoming entries are available to the dashboard.
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4);
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    const response = await this.fetcher(`${this.baseUrl}/api/calendars/${state.entity_id}?${query}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) throw communicationError();
    const events: unknown = await response.json();
    if (!Array.isArray(events)) throw communicationError();
    return { ...state, attributes: { ...state.attributes, events } };
  }

  private async waitForChangedState(entityId: string, previous: HomeAssistantState): Promise<HomeAssistantState> {
    const previousCreateTime = previous.attributes.create_time;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const current = await this.getState(entityId);
      if (current.state !== previous.state || current.attributes.create_time !== previousCreateTime) {
        return current;
      }
      if (attempt < 14) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    throw communicationError();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}
