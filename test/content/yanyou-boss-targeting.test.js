import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { TOKEN_IDS, spawnYanyou } from '../../server/sim/content/tokens.js';
import { acquireTargets } from '../../server/sim/ai.js';
import { spawnChildren } from '../../server/sim/content/enemies/helpers.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
function fixture({ kind = 'boss', owner = 'p1', pair = true } = {}) {
  const h = makeBattle({ kind, autoFinish: false, timeLimit: 60,
    players: [{ playerId: 'p1', side: 'L', units: [] }, ...(pair ? [{ playerId: 'p2', side: 'R', colOffset: 8, units: [] }] : [])],
    defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, speed: 0 }),
      high: enemyRec({ key: 'high', hp: 1e9, speed: 0, taunt: 2 }) } },
  });
  h.step();
  const row = kind === 'boss' || kind === 'hidden' ? 3 : 10;
  const y = h.b.spawnToken(owner, TOKEN_IDS.yanyou, row, kind === 'normal' ? 8 : 10);
  assert.ok(y);
  const enemy = (pid, col, { high = false, end = 2, explicit = true } = {}) => h.spawn(high ? 'high' : 'dummy', {
    pos: [row, col], ...(explicit ? { ownerPlayerId: pid } : {}),
    route: { motion: 'WALK', start: [row, col], end: [row, end], checkpoints: [] },
  });
  return { h, y, enemy, row };
}
const targets = ({ h, y }) => acquireTargets(h.b, y, y.profile);

for (const kind of ['boss', 'hidden']) {
  for (const owner of ['p1', 'p2']) {
    test(`${kind} ${owner}: tracking and flame prefer spawn ownership even after enemies cross sides`, REAL, () => {
      const f = fixture({ kind, owner });
      const other = owner === 'p1' ? 'p2' : 'p1';
      const ownBorn = owner === 'p1' ? 5 : 15;
      const own = f.enemy(owner, ownBorn, { explicit: false });
      const foreign = f.enemy(other, 20 - ownBorn, { high: true, explicit: false });
      assert.equal(own.ownerId, owner);
      assert.equal(foreign.ownerId, other);
      // Cross the positions without changing the birth-accounting owner, as movement/portals do.
      [own.x, foreign.x] = [foreign.x, own.x];
      const x = f.y.x;
      f.h.step();
      assert.ok((f.y.x - x) * (own.x - x) > 0, 'flies toward own spawn, on the other half now');
      assert.equal(own.ownerId, owner);
      own.x = 9; foreign.x = 11;
      f.h.step(); // refresh both the enemy index and the flying range
      f.y.skill.charges = 1; f.y.atkCd = 0;
      f.h.step();
      assert.equal(f.y.mem.flame?.target, own, 'automatic flame starts on the own target');
      checkInvariants(f.h.b);
    });
  }
}

test('normal attacks rank all in-range candidates before the three-target cap and fill spare slots', REAL, () => {
  const f = fixture();
  const foreign = Array.from({ length: 3 }, () => f.enemy('p2', 11, { high: true }));
  const own = Array.from({ length: 4 }, () => f.enemy('p1', 9));
  const attacks = [];
  f.h.b.on('attack', c => { if (c.attacker === f.y) attacks.push(c.targets); });
  f.h.step();
  assert.deepEqual(attacks[0], own.slice(0, 3), 'fourth and later candidates are not lost before preference');
  for (const e of own.slice(1)) f.h.b.kill(e);
  f.y.atkCd = 0; f.h.step();
  assert.deepEqual(attacks[1], [own[0], ...foreign.slice(0, 2)]);
});

test('own spawn priority preserves taunt, remaining distance and birth order within a side', REAL, () => {
  const f = fixture();
  const far = f.enemy('p1', 9, { end: 18 });
  const near = f.enemy('p1', 9, { end: 8 });
  const nearLater = f.enemy('p1', 9, { end: 8 });
  const taunted = f.enemy('p1', 9, { high: true, end: 18 });
  f.h.step();
  assert.deepEqual(targets(f), [taunted, near, nearLater]);
  assert.ok(f.h.b.remainingDistance(far) > f.h.b.remainingDistance(near));
});

test('tracking and flame support the partner when own targets are hidden or dead', REAL, () => {
  const f = fixture();
  const own = f.enemy('p1', 5);
  f.h.b._setHidden(own, true);
  const other = f.enemy('p2', 15, { high: true });
  const x = f.y.x; f.h.step();
  assert.ok(f.y.x > x);
  f.h.b.kill(own);
  other.x = 11; f.h.step();
  f.y.skill.charges = 1; f.y.atkCd = 0; f.h.step();
  assert.equal(f.y.mem.flame?.target, other);
});

test('own targets outside range influence tracking but cannot replace in-range attacks/flame', REAL, () => {
  const f = fixture();
  const own = f.enemy('p1', 5);
  const foreign = f.enemy('p2', 11, { high: true });
  f.h.step();
  assert.deepEqual(targets(f), [foreign]);
  f.y.skill.charges = 1; f.y.atkCd = 0; f.h.step();
  assert.equal(f.y.mem.flame?.target, foreign);
  assert.equal(own.hp, own.s.maxHp);
});

test('a valid flame lock survives new own targets; next flame chooses own after the old target dies', REAL, () => {
  const f = fixture();
  const foreign = f.enemy('p2', 11, { high: true });
  f.h.step();
  f.y.skill.charges = 1; f.y.atkCd = 0; f.h.step();
  assert.equal(f.y.mem.flame?.target, foreign);
  const own = f.enemy('p1', 9);
  f.h.run(1);
  assert.equal(f.y.mem.flame?.target, foreign);
  f.h.b.kill(foreign); f.h.step();
  assert.equal(f.y.skill.active, false);
  f.y.skill.charges = 1;
  assert.ok(f.h.runUntil(() => f.y.mem.flame?.target === own, 4), 'next cast respects the existing attack/cast cadence');
});

