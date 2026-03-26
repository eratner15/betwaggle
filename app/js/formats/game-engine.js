/**
 * game-engine.js — Client-side live game engine
 *
 * Mirrors the server-side logic in worker.js (wgg* functions).
 * Used by the SPA to display live state and animate results.
 * IMPORTANT: Keep in sync with worker.js game engine functions when modifying.
 *
 * These functions are PURE — no I/O, no side effects.
 */

/**
 * Handicap strokes on a hole using sequential allocation.
 * No course data required. Works for any 9 or 18-hole round.
 * HI=18 → 1 stroke/hole. HI=9 → strokes on holes 1-9. HI=36 → 2/hole.
 * Negative HI (scratch+) → gives strokes away.
 */
export function strokesOnHole(handicapIndex, holeNum) {
  const abs = Math.abs(handicapIndex);
  const ph = Math.max(0, Math.round(abs));
  const sign = handicapIndex < 0 ? -1 : 1;
  const perHole = Math.floor(ph / 18);
  const extra = ph % 18;
  return sign * (perHole + (holeNum <= extra ? 1 : 0));
}

/** Compute net scores for a hole: { playerName: netScore } */
export function netScores(grossScores, players, holeNum) {
  const net = {};
  for (const [name, gross] of Object.entries(grossScores)) {
    const hi = players[name]?.handicapIndex ?? 0;
    net[name] = gross - strokesOnHole(hi, holeNum);
  }
  return net;
}

/**
 * Skins: get live summary for display.
 * gameState.skins = { pot, holes: { [holeNum]: { winner, potWon, carried } } }
 */
export function skinsSummary(gameState, holesPerRound = 18) {
  const skins = gameState?.skins;
  if (!skins) return null;
  const played = Object.keys(skins.holes || {}).length;
  const won = Object.values(skins.holes || {}).filter(h => h.winner).length;
  const carried = Object.values(skins.holes || {}).filter(h => h.carried).length;
  return {
    pot: skins.pot || 1,           // current pot multiplier
    holesPlayed: played,
    skinsWon: won,
    skinsCarried: carried,
    holes: skins.holes || {},
    holesRemaining: holesPerRound - played,
  };
}

/**
 * Nassau: get live standings for display.
 * Returns { front: [{name, score}], back: [...], total: [...], frontWinner, backWinner, totalWinner }
 */
export function nassauStandings(gameState, holesPlayed = 0) {
  const nassau = gameState?.nassau;
  if (!nassau?.running) return null;
  const toArray = (key) =>
    Object.entries(nassau.running)
      .map(([name, s]) => ({ name, score: s[key] || 0 }))
      .sort((a, b) => a.score - b.score);
  return {
    front: toArray('front'),
    back: toArray('back'),
    total: toArray('total'),
    frontWinner: nassau.frontWinner || null,
    backWinner: nassau.backWinner || null,
    totalWinner: nassau.totalWinner || null,
    presses: nassau.presses || [],
  };
}

/**
 * Wolf: get results summary for display.
 * Returns { picks, results, wolfScore: {playerName: holesWon} }
 */
export function wolfSummary(gameState) {
  const wolf = gameState?.wolf;
  if (!wolf) return null;
  const score = {};
  for (const [hole, result] of Object.entries(wolf.results || {})) {
    if (result.wolfTeamWon) {
      score[result.wolf] = (score[result.wolf] || 0) + 1;
    } else {
      // Non-wolf players win
      for (const name of Object.keys(result.net || {})) {
        if (name !== result.wolf && name !== result.partner) {
          score[name] = (score[name] || 0) + 1;
        }
      }
    }
  }
  return { picks: wolf.picks || {}, results: wolf.results || {}, score };
}

/**
 * Vegas: get hole-by-hole results + running score.
 */
export function vegasSummary(gameState) {
  const vegas = gameState?.vegas;
  if (!vegas) return null;
  return {
    holes: vegas.holes || {},
    score: vegas.score || { A: 0, B: 0 },
    teamA: vegas.teamA || [],
    teamB: vegas.teamB || [],
  };
}

/**
 * Stroke play: net leaderboard.
 * Returns [{ name, netTotal }] sorted best to worst.
 */
export function strokeLeaderboard(gameState) {
  const stroke = gameState?.stroke;
  if (!stroke?.running) return [];
  return Object.entries(stroke.running)
    .map(([name, total]) => ({ name, netTotal: total }))
    .sort((a, b) => a.netTotal - b.netTotal);
}
