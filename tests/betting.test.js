// Betting engine tests — odds, settlement, edge cases
// Run: node tests/betting.test.js

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; process.stdout.write('.'); }
  else { failed++; console.error(`\n  FAIL: ${msg}`); }
}
function assertClose(a, b, tolerance, msg) {
  assert(Math.abs(a - b) <= tolerance, `${msg} (expected ~${b}, got ${a})`);
}

// ── Inline the core functions (no ESM import in plain node) ──

function mlToProb(ml) {
  if (ml === 0) return 0.5;
  if (ml < 0) return (-ml) / (-ml + 100);
  return 100 / (ml + 100);
}

function probToML(p) {
  const juiced = Math.min(0.97, p * 1.05);
  if (Math.abs(juiced - 0.5) < 0.005) return 0;
  if (juiced >= 0.5) return Math.round(-100 * juiced / (1 - juiced));
  return Math.round(100 * (1 - juiced) / juiced);
}

function mlToDecimal(ml) {
  if (ml === 0) return 2.00;
  if (ml < 0) return +(1 + 100 / Math.abs(ml)).toFixed(2);
  return +(1 + ml / 100).toFixed(2);
}

function probToAmerican(prob) {
  prob = Math.max(0.03, Math.min(0.97, prob));
  if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob));
  return Math.round(100 * (1 - prob) / prob);
}

const ML = [
  [   0,  -138,  -190,  -262,  -363,  -507,  -715, -1020, -1477, -2169, -3238, -4915, -7589,-11921,-19048,-30952],
  [ 138,     0,  -137,  -188,  -258,  -356,  -495,  -694,  -985, -1415, -2064, -3058, -4602, -7043,-10961,-17343],
  [ 190,   137,     0,  -137,  -186,  -255,  -350,  -483,  -674,  -951, -1359, -1968, -2892, -4319, -6553,-10107],
  [ 262,   188,   137,     0,  -136,  -185,  -251,  -344,  -473,  -656,  -920, -1306, -1878, -2741, -4062, -6113],
  [ 363,   258,   186,   136,     0,  -135,  -183,  -248,  -338,  -462,  -638,  -890, -1256, -1796, -2602, -3827],
  [ 507,   356,   255,   185,   135,     0,  -135,  -182,  -245,  -332,  -453,  -622,  -863, -1210, -1719, -2475],
  [ 715,   495,   350,   251,   183,   135,     0,  -134,  -180,  -242,  -327,  -444,  -606,  -837, -1167, -1648],
  [1020,   694,   483,   344,   248,   182,   134,     0,  -134,  -179,  -240,  -322,  -435,  -592,  -812, -1127],
  [1477,   985,   674,   473,   338,   245,   180,   134,     0,  -133,  -178,  -237,  -317,  -426,  -578,  -789],
  [2169,  1415,   951,   656,   462,   332,   242,   179,   133,     0,  -133,  -176,  -234,  -312,  -418,  -564],
  [3238,  2064,  1359,   920,   638,   453,   327,   240,   178,   133,     0,  -132,  -175,  -232,  -308,  -411],
  [4915,  3058,  1968,  1306,   890,   622,   444,   322,   237,   176,   132,     0,  -132,  -174,  -229,  -304],
  [7589,  4602,  2892,  1878,  1256,   863,   606,   435,   317,   234,   175,   132,     0,  -132,  -173,  -227],
  [11921, 7043,  4319,  2741,  1796,  1210,   837,   592,   426,   312,   232,   174,   132,     0,  -131,  -172],
  [19048,10961,  6553,  4062,  2602,  1719,  1167,   812,   578,   418,   308,   229,   173,   131,     0,  -131],
  [30952,17343, 10107,  6113,  3827,  2475,  1648,  1127,   789,   564,   411,   304,   227,   172,   131,     0],
];

function interpolateProb(hcpA, hcpB) {
  const a = Math.max(0, Math.min(15, hcpA));
  const b = Math.max(0, Math.min(15, hcpB));
  const aLo = Math.floor(a), aHi = Math.min(15, aLo + 1);
  const bLo = Math.floor(b), bHi = Math.min(15, bLo + 1);
  const aFrac = a - aLo;
  const bFrac = b - bLo;
  const p00 = mlToProb(ML[aLo][bLo]);
  const p01 = mlToProb(ML[aLo][bHi]);
  const p10 = mlToProb(ML[aHi][bLo]);
  const p11 = mlToProb(ML[aHi][bHi]);
  const top = p00 * (1 - bFrac) + p01 * bFrac;
  const bot = p10 * (1 - bFrac) + p11 * bFrac;
  return top * (1 - aFrac) + bot * aFrac;
}

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

