import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app';
import { HomeAssistantClient } from './homeAssistant';
import { defaultDashboardEntityIds } from '../shared/entities';

const haUrl = process.env.HA_URL;
const haToken = process.env.HA_TOKEN;
const aiReportSecret = process.env.AI_REPORT_SECRET?.trim() || '';
const aiReportSourceUrl = process.env.AI_REPORT_SOURCE_URL?.trim() || '';
const aiReportRefreshUrl = process.env.N8N_AI_REPORT_REFRESH_URL?.trim() || '';
const aiReportStorePath = process.env.AI_REPORT_STORE_PATH?.trim() || '';

if (!haUrl || !haToken) {
  throw new Error('HA_URL og HA_TOKEN må være satt');
}

const port = Number(process.env.PORT ?? 3000);
const entities = {
  ...defaultDashboardEntityIds,
  homeMode: process.env.HA_HOME_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.homeMode,
  guestMode: process.env.HA_GUEST_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.guestMode,
  guestVoucher: process.env.HA_GUEST_VOUCHER_SENSOR_ID?.trim() || defaultDashboardEntityIds.guestVoucher,
  family: process.env.HA_FAMILY_GROUP_ENTITY_ID?.trim() || defaultDashboardEntityIds.family,
  securityMode: process.env.HA_SECURITY_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.securityMode,
  frontDoorLock: process.env.HA_FRONT_DOOR_LOCK_ENTITY_ID?.trim() || defaultDashboardEntityIds.frontDoorLock,
  weatherHourly: process.env.HA_WEATHER_HOURLY_ENTITY_ID?.trim() || defaultDashboardEntityIds.weatherHourly,
  weatherDaily: process.env.HA_WEATHER_DAILY_ENTITY_ID?.trim() || defaultDashboardEntityIds.weatherDaily,
  doorbellCamera: process.env.HA_DOORBELL_CAMERA_ENTITY_ID?.trim() || '',
  courtyardCamera: process.env.HA_COURTYARD_CAMERA_ENTITY_ID?.trim() || defaultDashboardEntityIds.courtyardCamera,
  meteoAlarm: process.env.HA_METEOALARM_ENTITY_ID?.trim() || defaultDashboardEntityIds.meteoAlarm,
  lightningDistance: process.env.HA_LIGHTNING_DISTANCE_ENTITY_ID?.trim() || defaultDashboardEntityIds.lightningDistance,
  auroraVisibility: process.env.HA_AURORA_VISIBILITY_ENTITY_ID?.trim() || defaultDashboardEntityIds.auroraVisibility,
  energyToday: process.env.HA_ENERGY_TODAY_ENTITY_ID?.trim() || defaultDashboardEntityIds.energyToday,
  energyHourlyConsumption: process.env.HA_ENERGY_HOURLY_CONSUMPTION_ENTITY_ID?.trim() || defaultDashboardEntityIds.energyHourlyConsumption,
  energyPower: process.env.HA_ENERGY_POWER_ENTITY_ID?.trim() || defaultDashboardEntityIds.energyPower,
  energyPrice: process.env.HA_ENERGY_PRICE_ENTITY_ID?.trim() || defaultDashboardEntityIds.energyPrice,
  roomLiving: process.env.HA_ROOM_LIVING_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomLiving,
  roomBedroom: process.env.HA_ROOM_BEDROOM_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomBedroom,
  roomBathroom: process.env.HA_ROOM_BATHROOM_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomBathroom,
  roomLivingHumidity: process.env.HA_ROOM_LIVING_HUMIDITY_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomLivingHumidity,
  roomLivingCo2: process.env.HA_ROOM_LIVING_CO2_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomLivingCo2,
  roomBedroomHumidity: process.env.HA_ROOM_BEDROOM_HUMIDITY_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomBedroomHumidity,
  roomBedroomCo2: process.env.HA_ROOM_BEDROOM_CO2_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomBedroomCo2,
  roomBathroomHumidity: process.env.HA_ROOM_BATHROOM_HUMIDITY_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomBathroomHumidity,
  roomBathroomCo2: process.env.HA_ROOM_BATHROOM_CO2_ENTITY_ID?.trim() || defaultDashboardEntityIds.roomBathroomCo2,
  waste: process.env.HA_WASTE_ENTITY_ID?.trim() || 'sensor.next_garbage_collection',
  carAndreasRange: process.env.HA_CAR_ANDREAS_RANGE_ENTITY_ID?.trim() || defaultDashboardEntityIds.carAndreasRange,
  carAndreasBattery: process.env.HA_CAR_ANDREAS_BATTERY_ENTITY_ID?.trim() || defaultDashboardEntityIds.carAndreasBattery,
  carHegeRange: process.env.HA_CAR_HEGE_RANGE_ENTITY_ID?.trim() || '',
  carHegeBattery: process.env.HA_CAR_HEGE_BATTERY_ENTITY_ID?.trim() || '',
  andreasTravelTime: process.env.HA_ANDREAS_TRAVEL_TIME_ENTITY_ID?.trim() || '',
  hegeTravelTime: process.env.HA_HEGE_TRAVEL_TIME_ENTITY_ID?.trim() || '',
  calendar: process.env.HA_CALENDAR_ENTITY_ID?.trim() || defaultDashboardEntityIds.calendar,
  repairHealth: process.env.HA_REPAIR_HEALTH_ENTITY_ID?.trim() || '',
};
const guestVoucherCreateButtonId = process.env.HA_GUEST_VOUCHER_CREATE_BUTTON_ID?.trim();
const app = createApp(new HomeAssistantClient(haUrl, haToken, fetch, entities, guestVoucherCreateButtonId), aiReportSecret, aiReportSourceUrl, aiReportRefreshUrl, aiReportStorePath);
const distDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

app.use('/api', (_request, response) => {
  response.sendStatus(404);
});
if (process.env.DASHBOARD_SERVE_STATIC !== 'false') {
  app.use(express.static(distDirectory));
  app.get('/{*splat}', (_request, response) => {
    response.sendFile(path.join(distDirectory, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Dashboard listening on port ${port}`);
});
