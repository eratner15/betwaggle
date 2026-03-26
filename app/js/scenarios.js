/**
 * scenarios.js — What-If / Scenario Analysis engine
 *
 * Pure functions for projecting tournament standings based on
 * simulated match results. Client-side only — no server persistence.
 *
 * Used by the #scenarios view in the SPA.
 */

/**
 * Merge actual match data with user-simulated results.
 * Returns a cloned matches object where simulated results are injected as "final".
 */
export function mergeSimulatedResults(matches, simResults) {
  const merged = {};
  for (const [id, m] of Object.entries(matches)) {
    if (simResults[id]) {
      merged[id] = { ...m, ...simResults[id], status: 'final' };
    } else {
      merged[id] = { ...m };
    }
  }
  return merged;
}

/**
 * Get remaining (non-final) matches for a flight.
 */
export function getRemainingMatches(matches, flightId) {
  return Object.values(matches).filter(
    m => m.flight === flightId && m.status !== 'final'
  );
}

/**
 * Compute standings from matches for a flight (mirrors calcStandings in views.js).
 * Returns [{ teamId, points }] sorted by points desc, then h2h tiebreaker.
 */
export function computeStandings(flightId, matches, flight) {
  const points = {};
  const h2h = {};
  const teamIds = flight.teamIds ?? flight.teams ?? [];
  teamIds.forEach(id => { points[id] = 0; h2h[id] = {}; });

  Object.values(matches).forEach(m => {
    if (m.flight === flightId && m.status === 'final') {
      points[m.teamA] = (points[m.teamA] || 0) + m.scoreA;
      points[m.teamB] = (points[m.teamB] || 0) + m.scoreB;
      h2h[m.teamA] = h2h[m.teamA] || {};
      h2h[m.teamB] = h2h[m.teamB] || {};
      h2h[m.teamA][m.teamB] = m.scoreA;
      h2h[m.teamB][m.teamA] = m.scoreB;
    }
  });

  return teamIds
    .map(id => ({ teamId: id, points: points[id] || 0 }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const h2hA = h2h[a.teamId]?.[b.teamId] || 0;
      const h2hB = h2h[b.teamId]?.[a.teamId] || 0;
      return h2hB - h2hA;
    });
}

/**
 * Compute the maximum possible points a team can still earn from remaining matches.
 * Cap rule: max 7 per match.
 */
export function maxRemainingPoints(teamId, matches, flightId) {
  const remaining = Object.values(matches).filter(
    m => m.flight === flightId && m.status !== 'final' &&
      (m.teamA === teamId || m.teamB === teamId)
  );
  return remaining.length * 7; // cap max = 7 per match
}

/**
 * Compute magic number: points leader needs to guarantee they can't be caught.
 * magicNumber = max(0, challengerPoints + challengerMaxRemaining - leaderPoints + 1)
 * A magic number of 0 means clinched.
 */
export function computeMagicNumber(teamId, standings, matches, flightId) {
  const teamStanding = standings.find(s => s.teamId === teamId);
  if (!teamStanding) return Infinity;

  let magic = 0;
  for (const s of standings) {
    if (s.teamId === teamId) continue;
    const challengerMax = s.points + maxRemainingPoints(s.teamId, matches, flightId);
    const needed = challengerMax - teamStanding.points;
    if (needed >= magic) magic = needed;
  }
  // +0.5 because ties are broken by h2h — to truly clinch you need to be clear
  return Math.max(0, magic + 0.5);
}

/**
 * Classify team status based on projected standings.
 *
 * @returns 'clinched' | 'alive' | 'bubble' | 'eliminated'
 */
export function classifyTeamStatus(teamId, standings, matches, flightId) {
  const remaining = getRemainingMatches(matches, flightId);

  // If no remaining matches, just use standings position
  if (remaining.length === 0) {
    const rank = standings.findIndex(s => s.teamId === teamId);
    return rank === 0 ? 'clinched' : 'eliminated';
  }

  const teamStanding = standings.find(s => s.teamId === teamId);
  if (!teamStanding) return 'eliminated';

  const maxPossible = teamStanding.points + maxRemainingPoints(teamId, matches, flightId);

  // Can any team not catch leader?
  const leader = standings[0];
  if (teamId === leader.teamId) {
    // Check if clinched: can anyone catch us even if they max out?
    const canBeCaught = standings.slice(1).some(s => {
      const theirMax = s.points + maxRemainingPoints(s.teamId, matches, flightId);
      return theirMax >= leader.points;
    });
    return canBeCaught ? 'alive' : 'clinched';
  }

  // Can this team catch the leader even at maximum?
  if (maxPossible < leader.points) return 'eliminated';

  // Bubble: team is in 2nd-3rd and close but can still be eliminated
  const rank = standings.findIndex(s => s.teamId === teamId);
  if (rank <= 1) return 'alive';
  if (rank <= 2 && maxPossible >= leader.points * 0.9) return 'bubble';

  // Check if team can still reach top
  const teamMax = maxPossible;
  const leaderMin = leader.points; // leader could also lose remaining
  if (teamMax <= leaderMin) return 'eliminated';

  return 'bubble';
}

