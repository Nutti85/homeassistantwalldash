// n8n Code node: run once for all items after reading HA states and existing to-do items.
const catalog = [
  ['0x0017880104f3594d', 'Hovedlysbryter Soverom Jacob', 'Jacobs soverom', 'sensor.0x0017880104f3594d_battery', 'event.hovedlysbryter_soverom_jacob_action', 'CR2450', 1],
  ['0x001788010219cb54', 'Ekstralysbryter Soverom', 'Soverom', 'sensor.0x001788010219cb54_battery', 'event.ekstralysbryter_soverom_action', 'CR2450', 1],
  ['0x0017880104ee186e', 'Hovedlysbryter Soverom', 'Soverom', 'sensor.0x0017880104ee186e_battery', 'event.hovedlysbryter_soverom_action', 'CR2450', 1],
  ['0x00158d000488a2e3', 'Aqara Temperature Sensor Vaskerom', 'Vaskerom', 'sensor.0x00158d000488a2e3_battery', 'sensor.temp_vaskerom', null, null],
  ['0x8c65a3fffeef2fae', 'Vanning Planter', null, 'sensor.0x8c65a3fffeef2fae_battery', 'sensor.0x8c65a3fffeef2fae_current_device_status', null, null],
  ['0xa4c138d9823c57d3', 'Solar Rain Sensor Tuya', 'Ute', 'sensor.0xa4c138d9823c57d3_battery', 'binary_sensor.rain_sensor_rain', null, null],
  ['0x001788010646bf54', 'Philips Bevegelse Lux Yttervegg Vei', 'Ute', 'sensor.0x001788010646bf54_battery', 'binary_sensor.bevegelse_lys_ute', null, null],
  ['0x001788010670c2ff', 'Philips Hovedlysbryter Stue', 'Stue', 'sensor.0x001788010670c2ff_battery', 'event.philips_hovedlysbryter_stue_action', null, null],
  ['0x00158d000ae16cb6', 'Dørsensor Ytterdør', 'Ytterdør', 'sensor.sensor_ytterdor_battery', 'binary_sensor.sensor_ytterdor', null, null],
  ['0x14b457fffe7dc4d5', 'Lysbryter Kjøkken', 'Kjøkken', 'sensor.0x14b457fffe7dc4d5_battery', 'event.fjernkontroll_takspot_kjokken_action', null, null],
];
const stateItems = $items('Read HA states').map(item => item.json);
const states = new Map(stateItems.filter(item => item.entity_id).map(item => [item.entity_id, item]));
const priorRow = $items('Load previous snapshot')[0]?.json;
const prior = priorRow?.payload ? JSON.parse(priorRow.payload) : null;
const todoResponse = $input.first()?.json ?? {};
const todoItems = (todoResponse.service_response ?? todoResponse.body ?? todoResponse)['todo.husvedlikehold']?.items;
const available = states.size > 10 && Array.isArray(todoItems);
const existing = new Map((todoItems ?? []).map(item => [item.description?.match(/Vedlikehold-ID: ([^\s]+)/)?.[1], item]).filter(([id]) => id));
const now = new Date();
const bridge = states.get('binary_sensor.zigbee2mqtt_bridge_connection_state')?.state;
const bridgeDown = bridge !== 'on';
const devices = available ? catalog.map(([id, name, area, batteryEntityId, operationalEntityId, batteryType, quantity]) => {
  const battery = states.get(batteryEntityId);
  const operational = states.get(operationalEntityId);
  const level = Number(battery?.state);
  const validLevel = battery && battery.state !== 'unknown' && battery.state !== 'unavailable' && Number.isFinite(level) && level >= 0 && level <= 100;
  const evidenceUpdatedAt = battery?.last_updated ?? null;
  const ageHours = evidenceUpdatedAt ? (now - new Date(evidenceUpdatedAt)) / 3600000 : Infinity;
  const batteryStatus = !validLevel ? 'unknown' : ageHours > 48 ? 'stale' : level <= 5 ? 'critical' : level < 20 ? 'low' : 'healthy';
  const offline = battery?.state === 'unavailable' && operational?.state === 'unavailable' && !bridgeDown && ageHours > 0.5;
  const connectionStatus = offline ? 'offline' : operational?.state === 'unavailable' ? 'unknown' : 'online';
  const status = offline ? 'offline' : batteryStatus;
  let kind = null, action = 'Ingen tiltak';
  if (offline) { kind = 'check_offline'; action = 'Sjekk enhet og tilkobling; batteriet er ikke bekreftet tomt.'; }
  else if (batteryStatus === 'critical' || batteryStatus === 'low') {
    if (batteryType) { kind = 'replace_battery'; action = `Kjøp ${quantity} × ${batteryType} og bytt batteri.`; }
    else { kind = 'verify_device'; action = 'Kontroller fysisk modell og batteritype før kjøp.'; }
  } else if (batteryStatus === 'stale' && validLevel && level < 20) {
    kind = 'verify_device'; action = batteryEntityId.includes('a4c138') ? 'Sjekk solcelle, lading og plassering.' : 'Sjekk om enheten rapporterer og bekreft batterinivået.';
  } else if (!validLevel && operational?.state === 'unavailable' && !bridgeDown) {
    kind = 'verify_device'; action = 'Sjekk enhetens tilkobling og batteristatus.';
  }
  return { id, name, area, batteryEntityId, level: validLevel ? level : null, batteryType, quantity, replaceable: !batteryEntityId.includes('a4c138'), status, batteryStatus, connectionStatus, action, evidenceUpdatedAt, kind };
}) : (prior?.devices ?? []);
const desired = available ? devices.filter(device => device.kind).map(device => {
  const id = `battery:${device.id}:${device.kind}`;
  const prefix = device.kind === 'replace_battery' ? 'Bytt batteri' : device.kind === 'check_offline' ? 'Sjekk tilkobling' : 'Kontroller enhet';
  const summary = `${prefix}: ${device.name}`;
  const description = `${device.action}\nBatteritype: ${device.batteryType ? `${device.quantity} × ${device.batteryType}` : 'ukjent – kontroller fysisk modell'}.\n${device.level === null ? '' : `Siste nivå: ${device.level} %.\n`}Sist observert: ${device.evidenceUpdatedAt ?? 'ukjent'}.\nVedlikehold-ID: ${id}`;
  return { id, deviceId: device.id, kind: device.kind, summary, description, due: null, status: 'needs_action', evidenceUpdatedAt: device.evidenceUpdatedAt };
}) : [];
const operations = [];
for (const task of desired) {
  const old = existing.get(task.id);
  if (!old) operations.push({ service: 'add_item', body: { entity_id: 'todo.husvedlikehold', item: task.summary, description: task.description } });
  else if (old.status === 'needs_action' && (old.summary !== task.summary || old.description !== task.description)) operations.push({ service: 'update_item', body: { entity_id: 'todo.husvedlikehold', item: old.uid, rename: task.summary, description: task.description } });
  // A completed item stays completed until its underlying HA state changes.
  else if (old.status === 'completed' && task.evidenceUpdatedAt && new Date(task.evidenceUpdatedAt) > new Date((prior?.tasks ?? []).find(item => item.id === task.id)?.evidenceUpdatedAt ?? task.evidenceUpdatedAt)) operations.push({ service: 'update_item', body: { entity_id: 'todo.husvedlikehold', item: old.uid, status: 'needs_action', description: task.description } });
}
for (const [id, old] of existing) {
  if (old.status !== 'needs_action' || desired.some(task => task.id === id)) continue;
  const [, deviceId, kind] = id.match(/^battery:([^:]+):(replace_battery|check_offline|verify_device)$/) ?? [];
  const current = devices.find(device => device.id === deviceId);
  if (current && ((kind === 'check_offline' && current.connectionStatus === 'online') || (kind === 'verify_device' && (current.kind === 'replace_battery' || current.status === 'healthy')))) operations.push({ service: 'update_item', body: { entity_id: 'todo.husvedlikehold', item: old.uid, status: 'completed' } });
}
if (!operations.length) operations.push({ service: 'get_items', body: { entity_id: 'todo.husvedlikehold' } });
return operations.map(operation => ({ json: { ...operation, devices, observedAt: available ? now.toISOString() : prior?.observedAt ?? null, sourceAvailable: available, desired } }));
