// Betting engine — odds from Gross Win Probability chart
// 18-hole gross score, Par 72, Rating 72.0 / Slope 113
// Chart: moneyline odds the ROW handicap beats the COLUMN handicap
// Tournament data injected via setConfig() at bootstrap — no static imports.

let _teams = {};
let _flights = {};
let _oddsHistory = {}; // Track previous odds: { matchKey: { mlA, mlB, probA, probB, timestamp } }

// ---- demo simulation state ---------------------------------
let _demoMode = false;
let _simulationTimer = null;
let _simulationSpeed = 1; // 1x = real time, 2x = 2x speed, etc.
let _virtualPlayers = [];
let _simulationSeedKey = "waggle-default-demo-seed";
let _simulationRngState = 1;
let _simulationState = {
  holesSimulated: {},  // Track simulated holes per match
  lastOddsUpdate: {},  // Last odds movement timestamp per match
  marketProbabilities: {}, // Persist simulated market probabilities per matchup
  betActivity: []      // Recent virtual bet activity
};

function hashSeed(seed) {
  let hash = 2166136261;
  const value = String(seed || "waggle-default-demo-seed");
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function setSimulationSeed(seed) {
  _simulationSeedKey = String(seed || "waggle-default-demo-seed");
  _simulationRngState = hashSeed(_simulationSeedKey);
}

function simulationRandom() {
  _simulationRngState = (_simulationRngState + 0x6D2B79F5) >>> 0;
  let t = _simulationRngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function simulationToken(len = 6) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < len; i++) {
    token += alphabet[Math.floor(simulationRandom() * alphabet.length)];
  }
  return token;
}

export function setConfig(config) {
  _teams = config.teams;
  _flights = config.flights;
  const seedFromConfig =
    config?.demoSeed ||
    config?.event?.id ||
    config?.event?.slug ||
    config?.slug ||
    config?.eventId ||
    "waggle-default-demo-seed";
  setSimulationSeed(seedFromConfig);

  // Demo configuration
  if (config.demoMode !== undefined) {
    setDemoMode(config.demoMode, config.simulationSpeed || 1);
  }
  if (config.virtualPlayers) {
    _virtualPlayers = config.virtualPlayers;
  }
}

// ---- demo mode management -----------------------------------

export function setDemoMode(enabled, speed = 1) {
  if (_demoMode === enabled) return;

  _demoMode = enabled;
  _simulationSpeed = Math.max(0.1, Math.min(10, speed)); // Clamp between 0.1x and 10x

  if (_demoMode) {
    console.log(`[Betting] Demo mode ENABLED (${_simulationSpeed}x speed)`);
    startSimulation();
  } else {
    console.log('[Betting] Demo mode DISABLED');
    stopSimulation();
  }
}

export function isDemoMode() {
  return _demoMode;
}

export function getSimulationSpeed() {
  return _simulationSpeed;
}

// Clear simulation state for fresh demo starts
export function resetSimulation() {
  _simulationState = {
    holesSimulated: {},
    lastOddsUpdate: {},
    marketProbabilities: {},
    betActivity: []
  };
  _oddsHistory = {};
  setSimulationSeed(_simulationSeedKey);
}

// Start the simulation timer loop
export function startSimulation(options = {}) {
  if (typeof options.speed === "number" && Number.isFinite(options.speed)) {
    _simulationSpeed = Math.max(0.1, Math.min(10, options.speed));
  }
  if (options.seed !== undefined) {
    setSimulationSeed(options.seed);
  }
  _demoMode = true;
  if (_simulationTimer) return true;

  const interval = Math.max(50, Math.round(2000 / _simulationSpeed)); // Min 50ms, scales with speed
  _simulationTimer = setInterval(() => {
    try {
      runSimulationCycle();
    } catch (err) {
      console.error('[Betting] Simulation error:', err);
    }
  }, interval);
  return true;
}

// Stop the simulation timer
export function stopSimulation() {
  _demoMode = false;
  if (_simulationTimer) {
    clearInterval(_simulationTimer);
    _simulationTimer = null;
  }
  return true;
}

export function getSimulationSnapshot() {
  return {
    demoMode: _demoMode,
    speed: _simulationSpeed,
    seed: _simulationSeedKey,
    state: JSON.parse(JSON.stringify(_simulationState)),
    activeTimer: !!_simulationTimer
  };
}

// Main simulation cycle - runs every 2 seconds (scaled by speed)
function runSimulationCycle() {
  if (!_demoMode) return;

  const now = Date.now();

  // 1. Simulate natural odds movement for all active matches
  simulateOddsFluctuations(now);

  // 2. Generate virtual bet activity
  simulateVirtualBetting(now);

  // 3. Advance match states progressively
  simulateMatchProgression(now);
}

// ---- virtual player generators ------------------------------

// Generate realistic virtual players with diverse betting patterns
export function generateVirtualPlayers(count = 12) {
  const namePool = [
    'BigDog47', 'ProGolfer3', 'ChipMaster', 'BirdieKing', 'EagleEye88', 'FairwayFinder',
    'GolfPro21', 'SandTrap', 'GreenReader', 'LongDrive', 'ShortGame', 'ClutchPutter',
    'TourPro', 'WeekendWarrior', 'ClubChamp', 'ScratchGolfer', 'Bogey4Life', 'ParSeeker'
  ];

  const personalities = [
    { risk: 'conservative', avgBet: 25, frequency: 0.3, favorites: true, name: 'Conservative' },
    { risk: 'moderate', avgBet: 50, frequency: 0.6, favorites: false, name: 'Moderate' },
    { risk: 'aggressive', avgBet: 100, frequency: 0.9, favorites: false, name: 'Aggressive' },
    { risk: 'whale', avgBet: 500, frequency: 0.4, favorites: false, name: 'High Roller' }
  ];

  const players = [];
  for (let i = 0; i < count; i++) {
    const personality = personalities[i % personalities.length];
    const variance = 0.7 + simulationRandom() * 0.6; // 0.7-1.3x multiplier

    players.push({
      id: `virtual_${i + 1}`,
      name: namePool[i % namePool.length],
      bankroll: Math.round(personality.avgBet * (10 + simulationRandom() * 20)), // 10-30x avg bet
      personality: personality.name,
      avgBetSize: Math.round(personality.avgBet * variance),
      bettingFrequency: Math.max(0.1, personality.frequency * variance), // Chance per cycle
      favoritesBias: personality.favorites, // Prefers betting favorites vs underdogs
      lastBetTime: 0, // Throttle betting
      totalBets: 0,
      wins: 0,
      losses: 0
    });
  }

  return players;
}

// Get random virtual player weighted by their betting frequency
function getRandomVirtualPlayer() {
  if (_virtualPlayers.length === 0) return null;

  const weights = _virtualPlayers.map(p => p.bettingFrequency);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = simulationRandom() * totalWeight;

  for (let i = 0; i < _virtualPlayers.length; i++) {
    random -= weights[i];
    if (random <= 0) return _virtualPlayers[i];
  }

  return _virtualPlayers[_virtualPlayers.length - 1];
}

// Generate realistic bet size for a virtual player
function generateBetSize(player, odds) {
  // Base bet around their average with variance
  let betSize = player.avgBetSize * (0.5 + simulationRandom());

  // Adjust based on odds confidence (better odds = bigger bets for some)
  if (player.personality === 'Aggressive' || player.personality === 'High Roller') {
    if (Math.abs(odds.mlA) < 200 || Math.abs(odds.mlB) < 200) { // Close to even
      betSize *= (1.2 + simulationRandom() * 0.5); // Bet more on close matches
    }
  }

  // Ensure they don't bet more than they have
  betSize = Math.min(betSize, player.bankroll * 0.3); // Max 30% of bankroll

  // Round to realistic amounts
  if (betSize < 25) return Math.round(betSize / 5) * 5; // $5 increments
  if (betSize < 100) return Math.round(betSize / 10) * 10; // $10 increments
  return Math.round(betSize / 25) * 25; // $25 increments
}

// ---- odds fluctuation simulation ----------------------------

// Simulate natural market-driven odds movement
function simulateOddsFluctuations(now) {
  Object.keys(_teams).forEach((teamAId, index) => {
    Object.keys(_teams).forEach((teamBId, subIndex) => {
      if (teamAId >= teamBId || subIndex <= index) return; // Avoid duplicates and self-matches

      const matchKey = getMatchKey(teamAId, teamBId);
      const lastUpdate = _simulationState.lastOddsUpdate[matchKey] || 0;

      // Only update odds every 8-15 seconds (scaled by simulation speed)
      const updateInterval = (8000 + simulationRandom() * 7000) / _simulationSpeed;
      if (now - lastUpdate < updateInterval) return;

      // Get true baseline odds.
      const currentOdds = getMatchMoneyline(teamAId, teamBId);
      const trueOdds = calculateTrueHandicapOdds(teamAId, teamBId);
      const baseProb = Number.isFinite(_simulationState.marketProbabilities[matchKey])
        ? _simulationState.marketProbabilities[matchKey]
        : currentOdds.probA;

      const matchState = _simulationState.holesSimulated[matchKey] || null;
      const holesPlayed = Math.max(0, Number(matchState?.holesPlayed || 0));
      const totalHoles = Math.max(1, Number(matchState?.totalHoles || 9));
      const progress = Math.max(0, Math.min(1, holesPlayed / totalHoles));
      const scoreDiff = Number(matchState?.scoreA || 0) - Number(matchState?.scoreB || 0);

      // Market movement terms:
      // - noise: micro fluctuation
      // - drift: sentiment drift
      // - reversion: pull toward fair handicap price
      // - scoreboardImpulse: in-play signal from current lead
      const noise = (simulationRandom() - 0.5) * (0.018 + (1 - progress) * 0.012);
      const drift = generateMarketDrift(matchKey, now);
      const reversion = (trueOdds.probA - baseProb) * (0.06 + progress * 0.08);
      const scoreboardImpulse = (scoreDiff * (0.004 + progress * 0.010));

      let nextProb = baseProb + noise + drift + reversion + scoreboardImpulse;

      // Keep movement meaningful but bounded per update.
      const maxStep = 0.015 + progress * 0.03; // ~1.5% early, up to ~4.5% late
      const rawStep = nextProb - baseProb;
      if (Math.abs(rawStep) > maxStep) {
        nextProb = baseProb + (Math.sign(rawStep) * maxStep);
      }

      // Tighten allowable drift as match progresses.
      const dynamicBand = 0.16 - progress * 0.08; // ±16% -> ±8%
      const minProb = Math.max(0.03, trueOdds.probA - dynamicBand);
      const maxProb = Math.min(0.97, trueOdds.probA + dynamicBand);
      nextProb = Math.max(minProb, Math.min(maxProb, nextProb));

      // Ignore tiny moves so animation cadence stays intentional.
      if (Math.abs(nextProb - baseProb) >= 0.004) {
        _simulationState.marketProbabilities[matchKey] = nextProb;
      }

      _simulationState.lastOddsUpdate[matchKey] = now;
    });
  });
}

// Generate market drift for longer-term sentiment changes
function generateMarketDrift(matchKey, now) {
  // Create pseudo-random drift that's consistent for each match
  const seed = hashStringToNumber(matchKey + Math.floor(now / 60000)); // Changes every minute
  const pseudoRandom = (Math.sin(seed) + 1) / 2; // 0-1

  // Convert to drift: mostly small movements, occasionally larger
  if (pseudoRandom < 0.7) return 0; // 70% no drift
  if (pseudoRandom < 0.95) return (pseudoRandom - 0.85) * 0.02; // 25% small drift ±1%
  return (pseudoRandom - 0.975) * 0.08; // 5% larger drift ±2%
}

