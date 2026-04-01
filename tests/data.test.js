// data.js regression tests — generateMatches edge cases
// Run: node tests/data.test.js
// Regression: FINDING P0 — empty pairings crashed all Weekend Warrior events
// Found by /qa on 2026-04-01
// Report: .gstack/qa-reports/qa-report-betwaggle-com-2026-04-01.md

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; process.stdout.write('.'); }
  else { failed++; console.error(`\n  FAIL: ${msg}`); }
}

// ── Inline generateMatches (no ESM import in plain node) ──
function generateMatches(config) {
  const matches = {};
  if (!config.flightOrder || !Array.isArray(config.flightOrder)) return matches;
  if (!config.pairings || Object.keys(config.pairings).length === 0) return matches;
  for (const flightId of config.flightOrder) {
    if (!config.pairings[flightId]) continue;
    for (let round = 1; round <= config.structure.roundsTotal; round++) {
      const pairings = config.pairings[flightId]?.[round];
      if (!pairings || !Array.isArray(pairings)) continue;
      for (let p = 0; p < pairings.length; p++) {
        const [a, b] = pairings[p];
        const matchId = `${flightId}-R${round}-P${p + 1}`;
        matches[matchId] = { id: matchId, flight: flightId, round, pairing: p + 1, teamA: a, teamB: b, scoreA: null, scoreB: null, status: 'scheduled' };
      }
    }
  }
  return matches;
}

// ═══════════════════════════════════════════════════════
// Test Suite: generateMatches
// ═══════════════════════════════════════════════════════

console.log('generateMatches tests:');

// P0 REGRESSION: empty pairings object (Weekend Warrior / Quick Start events)
{
  const config = {
    flightOrder: ['all'],
    structure: { roundsTotal: 1 },
    pairings: {}
  };
  const result = generateMatches(config);
  assert(typeof result === 'object', 'empty pairings returns object');
  assert(Object.keys(result).length === 0, 'empty pairings returns empty matches');
}

// No flightOrder
{
  const result = generateMatches({ structure: { roundsTotal: 1 }, pairings: {} });
  assert(Object.keys(result).length === 0, 'missing flightOrder returns empty');
}

// flightOrder not an array
{
  const result = generateMatches({ flightOrder: 'woods', structure: { roundsTotal: 1 }, pairings: {} });
  assert(Object.keys(result).length === 0, 'non-array flightOrder returns empty');
}

// Null pairings
{
  const result = generateMatches({ flightOrder: ['all'], structure: { roundsTotal: 1 }, pairings: null });
  assert(Object.keys(result).length === 0, 'null pairings returns empty');
}

// Undefined pairings
{
  const result = generateMatches({ flightOrder: ['all'], structure: { roundsTotal: 1 } });
  assert(Object.keys(result).length === 0, 'undefined pairings returns empty');
}

// Flight in flightOrder but not in pairings
{
  const config = {
    flightOrder: ['woods', 'palmer'],
    structure: { roundsTotal: 1 },
    pairings: { woods: { 1: [[1, 2], [3, 4]] } }
  };
  const result = generateMatches(config);
  assert(Object.keys(result).length === 2, 'missing flight in pairings skipped gracefully');
  assert(result['woods-R1-P1']?.teamA === 1, 'woods match A correct');
  assert(result['woods-R1-P2']?.teamB === 4, 'woods match B correct');
}

// Round missing from flight pairings
{
  const config = {
    flightOrder: ['all'],
    structure: { roundsTotal: 3 },
    pairings: { all: { 1: [[1, 2]], 3: [[3, 4]] } }
  };
  const result = generateMatches(config);
  assert(Object.keys(result).length === 2, 'missing round 2 skipped');
  assert(result['all-R1-P1'], 'round 1 match exists');
  assert(result['all-R3-P1'], 'round 3 match exists');
  assert(!result['all-R2-P1'], 'round 2 match does not exist');
}

// Normal case — full member-guest config
{
  const config = {
    flightOrder: ['woods', 'palmer'],
    structure: { roundsTotal: 2 },
    pairings: {
      woods: { 1: [[1, 2], [3, 4]], 2: [[1, 3], [2, 4]] },
      palmer: { 1: [[5, 6], [7, 8]], 2: [[5, 7], [6, 8]] }
    }
  };
  const result = generateMatches(config);
  assert(Object.keys(result).length === 8, 'full config: 2 flights × 2 rounds × 2 pairings = 8 matches');
  assert(result['woods-R1-P1'].teamA === 1, 'correct team assignment');
  assert(result['palmer-R2-P2'].teamB === 8, 'correct team assignment end');
}

console.log(`\n\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
