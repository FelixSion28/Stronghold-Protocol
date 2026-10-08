// Permanent shared-pool identity, separate from the current boss-field pairing.

import { sortedPlayers } from './shared.js';

export const POOL_GROUP_COLORS = ['#83b8ee', '#b69ddd', '#d8b96d', '#81cbce', '#dda4c2'];

/**
 * Contiguous sections in occupied-seat order. Only m.public.poolGroups supplies membership;
 * missing metadata and a single pool keep the undecorated player list.
 */
export function poolGroupSections(pub) {
  const groups = new Map();
  for (const g of Array.isArray(pub?.poolGroups) ? pub.poolGroups : []) {
    if (!Number.isInteger(g?.id) || g.id < 1 || g.id > POOL_GROUP_COLORS.length
      || !Array.isArray(g.playerIds) || !g.playerIds.length || groups.has(g.id)) continue;
    groups.set(g.id, {
      id: g.id,
      label: String.fromCharCode(64 + g.id),
      color: POOL_GROUP_COLORS[g.id - 1],
      playerIds: g.playerIds.slice(),
    });
  }
  const byPlayer = new Map();
  if (groups.size > 1) {
    for (const group of groups.values()) {
      for (const id of group.playerIds) if (!byPlayer.has(id)) byPlayer.set(id, group);
    }
  }
  const sections = [];
  for (const player of sortedPlayers(pub)) {
    const group = byPlayer.get(player.playerId) || null;
    const previous = sections[sections.length - 1];
    if (previous && previous.group === group) previous.players.push(player);
    else sections.push({ group, players: [player] });
  }
  return sections;
}