// Simple hash function for consistent pseudo-randomness
function hashStringToNumber(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Calculate true handicap-based odds without any simulation
function calculateTrueHandicapOdds(teamAId, teamBId) {
  const tA = _teams[teamAId];
  const tB = _teams[teamBId];

  if (!tA || !tB) return { probA: 0.5, probB: 0.5 };

  const effA = tA.combined / 2;
  const effB = tB.combined / 2;

  let probA;
  if (effA > 15 && effB > 15) {
    const diff = effA - effB;
    const absDiff = Math.abs(diff);
    const clampedDiff = Math.min(absDiff, 15);

    if (clampedDiff < 0.1) {
      probA = 0.5;
    } else {
      const pFav = interpolateProb(0, clampedDiff);
      probA = diff < 0 ? pFav : (1 - pFav);
    }
  } else {
    probA = interpolateProb(
      Math.max(0, Math.min(15, effA)),
      Math.max(0, Math.min(15, effB))
    );
  }

  return { probA, probB: 1 - probA };
}

// ---- match progression simulation ---------------------------

// Simulate realistic hole-by-hole match progression
function simulateMatchProgression(now) {
  // Simulate active matches progressing through holes
  // This would integrate with your actual match state management
  Object.keys(_teams).forEach((teamAId, index) => {
    Object.keys(_teams).forEach((teamBId, subIndex) => {
      if (teamAId >= teamBId || subIndex <= index) return;

      const matchKey = getMatchKey(teamAId, teamBId);
      let holesData = _simulationState.holesSimulated[matchKey];

      if (!holesData) {
        // Initialize new match simulation
        holesData = {
          holesPlayed: 0,
          totalHoles: 9, // Standard 9-hole match
          scoreA: 0,     // Match play points for team A
          scoreB: 0,     // Match play points for team B
          lastHoleTime: now,
          holeStartTime: now,
          matchStartTime: now
        };
        _simulationState.holesSimulated[matchKey] = holesData;
      }

      // Don't advance completed matches
      if (holesData.holesPlayed >= holesData.totalHoles) return;

      // Realistic hole timing: 10-15 minutes per hole (scaled by simulation speed)
      const holeBaseDuration = (10 + simulationRandom() * 5) * 60 * 1000; // 10-15 min in ms
      const scaledDuration = holeBaseDuration / _simulationSpeed;

      if (now - holesData.lastHoleTime < scaledDuration) return;

      // Advance to next hole
      holesData.holesPlayed++;
      holesData.lastHoleTime = now;

      // Simulate hole outcome based on team strength
      const holeResult = simulateHoleResult(teamAId, teamBId, holesData.holesPlayed);
      holesData.scoreA += holeResult.pointsA;
      holesData.scoreB += holeResult.pointsB;

      // Update live odds based on new match state
      const liveState = {
        holesPlayed: holesData.holesPlayed,
        totalHoles: holesData.totalHoles,
        scoreA: holesData.scoreA,
        scoreB: holesData.scoreB
      };

      // This triggers the live odds calculation and delta tracking
      getLiveMatchMoneyline(teamAId, teamBId, `live_${matchKey}`, liveState);

      console.log(`[Simulation] ${teamAId} vs ${teamBId} - Hole ${holesData.holesPlayed}: ${holesData.scoreA}-${holesData.scoreB}`);
    });
  });
}

// Simulate realistic hole outcome in match play
function simulateHoleResult(teamAId, teamBId, holeNumber) {
  const teamA = _teams[teamAId];
  const teamB = _teams[teamBId];

  if (!teamA || !teamB) return { pointsA: 0, pointsB: 0 };

  // Calculate win probability for this hole based on handicaps
  const effA = teamA.combined / 2;
  const effB = teamB.combined / 2;

  // Base probability from handicap differential
  let probA = interpolateProb(
    Math.max(0, Math.min(15, effA)),
    Math.max(0, Math.min(15, effB))
  );

  // Add hole-specific variance (some holes favor different players)
  const holeVariance = (Math.sin(holeNumber * 1.7) * 0.05); // ±5% based on hole
  probA = Math.max(0.1, Math.min(0.9, probA + holeVariance));

  // Simulate the hole
  const random = simulationRandom();

  if (random < probA * 0.85) {
    return { pointsA: 1, pointsB: 0 }; // Team A wins hole
  } else if (random < probA * 0.85 + (1 - probA) * 0.85) {
    return { pointsA: 0, pointsB: 1 }; // Team B wins hole
  } else {
    return { pointsA: 0.5, pointsB: 0.5 }; // Halved hole (15% chance)
  }
}

// Get current match simulation state (for external access)
export function getMatchSimulationState(teamAId, teamBId) {
  if (!_demoMode) return null;

  const matchKey = getMatchKey(teamAId, teamBId);
  return _simulationState.holesSimulated[matchKey] || null;
}

// ---- virtual betting simulation -----------------------------

// Simulate virtual players placing bets
function simulateVirtualBetting(now) {
  if (_virtualPlayers.length === 0) {
    // Auto-generate virtual players if none configured
    _virtualPlayers = generateVirtualPlayers(12);
  }

  // Each cycle, some players might place bets
  _virtualPlayers.forEach(player => {
    // Throttle betting - don't let players bet too frequently
    if (now - player.lastBetTime < 30000 / _simulationSpeed) return; // Min 30s between bets

    // Check if this player wants to bet this cycle
    if (simulationRandom() > player.bettingFrequency / 10) return; // Scale frequency

    // Find an interesting betting opportunity
    const betOpportunity = findBettingOpportunity(player, now);
    if (!betOpportunity) return;

    // Generate the bet
    const bet = createVirtualBet(player, betOpportunity, now);
    if (!bet) return;

    // Place the bet (simulate - store in activity log)
    player.lastBetTime = now;
    player.totalBets++;
    player.bankroll -= bet.stake;

    // Add to recent activity for display
    _simulationState.betActivity.unshift({
      ...bet,
      playerName: player.name,
      timestamp: now
    });

    // Keep only recent activity (last 20 bets)
    if (_simulationState.betActivity.length > 20) {
      _simulationState.betActivity.pop();
    }

    console.log(`[Virtual Bet] ${player.name} bet $${bet.stake} on ${bet.description}`);
  });
}

// Find attractive betting opportunities for a virtual player
function findBettingOpportunity(player, now) {
  const opportunities = [];

  // Check all possible team matchups for interesting bets
  Object.keys(_teams).forEach((teamAId, index) => {
    Object.keys(_teams).forEach((teamBId, subIndex) => {
      if (teamAId >= teamBId || subIndex <= index) return;

      const odds = getMatchMoneyline(teamAId, teamBId);
      const matchKey = getMatchKey(teamAId, teamBId);
      const matchState = _simulationState.holesSimulated[matchKey];

      // Skip completed matches
      if (matchState && matchState.holesPlayed >= matchState.totalHoles) return;

      // Live odds if match is in progress
      const liveOdds = matchState ?
        getLiveMatchMoneyline(teamAId, teamBId, `live_${matchKey}`, {
          holesPlayed: matchState.holesPlayed,
          totalHoles: matchState.totalHoles,
          scoreA: matchState.scoreA,
          scoreB: matchState.scoreB
        }) : odds;

      // Evaluate betting attractiveness based on player preferences
      const teamAName = _teams[teamAId].member.split(' ').pop();
      const teamBName = _teams[teamBId].member.split(' ').pop();

      // Team A bet opportunity
      const attractivenessA = calculateBetAttractiveness(player, liveOdds.probA, liveOdds.mlA);
      if (attractivenessA > 0.3) {
        opportunities.push({
          type: 'match_winner',
          teamAId, teamBId,
          selection: teamAId,
          odds: liveOdds.mlA,
          description: `${teamAName} to win`,
          attractiveness: attractivenessA,
          matchState
        });
      }

      // Team B bet opportunity
      const attractivenessB = calculateBetAttractiveness(player, liveOdds.probB, liveOdds.mlB);
      if (attractivenessB > 0.3) {
        opportunities.push({
          type: 'match_winner',
          teamAId, teamBId,
          selection: teamBId,
          odds: liveOdds.mlB,
          description: `${teamBName} to win`,
          attractiveness: attractivenessB,
          matchState
        });
      }
    });
  });

  if (opportunities.length === 0) return null;

  // Pick the most attractive opportunity (weighted random)
  opportunities.sort((a, b) => b.attractiveness - a.attractiveness);
  const topOpportunities = opportunities.slice(0, Math.min(3, opportunities.length));

  const weights = topOpportunities.map(o => o.attractiveness);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = simulationRandom() * totalWeight;

  for (let i = 0; i < topOpportunities.length; i++) {
    random -= weights[i];
    if (random <= 0) return topOpportunities[i];
  }

  return topOpportunities[0];
}

// Calculate how attractive a bet is to a specific player
function calculateBetAttractiveness(player, winProbability, moneyline) {
  // Convert moneyline to implied probability
  const impliedProb = mlToProb(moneyline);

  // Base attractiveness on perceived edge
  const perceivedEdge = winProbability - impliedProb;

  // Adjust for player personality
  let attractiveness = perceivedEdge * 2; // Base on edge

  // Favorites bias
  if (player.favoritesBias && impliedProb > 0.55) {
    attractiveness += 0.2; // Favor betting favorites
  } else if (!player.favoritesBias && impliedProb < 0.45) {
    attractiveness += 0.2; // Favor betting underdogs
  }

  // Risk tolerance adjustments
  if (player.personality === 'Conservative' && Math.abs(moneyline) > 200) {
    attractiveness -= 0.3; // Avoid extreme odds
  } else if (player.personality === 'Aggressive' && Math.abs(moneyline) < 150) {
    attractiveness += 0.2; // Like close matches
  }

  // Bankroll considerations
  if (player.bankroll < player.avgBetSize * 3) {
    attractiveness -= 0.4; // More cautious when low on funds
  }

  return Math.max(0, attractiveness);
}

// Create a virtual bet from an opportunity
function createVirtualBet(player, opportunity, now) {
  const betSize = generateBetSize(player, { mlA: opportunity.odds, mlB: 0 });

  if (betSize < 5 || betSize > player.bankroll) return null;

  return {
    id: `virtual_bet_${now}_${simulationToken(4)}`,
    type: opportunity.type,
    selection: opportunity.selection,
    stake: betSize,
    odds: mlToDecimal(opportunity.odds),
    description: opportunity.description,
    timestamp: now,
    status: 'active',
    payout: 0,
    isVirtual: true
  };
}

// Get recent virtual betting activity (for display)
export function getVirtualBettingActivity() {
  if (!_demoMode) return [];
  return _simulationState.betActivity.slice(0, 10); // Return last 10 bets
}

// ---- app state integration ----------------------------------

// Initialize simulation with existing app state
export function initSimulation(appState) {
  if (!_demoMode || !appState || !appState.matches) return;

  console.log('[Betting] Initializing simulation with app state');

  // Start simulating existing matches that aren't final
  Object.values(appState.matches).forEach(match => {
    if (match.status === 'final' || match.status === 'cancelled') return;

    const matchKey = getMatchKey(match.teamA, match.teamB, match.id);

    // Initialize simulation state for this match if not already done
    if (!_simulationState.holesSimulated[matchKey]) {
      _simulationState.holesSimulated[matchKey] = {
        matchId: match.id,
        holesPlayed: 0,
        totalHoles: 9,
        scoreA: match.scoreA || 0,
        scoreB: match.scoreB || 0,
        lastHoleTime: Date.now(),
        holeStartTime: Date.now(),
        matchStartTime: Date.now() - simulationRandom() * 60000 * 30 // Started up to 30min ago
      };
    }
  });

  // Generate virtual players if none configured
  if (_virtualPlayers.length === 0) {
    _virtualPlayers = generateVirtualPlayers(12);
  }

  console.log(`[Betting] Simulation ready - ${Object.keys(_simulationState.holesSimulated).length} matches, ${_virtualPlayers.length} virtual players`);
}

// Update app state with simulation data (call this from main app loop)
export function updateAppStateWithSimulation(appState) {
  if (!_demoMode || !appState || !appState.matches) return false;

  let updated = false;

  // Update match statuses and scores from simulation
  Object.keys(_simulationState.holesSimulated).forEach(matchKey => {
    const simState = _simulationState.holesSimulated[matchKey];
    const match = appState.matches[simState.matchId];

    if (!match) return;

    // Update match scores if they've changed
    const currentScoreA = match.scoreA || 0;
    const currentScoreB = match.scoreB || 0;

    if (simState.scoreA !== currentScoreA || simState.scoreB !== currentScoreB) {
      match.scoreA = simState.scoreA;
      match.scoreB = simState.scoreB;
      updated = true;

      // Mark as in progress if holes have been played
      if (simState.holesPlayed > 0 && match.status === 'scheduled') {
        match.status = 'in_progress';
        updated = true;
      }

      // Mark as final if all holes completed
      if (simState.holesPlayed >= simState.totalHoles && match.status !== 'final') {
        match.status = 'final';
        updated = true;
      }
    }
  });

  // Add virtual bets to app state if there's a bets array
  if (appState.bets && _simulationState.betActivity.length > 0) {
    _simulationState.betActivity.forEach(virtualBet => {
      // Only add if not already in state
      if (!appState.bets.find(b => b.id === virtualBet.id)) {
        appState.bets.push({
          ...virtualBet,
          isVirtual: true
        });
        updated = true;
      }
    });
  }

  return updated;
}

// Get simulation statistics for display
export function getSimulationStats() {
  if (!_demoMode) return null;

  const activeMatches = Object.values(_simulationState.holesSimulated).filter(
    match => match.holesPlayed < match.totalHoles
  ).length;

  const completedMatches = Object.values(_simulationState.holesSimulated).filter(
    match => match.holesPlayed >= match.totalHoles
  ).length;

  const activePlayers = _virtualPlayers.filter(p => p.bankroll > p.avgBetSize).length;

  const totalVolume = _simulationState.betActivity.reduce((sum, bet) => sum + bet.stake, 0);

  return {
    isActive: _demoMode,
    speed: _simulationSpeed,
    activeMatches,
    completedMatches,
    activePlayers,
    totalPlayers: _virtualPlayers.length,
    recentBets: _simulationState.betActivity.length,
    totalVolume,
    lastActivity: _simulationState.betActivity[0]?.timestamp || null
  };
}

// Force a simulation event (for testing/demonstration)
export function triggerSimulationEvent(eventType) {
  if (!_demoMode) return false;

  const now = Date.now();

  switch (eventType) {
    case 'odds_fluctuation':
      simulateOddsFluctuations(now);
      return true;

    case 'virtual_bet':
      simulateVirtualBetting(now);
      return true;

    case 'match_progression':
      simulateMatchProgression(now);
      return true;

    case 'full_cycle':
      runSimulationCycle();
      return true;

    default:
      return false;
  }
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
  const movementMagnitude = (delta) => {
    const abs = Math.abs(delta);
    if (abs < 20) return "small";
    if (abs < 50) return "medium";
    return "large";
  };

  const buildMovementPayload = (prevA, prevB, currA, currB) => {
    const deltaA = currA - prevA;
    const deltaB = currB - prevB;
    const directionA = deltaA > 0 ? "worse" : deltaA < 0 ? "better" : "unchanged";
    const directionB = deltaB > 0 ? "worse" : deltaB < 0 ? "better" : "unchanged";

    return {
      previousOdds: { player1: prevA, player2: prevB },
      currentOdds: { player1: currA, player2: currB },
      delta: { player1: deltaA, player2: deltaB },
      direction: { player1: directionA, player2: directionB },
      magnitude: {
        player1: movementMagnitude(deltaA),
        player2: movementMagnitude(deltaB)
      }
    };
  };

  const attachCanonicalAliases = (movement) => ({
    ...movement,
    teamA: movement.player1,
    teamB: movement.player2
  });

  if (!previous) {
    const seededMovement = buildMovementPayload(current.mlA, current.mlB, current.mlA, current.mlB);
    const animationPayload = {
      previousOdds: { ...seededMovement.previousOdds },
      currentOdds: { ...seededMovement.currentOdds },
      delta: { ...seededMovement.delta },
      direction: { ...seededMovement.direction },
      magnitude: { ...seededMovement.magnitude }
    };
    return {
      deltaA: 0, deltaB: 0,
      directionA: 'unchanged', directionB: 'unchanged',
      magnitudeA: 'small', magnitudeB: 'small',
      oddsAnimation: animationPayload,
      oddsMovement: {
        previousOdds: attachCanonicalAliases(seededMovement.previousOdds),
        currentOdds: attachCanonicalAliases(seededMovement.currentOdds),
        delta: attachCanonicalAliases(seededMovement.delta),
        direction: attachCanonicalAliases(seededMovement.direction),
        magnitude: attachCanonicalAliases(seededMovement.magnitude)
      },
      oddsDelta: {
        previousOdds: attachCanonicalAliases(seededMovement.previousOdds),
        currentOdds: attachCanonicalAliases(seededMovement.currentOdds),
        delta: attachCanonicalAliases(seededMovement.delta),
        direction: attachCanonicalAliases(seededMovement.direction),
        magnitude: attachCanonicalAliases(seededMovement.magnitude)
      }
    };
  }

  const deltaA = current.mlA - previous.mlA;
  const deltaB = current.mlB - previous.mlB;

  // Direction: positive delta = worse odds (longer shot), negative = better odds (shorter)
  const directionA = deltaA > 0 ? 'worse' : deltaA < 0 ? 'better' : 'unchanged';
  const directionB = deltaB > 0 ? 'worse' : deltaB < 0 ? 'better' : 'unchanged';

  // Magnitude based on absolute change in moneyline
  const movement = buildMovementPayload(previous.mlA, previous.mlB, current.mlA, current.mlB);
  const movementWithAliases = {
    previousOdds: attachCanonicalAliases(movement.previousOdds),
    currentOdds: attachCanonicalAliases(movement.currentOdds),
    delta: attachCanonicalAliases(movement.delta),
    direction: attachCanonicalAliases(movement.direction),
    magnitude: attachCanonicalAliases(movement.magnitude)
  };
  const animationPayload = {
    previousOdds: { ...movement.previousOdds },
    currentOdds: { ...movement.currentOdds },
    delta: { ...movement.delta },
    direction: { ...movement.direction },
    magnitude: { ...movement.magnitude }
  };

  return {
    deltaA, deltaB,
    directionA, directionB,
    magnitudeA: movementMagnitude(deltaA),
    magnitudeB: movementMagnitude(deltaB),
    oddsAnimation: animationPayload,
    oddsMovement: movementWithAliases,
    oddsDelta: movementWithAliases
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

// Default relative hole difficulty profile (1.0 = neutral)
// Higher means harder hole, which lowers confidence in current lead.
const DEFAULT_HOLE_DIFFICULTY = [
  1.08, 0.96, 1.12, 1.04, 0.94, 1.06, 0.98, 1.10, 0.92,
  1.03, 0.97, 1.09, 1.01, 0.95, 1.07, 0.99, 1.11, 0.93
];

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

  // In demo simulation mode, blend to the persisted simulated market probability.
  if (_demoMode) {
    const simulationKey = getMatchKey(teamAId, teamBId);
    const simulatedProbA = _simulationState.marketProbabilities[simulationKey];
    if (Number.isFinite(simulatedProbA)) {
      probA = Math.max(0.03, Math.min(0.97, simulatedProbA));
    }
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

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function resolveHoleDifficultyProfile(liveState, totalHoles) {
  const rawProfile =
    liveState?.holeDifficulty ||
    liveState?.holeDifficulties ||
    liveState?.holeDifficultyProfile ||
    liveState?.remainingHoleDifficulty;

  if (!Array.isArray(rawProfile) || rawProfile.length === 0) {
    return DEFAULT_HOLE_DIFFICULTY.slice(0, totalHoles);
  }

  const normalized = rawProfile.slice(0, totalHoles).map((value, index) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_HOLE_DIFFICULTY[index % DEFAULT_HOLE_DIFFICULTY.length];
    }

    // If values look like stroke index (1-18), convert to relative difficulty.
    if (numeric >= 1 && numeric <= 18 && Number.isInteger(numeric)) {
      return 1 + ((10 - numeric) / 35);
    }

    // Otherwise treat input as already normalized.
    return Math.max(0.75, Math.min(1.25, numeric));
  });

  while (normalized.length < totalHoles) {
    normalized.push(DEFAULT_HOLE_DIFFICULTY[normalized.length % DEFAULT_HOLE_DIFFICULTY.length]);
  }

  return normalized;
}

function averageRemainingDifficulty(liveState, holesPlayed, totalHoles) {
  const profile = resolveHoleDifficultyProfile(liveState, totalHoles);
  const remaining = profile.slice(Math.max(0, holesPlayed), totalHoles);
  if (remaining.length === 0) return 1;

  const avg = remaining.reduce((sum, v) => sum + v, 0) / remaining.length;
  return Math.max(0.8, Math.min(1.2, avg));
}

function averageCompletedDifficulty(liveState, holesPlayed, totalHoles) {
  const profile = resolveHoleDifficultyProfile(liveState, totalHoles);
  const completed = profile.slice(0, Math.max(0, holesPlayed));
  if (completed.length === 0) return 1;
  const avg = completed.reduce((sum, v) => sum + v, 0) / completed.length;
  return Math.max(0.8, Math.min(1.2, avg));
}

function getRecentMomentum(liveState) {
  const events = Array.isArray(liveState?.holeResults) ? liveState.holeResults : null;
  if (!events || events.length === 0) return 0;

  const recent = events.slice(-3);
  let momentum = 0;
  recent.forEach((result, idx) => {
    const weight = idx === recent.length - 1 ? 1.2 : 1.0;
    if (result?.winner === "A" || result?.winner === "teamA") momentum += weight;
    else if (result?.winner === "B" || result?.winner === "teamB") momentum -= weight;
    else if (Number.isFinite(result?.delta)) momentum += Math.max(-1, Math.min(1, result.delta)) * weight;
  });
  return Math.max(-2, Math.min(2, momentum));
}

function getDifficultySignal(liveState, totalHoles) {
  const profile = resolveHoleDifficultyProfile(liveState, totalHoles);
  const events = Array.isArray(liveState?.holeResults) ? liveState.holeResults : [];
  if (events.length === 0) return 0;

  let weightedDelta = 0;
  let weightTotal = 0;
  events.forEach((event) => {
    const holeIdx = Math.max(0, Math.min(totalHoles - 1, Number(event?.hole || 1) - 1));
    const difficulty = Number.isFinite(Number(event?.difficulty))
      ? Number(event.difficulty)
      : profile[holeIdx] || 1;
    const delta = Math.max(-1, Math.min(1, Number(event?.delta) || 0));
    weightedDelta += (delta * difficulty);
    weightTotal += Math.max(0.8, Math.min(1.25, difficulty));
  });

  if (weightTotal <= 0) return 0;
  return Math.max(-1.5, Math.min(1.5, weightedDelta / weightTotal));
}

function getLatestHoleSignal(liveState, totalHoles) {
  const events = Array.isArray(liveState?.holeResults) ? liveState.holeResults : [];
  const latest = events.length > 0 ? events[events.length - 1] : null;
  const profile = resolveHoleDifficultyProfile(liveState, totalHoles);

  if (!latest) {
    return { difficulty: 1, margin: 1, delta: 0 };
  }

  const holeIdx = Math.max(0, Math.min(totalHoles - 1, Number(latest.hole || 1) - 1));
  const fallbackDifficulty = profile[holeIdx] || 1;
  const latestDifficulty = Number.isFinite(Number(latest.difficulty))
    ? Number(latest.difficulty)
    : fallbackDifficulty;
  const margin = Math.max(1, Number(latest.margin) || Math.abs(Number(latest.delta) || 0) || 1);
  const delta = Number(latest.delta) || 0;

  return {
    difficulty: Math.max(0.8, Math.min(1.25, latestDifficulty)),
    margin,
    delta
  };
}

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
  const holesRemainingRaw = Math.max(0, totalHoles - holesPlayed);
  const holesRemaining = Math.max(1, holesRemainingRaw);
  const scoreDiff = scoreA - scoreB; // positive = A leading

  // Start with pre-match handicap probability
  const preMatch = getMatchMoneyline(teamAId, teamBId, matchId);
  const preMatchProb = preMatch.probA;
  const completion = Math.max(0, Math.min(1, holesPlayed / totalHoles));
  const remainingDifficulty = averageRemainingDifficulty(liveState, holesPlayed, totalHoles);
  const completedDifficulty = averageCompletedDifficulty(liveState, holesPlayed, totalHoles);
  const momentum = getRecentMomentum(liveState);
  const difficultySignal = getDifficultySignal(liveState, totalHoles);
  const latestHoleSignal = getLatestHoleSignal(liveState, totalHoles);
  const evidenceVolatility = Math.max(
    0.82,
    Math.min(
      1.3,
      1 + ((latestHoleSignal.difficulty - 1) * 0.4) + ((latestHoleSignal.margin - 1) * 0.07)
    )
  );

  // Mathematical lock for match play style scoring:
  // if lead exceeds holes left, result is effectively certain.
  if (Math.abs(scoreDiff) > holesRemainingRaw || holesRemainingRaw === 0) {
    const lockedProb = scoreDiff > 0 ? 0.999 : scoreDiff < 0 ? 0.001 : 0.5;
    const lockedMlA = probToML(lockedProb);
    const lockedMlB = probToML(1 - lockedProb);
    const lockedOdds = { probA: lockedProb, probB: 1 - lockedProb, mlA: lockedMlA, mlB: lockedMlB };
    const previousLockedOdds = _oddsHistory[matchKey] || _oddsHistory[getMatchKey(teamAId, teamBId, matchId)] || null;
    const lockedDeltas = calculateOddsDeltas(lockedOdds, previousLockedOdds);
    storeOddsHistory(matchKey, lockedOdds);

    return {
      probA: lockedProb, probB: 1 - lockedProb, mlA: lockedMlA, mlB: lockedMlB, isLive: true,
      previousOdds: previousLockedOdds,
      ...lockedDeltas
    };
  }

  // Bayesian update:
  // prior = pre-match handicap edge, evidence = score differential weighted by
  // holes remaining and remaining-hole difficulty.
  const leadPressure = Math.max(0, Math.abs(scoreDiff) - (holesRemainingRaw * 0.45));
  const priorStrength = 2 + Math.pow(1 - completion, 1.12) * 20;
  const evidenceStrength =
    (2 + Math.pow(completion, 1.52) * 30 + (leadPressure * 2.4)) *
    evidenceVolatility *
    (1 / Math.max(0.9, remainingDifficulty));
  const scoreScale = Math.max(0.8, ((holesRemaining * 0.72) * remainingDifficulty) / evidenceVolatility);
  const weightedDiff =
    (scoreDiff / Math.max(0.7, completedDifficulty)) +
    (momentum * 0.35) +
    (difficultySignal * 0.55);
  const scoreLikelihood = sigmoid(weightedDiff / scoreScale);

  let liveProb =
    ((preMatchProb * priorStrength) + (scoreLikelihood * evidenceStrength)) /
    (priorStrength + evidenceStrength);

  // Hole-by-hole evidence injection:
  // harder holes and bigger margins should move price more than soft/parity holes.
  const latestHoleWeight = (0.011 + (completion * 0.016)) * (latestHoleSignal.margin > 1 ? 1.12 : 1);
  const latestHoleImpact =
    (Math.max(-1, Math.min(1, latestHoleSignal.delta)) * latestHoleWeight) /
    Math.max(0.85, remainingDifficulty);
  liveProb += latestHoleImpact;

  // As holes run out, push probability toward close-out certainty.
  const closeoutDiff =
    (scoreDiff * (2.2 + completion * 3.0)) +
    (momentum * 0.6) +
    (difficultySignal * 0.8);
  const closeoutProb = sigmoid(closeoutDiff / ((holesRemaining * remainingDifficulty) + 0.55));
  const convergenceWeight = Math.pow(completion, 1.95);
  liveProb = (liveProb * (1 - convergenceWeight)) + (closeoutProb * convergenceWeight);

  // Smooth hole-to-hole movement so updates are meaningful, not chaotic.
  const previousForSmoothing = _oddsHistory[matchKey] || _oddsHistory[getMatchKey(teamAId, teamBId, matchId)] || null;
  if (previousForSmoothing) {
    const stepFactor = Math.max(
      0.85,
      Math.min(
        1.2,
        1 + ((latestHoleSignal.difficulty - 1) * 0.5) + ((latestHoleSignal.margin - 1) * 0.04)
      )
    );
    const maxStep = (0.022 + (completion * 0.06)) * stepFactor; // meaningful but not wild hole-to-hole moves
    const deltaProb = liveProb - previousForSmoothing.probA;
    if (Math.abs(deltaProb) > maxStep) {
      liveProb = previousForSmoothing.probA + (Math.sign(deltaProb) * maxStep);
    }
  }

  // Endgame nudge (1-2 holes left): lead should look close to certain.
  if (holesRemainingRaw <= 2 && scoreDiff !== 0) {
    const endgame = (3 - holesRemainingRaw) / 3; // 1 hole left -> stronger push
    const target = scoreDiff > 0 ? 0.995 : 0.005;
    liveProb = (liveProb * (1 - endgame * 0.6)) + (target * endgame * 0.6);
  }

  // Certainty floor: once a side is up by >= holes remaining, force strong convergence.
  if (holesRemainingRaw > 0 && Math.abs(scoreDiff) >= holesRemainingRaw) {
    const certaintyWeight = Math.max(0.35, Math.min(0.85, completion));
    const certaintyTarget = scoreDiff > 0 ? 0.992 : 0.008;
    liveProb = (liveProb * (1 - certaintyWeight)) + (certaintyTarget * certaintyWeight);
  }

  const minProb = Math.max(0.001, 0.01 + (1 - completion) * 0.02 - (completion * 0.009));
  const maxProb = 1 - minProb;
  liveProb = Math.max(minProb, Math.min(maxProb, liveProb));

  const probA = liveProb;
  const probB = 1 - liveProb;
  const mlA = probToML(probA);
  const mlB = probToML(probB);
  const currentOdds = { probA, probB, mlA, mlB };

  // Get previous live odds and calculate deltas
  const previousOdds = _oddsHistory[matchKey] || _oddsHistory[getMatchKey(teamAId, teamBId, matchId)] || null;
  const deltas = calculateOddsDeltas(currentOdds, previousOdds);

  // Store current odds for next time
  storeOddsHistory(matchKey, currentOdds);

  return {
    probA, probB, mlA, mlB, isLive: true,
    previousOdds: previousOdds || null,
    ...deltas
  };
}

function toMoneylineOddsFromProb(probA) {
  const clampedA = Math.max(0.01, Math.min(0.99, Number(probA) || 0.5));
  const clampedB = 1 - clampedA;
  return {
    probA: clampedA,
    probB: clampedB,
    mlA: probToML(clampedA),
    mlB: probToML(clampedB)
  };
}

function normalizeBetType(betType) {
  const normalized = String(betType || "").toLowerCase();
  if (normalized === "best ball") return "best_ball";
  if (normalized === "match play") return "match_play";
  return normalized;
}

function getBetTypeMarketKey(betType, payload = {}) {
  const type = normalizeBetType(betType);
  const id =
    payload.matchId ||
    payload.marketId ||
    payload.id ||
    `${payload.teamAId || payload.teamA?.id || "A"}_${payload.teamBId || payload.teamB?.id || "B"}`;
  return `${type}::${id}`;
}

const _inPlayOddsState = {};

function getPreviousMarketOdds(key) {
  const prev = _inPlayOddsState[key]?.odds;
  if (!prev) return null;
  if (!Number.isFinite(prev.mlA) || !Number.isFinite(prev.mlB)) return null;
  return {
    mlA: prev.mlA,
    mlB: prev.mlB,
    probA: Number.isFinite(prev.probA) ? prev.probA : mlToProb(prev.mlA),
    probB: Number.isFinite(prev.probB) ? prev.probB : mlToProb(prev.mlB)
  };
}

function persistMarketOddsSnapshot(key, odds, liveState = undefined) {
  if (!key || !odds || !Number.isFinite(odds.mlA) || !Number.isFinite(odds.mlB)) return;
  const current = _inPlayOddsState[key] || {};
  _inPlayOddsState[key] = {
    liveState: liveState === undefined ? (current.liveState || null) : liveState,
    odds: {
      mlA: odds.mlA,
      mlB: odds.mlB,
      probA: Number.isFinite(odds.probA) ? odds.probA : mlToProb(odds.mlA),
      probB: Number.isFinite(odds.probB) ? odds.probB : mlToProb(odds.mlB)
    }
  };
}

function attachOddsMovementPayload(key, odds) {
  if (!odds || !Number.isFinite(odds.mlA) || !Number.isFinite(odds.mlB)) return odds;
  if (odds.oddsMovement && odds.oddsDelta) return odds;

  const previousOdds = getPreviousMarketOdds(key);
  const deltas = calculateOddsDeltas(odds, previousOdds);
  return {
    ...odds,
    previousOdds,
    ...deltas
  };
}

function finalizeMarketOdds(key, odds, liveState = undefined) {
  const enriched = attachOddsMovementPayload(key, odds);
  persistMarketOddsSnapshot(key, enriched, liveState);
  return enriched;
}

function buildLiveStateFromHoleResult(existingState, holeResult = {}) {
  const next = {
    holesPlayed: Number(existingState?.holesPlayed || 0),
    totalHoles: Number(existingState?.totalHoles || holeResult.totalHoles || 18),
    scoreA: Number(existingState?.scoreA || 0),
    scoreB: Number(existingState?.scoreB || 0),
    holeDifficulty: Array.isArray(existingState?.holeDifficulty)
      ? [...existingState.holeDifficulty]
      : [],
    holeResults: Array.isArray(existingState?.holeResults)
      ? [...existingState.holeResults]
      : []
  };

  const explicitHoleNumber = Number(holeResult.hole || holeResult.holeNumber);
  const hasWinnerSignal =
    holeResult.winner === "A" ||
    holeResult.winner === "B" ||
    holeResult.winner === "teamA" ||
    holeResult.winner === "teamB";
  const hasScoreSignal =
    holeResult.scoreA !== undefined ||
    holeResult.scoreB !== undefined ||
    Number.isFinite(Number(holeResult.deltaA)) ||
    Number.isFinite(Number(holeResult.deltaB)) ||
    Number.isFinite(Number(holeResult.delta)) ||
    hasWinnerSignal;
  const hasDifficultySignal =
    Number.isFinite(Number(holeResult.holeDifficulty || holeResult.difficulty)) ||
    Array.isArray(holeResult.holeDifficultyProfile) ||
    Array.isArray(holeResult.holeDifficulties) ||
    Array.isArray(holeResult.historicalHoleDifficulty) ||
    Array.isArray(holeResult.remainingHoleDifficulty);

  const holeNumber = Number.isFinite(explicitHoleNumber)
    ? explicitHoleNumber
    : (hasScoreSignal ? next.holesPlayed + 1 : next.holesPlayed);

  let eventDelta = Number.isFinite(Number(holeResult.delta)) ? Number(holeResult.delta) : 0;
  let eventMargin = Number.isFinite(Number(holeResult.margin)) ? Math.abs(Number(holeResult.margin)) : 1;

  if (holeResult.scoreA !== undefined && holeResult.scoreB !== undefined) {
    const a = Number(holeResult.scoreA);
    const b = Number(holeResult.scoreB);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      eventMargin = Math.max(1, Math.abs(a - b));
      if (a < b) {
        next.scoreA += 1;
        eventDelta = 1;
      } else if (b < a) {
        next.scoreB += 1;
        eventDelta = -1;
      } else {
        eventDelta = 0;
      }
    }
  } else if (holeResult.winner === "A" || holeResult.winner === "teamA") {
    next.scoreA += 1;
    eventDelta = 1;
  } else if (holeResult.winner === "B" || holeResult.winner === "teamB") {
    next.scoreB += 1;
    eventDelta = -1;
  } else if (Number.isFinite(Number(holeResult.deltaA)) || Number.isFinite(Number(holeResult.deltaB))) {
    const deltaA = Number(holeResult.deltaA || 0);
    const deltaB = Number(holeResult.deltaB || 0);
    next.scoreA += deltaA;
    next.scoreB += deltaB;
    eventDelta = deltaA - deltaB;
    eventMargin = Math.max(1, Math.abs(eventDelta));
  }

  if (hasScoreSignal && Number.isFinite(holeNumber) && holeNumber > next.holesPlayed) {
    next.holesPlayed = holeNumber;
  }

  const holeDifficulty = Number(holeResult.holeDifficulty || holeResult.difficulty);
  if (Number.isFinite(holeDifficulty) && holeNumber >= 1 && holeNumber <= next.totalHoles) {
    next.holeDifficulty[holeNumber - 1] = holeDifficulty;
  }
  const difficultyProfile =
    holeResult.holeDifficultyProfile ||
    holeResult.holeDifficulties ||
    holeResult.historicalHoleDifficulty ||
    holeResult.remainingHoleDifficulty;
  if (Array.isArray(difficultyProfile) && difficultyProfile.length > 0) {
    next.holeDifficulty = difficultyProfile.slice(0, next.totalHoles).map((v, idx) => {
      const numeric = Number(v);
      if (!Number.isFinite(numeric)) {
        return next.holeDifficulty[idx] || DEFAULT_HOLE_DIFFICULTY[idx % DEFAULT_HOLE_DIFFICULTY.length];
      }
      return numeric;
    });
  }

  if (hasScoreSignal || hasDifficultySignal) {
    // Replace existing event for the same hole to keep rapid updates stable.
    next.holeResults = next.holeResults.filter((entry) => Number(entry?.hole) !== Number(holeNumber));
    next.holeResults.push({
      hole: holeNumber,
      winner: holeResult.winner || null,
      delta: eventDelta,
      margin: eventMargin,
      difficulty: Number.isFinite(holeDifficulty) ? holeDifficulty : null
    });
  }

  return next;
}