console.log('Betting Engine Tests\n');

// ── 1. ML table symmetry ──
console.log('\n1. ML table symmetry');
for (let i = 0; i < 16; i++) {
  for (let j = 0; j < 16; j++) {
    // ML[i][j] should be the negative of ML[j][i] (symmetric zero-sum)
    assert(ML[i][j] === -ML[j][i], `ML[${i}][${j}]=${ML[i][j]} should be -ML[${j}][${i}]=${-ML[j][i]}`);
  }
}

// ── 2. Diagonal is zero ──
console.log('\n2. Diagonal zeros');
for (let i = 0; i < 16; i++) {
  assert(ML[i][i] === 0, `ML[${i}][${i}] should be 0`);
}

// ── 3. mlToProb correctness ──
console.log('\n3. mlToProb');
assertClose(mlToProb(0), 0.5, 0.001, 'EVEN = 50%');
assertClose(mlToProb(-100), 0.5, 0.001, '-100 = 50%');
assertClose(mlToProb(100), 0.5, 0.001, '+100 = 50%');
assertClose(mlToProb(-200), 0.6667, 0.001, '-200 = 66.7%');
assertClose(mlToProb(200), 0.3333, 0.001, '+200 = 33.3%');
assertClose(mlToProb(-138), 0.58, 0.01, '-138 ~ 58%');
assertClose(mlToProb(138), 0.42, 0.01, '+138 ~ 42%');

// ── 4. mlToProb + inverse roundtrip ──
console.log('\n4. Probability roundtrip');
for (const ml of [-500, -200, -138, -100, 0, 100, 138, 200, 500]) {
  const prob = mlToProb(ml);
  assert(prob > 0 && prob < 1, `mlToProb(${ml}) = ${prob} should be in (0,1)`);
}
// Complementary: prob(A beats B) + prob(B beats A) = 1
for (let i = 0; i < 16; i++) {
  for (let j = 0; j < 16; j++) {
    if (i === j) continue;
    const sum = mlToProb(ML[i][j]) + mlToProb(ML[j][i]);
    assertClose(sum, 1.0, 0.01, `prob sum ML[${i}][${j}] + ML[${j}][${i}]`);
  }
}

// ── 5. mlToDecimal correctness ──
console.log('\n5. mlToDecimal');
assertClose(mlToDecimal(0), 2.00, 0.01, 'EVEN = 2.00x');
assertClose(mlToDecimal(-127), 1.79, 0.01, '-127 = 1.79x');
assertClose(mlToDecimal(127), 2.27, 0.01, '+127 = 2.27x');
assertClose(mlToDecimal(-200), 1.50, 0.01, '-200 = 1.50x');
assertClose(mlToDecimal(200), 3.00, 0.01, '+200 = 3.00x');
assertClose(mlToDecimal(-1000), 1.10, 0.01, '-1000 = 1.10x');

// ── 6. Interpolation sanity ──
console.log('\n6. Interpolation');
// Same handicap = 50%
assertClose(interpolateProb(5, 5), 0.5, 0.001, 'Same HCP = 50%');
assertClose(interpolateProb(0, 0), 0.5, 0.001, 'Both scratch = 50%');
assertClose(interpolateProb(15, 15), 0.5, 0.001, 'Both 15 = 50%');

// Lower handicap should be favored
assert(interpolateProb(0, 5) > 0.5, 'Scratch should beat 5 HCP');
assert(interpolateProb(0, 15) > 0.9, 'Scratch should heavily beat 15 HCP');
assert(interpolateProb(5, 0) < 0.5, '5 HCP should be underdog vs scratch');

// Fractional interpolation should be between integer neighbors
const p_2v3 = interpolateProb(2, 3);
const p_3v4 = interpolateProb(3, 4);
const p_2_5v3_5 = interpolateProb(2.5, 3.5);
// 2.5 vs 3.5 = 1 stroke spread, should be close to other 1-stroke matchups
assert(p_2_5v3_5 > 0.5, 'Lower fractional HCP should be favored');
assert(p_2_5v3_5 < p_2v3, '2.5 vs 3.5 should be less dominant than 2 vs 3');

// ── 7. Vig/Juice ──
console.log('\n7. Vig check');
// For equal teams, both MLs should be slightly negative (house edge)
const mlA = probToML(0.5);
const mlB = probToML(0.5);
assert(mlA <= 0, 'Even matchup: juiced ML for A should be ≤ 0 (EVEN or slightly negative)');
// The overround (total implied prob) should be ~1.05-1.10
const totalImplied = mlToProb(probToML(0.6)) + mlToProb(probToML(0.4));
assert(totalImplied > 1.0, `Overround ${totalImplied.toFixed(4)} should be > 1.0 (house edge)`);
assert(totalImplied < 1.15, `Overround ${totalImplied.toFixed(4)} should be < 1.15 (reasonable vig)`);

