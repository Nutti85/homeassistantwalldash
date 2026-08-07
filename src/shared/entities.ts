export const dashboardTitle = 'Smarthjem';

export const homeStateEntityId = 'input_select.home_state';
export const guestModeEntityId = 'input_boolean.gjest';
export const morningEntityId = 'automation.modus_god_morgen';
export const eveningEntityId = 'script.1572988362234';
export const nightEntityId = 'script.1569099501074';
export const coolingEntityId = 'automation.klima_automatisk_kjoling_optimalisert';
export const climateEntityId = 'climate.daikinap19531_room_temperature';
export const outdoorEntityId = 'sensor.indoor_ute_temperature';

export type DashboardAction = 'home' | 'guestMode' | 'morning' | 'evening' | 'night' | 'cooling';
export const homeStateKey = 'home';
export const guestModeStateKey = 'guestMode';
export const morningStateKey = 'morning';
export const eveningStateKey = 'evening';
export const nightStateKey = 'night';
export const coolingStateKey = 'cooling';
export const climateStateKey = 'climate';
export const outdoorStateKey = 'outdoor';
export type DashboardStateKey = typeof homeStateKey | typeof guestModeStateKey | typeof morningStateKey
  | typeof eveningStateKey | typeof nightStateKey | typeof coolingStateKey | typeof climateStateKey | typeof outdoorStateKey;

export type DashboardEntityIds = Record<DashboardStateKey, string>;

export const defaultDashboardEntityIds: DashboardEntityIds = {
  home: homeStateEntityId,
  guestMode: guestModeEntityId,
  morning: morningEntityId,
  evening: eveningEntityId,
  night: nightEntityId,
  cooling: coolingEntityId,
  climate: climateEntityId,
  outdoor: outdoorEntityId,
};

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}