function calculateOddsRaw(betType, payload = {}) {
  const type = normalizeBetType(betType);

  if (type === "nassau" || type === "match_play") {
    const teamAId = payload.teamAId || payload.teamA?.id || payload.teamA;
    const teamBId = payload.teamBId || payload.teamB?.id || payload.teamB;
    if (!teamAId || !teamBId) return null;
    if (payload.liveState) {
      return getLiveMatchMoneyline(teamAId, teamBId, payload.matchId, payload.liveState);
    }
    return getMatchMoneyline(teamAId, teamBId, payload.matchId);
  }

  if (type === "skins") {
    const skinOdds = calculateSkinsOdds(payload.teamA, payload.teamB, payload.holes);
    return {
      ...toMoneylineOddsFromProb(skinOdds.probA),
      model: skinOdds
    };
  }

  if (type === "best_ball" || type === "scramble") {
    const format = type === "scramble" ? "scramble" : "best_ball";
    const teamFormatOdds = calculateTeamFormatOdds(payload.teamA, payload.teamB, format);
    return {
      ...toMoneylineOddsFromProb(teamFormatOdds.probA),
      model: teamFormatOdds
    };
  }

  if (type === "wolf") {
    const playerOdds = calculateWolfOdds(payload.players || [], payload.holesAsWolf || 4.5);
    return { players: playerOdds, isLive: !!payload.liveState };
  }

  if (type === "stableford") {
    const stablefordOdds = calculateStablefordOdds(payload.teamA, payload.teamB, payload.courseData);
    return {
      ...toMoneylineOddsFromProb(stablefordOdds.probA),
      model: stablefordOdds
    };
  }

  return null;
}

export function calculateOdds(betType, payload = {}) {
  const marketKey = getBetTypeMarketKey(betType, payload);
  const rawOdds = calculateOddsRaw(betType, payload);
  if (!rawOdds) return null;
  if (!Number.isFinite(rawOdds.mlA) || !Number.isFinite(rawOdds.mlB)) return rawOdds;
  return finalizeMarketOdds(marketKey, rawOdds, payload.liveState || null);
}

export function updateOdds(betType, payload = {}, holeResult = {}) {
  const key = getBetTypeMarketKey(betType, payload);
  const current = _inPlayOddsState[key] || { liveState: payload.liveState || null };
  const nextLiveState = buildLiveStateFromHoleResult(current.liveState, holeResult);
  const nextPayload = { ...payload, liveState: nextLiveState };
  const rawOdds = calculateOddsRaw(betType, nextPayload);
  if (!rawOdds) return null;
  if (!Number.isFinite(rawOdds.mlA) || !Number.isFinite(rawOdds.mlB)) return rawOdds;
  return finalizeMarketOdds(key, rawOdds, nextLiveState);
}

