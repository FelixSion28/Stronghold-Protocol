import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give } from './harness.js';
import { poolGroupSizes, poolCopyScale } from '../../shared/playerCapacity.js';

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
