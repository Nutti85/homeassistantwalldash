const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function run(file, nodes, input) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  return vm.runInNewContext(`(() => { ${code} })()`, {
    $items: name => nodes[name] ?? [],
    $input: { first: () => ({ json: input }) },
    Date,
  });
}

const now = new Date().toISOString();
const state = (entity_id, value, last_updated = now) => ({ json: { entity_id, state: value, last_updated } });
const states = [
  state('binary_sensor.zigbee2mqtt_bridge_connection_state', 'on'),
  state('sensor.0x0017880104f3594d_battery', '1'),
  state('event.hovedlysbryter_soverom_jacob_action', 'unknown'),
  state('sensor.0x001788010646bf54_battery', 'unavailable', '2026-09-20T06:43:24Z'),
  state('binary_sensor.bevegelse_lys_ute', 'unavailable'),
  state('sensor.0xa4c138d9823c57d3_battery', '6', '2026-09-21T17:22:15Z'),
  ...Array.from({ length: 7 }, (_, i) => state(`sensor.test_${i}`, '50')),
];
const empty = { service_response: { 'todo.batteries': { items: [] } } };
const nodes = { 'Read HA states': states, 'Load previous snapshot': [] };
const operations = run('maintenance-assess.js', nodes, empty).map(item => item.json);
assert(operations.some(item => item.body.item === 'Bytt batteri: Hovedlysbryter Soverom Jacob'));
assert(operations.some(item => item.body.item === 'Sjekk tilkobling: Philips Bevegelse Lux Yttervegg Vei'));
assert(operations.every(item => item.body.description.includes('Batteritype: ')));
assert(operations.some(item => item.body.description.includes('Batteritype: 1 × CR2450')));
assert(operations.every(item => !item.body.description.includes('Batteritype: ukjent')));
assert(operations.some(item => item.body.description.includes('Batteritype: 2 × AA')));
assert(operations.some(item => item.body.description.includes('Batteritype: oppladbart Li-ion 3,7 V / 1300 mAh (solcelle)')));
assert(operations.every(item => !item.body.description.includes('Vedlikehold-ID:')));
assert(operations.some(item => item.body.description.includes('Sist observert: 20.09.2026 kl. 08:43.')));
assert(!operations.some(item => /Kontroll Soverom HA|Soverom HA Innside/.test(item.body.item ?? '')));

const existing = operations.map((operation, index) => ({ uid: String(index), summary: operation.body.item, description: operation.body.description, status: 'needs_action' }));
const repeated = run('maintenance-assess.js', nodes, { service_response: { 'todo.batteries': { items: existing } } });
assert.equal(repeated.length, 1);
assert.equal(repeated[0].json.service, 'get_items');
const legacy = existing.map((item, index) => ({ ...item, description: `${item.description}\nVedlikehold-ID: ${operations[index].desired[index]?.id ?? 'legacy'}` }));
const migrated = run('maintenance-assess.js', nodes, { service_response: { 'todo.batteries': { items: legacy } } });
assert(migrated.every(item => item.json.service === 'update_item'));
const completed = existing.map(item => ({ ...item, status: 'completed' }));
const afterCompletion = run('maintenance-assess.js', nodes, { service_response: { 'todo.batteries': { items: completed } } });
assert.equal(afterCompletion.length, 1);
assert.equal(afterCompletion[0].json.service, 'get_items');
const recoveredStates = states.map(item => {
  if (item.json.entity_id === 'sensor.0x0017880104f3594d_battery' || item.json.entity_id === 'sensor.0x001788010646bf54_battery') return state(item.json.entity_id, '75');
  if (item.json.entity_id === 'binary_sensor.bevegelse_lys_ute') return state(item.json.entity_id, 'off');
  return item;
});
const recovery = run('maintenance-assess.js', { ...nodes, 'Read HA states': recoveredStates }, { service_response: { 'todo.batteries': { items: existing } } }).map(item => item.json);
assert(recovery.some(item => item.service === 'update_item' && item.body.item === existing[0].uid && item.body.status === 'completed'));
assert(recovery.some(item => item.service === 'update_item' && item.body.item === existing[2].uid && item.body.status === 'completed'));
const atThreshold = recoveredStates.map(item => item.json.entity_id === 'sensor.0x0017880104f3594d_battery' ? state(item.json.entity_id, '20') : item);
const threshold = run('maintenance-assess.js', { ...nodes, 'Read HA states': atThreshold }, { service_response: { 'todo.batteries': { items: existing } } }).map(item => item.json);
assert(!threshold.some(item => item.service === 'update_item' && item.body.item === existing[0].uid && item.body.status === 'completed'));
const staleRecovery = recoveredStates.map(item => item.json.entity_id === 'sensor.0x0017880104f3594d_battery' ? state(item.json.entity_id, '75', '2026-09-20T06:43:24Z') : item);
const staleResult = run('maintenance-assess.js', { ...nodes, 'Read HA states': staleRecovery }, { service_response: { 'todo.batteries': { items: existing } } }).map(item => item.json);
assert(!staleResult.some(item => item.service === 'update_item' && item.body.item === existing[0].uid && item.body.status === 'completed'));
const synced = run('maintenance-snapshot.js', {
  'Assess maintenance': [{ json: operations[0] }],
  'Load previous snapshot': [],
  'Apply HA to-do operation': [{ json: {} }],
}, { service_response: { 'todo.batteries': { items: existing } } });
assert.equal(JSON.parse(synced[0].json.payload).tasks.length, existing.length);

const prior = { schemaVersion: 1, observedAt: now, checkedAt: now, sourceAvailable: true, devices: [{ id: 'saved' }], tasks: [{ id: 'saved' }] };
const outageNodes = { 'Read HA states': [{ json: { error: 'offline' } }], 'Load previous snapshot': [{ json: { payload: JSON.stringify(prior) } }] };
const outage = run('maintenance-assess.js', outageNodes, { error: 'offline' });
assert.equal(outage.length, 1);
assert.equal(outage[0].json.service, 'get_items');
assert.equal(outage[0].json.sourceAvailable, false);
const snapshot = run('maintenance-snapshot.js', {
  'Assess maintenance': outage,
  'Load previous snapshot': outageNodes['Load previous snapshot'],
  'Apply HA to-do operation': [{ json: { error: 'offline' } }],
}, { error: 'offline' })[0].json;
const payload = JSON.parse(snapshot.payload);
assert.equal(payload.sourceAvailable, false);
assert.equal(payload.observedAt, now);
assert.equal(payload.devices[0].id, 'saved');
assert.equal(payload.tasks[0].id, 'saved');
console.log('maintenance self-check passed');
