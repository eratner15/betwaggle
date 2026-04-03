// Nassau tie regression tests
// Run: node tests/nassau-tie-regression.test.js

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) {
    passed++;
    process.stdout.write('.');
  } else {
    failed++;
    console.error(`\nFAIL: ${message}`);
  }
}

function wggResolveLowScoreWinner(standings = [], scoreKey = 'score') {
  if (!Array.isArray(standings) || standings.length === 0) {
    return { winner: null, tiedPlayers: [] };
  }
  const bestScore = Number(standings[0]?.[scoreKey]);
  if (!Number.isFinite(bestScore)) {
    return { winner: null, tiedPlayers: [] };
  }
  const tiedPlayers = standings
    .filter((entry) => Number(entry?.[scoreKey]) === bestScore)
    .map((entry) => entry?.name)
    .filter(Boolean);
  if (tiedPlayers.length === 1) {
    return { winner: tiedPlayers[0], tiedPlayers: [] };
  }
  return { winner: null, tiedPlayers };
}

function wggResolvePressWinner(running = {}) {
  const sorted = Object.entries(running).sort((a, b) => a[1] - b[1]);
  if (sorted.length === 0) return { winner: null, tiedPlayers: [] };
  const bestScore = Number(sorted[0]?.[1]);
  if (!Number.isFinite(bestScore)) {
    return { winner: null, tiedPlayers: [] };
  }
  const tiedPlayers = sorted
    .filter((entry) => Number(entry?.[1]) === bestScore)
    .map((entry) => entry?.[0])
    .filter(Boolean);
  if (tiedPlayers.length === 1) {
    return { winner: tiedPlayers[0], tiedPlayers: [] };
  }
  return { winner: null, tiedPlayers };
}

console.log('Nassau Tie Regression Tests\n');

const frontTie = wggResolveLowScoreWinner([
  { name: 'Alice', score: 36 },
  { name: 'Bob', score: 36 },
  { name: 'Cara', score: 37 }
]);
assert(frontTie.winner === null, 'Front-9 tie must not assign a winner');
assert(frontTie.tiedPlayers.length === 2, 'Front-9 tie should include tied players');

const totalSolo = wggResolveLowScoreWinner([
  { name: 'Alice', score: 72 },
  { name: 'Bob', score: 73 }
]);
assert(totalSolo.winner === 'Alice', 'Outright low score should assign winner');
assert(totalSolo.tiedPlayers.length === 0, 'Outright winner should not include tie players');

const pressTie = wggResolvePressWinner({ Alice: 18, Bob: 18, Cara: 19 });
assert(pressTie.winner === null, 'Press tie must settle as push (no winner)');
assert(pressTie.tiedPlayers.includes('Alice') && pressTie.tiedPlayers.includes('Bob'), 'Press tie should expose both tied players');

const pressSolo = wggResolvePressWinner({ Alice: 17, Bob: 18 });
assert(pressSolo.winner === 'Alice', 'Press winner should be lowest running total');
assert(pressSolo.tiedPlayers.length === 0, 'Press winner should not include tie players');

console.log(`\n\nPassed: ${passed}`);
if (failed > 0) {
  console.error(`Failed: ${failed}`);
  process.exit(1);
}
console.log('All Nassau tie regression tests passed.');
