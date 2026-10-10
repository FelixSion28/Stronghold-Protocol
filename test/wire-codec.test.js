import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { C2S, S2C } from '../shared/protocol.js';
import { PHASE } from '../shared/constants.js';
import { WIRE_VERSION, WIRE_MESSAGES, WIRE_RECORDS, WIRE_ENUMS } from '../shared/wireSchema.js';
import { encodeWire, decodeWire, wireCatalog, WireCodecError } from '../shared/wireCodec.js';
import { makeMatch } from './match/harness.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const roundTrip = (v, direction = null) => decodeWire(clone(encodeWire(clone(v), direction)), direction);
const nameOf = (f) => typeof f === 'string' ? f : f[0];

test('wire ids cover every business message and C2S field; registries are immutable', () => {
  const messages = wireCatalog().messages;
  assert.deepEqual(messages.filter((m) => m.direction === 's2c').map((m) => m.type).sort(), [...S2C].sort());
  assert.deepEqual(messages.filter((m) => m.direction === 'c2s').map((m) => m.type).sort(), Object.keys(C2S).sort());
  assert.equal(new Set(messages.map((m) => m.id)).size, messages.length);
  for (const m of messages.filter((m) => m.direction === 'c2s')) {
    for (const key of Object.keys(C2S[m.type]).filter((key) => key !== '$optional')) {
      assert.ok(m.fields.map(nameOf).includes(key), `${m.type}.${key} needs a stable position`);
    }
  }
  assert.deepEqual(WIRE_ENUMS.phase, Object.values(PHASE));
  assert.ok(Object.isFrozen(WIRE_MESSAGES) && Object.isFrozen(WIRE_RECORDS.bond) && Object.isFrozen(WIRE_MESSAGES[8][3]));
  assert.throws(() => WIRE_RECORDS.bond.push('changed'), TypeError);
});

test('published example has stable positions; null, false, zero and absence remain distinct', () => {
  assert.deepEqual(encodeWire({ t: 'm.public', phase: 'COMBAT', round: 11 }), [1, 8, '6', 7, 11]);
  for (const bossHp of [null, { hp: 0, max: 1 }]) {
    const message = { t: 'm.public', phase: 'PREP', paused: false, players: [], fields: [], bossHp };
    assert.deepEqual(roundTrip(message), message);
  }
  const absent = { t: 'm.public', phase: 'PREP' };
  assert.ok(!Object.hasOwn(roundTrip(absent), 'bossHp'));
  assert.deepEqual(roundTrip({ t: 'g.bandFocus', rid: 0, bandId: null, groupId: 1 }),
    { t: 'g.bandFocus', rid: 0, bandId: null, groupId: 1 });
});

test('unknown types, enum spellings, raw arrays and extension fields survive without interpretation', () => {
  const unknown = { t: 'future.message', values: [1, 8, '6', 7, 11] };
  assert.deepEqual(encodeWire(unknown), unknown);
  for (const phase of ['FUTURE_PHASE', 7, false, [7, 8], { value: 'COMBAT' }]) {
    const message = { t: 'm.public', phase, players: [{ playerId: '新玩家😀', bonds: [], future: { t: 'x', v: [1, 8, '0'] } }],
      future: [[1, 8, '6', 7, 11], { t: 'nested', text: '中文' }], values: null };
    assert.deepEqual(roundTrip(message), message);
  }
  const nestedT = { t: 'm.public', bossHp: { hp: 1, max: 2, t: 'future' } };
  assert.deepEqual(roundTrip(nestedT), nestedT);
});

