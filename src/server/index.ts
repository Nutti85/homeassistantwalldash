import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app';
import { HomeAssistantClient } from './homeAssistant';
import { defaultDashboardEntityIds } from '../shared/entities';

const haUrl = process.env.HA_URL;
const haToken = process.env.HA_TOKEN;

if (!haUrl || !haToken) {
  throw new Error('HA_URL og HA_TOKEN må være satt');
}

const port = Number(process.env.PORT ?? 3000);
const entities = {
  ...defaultDashboardEntityIds,
  homeMode: process.env.HA_HOME_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.homeMode,
  guestMode: process.env.HA_GUEST_MODE_ENTITY_ID?.trim() || defaultDashboardEntityIds.guestMode,
  guestVoucher: process.env.HA_GUEST_VOUCHER_SENSOR_ID?.trim() || defaultDashboardEntityIds.guestVoucher,
};
const guestVoucherCreateButtonId = process.env.HA_GUEST_VOUCHER_CREATE_BUTTON_ID?.trim();
const app = createApp(new HomeAssistantClient(haUrl, haToken, fetch, entities, guestVoucherCreateButtonId));
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
