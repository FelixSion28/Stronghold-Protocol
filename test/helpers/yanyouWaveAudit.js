// Real boss templates with four injected real 炎佑 tokens; this is a targeting audit, not a full player match.
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves, buildBossWave } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { buildBattleSpec } from '../../server/sim/spec.js';

export function yanyouWaveSpecs() {
  const data = getData({ log: { info() {}, warn() {}, error() {} } });
  const gd = new GameData(data, 'mode_multi_abyss');
  const stages = Object.keys(data.stages).filter(id => /^act[12]autochess_m/.test(id));
  return Object.entries(data.bosses).map(([bossId, boss], i) => {
    const round = boss.hidden ? gd.hiddenRound : gd.bossRound;
    const seed = 20261014 + i;
    const setup = setupMatchWaves(gd, createRng(seed));
    const wave = buildBossWave(gd, createRng(seed + 100), setup, round, { bossId, solo: false });
    const hp = gd.bossPoolHp(bossId, 2);
    return buildBattleSpec({ battleId: `audit:${bossId}`, fieldId: 'audit', kind: boss.hidden ? 'hidden' : 'boss',
      seed, modeId: 'mode_multi_abyss', round, stageId: stages[i], timeLimit: Infinity,
      players: ['p1', 'p2'].map((playerId, n) => ({ playerId, side: n ? 'R' : 'L', colOffset: n ? 8 : 0, units: [] })),
      routes: wave.routes, spawns: wave.spawns, waveId: wave.templateId, bossId, enemyOverrides: wave.overrides,
      boss: { poolHp: hp, poolMax: hp }, flags: { layerGainsEnabled: false, ...gd.dp, enemyScale: gd.enemyScale(round) },
    });
  });
}

// Standalone so the same audit can be serialized into a real browser loading the deployed sim.
export function auditYanyouWave(S, tokens, ds, spec, ticks = 2400) {
  const b = S.createBattleFromSpec(spec, ds, { quiet: true });
  const violations = [], ownerChanges = [], ownership = new Map();
  let attacks = 0, locks = 0, ownChoices = 0, mixedChoices = 0;
  const first = [], positions = [];
  b.on('enemySpawn', ({ enemy }) => { ownership.set(enemy.id, enemy.ownerId); });
  function check(unit, selected, type) {
    const eligible = b.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
    const own = eligible.filter(e => e.ownerId === unit.ownerId);
    if (selected.some(e => !eligible.includes(e))) violations.push({ type: 'outside-candidates', time: b.time });
    const need = Math.min(type === 'attack' ? 3 : 1, own.length);
    if (own.length && selected.some((e, i) => i < need && e.ownerId !== unit.ownerId)) violations.push({ type, time: b.time, owner: unit.ownerId });
    if (selected.length < Math.min(type === 'attack' ? 3 : 1, eligible.length)) violations.push({ type: 'unfilled', time: b.time });
    if (own.length && selected.length) ownChoices++;
    if (own.length && eligible.some(e => e.ownerId !== unit.ownerId)) mixedChoices++;
  }
  b.on('attack', ({ attacker, targets }) => {
    if (attacker.defId !== tokens.TOKEN_IDS.yanyou) return;
    attacks++; check(attacker, targets, 'attack');
    if (first.length < 6) first.push({ owner: attacker.ownerId, targets: targets.map(e => e.ownerId) });
  });
  b.on('skillStart', ({ unit }) => {
    if (unit.defId !== tokens.TOKEN_IDS.yanyou) return;
    locks++; check(unit, unit.mem.flame?.target ? [unit.mem.flame.target] : [], 'flame');
  });
  b.start();
  const dragons = ['p1', 'p2'].flatMap(pid => tokens.spawnYanyou(b, pid, { count: 2, atk: 2000, hp: 30000, dmgTakenMul: 0.1 }));
  for (let i = 0; i < ticks && !b.finished; i++) {
    b.step();
    for (const e of b.enemies) if (ownership.has(e.id) && ownership.get(e.id) !== e.ownerId) ownerChanges.push(e.id);
    if (i % 30 === 0) positions.push(dragons.map(u => [u.ownerId, u.x, u.y, u.alive]));
  }
  return { bossId: spec.bossId, wave: spec.waveId, stage: spec.stageId, ticks: b.tickCount, dragonCount: dragons.length,
    attacks, locks, ownChoices, mixedChoices, first, positions, violations, ownerChanges,
    errors: b.errors, snapshot: b.snapshot(), digest: S.resultDigest(b.result()) };
}