export function settle(betType, bet, match) {
  const type = normalizeBetType(betType);
  if (!bet || !match) return null;
  if (type === "nassau") return settleNassauBet(bet, match);
  if (type === "skins") return settleSkinsBet(bet, match);
  if (type === "match_play") return settleMatchPlayBet(bet, match);
  if (type === "best_ball" || type === "scramble") return settleBestBallScrambleBet(bet, match);
  if (type === "wolf") return settleWolfBet(bet, match);
  if (type === "stableford") return settleStablefordBet(bet, match);
  return null;
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

function normalizeSelectionForMatch(selection, match) {
  if (!match) return selection;
  if (selection === "teamA") return match.teamA;
  if (selection === "teamB") return match.teamB;
  return selection;
}

function isEarlyTerminatedMatch(match) {
  const status = String(match?.status || "").toLowerCase();
  const earlyStatuses = new Set([
    "cancelled",
    "canceled",
    "abandoned",
    "suspended",
    "rain_delay",
    "rainout",
    "quit",
    "forfeit",
    "withdrawn",
    "incomplete",
    "stopped"
  ]);

  return earlyStatuses.has(status) || !!match?.roundEndedEarly || !!match?.endedEarlyReason;
}

export function settleBets(state) {
  // Use the enhanced zero-sum settlement function
  return settleBetsWithZeroSumValidation(state);
}

/**
 * Enhanced settlement function that enforces zero-sum compliance
 * @param {Object} state - Current game state with bets
 * @returns {Object} - Settlement result with audit info
 */
export function settleBetsWithZeroSumValidation(state) {
  // First, determine which bets are ready to settle
  const betsToSettle = [];

  state.bets.forEach(bet => {
    if (bet.status !== "active") return;

    let proposedStatus = null;
    let proposedPayout = 0;
    const match = state.matches[bet.matchId];
    const normalizedSelection = normalizeSelectionForMatch(bet.selection, match);

    if (match && isEarlyTerminatedMatch(match)) {
      const partialSettlement = handlePartialRound(match, { ...bet, selection: normalizedSelection });
      if (partialSettlement) {
        proposedStatus = partialSettlement.status;
        proposedPayout = partialSettlement.payout;
      }
    }

    if (proposedStatus) {
      const normalizedPayout = normalizeSettlementPayout(bet.stake, proposedStatus, proposedPayout);
      betsToSettle.push({
        ...bet,
        selection: normalizedSelection,
        proposedStatus,
        proposedPayout: normalizedPayout
      });
      return;
    }

    if (bet.type === "match_winner") {
      if (!match || match.status !== "final") return;

      let winner = null;
      if (match.scoreA > match.scoreB) winner = match.teamA;
      else if (match.scoreB > match.scoreA) winner = match.teamB;

      if (normalizedSelection === "draw") {
        if (winner === null) {
          proposedStatus = "won";
          const stakeCents = dollarsToCents(bet.stake);
          const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
          proposedPayout = centsToDollars(payoutCents);
        } else {
          proposedStatus = "lost";
        }
      } else if (winner === null) {
        proposedStatus = "push";
        proposedPayout = bet.stake; // Exact stake returned
      } else if (normalizedSelection == winner) {
        proposedStatus = "won";
        const stakeCents = dollarsToCents(bet.stake);
        const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
        proposedPayout = centsToDollars(payoutCents);
      } else {
        proposedStatus = "lost";
      }
    }

    if (bet.type === "match_margin") {
      if (!match || match.status !== "final") return;

      const outcome = `${match.scoreA}-${match.scoreB}`;
      if (bet.selection === outcome) {
        proposedStatus = "won";
        const stakeCents = dollarsToCents(bet.stake);
        const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
        proposedPayout = centsToDollars(payoutCents);
      } else {
        proposedStatus = "lost";
      }
    }

    if (bet.type === "flight_winner") {
      const fm = Object.values(state.matches).filter(m => m.flight === bet.flightId);
      if (!fm.every(m => m.status === "final")) return;

      const standings = calcStandingsForBetting(bet.flightId, state.matches);
      if (standings[0].teamId == bet.selection) {
        proposedStatus = "won";
        const stakeCents = dollarsToCents(bet.stake);
        const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
        proposedPayout = centsToDollars(payoutCents);
      } else {
        proposedStatus = "lost";
      }
    }

    if (bet.type === "nassau") {
      if (!match || match.status !== "final") return;

      // Nassau has three components: front 9, back 9, and overall
      const settlement = settleNassauBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "skins") {
      if (!match || match.status !== "final") return;

      // Skins betting - each hole is worth a skin, with carryover or no-carryover variants
      const settlement = settleSkinsBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "match_play") {
      if (!match || match.status !== "final") return;

      // Match Play - hole-by-hole competition, first to be up by more than holes remaining wins
      const settlement = settleMatchPlayBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "best_ball" || bet.type === "scramble") {
      if (!match || match.status !== "final") return;

      // Best Ball/Scramble - team formats where team score is best among players or collective effort
      const settlement = settleBestBallScrambleBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "wolf") {
      if (!match || match.status !== "final") return;

      // Wolf - rotating partnership game with dynamic teams and point-based scoring
      const wolfSettlementMatch = attachMatchGameState(match, state?._gameState, "wolf");
      const settlement = settleWolfBet({ ...bet, selection: normalizedSelection }, wolfSettlementMatch);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "stableford") {
      if (!match || match.status !== "final") return;

      // Stableford - point-based scoring system based on score relative to par
      const settlement = settleStablefordBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "vegas") {
      if (!match || match.status !== "final") return;

      const settlement = settleVegasBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "banker") {
      if (!match || match.status !== "final") return;

      const settlement = settleBankerBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (bet.type === "bloodsome") {
      if (!match || match.status !== "final") return;

      const settlement = settleBloodsomeBet({ ...bet, selection: normalizedSelection }, match);
      if (settlement) {
        proposedStatus = settlement.status;
        proposedPayout = settlement.payout;
      }
    }

    if (proposedStatus) {
      const normalizedPayout = normalizeSettlementPayout(bet.stake, proposedStatus, proposedPayout);
      betsToSettle.push({
        ...bet,
        selection: normalizedSelection,
        proposedStatus,
        proposedPayout: normalizedPayout
      });
    }
  });

  // Validate and correct zero-sum compliance per market bucket before applying settlements.
  const correctedBets = buildCorrectedSettlementsByMarket(betsToSettle);
  const isValid = validateZeroSum(correctedBets);

  // Apply the settlements using corrected bets
  correctedBets.forEach(bet => {
    const originalBet = state.bets.find(b => b.id === bet.id);
    if (originalBet) {
      originalBet.status = bet.proposedStatus;
      originalBet.payout = normalizeDollars(bet.proposedPayout);
    }
  });

  // Return settlement summary
  return {
    settledCount: betsToSettle.length,
    isZeroSum: isValid,
    audit: auditZeroSum(state)
  };
}

// ---- Money Calculation Utilities (Integer Cents) -----------

/**
 * Convert dollars to integer cents to eliminate floating point errors
 * @param {number} dollars - Dollar amount (e.g., 10.50)
 * @returns {number} - Amount in cents (e.g., 1050)
 */
function dollarsToCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Convert integer cents back to dollars for display
 * @param {number} cents - Amount in cents (e.g., 1050)
 * @returns {number} - Dollar amount (e.g., 10.50)
 */
function centsToDollars(cents) {
  return cents / 100;
}

function normalizeDollars(amount) {
  return centsToDollars(dollarsToCents(Number(amount) || 0));
}

/**
 * Calculate payout in cents using integer arithmetic
 * @param {number} stakeCents - Stake amount in cents
 * @param {number} odds - Decimal odds (e.g., 1.8)
 * @returns {number} - Payout in cents
 */
function calculatePayoutCents(stakeCents, odds) {
  // Convert odds to avoid floating point multiplication
  const oddsInCents = Math.round(odds * 100);
  return Math.round((stakeCents * oddsInCents) / 100);
}

function normalizeSettlementPayout(stake, status, payout) {
  if (status === "lost") return 0;
  if (status === "push" || status === "void" || status === "voided") {
    return normalizeDollars(stake);
  }
  return normalizeDollars(payout);
}

/**
 * Allocate relative points/units into zero-sum money deltas.
 * Uses integer-cents math internally and preserves exact net 0.
 *
 * Example:
 * running {A:1, B:0, C:0}, unitStake=$10 =>
 * A:+$6.67, B:-$3.33, C:-$3.34 (sum exactly $0.00)
 *
 * @param {Object} running - Map of participant -> points/units
 * @param {number} unitStake - Dollar value per unit above/below average
 * @param {Array<string|Object>} participants - Participant names or player objects with `name`
 * @returns {Object} map of participant -> dollar delta (can include cents)
 */
export function allocateRelativeZeroSum(running = {}, unitStake = 0, participants = []) {
  const participantNames = (Array.isArray(participants) ? participants : [])
    .map((p) => (typeof p === "string" ? p : p?.name))
    .filter(Boolean);
  const names = participantNames.length > 0
    ? participantNames
    : Object.keys(running || {});

  const result = {};
  if (names.length === 0) return result;

  const stakeCents = dollarsToCents(Number(unitStake) || 0);
  if (stakeCents === 0) {
    names.forEach((name) => { result[name] = 0; });
    return result;
  }

  const n = names.length;
  const points = names.map((name) => {
    const value = Number(running?.[name]);
    return Number.isFinite(value) ? value : 0;
  });
  const totalPoints = points.reduce((sum, value) => sum + value, 0);

  const rows = names.map((name, idx) => {
    const numerator = (points[idx] * n - totalPoints) * stakeCents;
    const exactCents = numerator / n;
    const baseCents = exactCents >= 0 ? Math.floor(exactCents) : Math.ceil(exactCents);
    return {
      name,
      exactCents,
      cents: baseCents,
      fractional: exactCents - baseCents
    };
  });

  let residualCents = -rows.reduce((sum, row) => sum + row.cents, 0);
  if (residualCents !== 0) {
    const direction = residualCents > 0 ? 1 : -1;
    const ranked = [...rows].sort((a, b) => {
      const aPriority = direction > 0 ? a.fractional : -a.fractional;
      const bPriority = direction > 0 ? b.fractional : -b.fractional;
      if (bPriority !== aPriority) return bPriority - aPriority;
      return Math.abs(b.exactCents) - Math.abs(a.exactCents);
    });

    let idx = 0;
    let safety = 0;
    while (residualCents !== 0 && safety < 100000) {
      const target = ranked[idx % ranked.length];
      target.cents += direction;
      residualCents -= direction;
      idx++;
      safety++;
    }
  }

  rows.forEach((row) => {
    result[row.name] = centsToDollars(row.cents);
  });

  return result;
}

/**
 * Validate that a monetary amount is properly formatted in cents
 * @param {number} cents - Amount to validate
 * @returns {boolean} - True if valid integer cents amount
 */
function isValidCentsAmount(cents) {
  return Number.isInteger(cents) && cents >= 0;
}

// ---- Zero-Sum Audit & Validation Functions -----------------

/**
 * Audits settlement results to verify zero-sum compliance
 * @param {Object} state - Current game state with bets
 * @returns {Object} - Audit report with violations and details
 */
export function auditZeroSum(state) {
  const report = {
    isZeroSum: true,
    netFlow: 0,
    netFlowCents: 0,
    totalStakes: 0,
    totalStakesCents: 0,
    totalPayouts: 0,
    totalPayoutsCents: 0,
    violations: [],
    betTypeBreakdown: {}
  };

  let totalStakesCollectedCents = 0;
  let totalPayoutsIssuedCents = 0;

  // Group bets by type for detailed analysis
  const betsByType = {};

  state.bets.forEach(bet => {
    if (bet.status === "active") return; // Skip unsettled bets

    // Initialize bet type tracking
    if (!betsByType[bet.type]) {
      betsByType[bet.type] = {
        stakes: 0,
        stakesCents: 0,
        payouts: 0,
        payoutsCents: 0,
        netFlow: 0,
        netFlowCents: 0,
        count: 0
      };
    }

    const typeStats = betsByType[bet.type];
    typeStats.count++;
    const stakeCents = dollarsToCents(bet.stake);

    if (bet.status === "won") {
      const payoutCents = dollarsToCents(bet.payout);
      totalPayoutsIssuedCents += payoutCents;
      typeStats.payoutsCents += payoutCents;
      typeStats.stakesCents += stakeCents;
      totalStakesCollectedCents += stakeCents;
    } else if (bet.status === "lost") {
      totalStakesCollectedCents += stakeCents;
      typeStats.stakesCents += stakeCents;
    } else if (bet.status === "push" || bet.status === "void" || bet.status === "voided") {
      // Push should be neutral (stake returned)
      const payoutCents = dollarsToCents(bet.payout);
      totalStakesCollectedCents += stakeCents;
      totalPayoutsIssuedCents += payoutCents;
      typeStats.stakesCents += stakeCents;
      typeStats.payoutsCents += payoutCents;
    }
  });

  Object.values(betsByType).forEach((stats) => {
    stats.stakes = centsToDollars(stats.stakesCents);
    stats.payouts = centsToDollars(stats.payoutsCents);
    stats.netFlowCents = stats.payoutsCents - stats.stakesCents;
    stats.netFlow = centsToDollars(stats.netFlowCents);
  });

  report.totalStakesCents = totalStakesCollectedCents;
  report.totalPayoutsCents = totalPayoutsIssuedCents;
  report.totalStakes = centsToDollars(totalStakesCollectedCents);
  report.totalPayouts = centsToDollars(totalPayoutsIssuedCents);
  report.netFlowCents = totalPayoutsIssuedCents - totalStakesCollectedCents;
  report.netFlow = centsToDollars(report.netFlowCents);
  report.betTypeBreakdown = betsByType;

  // Check for violations using cents precision
  if (Math.abs(report.netFlowCents) > 0) { // Zero tolerance for cents-level violations
    report.isZeroSum = false;
    report.violations.push({
      type: "net_flow_violation",
      severity: "critical",
      amount: report.netFlow,
      amountCents: report.netFlowCents,
      description: `Total net flow is ${report.netFlowCents} cents ($${report.netFlow.toFixed(2)}), should be exactly $0.00`
    });
  }

  // Check each bet type for violations
  Object.entries(betsByType).forEach(([type, stats]) => {
    if (Math.abs(stats.netFlowCents) > 0) {
      report.violations.push({
        type: "bet_type_violation",
        severity: "high",
        betType: type,
        amount: stats.netFlow,
        amountCents: stats.netFlowCents,
        description: `${type} bets have net flow of ${stats.netFlowCents} cents ($${stats.netFlow.toFixed(2)})`
      });
    }
  });

  return report;
}

function getSettlementBucketKey(bet) {
  const matchKey = bet.matchId || bet.flightId || bet.eventId || "global";
  const componentKey =
    bet.component ||
    bet.format ||
    (bet.carryover ? "carryover" : "standard");
  return `${matchKey}::${bet.type}::${componentKey}`;
}

function buildCorrectedSettlementsByMarket(betsToSettle) {
  const grouped = new Map();
  betsToSettle.forEach((bet) => {
    const key = getSettlementBucketKey(bet);
    if (!grouped.has(key)) grouped.set(key, []);
    const normalizedPayout = normalizeSettlementPayout(bet.stake, bet.proposedStatus, bet.proposedPayout);
    grouped.get(key).push({
      ...bet,
      proposedPayout: normalizedPayout
    });
  });

  const corrected = [];
  grouped.forEach((group) => {
    corrected.push(...correctZeroSumViolations(group));
  });
  return corrected;
}

/**
 * Validates zero-sum compliance before settlement using cents precision
 * @param {Array} betsToSettle - Array of bets with proposed settlements
 * @returns {Boolean} - True if settlement maintains zero-sum
 */
export function validateZeroSum(betsToSettle) {
  let totalStakesCents = 0;
  let totalPayoutsCents = 0;

  betsToSettle.forEach(bet => {
    const stakeCents = dollarsToCents(bet.stake);
    totalStakesCents += stakeCents;

    if (bet.proposedStatus === "won") {
      const payoutCents = dollarsToCents(bet.proposedPayout || 0);
      totalPayoutsCents += payoutCents;
    } else if (bet.proposedStatus === "push" || bet.proposedStatus === "void" || bet.proposedStatus === "voided") {
      const payoutCents = dollarsToCents(bet.proposedPayout ?? bet.stake);
      totalPayoutsCents += payoutCents;
    }
    // Lost bets contribute stake but no payout
  });

  // Zero tolerance for cents-level discrepancies
  return totalPayoutsCents === totalStakesCents;
}

/**
 * Corrects zero-sum violations by proportionally adjusting winning payouts
 * Uses integer cents arithmetic to eliminate rounding errors
 * @param {Array} betsToSettle - Array of bets with proposed settlements
 * @returns {Array} - Corrected bets with adjusted payouts
 */
export function correctZeroSumViolations(betsToSettle) {
  let totalStakesCents = 0;
  let totalPayoutsCents = 0;

  const normalized = betsToSettle.map((bet) => {
    const stakeCents = dollarsToCents(bet.stake);
    const normalizedPayout = normalizeSettlementPayout(bet.stake, bet.proposedStatus, bet.proposedPayout);
    const payoutCents = dollarsToCents(normalizedPayout);
    totalStakesCents += stakeCents;
    totalPayoutsCents += payoutCents;
    return { ...bet, proposedPayout: normalizedPayout, stakeCents, payoutCents };
  });

  const netViolationCents = totalPayoutsCents - totalStakesCents;
  if (netViolationCents === 0) {
    return normalized.map(({ stakeCents, payoutCents, ...bet }) => ({
      ...bet,
      proposedPayout: centsToDollars(payoutCents)
    }));
  }

  // Prefer adjusting winning bets.
  let adjustable = normalized.filter(b => b.proposedStatus === "won");

  if (adjustable.length === 0) {
    // No winners means no one can receive redistributed loss pool.
    // For strict player zero-sum markets, refund stakes in this edge case.
    return normalized.map(({ stakeCents, payoutCents, ...bet }) => ({
      ...bet,
      proposedStatus: "push",
      proposedPayout: centsToDollars(stakeCents)
    }));
  }

  let remaining = netViolationCents;
  const totalWeight = adjustable.reduce((sum, b) => sum + Math.max(1, b.payoutCents || b.stakeCents), 0);

  adjustable.forEach((bet, index) => {
    const weight = Math.max(1, bet.payoutCents || bet.stakeCents);
    const rawShare = netViolationCents * (weight / totalWeight);
    const adjustment = index === adjustable.length - 1 ? remaining : Math.trunc(rawShare);
    remaining -= adjustment;
    bet.payoutCents = Math.max(0, bet.payoutCents - adjustment);
  });

  // Residual reconciliation in case clamping to zero prevented full correction.
  if (remaining !== 0 && adjustable.length > 0) {
    const payoutStep = remaining > 0 ? -1 : 1;
    let idx = 0;
    let safety = 0;
    while (remaining !== 0 && safety < 100000) {
      const target = adjustable[idx % adjustable.length];
      if (payoutStep < 0 && target.payoutCents <= 0) {
        idx++;
        safety++;
        continue;
      }
      target.payoutCents += payoutStep;
      remaining += payoutStep < 0 ? -1 : 1;
      idx++;
      safety++;
    }
  }

  // Hard stop: if we still cannot reconcile to exact cents, refund all stakes in this bucket.
  if (remaining !== 0) {
    return normalized.map(({ stakeCents, payoutCents, ...bet }) => ({
      ...bet,
      proposedStatus: "push",
      proposedPayout: centsToDollars(stakeCents)
    }));
  }

  return normalized.map(({ stakeCents, payoutCents, ...bet }) => ({
    ...bet,
    proposedPayout: centsToDollars(payoutCents)
  }));
}

/**
 * Test function to demonstrate current settlement violations
 * Creates a scenario with typical bets and shows zero-sum issues
 */
export function demonstrateSettlementViolations() {
  // Create a test state with sample bets
  const testState = {
    matches: {
      "match1": {
        teamA: "team1",
        teamB: "team2",
        scoreA: 3,
        scoreB: 2,
        status: "final"
      }
    },
    bets: [
      // Two opposite bets with different stakes and odds
      {
        id: "bet1",
        type: "match_winner",
        matchId: "match1",
        selection: "team1", // winner
        stake: 100,
        odds: 1.8,
        status: "active",
        payout: 0
      },
      {
        id: "bet2",
        type: "match_winner",
        matchId: "match1",
        selection: "team2", // loser
        stake: 200,
        odds: 2.1,
        status: "active",
        payout: 0
      }
    ]
  };

  console.log("\n=== SETTLEMENT VIOLATION DEMONSTRATION ===");
  console.log("Before settlement:");
  console.log(`Bet 1: $${testState.bets[0].stake} on team1 @ ${testState.bets[0].odds} odds`);
  console.log(`Bet 2: $${testState.bets[1].stake} on team2 @ ${testState.bets[1].odds} odds`);
  console.log(`Total stakes collected: $${testState.bets[0].stake + testState.bets[1].stake}`);

  // Settle using current logic
  settleBets(testState);

  console.log("\nAfter settlement:");
  testState.bets.forEach(bet => {
    console.log(`${bet.id}: ${bet.status}, payout: $${bet.payout}`);
  });

  // Audit the results
  const audit = auditZeroSum(testState);
  console.log("\nZero-sum audit results:");
  console.log(`Total stakes collected: $${audit.totalStakes}`);
  console.log(`Total payouts issued: $${audit.totalPayouts}`);
  console.log(`Net flow (should be $0): $${audit.netFlow.toFixed(2)}`);
  console.log(`Zero-sum compliant: ${audit.isZeroSum}`);

  if (audit.violations.length > 0) {
    console.log("\nViolations found:");
    audit.violations.forEach(v => console.log(`- ${v.description}`));
  }

  return audit;
}

// ---- Nassau Bet Type Implementation -------------------------

/**
 * Nassau bet settlement - handles front 9, back 9, and overall bets
 * @param {Object} bet - Nassau bet object
 * @param {Object} match - Match object with hole-by-hole scores
 * @returns {Object} - Settlement result with status and payout
 */
function settleNassauBet(bet, match) {
  // Nassau bet should have these fields:
  // - component: "front9", "back9", "overall", "press_front", "press_back", "press_overall"
  // - selection: teamA or teamB
  // - pressTriggered: boolean indicating if this is a press bet

  if (!match.holeScores || !bet.component) {
    console.warn("[Nassau] Missing hole scores or component data");
    return null;
  }

  const component = bet.component;
  const selection = bet.selection;

  let componentResult = null;

  if (component === "front9" || component === "press_front") {
    componentResult = calculateNassauComponent(match, "front9");
  } else if (component === "back9" || component === "press_back") {
    componentResult = calculateNassauComponent(match, "back9");
  } else if (component === "overall" || component === "press_overall") {
    componentResult = calculateNassauComponent(match, "overall");
  } else {
    console.warn(`[Nassau] Unknown component: ${component}`);
    return null;
  }

  if (!componentResult) return null;

  // Determine bet outcome
  let status = "lost";
  let payout = 0;

  if (componentResult.winner === selection) {
    status = "won";
    const stakeCents = dollarsToCents(bet.stake);
    const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
    payout = centsToDollars(payoutCents);
  } else if (componentResult.winner === null) {
    status = "push";
    payout = bet.stake; // Return stake
  }

  return { status, payout };
}

/**
 * Calculate Nassau component results (front9, back9, or overall)
 * @param {Object} match - Match with hole-by-hole scores
 * @param {string} component - "front9", "back9", or "overall"
 * @returns {Object} - Component result with winner and margin
 */
function calculateNassauComponent(match, component) {
  if (!match.holeScores) return null;

  let holes = [];
  if (component === "front9") {
    holes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  } else if (component === "back9") {
    holes = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  } else if (component === "overall") {
    holes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  }

  let teamAHoleWins = 0;
  let teamBHoleWins = 0;
  let tiedHoles = 0;
  let holesCompleted = 0;
  let decidedEarly = false;

  holes.forEach(holeNumber => {
    const holeData = match.holeScores[holeNumber];
    if (holeData && holeData.scoreA !== null && holeData.scoreB !== null) {
      if (holeData.scoreA < holeData.scoreB) {
        teamAHoleWins++;
      } else if (holeData.scoreB < holeData.scoreA) {
        teamBHoleWins++;
      } else {
        tiedHoles++;
      }
      holesCompleted++;

      const holesRemaining = holes.length - holesCompleted;
      if (Math.abs(teamAHoleWins - teamBHoleWins) > holesRemaining) {
        decidedEarly = true;
      }
    }
  });

  if (holesCompleted === 0) {
    return null; // Not ready to settle
  }

  if (!decidedEarly && holesCompleted < holes.length) {
    return null;
  }

  let winner = null;
  if (teamAHoleWins > teamBHoleWins) {
    winner = match.teamA;
  } else if (teamBHoleWins > teamAHoleWins) {
    winner = match.teamB;
  }
  // If hole wins are equal, winner remains null (tie/push)

  return {
    winner,
    teamAHoleWins,
    teamBHoleWins,
    tiedHoles,
    holesCompleted,
    holesTotal: holes.length,
    margin: Math.abs(teamAHoleWins - teamBHoleWins),
    component,
    decidedEarly
  };
}

/**
 * Check if auto-press should be triggered for Nassau bets
 * @param {Object} match - Match with current hole scores
 * @param {string} component - "front9", "back9", or "overall"
 * @param {number} pressThreshold - Holes down to trigger press (default: 2)
 * @returns {Object} - Press recommendation with trigger info
 */
export function checkNassauAutoPress(match, component, pressThreshold = 2) {
  const componentResult = calculateNassauComponent(match, component);
  if (!componentResult) return { shouldPress: false };

  const margin = componentResult.margin;
  const holesRemaining = getHolesRemaining(match, component);

  // Auto-press triggers when down by pressThreshold and still possible to win
  if (margin >= pressThreshold && holesRemaining >= margin) {
    return {
      shouldPress: true,
      component,
      margin,
      holesRemaining,
      leadingTeam: componentResult.winner,
      trailingTeam: componentResult.winner === match.teamA ? match.teamB : match.teamA
    };
  }

  return { shouldPress: false };
}

/**
 * Get number of holes remaining for a Nassau component
 * @param {Object} match - Match with hole scores
 * @param {string} component - "front9", "back9", or "overall"
 * @returns {number} - Holes remaining
 */
function getHolesRemaining(match, component) {
  let totalHoles = 0;
  let completedHoles = 0;

  if (component === "front9") {
    totalHoles = 9;
    for (let hole = 1; hole <= 9; hole++) {
      if (match.holeScores[hole] &&
          match.holeScores[hole].scoreA !== null &&
          match.holeScores[hole].scoreB !== null) {
        completedHoles++;
      }
    }
  } else if (component === "back9") {
    totalHoles = 9;
    for (let hole = 10; hole <= 18; hole++) {
      if (match.holeScores[hole] &&
          match.holeScores[hole].scoreA !== null &&
          match.holeScores[hole].scoreB !== null) {
        completedHoles++;
      }
    }
  } else if (component === "overall") {
    totalHoles = 18;
    for (let hole = 1; hole <= 18; hole++) {
      if (match.holeScores[hole] &&
          match.holeScores[hole].scoreA !== null &&
          match.holeScores[hole].scoreB !== null) {
        completedHoles++;
      }
    }
  }

  return totalHoles - completedHoles;
}

// ---- Skins Bet Type Implementation ---------------------------

/**
 * Skins bet settlement - each hole is worth a skin, lowest score wins
 * @param {Object} bet - Skins bet object
 * @param {Object} match - Match object with hole-by-hole scores
 * @returns {Object} - Settlement result with status and payout
 */
function settleSkinsBet(bet, match) {
  // Skins bet should have these fields:
  // - selection: teamA or teamB (who the bet is on)
  // - carryover: boolean (true for carryover variant, false for no-carryover)
  // - skinValue: value per skin (defaults to stake / 18)

  if (!match.holeScores) {
    console.warn("[Skins] Missing hole scores data");
    return null;
  }

  const skinsResult = calculateSkinsResult(match, bet.carryover || false);
  const selection = bet.selection;

  // Determine payout based on skins won
  const skinsWon = skinsResult.skinsWon[selection] || 0;
  const totalSkins = skinsResult.totalSkinsAwarded;

  let status = "lost";
  let payout = 0;

  if (skinsWon > 0) {
    status = "won";

    // Calculate payout: (skins won / total skins) * total pot
    // In skins betting, total pot = stake * number of players * holes played
    const skinValue = bet.skinValue || (bet.stake / 18); // Default skin value
    const totalPayout = skinsWon * skinValue;

    const stakeCents = dollarsToCents(bet.stake);
    const payoutCents = dollarsToCents(totalPayout);
    payout = centsToDollars(payoutCents);
  }
  // If no skins won, status remains "lost" with payout = 0

  return { status, payout };
}

/**
 * Calculate skins results for a match
 * @param {Object} match - Match with hole-by-hole scores
 * @param {boolean} carryover - Whether ties carry over to next hole
 * @returns {Object} - Skins calculation result
 */
function calculateSkinsResult(match, carryover = false) {
  if (!match.holeScores) return null;

  const skinsWon = {
    [match.teamA]: 0,
    [match.teamB]: 0
  };

  let carryoverValue = 1; // How many skins are at stake for current hole
  let totalSkinsAwarded = 0;
  const holeResults = [];

  // Process each hole
  for (let hole = 1; hole <= 18; hole++) {
    const holeData = match.holeScores[hole];

    if (!holeData || holeData.scoreA === null || holeData.scoreB === null) {
      // Hole not completed yet
      continue;
    }

    const scoreA = holeData.scoreA;
    const scoreB = holeData.scoreB;
    let holeWinner = null;
    let skinsAwarded = 0;

    if (scoreA < scoreB) {
      // Team A wins this hole
      holeWinner = match.teamA;
      skinsWon[match.teamA] += carryoverValue;
      skinsAwarded = carryoverValue;
      totalSkinsAwarded += carryoverValue;
      carryoverValue = 1; // Reset carryover
    } else if (scoreB < scoreA) {
      // Team B wins this hole
      holeWinner = match.teamB;
      skinsWon[match.teamB] += carryoverValue;
      skinsAwarded = carryoverValue;
      totalSkinsAwarded += carryoverValue;
      carryoverValue = 1; // Reset carryover
    } else {
      // Tie on this hole
      if (carryover) {
        carryoverValue++; // Skin carries over to next hole
        skinsAwarded = 0;
      } else {
        // No carryover - skin is lost
        skinsAwarded = 0;
        carryoverValue = 1; // Reset for next hole
      }
    }

    holeResults.push({
      hole,
      scoreA,
      scoreB,
      winner: holeWinner,
      skinsAwarded,
      carryoverValue: carryover ? carryoverValue : 1
    });
  }

  return {
    skinsWon,
    totalSkinsAwarded,
    holeResults,
    carryoverUsed: carryover
  };
}

/**
 * Calculate skins odds based on player handicaps and hole difficulty
 * @param {Object} teamA - Team A data with handicaps
 * @param {Object} teamB - Team B data with handicaps
 * @param {Array} holes - Array of hole data with difficulty
 * @returns {Object} - Skins odds for each team
 */
export function calculateSkinsOdds(teamA, teamB, holes = null) {
  // For skins, each hole is independent, so we need to calculate
  // the probability of winning each hole and aggregate

  const handicapA = teamA.totalHandicap || 0;
  const handicapB = teamB.totalHandicap || 0;
  const handicapDiff = handicapA - handicapB;

  // Use simplified model: better player (lower handicap) has advantage
  let probAWinsHole = 0.5; // Base probability

  if (handicapDiff > 0) {
    // Team A has higher handicap (worse), Team B favored
    probAWinsHole = Math.max(0.1, 0.5 - (handicapDiff * 0.02));
  } else if (handicapDiff < 0) {
    // Team A has lower handicap (better), Team A favored
    probAWinsHole = Math.min(0.9, 0.5 + (Math.abs(handicapDiff) * 0.02));
  }

  const probBWinsHole = 1 - probAWinsHole;

  // Convert probabilities to odds
  const oddsA = probAWinsHole > 0 ? (1 / probAWinsHole) : 10.0;
  const oddsB = probBWinsHole > 0 ? (1 / probBWinsHole) : 10.0;

  return {
    [teamA.id]: oddsA,
    [teamB.id]: oddsB,
    probA: probAWinsHole,
    probB: probBWinsHole
  };
}

// ---- Match Play Bet Type Implementation ----------------------

/**
 * Match Play bet settlement - hole-by-hole competition format
 * @param {Object} bet - Match Play bet object
 * @param {Object} match - Match object with hole-by-hole scores
 * @returns {Object} - Settlement result with status and payout
 */
function settleMatchPlayBet(bet, match) {
  // Match Play bet should have these fields:
  // - selection: teamA or teamB (who the bet is on)
  // - format: "1v1" or "team" (individual or team match play)

  if (!match.holeScores) {
    console.warn("[Match Play] Missing hole scores data");
    return null;
  }

  const matchPlayResult = calculateMatchPlayResult(match);
  const selection = bet.selection;

  let status = "lost";
  let payout = 0;

  if (matchPlayResult.winner === selection) {
    status = "won";
    const stakeCents = dollarsToCents(bet.stake);
    const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
    payout = centsToDollars(payoutCents);
  } else if (matchPlayResult.winner === null) {
    status = "push";
    payout = bet.stake; // Return stake for tied match
  }

  return { status, payout };
}

/**
 * Calculate Match Play result - hole-by-hole scoring
 * @param {Object} match - Match with hole-by-hole scores
 * @returns {Object} - Match Play result with winner and hole-by-hole breakdown
 */
function calculateMatchPlayResult(match) {
  if (!match.holeScores) return null;

  let teamAHoles = 0; // Holes won by team A
  let teamBHoles = 0; // Holes won by team B
  let tiedHoles = 0;
  const holeResults = [];
  let decidedEarly = false;
  let lastScoredHole = 0;

  // Process each hole
  for (let hole = 1; hole <= 18; hole++) {
    const holeData = match.holeScores[hole];

    if (!holeData || holeData.scoreA === null || holeData.scoreB === null) {
      // Hole not completed yet
      continue;
    }

    const scoreA = holeData.scoreA;
    const scoreB = holeData.scoreB;
    let holeWinner = null;

    if (scoreA < scoreB) {
      teamAHoles++;
      holeWinner = match.teamA;
    } else if (scoreB < scoreA) {
      teamBHoles++;
      holeWinner = match.teamB;
    } else {
      tiedHoles++;
      // Tied holes don't count toward either side in match play
    }

    holeResults.push({
      hole,
      scoreA,
      scoreB,
      winner: holeWinner
    });
    lastScoredHole = hole;

    // Check for early finish (dormie situation)
    const holesRemaining = 18 - hole;
    const holesDifference = Math.abs(teamAHoles - teamBHoles);

    if (holesDifference > holesRemaining) {
      // Match is decided - one team cannot catch up
      decidedEarly = true;
      break;
    }
  }

  // Determine overall winner
  let matchWinner = null;
  const isFullRound = lastScoredHole >= 18;
  if (decidedEarly || isFullRound) {
    if (teamAHoles > teamBHoles) {
      matchWinner = match.teamA;
    } else if (teamBHoles > teamAHoles) {
      matchWinner = match.teamB;
    }
  }
  // If equal holes won, matchWinner remains null (all square/tied)

  return {
    winner: matchWinner,
    teamAHoles,
    teamBHoles,
    tiedHoles,
    margin: Math.abs(teamAHoles - teamBHoles),
    format: `${teamAHoles} & ${teamBHoles}`,
    holeResults,
    holesCompleted: holeResults.length,
    decidedEarly,
    isFinalResult: decidedEarly || isFullRound
  };
}

/**
 * Calculate Match Play odds based on player handicaps and format
 * @param {Object} teamA - Team A data with handicaps
 * @param {Object} teamB - Team B data with handicaps
 * @param {string} format - "1v1" or "team"
 * @returns {Object} - Match Play odds for each team
 */
export function calculateMatchPlayOdds(teamA, teamB, format = "1v1") {
  const handicapA = teamA.totalHandicap || 0;
  const handicapB = teamB.totalHandicap || 0;
  const handicapDiff = handicapA - handicapB;

  // In match play, handicap strokes are given on specific holes
  // This affects the probability of winning individual holes
  let probAWins = 0.5; // Base probability

  if (format === "1v1") {
    // Individual match play - direct handicap comparison
    if (handicapDiff > 0) {
      // Team A gets strokes, improves their chances
      probAWins = Math.min(0.85, 0.5 + (handicapDiff * 0.025));
    } else if (handicapDiff < 0) {
      // Team B gets strokes, Team A's chances decrease
      probAWins = Math.max(0.15, 0.5 + (handicapDiff * 0.025));
    }
  } else if (format === "team") {
    // Team match play - more complex, use average handicap effect
    const avgHandicapDiff = handicapDiff / (teamA.players?.length || 1);
    probAWins = Math.max(0.15, Math.min(0.85, 0.5 + (avgHandicapDiff * 0.02)));
  }

  const probBWins = 1 - probAWins;

  // Convert to odds
  const oddsA = probAWins > 0 ? (1 / probAWins) : 10.0;
  const oddsB = probBWins > 0 ? (1 / probBWins) : 10.0;

  return {
    [teamA.id]: oddsA,
    [teamB.id]: oddsB,
    probA: probAWins,
    probB: probBWins,
    format
  };
}

/**
 * Check Match Play status during round (for live updates)
 * @param {Object} match - Match with current hole scores
 * @returns {Object} - Current match play status
 */
export function getMatchPlayStatus(match) {
  const result = calculateMatchPlayResult(match);
  if (!result) return { status: "in_progress", holesCompleted: 0 };

  const holesCompleted = result.holeResults.length;
  const holesRemaining = 18 - holesCompleted;
  const margin = result.margin;

  let status = "in_progress";
  if (result.winner) {
    status = holesRemaining === 0 ? "final" : "dormie"; // Dormie = decided early
  } else if (holesRemaining === 0) {
    status = "final"; // All square after 18
  }

  return {
    status,
    winner: result.winner,
    teamAHoles: result.teamAHoles,
    teamBHoles: result.teamBHoles,
    margin,
    holesCompleted,
    holesRemaining,
    canFinishEarly: margin > holesRemaining
  };
}

// ---- Best Ball/Scramble Bet Type Implementation -------------

/**
 * Best Ball/Scramble bet settlement - team-based scoring formats
 * @param {Object} bet - Best Ball or Scramble bet object
 * @param {Object} match - Match object with team scores (best ball calculated)
 * @returns {Object} - Settlement result with status and payout
 */
function settleBestBallScrambleBet(bet, match) {
  // Best Ball/Scramble bets should have these fields:
  // - selection: teamA or teamB (which team the bet is on)
  // - format: "best_ball" or "scramble"

  if (!match.teamScores && !match.holeScores) {
    console.warn("[Best Ball/Scramble] Missing team scores or hole scores data");
    return null;
  }

  const teamResult = calculateTeamFormatResult(match, bet.type);
  const selection = bet.selection;

  let status = "lost";
  let payout = 0;

  if (teamResult.winner === selection) {
    status = "won";
    const stakeCents = dollarsToCents(bet.stake);
    const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
    payout = centsToDollars(payoutCents);
  } else if (teamResult.winner === null) {
    status = "push";
    payout = bet.stake; // Return stake for tied match
  }

  return { status, payout };
}

/**
 * Calculate team format results (Best Ball or Scramble)
 * @param {Object} match - Match with team scores or individual hole scores
 * @param {string} format - "best_ball" or "scramble"
 * @returns {Object} - Team format result with winner and scores
 */
function calculateTeamFormatResult(match, format) {
  let teamATotal = 0;
  let teamBTotal = 0;

  if (match.teamScores) {
    // Use pre-calculated team scores
    teamATotal = match.teamScores.teamA || 0;
    teamBTotal = match.teamScores.teamB || 0;
  } else if (match.holeScores) {
    // Calculate team scores from hole-by-hole data
    for (let hole = 1; hole <= 18; hole++) {
      const holeData = match.holeScores[hole];
      if (!holeData) continue;

      if (format === "best_ball") {
        // Best Ball: take the best (lowest) score from each team
        const teamAHoleScore = calculateBestBallHoleScore(holeData.playersA || [holeData.scoreA]);
        const teamBHoleScore = calculateBestBallHoleScore(holeData.playersB || [holeData.scoreB]);

        if (teamAHoleScore !== null) teamATotal += teamAHoleScore;
        if (teamBHoleScore !== null) teamBTotal += teamBHoleScore;
      } else if (format === "scramble") {
        // Scramble: team posts one collective score per hole
        if (holeData.teamScoreA !== null) teamATotal += holeData.teamScoreA;
        if (holeData.teamScoreB !== null) teamBTotal += holeData.teamScoreB;
      }
    }
  } else {
    console.warn(`[${format}] Insufficient scoring data`);
    return null;
  }

  // Determine winner (lowest total score wins in golf)
  let winner = null;
  if (teamATotal < teamBTotal) {
    winner = match.teamA;
  } else if (teamBTotal < teamATotal) {
    winner = match.teamB;
  }
  // If scores are equal, winner remains null (tie)

  return {
    winner,
    teamATotal,
    teamBTotal,
    margin: Math.abs(teamATotal - teamBTotal),
    format
  };
}

/**
 * Calculate best ball score for a hole (lowest among team members)
 * @param {Array} playerScores - Array of individual player scores for the hole
 * @returns {number|null} - Best (lowest) score, or null if no valid scores
 */
function calculateBestBallHoleScore(playerScores) {
  if (!Array.isArray(playerScores) || playerScores.length === 0) {
    return null;
  }

  const validScores = playerScores.filter(score => score !== null && score !== undefined && score > 0);

  if (validScores.length === 0) {
    return null;
  }

  return Math.min(...validScores);
}

/**
 * Calculate Best Ball/Scramble odds based on team composition and handicaps
 * @param {Object} teamA - Team A with player data
 * @param {Object} teamB - Team B with player data
 * @param {string} format - "best_ball" or "scramble"
 * @returns {Object} - Odds for each team
 */
export function calculateTeamFormatOdds(teamA, teamB, format = "best_ball") {
  const playersA = teamA.players || [teamA];
  const playersB = teamB.players || [teamB];

  let teamAAdvantage = 0;
  let teamBAdvantage = 0;

  if (format === "best_ball") {
    // Best Ball: lower handicaps have bigger impact
    const avgHandicapA = playersA.reduce((sum, p) => sum + (p.handicap || 0), 0) / playersA.length;
    const avgHandicapB = playersB.reduce((sum, p) => sum + (p.handicap || 0), 0) / playersB.length;

    // Team with more players and lower average handicap has advantage
    const playerCountFactor = (playersA.length - playersB.length) * 0.5;
    const handicapFactor = (avgHandicapB - avgHandicapA) * 0.03;

    teamAAdvantage = playerCountFactor + handicapFactor;
  } else if (format === "scramble") {
    // Scramble: teamwork and player count matter more
    const teamASkill = Math.max(...playersA.map(p => 20 - (p.handicap || 10)));
    const teamBSkill = Math.max(...playersB.map(p => 20 - (p.handicap || 10)));

    teamAAdvantage = (teamASkill - teamBSkill) * 0.02 + (playersA.length - playersB.length) * 0.3;
  }

  const probAWins = Math.max(0.15, Math.min(0.85, 0.5 + teamAAdvantage));
  const probBWins = 1 - probAWins;

  const oddsA = probAWins > 0 ? (1 / probAWins) : 10.0;
  const oddsB = probBWins > 0 ? (1 / probBWins) : 10.0;

  return {
    [teamA.id]: oddsA,
    [teamB.id]: oddsB,
    probA: probAWins,
    probB: probBWins,
    format
  };
}

// ---- Wolf Bet Type Implementation ----------------------------

/**
 * Wolf bet settlement - rotating partnership game with point-based scoring
 * @param {Object} bet - Wolf bet object
 * @param {Object} match - Match object with wolf-specific hole data
 * @returns {Object} - Settlement result with status and payout
 */
function settleWolfBet(bet, match) {
  // Wolf bet should have these fields:
  // - selection: playerId (which player the bet is on)
  // - pointValue: value per point (defaults to stake / expected total points)
  const players = Array.isArray(match?.players) ? match.players : [];
  const wolfState = getMatchGameState(match, "wolf");
  let running = normalizeWolfRunningMap(wolfState?.running);

  // Worker persists wolf outcomes as wolf.results; derive running scores for settlement.
  if (Object.keys(running).length === 0 && wolfState?.results) {
    running = deriveWolfRunningFromResults(wolfState.results, players);
  }

  // Backward-compatible fallback for legacy fixtures.
  if (Object.keys(running).length === 0 && match?.wolfHoles && players.length === 4) {
    const wolfResult = calculateWolfResult(match);
    running = normalizeWolfRunningMap(wolfResult?.playerPoints);
  }

  const entries = Object.entries(running).filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) {
    console.warn("[Wolf] Missing wolf settlement data (running/results/wolfHoles)");
    return null;
  }

  const maxScore = Math.max(...entries.map(([, value]) => value));
  const leaders = entries.filter(([, value]) => value === maxScore).map(([name]) => name);
  const canonicalMap = buildWolfIdentityCanonicalMap(players);
  const selectedIdentity = canonicalWolfIdentity(bet.selection, canonicalMap);
  const selectedIsLeader = leaders.some((name) => canonicalWolfIdentity(name, canonicalMap) === selectedIdentity);

  if (leaders.length !== 1) {
    if (selectedIsLeader) return { status: "push", payout: bet.stake };
    return { status: "lost", payout: 0 };
  }

  if (selectedIsLeader) {
    return { status: "won", payout: getPayoutForWin(bet) };
  }

  return { status: "lost", payout: 0 };
}

/**
 * Calculate Wolf game result with point-based scoring
 * @param {Object} match - Match with wolf hole data and 4 players
 * @returns {Object} - Wolf result with points per player
 */
function calculateWolfResult(match) {
  const players = match.players; // Should be array of 4 player objects
  const playerPoints = {};
  const holeResults = [];

  // Initialize player points
  players.forEach(player => {
    playerPoints[player.id] = 0;
  });

  // Process each hole
  for (let hole = 1; hole <= 18; hole++) {
    const wolfHoleData = match.wolfHoles[hole];
    if (!wolfHoleData || !wolfHoleData.wolfPlayerId) {
      continue; // Skip if wolf data is incomplete
    }

    const holeResult = calculateWolfHoleResult(wolfHoleData, players);
    if (holeResult) {
      // Award points based on hole result
      Object.entries(holeResult.pointsAwarded).forEach(([playerId, points]) => {
        playerPoints[playerId] += points;
      });

      holeResults.push({
        hole,
        ...holeResult
      });
    }
  }

  return {
    playerPoints,
    holeResults,
    totalPointsAwarded: Object.values(playerPoints).reduce((sum, points) => sum + points, 0)
  };
}

/**
 * Calculate Wolf points for a single hole
 * @param {Object} wolfHoleData - Hole data with wolf, partnerships, and scores
 * @param {Array} players - Array of 4 player objects
 * @returns {Object} - Hole result with points awarded
 */
function calculateWolfHoleResult(wolfHoleData, players) {
  const {
    wolfPlayerId,
    partnerPlayerId, // null if wolf goes solo
    playerScores, // { playerId: score }
    pointValues = { team: 1, solo: 2 } // Default point values
  } = wolfHoleData;

  const scores = Object.entries(playerScores).map(([playerId, score]) => ({
    playerId,
    score
  })).sort((a, b) => a.score - b.score);

  const pointsAwarded = {};
  players.forEach(player => {
    pointsAwarded[player.id] = 0;
  });

  if (partnerPlayerId === null || partnerPlayerId === undefined) {
    // Wolf went solo (1 vs 3)
    const wolfScore = playerScores[wolfPlayerId];
    const wolfIsLowest = scores[0].playerId === wolfPlayerId;

    if (wolfIsLowest) {
      // Wolf wins solo - gets solo points
      pointsAwarded[wolfPlayerId] = pointValues.solo || 2;
    } else {
      // Wolf loses solo - other three players each get team points
      players.forEach(player => {
        if (player.id !== wolfPlayerId) {
          pointsAwarded[player.id] = pointValues.team || 1;
        }
      });
    }
  } else {
    // Wolf has partner (2 vs 2)
    const wolfScore = playerScores[wolfPlayerId];
    const partnerScore = playerScores[partnerPlayerId];
    const wolfTeamBestScore = Math.min(wolfScore, partnerScore);

    // Find best score from the other two players
    const otherPlayers = players.filter(p => p.id !== wolfPlayerId && p.id !== partnerPlayerId);
    const otherTeamBestScore = Math.min(...otherPlayers.map(p => playerScores[p.id]));

    if (wolfTeamBestScore < otherTeamBestScore) {
      // Wolf team wins
      pointsAwarded[wolfPlayerId] = pointValues.team || 1;
      pointsAwarded[partnerPlayerId] = pointValues.team || 1;
    } else if (otherTeamBestScore < wolfTeamBestScore) {
      // Other team wins
      otherPlayers.forEach(player => {
        pointsAwarded[player.id] = pointValues.team || 1;
      });
    }
    // Tie = no points awarded
  }

  return {
    wolfPlayerId,
    partnerPlayerId,
    pointsAwarded,
    scores,
    format: partnerPlayerId ? "2v2" : "1v3"
  };
}

/**
 * Calculate Wolf odds for a player to accumulate points over 18 holes
 * @param {Array} players - Array of 4 player objects with handicaps
 * @param {number} holesAsWolf - Number of holes this player will be wolf (typically 4-5)
 * @returns {Object} - Odds for each player
 */
export function calculateWolfOdds(players, holesAsWolf = 4.5) {
  if (players.length !== 4) {
    throw new Error("Wolf requires exactly 4 players");
  }

  const playerOdds = {};

  players.forEach(player => {
    const handicap = player.handicap || 10;

    // Lower handicap players have better odds
    // Factor in: skill level, holes as wolf (more opportunities)
    const skillFactor = Math.max(0.1, (30 - handicap) / 30); // 0.1 to 1.0
    const wolfOpportunityFactor = holesAsWolf / 18; // Proportion of holes as wolf

    // Base probability of winning points
    let baseProb = skillFactor * 0.6 + wolfOpportunityFactor * 0.4;
    baseProb = Math.max(0.15, Math.min(0.85, baseProb));

    const odds = 1 / baseProb;

    playerOdds[player.id] = {
      odds,
      probability: baseProb,
      skillFactor,
      wolfOpportunityFactor
    };
  });

  return playerOdds;
}

/**
 * Generate Wolf rotation schedule for 18 holes with 4 players
 * @param {Array} players - Array of 4 player objects
 * @returns {Array} - Array of 18 hole objects with wolf assignments
 */
export function generateWolfRotation(players) {
  if (players.length !== 4) {
    throw new Error("Wolf requires exactly 4 players");
  }

  const rotation = [];

  for (let hole = 1; hole <= 18; hole++) {
    const wolfIndex = (hole - 1) % 4;
    const wolfPlayer = players[wolfIndex];

    rotation.push({
      hole,
      wolfPlayerId: wolfPlayer.id,
      wolfPlayerName: wolfPlayer.name,
      wolfOrder: Math.floor((hole - 1) / 4) + 1 // Which round of wolf rotation (1-5)
    });
  }

  return rotation;
}

// ---- Stableford Bet Type Implementation ----------------------

/**
 * Stableford bet settlement - point-based scoring relative to par
 * @param {Object} bet - Stableford bet object
 * @param {Object} match - Match object with hole scores and par data
 * @returns {Object} - Settlement result with status and payout
 */
function settleStablefordBet(bet, match) {
  // Stableford bet should have these fields:
  // - selection: teamA or teamB (which player/team the bet is on)
  // - format: "individual" or "team" (individual stableford or team stableford)

  if (!match.holeScores || !match.coursePar) {
    console.warn("[Stableford] Missing hole scores or course par data");
    return null;
  }

  const stablefordResult = calculateStablefordResult(match, bet.format || "individual");
  const selection = bet.selection;

  let status = "lost";
  let payout = 0;

  if (stablefordResult.winner === selection) {
    status = "won";
    const stakeCents = dollarsToCents(bet.stake);
    const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
    payout = centsToDollars(payoutCents);
  } else if (stablefordResult.winner === null) {
    status = "push";
    payout = bet.stake; // Return stake for tied score
  }

  return { status, payout };
}

/**
 * Calculate Stableford points result
 * @param {Object} match - Match with hole scores and course par
 * @param {string} format - "individual" or "team"
 * @returns {Object} - Stableford result with winner and point breakdown
 */
function calculateStablefordResult(match, format = "individual") {
  let teamAPoints = 0;
  let teamBPoints = 0;
  const holeResults = [];

  for (let hole = 1; hole <= 18; hole++) {
    const holeData = match.holeScores[hole];
    const holePar = match.coursePar[hole] || 4; // Default to par 4 if missing

    if (!holeData) continue;

    if (format === "individual") {
      // Individual Stableford
      const pointsA = calculateStablefordPoints(holeData.scoreA, holePar);
      const pointsB = calculateStablefordPoints(holeData.scoreB, holePar);

      teamAPoints += pointsA;
      teamBPoints += pointsB;

      holeResults.push({
        hole,
        par: holePar,
        scoreA: holeData.scoreA,
        scoreB: holeData.scoreB,
        pointsA,
        pointsB
      });

    } else if (format === "team") {
      // Team Stableford (best ball stableford or combined)
      let teamAHolePoints = 0;
      let teamBHolePoints = 0;

      if (holeData.playersA && Array.isArray(holeData.playersA)) {
        // Multiple players per team - use best stableford score
        teamAHolePoints = Math.max(...holeData.playersA.map(score =>
          calculateStablefordPoints(score, holePar)
        ));
      } else {
        teamAHolePoints = calculateStablefordPoints(holeData.scoreA, holePar);
      }

      if (holeData.playersB && Array.isArray(holeData.playersB)) {
        teamBHolePoints = Math.max(...holeData.playersB.map(score =>
          calculateStablefordPoints(score, holePar)
        ));
      } else {
        teamBHolePoints = calculateStablefordPoints(holeData.scoreB, holePar);
      }

      teamAPoints += teamAHolePoints;
      teamBPoints += teamBHolePoints;

      holeResults.push({
        hole,
        par: holePar,
        teamAPoints: teamAHolePoints,
        teamBPoints: teamBHolePoints
      });
    }
  }

  // Determine winner (highest points wins in Stableford)
  let winner = null;
  if (teamAPoints > teamBPoints) {
    winner = match.teamA;
  } else if (teamBPoints > teamAPoints) {
    winner = match.teamB;
  }
  // If points are equal, winner remains null (tie)

  return {
    winner,
    teamAPoints,
    teamBPoints,
    margin: Math.abs(teamAPoints - teamBPoints),
    holeResults,
    format
  };
}

/**
 * Calculate Stableford points for a single hole score
 * @param {number} score - Player's score on the hole
 * @param {number} par - Par for the hole
 * @returns {number} - Stableford points earned
 */
function calculateStablefordPoints(score, par) {
  if (score === null || score === undefined) {
    return 0; // No score = no points
  }

  const scoreToPar = score - par;

  if (scoreToPar <= -2) {
    // Eagle or better
    return 4;
  } else if (scoreToPar === -1) {
    // Birdie
    return 3;
  } else if (scoreToPar === 0) {
    // Par
    return 2;
  } else if (scoreToPar === 1) {
    // Bogey
    return 1;
  } else {
    // Double bogey or worse
    return 0;
  }
}

/**
 * Calculate Stableford odds based on player handicaps and course difficulty
 * @param {Object} teamA - Player/team A data
 * @param {Object} teamB - Player/team B data
 * @param {Object} courseData - Course par and difficulty data
 * @returns {Object} - Stableford odds for each team
 */
export function calculateStablefordOdds(teamA, teamB, courseData = null) {
  const handicapA = teamA.handicap || teamA.totalHandicap || 10;
  const handicapB = teamB.handicap || teamB.totalHandicap || 10;

  // In Stableford, players get strokes based on handicap
  // Better players (lower handicap) have natural advantage
  // But handicap strokes help level the field more than in stroke play

  const handicapDiff = handicapA - handicapB;

  // Stableford tends to compress scoring differences
  let probAWins = 0.5;

  if (handicapDiff > 0) {
    // Team A has higher handicap, gets more strokes
    // In Stableford, this helps more than in stroke play
    probAWins = Math.min(0.80, 0.5 + (handicapDiff * 0.035));
  } else if (handicapDiff < 0) {
    // Team B has higher handicap
    probAWins = Math.max(0.20, 0.5 + (handicapDiff * 0.035));
  }

  const probBWins = 1 - probAWins;

  const oddsA = probAWins > 0 ? (1 / probAWins) : 5.0;
  const oddsB = probBWins > 0 ? (1 / probBWins) : 5.0;

  return {
    [teamA.id]: oddsA,
    [teamB.id]: oddsB,
    probA: probAWins,
    probB: probBWins,
    handicapDiff,
    format: "stableford"
  };
}

/**
 * Calculate expected Stableford points for a player based on handicap
 * @param {number} handicap - Player handicap
 * @param {Array} coursePar - Array of par values for 18 holes
 * @returns {number} - Expected total Stableford points
 */
export function calculateExpectedStablefordPoints(handicap, coursePar = null) {
  // Default course if not provided (typical mix of par 3s, 4s, 5s)
  const defaultPar = [4,4,3,4,5,4,3,4,4,4,4,3,5,4,4,3,4,5];
  const par = coursePar || defaultPar;

  let expectedPoints = 0;

  par.forEach((holePar, index) => {
    const hole = index + 1;
    const strokesReceived = Math.floor(handicap / 18) + (handicap % 18 >= hole ? 1 : 0);

    // Effective par after receiving strokes
    const netPar = holePar - strokesReceived;

    // Estimate probability of different scores based on skill level
    // Higher handicap players are more likely to make bogey/par after strokes
    const skillFactor = Math.max(0.3, Math.min(1.0, (36 - handicap) / 36));

    // Expected points based on probability distribution
    const probBirdie = skillFactor * 0.1;
    const probPar = skillFactor * 0.4 + (1 - skillFactor) * 0.3;
    const probBogey = skillFactor * 0.3 + (1 - skillFactor) * 0.4;
    const probWorse = 1 - probBirdie - probPar - probBogey;

    const holeExpectedPoints = probBirdie * 3 + probPar * 2 + probBogey * 1 + probWorse * 0;
    expectedPoints += holeExpectedPoints;
  });

  return Math.round(expectedPoints * 10) / 10; // Round to 1 decimal place
}

// ---- Additional Game Settlements (Vegas / Banker / Bloodsome) ---

function getMatchGameState(match, key) {
  if (match?.gameState?.[key]) return match.gameState[key];
  if (match?.[key]) return match[key];
  return null;
}

function attachMatchGameState(match, rootGameState, key) {
  if (!match) return match;
  const merged = {
    ...(match.gameState || {})
  };
  if (!merged[key] && rootGameState?.[key]) {
    merged[key] = rootGameState[key];
  }
  if (Object.keys(merged).length === 0) return match;
  return {
    ...match,
    gameState: merged
  };
}

function getPayoutForWin(bet) {
  const stakeCents = dollarsToCents(bet.stake);
  const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
  return centsToDollars(payoutCents);
}

function normalizeSelectionValue(selection) {
  if (selection === null || selection === undefined) return "";
  return String(selection).trim().toLowerCase();
}

function normalizeWolfRunningMap(running) {
  if (!running || typeof running !== "object") return {};
  const normalized = {};
  Object.entries(running).forEach(([name, value]) => {
    const numeric = Number(value);
    if (!name || !Number.isFinite(numeric)) return;
    normalized[name] = numeric;
  });
  return normalized;
}

function deriveWolfRunningFromResults(results, players = []) {
  const running = {};
  players.forEach((player) => {
    if (!player) return;
    const key = player.name || player.id;
    if (!key) return;
    running[key] = 0;
  });

  if (!results || typeof results !== "object") return running;

  Object.values(results).forEach((result) => {
    if (!result || typeof result !== "object") return;

    const holePlayers = Object.keys(result.net || {});
    const wolf = result.wolf || null;
    const partner = result.partner || null;
    const winners = [];
    const losers = [];

    if (result.wolfTeamWon) {
      if (wolf) winners.push(wolf);
      if (partner) winners.push(partner);
      holePlayers.forEach((name) => {
        if (!winners.includes(name)) losers.push(name);
      });
    } else {
      holePlayers.forEach((name) => {
        if (name !== wolf && name !== partner) winners.push(name);
      });
      if (wolf) losers.push(wolf);
      if (partner) losers.push(partner);
    }

    if (winners.length === 0 || losers.length === 0) return;

    const unitLoss = 1;
    const totalPot = losers.length * unitLoss;
    const winnerShare = totalPot / winners.length;

    winners.forEach((name) => {
      if (!name) return;
      running[name] = (running[name] || 0) + winnerShare;
    });
    losers.forEach((name) => {
      if (!name) return;
      running[name] = (running[name] || 0) - unitLoss;
    });
  });

  return running;
}

function buildWolfIdentityCanonicalMap(players = []) {
  const canonical = new Map();
  players.forEach((player) => {
    if (!player || typeof player !== "object") return;
    const id = normalizeSelectionValue(player.id);
    const name = normalizeSelectionValue(player.name);
    const chosen = id || name;
    if (!chosen) return;
    if (id) canonical.set(id, chosen);
    if (name) canonical.set(name, chosen);
  });
  return canonical;
}

function canonicalWolfIdentity(identity, canonicalMap) {
  const normalized = normalizeSelectionValue(identity);
  if (!normalized) return "";
  return canonicalMap.get(normalized) || normalized;
}

function settleVegasBet(bet, match) {
  const vegas = getMatchGameState(match, "vegas");
  const vegasScoreA = Number(vegas?.score?.A);
  const vegasScoreB = Number(vegas?.score?.B);

  let scoreA = Number.isFinite(vegasScoreA) ? vegasScoreA : null;
  let scoreB = Number.isFinite(vegasScoreB) ? vegasScoreB : null;

  // Fallback for lightweight match fixtures where only aggregate score exists.
  if (scoreA === null || scoreB === null) {
    scoreA = Number.isFinite(match?.scoreA) ? Number(match.scoreA) : 0;
    scoreB = Number.isFinite(match?.scoreB) ? Number(match.scoreB) : 0;
  }

  if (scoreA === scoreB) {
    return { status: "push", payout: bet.stake };
  }

  const winner = scoreA > scoreB ? "A" : "B";
  const selection = normalizeSelectionValue(bet.selection);

  const selectedWinner = (
    (winner === "A" && (selection === "a" || selection === "teama" || selection === normalizeSelectionValue(match?.teamA))) ||
    (winner === "B" && (selection === "b" || selection === "teamb" || selection === normalizeSelectionValue(match?.teamB)))
  );

  if (selectedWinner) {
    return { status: "won", payout: getPayoutForWin(bet) };
  }

  return { status: "lost", payout: 0 };
}

function settleByFinalScoreFallback(bet, match) {
  const scoreA = Number(match?.scoreA);
  const scoreB = Number(match?.scoreB);

  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return null;

  if (scoreA === scoreB) {
    return { status: "push", payout: bet.stake };
  }

  const winner = scoreA > scoreB ? "A" : "B";
  const selection = normalizeSelectionValue(bet.selection);

  const selectedWinner = (
    (winner === "A" && (selection === "a" || selection === "teama" || selection === normalizeSelectionValue(match?.teamA))) ||
    (winner === "B" && (selection === "b" || selection === "teamb" || selection === normalizeSelectionValue(match?.teamB)))
  );

  if (selectedWinner) {
    return { status: "won", payout: getPayoutForWin(bet) };
  }

  return { status: "lost", payout: 0 };
}

function settleRunningBalanceBet(bet, running) {
  if (!running || typeof running !== "object") return null;

  const entries = Object.entries(running).filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) return null;

  const maxScore = Math.max(...entries.map(([, value]) => value));
  const leaders = entries.filter(([, value]) => value === maxScore).map(([name]) => name);

  if (leaders.length !== 1) {
    return { status: "push", payout: bet.stake };
  }

  const winner = normalizeSelectionValue(leaders[0]);
  const selection = normalizeSelectionValue(bet.selection);

  if (winner === selection) {
    return { status: "won", payout: getPayoutForWin(bet) };
  }

  return { status: "lost", payout: 0 };
}

