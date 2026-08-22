import { type DashboardAction, type DashboardEntityIds, type DashboardStateKey, defaultDashboardEntityIds, guestVoucherCreateButtonEntityId, type FanSpeed, type HeatPumpMode, type HomeAssistantState, type LightCommand, type LightControlKey } from '../shared/entities';

type DashboardStates = { states: Partial<Record<DashboardStateKey, HomeAssistantState>> };
type CommandResult = { states: Partial<Record<DashboardStateKey, HomeAssistantState>> };
export type VacuumAction = 'start' | 'pause' | 'dock' | 'locate' | 'full' | 'gang' | 'kjokken' | 'lounge' | 'stue' | 'morgen' | 'natt' | 'vacMop' | 'kitchenRefill' | 'cleaningMode' | 'mopMode' | 'mopIntensity' | 'volume';

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
const requestTimeoutMs = 8_000;
const roomTrendWindowMs = 30 * 60 * 1_000;
const roomTrendPoints = 7;

/**
 * Converts Home Assistant's event-based recorder output into points covering
 * a consistent short window. Each sample holds the latest value at a
 * five-minute boundary, so room sensors that report at different rates remain
 * directly comparable.
 */
export const resampleRoomTrend = (series: unknown, startMs: number, endMs: number): number[] => {
  if (!Array.isArray(series) || endMs <= startMs) return [];

  const readings = series.flatMap((point) => {
    if (!isRecord(point) || typeof point.state !== 'string' || typeof point.last_changed !== 'string') return [] as { value: number; timestamp: number }[];
    const value = Number(point.state);
    const timestamp = Date.parse(point.last_changed);
    return Number.isFinite(value) && Number.isFinite(timestamp) ? [{ value, timestamp }] : [];
  }).sort((left, right) => left.timestamp - right.timestamp);
  if (!readings.length) return [];

  const samples: number[] = [];
  let readingIndex = 0;
  let latest = readings[0].value;
  for (let point = 0; point < roomTrendPoints; point += 1) {
    const boundary = startMs + (endMs - startMs) * point / (roomTrendPoints - 1);
    while (readingIndex + 1 < readings.length && readings[readingIndex + 1].timestamp <= boundary) {
      readingIndex += 1;
      latest = readings[readingIndex].value;
    }
    samples.push(latest);
  }
  return samples;
};

/** Turns accumulated-consumption recorder readings into hourly usage values. */
export const hourlyConsumption = (series: unknown, startMs: number, endMs: number, currentState?: string): number[] => {
  if (!Array.isArray(series) || endMs <= startMs) return [];
  const readings = series.flatMap((point) => {
    if (!isRecord(point) || typeof point.state !== 'string' || typeof point.last_changed !== 'string') return [] as { value: number; timestamp: number }[];
    const value = Number(point.state);
    const timestamp = Date.parse(point.last_changed);
    return Number.isFinite(value) && Number.isFinite(timestamp) ? [{ value, timestamp }] : [];
  });
  const current = Number(currentState);
  if (Number.isFinite(current)) readings.push({ value: current, timestamp: endMs });
  readings.sort((left, right) => left.timestamp - right.timestamp);
  if (!readings.length) return [];

  const valueAt = (boundary: number): number => {
    let latest = readings[0].value;
    for (const reading of readings) {
      if (reading.timestamp > boundary) break;
      latest = reading.value;
    }
    return latest;
  };
  const hourCount = Math.min(24, Math.ceil((endMs - startMs) / (60 * 60 * 1_000)));
  return Array.from({ length: hourCount }, (_, hour) => {
    const hourStart = startMs + hour * 60 * 60 * 1_000;
    const hourEnd = Math.min(hourStart + 60 * 60 * 1_000, endMs);
    return Number(Math.max(0, valueAt(hourEnd) - valueAt(hourStart)).toFixed(3));
  });
};