test('map keys and extensions cannot mutate prototypes', () => {
  const message = JSON.parse('{"t":"room.loadout","entries":{"__proto__":{"skill":1,"module":"none"},"constructor":{"skill":0}},"__proto__":{"polluted":true}}');
  const restored = roundTrip(message);
  assert.deepEqual(restored, message);
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
  assert.equal(Object.getPrototypeOf(restored.entries), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('malformed compact frames reject versions, directions, masks, missing/extra values and collisions', () => {
  for (const frame of [[], [99, 8, '0'], [1, 999, '0'], [1, 8, ''], [1, 8, '00'], [1, 8, '-1'],
    [1, 8, 'f'.repeat(32)], [1, 8, '1'], [1, 8, '0', 1], [1, 8, '2', 99],
    [1, 8, '200000000', { phase: 'PREP' }], [1, 8, '200000000', { t: 'm.private' }]]) {
    assert.throws(() => decodeWire(frame), WireCodecError, JSON.stringify(frame));
  }
  assert.throws(() => decodeWire(encodeWire({ t: 'g.refresh' }), 's2c'), /direction/);
  assert.throws(() => encodeWire({ t: 'm.public' }, 'c2s'), /direction/);
  assert.throws(() => encodeWire({ t: 'm.public', players: {} }), /list/);
  assert.throws(() => decodeWire([WIRE_VERSION, 8, '1000000', [['not-hex']]]), WireCodecError);
});

// Generate valid structural values, including optional field subsets. Fixed seed makes failures reproducible.
let state = 0x26a10010;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; }
function raw() {
  const values = [null, false, true, 0, 123.25, '', '中文😀', [], [1, null, [2, 3]], { future: 'v', t: 'raw' }];
  return clone(values[Math.floor(random() * values.length)]);
}
function valueFor(type, depth = 0) {
  if (!type) return raw();
  if (random() < 0.2) return null;
  if (Array.isArray(type)) {
    if (type[0] === 'enum') return random() < 0.8 ? WIRE_ENUMS[type[1]][Math.floor(random() * WIRE_ENUMS[type[1]].length)] : raw();
    if (type[0] === 'list') return [valueFor(type[1], depth + 1), valueFor(type[1], depth + 1)];
    return { '玩家_A': valueFor(type[1], depth + 1), '玩家_B': valueFor(type[1], depth + 1) };
  }
  return recordFor(WIRE_RECORDS[type], depth + 1);
}
function recordFor(fields, depth = 0) {
  assert.ok(depth < 12, 'schema graph must remain bounded');
  const out = {};
  for (const field of fields) if (random() < 0.65) out[nameOf(field)] = valueFor(typeof field === 'string' ? null : field[1], depth);
  if (random() < 0.2) out.futureExtension = raw();
  return out;
}

test('all schemas round-trip 2840 deterministic combinations of optional fields and nested values', () => {
  for (const [, type, direction, fields] of WIRE_MESSAGES) {
    for (let i = 0; i < 40; i++) {
      const message = { t: type, rid: i, ...recordFor(fields) };
      assert.deepEqual(roundTrip(message, direction), message, `${type} combination ${i}`);
    }
  }
});

function noPublicExtensions(message) {
  function record(v, fields, path) {
    if (v == null) return;
    const known = new Set(fields.map(nameOf));
    for (const k of Object.keys(v)) assert.ok(k === 't' || known.has(k), `${path}.${k} needs an explicit position`);
    for (const field of fields) if (typeof field !== 'string' && Object.hasOwn(v, field[0])) {
      const [key, type] = field;
      if (typeof type === 'string') record(v[key], WIRE_RECORDS[type], `${path}.${key}`);
      else if (type[0] === 'list') for (const item of v[key] || []) if (typeof type[1] === 'string') record(item, WIRE_RECORDS[type[1]], `${path}.${key}[]`);
    }
  }
  record(message, WIRE_MESSAGES.find((m) => m[1] === 'm.public')[3], 'm.public');
}

test('real match public/private views for 1–20 seats restore exactly, including parallel drafts', () => {
  for (let count = 1; count <= 20; count++) {
    const h = makeMatch({ humans: count, difficulty: 'HARD', fake: true, seed: 123 }).start();
    try {
      const check = () => {
        const view = clone(h.m.publicView());
        noPublicExtensions(view);
        assert.deepEqual(roundTrip(view, 's2c'), view);
        for (const ps of h.m.order) assert.deepEqual(roundTrip(ps.privateView(), 's2c'), clone(ps.privateView()));
      };
      check();
      for (const ps of h.m.order) h.m.handle(ps.playerId, { t: 'g.infoReady' });
      h.sched.advance(1);
      check();
      if ([1, 4, 8, 20].includes(count)) { h.toPrep(1); check(); }
      assert.equal(h.m.errorCount, 0);
    } finally { h.m.dispose(); }
  }
});

test('UTF-8 JSONL inspection CLI restores the documented original JSON', () => {
  const original = { t: 'm.public', phase: 'COMBAT', players: [{ playerId: '龙千尘', bonds: [] }] };
  const encoded = spawnSync(process.execPath, ['tools/wire.mjs', 'encode'], { input: `${JSON.stringify(original)}\n`, encoding: 'utf8' });
  assert.equal(encoded.status, 0, encoded.stderr);
  const decoded = spawnSync(process.execPath, ['tools/wire.mjs', 'decode'], { input: encoded.stdout, encoding: 'utf8' });
  assert.equal(decoded.status, 0, decoded.stderr);
  assert.deepEqual(JSON.parse(decoded.stdout), original);
  const catalog = spawnSync(process.execPath, ['tools/wire.mjs', 'schema'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(catalog.stdout), clone(wireCatalog()));
});
