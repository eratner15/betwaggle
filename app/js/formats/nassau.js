// Nassau format — three independent H2H bets (front 9, back 9, overall 18)
// Each segment is scored as match play. Presses are optional side bets.

import { getProb as matchPlay9 } from './match-play-9.js';
import { getProb as matchPlay18 } from './match-play-18.js';

/**
 * Get win probability for a Nassau bet.
 * Returns probabilities for front 9, back 9, and overall 18.
 *
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @param {number} holesRemaining - Total holes remaining (used for overall)
 * @returns {{ probA: number, probB: number, draw: number }}
 */
export function getProb(playerA, playerB, holesRemaining = 18) {
  // Nassau overall = 18-hole match play
  if (holesRemaining > 9) {
    return matchPlay18(playerA, playerB);
  }
  // If 9 or fewer holes remain, use 9-hole variance
  return matchPlay9(playerA, playerB, holesRemaining);
}

/**
 * Get full Nassau breakdown: front, back, overall probabilities.
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @returns {{ front: {probA, probB, draw}, back: {probA, probB, draw}, overall: {probA, probB, draw} }}
 */
export function getNassauBreakdown(playerA, playerB) {
  return {
    front: matchPlay9(playerA, playerB, 9),
    back: matchPlay9(playerA, playerB, 9),
    overall: matchPlay18(playerA, playerB),
  };
}

/**
 * Press EV calculation — should the trailing player press?
 * A press creates a new side bet starting from the current hole.
 *
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @param {number} holesRemaining - Holes left in the segment
 * @param {number} stakePerBet - Dollar value of each Nassau bet
 * @returns {{ ev: number, shouldPress: boolean, breakEvenHoles: number }}
 */
export function pressEV(playerA, playerB, holesRemaining, stakePerBet) {
  const { probA, probB } = matchPlay9(playerA, playerB, holesRemaining);

  // EV of pressing = (prob of winning press * stake) - (prob of losing press * stake)
  // From player A's perspective:
  const ev = (probA * stakePerBet) - (probB * stakePerBet);

  // Breakeven: how many holes remaining for the press to be +EV
  // Approximation: press is +EV when holesRemaining >= 3 and you have a handicap edge
  const breakEvenHoles = Math.ceil(3 / Math.max(0.1, Math.abs(probA - probB)));

  return {
    ev: Math.round(ev),
    shouldPress: ev > 0 && holesRemaining >= 3,
    breakEvenHoles: Math.min(breakEvenHoles, 9),
  };
}
