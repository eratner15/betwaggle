// Demo Auto-Simulation Module — makes demo pages feel like live sportsbook
// Generates fake bet placements, score updates, and odds movements on setInterval

// Mock player names for different demo scenarios
const DEMO_PLAYERS = {
  buddies: ['Tommy H.', 'Jake M.', 'Ryan K.', 'Mike P.', 'Chris L.', 'Dave S.'],
  scramble: ['Team Eagle', 'Team Birdie', 'Team Ace', 'Team Albatross', 'Team Par', 'Team Bogey']
};

// Mock bet types and amounts
const BET_TYPES = [
  { text: "placed a $25 Nassau bet", emoji: "💰" },
  { text: "doubled down on Skins", emoji: "🔥" },
  { text: "backed the underdog", emoji: "🎯" },
  { text: "took the favorite", emoji: "👑" },
  { text: "hedged their position", emoji: "🛡️" },
  { text: "went all-in", emoji: "💎" }
];

// Mock score events
const SCORE_EVENTS = [
  { text: "sank a 20-footer for birdie", emoji: "🏌️" },
  { text: "chipped it close for par", emoji: "⛳" },
  { text: "made a clutch putt", emoji: "🎯" },
  { text: "recovered from the bunker", emoji: "🏖️" },
  { text: "drained it from the fringe", emoji: "🔥" },
  { text: "stuck it tight", emoji: "🎯" },
  { text: "found trouble off the tee", emoji: "💀" },
  { text: "made a great up-and-down", emoji: "✨" }
];

// Mock trash talk
const TRASH_TALK = [
  { text: "That was lucky! 😤", emoji: "" },
  { text: "Show me the money! 💵", emoji: "" },
  { text: "Ice in the veins ❄️", emoji: "" },
  { text: "Can't buy a putt today...", emoji: "" },
  { text: "The pressure is real 😰", emoji: "" },
  { text: "Let's gooo! 🚀", emoji: "" },
  { text: "This is heating up! 🌶️", emoji: "" }
];

// Auto-simulation state
let simulationInterval = null;
let lastActivityTime = Date.now();

/**
 * Check if current page is a demo page that should have auto-simulation
 */
function isDemoPage() {
  const path = location.pathname;
  return path.includes('/demo') ||
         path.includes('/demo-buddies') ||
         path.includes('/demo-scramble') ||
         path.includes('/legends-trip');
}

/**
 * Get demo type based on current URL
 */
function getDemoType() {
  const path = location.pathname;
  if (path.includes('scramble')) return 'scramble';
  return 'buddies'; // Default for buddies/legends
}

/**
 * Generate random player name based on demo type
 */
function getRandomPlayer(demoType = 'buddies') {
  const players = DEMO_PLAYERS[demoType] || DEMO_PLAYERS.buddies;
  return players[Math.floor(Math.random() * players.length)];
}

/**
 * Generate random activity item for the feed
 */
function generateRandomActivity(demoType = 'buddies') {
  const activityTypes = ['bet', 'score', 'chirp'];
  const weights = [0.4, 0.4, 0.2]; // 40% bets, 40% scores, 20% chirps

  let rand = Math.random();
  let type = 'chirp';

  if (rand < weights[0]) {
    type = 'bet';
  } else if (rand < weights[0] + weights[1]) {
    type = 'score';
  }

  const player = getRandomPlayer(demoType);
  const now = Date.now();

  let activity;

  switch (type) {
    case 'bet':
      const bet = BET_TYPES[Math.floor(Math.random() * BET_TYPES.length)];
      activity = {
        type: 'press', // Use 'press' type for bet-like styling
        player: player,
        text: bet.text,
        emoji: bet.emoji,
        ts: now
      };
      break;

    case 'score':
      const score = SCORE_EVENTS[Math.floor(Math.random() * SCORE_EVENTS.length)];
      activity = {
        type: 'score',
        player: player,
        text: score.text,
        emoji: score.emoji,
        ts: now
      };
      break;

    case 'chirp':
      const chirp = TRASH_TALK[Math.floor(Math.random() * TRASH_TALK.length)];
      activity = {
        type: 'chirp',
        player: player,
        text: chirp.text,
        emoji: chirp.emoji,
        ts: now
      };
      break;
  }

  return activity;
}

/**
 * Add simulated activity to the feed
 */
function addSimulatedActivity() {
  // Only run on demo pages
  if (!isDemoPage()) return;

  // Get current state - check if MG global exists
  if (typeof window.MG === 'undefined' || !window.MG.getState) return;

  const state = window.MG.getState();
  if (!state) return;

  // Initialize feed if it doesn't exist
  if (!state._feed) state._feed = [];

  // Generate new activity
  const demoType = getDemoType();
  const newActivity = generateRandomActivity(demoType);

  // Add to front of feed (most recent first)
  state._feed.unshift(newActivity);

  // Keep feed manageable size (max 100 items)
  if (state._feed.length > 100) {
    state._feed = state._feed.slice(0, 100);
  }

  // Update timestamp
  lastActivityTime = Date.now();

  // Trigger re-render if route function exists
  if (window.MG.route && typeof window.MG.route === 'function') {
    window.MG.route();
  }

  console.log('Auto-sim: Added activity:', newActivity);
}

/**
 * Simulate odds movements (placeholder for future enhancement)
 */
function simulateOddsMovement() {
  // TODO: Add odds fluctuation logic
  // For now, just log that it would happen
  if (Math.random() < 0.1) { // 10% chance per interval
    console.log('Auto-sim: Odds movement triggered');
  }
}

/**
 * Start auto-simulation with configurable interval
 */
function startAutoSimulation(intervalMs = 8000) {
  if (simulationInterval) return; // Already running

  console.log('Starting demo auto-simulation...');

  simulationInterval = setInterval(() => {
    // Random chance of activity (60% per interval)
    if (Math.random() < 0.6) {
      addSimulatedActivity();
    }

    // Simulate odds movements occasionally
    simulateOddsMovement();

  }, intervalMs);
}

/**
 * Stop auto-simulation
 */
function stopAutoSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log('Stopped demo auto-simulation');
  }
}

/**
 * Initialize auto-simulation if on demo page
 */
function initDemoSimulation() {
  if (isDemoPage()) {
    // Add some initial activity after a short delay
    setTimeout(() => {
      // Add 3-5 initial activities to populate feed
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        setTimeout(() => addSimulatedActivity(), i * 1000);
      }

      // Start ongoing simulation
      startAutoSimulation();

    }, 2000); // Start 2 seconds after init
  }
}

// Export functions for external use
export {
  startAutoSimulation,
  stopAutoSimulation,
  initDemoSimulation,
  isDemoPage,
  addSimulatedActivity
};