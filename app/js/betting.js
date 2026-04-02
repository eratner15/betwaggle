// Betting engine — odds from Gross Win Probability chart
// 18-hole gross score, Par 72, Rating 72.0 / Slope 113
// Chart: moneyline odds the ROW handicap beats the COLUMN handicap
// Tournament data injected via setConfig() at bootstrap — no static imports.

let _teams = {};
let _flights = {};
let _oddsHistory = {}; // Track previous odds: { matchKey: { mlA, mlB, probA, probB, timestamp } }

export function setConfig(config) {
  _teams = config.teams;
  _flights = config.flights;
}

// ============================================================
// GROSS WIN PROBABILITY MONEYLINE TABLE (from betting_odds.jpg)
// Full 16x16 (HCP 0–15). ML[row][col] = American moneyline
// for row-HCP beating col-HCP in 18-hole gross stroke play.
// ============================================================
const ML = [
//   0      1      2      3      4      5      6      7      8      9     10     11     12     13     14     15
  [   0,  -138,  -190,  -262,  -363,  -507,  -715, -1020, -1477, -2169, -3238, -4915, -7589,-11921,-19048,-30952], // 0
  [ 138,     0,  -137,  -188,  -258,  -356,  -495,  -694,  -985, -1415, -2064, -3058, -4602, -7043,-10961,-17343], // 1
  [ 190,   137,     0,  -137,  -186,  -255,  -350,  -483,  -674,  -951, -1359, -1968, -2892, -4319, -6553,-10107], // 2
  [ 262,   188,   137,     0,  -136,  -185,  -251,  -344,  -473,  -656,  -920, -1306, -1878, -2741, -4062, -6113], // 3
  [ 363,   258,   186,   136,     0,  -135,  -183,  -248,  -338,  -462,  -638,  -890, -1256, -1796, -2602, -3827], // 4
  [ 507,   356,   255,   185,   135,     0,  -135,  -182,  -245,  -332,  -453,  -622,  -863, -1210, -1719, -2475], // 5
  [ 715,   495,   350,   251,   183,   135,     0,  -134,  -180,  -242,  -327,  -444,  -606,  -837, -1167, -1648], // 6
  [1020,   694,   483,   344,   248,   182,   134,     0,  -134,  -179,  -240,  -322,  -435,  -592,  -812, -1127], // 7
  [1477,   985,   674,   473,   338,   245,   180,   134,     0,  -133,  -178,  -237,  -317,  -426,  -578,  -789], // 8
  [2169,  1415,   951,   656,   462,   332,   242,   179,   133,     0,  -133,  -176,  -234,  -312,  -418,  -564], // 9
  [3238,  2064,  1359,   920,   638,   453,   327,   240,   178,   133,     0,  -132,  -175,  -232,  -308,  -411], // 10
  [4915,  3058,  1968,  1306,   890,   622,   444,   322,   237,   176,   132,     0,  -132,  -174,  -229,  -304], // 11
  [7589,  4602,  2892,  1878,  1256,   863,   606,   435,   317,   234,   175,   132,     0,  -132,  -173,  -227], // 12
  [11921, 7043,  4319,  2741,  1796,  1210,   837,   592,   426,   312,   232,   174,   132,     0,  -131,  -172], // 13
  [19048,10961,  6553,  4062,  2602,  1719,  1167,   812,   578,   418,   308,   229,   173,   131,     0,  -131], // 14
  [30952,17343, 10107,  6113,  3827,  2475,  1648,  1127,   789,   564,   411,   304,   227,   172,   131,     0], // 15
];

// ---- helpers ------------------------------------------------

// American moneyline → implied probability
export function mlToProb(ml) {
  if (ml === 0) return 0.5;
  if (ml < 0) return (-ml) / (-ml + 100);
  return 100 / (ml + 100);
}

// Format American moneyline from raw number
export function fmtML(ml) {
  if (ml === 0) return "EVEN";
  return ml > 0 ? `+${ml}` : `${ml}`;
}

// Probability → American odds string
export function probToAmerican(prob) {
  prob = Math.max(0.03, Math.min(0.97, prob));
  if (prob >= 0.5) {
    return Math.round(-100 * prob / (1 - prob));
  }
  return "+" + Math.round(100 * (1 - prob) / prob);
}

// Probability → decimal odds (for payout calc) — NOT USED for payouts anymore
export function probToDecimal(prob) {
  prob = Math.max(0.03, Math.min(0.97, prob));
  return +(1 / prob).toFixed(2);
}