/**
 * Estimate win probability using weighted sampling over remaining match outcomes.
 *
 * For each unresolved match, outcomes are:
 *   7-3 (strong A win), 6-4 (close A win), 5-5 (draw), 4-6 (close B win), 3-7 (strong B win)
 *
 * Uses getMatchMoneyline probabilities as weights.
 * If N unresolved <= 6 → exact enumeration (5^6 = 15,625)
 * If N > 6 → 10,000 weighted random samples
 */
export function estimateWinProbabilities(flightId, matches, flight, getMatchMoneylineFn) {
  const remaining = getRemainingMatches(matches, flightId);
  const teamIds = flight.teamIds ?? flight.teams ?? [];

  if (remaining.length === 0) {
    // All matches played — deterministic
    const standings = computeStandings(flightId, matches, flight);
    const probs = {};
    teamIds.forEach(id => { probs[id] = 0; });
    if (standings.length > 0) probs[standings[0].teamId] = 1;
    return probs;
  }

  // Build outcome distributions for each remaining match
  const OUTCOMES = [
    { scoreA: 7, scoreB: 3 },
    { scoreA: 6, scoreB: 4 },
    { scoreA: 5, scoreB: 5 },
    { scoreA: 4, scoreB: 6 },
    { scoreA: 3, scoreB: 7 },
  ];

  // Weight each outcome by probability
  const matchOutcomes = remaining.map(m => {
    const { probA, probB } = getMatchMoneylineFn(m.teamA, m.teamB, m.id);
    const drawProb = 0.12;
    const adjA = probA * (1 - drawProb);
    const adjB = probB * (1 - drawProb);

    // Distribute probability across outcome buckets
    return {
      matchId: m.id,
      teamA: m.teamA,
      teamB: m.teamB,
      weights: [
        adjA * 0.35,       // 7-3 strong A
        adjA * 0.65,       // 6-4 close A
        drawProb,          // 5-5 draw
        adjB * 0.65,       // 4-6 close B
        adjB * 0.35,       // 3-7 strong B
      ],
      outcomes: OUTCOMES,
    };
  });

  const wins = {};
  teamIds.forEach(id => { wins[id] = 0; });

  const N = remaining.length;

  if (N <= 6) {
    // Exact enumeration
    const totalCombos = Math.pow(5, N);
    for (let combo = 0; combo < totalCombos; combo++) {
      let scenarioWeight = 1;
      const simResults = {};
      let idx = combo;

      for (let i = 0; i < N; i++) {
        const outcomeIdx = idx % 5;
        idx = Math.floor(idx / 5);
        const mo = matchOutcomes[i];
        simResults[mo.matchId] = {
          scoreA: mo.outcomes[outcomeIdx].scoreA,
          scoreB: mo.outcomes[outcomeIdx].scoreB,
        };
        scenarioWeight *= mo.weights[outcomeIdx];
      }

      if (scenarioWeight < 1e-12) continue;

      const merged = mergeSimulatedResults(matches, simResults);
      const standings = computeStandings(flightId, merged, flight);
      if (standings.length > 0) {
        wins[standings[0].teamId] += scenarioWeight;
      }
    }
  } else {
    // Monte Carlo sampling
    const SAMPLES = 10000;
    for (let s = 0; s < SAMPLES; s++) {
      const simResults = {};
      for (let i = 0; i < N; i++) {
        const mo = matchOutcomes[i];
        // Weighted random selection
        const r = Math.random();
        let cumul = 0;
        let picked = 0;
        for (let j = 0; j < 5; j++) {
          cumul += mo.weights[j];
          if (r < cumul) { picked = j; break; }
        }
        simResults[mo.matchId] = {
          scoreA: mo.outcomes[picked].scoreA,
          scoreB: mo.outcomes[picked].scoreB,
        };
      }

      const merged = mergeSimulatedResults(matches, simResults);
      const standings = computeStandings(flightId, merged, flight);
      if (standings.length > 0) {
        wins[standings[0].teamId] += 1;
      }
    }

    // Normalize
    teamIds.forEach(id => { wins[id] /= SAMPLES; });
    return wins;
  }

  // Normalize exact enumeration
  const totalWeight = Object.values(wins).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    teamIds.forEach(id => { wins[id] /= totalWeight; });
  }

  return wins;
}