function settleBankerBet(bet, match) {
  const banker = getMatchGameState(match, "banker");
  return settleRunningBalanceBet(bet, banker?.running) || settleByFinalScoreFallback(bet, match);
}

function settleBloodsomeBet(bet, match) {
  const bloodsome = getMatchGameState(match, "bloodsome");
  return settleRunningBalanceBet(bet, bloodsome?.running) || settleByFinalScoreFallback(bet, match);
}

// ---- Comprehensive Tie/Push Handling System -----------------

/**
 * Standardized tie/push handler for all bet types
 * @param {Object} betResult - Result from bet-specific calculation
 * @param {Object} bet - Original bet object
 * @param {Object} tieRules - Tie-breaking rules for this bet type
 * @returns {Object} - Final settlement with tie/push handling
 */
function handleTiesPushes(betResult, bet, tieRules = {}) {
  const {
    winner,
    isTied = false,
    tieType = "exact", // "exact", "insufficient_separation", "incomplete"
    tieBreaker = null
  } = betResult;

  const defaultTieRules = {
    allowPush: true,          // Whether ties result in push (stake returned)
    requireSeparation: false,  // Whether minimum separation is required to avoid push
    minSeparation: 1,         // Minimum difference to avoid tie
    tieBreakMethod: "push",   // "push", "split", "house_edge", "carryover"
    ...tieRules
  };

  let finalStatus = "lost";
  let finalPayout = 0;

  if (winner === bet.selection) {
    // Normal win
    finalStatus = "won";
    const stakeCents = dollarsToCents(bet.stake);
    const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
    finalPayout = centsToDollars(payoutCents);

  } else if (isTied || winner === null) {
    // Handle ties/pushes based on bet type rules
    finalStatus = handleTieByRules(betResult, bet, defaultTieRules);
    finalPayout = calculateTiePayout(bet, finalStatus, defaultTieRules);

  } else {
    // Loss - already initialized above
    finalStatus = "lost";
    finalPayout = 0;
  }

  return {
    status: finalStatus,
    payout: finalPayout,
    tieDetails: isTied ? {
      tieType,
      method: defaultTieRules.tieBreakMethod,
      originalWinner: winner
    } : null
  };
}