// American moneyline → decimal odds (correct payout multiplier)
// -127 → 1 + 100/127 = 1.79x (bet $127 to win $100, total return $227)
// +127 → 1 + 127/100 = 2.27x (bet $100 to win $127, total return $227)
// EVEN → 2.00x
export function mlToDecimal(ml) {
  if (ml === 0) return 2.00;
  if (ml < 0) return +(1 + 100 / Math.abs(ml)).toFixed(2);
  return +(1 + ml / 100).toFixed(2);
}

// ---- odds delta tracking helpers ----------------------------

// Generate consistent key for odds history tracking
function getMatchKey(teamAId, teamBId, matchId = null) {
  // Use matchId if available, otherwise create deterministic key from team IDs
  if (matchId) return matchId;
  // Ensure consistent ordering for teamA vs teamB matchups
  const [idA, idB] = [teamAId, teamBId].sort();
  return `${idA}_vs_${idB}`;
}

// Calculate delta information between current and previous odds
function calculateOddsDeltas(current, previous) {
  if (!previous) {
    return {
      deltaA: 0, deltaB: 0,
      directionA: 'unchanged', directionB: 'unchanged',
      magnitudeA: 'none', magnitudeB: 'none'
    };
  }

  const deltaA = current.mlA - previous.mlA;
  const deltaB = current.mlB - previous.mlB;

  // Direction: positive delta = worse odds (longer shot), negative = better odds (shorter)
  const directionA = deltaA > 0 ? 'worse' : deltaA < 0 ? 'better' : 'unchanged';
  const directionB = deltaB > 0 ? 'worse' : deltaB < 0 ? 'better' : 'unchanged';

  // Magnitude based on absolute change in moneyline
  const getMagnitude = (delta) => {
    const abs = Math.abs(delta);
    if (abs === 0) return 'none';
    if (abs < 20) return 'small';
    if (abs < 50) return 'medium';
    return 'large';
  };

  return {
    deltaA, deltaB,
    directionA, directionB,
    magnitudeA: getMagnitude(deltaA),
    magnitudeB: getMagnitude(deltaB)
  };
}

// Store current odds in history for future delta calculation
function storeOddsHistory(matchKey, odds) {
  _oddsHistory[matchKey] = {
    mlA: odds.mlA,
    mlB: odds.mlB,
    probA: odds.probA,
    probB: odds.probB,
    timestamp: Date.now()
  };
}

// ---- odds overrides (set by admin line management) ----------

let _oddsOverrides = {};
let _lockedMatches = [];

export function setOddsOverrides(overrides) {
  _oddsOverrides = overrides || {};
}

export function setLockedMatches(locked) {
  _lockedMatches = locked || [];
}

export function isMatchLocked(matchId) {
  return _lockedMatches.includes(matchId);
}

// ---- core odds engine ---------------------------------------

/**
 * Get moneyline odds for Team A vs Team B.
 *
 * Approach: each team's "effective handicap" = combined HI / 2
 * (average of both players — best proxy for best-ball strength).
 * Look up the chart using those two effective handicaps.
 *
 * When both effective HCPs exceed 15 (chart max), fall back to
 * the DIFFERENTIAL between them so higher-HCP flights still
 * show meaningful odds separation.
 */
// Bilinear interpolation on the probability table
// Converts fractional handicaps to a blended probability
export function interpolateProb(hcpA, hcpB) {
  // Clamp to chart range
  const a = Math.max(0, Math.min(15, hcpA));
  const b = Math.max(0, Math.min(15, hcpB));

  const aLo = Math.floor(a), aHi = Math.min(15, aLo + 1);
  const bLo = Math.floor(b), bHi = Math.min(15, bLo + 1);
  const aFrac = a - aLo;
  const bFrac = b - bLo;

  // Get probabilities at 4 corner cells
  const p00 = mlToProb(ML[aLo][bLo]);
  const p01 = mlToProb(ML[aLo][bHi]);
  const p10 = mlToProb(ML[aHi][bLo]);
  const p11 = mlToProb(ML[aHi][bHi]);

  // Bilinear blend
  const top = p00 * (1 - bFrac) + p01 * bFrac;
  const bot = p10 * (1 - bFrac) + p11 * bFrac;
  return top * (1 - aFrac) + bot * aFrac;
}

