import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app';
import { HomeAssistantClient } from './homeAssistant';
import { defaultDashboardEntityIds } from '../shared/entities';

const haUrl = process.env.HA_URL;
const haToken = process.env.HA_TOKEN;
const weatherAutomationTraceId = process.env.HA_WEATHER_AUTOMATION_TRACE_ID?.trim() || '1774815930721';

if (!haUrl || !haToken) {
  throw new Error('HA_URL og HA_TOKEN må være satt');
}

const port = Number(process.env.PORT ?? 3000);
const entities = {
  ...defaultDashboardEntityIds,
  homeMode: process.env.HA_HOME_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.homeMode,
  guestMode: process.env.HA_GUEST_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.guestMode,
  guestVoucher: process.env.HA_GUEST_VOUCHER_SENSOR_ID?.trim() || defaultDashboardEntityIds.guestVoucher,
  securityMode: process.env.HA_SECURITY_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.securityMode,
  frontDoorLock: process.env.HA_FRONT_DOOR_LOCK_ENTITY_ID?.trim() || defaultDashboardEntityIds.frontDoorLock,
  weatherHourly: process.env.HA_WEATHER_HOURLY_ENTITY_ID?.trim() || defaultDashboardEntityIds.weatherHourly,
  weatherDaily: process.env.HA_WEATHER_DAILY_ENTITY_ID?.trim() || defaultDashboardEntityIds.weatherDaily,
  doorbellCamera: process.env.HA_DOORBELL_CAMERA_ENTITY_ID?.trim() || '',
  weatherSummary: process.env.HA_WEATHER_SUMMARY_ENTITY_ID?.trim() || '',
  energyToday: process.env.HA_ENERGY_TODAY_ENTITY_ID?.trim() || '',
  roomLiving: process.env.HA_ROOM_LIVING_ENTITY_ID?.trim() || '',
  roomBedroom: process.env.HA_ROOM_BEDROOM_ENTITY_ID?.trim() || '',
  roomBathroom: process.env.HA_ROOM_BATHROOM_ENTITY_ID?.trim() || '',
  waste: process.env.HA_WASTE_ENTITY_ID?.trim() || '',
  carAndreasRange: process.env.HA_CAR_ANDREAS_RANGE_ENTITY_ID?.trim() || '',
  carHegeRange: process.env.HA_CAR_HEGE_RANGE_ENTITY_ID?.trim() || '',
  andreasTravelTime: process.env.HA_ANDREAS_TRAVEL_TIME_ENTITY_ID?.trim() || '',
  hegeTravelTime: process.env.HA_HEGE_TRAVEL_TIME_ENTITY_ID?.trim() || '',
  calendar: process.env.HA_CALENDAR_ENTITY_ID?.trim() || '',
  repairHealth: process.env.HA_REPAIR_HEALTH_ENTITY_ID?.trim() || '',
};
const guestVoucherCreateButtonId = process.env.HA_GUEST_VOUCHER_CREATE_BUTTON_ID?.trim();
const app = createApp(new HomeAssistantClient(haUrl, haToken, fetch, entities, guestVoucherCreateButtonId, weatherAutomationTraceId));
const distDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

app.use('/api', (_request, response) => {
  response.sendStatus(404);
});
app.use(express.static(distDirectory));
app.get('/{*splat}', (_request, response) => {
  response.sendFile(path.join(distDirectory, 'index.html'));
});

app.listen(port, () => {
  console.log(`Dashboard listening on port ${port}`);
});
