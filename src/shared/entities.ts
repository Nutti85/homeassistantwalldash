export const dashboardTitle = 'Smarthjem';

export const homeStateEntityId = 'input_select.home_state';
export const guestModeEntityId = 'input_boolean.gjest';
export const guestVoucherEntityId = 'sensor.67647a4bca314858fac0f8fc_voucher';
export const guestVoucherCreateButtonEntityId = 'button.67647a4bca314858fac0f8fc_create';
export const morningEntityId = 'automation.modus_god_morgen';
export const eveningEntityId = 'script.1572988362234';
export const nightEntityId = 'script.1569099501074';
export const coolingEntityId = 'automation.klima_automatisk_kjoling_optimalisert';
export const climateEntityId = 'climate.stue';
export const outdoorEntityId = 'sensor.indoor_ute_temperature';

export type HeatPumpMode = 'cool' | 'heat' | 'heat_cool' | 'fan_only';
export type FanSpeed = 'quiet' | 'medium' | 'strong';
export type DashboardAction = 'home' | 'guestMode' | 'guestVoucher' | 'morning' | 'evening' | 'night' | 'cooling' | 'heatPump' | 'fanSpeed';
export const homeStateKey = 'home';
export const guestModeStateKey = 'guestMode';
export const guestVoucherStateKey = 'guestVoucher';
export const morningStateKey = 'morning';
export const eveningStateKey = 'evening';
export const nightStateKey = 'night';
export const coolingStateKey = 'cooling';
export const climateStateKey = 'climate';
export const outdoorStateKey = 'outdoor';
export type DashboardStateKey = typeof homeStateKey | typeof guestModeStateKey | typeof guestVoucherStateKey | typeof morningStateKey
  | typeof eveningStateKey | typeof nightStateKey | typeof coolingStateKey | typeof climateStateKey | typeof outdoorStateKey;

export type DashboardEntityIds = Record<DashboardStateKey, string>;

export const defaultDashboardEntityIds: DashboardEntityIds = {
  home: homeStateEntityId,
  guestMode: guestModeEntityId,
  guestVoucher: guestVoucherEntityId,
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