// Convert probability back to American ML integer
// Applies 5% juice per side (~10% total vig) for house margin
function probToML(p) {
  // Apply vig: multiply implied probability by 1.05 (5% juice per side)
  const juiced = Math.min(0.97, p * 1.05);
  if (Math.abs(juiced - 0.5) < 0.005) return 0;
  if (juiced >= 0.5) return Math.round(-100 * juiced / (1 - juiced));
  return Math.round(100 * (1 - juiced) / juiced);
}

export function getMatchMoneyline(teamAId, teamBId, matchId) {
  // Generate consistent key for this matchup
  const matchKey = getMatchKey(teamAId, teamBId, matchId);

  // Check for manual admin override first
  if (matchId && _oddsOverrides[matchId]) {
    const ov = _oddsOverrides[matchId];
    const mlA = ov.mlA;
    const mlB = ov.mlB;
    const probA = mlToProb(mlA);
    const probB = mlToProb(mlB);
    const currentOdds = { probA, probB, mlA, mlB };

    // Get previous odds and calculate deltas
    const previousOdds = _oddsHistory[matchKey];
    const deltas = calculateOddsDeltas(currentOdds, previousOdds);

    // Store current odds for next time
    storeOddsHistory(matchKey, currentOdds);

    return {
      probA, probB, mlA, mlB,
      previousOdds: previousOdds || null,
      ...deltas
    };
  }

  const tA = _teams[teamAId];
  const tB = _teams[teamBId];

  // Effective handicap = combined / 2 (fractional, not rounded)
  let effA = tA.combined / 2;
  let effB = tB.combined / 2;

  let probA;

  if (effA > 15 && effB > 15) {
    // Both beyond chart — use differential with interpolation
    // Map the differential into the chart as if row=0 vs col=diff
    const diff = effA - effB; // negative = A is better
    const absDiff = Math.abs(diff);
    const clampedDiff = Math.min(absDiff, 15);

    if (clampedDiff < 0.1) {
      probA = 0.5;
    } else {
      // Interpolate along row 0: prob of 0-handicap beating clampedDiff-handicap
      const pFav = interpolateProb(0, clampedDiff);
      probA = diff < 0 ? pFav : (1 - pFav); // if A is lower, A is the favorite
    }
  } else {
    // Normal interpolation within chart range
    probA = interpolateProb(
      Math.max(0, Math.min(15, effA)),
      Math.max(0, Math.min(15, effB))
    );
  }

  const probB = 1 - probA;
  const mlA = probToML(probA);
  const mlB = probToML(probB);
  const currentOdds = { probA, probB, mlA, mlB };

  // Get previous odds and calculate deltas
  const previousOdds = _oddsHistory[matchKey];
  const deltas = calculateOddsDeltas(currentOdds, previousOdds);

  // Store current odds for next time
  storeOddsHistory(matchKey, currentOdds);

  return {
    probA, probB, mlA, mlB,
    previousOdds: previousOdds || null,
    ...deltas
  };
}

// ---- live odds (mid-round adjustment) -----------------------

/**
 * Get LIVE moneyline odds that factor in current match state.
 * Uses holes remaining + score differential to shift pre-match odds.
 *
 * Model: The pre-match edge (from handicap) decays proportional to
 * sqrt(holesRemaining/totalHoles). The current score differential
 * creates additional edge based on empirical match play close-out
 * probabilities.
 *
 * @param {string} teamAId
 * @param {string} teamBId
 * @param {string} matchId
 * @param {object} liveState - { holesPlayed, totalHoles, scoreA, scoreB }
 *   scoreA/scoreB = cumulative match play points (or stroke differential)
 * @returns {{ probA, probB, mlA, mlB, isLive }}
 */
