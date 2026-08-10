export const dashboardTitle = 'Smarthjem';

export type HeatPumpMode = 'cool' | 'heat' | 'heat_cool' | 'fan_only';
export type FanSpeed = 'quiet' | 'medium' | 'strong';
export type DashboardAction =
  | 'home' | 'guestMode' | 'guestVoucher' | 'morning' | 'evening' | 'night'
  | 'cooling' | 'heatPump' | 'fanSpeed' | 'securityMode' | 'lockDoor' | 'unlockDoor';

export const dashboardStateKeys = [
  'home', 'homeMode', 'guestMode', 'guestVoucher', 'morning', 'evening', 'night',
  'cooling', 'climate', 'outdoor', 'securityMode', 'frontDoorLock', 'doorbellCamera',
  'weatherHourly', 'weatherDaily', 'weatherSummary', 'energyToday', 'roomLiving',
  'roomBedroom', 'roomBathroom', 'waste', 'carAndreasRange', 'carHegeRange',
  'andreasTravelTime', 'hegeTravelTime', 'calendar', 'repairHealth',
] as const;

export type DashboardStateKey = (typeof dashboardStateKeys)[number];
export type DashboardEntityIds = Record<DashboardStateKey, string>;

export const homeStateKey = 'home';
export const homeModeStateKey = 'homeMode';
export const guestModeStateKey = 'guestMode';
export const guestVoucherStateKey = 'guestVoucher';
export const morningStateKey = 'morning';
export const eveningStateKey = 'evening';
export const nightStateKey = 'night';
export const coolingStateKey = 'cooling';
export const climateStateKey = 'climate';
export const outdoorStateKey = 'outdoor';

export const guestVoucherCreateButtonEntityId = 'button.67647a4bca314858fac0f8fc_create';

export const defaultDashboardEntityIds: DashboardEntityIds = {
  home: 'input_select.home_state',
  homeMode: 'input_select.home_mode',
  guestMode: 'input_boolean.gjest',
  guestVoucher: 'sensor.67647a4bca314858fac0f8fc_voucher',
  morning: 'automation.modus_god_morgen',
  evening: 'script.1572988362234',
  night: 'script.1569099501074',
  cooling: 'automation.klima_automatisk_kjoling_optimalisert',
  climate: 'climate.stue',
  outdoor: 'sensor.indoor_ute_temperature',
  securityMode: 'input_number.toggle_security_mode',
  frontDoorLock: 'lock.aqara_smart_lock_u200_2',
  weatherHourly: 'sensor.weather_hourly',
  weatherDaily: 'sensor.weather_daily',
  doorbellCamera: '',
  weatherSummary: '',
  energyToday: '',
  roomLiving: '',
  roomBedroom: '',
  roomBathroom: '',
  waste: '',
  carAndreasRange: '',
  carHegeRange: '',
  andreasTravelTime: '',
  hegeTravelTime: '',
  calendar: '',
  repairHealth: '',
};

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}
