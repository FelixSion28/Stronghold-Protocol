import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultSource } from '../../server/sim/simdata.js';
import * as S from '../../server/sim/spec.js';
import * as tokens from '../../server/sim/content/tokens.js';
import { yanyouWaveSpecs, auditYanyouWave } from '../helpers/yanyouWaveAudit.js';

for (const spec of yanyouWaveSpecs()) {
  test(`${spec.bossId}: four 炎佑 on real ${spec.waveId} preserve own-first attacks and flame locks`, () => {
    const result = auditYanyouWave(S, tokens, getDefaultSource(), spec);
    assert.equal(result.dragonCount, 4);
    assert.ok(result.attacks > 0);
    assert.ok(result.locks > 0);
    assert.ok(result.ownChoices > 0);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.ownerChanges, []);
    assert.deepEqual(result.errors, []);
  });
}