export function getLiveMatchMoneyline(teamAId, teamBId, matchId, liveState) {
  // Generate consistent key for this matchup (include 'live' prefix for separate tracking)
  const matchKey = `live_${getMatchKey(teamAId, teamBId, matchId)}`;

  if (!liveState || !liveState.holesPlayed || liveState.holesPlayed === 0) {
    const baseOdds = getMatchMoneyline(teamAId, teamBId, matchId);
    return { ...baseOdds, isLive: false };
  }

  // Check for manual override — always takes precedence
  if (matchId && _oddsOverrides[matchId]) {
    const ov = _oddsOverrides[matchId];
    const mlA = ov.mlA;
    const mlB = ov.mlB;
    const probA = mlToProb(mlA);
    const probB = mlToProb(mlB);
    const currentOdds = { probA, probB, mlA, mlB };

    // Get previous live odds and calculate deltas
    const previousOdds = _oddsHistory[matchKey];
    const deltas = calculateOddsDeltas(currentOdds, previousOdds);

    // Store current odds for next time
    storeOddsHistory(matchKey, currentOdds);

    return {
      probA, probB, mlA, mlB, isLive: true,
      previousOdds: previousOdds || null,
      ...deltas
    };
  }

  const { holesPlayed, totalHoles = 18, scoreA = 0, scoreB = 0 } = liveState;
  const holesRemaining = Math.max(1, totalHoles - holesPlayed);
  const scoreDiff = scoreA - scoreB; // positive = A leading

  // Start with pre-match handicap probability
  const preMatch = getMatchMoneyline(teamAId, teamBId, matchId);
  let baseProb = preMatch.probA;

  // 1. Decay handicap edge by sqrt(remaining/total)
  //    As match progresses, pre-match handicap matters less
  const decayFactor = Math.sqrt(holesRemaining / totalHoles);
  let liveProb = 0.5 + (baseProb - 0.5) * decayFactor;

  // 2. Apply score differential shift
  //    Empirical match play: each hole lead ≈ 8-12% swing in close-out prob
  //    Scale by holes remaining (a 2-up lead with 3 to play is huge vs 2-up with 12 to play)
  if (scoreDiff !== 0) {
    const leadStrength = scoreDiff / holesRemaining; // normalized lead
    // Logistic curve: converts lead strength to probability shift
    // leadStrength of 1.0 (1-up with 1 to play) → ~75% close-out
    // leadStrength of 0.5 (1-up with 2 to play) → ~65% close-out
    // leadStrength of 0.33 (2-up with 6 to play) → ~60% close-out
    const scoreShift = 1 / (1 + Math.exp(-2.5 * leadStrength)) - 0.5;
    liveProb = liveProb + scoreShift * (1 - Math.abs(liveProb - 0.5) * 0.5);
  }

  // Clamp to reasonable range
  liveProb = Math.max(0.03, Math.min(0.97, liveProb));

  const probA = liveProb;
  const probB = 1 - liveProb;
  const mlA = probToML(probA);
  const mlB = probToML(probB);
  const currentOdds = { probA, probB, mlA, mlB };

  // Get previous live odds and calculate deltas
  const previousOdds = _oddsHistory[matchKey];
  const deltas = calculateOddsDeltas(currentOdds, previousOdds);

  // Store current odds for next time
  storeOddsHistory(matchKey, currentOdds);

  return {
    probA, probB, mlA, mlB, isLive: true,
    previousOdds: previousOdds || null,
    ...deltas
  };
}

// ---- match-level odds (with draw) ---------------------------

// Draw probability for 9-hole best-ball match play (~12%)
const DRAW_PROB = 0.12;

export function matchOdds(match) {
  if (match.status === "final") return null;

  const { probA, probB, mlA, mlB } = getMatchMoneyline(match.teamA, match.teamB, match.id);

  // Allocate draw probability, proportionally reduce win probs
  const adjA = probA * (1 - DRAW_PROB);
  const adjB = probB * (1 - DRAW_PROB);

  return {
    teamA: adjA,
    teamB: adjB,
    draw: DRAW_PROB,
    rawMlA: mlA,
    rawMlB: mlB
  };
}

// ---- flight winner futures -----------------------------------

export function flightWinnerOdds(flightId, matches) {
  const flight = _flights[flightId];
  const teamIds = [...flight.teamIds];

  // Expected win rate for each team vs. all flight opponents
  const winRates = {};
  teamIds.forEach(id => {
    let totalProb = 0;
    teamIds.forEach(oppId => {
      if (oppId === id) return;
      const { probA } = getMatchMoneyline(id, oppId);
      totalProb += probA;
    });
    winRates[id] = totalProb / 5; // 5 opponents
  });

  // Blend with actual results as tournament progresses
  const finalMatches = Object.values(matches).filter(m => m.flight === flightId && m.status === "final");
  const totalFlight = Object.values(matches).filter(m => m.flight === flightId).length;
  const progress = finalMatches.length / totalFlight;

  if (progress > 0) {
    const points = {};
    teamIds.forEach(id => points[id] = 0);
    finalMatches.forEach(m => {
      points[m.teamA] = (points[m.teamA] || 0) + m.scoreA;
      points[m.teamB] = (points[m.teamB] || 0) + m.scoreB;
    });
    const maxPts = finalMatches.length * 7;
    teamIds.forEach(id => {
      const perf = maxPts > 0 ? points[id] / maxPts : 0.5;
      winRates[id] = winRates[id] * (1 - progress * 0.7) + perf * (progress * 0.7);
    });
  }

  // Power transform + normalize → flight winner probability
  const powered = {};
  let total = 0;
  teamIds.forEach(id => {
    powered[id] = Math.pow(Math.max(winRates[id], 0.01), 3);
    total += powered[id];
  });

  const result = {};
  teamIds.forEach(id => { result[id] = powered[id] / total; });
  return result;
}

