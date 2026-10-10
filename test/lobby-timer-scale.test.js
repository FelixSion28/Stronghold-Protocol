import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';
import { validateC2S } from '../shared/protocol.js';
import { PHASE } from '../shared/constants.js';
import { DATA, makeMatch } from './match/harness.js';
import { BAND_TURN_SECONDS } from '../server/match/Match.js';
import { phaseTotalSeconds, countdownState } from '../public/js/ui/gameLogic.js';

test('room.create accepts optional 1–5 duration multipliers, including fractions, and rejects invalid values', () => {
  const msg = { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' };
  assert.equal(validateC2S(msg), null, 'older clients may omit the setting');
  for (const timerScale of [1, 1.1, 1.5, 2.5, 4.9, 5]) {
    assert.equal(validateC2S({ ...msg, timerScale }), null);
  }
  for (const timerScale of [0, 0.9, 5.1, -1, NaN, Infinity, null, '2', true, {}]) {
    assert.notEqual(validateC2S({ ...msg, timerScale }), null);
  }
});

test('a room retains its fractional timerScale for guests, reconnects and match startup; solo defaults to 1', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const clients = [];
  const player = async (name, token) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    clients.push(c);
    const welcome = await c.hello(name, token);
    c.id = welcome.playerId;
    c.token = welcome.token;
    return c;
  };
  const ok = async (c, msg) => assert.equal((await c.request(msg)).t, 'ok');
  try {
    const host = await player('倍率房主');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', timerScale: 2.5 });
    const room = await host.waitFor('room.state');
    assert.equal(room.timerScale, 2.5);
    const guest = await player('倍率队友');
    await ok(guest, { t: 'room.join', code: room.code });
    assert.equal((await guest.waitFor('room.state')).timerScale, 2.5);
    await guest.terminate();
    const back = await player('倍率队友', guest.token);
    assert.equal((await back.waitFor('room.state')).timerScale, 2.5);
    await ok(back, { t: 'room.ready', ready: true });
    await ok(host, { t: 'room.start' });
    const pub = await host.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    assert.equal(pub.timerScale, 2.5);
    assert.ok(Math.abs((pub.deadline - pub.serverNow) - 62_500) < 100);
    assert.equal(srv.lobby.rooms.get(room.code).match.gameSpeed, 2);
    const solo = await player('默认房主');
    await ok(solo, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    assert.equal((await solo.waitFor('room.state')).timerScale, 1);
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL', timerScale: 5 });
    assert.equal((await solo.waitFor('room.state', (s) => s.mode === 'solo')).timerScale, 1);
  } finally {
    await Promise.all(clients.map((c) => c.terminate()));
    await srv.close();
  }
});

test('fractional timers extend the actual deadlines and gauges without extending combat or double-scaling the draft', () => {
  const h = makeMatch({ humans: 2, timerScale: 2.5, instant: false, fake: true }).start();
  const m = h.m;
  const total = () => phaseTotalSeconds(m.publicView(), DATA.config);
  try {
    assert.equal(total(), 62.5);
    h.sched.advance(25_001);
    assert.equal(m.phase, PHASE.INFO_CHECK, 'the original deadline does not end the phase');
    h.sched.advance(37_500);
    assert.equal(m.phase, PHASE.BAND_DRAFT);
    assert.equal(total(), BAND_TURN_SECONDS * 2.5, 'turnSeconds is already scaled by the server');
    assert.equal(m.deadline - h.sched.now(), BAND_TURN_SECONDS * 2500 - 1);
    h.toPrep();
    const prep = DATA.config.modes[m.modeId].rounds['1'].prepTime * 2.5;
    assert.equal(total(), prep);
    assert.equal(m.deadline - h.sched.now(), prep * 1000);
    assert.equal(countdownState(m.deadline, h.sched.now() + prep * 500, total()).bars, 3);
    assert.equal(phaseTotalSeconds({ phase: PHASE.SP_DRAFT, timerScale: 2.5 }, DATA.config), 75);
    assert.equal(phaseTotalSeconds({ phase: PHASE.BATTLE_CHECK, timerScale: 2.5 }, DATA.config), 7.5);
    assert.equal(phaseTotalSeconds({ phase: PHASE.BAND_DRAFT, timerScale: 2.5 }, DATA.config), BAND_TURN_SECONDS * 2.5);
    m.startCombat();
    const combat = DATA.config.modes[m.modeId].rounds['1'].combatTimeLimit;
    assert.equal(total(), combat);
    assert.equal(m.deadline - h.sched.now(), combat * 1000);
    assert.equal(phaseTotalSeconds({ phase: PHASE.FINAL_ASSAULT, modeId: m.modeId, round: 14, timerScale: 5 }, DATA.config), 120);
  } finally { m.dispose(); }
});