/**
 * Determine final status based on tie-breaking rules
 * @param {Object} betResult - Bet calculation result
 * @param {Object} bet - Original bet
 * @param {Object} tieRules - Tie handling rules
 * @returns {string} - Final bet status
 */
function handleTieByRules(betResult, bet, tieRules) {
  const { tieBreakMethod, allowPush, requireSeparation, minSeparation } = tieRules;
  const { margin = 0, winner } = betResult;

  // Check if separation requirement is met
  if (requireSeparation && margin < minSeparation) {
    return "push"; // Insufficient separation
  }

  // Apply tie-breaking method
  switch (tieBreakMethod) {
    case "push":
      return allowPush ? "push" : "lost";

    case "split":
      // Split payout among tied participants (rare in golf betting)
      return "won"; // Modified payout calculated separately

    case "house_edge":
      // House wins on ties (casino-style)
      return "lost";

    case "carryover":
      // Value carries over to next event (used in some skins variants)
      return "carryover"; // Special status

    case "sudden_death":
      // Would require additional play to resolve
      return "pending"; // Awaiting sudden death resolution

    default:
      return allowPush ? "push" : "lost";
  }
}

/**
 * Calculate payout for tied bets based on tie-breaking rules
 * @param {Object} bet - Original bet
 * @param {string} status - Determined status from tie handling
 * @param {Object} tieRules - Tie rules
 * @returns {number} - Payout amount
 */
