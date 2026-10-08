import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch, give } from './harness.js';
import { poolGroupSizes, poolCopyScale } from '../../shared/playerCapacity.js';
import { makeCtx } from '../../server/match/effectsMeta.js';

for (const [count, sizes] of [[1, [1]], [4, [4]], [5, [5]], [6, [6]], [7, [4, 3]], [8, [4, 4]],
  [9, [3, 3, 3]], [10, [4, 3, 3]], [16, [4, 4, 4, 4]], [20, [4, 4, 4, 4, 4]]]) {
  test(`${count} players: fixed pool groups ${sizes.join('+')}, including a complete original pool for three`, () => {
    const h = makeMatch({ humans: count, fake: true });
    const m = h.m;
    assert.deepEqual(poolGroupSizes(count), sizes);
    assert.deepEqual(m.poolGroups.map((g) => g.playerIds.length), sizes);
    assert.equal(new Set(m.poolGroups.flatMap((g) => g.playerIds)).size, count);
    for (const group of m.poolGroups) {
      assert.equal(group.scale, poolCopyScale(group.playerIds.length));
      for (const [id, entry] of group.pool.entries) {
        assert.equal(entry.cap, Math.ceil(m.gd.poolCopies(id) * group.scale));
      }
      for (const id of group.playerIds) assert.equal(m.poolFor(id), group.pool);
    }
    h.invariants();
    m.dispose();
  });
}

test('a group buying, merging, selling or being eliminated never spends or returns another group\'s copies', () => {
  const h = makeMatch({ humans: 8, fake: true });
  const m = h.m, p0 = h.ps('p_0'), p4 = h.ps('p_4');
  const id = [...p0.pool.entries.keys()].find((id) => m.gd.goldenIdOf(id) && m.gd.mergeCount(id) === 3);
  const cap = p0.pool.cap(id);
  for (let i = 0; i < 3; i++) p0.acquireChess(id, { source: 'test' });
  assert.equal(p0.pool.left(id), cap - 3);
  assert.equal(p4.pool.left(id), cap);
  assert.ok(p0.hand.some((p) => p && p.id === m.gd.goldenIdOf(id)));
  const mate = give(m, p4, id);
  assert.equal(p4.pool.left(id), cap - 1);
  p0.eliminate(1);
  assert.equal(p0.pool.left(id), cap);
  assert.equal(p4.pool.left(id), cap - 1);
  assert.equal(m.poolGroups[0].playerIds.length, 4, 'elimination never reshuffles the groups');
  p4.returnCopies(mate);
  p4.hand.fill(null);
  p4.recompute();
  h.invariants();
  m.dispose();
});

test('depleting one group leaves shop rolls and effect grants of the other group available', () => {
  const h = makeMatch({ humans: 7, fake: true });
  const p0 = h.ps('p_0'), p4 = h.ps('p_4');
  const id = [...p0.pool.entries.keys()][0];
  const held = p0.pool.take(id, 1000);
  assert.equal(p0.pool.roll(h.m.rngMeta, { filter: (x) => x === id }), null);
  assert.equal(p4.pool.roll(h.m.rngMeta, { filter: (x) => x === id }), id);
  assert.equal(p4.pool.cap(id), h.m.gd.poolCopies(id), 'three-player group has the original amount');
  p0.pool.give(id, held);
  h.invariants();
  h.m.dispose();
});

test('twenty client-combat participants finish a complete match with grouped pools and no engine errors', () => {
  const h = makeMatch({ humans: 20, fake: true, clientCombat: true, seed: 2050,
    script: (battle) => battle.kind === 'boss' || battle.kind === 'hidden' ? { bossDps: 1e9 } : {},
  }).start().autoHumans();
  const result = h.runToEnd();
  assert.equal(result.players.length, 20);
  assert.equal(result.reason, 'victory');
  assert.equal(h.m.errorCount, 0);
  assert.deepEqual(h.m.poolGroups.map((g) => g.playerIds.length), [4, 4, 4, 4, 4]);
  h.invariants();
  h.m.dispose();
});

test('twenty players: buying, merging, selling and eliminating DIY / stand-in pieces preserves the last group and each personal stock', () => {
  const slotId = 'chess_char_5_diy1_a';
  const notOwned = Object.values(DATA.chess)
    .filter((c) => c.visible && !c.isGolden && c.chessType === 'NORMAL' && c.backup)
    .map((c) => c.chessId);
  const seats = Array.from({ length: 20 }, (_, seat) => ({
    seat, playerId: `p_${seat}`, name: `P${seat}`, connected: true, isBot: false,
    diy: [0, 8, 19].includes(seat) ? { [slotId]: { charId: 'char_609_acguad' } } : null,
    notOwned: seat === 19 ? notOwned : null,
  }));
  const h = makeMatch({ seats, seed: 11, fake: true }).start();
  h.toPrep(1);
  const m = h.m;
  const ps = h.ps('p_19');
  ps.shop.level = 6;
  ps.funds = 100;
  const buy = (id) => {
    ps.shop.slots[0] = { kind: 'chess', id, basePrice: ps.gd.chessPrice(id), frozen: false, sold: false };
    assert.deepEqual(m.handle(ps.playerId, { t: 'g.buy', slot: 0 }), { ok: true });
  };
  assert.equal(ps.pool, m.poolGroups[4].pool, 'the last seat belongs to the fifth shared pool');
  for (const group of m.poolGroups) assert.equal(group.pool.has(slotId), false, 'DIY stock never joins a group pool');
  for (let i = 0; i < 3; i++) buy(slotId);
  const diyElite = ps.allChess().find((p) => p.id === ps.gd.goldenIdOf(slotId));
  assert.ok(diyElite);
  assert.equal(ps.diyStock.left(slotId), 5);
  assert.equal(h.ps('p_0').diyStock.left(slotId), 8);
  assert.equal(h.ps('p_8').diyStock.left(slotId), 8);
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.sell', uid: diyElite.uid }), { ok: true });
  assert.equal(ps.diyStock.left(slotId), 8);

  const id = [...ps.pool.entries.keys()].find((id) => ps.fieldsStandIn(id)
    && ps.pool.left(id) >= 3 && !ps.allChess().some((p) => ps.gd.baseIdOf(p.id) === id));
  assert.ok(id, 'an unowned operator with three free copies in the fifth group');
  const before = m.poolGroups.map((g) => g.pool.left(id));
  for (let i = 0; i < 3; i++) buy(id);
  const standInElite = ps.allChess().find((p) => p.id === ps.gd.goldenIdOf(id));
  assert.ok(standInElite && ps.fieldsStandIn(standInElite.id));
  assert.deepEqual(m.poolGroups.map((g) => g.pool.left(id)), before.map((n, i) => n - (i === 4 ? 3 : 0)));
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.sell', uid: standInElite.uid }), { ok: true });
  assert.deepEqual(m.poolGroups.map((g) => g.pool.left(id)), before);

  const ctx = makeCtx(m, ps, { key: 'test' }, 'onTest');
  assert.ok(ctx.grantChess(slotId));
  assert.equal(ps.diyStock.left(slotId), 7, 'effect grants take the receiver\'s private stock');
  assert.ok(ctx.grantChess(id));
  assert.equal(ps.pool.left(id), before[4] - 1, 'stand-in still spends the original operator\'s group copy');
  h.invariants();
  ps.eliminate(1);
  assert.equal(ps.diyStock.left(slotId), 8);
  assert.deepEqual(m.poolGroups.map((g) => g.pool.left(id)), before);
  h.invariants();
  assert.equal(m.errorCount, 0);
  m.dispose();
});