/**
 * Generate scenario-based informational prop lines.
 * Returns [{description, odds, detail}]
 */
export function generateScenarioProps(flightId, projStandings, winProbs, remaining) {
  const props = [];

  // Tiebreaker prop: if top 2 teams are within 1 point
  if (projStandings.length >= 2) {
    const gap = projStandings[0].points - projStandings[1].points;
    if (gap <= 2 && remaining.length > 0) {
      // Probability is rough: closer gap = more likely tiebreaker
      const tieProb = Math.max(0.05, 0.3 - gap * 0.1);
      props.push({
        description: 'Flight decided by tiebreaker',
        odds: probToAmericanStr(tieProb),
        detail: 'Based on current standings gap',
      });
    }
  }

  // Comeback prop: 2nd place team overtakes
  if (projStandings.length >= 2 && remaining.length > 0) {
    const secondProb = winProbs[projStandings[1].teamId] || 0;
    if (secondProb > 0.05 && secondProb < 0.8) {
      props.push({
        description: `${projStandings[1].teamId} overtakes leader`,
        odds: probToAmericanStr(secondProb),
        detail: 'Monte Carlo simulation',
      });
    }
  }

  // Sweep prop: leader wins all remaining matches
  if (remaining.length >= 2 && projStandings.length > 0) {
    const leaderId = projStandings[0].teamId;
    const leaderRemaining = remaining.filter(
      m => m.teamA === leaderId || m.teamB === leaderId
    );
    if (leaderRemaining.length >= 2) {
      const sweepProb = leaderRemaining.reduce((p, m) => {
        // rough: assume 60% per match for leader
        return p * 0.6;
      }, 1);
      if (sweepProb > 0.01) {
        props.push({
          description: 'Leader sweeps remaining matches',
          odds: probToAmericanStr(sweepProb),
          detail: `${leaderRemaining.length} matches left`,
        });
      }
    }
  }

  return props;
}

function probToAmericanStr(prob) {
  prob = Math.max(0.03, Math.min(0.97, prob));
  if (prob >= 0.5) {
    return String(Math.round(-100 * prob / (1 - prob)));
  }
  return '+' + Math.round(100 * (1 - prob) / prob);
}

/**
 * Main entry: compute full scenario data for a flight.
 */
export function getFlightScenarioData(flightId, matches, simResults, flight, getMatchMoneylineFn) {
  // Merge simulated results into matches
  const merged = mergeSimulatedResults(matches, simResults);

  // Current actual standings (no simulation)
  const actualStandings = computeStandings(flightId, matches, flight);

  // Projected standings (with simulation)
  const projectedStandings = computeStandings(flightId, merged, flight);

  // Remaining matches AFTER simulation applied
  const remaining = getRemainingMatches(merged, flightId);

  // Win probabilities (based on merged state — unresolved matches only)
  const winProbs = estimateWinProbabilities(flightId, merged, flight, getMatchMoneylineFn);

  // Team status and deltas
  const teamStatus = {};
  const teamIds = flight.teamIds ?? flight.teams ?? [];
  teamIds.forEach(id => {
    const actualPts = actualStandings.find(s => s.teamId === id)?.points || 0;
    const projPts = projectedStandings.find(s => s.teamId === id)?.points || 0;
    const delta = projPts - actualPts;
    const status = classifyTeamStatus(id, projectedStandings, merged, flightId);
    const magic = computeMagicNumber(id, projectedStandings, merged, flightId);

    teamStatus[id] = {
      actualPoints: actualPts,
      projectedPoints: projPts,
      delta,
      status,
      winProb: winProbs[id] || 0,
      magicNumber: magic,
    };
  });

  // Scenario props
  const scenarioProps = generateScenarioProps(flightId, projectedStandings, winProbs, remaining);

  return {
    actualStandings,
    projectedStandings,
    remaining,
    teamStatus,
    winProbs,
    scenarioProps,
  };
}