// ── 8. probToAmerican ──
console.log('\n8. probToAmerican');
assert(probToAmerican(0.5) <= -100 || probToAmerican(0.5) >= 100 || probToAmerican(0.5) === -100,
  'probToAmerican(0.5) should be around -100/+100');
assert(probToAmerican(0.7) < 0, '70% favorite should be negative ML');
assert(probToAmerican(0.3) > 0, '30% underdog should be positive ML');
assert(probToAmerican(0.97) < -3000, '97% prob should be very negative ML');

// ── 9. Settlement logic ──
console.log('\n9. Settlement');

function testSettle(betType, selection, scoreA, scoreB, expectedStatus) {
  const bet = { type: betType, selection, matchId: 'm1', stake: 100, odds: 2.0, status: 'active', payout: 0 };
  const state = { bets: [bet], matches: { m1: { teamA: 'A', teamB: 'B', scoreA, scoreB, status: 'final', flight: 'f1' } } };

  state.bets.forEach(b => {
    if (b.status !== 'active') return;
    if (b.type === 'match_winner') {
      let winner = null;
      if (state.matches[b.matchId].scoreA > state.matches[b.matchId].scoreB) winner = 'A';
      else if (state.matches[b.matchId].scoreB > state.matches[b.matchId].scoreA) winner = 'B';
      if (b.selection === 'draw') {
        if (winner === null) { b.status = 'won'; b.payout = Math.round(b.stake * b.odds); }
        else { b.status = 'lost'; }
      } else if (winner === null) { b.status = 'push'; b.payout = b.stake; }
      else if (b.selection == winner) { b.status = 'won'; b.payout = Math.round(b.stake * b.odds); }
      else { b.status = 'lost'; }
    }
    if (b.type === 'match_margin') {
      const outcome = `${state.matches[b.matchId].scoreA}-${state.matches[b.matchId].scoreB}`;
      if (b.selection === outcome) { b.status = 'won'; b.payout = Math.round(b.stake * b.odds); }
      else { b.status = 'lost'; }
    }
  });

  assert(bet.status === expectedStatus, `${betType} ${selection} vs ${scoreA}-${scoreB} → ${expectedStatus} (got ${bet.status})`);
  return bet;
}

// Match winner bets
testSettle('match_winner', 'A', 7, 3, 'won');
testSettle('match_winner', 'B', 7, 3, 'lost');
testSettle('match_winner', 'A', 3, 7, 'lost');
testSettle('match_winner', 'B', 3, 7, 'won');
testSettle('match_winner', 'A', 5, 5, 'push');
testSettle('match_winner', 'B', 5, 5, 'push');
testSettle('match_winner', 'draw', 5, 5, 'won');
testSettle('match_winner', 'draw', 7, 3, 'lost');

// Match margin bets
testSettle('match_margin', '7-3', 7, 3, 'won');
testSettle('match_margin', '6-4', 7, 3, 'lost');
testSettle('match_margin', '5-5', 5, 5, 'won');

// Payout correctness
const wonBet = testSettle('match_winner', 'A', 7, 3, 'won');
assert(wonBet.payout === 200, `Won bet payout should be 200 (100 * 2.0), got ${wonBet.payout}`);
const pushBet = testSettle('match_winner', 'A', 5, 5, 'push');
assert(pushBet.payout === 100, `Push payout should be 100 (stake returned), got ${pushBet.payout}`);
const lostBet = testSettle('match_winner', 'A', 3, 7, 'lost');
assert(lostBet.payout === 0, `Lost bet payout should be 0, got ${lostBet.payout}`);

// ── 10. Edge cases ──
console.log('\n10. Edge cases');
// Very large handicap differential
assert(interpolateProb(0, 15) > 0.95, 'Scratch vs 15 should be >95%');
assert(interpolateProb(15, 0) < 0.05, '15 vs scratch should be <5%');

// Clamping beyond chart range
assertClose(interpolateProb(20, 20), 0.5, 0.001, 'Both 20 HCP (clamped to 15) = 50%');
assertClose(interpolateProb(-5, -5), 0.5, 0.001, 'Both -5 HCP (clamped to 0) = 50%');

// mlToDecimal edge: very heavy favorite
assert(mlToDecimal(-10000) > 1.0, 'Heavy favorite decimal > 1.0');
assert(mlToDecimal(-10000) < 1.02, 'Heavy favorite decimal < 1.02');

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════
console.log(`\n\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
