import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { UniteSkipVote } from '../../public/js/ui/hud.js';
import { Button } from '../../public/js/ui/components.js';

const pub = { phase: PHASE.UNITE, unite: { round: 1, roundsMax: 2,
  skipVote: { eligible: ['me', 'other'], voters: [], needed: 2, passed: false, open: true } } };
const button = (v) => [v.props.children].flat().find((n) => n?.type === Button);
const text = (v) => typeof v === 'string' || typeof v === 'number' ? String(v)
  : Array.isArray(v) ? v.map(text).join('') : v?.props ? text(v.props.children) : '';

test('eligible human sees vote button and tally; vote callback is wired', () => {
  let called = 0;
  const view = UniteSkipVote({ pub, myId: 'me', onVote: () => called++ });
  assert.equal(button(view).props.disabled, false);
  assert.match(text(view), /投票跳过第二轮.*0\/2 票.*需 2 票/);
  button(view).props.onClick();
  assert.equal(called, 1);
});

test('observer, autoplay and offline seats only see the disabled tally', () => {
  for (const myId of ['viewer', 'ai_0', 'offline', 'autoplay']) {
    const view = UniteSkipVote({ pub, myId });
    assert.equal(button(view).props.disabled, true);
    assert.match(text(view), /需 2 票/);
  }
});

test('vote UI distinguishes voted, approved and closed states', () => {
  for (const [patch, label] of [[{ voters: ['me'] }, '已投票跳过第二轮'],
    [{ voters: ['me', 'other'], passed: true }, '已通过：跳过第二轮'], [{ open: false }, '投票跳过第二轮']]) {
    const p = { ...pub, unite: { ...pub.unite, skipVote: { ...pub.unite.skipVote, ...patch } } };
    const view = UniteSkipVote({ pub: p, myId: 'me' });
    assert.equal(button(view).props.disabled, true);
    assert.match(text(view), new RegExp(label));
  }
});

test('vote UI is absent outside a two-wave first unite battle', () => {
  for (const p of [{ phase: PHASE.UNITE }, { ...pub, phase: PHASE.PREP }, { ...pub, unite: { ...pub.unite, round: 2 } },
    { ...pub, unite: { ...pub.unite, roundsMax: 1 } }, { ...pub, unite: { ...pub.unite, skipVote: null } }]) {
    assert.equal(UniteSkipVote({ pub: p, myId: 'me' }), null);
  }
});

test('empty electorate disables voting and explains why no threshold can be reached', () => {
  const p = { ...pub, unite: { ...pub.unite, skipVote: { ...pub.unite.skipVote, eligible: [], needed: 1 } } };
  const view = UniteSkipVote({ pub: p, myId: 'me' });
  assert.equal(button(view).props.disabled, true);
  assert.match(text(view), /暂无可投票玩家/);
});
