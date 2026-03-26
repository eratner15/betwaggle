// 9-hole match play odds — variance-adjusted from 18-hole table
// Fewer holes = higher variance = odds shift toward underdogs.
// Uses sqrt(holes) variance scaling from the 18-hole baseline.

import { interpolateProb } from './match-play-18.js';

/**
 * Get win probability for 9-hole match play.
 * Adjusts the 18-hole probability toward 50% to account for
 * higher variance over fewer holes (sqrt(9/18) ≈ 0.707 scaling).
 *
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @param {number} holesRemaining - Holes left (default 9)
 * @returns {{ probA: number, probB: number, draw: number }}
 */
export function getProb(playerA, playerB, holesRemaining = 9) {
  let effA = playerA.handicapIndex;
  let effB = playerB.handicapIndex;

  // Get 18-hole baseline probability
  let prob18;
  if (effA > 15 && effB > 15) {
    const diff = effA - effB;
    const absDiff = Math.abs(diff);
    const clampedDiff = Math.min(absDiff, 15);
    if (clampedDiff < 0.1) {
      prob18 = 0.5;
    } else {
      const pFav = interpolateProb(0, clampedDiff);
      prob18 = diff < 0 ? pFav : (1 - pFav);
    }
  } else {
    prob18 = interpolateProb(
      Math.max(0, Math.min(15, effA)),
      Math.max(0, Math.min(15, effB))
    );
  }

  // Variance adjustment: pull toward 50% proportional to sqrt(holes/18)
  // 9 holes: factor = sqrt(9/18) ≈ 0.707
  // This means the edge from handicap difference is ~71% as strong over 9 holes
  const varianceFactor = Math.sqrt(holesRemaining / 18);
  const probA = 0.5 + (prob18 - 0.5) * varianceFactor;

  // Higher draw probability for 9 holes (~15% vs 12% for 18)
  const DRAW_PROB = 0.15;
  const adjA = probA * (1 - DRAW_PROB);
  const adjB = (1 - probA) * (1 - DRAW_PROB);

  return { probA: adjA, probB: adjB, draw: DRAW_PROB };
}
