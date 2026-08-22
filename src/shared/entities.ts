export const dashboardTitle = 'Smarthjem';

export type HeatPumpMode = 'cool' | 'heat' | 'heat_cool' | 'fan_only';
export type FanSpeed = 'quiet' | 'medium' | 'strong';
export const lightControlKeys = [
  'lightAll', 'lightLoungeDownlights', 'lightCove', 'lightWindowLights', 'lightLivingCeiling', 'lightStairStrip', 'lightDining', 'lightKitchen',
  'lightInnerHall', 'lightEntrance', 'lightBathroom', 'lightBedroom', 'lightJacob',
  'lightJacobCeiling', 'lightJacobBed', 'lightUpperHall', 'lightUpstairsToilet', 'lightOffice',
] as const;
export type LightControlKey = (typeof lightControlKeys)[number];
export type LightCommand = { on: boolean } | { brightness: number };
export type DashboardAction =
  | 'home' | 'guestMode' | 'guestVoucher' | 'morning' | 'evening' | 'night'
  | 'cooling' | 'heatPump' | 'fanSpeed' | 'securityMode' | 'lockDoor' | 'unlockDoor';

export const dashboardStateKeys = [
  'home', 'homeMode', 'guestMode', 'guestVoucher', 'family', 'morning', 'evening', 'night',
  'cooling', 'climate', 'outdoor', 'securityMode', 'frontDoorLock', 'doorbellCamera', 'courtyardCamera',
  'weatherHourly', 'weatherDaily', 'meteoAlarm', 'lightningDistance', 'lightningStrikes', 'auroraVisibility', 'auroraChance', 'moonPhase', 'sun',
  'netatmoPressure', 'netatmoWindAngle', 'netatmoWindDirection', 'netatmoWindSpeed', 'netatmoWindGust', 'netatmoRain', 'netatmoRainToday', 'netatmoRainLastHour',
  'pollenForecast', 'pollenAlder', 'pollenBirch', 'pollenGrass', 'pollenHazel', 'pollenMugwort', 'pollenWillow',
  'energyToday', 'energyYesterday', 'energyHourlyConsumption', 'energyPower', 'energyPrice', 'roomLiving',
  'roomBedroom', 'roomBathroom', 'roomLivingHumidity', 'roomLivingCo2', 'roomBedroomHumidity', 'roomBedroomCo2', 'roomBathroomHumidity', 'roomBathroomCo2', 'waste', 'carAndreasRange', 'carAndreasBattery', 'carHegeRange', 'carHegeBattery',
  'andreasTravelTime', 'hegeTravelTime', 'calendar', 'repairHealth',
  'vacuum', 'vacuumBattery', 'vacuumStatus', 'vacuumProgress', 'vacuumArea', 'vacuumTime', 'vacuumRoom', 'vacuumCharging', 'vacuumCleaning', 'vacuumMopAttached', 'vacuumWaterBoxAttached', 'vacuumWaterShortage', 'vacuumMopDrying', 'vacuumCleaningMode', 'vacuumMopMode', 'vacuumMopIntensity', 'vacuumVolume', 'vacuumMap',
  ...lightControlKeys,
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
  family: 'group.family',
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
  meteoAlarm: 'sensor.met_weather_alerts_county_39',
  lightningDistance: 'sensor.blitzortung_lightning_distance',
  lightningStrikes: '',
  auroraVisibility: 'binary_sensor.aurora_visibility_visibility_alert',
  auroraChance: 'sensor.aurora_visibility_visibility',
  moonPhase: 'sensor.moon_phase',
  sun: 'sun.sun',
  netatmoPressure: 'sensor.indoor_atmospheric_pressure',
  netatmoWindAngle: 'sensor.indoor_vind_wind_angle',
  netatmoWindDirection: 'sensor.indoor_vind_wind_direction',
  netatmoWindSpeed: 'sensor.indoor_vind_wind_speed',
  netatmoWindGust: 'sensor.indoor_vind_gust_strength',
  netatmoRain: 'sensor.indoor_regn_precipitation',
  netatmoRainToday: 'sensor.indoor_regn_precipitation_today',
  netatmoRainLastHour: 'sensor.indoor_regn_precipitation_last_hour',
  pollenForecast: 'sensor.pollen_data_ostlandetmedoslo_forecast',
  pollenAlder: 'sensor.pollen_data_ostlandetmedoslo_alder',
  pollenBirch: 'sensor.pollen_data_ostlandetmedoslo_birch',
  pollenGrass: 'sensor.pollen_data_ostlandetmedoslo_grass',
  pollenHazel: 'sensor.pollen_data_ostlandetmedoslo_hazel',
  pollenMugwort: 'sensor.pollen_data_ostlandetmedoslo_mugwort',
  pollenWillow: 'sensor.pollen_data_ostlandetmedoslo_willow',
  energyToday: 'sensor.accumulated_consumption_klaras_vei_14',
  energyYesterday: '',
  energyHourlyConsumption: 'sensor.accumulated_consumption_current_hour_klaras_vei_14',
  energyPower: 'sensor.power_klaras_vei_14',
  energyPrice: 'sensor.nordpool_kwh_no2_nok_3_10_025',
  roomLiving: 'sensor.indoor_temperature',
  roomBedroom: 'sensor.indoor_soverom_ha_temperature',
  roomBathroom: 'sensor.indoor_soverom_j_temperature',
  roomLivingHumidity: 'sensor.indoor_humidity',
  roomLivingCo2: 'sensor.indoor_carbon_dioxide',
  roomBedroomHumidity: 'sensor.indoor_soverom_ha_humidity',
  roomBedroomCo2: 'sensor.indoor_soverom_ha_carbon_dioxide',
  roomBathroomHumidity: 'sensor.indoor_soverom_j_humidity',
  roomBathroomCo2: 'sensor.indoor_soverom_j_carbon_dioxide',
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
  lightAll: 'light.alle_lys',
  lightLoungeDownlights: 'light.lounge_downlights',
  lightCove: 'light.cove',
  lightWindowLights: 'light.vindulys',
  lightLivingCeiling: 'light.takspot_stue',
  lightStairStrip: 'light.trapp',
  lightDining: 'light.spisestuebord',
  lightKitchen: 'light.kjokken',
  lightInnerHall: 'light.innergang',
  lightEntrance: 'light.yttergang',
  lightBathroom: 'light.lysbryter_bad',
  lightBedroom: 'light.soverom',
  lightJacob: 'light.alle_lys_soverom_jacob',
  lightJacobCeiling: 'light.soverom_jacob_taklampe',
  lightJacobBed: 'light.soverom_jacob_ledlist_seng',
  lightUpperHall: 'light.gang_2_etg',
  lightUpstairsToilet: 'light.takspot_toalett_2_etg',
  lightOffice: 'light.kontor',
};

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}
