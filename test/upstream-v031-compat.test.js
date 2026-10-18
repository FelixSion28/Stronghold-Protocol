import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './match/harness.js';
import { isMatchable, planMerges } from '../server/matchmaker.js';
import { planSolos } from '../server/soloQueue.js';
import { spMarks } from '../public/js/ui/choiceOverlay.js';

for (const phase of ['BAND_DRAFT', 'SP_DRAFT']) {
  test(`${phase}: test timer controls hold and resume all five fixed groups`, (t) => {
    const h = makeMatch({ test: true, mode: 'coop', humans: 20 });
    t.after(() => h.m.dispose());
    h.start();
    for (const p of h.m.order) assert.deepEqual(h.m.handle(p.playerId, { t: 'g.infoReady' }), { ok: true });
    h.sched.runUntil(() => h.m.phase === 'BAND_DRAFT');
    if (phase === 'SP_DRAFT') {
      h.m.finishBandDraft(true);
      h.m.round = h.m.gd.spRounds()[0];
      h.m.enterSpDraft();
    }
    const stage = phase === 'BAND_DRAFT' ? h.m.draft : h.m.sp;
    assert.equal(stage.groups.length, 5);
    const timers = (on) => h.m.handle('p_0', { t: 'g.test', cmd: 'timers', args: { on } });
    assert.deepEqual(timers(false), { ok: true });
    assert.ok(stage.groups.every((g) => g.turnDeadline === 0));
    h.sched.advance(120000);
    assert.equal(Object.keys(stage.picks).length, 0);
    assert.deepEqual(h.m.handle('p_0', { t: 'g.test', cmd: 'phase', args: { name: 'advance' } }), { ok: true });
    assert.equal(Object.keys(stage.picks).length, 5, 'one held turn per group advances');
    assert.deepEqual(timers(true), { ok: true });
    assert.ok(stage.groups.every((g) => g.done || g.turnDeadline > h.sched.now()));
    assert.deepEqual(timers(false), { ok: true });
    h.sched.advance(120000);
    assert.equal(Object.keys(stage.picks).length, 5);
  });
}

test('test rooms cannot enter public matchmaking or accept solo queue fills', () => {
  const room = (code) => ({ code, test: true, mode: 'coop', difficulty: 'NORMAL', capacity: 4,
    searching: true, hostId: code, searchSince: 0, seats: [{ playerId: code, connected: true }, null, null, null] });
  const rooms = [room('A'), room('B')];
  assert.equal(isMatchable(rooms[0]), false);
  assert.deepEqual(planMerges(rooms, 20000), []);
  const entries = Array.from({ length: 3 }, (_, i) => ({ playerId: `s${i}`, difficulty: 'NORMAL', since: 0 }));
  assert.deepEqual(planSolos(rooms, entries), []);
});

test('official team pick badges include simultaneous turns in every group', () => {
  const groups = Array.from({ length: 5 }, (_, i) => ({ order: [`p${i}a`, `p${i}b`],
    pickOf: new Map([[`p${i}a`, 0]]), turnPid: `p${i}b`, done: false }));
  const marks = spMarks({ groups }, { solo: false });
  assert.equal(marks.size, 10);
  for (const g of groups) {
    assert.equal(marks.get(g.order[0]), 'done');
    assert.equal(marks.get(g.order[1]), 'turn');
  }
});

test('plugin item offers check the receiving group stock instead of group A', (t) => {
  const h = makeMatch({ humans: 8 });
  t.after(() => h.m.dispose());
  const ps = h.m.players.get('p_7');
  const item = Object.keys(DATA.items).find((id) => h.m.itemPoolFor(ps).canGain(id));
  assert.ok(item);
  h.m.itemPool.canGain = () => false;
  assert.equal(h.m._offerAvailable(ps, { effect: { item } }), true);
  h.m.itemPoolFor(ps).canGain = () => false;
  assert.equal(h.m._offerAvailable(ps, { effect: { item } }), false);
});
