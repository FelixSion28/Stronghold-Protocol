// Capacity rules shared by the server and browser. See docs/PLAYER_CAPACITY.md for the fork's rules.
import { BASE_SEATS, MAX_SEATS, MAX_DRAFT_CARDS } from './constants.js';

export const MIN_COOP_DRAFT_CARDS = 6;
export const DRAFT_SPARE_CARDS = 2;
export const GROUPED_POOL_MIN_PLAYERS = 7;
export const SECOND_UNITE_MIN_PLAYERS = 8;
export const MAX_UNITE_HELPERS = 4;

/** Count the living participants of this draft, never empty room slots or spectator seats. */
export function coopDraftCardCount(players) {
  return Math.min(MAX_DRAFT_CARDS, Math.max(MIN_COOP_DRAFT_CARDS, Math.trunc(players || 0) + DRAFT_SPARE_CARDS));
}

/** Fixed, seat-ordered groups: 5/6 share one pool; 7+ split evenly into groups of at most four. */
export function poolGroupSizes(players) {
  if (!Number.isInteger(players) || players < 1 || players > MAX_SEATS) throw new RangeError('invalid player count');
  if (players < GROUPED_POOL_MIN_PLAYERS) return [players];
  const groups = Math.ceil(players / BASE_SEATS);
  const size = Math.floor(players / groups);
  const extra = players % groups;
  return Array.from({ length: groups }, (_, i) => size + (i < extra ? 1 : 0));
}

/** A three-player group keeps the complete original pool; only a shared pool of five/six expands. */
export const poolCopyScale = (groupSize) => Math.max(1, groupSize / BASE_SEATS);
export const uniteRoundLimit = (livingPlayers) => livingPlayers >= SECOND_UNITE_MIN_PLAYERS ? 2 : 1;

/** Keep the original <=4 player unlock requirement; larger teams need proportionally more layers. */
export const coopHiddenLayerThreshold = (baseline, players) => Math.ceil(baseline * Math.max(1, players / BASE_SEATS));
