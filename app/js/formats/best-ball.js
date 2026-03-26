// Best-ball (four-ball) format — team probability from two independent players
// Team wins the hole if at least one player beats the opponent's best score.
// P(team wins) > P(individual wins) because two chances to win each hole.

import { interpolateProb } from './match-play-18.js';

/**
 * Get win probability for a best-ball (four-ball) match.
 * Team A = {player1, player2} vs Team B = {player3, player4}
 *
 * Model: each player's probability of beating each opponent is computed
 * independently, then combined. A team wins a hole if at least one
 * player on the team has the best score.
 *
 * Simplified model: use the better player's probability as the base,
 * with a boost from the second player reducing the chance of losing.
 *
 * @param {object} teamA - { handicapIndex: number } (combined/2 effective HI)
 * @param {object} teamB - { handicapIndex: number } (combined/2 effective HI)
 * @param {number} holesRemaining - Holes remaining (default 18)
 * @returns {{ probA: number, probB: number, draw: number }}
 */
export function getProb(teamA, teamB, holesRemaining = 18) {
  const effA = teamA.handicapIndex;
  const effB = teamB.handicapIndex;

  // Get individual match play probability
  let indivProb;
  if (effA > 15 && effB > 15) {
    const diff = effA - effB;
    const absDiff = Math.abs(diff);
    const clampedDiff = Math.min(absDiff, 15);
    if (clampedDiff < 0.1) {
      indivProb = 0.5;
    } else {
      const pFav = interpolateProb(0, clampedDiff);
      indivProb = diff < 0 ? pFav : (1 - pFav);
    }
  } else {
    indivProb = interpolateProb(
      Math.max(0, Math.min(15, effA)),
      Math.max(0, Math.min(15, effB))
    );
  }

  // Best-ball boost: with two players per side, the team's effective
  // win probability is higher than an individual's.
  // Model: P(team wins hole) = 1 - P(both players lose the hole)
  // If individual P(win) = p, two independent players: P(team) = 1 - (1-p)^2
  // But players on a team aren't fully independent (correlated by course conditions).
  // Use correlation factor of 0.5 to dampen:
  // P(team) ≈ p + (1-p) * p * (1 - correlation) = p + p*(1-p)*0.5
  const correlation = 0.5;
  const probA = indivProb + indivProb * (1 - indivProb) * (1 - correlation);
  const probB = 1 - probA;

  // Variance adjustment for holes remaining
  const varianceFactor = Math.sqrt(holesRemaining / 18);
  const adjProbA = 0.5 + (probA - 0.5) * varianceFactor;

  // Best-ball has lower draw probability (~8%) because two chances to break ties
  const DRAW_PROB = 0.08;
  const finalA = adjProbA * (1 - DRAW_PROB);
  const finalB = (1 - adjProbA) * (1 - DRAW_PROB);

  return { probA: finalA, probB: finalB, draw: DRAW_PROB };
}
