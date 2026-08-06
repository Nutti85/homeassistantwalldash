import {
  climateEntityId,
  climateStateKey,
  coolingEntityId,
  coolingStateKey,
  eveningEntityId,
  eveningStateKey,
  guestModeEntityId,
  guestModeStateKey,
  homeStateEntityId,
  homeStateKey,
  type DashboardAction,
  type DashboardStateKey,
  type HomeAssistantState,
  morningEntityId,
  morningStateKey,
  nightEntityId,
  nightStateKey,
} from '../shared/entities';

type DashboardStates = { states: Record<DashboardStateKey, HomeAssistantState> };
type CommandResult = { states: Partial<Record<DashboardStateKey, HomeAssistantState>> };

const dashboardEntities: Record<DashboardStateKey, string> = {
  [homeStateKey]: homeStateEntityId,
  [guestModeStateKey]: guestModeEntityId,
  [morningStateKey]: morningEntityId,
  [eveningStateKey]: eveningEntityId,
  [nightStateKey]: nightEntityId,
  [coolingStateKey]: coolingEntityId,
  [climateStateKey]: climateEntityId,
};

const commands: Record<Exclude<DashboardAction, 'home'>, { service: string; entityId: string }> = {
  guestMode: { service: 'input_boolean/turn_on', entityId: guestModeEntityId },
  morning: { service: 'automation/trigger', entityId: morningEntityId },
  evening: { service: 'script/turn_on', entityId: eveningEntityId },
  night: { service: 'script/turn_on', entityId: nightEntityId },
  cooling: { service: 'automation/turn_on', entityId: coolingEntityId },
};

const communicationError = () => new Error('Kunne ikke kommunisere med Home Assistant');

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export class HomeAssistantClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public async getDashboardStates(): Promise<DashboardStates> {
    try {
      const states = {} as Record<DashboardStateKey, HomeAssistantState>;
      for (const [key, entityId] of Object.entries(dashboardEntities) as [DashboardStateKey, string][]) {
        states[key] = await this.getState(entityId);
      }
      return { states };
    } catch {
      throw communicationError();
    }
  }

  public async execute(action: DashboardAction, option?: 'Hjemme' | 'Borte'): Promise<CommandResult> {
    try {
      if (action === 'home') {
        if (option !== 'Hjemme' && option !== 'Borte') {
          throw communicationError();
        }
        await this.request('input_select/select_option', {
          entity_id: homeStateEntityId,
          option,
        });
        return { states: { home: await this.getState(homeStateEntityId) } };
      }

      const command = commands[action as Exclude<DashboardAction, 'home'>];
      if (!command) {
        throw communicationError();
      }
      await this.request(command.service, { entity_id: command.entityId });
      return { states: { [action]: await this.getState(command.entityId) } };
    } catch {
      throw communicationError();
    }
  }

  public async setTemperature(temperature: number): Promise<CommandResult> {
    if (!Number.isFinite(temperature)) {
      throw new Error('Ugyldig temperatur');
    }

    try {
      const climate = await this.getState(climateEntityId);
      const minTemperature = climate.attributes.min_temp;
      const maxTemperature = climate.attributes.max_temp;
      const hasMinTemperature = Object.prototype.hasOwnProperty.call(climate.attributes, 'min_temp');
      const hasMaxTemperature = Object.prototype.hasOwnProperty.call(climate.attributes, 'max_temp');
      if (
        (hasMinTemperature && (typeof minTemperature !== 'number' || !Number.isFinite(minTemperature)))
        || (hasMaxTemperature && (typeof maxTemperature !== 'number' || !Number.isFinite(maxTemperature)))
        || (hasMinTemperature && hasMaxTemperature && minTemperature > maxTemperature)
      ) {
        throw communicationError();
      }
      const clampedTemperature = Math.max(
        hasMinTemperature ? minTemperature as number : -Infinity,
        Math.min(
          temperature,
          hasMaxTemperature ? maxTemperature as number : Infinity,
        ),
      );

      await this.request('climate/set_temperature', {
        entity_id: climateEntityId,
        temperature: clampedTemperature,
      });
      return { states: { climate: await this.getState(climateEntityId) } };
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
    return payload as HomeAssistantState;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}