function calculateTiePayout(bet, status, tieRules) {
  switch (status) {
    case "push":
      return bet.stake; // Return original stake

    case "won":
      if (tieRules.tieBreakMethod === "split") {
        // Split among tied participants (reduce payout)
        const splitFactor = tieRules.splitFactor || 0.5;
        const stakeCents = dollarsToCents(bet.stake);
        const fullPayoutCents = calculatePayoutCents(stakeCents, bet.odds);
        return centsToDollars(Math.round(fullPayoutCents * splitFactor));
      } else {
        // Full payout
        const stakeCents = dollarsToCents(bet.stake);
        const payoutCents = calculatePayoutCents(stakeCents, bet.odds);
        return centsToDollars(payoutCents);
      }

    case "carryover":
      return 0; // No immediate payout, value carries over

    case "pending":
      return 0; // No payout until resolution

    case "lost":
    default:
      return 0; // No payout
  }
}

/**
 * Bet-type-specific tie rules configuration
 */
const BET_TYPE_TIE_RULES = {
  match_winner: {
    allowPush: true,
    tieBreakMethod: "push"
  },

  match_margin: {
    allowPush: false,
    tieBreakMethod: "house_edge" // Exact score required
  },

  flight_winner: {
    allowPush: true,
    requireSeparation: true,
    minSeparation: 0.5,
    tieBreakMethod: "push"
  },

  nassau: {
    allowPush: true,
    tieBreakMethod: "push"
  },

  skins: {
    allowPush: false,
    tieBreakMethod: "carryover" // Depends on carryover setting
  },

  match_play: {
    allowPush: true,
    tieBreakMethod: "push", // All square after 18
    suddenDeath: true
  },

  best_ball: {
    allowPush: true,
    requireSeparation: true,
    minSeparation: 1,
    tieBreakMethod: "push"
  },

  scramble: {
    allowPush: true,
    requireSeparation: true,
    minSeparation: 1,
    tieBreakMethod: "push"
  },

  wolf: {
    allowPush: true,
    tieBreakMethod: "split" // Points can be tied
  },

  stableford: {
    allowPush: true,
    requireSeparation: false, // Points are discrete
    tieBreakMethod: "push"
  }
};

/**
 * Get tie-breaking rules for a specific bet type
 * @param {string} betType - Type of bet
 * @returns {Object} - Tie rules for this bet type
 */
export function getTieRulesForBetType(betType) {
  return BET_TYPE_TIE_RULES[betType] || {
    allowPush: true,
    tieBreakMethod: "push"
  };
}

/**
 * Enhanced settlement wrapper that applies comprehensive tie/push handling
 * @param {Object} bet - Bet to settle
 * @param {Object} betResult - Raw result from bet-specific calculation
 * @returns {Object} - Final settlement with tie/push handling
 */
export function enhancedBetSettlement(bet, betResult) {
  const tieRules = getTieRulesForBetType(bet.type);
  return handleTiesPushes(betResult, bet, tieRules);
}

// ---- Partial Round Support System ----------------------------

/**
 * Handle partial round settlements for incomplete events
 * @param {Object} match - Match object with completion data
 * @param {Object} bet - Bet to settle
 * @returns {Object} - Partial settlement result or null if cannot settle
 */
export function handlePartialRound(match, bet) {
  const completionStatus = assessRoundCompletion(match);

  if (completionStatus.isComplete) {
    return null; // Use normal settlement
  }

  const partialRules = getPartialRulesForBetType(bet.type);

  if (completionStatus.completionPercentage < partialRules.minimumCompletion) {
    // Round too incomplete for settlement - return stakes
    return {
      status: "void",
      payout: bet.stake,
      reason: "insufficient_completion",
      completionPercentage: completionStatus.completionPercentage
    };
  }

  // Attempt partial settlement based on bet type
  return processPartialSettlement(match, bet, completionStatus, partialRules);
}

/**
 * Assess how complete a round is
 * @param {Object} match - Match with hole scores
 * @returns {Object} - Completion assessment
 */
function assessRoundCompletion(match) {
  if (!match.holeScores) {
    return {
      isComplete: false,
      holesCompleted: 0,
      completionPercentage: 0,
      reason: "no_scores"
    };
  }

  let holesPresent = 0;
  let holesWithValidScores = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const holeData = match.holeScores[hole];

    if (holeData) {
      holesPresent++;

      if ((holeData.scoreA !== null && holeData.scoreB !== null) ||
          (holeData.playersA && holeData.playersB) ||
          (holeData.teamScoreA !== null && holeData.teamScoreB !== null)) {
        holesWithValidScores++;
      }
    }
  }

  const completionPercentage = holesWithValidScores / 18;
  const isComplete = holesWithValidScores === 18;

  return {
    isComplete,
    holesCompleted: holesWithValidScores,
    holesPresent,
    holesWithValidScores,
    completionPercentage,
    reason: isComplete ? "complete" : (holesWithValidScores === 0 ? "not_started" : "incomplete")
  };
}

/**
 * Get partial round rules for each bet type
 * @param {string} betType - Type of bet
 * @returns {Object} - Partial round rules
 */
function getPartialRulesForBetType(betType) {
  const partialRules = {
    match_winner: {
      minimumCompletion: 0.5,        // Need at least 9 holes
      allowPartialSettlement: false, // Incomplete head-to-head result is refunded
      method: "void"
    },

    match_margin: {
      minimumCompletion: 1.0,        // Need complete round for exact margin
      allowPartialSettlement: false,
      method: "void"
    },

    flight_winner: {
      minimumCompletion: 0.67,       // Need at least 12 holes
      allowPartialSettlement: true,
      method: "extrapolated"
    },

    nassau: {
      minimumCompletion: 0.25,       // Nassau components can become mathematically decided early
      allowPartialSettlement: true,
      method: "component_based"      // Settle completed components only
    },

    skins: {
      minimumCompletion: 0.33,       // Need at least 6 holes
      allowPartialSettlement: true,
      method: "holes_completed"      // Only count completed holes
    },

    match_play: {
      minimumCompletion: 0.33,       // Can end early anyway
      allowPartialSettlement: true,
      method: "holes_won"           // Based on holes won so far
    },

    best_ball: {
      minimumCompletion: 0.5,
      allowPartialSettlement: true,
      method: "prorated"
    },

    scramble: {
      minimumCompletion: 0.5,
      allowPartialSettlement: true,
      method: "prorated"
    },

    wolf: {
      minimumCompletion: 0.33,       // Point-based, can settle on partial
      allowPartialSettlement: true,
      method: "points_earned"
    },

    stableford: {
      minimumCompletion: 0.5,
      allowPartialSettlement: true,
      method: "points_earned"
    }
  };

  return partialRules[betType] || {
    minimumCompletion: 0.5,
    allowPartialSettlement: true,
    method: "prorated"
  };
}

