// SIM_E2E=1 CHROME_PATH=<Edge/Chrome> node --test test/sim/yanyou-owner.browser.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { flatStage, enemyRec } from '../helpers/battleHarness.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import * as specModule from '../../server/sim/spec.js';
import * as tokens from '../../server/sim/content/tokens.js';
import { yanyouWaveSpecs, auditYanyouWave } from '../helpers/yanyouWaveAudit.js';

const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.SIM_E2E === '1' && existsSync(chrome);
const raw = { stages: { flat: flatStage() }, enemies: {
  own: enemyRec({ key: 'own', hp: 1e8, speed: 0 }),
  partner: enemyRec({ key: 'partner', hp: 1e8, speed: 0, taunt: 2 }),
} };

// Serialized into the browser; production BattleSpec construction and real 炎佑 content run in both engines.
function run(S, ds, kind, owner) {
  const other = owner === 'p1' ? 'p2' : 'p1';
  const ownCol = owner === 'p1' ? 9 : 11;
  const specs = S.buildBattleSpec({ seed: 37, kind, stageId: 'flat', timeLimit: 60,
    players: ['p1', 'p2'].map((id, i) => ({ playerId: id, side: i ? 'R' : 'L',
      units: id === owner ? [{ uid: 1, kind: 'token', tokenId: 'enemy_9012_acloon', row: 3, col: 10, abs: true }] : [] })),
    spawns: [{ enemyKey: 'own', ownerPlayerId: owner, time: 0, pos: [3, ownCol], routeIndex: 0 },
      { enemyKey: 'partner', ownerPlayerId: other, time: 0, pos: [3, 20 - ownCol], routeIndex: 1 }],
    routes: [{ motion: 'WALK', start: [3, ownCol], end: [3, 2] },
      { motion: 'WALK', start: [3, 20 - ownCol], end: [3, 18] }],
  });
  const b = S.createBattleFromSpec(specs, ds, { quiet: true });
  const attacks = [], locks = [], positions = [];
  b.on('attack', c => { if (c.attacker.defId === 'enemy_9012_acloon') attacks.push(c.targets.map(e => e.ownerId)); });
  b.on('skillStart', c => { if (c.unit.defId === 'enemy_9012_acloon') locks.push(c.unit.mem.flame?.target?.ownerId); });
  for (let i = 0; i < 900; i++) {
    b.step();
    if (i % 30 === 0) positions.push(b.allyUnits.filter(u => u.defId === 'enemy_9012_acloon').map(u => [u.x, u.y]));
  }
  return { attacks, locks, positions, snapshot: b.snapshot(), digest: S.resultDigest(b.result()) };
}

test('炎佑 owner preference gives identical attacks, locks, positions and results in Node and Edge',
  { skip: !enabled && 'set SIM_E2E=1 and CHROME_PATH', timeout: 120000 }, async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    const remote = process.env.SP_SIM_TEST_URL;
    const server = remote ? null : await startServer({ host: '127.0.0.1', port: 0, quiet: true });
    let browser;
    try {
      browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${remote || `http://127.0.0.1:${server.port}`}/sim/spec.js`);
      const cases = ['boss', 'hidden'].flatMap(kind => ['p1', 'p2'].map(owner => ({ kind, owner })));
      const node = cases.map(c => run(specModule, new DataSource(raw, getDefaultSource()), c.kind, c.owner));
      const web = await page.evaluate(async (raw, cases, source) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { DataSource } = await import('/sim/simdata.js');
        const { spec, ds } = await loadBrowserSim();
        const run = new Function(`return (${source})`)();
        return cases.map(c => run(spec, new DataSource(raw, ds), c.kind, c.owner));
      }, raw, cases, run.toString());
      assert.deepEqual(errors, []);
      assert.deepEqual(web, node);
      for (const [i, c] of cases.entries()) {
        assert.ok(node[i].attacks.length > 0);
        assert.equal(node[i].attacks[0][0], c.owner);
        assert.ok(node[i].locks.length > 0);
        assert.equal(node[i].locks[0], c.owner);
      }
    } finally { await browser?.close(); await server?.close(); }
  });

test('all ten real boss waves: four 炎佑 preserve targeting invariants and Node/browser replay equality',
  { skip: !enabled && 'set SIM_E2E=1 and CHROME_PATH', timeout: 120000 }, async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    const remote = process.env.SP_SIM_TEST_URL;
    const server = remote ? null : await startServer({ host: '127.0.0.1', port: 0, quiet: true });
    let browser;
    try {
      const specs = yanyouWaveSpecs();
      const node = specs.map(spec => auditYanyouWave(specModule, tokens, getDefaultSource(), spec));
      browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${remote || `http://127.0.0.1:${server.port}`}/sim/spec.js`);
      const web = await page.evaluate(async (specs, source) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const tokens = await import('/sim/content/tokens.js');
        const { spec, ds } = await loadBrowserSim();
        const audit = new Function(`return (${source})`)();
        return specs.map(s => audit(spec, tokens, ds, s));
      }, specs, auditYanyouWave.toString());
      assert.deepEqual(errors, []);
      for (const [i, spec] of specs.entries()) {
        assert.deepEqual(web[i], node[i], `${spec.bossId}: deployed/browser and local Node match`);
        assert.deepEqual(web[i].violations, []);
        assert.deepEqual(web[i].errors, []);
        assert.equal(web[i].dragonCount, 4);
        assert.ok(web[i].attacks > 0 && web[i].locks > 0 && web[i].ownChoices > 0);
        console.log(JSON.stringify({ boss: spec.bossId, ticks: web[i].ticks, attacks: web[i].attacks,
          locks: web[i].locks, ownChoices: web[i].ownChoices, mixedChoices: web[i].mixedChoices }));
      }
    } finally { await browser?.close(); await server?.close(); }
  });