/** Groups the current-hour sensor's recorder history into its actual hourly kWh readings. */
export const hourlyConsumptionFromHourlySensor = (series: unknown, startMs: number, endMs: number, currentState?: string): number[] => {
  if (!Array.isArray(series) || endMs <= startMs) return [];
  const hourCount = Math.min(24, Math.ceil((endMs - startMs) / (60 * 60 * 1_000)));
  const values = Array.from<number | undefined>({ length: hourCount });
  let hasReading = false;
  const addReading = (value: unknown, timestamp: unknown) => {
    const reading = Number(value);
    const changedAt = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN;
    const hour = Math.floor((changedAt - startMs) / (60 * 60 * 1_000));
    if (!Number.isFinite(reading) || !Number.isFinite(changedAt) || hour < 0 || hour >= hourCount) return;
    hasReading = true;
    values[hour] = Math.max(values[hour] ?? 0, reading);
  };
  for (const point of series) {
    if (isRecord(point)) addReading(point.state, point.last_changed);
  }
  addReading(currentState, new Date(endMs).toISOString());
  if (!hasReading) return [];
  return values.map((value) => Number((value ?? 0).toFixed(3)));
};

/**
 * Calculates a completed day's consumption from recorder statistics. `sum` is
 * monotonically increasing even when a daily energy sensor resets at midnight,
 * unlike the sensor's raw state history.
 */
export const yesterdayConsumptionFromStatistics = (statistics: unknown, statisticId: string, dayEndMs: number): number | undefined => {
  if (!isRecord(statistics) || !Array.isArray(statistics[statisticId])) return undefined;

  const readings = statistics[statisticId].flatMap((item) => {
    if (!isRecord(item)) return [] as { end: number; sum: number }[];
    const end = Number(item.end);
    const sum = Number(item.sum);
    return Number.isFinite(end) && Number.isFinite(sum) ? [{ end, sum }] : [];
  }).sort((left, right) => left.end - right.end);

  const yesterday = readings.find((reading) => reading.end === dayEndMs);
  if (!yesterday) return undefined;
  const previousDay = readings.filter((reading) => reading.end < dayEndMs).at(-1);
  if (!previousDay) return undefined;

  const consumption = yesterday.sum - previousDay.sum;
  return consumption >= 0 ? Number(consumption.toFixed(6)) : undefined;
};

