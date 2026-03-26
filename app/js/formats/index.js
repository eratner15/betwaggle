// Format adapter registry — dispatches to format-specific odds engine
// Common interface: getMatchProb(playerA, playerB, holesRemaining, courseData)
// Returns: { probA: number, probB: number, draw: number }

import { getProb as matchPlay18 } from './match-play-18.js';
import { getProb as matchPlay9 } from './match-play-9.js';
import { getHoleProb as skinsProb } from './skins.js';
import { getProb as nassauProb } from './nassau.js';
import { getProb as bestBallProb } from './best-ball.js';

const adapters = {
  'round_robin_match_play': matchPlay18,
  'match_play_18': matchPlay18,
  'match_play_9': matchPlay9,
  'skins': skinsProb,
  'nassau': nassauProb,
  'best_ball': bestBallProb,
};

/**
 * Get match/hole probability for the given format.
 * @param {string} format - Event format (from config.event.format)
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @param {number} holesRemaining - Holes left to play
 * @param {object} courseData - { slopeRating, courseRating, par, holeHandicaps[] }
 * @returns {{ probA: number, probB: number, draw: number }}
 */
export function getMatchProb(format, playerA, playerB, holesRemaining, courseData) {
  const adapter = adapters[format] || adapters['round_robin_match_play'];
  return adapter(playerA, playerB, holesRemaining, courseData);
}

export { matchPlay18, matchPlay9, skinsProb, nassauProb, bestBallProb };
