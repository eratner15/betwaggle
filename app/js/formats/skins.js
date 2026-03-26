// Skins format — per-hole win probability based on handicap strokes
// In a skins game, each hole is an independent competition.
// A player receives strokes on holes where their course handicap
// assigns them, based on the hole handicap ranking.

/**
 * Get per-hole win probability for a skins game.
 * Uses the stroke differential on that specific hole.
 *
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @param {number} holesRemaining - Not used for per-hole calc
 * @param {object} courseData - { holeHandicaps: number[], currentHole: number }
 * @returns {{ probA: number, probB: number, draw: number }}
 */
export function getHoleProb(playerA, playerB, holesRemaining, courseData) {
  const hcpA = playerA.handicapIndex;
  const hcpB = playerB.handicapIndex;

  // Net stroke advantage per hole
  // Higher handicap gets strokes. The stroke difference across 18 holes
  // is (hcpB - hcpA). Per hole, that's (hcpB - hcpA) / 18.
  // But strokes are allocated to specific holes via hole handicap rankings.
  const strokeDiff = (hcpB - hcpA) / 18;

  // Convert per-hole stroke advantage to win probability
  // ~8% win probability shift per stroke of advantage (empirical for skins)
  const edgePerStroke = 0.08;
  const baseProb = 0.5 + strokeDiff * edgePerStroke;
  const probA = Math.max(0.05, Math.min(0.95, baseProb));

  // Skins have high draw rate (~35% on any given hole — ties are common)
  const DRAW_PROB = 0.35;
  const adjA = probA * (1 - DRAW_PROB);
  const adjB = (1 - probA) * (1 - DRAW_PROB);

  return { probA: adjA, probB: adjB, draw: DRAW_PROB };
}

/**
 * Probability that the skin pot carries past a given hole.
 * @param {number} numPlayers - Players in the skins game
 * @param {number} holesRemaining - Holes left
 * @returns {number} Probability the pot carries (no outright winner)
 */
export function carryProbability(numPlayers, holesRemaining) {
  // With N players, probability of a tie on any hole ≈ 0.35 (2 players) to 0.55 (4 players)
  const tieProb = 0.35 + (numPlayers - 2) * 0.05;
  // Probability pot carries for H consecutive holes
  return Math.pow(Math.min(0.7, tieProb), holesRemaining);
}