test('split children keep the parent spawn ownership after crossing to the other half', REAL, () => {
  const f = fixture();
  const parent = f.enemy('p1', 5, { explicit: false });
  parent.x = 11;
  const [child] = spawnChildren(f.h.b, parent, 'dummy', 1);
  const foreign = f.enemy('p2', 9, { high: true });
  f.h.b.kill(parent); f.h.step();
  assert.equal(child.ownerId, 'p1');
  assert.deepEqual(targets(f), [child, foreign]);
});

test('missing target ownership has no own-side preference and other attackers keep their original sorting', REAL, () => {
  const f = fixture();
  const foreign = f.enemy('p2', 11, { high: true });
  const unknown = f.enemy('p1', 9); unknown.ownerId = null;
  const own = f.enemy('p1', 9);
  f.h.step();
  assert.deepEqual(targets(f), [own, foreign, unknown]);
  assert.deepEqual(acquireTargets(f.h.b, f.y, { ...f.y.profile, priority: null }), [foreign, unknown, own]);
  f.y.ownerId = null;
  assert.deepEqual(targets(f), [foreign, unknown, own], 'missing attacker ownership cannot match a missing enemy owner');
});

for (const options of [{ kind: 'normal' }, { kind: 'unite' }, { kind: 'boss', pair: false }, { kind: 'hidden', pair: false }]) {
  test(`${options.kind} pair=${options.pair !== false}: retain ordinary tracking, attack and flame order`, REAL, () => {
    const f = fixture(options);
    f.enemy('p1', 5);
    const foreign = f.enemy('p2', 15, { high: true });
    const x = f.y.x; f.h.step();
    assert.ok(f.y.x > x);
    foreign.x = 11; f.h.step();
    f.enemy('p1', 9); f.h.step();
    assert.equal(targets(f)[0], foreign);
    f.y.skill.charges = 1; f.y.atkCd = 0; f.h.step();
    assert.equal(f.y.mem.flame?.target, foreign);
  });
}

for (const flag of ['stealth', 'sleep', 'untargetable']) {
  test(`own ${flag} target is skipped; once selectable it regains preference`, REAL, () => {
    const f = fixture();
    const own = f.enemy('p1', 9);
    const foreign = f.enemy('p2', 11, { high: true });
    f.h.b.addBuff(own, { key: 'audit:unselectable', flags: { [flag]: true }, persist: true });
    f.h.step();
    assert.deepEqual(targets(f), [foreign]);
    f.h.b.removeBuff(own, 'audit:unselectable');
    f.h.step();
    assert.deepEqual(targets(f), [own, foreign]);
  });
}

test('real DISAPPEAR / WAIT / APPEAR route preserves birth owner and own priority on the far side', REAL, () => {
  const f = fixture();
  const own = f.h.spawn('dummy', { pos: [3, 9], route: { motion: 'WALK', start: [3, 9], end: [3, 18],
    steps: [{ t: 'disappear' }, { t: 'wait', s: 0.2 }, { t: 'appear', p: [3, 12] }, { t: 'wait', s: 999 }] } });
  const foreign = f.enemy('p2', 15, { high: true });
  f.h.step();
  assert.equal(own.hidden, true);
  assert.ok(f.h.runUntil(() => !own.hidden && own.x === 12, 1));
  assert.equal(own.ownerId, 'p1');
  foreign.x = 9; f.h.step();
  assert.equal(targets(f)[0], own);
  f.y.skill.charges = 1; f.y.atkCd = 0; f.h.step();
  assert.equal(f.y.mem.flame?.target, own);
  checkInvariants(f.h.b);
});

test('silence ends an existing flame lock rather than preserving an invalid channel', REAL, () => {
  const f = fixture();
  const own = f.enemy('p1', 9);
  f.h.step(); f.y.skill.charges = 1; f.y.atkCd = 0; f.h.step();
  assert.equal(f.y.mem.flame?.target, own);
  f.h.b.addBuff(f.y, { key: 'audit:silence', flags: { silence: true }, persist: true });
  f.h.step();
  assert.equal(f.y.skill.active, false);
  assert.equal(f.y.mem.flame, null);
});

test('two Yan summons per owner keep independent owner-prioritized attacks and locks', REAL, () => {
  const f = fixture();
  f.h.b.retreat(f.y, { permanent: true });
  const dragons = ['p1', 'p2'].flatMap(pid => spawnYanyou(f.h.b, pid, { count: 2, atk: 1000, hp: 30000 }));
  assert.equal(dragons.length, 4);
  for (const d of dragons) { d.x = 10; d.y = 3; }
  f.enemy('p1', 9); f.enemy('p2', 11, { high: true });
  f.h.step(2);
  for (const d of dragons) {
    assert.equal(acquireTargets(f.h.b, d, d.profile)[0].ownerId, d.ownerId);
    d.skill.charges = 1; d.atkCd = 0;
  }
  f.h.step();
  for (const d of dragons) assert.equal(d.mem.flame?.target?.ownerId, d.ownerId);
  checkInvariants(f.h.b);
});

test('no selectable enemies leaves the dragon idle without a spurious return movement', REAL, () => {
  const f = fixture();
  const pos = [f.y.x, f.y.y];
  f.h.run(1);
  assert.deepEqual([f.y.x, f.y.y], pos);
  assert.equal(f.y.stats.attacks, 0);
  assert.equal(f.y.skill.activations, 0);
});
