import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app';
import { HomeAssistantClient } from './homeAssistant';

const haUrl = process.env.HA_URL;
const haToken = process.env.HA_TOKEN;

if (!haUrl || !haToken) {
  throw new Error('HA_URL og HA_TOKEN må være satt');
}

const port = Number(process.env.PORT ?? 3000);
const app = createApp(new HomeAssistantClient(haUrl, haToken));
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