/**
 * Process partial settlement based on bet type and completion
 * @param {Object} match - Match data
 * @param {Object} bet - Bet to settle
 * @param {Object} completionStatus - Round completion assessment
 * @param {Object} partialRules - Rules for partial settlement
 * @returns {Object} - Settlement result
 */
function processPartialSettlement(match, bet, completionStatus, partialRules) {
  if (!partialRules.allowPartialSettlement) {
    return {
      status: "void",
      payout: bet.stake,
      reason: "bet_type_requires_completion"
    };
  }

  switch (partialRules.method) {
    case "prorated":
      return processProrated(match, bet, completionStatus);

    case "component_based":
      return processComponentBased(match, bet, completionStatus);

    case "holes_completed":
      return processHolesCompleted(match, bet, completionStatus);

    case "holes_won":
      return processHolesWon(match, bet, completionStatus);

    case "points_earned":
      return processPointsEarned(match, bet, completionStatus);

    case "extrapolated":
      return processExtrapolated(match, bet, completionStatus);

    default:
      return {
        status: "void",
        payout: bet.stake,
        reason: "unknown_partial_method"
      };
  }
}

/**
 * Prorated settlement - reduce payout based on completion percentage
 * @param {Object} match - Match data
 * @param {Object} bet - Bet object
 * @param {Object} completionStatus - Completion info
 * @returns {Object} - Settlement result
 */
function processProrated(match, bet, completionStatus) {
  // Calculate normal settlement first
  const normalResult = calculateBetResult(match, bet);

  if (normalResult.winner === bet.selection) {
    const prorationFactor = completionStatus.completionPercentage;
    const stakeCents = dollarsToCents(bet.stake);
    const fullPayoutCents = calculatePayoutCents(stakeCents, bet.odds);
    const proratedPayoutCents = Math.round(fullPayoutCents * prorationFactor);

    return {
      status: "won",
      payout: centsToDollars(proratedPayoutCents),
      reason: "prorated_win",
      prorationFactor
    };
  } else if (normalResult.winner === null) {
    return {
      status: "push",
      payout: bet.stake,
      reason: "prorated_push"
    };
  } else {
    return {
      status: "lost",
      payout: 0,
      reason: "prorated_loss"
    };
  }
}

/**
 * Component-based settlement for Nassau - settle completed components
 * @param {Object} match - Match data
 * @param {Object} bet - Nassau bet
 * @param {Object} completionStatus - Completion info
 * @returns {Object} - Settlement result
 */
function processComponentBased(match, bet, completionStatus) {
  if (bet.type !== "nassau") {
    return processProrated(match, bet, completionStatus);
  }
  const result = settleNassauBet(bet, match);
  if (result) {
    return {
      status: result.status,
      payout: result.payout,
      reason: "component_settlement"
    };
  }

  return {
    status: "void",
    payout: bet.stake,
    reason: "component_incomplete"
  };
}

/**
 * Helper function to calculate bet result (simplified)
 * @param {Object} match - Match data
 * @param {Object} bet - Bet object
 * @returns {Object} - Basic result with winner
 */
function calculateBetResult(match, bet) {
  // Simplified calculation - in practice, would delegate to bet-type-specific functions
  // For partial rounds, we make basic stroke play comparison on completed holes

  let teamAScore = 0;
  let teamBScore = 0;
  let holesScored = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const holeData = match.holeScores?.[hole];
    if (holeData && holeData.scoreA !== null && holeData.scoreB !== null) {
      teamAScore += holeData.scoreA;
      teamBScore += holeData.scoreB;
      holesScored++;
    }
  }

  if (holesScored === 0) {
    return { winner: null };
  }

  let winner = null;
  if (teamAScore < teamBScore) {
    winner = match.teamA;
  } else if (teamBScore < teamAScore) {
    winner = match.teamB;
  }

  return { winner, teamAScore, teamBScore, holesScored };
}

/**
 * Process holes completed settlement for skins
 */
function processHolesCompleted(match, bet, completionStatus) {
  if (bet.type === "skins") {
    const result = settleSkinsBet(bet, match);
    return result ? {
      status: result.status,
      payout: result.payout,
      reason: "holes_completed_settlement"
    } : {
      status: "void",
      payout: bet.stake,
      reason: "skins_settlement_failed"
    };
  }

  return processProrated(match, bet, completionStatus);
}

/**
 * Process holes won settlement for match play
 */
function processHolesWon(match, bet, completionStatus) {
  if (bet.type === "match_play") {
    const matchPlay = calculateMatchPlayResult(match);
    if (!matchPlay) {
      return {
        status: "void",
        payout: bet.stake,
        reason: "match_play_settlement_failed"
      };
    }

    // If the partial round did not mathematically decide the match, void.
    if (!matchPlay.isFinalResult) {
      return {
        status: "void",
        payout: bet.stake,
        reason: "match_play_incomplete_no_decision"
      };
    }

    const result = settleMatchPlayBet(bet, match);
    return result ? {
      status: result.status,
      payout: result.payout,
      reason: "holes_won_settlement"
    } : {
      status: "void",
      payout: bet.stake,
      reason: "match_play_settlement_failed"
    };
  }

  return processProrated(match, bet, completionStatus);
}

/**
 * Process points earned settlement for Wolf/Stableford
 */
function processPointsEarned(match, bet, completionStatus) {
  if (bet.type === "wolf") {
    const result = settleWolfBet(bet, match);
    return result ? {
      status: result.status,
      payout: result.payout,
      reason: "points_earned_settlement"
    } : {
      status: "void",
      payout: bet.stake,
      reason: "wolf_settlement_failed"
    };
  } else if (bet.type === "stableford") {
    const result = settleStablefordBet(bet, match);
    return result ? {
      status: result.status,
      payout: result.payout,
      reason: "points_earned_settlement"
    } : {
      status: "void",
      payout: bet.stake,
      reason: "stableford_settlement_failed"
    };
  }

  return processProrated(match, bet, completionStatus);
}

/**
 * Process extrapolated settlement - estimate final result
 */
function processExtrapolated(match, bet, completionStatus) {
  // For now, use prorated settlement
  // In a more sophisticated implementation, could use statistical models
  // to extrapolate likely final scores based on current performance
  return processProrated(match, bet, completionStatus);
}

// ---- Comprehensive Settlement Testing System ----------------

/**
 * Run comprehensive settlement tests to verify zero-sum compliance
 * @param {boolean} verbose - Whether to output detailed test results
 * @returns {Object} - Test results summary
 */
export function runSettlementTests(verbose = false) {
  console.log("\n=== COMPREHENSIVE SETTLEMENT TESTS ===");

  const testResults = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    violations: [],
    testSuites: {}
  };

  // Test each bet type
  const betTypes = ["match_winner", "nassau", "skins", "match_play", "best_ball", "wolf", "stableford"];

  betTypes.forEach(betType => {
    const suiteResults = runBetTypeTestSuite(betType, verbose);
    testResults.testSuites[betType] = suiteResults;
    testResults.totalTests += suiteResults.totalTests;
    testResults.passed += suiteResults.passed;
    testResults.failed += suiteResults.failed;
    testResults.violations.push(...suiteResults.violations);
  });

  // Run combination tests
  const comboResults = runCombinationTests(verbose);
  testResults.testSuites.combinations = comboResults;
  testResults.totalTests += comboResults.totalTests;
  testResults.passed += comboResults.passed;
  testResults.failed += comboResults.failed;
  testResults.violations.push(...comboResults.violations);

  // Run edge case tests
  const edgeResults = runEdgeCaseTests(verbose);
  testResults.testSuites.edge_cases = edgeResults;
  testResults.totalTests += edgeResults.totalTests;
  testResults.passed += edgeResults.passed;
  testResults.failed += edgeResults.failed;
  testResults.violations.push(...edgeResults.violations);

  // Print summary
  console.log(`\n=== TEST SUMMARY ===`);
  console.log(`Total Tests: ${testResults.totalTests}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${(testResults.passed / testResults.totalTests * 100).toFixed(1)}%`);

  if (testResults.violations.length > 0) {
    console.log(`\n🚨 VIOLATIONS FOUND: ${testResults.violations.length}`);
    testResults.violations.forEach(violation => {
      console.log(`- ${violation.test}: ${violation.description} (${violation.amount})`);
    });
  } else {
    console.log(`\n✅ ALL TESTS PASSED - ZERO-SUM COMPLIANCE VERIFIED`);
  }

  return testResults;
}

/**
 * Test a specific bet type with various scenarios
 * @param {string} betType - Type of bet to test
 * @param {boolean} verbose - Detailed output
 * @returns {Object} - Test results for this bet type
 */
function runBetTypeTestSuite(betType, verbose) {
  const results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    violations: []
  };

  if (verbose) console.log(`\n--- Testing ${betType} ---`);

  // Test scenarios for this bet type
  const scenarios = generateTestScenariosForBetType(betType);

  scenarios.forEach((scenario, index) => {
    results.totalTests++;

    try {
      const testResult = runSingleBetTest(scenario, verbose);

      if (testResult.passed) {
        results.passed++;
        if (verbose) console.log(`✓ ${betType} scenario ${index + 1}: PASS`);
      } else {
        results.failed++;
        results.violations.push({
          test: `${betType}_scenario_${index + 1}`,
          description: testResult.violation,
          amount: testResult.netFlow
        });
        if (verbose) console.log(`✗ ${betType} scenario ${index + 1}: FAIL - ${testResult.violation}`);
      }
    } catch (error) {
      results.failed++;
      results.violations.push({
        test: `${betType}_scenario_${index + 1}`,
        description: `Test error: ${error.message}`,
        amount: "N/A"
      });
      if (verbose) console.log(`✗ ${betType} scenario ${index + 1}: ERROR - ${error.message}`);
    }
  });

  return results;
}

/**
 * Generate test scenarios for a specific bet type
 * @param {string} betType - Bet type to generate scenarios for
 * @returns {Array} - Array of test scenarios
 */
function generateTestScenariosForBetType(betType) {
  const baseMatch = createTestMatch();
  const scenarios = [];

  // Basic scenarios: Team A wins, Team B wins, Tie
  const outcomes = ["teamA_wins", "teamB_wins", "tie"];

  outcomes.forEach(outcome => {
    const match = { ...baseMatch };

    // Modify match based on outcome
    if (outcome === "teamA_wins") {
      setMatchOutcome(match, "teamA");
    } else if (outcome === "teamB_wins") {
      setMatchOutcome(match, "teamB");
    } else {
      setMatchOutcome(match, "tie");
    }

    // Create opposing bets with different stakes and odds
    scenarios.push({
      betType,
      match,
      bets: [
        createTestBet(betType, "teamA", 100, 1.8),
        createTestBet(betType, "teamB", 150, 2.1)
      ],
      expectedOutcome: outcome
    });

    // Create scenario with multiple bets on same outcome
    scenarios.push({
      betType,
      match,
      bets: [
        createTestBet(betType, "teamA", 50, 1.9),
        createTestBet(betType, "teamA", 75, 1.85),
        createTestBet(betType, "teamB", 200, 2.0)
      ],
      expectedOutcome: outcome
    });
  });

  return scenarios;
}

/**
 * Run a single bet test scenario
 * @param {Object} scenario - Test scenario
 * @param {boolean} verbose - Detailed output
 * @returns {Object} - Test result
 */
function runSingleBetTest(scenario, verbose) {
  const { match, bets } = scenario;

  // Create test state
  const testState = {
    matches: { "test_match": match },
    bets: bets.map((bet, index) => ({
      ...bet,
      id: `test_bet_${index}`,
      matchId: "test_match",
      status: "active"
    }))
  };

  // Run settlement
  const settlementResult = settleBetsWithZeroSumValidation(testState);

  // Audit the result
  const audit = auditZeroSum(testState);

  // Check for violations
  const passed = audit.isZeroSum && Math.abs(audit.netFlow) < 0.01;

  return {
    passed,
    audit,
    netFlow: audit.netFlow,
    violation: passed ? null : `Net flow violation: $${audit.netFlow.toFixed(2)}`,
    settlementResult
  };
}

/**
 * Run combination tests with multiple bet types simultaneously
 */
function runCombinationTests(verbose) {
  const results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    violations: []
  };

  if (verbose) console.log(`\n--- Testing Combinations ---`);

  // Test multiple bet types on same match
  const testMatch = createTestMatch();
  setMatchOutcome(testMatch, "teamA");

  const combinationBets = [
    createTestBet("match_winner", "teamA", 100, 1.5),
    createTestBet("match_winner", "teamB", 200, 2.5),
    createTestBet("nassau", "teamA", 50, 1.8, { component: "front9" }),
    createTestBet("skins", "teamA", 75, 2.0),
    createTestBet("stableford", "teamB", 125, 1.9)
  ];

  const testState = {
    matches: { "combo_match": testMatch },
    bets: combinationBets.map((bet, index) => ({
      ...bet,
      id: `combo_bet_${index}`,
      matchId: "combo_match",
      status: "active"
    }))
  };

  results.totalTests++;

  try {
    settleBetsWithZeroSumValidation(testState);
    const audit = auditZeroSum(testState);

    if (audit.isZeroSum) {
      results.passed++;
      if (verbose) console.log(`✓ Combination test: PASS`);
    } else {
      results.failed++;
      results.violations.push({
        test: "combination_multi_bet_types",
        description: `Multiple bet types net flow violation: $${audit.netFlow.toFixed(2)}`,
        amount: audit.netFlow
      });
      if (verbose) console.log(`✗ Combination test: FAIL - ${audit.netFlow.toFixed(2)}`);
    }
  } catch (error) {
    results.failed++;
    results.violations.push({
      test: "combination_multi_bet_types",
      description: `Combination test error: ${error.message}`,
      amount: "N/A"
    });
    if (verbose) console.log(`✗ Combination test: ERROR - ${error.message}`);
  }

  return results;
}

/**
 * Run edge case tests (ties, partial rounds, etc.)
 */
function runEdgeCaseTests(verbose) {
  const results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    violations: []
  };

  if (verbose) console.log(`\n--- Testing Edge Cases ---`);

  // Test partial round scenario
  const partialMatch = createTestMatch();
  setMatchOutcome(partialMatch, "teamA");
  // Remove last 6 holes to simulate partial round
  for (let hole = 13; hole <= 18; hole++) {
    delete partialMatch.holeScores[hole];
  }

  const partialBets = [
    createTestBet("match_winner", "teamA", 100, 1.8),
    createTestBet("match_winner", "teamB", 150, 2.1)
  ];

  results.totalTests++;

  try {
    const testState = {
      matches: { "partial_match": partialMatch },
      bets: partialBets.map((bet, index) => ({
        ...bet,
        id: `partial_bet_${index}`,
        matchId: "partial_match",
        status: "active"
      }))
    };

    // Handle as partial round
    testState.bets.forEach(bet => {
      const partialResult = handlePartialRound(partialMatch, bet);
      if (partialResult) {
        bet.status = partialResult.status;
        bet.payout = partialResult.payout;
      }
    });

    const audit = auditZeroSum(testState);

    if (audit.isZeroSum) {
      results.passed++;
      if (verbose) console.log(`✓ Partial round test: PASS`);
    } else {
      results.failed++;
      results.violations.push({
        test: "partial_round",
        description: `Partial round net flow violation: $${audit.netFlow.toFixed(2)}`,
        amount: audit.netFlow
      });
      if (verbose) console.log(`✗ Partial round test: FAIL - ${audit.netFlow.toFixed(2)}`);
    }
  } catch (error) {
    results.failed++;
    results.violations.push({
      test: "partial_round",
      description: `Partial round test error: ${error.message}`,
      amount: "N/A"
    });
    if (verbose) console.log(`✗ Partial round test: ERROR - ${error.message}`);
  }

  return results;
}

/**
 * Create a test match with sample data
 */
function createTestMatch() {
  const match = {
    teamA: "team_alpha",
    teamB: "team_bravo",
    status: "final",
    holeScores: {},
    coursePar: {}
  };

  // Create hole scores for 18 holes
  for (let hole = 1; hole <= 18; hole++) {
    const par = hole % 3 === 0 ? 3 : (hole % 5 === 0 ? 5 : 4); // Mix of par 3, 4, 5
    match.coursePar[hole] = par;
    match.holeScores[hole] = {
      scoreA: par + Math.floor(Math.random() * 3) - 1, // Par, birdie, or bogey
      scoreB: par + Math.floor(Math.random() * 3) - 1
    };
  }

  return match;
}

/**
 * Set specific match outcome for testing
 */
function setMatchOutcome(match, outcome) {
  if (outcome === "teamA") {
    // Ensure team A has lower total score
    Object.values(match.holeScores).forEach(hole => {
      hole.scoreA = Math.min(hole.scoreA, hole.scoreB - 1);
    });
  } else if (outcome === "teamB") {
    // Ensure team B has lower total score
    Object.values(match.holeScores).forEach(hole => {
      hole.scoreB = Math.min(hole.scoreB, hole.scoreA - 1);
    });
  } else if (outcome === "tie") {
    // Make total scores equal
    const totalA = Object.values(match.holeScores).reduce((sum, hole) => sum + hole.scoreA, 0);
    const totalB = Object.values(match.holeScores).reduce((sum, hole) => sum + hole.scoreB, 0);
    const diff = totalA - totalB;

    if (diff !== 0) {
      // Adjust first hole to create tie
      match.holeScores[1].scoreB += diff;
    }
  }
}

/**
 * Create a test bet with specified parameters
 */
function createTestBet(betType, selection, stake, odds, extraParams = {}) {
  return {
    type: betType,
    selection,
    stake,
    odds,
    timestamp: Date.now(),
    ...extraParams
  };
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
