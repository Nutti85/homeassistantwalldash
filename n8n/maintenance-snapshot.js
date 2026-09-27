// n8n Code node: run once after re-reading the Home Assistant to-do list.
const assessment = $items('Assess maintenance')[0]?.json;
const response = $input.first()?.json ?? {};
const items = (response.service_response ?? response.body ?? response)['todo.husvedlikehold']?.items;
const priorRow = $items('Load previous snapshot')[0]?.json;
const prior = priorRow?.payload ? JSON.parse(priorRow.payload) : null;
const now = new Date().toISOString();
const writesOk = $items('Apply HA to-do operation').every(item => !item.json.error);
const tasks = Array.isArray(items) ? items.flatMap(item => {
  const id = item.description?.match(/Vedlikehold-ID: ([^\s]+)/)?.[1];
  if (!id) return [];
  const [, deviceId, kind] = id.match(/^battery:([^:]+):(replace_battery|check_offline|verify_device)$/) ?? [];
  if (!deviceId) return [];
  return [{ id, deviceId, kind, summary: item.summary, description: item.description, due: item.due ?? null, status: item.status, evidenceUpdatedAt: assessment.desired.find(task => task.id === id)?.evidenceUpdatedAt ?? prior?.tasks?.find(task => task.id === id)?.evidenceUpdatedAt ?? null }];
}) : (prior?.tasks ?? []);
const snapshot = {
  schemaVersion: 1,
  observedAt: assessment.sourceAvailable ? assessment.observedAt : prior?.observedAt ?? null,
  checkedAt: now,
  sourceAvailable: assessment.sourceAvailable && Array.isArray(items) && writesOk,
  devices: assessment.devices.map(({ kind, ...device }) => device),
  tasks,
};
return [{ json: { key: 'latest', payload: JSON.stringify(snapshot), observedAt: snapshot.observedAt, checkedAt: now, sourceAvailable: snapshot.sourceAvailable } }];
