import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { BAND_TURN_SECONDS } from '../../server/match/Match.js';
import { attachAudit } from '../../server/match/audit.js';
import { phaseTotalSeconds } from '../../public/js/ui/gameLogic.js';
import { encodeWire, decodeWire } from '../../shared/wireCodec.js';
import { DATA, makeMatch } from './harness.js';

test('published compact v1 preserves fractional timers in room creation, room state and match state', () => {
  for (const t of ['room.create', 'room.state', 'm.public']) {
    const message = { t, timerScale: 2.5, ...(t === 'room.create' ? { mode: 'coop', difficulty: 'NORMAL', capacity: 20 } : {}) };
    const direction = t === 'room.create' ? 'c2s' : 's2c';
    assert.deepEqual(decodeWire(encodeWire(message, direction), direction), message);
  }
});

for (const timerScale of [1, 2.5, 5]) {
  test(`twenty players: independent group clocks and gauges at ${timerScale}x`, () => {
    const h = makeMatch({ humans: 20, timerScale, fake: true, instant: false });
    const m = h.m;
    const audit = attachAudit(m);
    try {
      h.start();
      for (const ps of m.order) m.handle(ps.playerId, { t: 'g.infoReady' });
      h.sched.advance(1);
      assert.equal(m.phase, PHASE.BAND_DRAFT);
      assert.equal(m.draft.groups.length, 5);
      assert.equal(m.deadline, 0);
      for (const group of m.draft.groups) {
        assert.equal(group.turnSeconds, BAND_TURN_SECONDS * timerScale);
        assert.ok(Math.abs(group.turnDeadline - h.sched.now() - group.turnSeconds * 1000) <= 1);
        assert.equal(phaseTotalSeconds(m.publicView(), DATA.config, group.playerIds[0]), group.turnSeconds);
      }
      const [first, second] = m.draft.groups;
      const peerDeadline = second.turnDeadline;
      h.sched.advance(1234);
      const pid = first.order[first.idx];
      assert.equal(m.handle(pid, { t: 'g.band', bandId: m.defaultBand(pid) }).ok, true);
      assert.equal(second.turnDeadline, peerDeadline, 'choosing in one group preserves peer clocks');
      h.toPrep(1);
      m.round = 3;
      m.enterSpDraft();
      assert.equal(m.phase, PHASE.SP_DRAFT);
      assert.equal(m.sp.groups.length, 5);
      for (const group of m.sp.groups) {
        assert.equal(group.turnSeconds, m.gd.timer('spFirst') * timerScale);
        assert.equal(phaseTotalSeconds(m.publicView(), DATA.config, group.playerIds[0]), group.turnSeconds);
      }
      assert.deepEqual(audit.violations, []);
    } finally { m.dispose(); }
  });
}
