// Capacity rules shared by the server and browser. See docs/PLAYER_CAPACITY.md for the fork's rules.
import { BASE_SEATS, MAX_SEATS, MAX_DRAFT_CARDS } from './constants.js';

export const MIN_COOP_DRAFT_CARDS = 6;
export const DRAFT_SPARE_CARDS = 2;
export const GROUPED_POOL_MIN_PLAYERS = 6;
export const SECOND_UNITE_MIN_PLAYERS = 8;
export const MAX_UNITE_HELPERS = 4;

/** Count the living participants of this draft, never empty room slots or spectator seats. */
export function coopDraftCardCount(players) {
  return Math.min(MAX_DRAFT_CARDS, Math.max(MIN_COOP_DRAFT_CARDS, Math.trunc(players || 0) + DRAFT_SPARE_CARDS));
}

// User-approved seat-ordered groups. Return a copy so callers cannot alter later matches.
const POOL_GROUP_LAYOUTS = {
  6: [3, 3],
  7: [4, 3],
  8: [4, 4],
  9: [4, 5],
  10: [4, 3, 3],
  11: [4, 4, 3],
  12: [4, 4, 4],
  13: [5, 4, 4],
  14: [4, 4, 3, 3],
  15: [4, 4, 4, 3],
  16: [4, 4, 4, 4],
  17: [5, 4, 4, 4],
  18: [4, 4, 4, 3, 3],
  19: [4, 4, 4, 4, 3],
  20: [4, 4, 4, 4, 4],
};

/** One shared pool for up to five; six or more use fixed groups of three, four or five. */
export function poolGroupSizes(players) {
  if (!Number.isInteger(players) || players < 1 || players > MAX_SEATS) throw new RangeError('invalid player count');
  if (players < GROUPED_POOL_MIN_PLAYERS) return [players];
  return POOL_GROUP_LAYOUTS[players].slice();
}

/** A three-player group keeps the complete original pool; only a five-player group expands. */
export const poolCopyScale = (groupSize) => Math.max(1, groupSize / BASE_SEATS);
export const uniteRoundLimit = (livingPlayers) => livingPlayers >= SECOND_UNITE_MIN_PLAYERS ? 2 : 1;

/** Keep the original <=4 player unlock requirement; larger teams need proportionally more layers. */
export const coopHiddenLayerThreshold = (baseline, players) => Math.ceil(baseline * Math.max(1, players / BASE_SEATS));
