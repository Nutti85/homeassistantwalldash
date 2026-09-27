import type { MaintenanceResponse, MaintenanceTask } from '../shared/maintenance';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 5000;
const nullableText = (value: unknown): value is string | null => value === null || text(value);
const nullableDate = (value: unknown): value is string | null => value === null || date(value);
const kinds = new Set(['replace_battery', 'check_offline', 'verify_device']);

export function mapMaintenance(value: unknown): MaintenanceResponse {
  if (!record(value) || value.schemaVersion !== 1 || !nullableDate(value.observedAt) || !date(value.checkedAt)
    || typeof value.sourceAvailable !== 'boolean' || !Array.isArray(value.devices) || !Array.isArray(value.tasks)
    || value.devices.length > 1000 || value.tasks.length > 1000) throw new Error('Invalid maintenance snapshot');
  const devices = new Map<string, MaintenanceTask['device']>();
  for (const item of value.devices) {
    if (!record(item) || !text(item.id) || !text(item.name) || !nullableText(item.area)
      || !(item.level === null || (typeof item.level === 'number' && Number.isFinite(item.level) && item.level >= 0 && item.level <= 100))
      || !nullableText(item.batteryType) || !(item.quantity === null || (Number.isInteger(item.quantity) && (item.quantity as number) > 0))
      || !text(item.status) || !text(item.action) || !nullableDate(item.evidenceUpdatedAt)) continue;
    devices.set(item.id, { name: item.name, area: item.area, level: item.level, batteryType: item.batteryType,
      quantity: item.quantity, status: item.status, action: item.action, evidenceUpdatedAt: item.evidenceUpdatedAt } as MaintenanceTask['device']);
  }
  const tasks: MaintenanceTask[] = [];
  for (const item of value.tasks) {
    if (!record(item) || item.status !== 'needs_action' || !text(item.id) || !text(item.deviceId)
      || !kinds.has(item.kind as string) || !text(item.summary) || !text(item.description)
      || !nullableDate(item.due)) continue;
    const device = devices.get(item.deviceId);
    if (device) tasks.push({ id: item.id, kind: item.kind as MaintenanceTask['kind'], summary: item.summary,
      description: item.description, due: item.due, device });
  }
  return { observedAt: value.observedAt, checkedAt: value.checkedAt, sourceAvailable: value.sourceAvailable, tasks };
}

export async function getMaintenance(url: string, key: string): Promise<MaintenanceResponse> {
  const response = await fetch(url, { headers: { 'X-Maintenance-Feed-Key': key }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error('Maintenance feed unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty maintenance feed');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) throw new Error('Maintenance feed too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return mapMaintenance(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
}
