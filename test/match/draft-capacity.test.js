import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import { generateDraft } from '../../server/match/choices.js';
import { createRng } from '../../server/sim/rng.js';
import { coopDraftCardCount } from '../../shared/playerCapacity.js';
import { DATA, makeMatch } from './harness.js';

function forcedData(family, round, choiceOverrides = {}) {
  const modeId = 'mode_multi_normal';
  const schedule = DATA.choices.schedule[modeId];
  return new GameData({ ...DATA, choices: { ...DATA.choices, ...choiceOverrides, schedule: { ...DATA.choices.schedule,
    [modeId]: { ...schedule, rounds: { ...schedule.rounds,
      [round]: { ...schedule.rounds[round], families: [{ family, weight: 1 }] },
    } },
  } } }, modeId);
}

for (const n of [1, 4, 5, 6, 7, 8, 10, 16, 20]) {
  test(`${n} living players receive ${coopDraftCardCount(n)} choice cards in every family`, () => {
    for (const [family, round] of [['bounty', 3], ['supply', 3], ['shop', 11], ['tactic', 11]]) {
      const draft = generateDraft(forcedData(family, round), createRng(1357), round,
        { playerCount: n, stageId: 'act2autochess_m01', bondAvailable: () => true });
      assert.equal(draft.family, family);
      assert.equal(draft.cards.length, coopDraftCardCount(n), family);
      assert.deepEqual(draft.cards.map((c) => c.idx), [...Array(draft.cards.length).keys()]);
    }
  });
}

test('expanded bounty offers repeat the original six-card strength distribution', () => {
  const draft = generateDraft(forcedData('bounty', 3), createRng(17), 3, { playerCount: 20 });
  const counts = new Map();
  for (const card of draft.cards) counts.set(card.id, (counts.get(card.id) || 0) + 1);
  assert.equal(counts.size, 6);
  assert.deepEqual([...counts.values()].sort((a, b) => a - b), [3, 3, 4, 4, 4, 4]);
});

test('a restricted bounty set still fills the expanded draft by repeating its available enemy', () => {
  const full = generateDraft(forcedData('bounty', 3), createRng(17), 3, { playerCount: 8 });
  const only = DATA.choices.cards.bounty.find((c) => c.effectId === full.cards[0].id);
  assert.ok(only);
  const gd = forcedData('bounty', 3, { cards: { ...DATA.choices.cards, bounty: [only] } });
  const draft = generateDraft(gd, createRng(17), 3, { playerCount: 8 });
  assert.equal(draft.cards.length, 10);
  assert.ok(draft.cards.every((c) => c.id === only.effectId));
});

test('the 20-player draft accepts a card above the former index five', () => {
  const h = makeMatch({ humans: 20, fake: true });
  const m = h.m;
  m.round = 3;
  m.enterSpDraft();
  assert.equal(m.sp.cards.length, 22);
  const picker = m.spTurn();
  assert.deepEqual(m.handle(picker, { t: 'g.choice', idx: 21 }), { ok: true });
  assert.equal(m.sp.taken[21], picker);
  m.dispose();
});
