import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { planMerges } from '../server/matchmaker.js';
import { bondCallsOf } from '../public/js/ui/bondCall.js';
import { encodeWire, decodeWire } from '../shared/wireCodec.js';

const room = (code, capacity, count, timerScale = 1) => ({ code, capacity, timerScale, mode: 'coop', difficulty: 'NORMAL',
  searching: true, searchSince: 0, hostId: `${code}0`, seats: Array.from({ length: capacity }, (_, seat) => seat < count
    ? { seat, playerId: `${code}${seat}`, ready: true, connected: true } : null) });

test('matchmaking fills chosen 4/8/20 capacities and never mixes room capacity or timerScale', () => {
  for (const capacity of [4, 8, 20]) {
    const plans = planMerges([room('A', capacity, capacity / 2), room('B', capacity, capacity / 2)], 0, { partialMergeAfterMs: 0 });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].fills, true);
    assert.equal(plans[0].target.capacity, capacity);
  }
  assert.deepEqual(planMerges([room('A', 8, 4), room('B', 4, 2)], 20000), []);
  assert.deepEqual(planMerges([room('A', 8, 4, 2.5), room('B', 8, 4, 1)], 20000), []);
});

test('P20 calls are visible only in their fixed pool group; outfits and calls survive compact v1 extensions', () => {
  const players = Array.from({ length: 20 }, (_, seat) => ({ playerId: `p${seat}`, seat, bondCall: 'x' }));
  const pub = { t: 'm.public', players, poolGroups: Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, playerIds: players.slice(i * 4, i * 4 + 4).map(p => p.playerId) })) };
  assert.deepEqual(bondCallsOf(pub, 'p19').get('x').map(p => p.playerId), ['p16', 'p17', 'p18', 'p19']);
  const messages = [pub, { t: 'room.state', seats: [{ seat: 19, playerId: 'p19', outfits: { char_4064_mlynar: 'char_4064_mlynar@epoque#28' } }] },
    { t: 'g.bondCall', bondId: 'bond_victoria' }, { t: 'room.outfits', outfits: {} }];
  for (const message of messages) assert.deepEqual(decodeWire(JSON.parse(JSON.stringify(encodeWire(message)))), message);
});

test('two eight-seat rooms merge without changing their fractional timerScale or losing outfit preferences', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, quiet: true, matchTickMs: 15 });
  const clients = [];
  try {
    for (let i = 0; i < 8; i++) {
      const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`, { wire: true }); const welcome = await c.hello(`YuriCheck${i}`); c.id = welcome.playerId; clients.push(c);
    }
    const ok = async (c, msg) => assert.equal((await c.request(msg)).t, 'ok');
    for (let start = 0; start < 8; start += 4) {
      const host = clients[start];
      await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', capacity: 8, timerScale: 2.5 });
      const state = await host.waitFor('room.state', s => s.hostId === host.id);
      for (const c of clients.slice(start + 1, start + 4)) { await ok(c, { t: 'room.join', code: state.code }); await ok(c, { t: 'room.ready', ready: true }); }
    }
    await ok(clients[7], { t: 'room.outfits', outfits: { char_4064_mlynar: 'char_4064_mlynar@epoque#28' } });
    await ok(clients[0], { t: 'room.search', on: true }); await ok(clients[4], { t: 'room.search', on: true });
    const states = await Promise.all(clients.map(c => c.waitFor('room.state', s => s.inMatch && s.seats.some(p => p?.playerId === c.id))));
    assert.equal(new Set(states.map(s => s.code)).size, 1);
    assert.equal(states[0].capacity, 8); assert.equal(states[0].timerScale, 2.5);
    assert.equal(states[0].seats.filter(Boolean).length, 8);
    assert.deepEqual(states[0].seats.find(s => s?.playerId === clients[7].id).outfits, { char_4064_mlynar: 'char_4064_mlynar@epoque#28' });
  } finally { await Promise.all(clients.map(c => c.terminate())); await srv.close(); }
});