export class HomeAssistantClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly entities: DashboardEntityIds = defaultDashboardEntityIds,
    private readonly guestVoucherCreateButtonId: string = guestVoucherCreateButtonEntityId,
  ) {}

  public async getDashboardStates(): Promise<DashboardStates> {
    const states = {} as Record<DashboardStateKey, HomeAssistantState>;
    await Promise.all((Object.entries(this.entities) as [DashboardStateKey, string][]).map(async ([key, entityId]) => {
      if (!entityId) {
        states[key] = { entity_id: '', state: 'unavailable', attributes: {} };
        return;
      }
      try {
        const state = await this.getState(entityId);
        states[key] = key === 'calendar'
          ? await this.getCalendarState(state)
          : state;
      } catch {
        states[key] = { entity_id: entityId, state: 'unavailable', attributes: {} };
      }
    }));
    try {
      states.lightningStrikes = await this.getLightningStrikes();
    } catch {
      states.lightningStrikes = { entity_id: 'geo_location.lightning_strike_*', state: 'unavailable', attributes: { strikes: [] } };
    }
    // The daily Tibber sensor resets at midnight. Use recorder statistics for
    // yesterday because raw history includes the state immediately before the
    // requested period, which can otherwise make yesterday include two days.
    try {
      states.energyYesterday = await this.getYesterdayConsumption();
    } catch {
      states.energyYesterday = { entity_id: this.entities.energyToday, state: 'unavailable', attributes: {} };
    }
    try {
      const hourly = await this.getHourlyConsumption(states.energyHourlyConsumption);
      states.energyToday.attributes = { ...states.energyToday.attributes, hourlyConsumption: hourly };
    } catch {
      // Keep the current total if recorder history is unavailable.
    }
    try {
      const roomStates = await this.getRoomTrends();
      for (const [entityId, trend] of Object.entries(roomStates)) {
        const state = Object.values(states).find((candidate) => candidate.entity_id === entityId);
        if (state) state.attributes = { ...state.attributes, trend };
      }
    } catch {
      // The room card keeps its readings when historical data is unavailable.
    }
    return { states };
  }

  private async getRoomTrends(): Promise<Record<string, number[]>> {
    const entityIds = [this.entities.roomLiving, this.entities.roomBedroom, this.entities.roomBathroom, this.entities.roomLivingHumidity, this.entities.roomLivingCo2, this.entities.roomBedroomHumidity, this.entities.roomBedroomCo2, this.entities.roomBathroomHumidity, this.entities.roomBathroomCo2].filter(Boolean);
    const endMs = Date.now();
    const startMs = endMs - roomTrendWindowMs;
    const start = new Date(startMs);
    const query = new URLSearchParams({ filter_entity_id: entityIds.join(','), end_time: new Date(endMs).toISOString(), minimal_response: 'true', no_attributes: 'true' });
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/history/period/${start.toISOString()}?${query}`, { method: 'GET', headers: this.headers() });
    if (!response.ok) throw communicationError();
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw communicationError();
    const trends: Record<string, number[]> = {};
    for (const series of payload) {
      if (!Array.isArray(series)) continue;
      const entityId = series.find(isRecord)?.entity_id;
      if (typeof entityId !== 'string') continue;
      const values = resampleRoomTrend(series, startMs, endMs);
      if (values.length) trends[entityId] = values;
    }
    return trends;
  }

  private async getYesterdayConsumption(): Promise<HomeAssistantState> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 2);
    const statistics = await this.callRecorderStatistics(start, todayStart);
    const consumption = yesterdayConsumptionFromStatistics(statistics, this.entities.energyToday, todayStart.getTime());
    if (consumption === undefined) throw communicationError();
    return {
      entity_id: this.entities.energyToday,
      state: String(consumption),
      attributes: { unit_of_measurement: 'kWh', source: 'recorder statistics' },
    };
  }

  private async callRecorderStatistics(start: Date, end: Date): Promise<unknown> {
    const websocketUrl = `${this.baseUrl.replace(/^http/, 'ws')}/api/websocket`;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(websocketUrl);
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        callback();
      };
      const fail = () => finish(() => reject(communicationError()));
      timeout = setTimeout(() => fail(), requestTimeoutMs);
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
            type: 'recorder/statistics_during_period',
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            statistic_ids: [this.entities.energyToday],
            period: 'day',
            types: ['sum'],
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

  private async getHourlyConsumption(current: HomeAssistantState): Promise<number[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    const query = new URLSearchParams({
      filter_entity_id: this.entities.energyHourlyConsumption,
      end_time: end.toISOString(),
      minimal_response: 'true',
      no_attributes: 'true',
    });
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/history/period/${start.toISOString()}?${query}`, {
      method: 'GET', headers: this.headers(),
    });
    if (!response.ok) throw communicationError();
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw communicationError();
    return hourlyConsumptionFromHourlySensor(payload[0], start.getTime(), end.getTime(), current.state);
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
    return this.getCameraImageFor(this.entities.doorbellCamera);
  }

  public async executeLight(light: LightControlKey, command: LightCommand): Promise<CommandResult> {
    try {
      const entityId = this.entities[light];
      if (!entityId) throw communicationError();
      if ('on' in command) {
        await this.request(command.on ? 'light/turn_on' : 'light/turn_off', { entity_id: entityId });
      } else if (Number.isInteger(command.brightness) && command.brightness >= 1 && command.brightness <= 100) {
        await this.request('light/turn_on', { entity_id: entityId, brightness_pct: command.brightness });
      } else {
        throw communicationError();
      }
      return { states: { [light]: await this.getState(entityId) } };
    } catch {
      throw communicationError();
    }
  }

  public async executeVacuum(action: VacuumAction, option?: string): Promise<CommandResult> {
    const buttonEntities: Partial<Record<VacuumAction, string>> = {
      full: 'button.sucky_v2_full_cleaning', gang: 'button.sucky_v2_gang', kjokken: 'button.sucky_v2_kjokken', lounge: 'button.sucky_v2_lounge', stue: 'button.sucky_v2_stue', morgen: 'button.sucky_v2_morgen', natt: 'button.sucky_v2_natt', vacMop: 'button.sucky_v2_vac_followed_by_mop', kitchenRefill: 'script.send_sucky_robovacuum_to_kitchen',
    };
    try {
      if (action === 'start' || action === 'pause' || action === 'dock' || action === 'locate') {
        const service = action === 'start' ? 'vacuum/start' : action === 'pause' ? 'vacuum/pause' : action === 'dock' ? 'vacuum/return_to_base' : 'vacuum/locate';
        await this.request(service, { entity_id: this.entities.vacuum });
      } else if (action === 'cleaningMode' || action === 'mopMode' || action === 'mopIntensity') {
        if (!option) throw communicationError();
        const entityKey = action === 'cleaningMode' ? 'vacuumCleaningMode' : action === 'mopMode' ? 'vacuumMopMode' : 'vacuumMopIntensity';
        await this.request('select/select_option', { entity_id: this.entities[entityKey], option });
      } else if (action === 'volume') {
        const value = Number(option);
        if (!Number.isFinite(value)) throw communicationError();
        await this.request('number/set_value', { entity_id: this.entities.vacuumVolume, value });
      } else {
        const entityId = buttonEntities[action];
        if (!entityId) throw communicationError();
        await this.request(entityId.startsWith('script.') ? 'script/turn_on' : 'button/press', { entity_id: entityId });
      }
      return await this.getDashboardStates();
    } catch {
      throw communicationError();
    }
  }

  public async getCourtyardCameraImage(): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    return this.getCameraImageFor(this.entities.courtyardCamera);
  }

  public async getVacuumMap(): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    try {
      const state = await this.getState(this.entities.vacuumMap);
      const picture = state.attributes.entity_picture;
      if (typeof picture !== 'string' || !picture.startsWith('/api/image_proxy/')) throw communicationError();
      const response = await this.fetchWithTimeout(`${this.baseUrl}${picture}`, { method: 'GET', headers: this.headers() });
      if (!response.ok) throw communicationError();
      return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'image/jpeg' };
    } catch {
      throw communicationError();
    }
  }

  private async getCameraImageFor(entityId: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    if (!entityId) throw communicationError();
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/camera_proxy/${entityId}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) throw communicationError();
    return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'image/jpeg' };
  }

  public async getCameraStream(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
    return this.getCameraStreamFor(this.entities.doorbellCamera);
  }

  public async getCourtyardCameraStream(): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
    return this.getCameraStreamFor(this.entities.courtyardCamera);
  }

  private async getCameraStreamFor(entityId: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
    if (!entityId) throw communicationError();
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/camera_proxy_stream/${entityId}`, {
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
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/services/${service}`, {
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
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/states/${entityId}`, {
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

  private async getLightningStrikes(): Promise<HomeAssistantState> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/states`, { method: 'GET', headers: this.headers() });
    if (!response.ok) throw communicationError();
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw communicationError();
    const strikes = payload.flatMap((item) => {
      if (!isPlainObject(item) || typeof item.entity_id !== 'string' || !item.entity_id.startsWith('geo_location.lightning_strike_') || typeof item.state !== 'string' || !isPlainObject(item.attributes)) return [] as HomeAssistantState[];
      const latitude = Number(item.attributes.latitude);
      const longitude = Number(item.attributes.longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ entity_id: item.entity_id, state: item.state, attributes: item.attributes }]
        : [];
    });
    return { entity_id: 'geo_location.lightning_strike_*', state: strikes.length ? 'on' : 'off', attributes: { strikes } };
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
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/calendars/${state.entity_id}?${query}`, {
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

  private async fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await this.fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}