// ---- margin of victory (props) --------------------------------

export function marginOdds(match) {
  const mOdds = matchOdds(match);
  if (!mOdds) return null;

  const nameA = _teams[match.teamA].member.split(" ").pop();
  const nameB = _teams[match.teamB].member.split(" ").pop();

  // Split each side's win prob: 30 % blowout (7-3), 70 % close (6-4)
  return {
    "7-3": { prob: mOdds.teamA * 0.30, label: `${nameA} 7-3` },
    "6-4": { prob: mOdds.teamA * 0.70, label: `${nameA} 6-4` },
    "5-5": { prob: mOdds.draw,          label: "Halved 5-5" },
    "4-6": { prob: mOdds.teamB * 0.70, label: `${nameB} 6-4` },
    "3-7": { prob: mOdds.teamB * 0.30, label: `${nameB} 7-3` }
  };
}

// ---- bet placement & settlement ------------------------------

export function placeBet(state, bet) {
  if (bet.stake <= 0) return false;
  const placed = {
    ...bet,
    id: "bet_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    status: "active",
    payout: 0
  };
  // No virtual balance — real money tracked by the book
  state.bets.push(placed);
  return placed;
}

export function settleBets(state) {
  state.bets.forEach(bet => {
    if (bet.status !== "active") return;

    if (bet.type === "match_winner") {
      const match = state.matches[bet.matchId];
      if (!match || match.status !== "final") return;
      let winner = null;
      if (match.scoreA > match.scoreB) winner = match.teamA;
      else if (match.scoreB > match.scoreA) winner = match.teamB;

      if (bet.selection === "draw") {
        if (winner === null) {
          bet.status = "won";
          bet.payout = Math.round(bet.stake * bet.odds);
          // payout tracked on bet object
        } else { bet.status = "lost"; }
      } else if (winner === null) {
        bet.status = "push";
        bet.payout = bet.stake;
        // push — stake returned
      } else if (bet.selection == winner) {
        bet.status = "won";
        bet.payout = Math.round(bet.stake * bet.odds);
        // payout tracked on bet object
      } else { bet.status = "lost"; }
    }

    if (bet.type === "match_margin") {
      const match = state.matches[bet.matchId];
      if (!match || match.status !== "final") return;
      const outcome = `${match.scoreA}-${match.scoreB}`;
      if (bet.selection === outcome) {
        bet.status = "won";
        bet.payout = Math.round(bet.stake * bet.odds);
        // payout tracked on bet object
      } else { bet.status = "lost"; }
    }

    if (bet.type === "flight_winner") {
      const fm = Object.values(state.matches).filter(m => m.flight === bet.flightId);
      if (!fm.every(m => m.status === "final")) return;
      const standings = calcStandingsForBetting(bet.flightId, state.matches);
      if (standings[0].teamId == bet.selection) {
        bet.status = "won";
        bet.payout = Math.round(bet.stake * bet.odds);
        // payout tracked on bet object
      } else { bet.status = "lost"; }
    }
  });
}

function calcStandingsForBetting(flightId, matches) {
  const flight = _flights[flightId];
  const pts = {};
  const h2h = {};
  flight.teamIds.forEach(id => { pts[id] = 0; h2h[id] = {}; });
  Object.values(matches).forEach(m => {
    if (m.flight === flightId && m.status === "final") {
      pts[m.teamA] = (pts[m.teamA] || 0) + m.scoreA;
      pts[m.teamB] = (pts[m.teamB] || 0) + m.scoreB;
      h2h[m.teamA][m.teamB] = m.scoreA;
      h2h[m.teamB][m.teamA] = m.scoreB;
    }
  });
  return flight.teamIds
    .map(id => ({ teamId: id, points: pts[id] }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const h2hA = h2h[a.teamId][b.teamId] || 0;
      const h2hB = h2h[b.teamId][a.teamId] || 0;
      return h2hB - h2hA;
    });
}
