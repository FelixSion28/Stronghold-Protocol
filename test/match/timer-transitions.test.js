import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { attachAudit } from '../../server/match/audit.js';
import { makeMatch } from './harness.js';

for (const timerScale of [1, 2.5, 5]) {
  for (const clientCombat of [false, true]) {
    for (const leaks of [0, 3]) {
      test(`fixed transitions: scale ${timerScale}, ${clientCombat ? 'client' : 'server'} combat, ${leaks ? 'with' : 'without'} 联防`, () => {
        const h = makeMatch({ humans: 2, timerScale, clientCombat, instant: false, fake: true,
          script: (b) => ({ duration: 2, ...(b.kind === 'normal' ? { leaks: { p_0: leaks } } : {}) }) }).start();
        const m = h.m;
        const audit = attachAudit(m);
        try {
          h.drive(() => m.phase === PHASE.ROUND_START && m.round === 1);
          assert.equal(m.deadline - h.sched.now(), 2000, 'round start always lasts two seconds');
          h.sched.advance(1999);
          assert.equal(m.phase, PHASE.ROUND_START);
          h.sched.advance(1);
          assert.equal(m.phase, PHASE.PREP);
          assert.equal(m.deadline - h.sched.now(), m.gd.prepTime(1) * timerScale * 1000);
          for (const ps of m.alivePlayers()) m.handle(ps.playerId, { t: 'g.ready', ready: true });
          h.runToPhase(PHASE.COMBAT, 1);
          assert.ok(h.run(() => m.fields.length > 0 && m.fields.every((f) => !f.live)));
          assert.equal(m.phase, PHASE.COMBAT);
          h.sched.advance(1499);
          assert.equal(m.phase, PHASE.COMBAT, 'combat end has not finished early');
          h.sched.advance(1);
          assert.equal(m.phase, leaks ? PHASE.UNITE : PHASE.SETTLE, 'combat end always lasts 1.5 seconds');
          if (leaks) {
            assert.ok(h.run(() => m.fields.length > 0 && m.fields.every((f) => !f.live)));
            assert.equal(m.phase, PHASE.UNITE);
            h.sched.advance(1499);
            assert.equal(m.phase, PHASE.UNITE);
            h.sched.advance(1);
            assert.equal(m.phase, PHASE.SETTLE, '联防 end also stays at 1.5 seconds');
          }
          assert.equal(m.deadline - h.sched.now(), 3000, 'settlement always lasts three seconds');
          h.sched.advance(2999);
          assert.equal(m.phase, PHASE.SETTLE, 'settlement has not finished early');
          assert.equal(m.round, 1);
          h.sched.advance(1);
          assert.equal(m.phase, PHASE.ROUND_START);
          assert.equal(m.round, 2, 'the next round starts after exactly three seconds');
          assert.deepEqual(audit.violations, []);
        } finally { m.dispose(); }
      });
    }
    for (const hidden of [false, true]) {
      test(`fixed boss settlement: scale ${timerScale}, ${clientCombat ? 'client' : 'server'} combat, ${hidden ? 'with' : 'without'} hidden core`, () => {
        const h = makeMatch({ humans: 2, difficulty: 'NORMAL', timerScale, clientCombat, instant: false, fake: true,
          script: (b) => ['boss', 'hidden'].includes(b.kind) ? { bossDps: 1e9 } : {} }).start();
        const m = h.m;
        try {
          h.toPrep(1);
          m.startRound(m.gd.bossRound);
          assert.ok(h.drive(() => m.phase === PHASE.FINAL_ASSAULT));
          m.hiddenLayerSum = hidden ? 1201 : 0;
          assert.ok(h.run(() => m.fields.length > 0 && m.fields.every((f) => !f.live)));
          h.sched.advance(2999);
          assert.equal(m.phase, PHASE.FINAL_ASSAULT, 'boss settlement has not finished early');
          assert.equal(m.ended, false);
          h.sched.advance(1);
          assert.equal(m.phase, hidden ? PHASE.ROUND_START : PHASE.RESULT, 'boss settlement lasts exactly three seconds');
          if (hidden) {
            assert.equal(m.round, m.gd.hiddenRound);
            assert.ok(h.drive(() => m.phase === PHASE.HIDDEN_CORE));
            assert.ok(h.run(() => m.fields.length > 0 && m.fields.every((f) => !f.live)));
            h.sched.advance(2999);
            assert.equal(m.phase, PHASE.HIDDEN_CORE, 'hidden-core settlement has not finished early');
            assert.equal(m.ended, false);
            h.sched.advance(1);
            assert.equal(m.phase, PHASE.RESULT, 'hidden-core settlement also lasts exactly three seconds');
            assert.equal(h.ended.hiddenCleared, true);
          }
        } finally { m.dispose(); }
      });
    }
  }
}
