export const dashboardTitle = 'Smarthjem';

export type HeatPumpMode = 'cool' | 'heat' | 'heat_cool' | 'fan_only';
export type FanSpeed = 'quiet' | 'medium' | 'strong';
export type DashboardAction =
  | 'home' | 'guestMode' | 'guestVoucher' | 'morning' | 'evening' | 'night'
  | 'cooling' | 'heatPump' | 'fanSpeed' | 'securityMode' | 'lockDoor' | 'unlockDoor';

export const dashboardStateKeys = [
  'home', 'homeMode', 'guestMode', 'guestVoucher', 'morning', 'evening', 'night',
  'cooling', 'climate', 'outdoor', 'securityMode', 'frontDoorLock', 'doorbellCamera', 'courtyardCamera',
  'weatherHourly', 'weatherDaily', 'weatherSummary', 'energyToday', 'roomLiving',
  'roomBedroom', 'roomBathroom', 'waste', 'carAndreasRange', 'carAndreasBattery', 'carHegeRange', 'carHegeBattery',
  'andreasTravelTime', 'hegeTravelTime', 'calendar', 'repairHealth',
  'vacuum', 'vacuumBattery', 'vacuumStatus', 'vacuumProgress', 'vacuumArea', 'vacuumTime', 'vacuumRoom', 'vacuumCharging', 'vacuumCleaning', 'vacuumMopAttached', 'vacuumWaterBoxAttached', 'vacuumWaterShortage', 'vacuumMopDrying', 'vacuumCleaningMode', 'vacuumMopMode', 'vacuumMopIntensity', 'vacuumVolume', 'vacuumMap',
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
  courtyardCamera: 'camera.gaardsplass_fluent_lens_0',
  weatherSummary: '',
  energyToday: 'sensor.accumulated_consumption_klaras_vei_14',
  roomLiving: 'sensor.indoor_temperature',
  roomBedroom: 'sensor.indoor_soverom_ha_temperature',
  roomBathroom: 'sensor.indoor_soverom_j_temperature',
  waste: 'sensor.next_garbage_collection',
  carAndreasRange: 'sensor.ee14199_range_electric',
  carAndreasBattery: 'sensor.ee14199_state_of_charge',
  carHegeRange: '',
  carHegeBattery: '',
  andreasTravelTime: '',
  hegeTravelTime: '',
  calendar: 'calendar.outlook_andreas_felles',
  repairHealth: '',
  vacuum: 'vacuum.roborock_s8',
  vacuumBattery: 'sensor.sucky_v2_battery',
  vacuumStatus: 'sensor.sucky_v2_status',
  vacuumProgress: 'sensor.sucky_v2_cleaning_progress',
  vacuumArea: 'sensor.sucky_v2_cleaning_area',
  vacuumTime: 'sensor.sucky_v2_cleaning_time',
  vacuumRoom: 'sensor.sucky_v2_current_room',
  vacuumCharging: 'binary_sensor.sucky_v2_charging',
  vacuumCleaning: 'binary_sensor.sucky_v2_cleaning',
  vacuumMopAttached: 'binary_sensor.sucky_v2_mop_attached',
  vacuumWaterBoxAttached: 'binary_sensor.sucky_v2_water_box_attached',
  vacuumWaterShortage: 'binary_sensor.sucky_v2_water_shortage',
  vacuumMopDrying: 'binary_sensor.sucky_v2_dock_mop_drying',
  vacuumCleaningMode: 'select.sucky_v2_cleaning_mode',
  vacuumMopMode: 'select.roborock_s8_mop_mode',
  vacuumMopIntensity: 'select.roborock_s8_mop_intensity',
  vacuumVolume: 'number.sucky_v2_volume',
  vacuumMap: 'image.sucky_v2_forste_etasje',
};

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}
