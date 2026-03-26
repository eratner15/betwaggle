// 18-hole match play odds — extracted from betting.js moneyline table
// This is the existing interpolateProb() logic, packaged as a format adapter.

// Full 16x16 gross win probability moneyline table (HCP 0-15)
// ML[row][col] = American moneyline for row-HCP beating col-HCP
const ML = [
//   0      1      2      3      4      5      6      7      8      9     10     11     12     13     14     15
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

function mlToProb(ml) {
  if (ml === 0) return 0.5;
  if (ml < 0) return (-ml) / (-ml + 100);
  return 100 / (ml + 100);
}

/**
 * Bilinear interpolation on the moneyline probability table.
 * Handles fractional handicaps by blending the 4 nearest integer cells.
 */
export function interpolateProb(hcpA, hcpB) {
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

/**
 * Get win probability for 18-hole match play.
 * @param {object} playerA - { handicapIndex: number }
 * @param {object} playerB - { handicapIndex: number }
 * @returns {{ probA: number, probB: number, draw: number }}
 */
export function getProb(playerA, playerB) {
  let effA = playerA.handicapIndex;
  let effB = playerB.handicapIndex;

  let probA;
  if (effA > 15 && effB > 15) {
    // Both beyond chart — use differential
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

  // 12% draw probability for 9-hole best-ball match play
  const DRAW_PROB = 0.12;
  const adjA = probA * (1 - DRAW_PROB);
  const adjB = (1 - probA) * (1 - DRAW_PROB);

  return { probA: adjA, probB: adjB, draw: DRAW_PROB };
}
