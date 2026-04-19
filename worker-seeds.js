// worker-seeds.js — Demo event seed functions
// Extracted from worker.js for modularity

function randomPin() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

function clampGolfScore(par, delta) {
  return Math.max(2, par + delta);
}

function buildFullStrokeScores(seedScores, playerNames, pars) {
  const full = {};
  for (const [hole, scores] of Object.entries(seedScores || {})) {
    full[Number(hole)] = { ...scores };
  }
  for (let h = 1; h <= pars.length; h++) {
    if (full[h]) continue;
    const par = pars[h - 1] || 4;
    full[h] = {};
    playerNames.forEach((name, i) => {
      const pattern = (h * 3 + i * 2) % 7;
      const delta = pattern <= 1 ? -1 : pattern >= 5 ? 1 : 0;
      full[h][name] = clampGolfScore(par, delta);
    });
  }
  return full;
}

function buildFullScrambleScores(seedHoleScores, teamCount, pars) {
  const full = (seedHoleScores || []).map(row => row.slice());
  for (let h = full.length + 1; h <= pars.length; h++) {
    const par = pars[h - 1] || 4;
    const row = [];
    for (let i = 0; i < teamCount; i++) {
      const pattern = (h + i * 3) % 8;
      const delta = pattern <= 2 ? -1 : pattern >= 6 ? 1 : 0;
      row.push(clampGolfScore(par, delta));
    }
    full.push(row);
  }
  return full;
}

async function seedDemoBuddies(env) {
  const KEY = 'config:demo-buddies';
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Jake Sullivan', handicapIndex: 8.2 },
    { name: 'Ryan Costa', handicapIndex: 14.6 },
    { name: 'Mike Torres', handicapIndex: 5.1 },
    { name: 'Dan Keller', handicapIndex: 11.8 }
  ];
  const pars = [4,4,3,5,4,4,3,4,5, 4,3,5,4,4,4,3,4,5]; // par 72

  const config = {
    event: { name: 'The Dunes Trip 2026', shortName: 'Dunes Trip', eventType: 'buddies_trip', course: 'Streamsong Black', currentRound: 1, venue: 'Streamsong Resort' },
    players: players,
    roster: players,
    games: { nassau: true, skins: true, wolf: true },
    structure: { nassauBet: '10', skinsBet: '5', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Streamsong Black', pars: pars, tees: 'Blue' },
    rounds: { '1': { course: 'Streamsong Black', tees: 'Blue' } },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Pre-seed 12 holes of scores — Jake is hot, Ryan is bleeding
  const scores = {
    1: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 5 },
    2: { 'Jake Sullivan': 3, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 4 },
    3: { 'Jake Sullivan': 3, 'Ryan Costa': 4, 'Mike Torres': 3, 'Dan Keller': 3 },
    4: { 'Jake Sullivan': 5, 'Ryan Costa': 6, 'Mike Torres': 5, 'Dan Keller': 5 },
    5: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 3, 'Dan Keller': 4 },
    6: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 5 },
    7: { 'Jake Sullivan': 2, 'Ryan Costa': 4, 'Mike Torres': 3, 'Dan Keller': 3 },
    8: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 4 },
    9: { 'Jake Sullivan': 5, 'Ryan Costa': 6, 'Mike Torres': 4, 'Dan Keller': 5 },
    10: { 'Jake Sullivan': 4, 'Ryan Costa': 5, 'Mike Torres': 4, 'Dan Keller': 3 },
    11: { 'Jake Sullivan': 3, 'Ryan Costa': 4, 'Mike Torres': 2, 'Dan Keller': 3 },
    12: { 'Jake Sullivan': 4, 'Ryan Costa': 6, 'Mike Torres': 5, 'Dan Keller': 5 }
  };
  const completeScores = buildFullStrokeScores(scores, players.map(p => p.name), pars);

  const holes = {};
  for (const [h, s] of Object.entries(completeScores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (pars.length - parseInt(h, 10)) * 600000 };
  }
  await env.MG_BOOK.put(`demo-buddies:holes`, JSON.stringify(holes));

  // Compute basic game state for skins
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= pars.length; h++) {
    const hScores = completeScores[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * 3 * 5 });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`demo-buddies:game-state`, JSON.stringify(gameState));

  // Seed feed with narrative
  const feed = [
    { ts: Date.now() - 100000, type: 'score', text: 'Jake birdies #7! Takes the skin ($15). Pushing to +$30.', player: 'Jake Sullivan' },
    { ts: Date.now() - 200000, type: 'score', text: 'Ryan double-bogeys #12. The bleeding continues.', player: 'Ryan Costa' },
    { ts: Date.now() - 300000, type: 'score', text: 'Mike drains a 20-footer on #11 for birdie. Skin won!', player: 'Mike Torres' },
    { ts: Date.now() - 400000, type: 'chirp', text: 'Ryan hasn\'t won a skin since the parking lot. Someone buy him a beer.', player: 'System' },
    { ts: Date.now() - 500000, type: 'score', text: 'Skin carries on #4. Pot growing to $10.', player: 'System' },
  ];
  await env.MG_BOOK.put(`demo-buddies:feed`, JSON.stringify(feed));

  return { seeded: true };
}

async function seedDemoScramble(env) {
  const KEY = 'config:demo-scramble';
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const teamNames = ['The Wolves', 'The Falcons', 'The Mustangs', 'The Vipers', 'The Titans', 'The Panthers', 'The Rockets', 'The Sharks'];
  const teams = teamNames.map((name, i) => ({ name, handicapIndex: [5.2, 4.8, 6.1, 5.5, 7.0, 4.2, 6.8, 5.9][i] }));
  const pars = [4,5,3,4,4,4,3,5,4, 4,3,4,5,4,3,4,5,4]; // par 72

  const config = {
    event: { name: 'Spring Scramble 2026', shortName: 'Spring Scramble', eventType: 'scramble', course: 'TPC Sawgrass', currentRound: 1, venue: 'TPC Sawgrass' },
    players: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    roster: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    teams: teams,
    games: { scramble: true },
    structure: {},
    holesPerRound: 18,
    course: { name: 'TPC Sawgrass', pars: pars, tees: 'Blue' },
    rounds: { '1': { course: 'TPC Sawgrass', tees: 'Blue' } },
    scrambleEntryFee: 200,
    scrambleTeams: teams,
    scrambleSideGames: { closestToPin: [3, 7, 12, 17], longestDrive: [5, 14] },
    scramblePrizePool: { total: 1600, payouts: { 1: 800, 2: 400, 3: 240 }, ctpPerHole: 40 },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Pre-seed 9 holes — tight leaderboard with fun team names
  //                     Alpha Bravo Charlie Delta Eagle Falcon Grizzly Hawk
  // Hand-crafted scores for 14 holes — tight race, 4 holes to go
  //                Wolves Falc  Must  Viper Titan Panth Rockt Shark
  const holeScores = [
    /*1  p4*/ [3, 4, 4, 3, 4, 3, 4, 4],
    /*2  p5*/ [4, 4, 5, 4, 5, 4, 4, 5],
    /*3  p3*/ [3, 2, 3, 3, 3, 2, 3, 3],  // CTP: Panthers (2' 8")
    /*4  p4*/ [3, 4, 4, 4, 4, 3, 3, 4],
    /*5  p4*/ [4, 3, 4, 4, 3, 4, 4, 3],  // LD: Wolves (312 yds)
    /*6  p4*/ [3, 4, 3, 4, 4, 3, 4, 4],
    /*7  p3*/ [3, 3, 3, 2, 3, 3, 2, 3],  // CTP: Vipers (4' 1")
    /*8  p5*/ [4, 5, 4, 4, 5, 4, 5, 4],
    /*9  p4*/ [3, 4, 4, 3, 4, 4, 3, 4],
    /*10 p4*/ [3, 4, 3, 4, 4, 3, 4, 3],
    /*11 p3*/ [3, 3, 3, 3, 2, 3, 3, 3],
    /*12 p4*/ [4, 3, 4, 3, 4, 3, 4, 4],  // CTP: Rockets (6' 5") — note: hole 12 is par 4 but treat as CTP hole
    /*13 p5*/ [4, 4, 4, 5, 4, 4, 4, 5],
    /*14 p4*/ [3, 4, 3, 4, 4, 4, 3, 4],  // LD: Falcons (298 yds)
  ];
  // Only use hand-crafted scores (14 holes) — do NOT auto-fill to 18
  const completeHoleScores = holeScores;

  const holes = {};
  const totals = {};
  teamNames.forEach(t => { totals[t] = 0; });

  const holesScored = completeHoleScores.length; // 14
  for (let h = 1; h <= holesScored; h++) {
    const s = {};
    teamNames.forEach((t, i) => {
      s[t] = completeHoleScores[h - 1][i];
      totals[t] += completeHoleScores[h - 1][i];
    });
    holes[h] = { scores: s, timestamp: Date.now() - (holesScored - h) * 600000 };
  }
  await env.MG_BOOK.put('demo-scramble:holes', JSON.stringify(holes));

  // Build scramble leaderboard from totals
  const leaderboard = teamNames.map(t => ({ team: t, total: totals[t] }))
    .sort((a, b) => a.total - b.total)
    .map((entry, i) => ({ ...entry, position: i + 1 }));

  // Build per-hole results for the scramble engine state
  const scrambleHoles = {};
  for (let h = 1; h <= holesScored; h++) {
    scrambleHoles[h] = {};
    teamNames.forEach((t, i) => { scrambleHoles[h][t] = completeHoleScores[h - 1][i]; });
  }

  const gameState = {
    scramble: {
      running: totals,
      holes: scrambleHoles,
      leaderboard: leaderboard
    },
    sideGames: {
      ctp: {
        3: 'The Panthers (2\' 8")',
        7: 'The Vipers (4\' 1")',
        12: 'The Rockets (6\' 5")'
      },
      ld: {
        5: 'The Wolves (312 yds)',
        14: 'The Falcons (298 yds)'
      }
    }
  };
  await env.MG_BOOK.put('demo-scramble:game-state', JSON.stringify(gameState));

  const baseTs = new Date().setHours(10, 15, 0, 0);
  const feed = [
    { ts: baseTs + 87 * 60000, type: 'chirp', text: 'Front 9 complete. Three teams within a shot. Back 9 is going to be a war.', player: 'System' },
    { ts: baseTs + 82 * 60000, type: 'score', text: 'The Vipers ace the par 3 7th. Best shot of the day. The tent erupted.', player: 'The Vipers' },
    { ts: baseTs + 75 * 60000, type: 'score', text: 'The Falcons birdie #6. Tied for the lead at -5. Ice in their veins.', player: 'The Falcons' },
    { ts: baseTs + 68 * 60000, type: 'score', text: 'The Wolves eagle #5. The avalanche has started — they\'re -6 through 5.', player: 'The Wolves' },
    { ts: baseTs + 55 * 60000, type: 'score', text: 'The Panthers hit it to 4 feet on 7. Birdie inevitable. They\'re lurking.', player: 'The Panthers' },
    { ts: baseTs + 42 * 60000, type: 'chirp', text: 'Three teams deadlocked at -5 heading to the back nine. Buckle up.', player: 'System' },
    { ts: baseTs + 35 * 60000, type: 'score', text: 'The Titans shoot +1 through 6. Bracket busted already. Drinks on them.', player: 'The Titans' },
    { ts: baseTs + 22 * 60000, type: 'score', text: 'The Falcons\' birdie putt lips out on 3. The howl heard across the course.', player: 'The Falcons' },
    { ts: baseTs + 12 * 60000, type: 'side', text: 'Closest to pin on #4: The Vipers, 6\' 2\". Money on the line.', player: 'The Vipers' },
    { ts: baseTs, type: 'score', text: 'The Falcons fire -4 on the front. They\'re coming. Nobody\'s safe.', player: 'The Falcons' },
  ];
  await env.MG_BOOK.put('demo-scramble:feed', JSON.stringify(feed));

  return { seeded: true };
}

async function seedDemoEvent(env) {
  const KEY = 'config:cabot-citrus-invitational';
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false, reason: 'already exists' };

  // Event config
  const config = {
    event: {
      name: 'Cabot Citrus Invitational 2026',
      shortName: 'Cabot Citrus',
      venue: 'Cabot Citrus Farms',
      url: 'https://betwaggle.com/cabot-citrus-invitational/',
      dates: { day1: '2026-04-15' },
      format: 'skins',
      adminPin: randomPin(),
      adminContact: '',
      eventType: 'buddies_trip',
      status: 'active',
    },
    scoring: { holesPerMatch: 18, handicapAllowance: 0.85 },
    structure: { nassauBet: 20, skinsBet: 10, autoPress: { enabled: true, threshold: 2 } },
    features: { betting: true },
    games: { skins: true, nassau: true, wolf: true },
    holesPerRound: 18,
    players: [
      { name: 'Tiger Woods', handicapIndex: 0.6, venmo: '@tigerwoods' },
      { name: 'Rory McIlroy', handicapIndex: -1.2, venmo: '@rorymci' },
      { name: 'Phil Mickelson', handicapIndex: 2.1, venmo: '@philmickelson' },
      { name: 'Dustin Johnson', handicapIndex: 0.4, venmo: '@djohnson' },
      { name: 'Jon Rahm', handicapIndex: -0.8, venmo: '@jonrahm' },
      { name: 'Justin Thomas', handicapIndex: 0.2, venmo: '@justinthomas' },
      { name: 'Scottie Scheffler', handicapIndex: -0.5, venmo: '@scheffler' },
      { name: 'Brooks Koepka', handicapIndex: 1.0, venmo: '@bkoepka' },
    ],
    roster: [
      { name: 'Tiger Woods', handicapIndex: 0.6 },
      { name: 'Rory McIlroy', handicapIndex: -1.2 },
      { name: 'Phil Mickelson', handicapIndex: 2.1 },
      { name: 'Dustin Johnson', handicapIndex: 0.4 },
      { name: 'Jon Rahm', handicapIndex: -0.8 },
      { name: 'Justin Thomas', handicapIndex: 0.2 },
      { name: 'Scottie Scheffler', handicapIndex: -0.5 },
      { name: 'Brooks Koepka', handicapIndex: 1.0 },
    ],
    wolfOrder: ['Tiger Woods', 'Rory McIlroy', 'Phil Mickelson', 'Dustin Johnson', 'Jon Rahm', 'Justin Thomas', 'Scottie Scheffler', 'Brooks Koepka'],
    teams: {},
    flights: {},
    flightOrder: [],
    pairings: {},
    theme: { primary: '#1A472A', accent: '#D4AF37', bg: '#F5F0E8', headerFont: 'Inter', bodyFont: 'Inter' },
  };

  // Hole scores (holes 1-14)
  const now = Date.now();
  const holeScores = {
    1: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 3, 'Phil Mickelson': 5, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 3, 'Scottie Scheffler': 4, 'Brooks Koepka': 5 }, timestamp: now - 180000 },
    2: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 4, 'Phil Mickelson': 4, 'Dustin Johnson': 3, 'Jon Rahm': 3, 'Justin Thomas': 4, 'Scottie Scheffler': 3, 'Brooks Koepka': 4 }, timestamp: now - 170000 },
    3: { scores: { 'Tiger Woods': 5, 'Rory McIlroy': 4, 'Phil Mickelson': 5, 'Dustin Johnson': 5, 'Jon Rahm': 4, 'Justin Thomas': 5, 'Scottie Scheffler': 4, 'Brooks Koepka': 6 }, timestamp: now - 160000 },
    4: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 4, 'Phil Mickelson': 4, 'Dustin Johnson': 3, 'Jon Rahm': 5, 'Justin Thomas': 4, 'Scottie Scheffler': 4, 'Brooks Koepka': 4 }, timestamp: now - 150000 },
    5: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 3, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 3, 'Justin Thomas': 3, 'Scottie Scheffler': 3, 'Brooks Koepka': 4 }, timestamp: now - 140000 },
    6: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 5, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 5, 'Brooks Koepka': 5 }, timestamp: now - 130000 },
    7: { scores: { 'Tiger Woods': 2, 'Rory McIlroy': 3, 'Phil Mickelson': 3, 'Dustin Johnson': 3, 'Jon Rahm': 3, 'Justin Thomas': 4, 'Scottie Scheffler': 3, 'Brooks Koepka': 3 }, timestamp: now - 120000 },
    8: { scores: { 'Tiger Woods': 5, 'Rory McIlroy': 4, 'Phil Mickelson': 6, 'Dustin Johnson': 5, 'Jon Rahm': 4, 'Justin Thomas': 5, 'Scottie Scheffler': 4, 'Brooks Koepka': 5 }, timestamp: now - 110000 },
    9: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 3, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 3, 'Brooks Koepka': 5 }, timestamp: now - 100000 },
    10: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 4, 'Phil Mickelson': 5, 'Dustin Johnson': 4, 'Jon Rahm': 3, 'Justin Thomas': 4, 'Scottie Scheffler': 4, 'Brooks Koepka': 4 }, timestamp: now - 90000 },
    11: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 3, 'Phil Mickelson': 3, 'Dustin Johnson': 4, 'Jon Rahm': 3, 'Justin Thomas': 3, 'Scottie Scheffler': 3, 'Brooks Koepka': 4 }, timestamp: now - 80000 },
    12: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 5, 'Phil Mickelson': 4, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 5, 'Brooks Koepka': 4 }, timestamp: now - 70000 },
    13: { scores: { 'Tiger Woods': 3, 'Rory McIlroy': 2, 'Phil Mickelson': 3, 'Dustin Johnson': 3, 'Jon Rahm': 3, 'Justin Thomas': 3, 'Scottie Scheffler': 3, 'Brooks Koepka': 3 }, timestamp: now - 60000 },
    14: { scores: { 'Tiger Woods': 4, 'Rory McIlroy': 4, 'Phil Mickelson': 5, 'Dustin Johnson': 4, 'Jon Rahm': 4, 'Justin Thomas': 4, 'Scottie Scheffler': 4, 'Brooks Koepka': 5 }, timestamp: now - 50000 },
  };

  // Game state
  const gameState = {
    skins: {
      pot: 1,
      holes: {
        1: { winner: 'Rory McIlroy', potWon: 1 },
        2: { carried: true },
        3: { carried: true },
        4: { winner: 'Dustin Johnson', potWon: 3 },
        5: { carried: true },
        6: { carried: true },
        7: { winner: 'Tiger Woods', potWon: 3 },
        8: { carried: true },
        9: { winner: 'Rory McIlroy', potWon: 2 },
        10: { winner: 'Jon Rahm', potWon: 1 },
        11: { carried: true },
        12: { carried: true },
        13: { winner: 'Rory McIlroy', potWon: 3 },
        14: { carried: true },
      },
    },
    nassau: {
      running: {
        'Tiger Woods': { front: 34, back: 18, total: 52 },
        'Rory McIlroy': { front: 33, back: 18, total: 51 },
        'Scottie Scheffler': { front: 33, back: 19, total: 52 },
        'Jon Rahm': { front: 34, back: 17, total: 51 },
        'Justin Thomas': { front: 34, back: 18, total: 52 },
        'Dustin Johnson': { front: 35, back: 19, total: 54 },
        'Phil Mickelson': { front: 38, back: 20, total: 58 },
        'Brooks Koepka': { front: 41, back: 21, total: 62 },
      },
      frontWinner: 'Rory McIlroy',
      presses: [],
    },
  };

  // Bets
  const bets = [
    { id: 'bet-demo-1', bettor: 'Gallery Fan', type: 'match_winner', selection: 'Tiger Woods', matchId: 'nassau', description: 'Tiger to win Nassau overall', stake: 50, odds: 2.1, americanOdds: '+110', status: 'active', createdAt: new Date().toISOString() },
    { id: 'bet-demo-2', bettor: 'The Degenerate', type: 'match_winner', selection: 'Rory McIlroy', matchId: 'skins', description: 'Rory to lead skins', stake: 30, odds: 1.8, americanOdds: '-125', status: 'active', createdAt: new Date().toISOString() },
    { id: 'bet-demo-3', bettor: 'Club Pro', type: 'game_winner', selection: 'Jon Rahm', matchId: 'nassau', description: 'Rahm to win Nassau back 9', stake: 25, odds: 3.0, americanOdds: '+200', status: 'active', createdAt: new Date().toISOString() },
  ];

  // Feed
  const feed = [
    { id: 'feed-1', type: 'score', player: 'Tiger Woods', text: 'Tiger Woods made a deuce on Hole 7!', emoji: '', ts: now - 120000 },
    { id: 'feed-2', type: 'score', player: 'Rory McIlroy', text: 'Rory McIlroy eagled Hole 13!', emoji: '', ts: now - 60000 },
    { id: 'feed-3', type: 'chirp', player: 'The Degenerate', text: 'Tiger is dialed in today', emoji: '', ts: now - 90000 },
    { id: 'feed-4', type: 'score', player: 'Nassau', text: 'Rory is 1 UP thru 14 in the Nassau', emoji: '', ts: now - 40000 },
    { id: 'feed-5', type: 'press', player: 'Brooks Koepka', text: 'Auto-press! Brooks is 3-down on the front', emoji: '', ts: now - 100000, auto: true },
  ];

  // Settings
  const settings = {
    announcements: ['Welcome to the Cabot Citrus Invitational! Nassau $20, Skins $10, Wolf active. Good luck.'],
    lockedMatches: [],
    oddsOverrides: {},
  };

  // Write all keys to KV
  const slug = 'cabot-citrus-invitational';
  await Promise.all([
    env.MG_BOOK.put(KEY, JSON.stringify(config)),
    env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holeScores)),
    env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState)),
    env.MG_BOOK.put(`${slug}:bets`, JSON.stringify(bets)),
    env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed)),
    env.MG_BOOK.put(`${slug}:settings`, JSON.stringify(settings)),
  ]);

  console.log('Demo event seeded: cabot-citrus-invitational');
  return { seeded: true, slug, keys: [KEY, `${slug}:holes`, `${slug}:game-state`, `${slug}:bets`, `${slug}:feed`, `${slug}:settings`] };
}

async function seedFriscoV2(env) {
  const slug = 'pga-frisco-2026';
  const existing = await env.MG_BOOK.get(`config:${slug}`, 'json');
  // Check if existing event has the correct player names — if not, force re-seed
  const needsUpdate = existing && (!existing.players?.some(p => p.name === 'Joseph Weill'));
  if (existing && !needsUpdate) return { seeded: false, reason: 'already exists' };
  // Delete old data if re-seeding
  if (needsUpdate) {
    for (const k of ['holes','game-state','bets','feed','settings','scores','players']) {
      await env.MG_BOOK.delete(`${slug}:${k}`).catch(()=>{});
    }
  }
  const config = {
    event: { name: 'PGA Frisco 2026', shortName: 'PGA Frisco', venue: 'Fields Ranch at PGA Frisco', url: `https://betwaggle.com/${slug}/`, dates: { day1: '2026-03-28', day2: '2026-03-29' }, format: 'nassau', adminPin: randomPin(), adminContact: 'joe@joeweill.com', eventType: 'buddies_trip', slug },
    scoring: { holesPerMatch: 18, handicapAllowance: 0.85 },
    structure: { nassauBet: 10, skinsBet: 5, autoPress: { enabled: true, threshold: 2 } },
    features: { betting: true },
    games: { nassau: true, skins: true, wolf: true, vegas: false, stableford: false, match_play: false, stroke_play: false, banker: false, bloodsome: false, bingo: false, nines: false, scramble: false },
    holesPerRound: 18,
    players: [
      { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
      { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
      { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
      { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
    ],
    roster: [
      { name: 'Joseph Weill', handicapIndex: 7.8, venmo: '', club: 'Tavistock' },
      { name: 'Andrew Morrison', handicapIndex: 12.4, venmo: '', club: 'Eligo' },
      { name: 'Robert Edgerton', handicapIndex: 11.2, venmo: '', club: 'Woodland' },
      { name: 'Benjamin Samuels', handicapIndex: 5.2, venmo: '', club: 'CC of Maryland' },
    ],
    wolfOrder: ['Joseph Weill', 'Andrew Morrison', 'Robert Edgerton', 'Benjamin Samuels'],
    teams: {}, flights: {}, flightOrder: [], pairings: {},
    theme: { primary: '#1A472A', accent: '#D4AF37', bg: '#F5F0E8', headerFont: 'Inter', bodyFont: 'Inter' },
    course: { id: 'pga-frisco-east', name: 'Fields Ranch East at PGA Frisco' },
    coursePars: [5,4,5,3,4,4,4,3,4,4,4,4,3,5,4,4,3,5],
    courseHcpIndex: [9,5,17,11,7,1,13,15,3,8,12,4,10,2,14,6,18,16],
    rounds: { 1: { course: 'Fields Ranch East', courseId: 'pga-frisco-east', tees: 'Three Tees (~6,500)', par: 72 }, 2: { course: 'Fields Ranch East', courseId: 'pga-frisco-east', tees: 'Three Tees (~6,500)', par: 72 }, 3: { course: 'Fields Ranch West', courseId: 'pga-frisco-west', tees: 'Combo Tees (~6,400)', par: 72 } },
  };
  await env.MG_BOOK.put(`config:${slug}`, JSON.stringify(config));
  await env.MG_BOOK.put(`${slug}:settings`, JSON.stringify({ announcements: ['Welcome to PGA Frisco 2026! Nassau $10, Skins $5, Wolf. Auto-press at 2-down.'], lockedMatches: [], oddsOverrides: {} }));
  for (const email of ['joe@joeweill.com', 'evan.ratner@gmail.com']) {
    const slugs = (await env.MG_BOOK.get(`commissioner:${email}`, 'json')) || [];
    if (!slugs.includes(slug)) { slugs.push(slug); await env.MG_BOOK.put(`commissioner:${email}`, JSON.stringify(slugs)); }
  }
  return { seeded: true, slug, url: `https://betwaggle.com/${slug}/` };
}

async function seedLegendsTrip(env) {
  const slug = 'legends-trip';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Tiger Woods', handicapIndex: 2.1, venmo: '@tigerwoods' },
    { name: 'Phil Mickelson', handicapIndex: 3.8, venmo: '@philmickelson' },
    { name: 'Jordan Spieth', handicapIndex: 1.5, venmo: '@jordanspieth' },
    { name: 'Rickie Fowler', handicapIndex: 4.2, venmo: '@rickiefowler' }
  ];
  const pars = [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,3,4,5]; // Pebble Beach par 72

  const config = {
    event: { name: 'The Legends Trip', shortName: 'Legends Trip', eventType: 'buddies_trip', course: 'Pebble Beach Golf Links', currentRound: 1, venue: 'Pebble Beach Golf Links', slug },
    players: players,
    roster: players,
    games: { nassau: true, skins: true, wolf: true },
    structure: { nassauBet: '25', skinsBet: '10', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Pebble Beach Golf Links', pars: pars, tees: 'Championship' },
    rounds: { '1': { course: 'Pebble Beach Golf Links', tees: 'Championship' } },
    wolfOrder: ['Tiger Woods', 'Phil Mickelson', 'Jordan Spieth', 'Rickie Fowler'],
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Scores through 14 holes — Tiger and Jordan battling, Phil pressing
  const scoreData = {
    1:  { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    2:  { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 5 },
    3:  { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 4 },
    4:  { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 4, 'Rickie Fowler': 5 },
    5:  { 'Tiger Woods': 3, 'Phil Mickelson': 3, 'Jordan Spieth': 2, 'Rickie Fowler': 3 },
    6:  { 'Tiger Woods': 5, 'Phil Mickelson': 4, 'Jordan Spieth': 5, 'Rickie Fowler': 5 },
    7:  { 'Tiger Woods': 2, 'Phil Mickelson': 3, 'Jordan Spieth': 3, 'Rickie Fowler': 3 },
    8:  { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    9:  { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 4, 'Rickie Fowler': 5 },
    10: { 'Tiger Woods': 3, 'Phil Mickelson': 4, 'Jordan Spieth': 4, 'Rickie Fowler': 4 },
    11: { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 4 },
    12: { 'Tiger Woods': 3, 'Phil Mickelson': 3, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    13: { 'Tiger Woods': 4, 'Phil Mickelson': 4, 'Jordan Spieth': 3, 'Rickie Fowler': 4 },
    14: { 'Tiger Woods': 4, 'Phil Mickelson': 5, 'Jordan Spieth': 4, 'Rickie Fowler': 5 }
  };
  const completeScores = buildFullStrokeScores(scoreData, players.map(p => p.name), pars);

  const holes = {};
  for (const [h, s] of Object.entries(completeScores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (pars.length - parseInt(h, 10)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins — lowest unique score wins, carry on ties
  const skinsBet = 10;
  const numPlayers = 4;
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= pars.length; h++) {
    const hScores = completeScores[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * (numPlayers - 1) * skinsBet });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  // Feed with narrative entries
  const feed = [
    { ts: Date.now() - 80000, type: 'score', text: 'Tiger eagles the par-3 7th. Skin won ($30).', player: 'Tiger Woods' },
    { ts: Date.now() - 160000, type: 'score', text: 'Jordan birdies #1 to take early lead.', player: 'Jordan Spieth' },
    { ts: Date.now() - 240000, type: 'score', text: 'Phil bogeys #11. Pressing on the back 9.', player: 'Phil Mickelson' },
    { ts: Date.now() - 320000, type: 'chirp', text: "Rickie can't buy a skin. 0 for 14.", player: 'System' },
    { ts: Date.now() - 400000, type: 'score', text: 'Jordan birdies the par-3 5th. Two-shot lead over Tiger.', player: 'Jordan Spieth' },
    { ts: Date.now() - 480000, type: 'score', text: 'Tiger birdies #10 to close the gap on Jordan.', player: 'Tiger Woods' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

async function seedStagNight(env) {
  const slug = 'stag-night';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Warren Buffett', handicapIndex: 18.0, venmo: '@warrenbuffett' },
    { name: 'Jamie Dimon', handicapIndex: 12.5, venmo: '@jamiedimon' },
    { name: 'Ray Dalio', handicapIndex: 9.3, venmo: '@raydalio' },
    { name: 'Bill Ackman', handicapIndex: 15.7, venmo: '@billackman' }
  ];
  const pars = [4,4,4,4,5,4,5,3,4, 4,4,4,3,4,5,4,3,4]; // Bethpage Black par 71

  const config = {
    event: { name: 'The Stag Night Classic', shortName: 'Stag Night', eventType: 'buddies_trip', course: 'Bethpage Black', currentRound: 1, venue: 'Bethpage State Park', slug, status: 'complete', frozenAt: new Date().toISOString() },
    players: players,
    roster: players,
    games: { nassau: true, skins: true },
    structure: { nassauBet: '50', skinsBet: '20', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Bethpage Black', pars: pars, tees: 'Blue' },
    rounds: { '1': { course: 'Bethpage Black', tees: 'Blue' } },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // All 18 holes — Ray dominates, Warren gets destroyed
  const scoreData = {
    1:  { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 6 },
    2:  { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    3:  { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    4:  { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    5:  { 'Warren Buffett': 6, 'Jamie Dimon': 6, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    6:  { 'Warren Buffett': 5, 'Jamie Dimon': 4, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    7:  { 'Warren Buffett': 7, 'Jamie Dimon': 6, 'Ray Dalio': 6, 'Bill Ackman': 6 },
    8:  { 'Warren Buffett': 4, 'Jamie Dimon': 3, 'Ray Dalio': 3, 'Bill Ackman': 4 },
    9:  { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    10: { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    11: { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    12: { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    13: { 'Warren Buffett': 4, 'Jamie Dimon': 4, 'Ray Dalio': 3, 'Bill Ackman': 4 },
    14: { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 },
    15: { 'Warren Buffett': 7, 'Jamie Dimon': 6, 'Ray Dalio': 5, 'Bill Ackman': 6 },
    16: { 'Warren Buffett': 5, 'Jamie Dimon': 5, 'Ray Dalio': 4, 'Bill Ackman': 5 },
    17: { 'Warren Buffett': 4, 'Jamie Dimon': 3, 'Ray Dalio': 3, 'Bill Ackman': 4 },
    18: { 'Warren Buffett': 6, 'Jamie Dimon': 5, 'Ray Dalio': 5, 'Bill Ackman': 5 }
  };

  const holes = {};
  for (const [h, s] of Object.entries(scoreData)) {
    holes[h] = { scores: s, timestamp: Date.now() - (18 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins for all 18 holes
  const skinsBet = 20;
  const numPlayers = 4;
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 18; h++) {
    const hScores = scoreData[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * (numPlayers - 1) * skinsBet });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  // Feed with narrative
  const feed = [
    { ts: Date.now() - 50000, type: 'score', text: 'Ray shoots 80 on Bethpage Black. Dominant performance.', player: 'Ray Dalio' },
    { ts: Date.now() - 100000, type: 'score', text: "Warren takes a 7 on the par-5 7th. That's $60 in skins.", player: 'Warren Buffett' },
    { ts: Date.now() - 150000, type: 'score', text: "Jamie presses on the back 9. It doesn't help.", player: 'Jamie Dimon' },
    { ts: Date.now() - 200000, type: 'chirp', text: 'Ray Dalio wins every Nassau leg. Total domination.', player: 'System' },
    { ts: Date.now() - 250000, type: 'score', text: 'Bill Ackman cards a 93. "I had a position in every hole."', player: 'Bill Ackman' },
    { ts: Date.now() - 300000, type: 'chirp', text: 'Warren owes everyone. As usual, he says he will pay in Berkshire stock.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

async function seedAugustaScramble(env) {
  const slug = 'augusta-scramble';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const teamNames = [
    'Team Amen Corner', 'Team Magnolia Lane', 'Team Azalea', 'Team Juniper',
    'Team Dogwood', 'Team Redbud', 'Team Yellow Jasmine', 'Team Camellia',
    'Team Flowering Peach', 'Team Chinese Fir', 'Team Firethorn', 'Team Golden Bell'
  ];
  const teams = teamNames.map((name, i) => ({
    name,
    handicapIndex: [4.5, 5.2, 4.8, 6.0, 5.5, 4.1, 5.8, 6.3, 5.0, 6.5, 4.3, 5.7][i]
  }));
  const pars = [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4]; // Augusta National (approx) par 72

  const config = {
    event: { name: 'Augusta Charity Scramble', shortName: 'Augusta Scramble', eventType: 'scramble', course: 'Augusta National Golf Club', currentRound: 1, venue: 'Augusta National Golf Club', slug },
    players: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    roster: teams.map(t => ({ name: t.name, handicapIndex: t.handicapIndex })),
    teams: teams,
    games: { scramble: true },
    structure: {},
    features: { calcutta: true },
    holesPerRound: 18,
    course: { name: 'Augusta National Golf Club', pars: pars, tees: 'Tournament' },
    rounds: { '1': { course: 'Augusta National Golf Club', tees: 'Tournament' } },
    scrambleEntryFee: 250,
    scrambleTeams: teams,
    scrambleSideGames: { closestToPin: [4, 6, 12, 16], longestDrive: [2, 8, 13] },
    scramblePrizePool: { total: 3000, payouts: { 1: 1500, 2: 750, 3: 450 }, ctpPerHole: 75 },
    sponsors: {
      3: { name: 'Goldman Sachs', hole: 3 },
      7: { name: 'Morgan Stanley', hole: 7 },
      12: { name: 'JP Morgan', hole: 12 },
      16: { name: 'Blackstone', hole: 16 }
    },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // 12 holes scored — tight leaderboard, 3 teams within 1 stroke
  //                           AmenC MagnL Azale Junip Dogwd Redbd YellJ Camel FlwPc ChnFr Firth GldBl
  const holeScores = [
    /* 1 p4*/ [ 3,  4,  3,  4,  4,  3,  4,  4,  3,  4,  3,  4 ],
    /* 2 p5*/ [ 4,  4,  4,  5,  4,  4,  5,  4,  4,  5,  4,  4 ],
    /* 3 p4*/ [ 3,  4,  3,  4,  3,  4,  4,  3,  4,  4,  3,  3 ],
    /* 4 p3*/ [ 3,  3,  2,  3,  3,  2,  3,  3,  2,  3,  3,  3 ],
    /* 5 p4*/ [ 3,  4,  4,  4,  3,  3,  4,  4,  4,  3,  4,  3 ],
    /* 6 p3*/ [ 3,  2,  3,  3,  3,  3,  3,  2,  3,  3,  2,  3 ],
    /* 7 p4*/ [ 3,  4,  3,  4,  4,  3,  4,  4,  3,  4,  4,  3 ],
    /* 8 p5*/ [ 4,  4,  4,  5,  4,  4,  5,  5,  4,  4,  4,  4 ],
    /* 9 p4*/ [ 3,  4,  3,  4,  4,  3,  4,  4,  3,  4,  3,  4 ],
    /*10 p4*/ [ 3,  4,  4,  4,  3,  3,  4,  4,  4,  3,  4,  3 ],
    /*11 p4*/ [ 3,  4,  3,  4,  4,  4,  4,  3,  4,  4,  3,  4 ],
    /*12 p3*/ [ 2,  3,  3,  3,  2,  3,  3,  3,  3,  2,  3,  2 ],
  ];
  const completeHoleScores = buildFullScrambleScores(holeScores, teamNames.length, pars);

  const holes = {};
  const totals = {};
  teamNames.forEach(t => { totals[t] = 0; });

  for (let h = 1; h <= pars.length; h++) {
    const s = {};
    teamNames.forEach((t, i) => {
      s[t] = completeHoleScores[h - 1][i];
      totals[t] += completeHoleScores[h - 1][i];
    });
    holes[h] = { scores: s, timestamp: Date.now() - (pars.length - h) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Build scramble leaderboard
  const leaderboard = teamNames.map(t => ({ team: t, total: totals[t] }))
    .sort((a, b) => a.total - b.total)
    .map((entry, i) => ({ ...entry, position: i + 1 }));

  const scrambleHoles = {};
  for (let h = 1; h <= pars.length; h++) {
    scrambleHoles[h] = {};
    teamNames.forEach((t, i) => { scrambleHoles[h][t] = completeHoleScores[h - 1][i]; });
  }

  const nowTs = Date.now();
  const gameState = {
    scramble: {
      running: totals,
      holes: scrambleHoles,
      leaderboard: leaderboard
    },
    sideGames: {
      ctp: {
        4: { status: 'awarded', winnerLabel: 'Team Azalea (3\' 7")', updatedAt: nowTs - 180000, updatedBy: 'admin' },
        6: { status: 'deferred', winnerLabel: '', updatedAt: nowTs - 90000, updatedBy: 'admin', note: 'Two balls inside 6 ft — commissioner measuring at turn.' }
      },
      ld: {
        2: { status: 'awarded', winnerLabel: 'Team Redbud (314 yds)', updatedAt: nowTs - 240000, updatedBy: 'admin' },
        8: { status: 'awarded', winnerLabel: 'Team Firethorn (298 yds)', updatedAt: nowTs - 60000, updatedBy: 'admin' }
      }
    }
  };
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  const feed = [
    { ts: Date.now() - 60000, type: 'score', text: 'Team Amen Corner aces the par-3 12th over Rae\'s Creek. Golden Bell sponsor JP Morgan pays $500 bonus.', player: 'Team Amen Corner' },
    { ts: Date.now() - 120000, type: 'score', text: 'Team Azalea birdies #4 — the ace hole. Three teams now tied at -9.', player: 'Team Azalea' },
    { ts: Date.now() - 180000, type: 'chirp', text: 'Through 12 holes: Amen Corner, Redbud, and Firethorn all at -9. This is going to the wire.', player: 'System' },
    { ts: Date.now() - 240000, type: 'score', text: 'Team Redbud eagles the par-5 8th. Jumps into the lead.', player: 'Team Redbud' },
    { ts: Date.now() - 300000, type: 'score', text: 'Team Magnolia Lane bogeys #5. Dropping out of contention.', player: 'Team Magnolia Lane' },
    { ts: Date.now() - 360000, type: 'chirp', text: 'Calcutta pool at $3,000. The Goldman Sachs hole (#3) still unclaimed for closest-to-the-pin.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

async function seedMastersMG(env) {
  const slug = 'masters-member-guest';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  // 24 teams, 4 flights of 6, round-robin 5 rounds
  const teams = {
    // Flight A — Championship (low combined HI)
    '1':  { member: 'Scottie Scheffler', guest: 'Sam Burns',       memberHI: 0.2, guestHI: 1.5, combined: 1.7, flight: 'A' },
    '2':  { member: 'Xander Schauffele',  guest: 'Tony Finau',     memberHI: 0.4, guestHI: 2.0, combined: 2.4, flight: 'A' },
    '3':  { member: 'Jon Rahm',           guest: 'Viktor Hovland', memberHI: 0.6, guestHI: 1.8, combined: 2.4, flight: 'A' },
    '4':  { member: 'Rory McIlroy',       guest: 'Shane Lowry',    memberHI: 0.5, guestHI: 2.2, combined: 2.7, flight: 'A' },
    '5':  { member: 'Patrick Cantlay',    guest: 'Max Homa',       memberHI: 0.8, guestHI: 2.1, combined: 2.9, flight: 'A' },
    '6':  { member: 'Justin Thomas',      guest: 'Jordan Spieth',  memberHI: 0.7, guestHI: 1.9, combined: 2.6, flight: 'A' },
    // Flight B — First Flight
    '7':  { member: 'Brooks Koepka',      guest: 'Bryson DeChambeau', memberHI: 1.2, guestHI: 3.5, combined: 4.7, flight: 'B' },
    '8':  { member: 'Dustin Johnson',     guest: 'Phil Mickelson',    memberHI: 0.8, guestHI: 4.2, combined: 5.0, flight: 'B' },
    '9':  { member: 'Hideki Matsuyama',   guest: 'Adam Scott',        memberHI: 1.0, guestHI: 3.8, combined: 4.8, flight: 'B' },
    '10': { member: 'Cameron Smith',      guest: 'Marc Leishman',     memberHI: 1.4, guestHI: 4.0, combined: 5.4, flight: 'B' },
    '11': { member: 'Rickie Fowler',      guest: 'Kevin Kisner',      memberHI: 2.0, guestHI: 3.2, combined: 5.2, flight: 'B' },
    '12': { member: 'Tommy Fleetwood',    guest: 'Matt Fitzpatrick',  memberHI: 1.6, guestHI: 3.0, combined: 4.6, flight: 'B' },
    // Flight C — Second Flight
    '13': { member: 'Keegan Bradley',     guest: 'Zach Johnson',      memberHI: 2.5, guestHI: 5.0, combined: 7.5, flight: 'C' },
    '14': { member: 'Jason Day',          guest: 'Charl Schwartzel',  memberHI: 3.0, guestHI: 5.5, combined: 8.5, flight: 'C' },
    '15': { member: 'Bubba Watson',       guest: 'Webb Simpson',      memberHI: 2.8, guestHI: 5.2, combined: 8.0, flight: 'C' },
    '16': { member: 'Fred Couples',       guest: 'Davis Love III',    memberHI: 4.0, guestHI: 6.0, combined: 10.0, flight: 'C' },
    '17': { member: 'Vijay Singh',        guest: 'Retief Goosen',     memberHI: 3.5, guestHI: 5.8, combined: 9.3, flight: 'C' },
    '18': { member: 'Lee Westwood',       guest: 'Ian Poulter',       memberHI: 3.2, guestHI: 5.4, combined: 8.6, flight: 'C' },
    // Flight D — Third Flight (highest combined)
    '19': { member: 'Charles Barkley',    guest: 'Michael Jordan',    memberHI: 12.0, guestHI: 5.0, combined: 17.0, flight: 'D' },
    '20': { member: 'Bill Murray',        guest: 'Justin Timberlake', memberHI: 9.0,  guestHI: 8.5, combined: 17.5, flight: 'D' },
    '21': { member: 'Tony Romo',          guest: 'Peyton Manning',    memberHI: 1.5,  guestHI: 6.0, combined: 7.5, flight: 'D' },
    '22': { member: 'Mark Wahlberg',      guest: 'Chris Pratt',       memberHI: 8.0,  guestHI: 10.2, combined: 18.2, flight: 'D' },
    '23': { member: 'Tom Brady',          guest: 'Aaron Rodgers',     memberHI: 6.5,  guestHI: 7.0, combined: 13.5, flight: 'D' },
    '24': { member: 'Derek Jeter',        guest: 'Ken Griffey Jr',    memberHI: 7.0,  guestHI: 9.0, combined: 16.0, flight: 'D' },
  };

  const flights = {
    'A': { name: 'Championship Flight', teamIds: ['1','2','3','4','5','6'], tees: 'Tournament' },
    'B': { name: 'First Flight',        teamIds: ['7','8','9','10','11','12'], tees: 'Blue' },
    'C': { name: 'Second Flight',       teamIds: ['13','14','15','16','17','18'], tees: 'Blue' },
    'D': { name: 'Celebrity Flight',    teamIds: ['19','20','21','22','23','24'], tees: 'White' },
  };
  const flightOrder = ['A', 'B', 'C', 'D'];

  // Round-robin: 6 teams = 5 rounds, 3 matches per round
  function roundRobin(teamIds) {
    const n = teamIds.length; // 6
    const rounds = {};
    const ids = [...teamIds];
    for (let r = 1; r <= n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        pairs.push([ids[i], ids[n - 1 - i]]);
      }
      rounds[r] = pairs;
      // Rotate: fix first, shift rest
      const last = ids.pop();
      ids.splice(1, 0, last);
    }
    return rounds;
  }

  const pairings = {};
  for (const fId of flightOrder) {
    pairings[fId] = roundRobin(flights[fId].teamIds);
  }

  // Build player list from teams
  const players = [];
  for (const t of Object.values(teams)) {
    players.push({ name: t.member, handicapIndex: t.memberHI });
    players.push({ name: t.guest, handicapIndex: t.guestHI });
  }

  const pars = [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4]; // Augusta National par 72

  const config = {
    event: {
      name: 'The Masters Member-Guest',
      shortName: 'Masters M-G',
      eventType: 'member_guest',
      course: 'Augusta National Golf Club',
      currentRound: 4,
      venue: 'Augusta National Golf Club',
      slug,
    },
    teams,
    flights,
    flightOrder,
    pairings,
    players,
    roster: players,
    games: { match_play: true },
    structure: {
      roundsTotal: 5,
      matchPlayBet: 50,
      roundDays: { 1: 'Day 1', 2: 'Day 1', 3: 'Day 2', 4: 'Day 2', 5: 'Day 2' },
      roundTimes: { 1: '8:00 AM', 2: '1:00 PM', 3: '8:00 AM', 4: '1:00 PM', 5: '3:00 PM' },
    },
    holesPerRound: 18,
    course: { name: 'Augusta National Golf Club', pars, tees: 'Tournament' },
    rounds: {
      '1': { course: 'Augusta National', tees: 'Tournament' },
      '2': { course: 'Augusta National', tees: 'Tournament' },
      '3': { course: 'Augusta National', tees: 'Tournament' },
      '4': { course: 'Augusta National', tees: 'Tournament' },
      '5': { course: 'Augusta National', tees: 'Tournament' },
    },
    adminPin: randomPin(),
  };

  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // Seed match scores for rounds 1-3 (complete) and part of round 4 (in progress)
  // Score format: { matchId: { scoreA, scoreB, status } }
  // Cap rule: max 7-3 split, always sums to 10
  const scores = {};

  // Helper: generate a plausible match result (sums to 10, cap 7-3)
  function matchResult() {
    const outcomes = [[7,3],[6,4],[5,5],[4,6],[3,7]];
    return outcomes[Math.floor(Math.random() * outcomes.length)];
  }

  // Seed deterministic scores for a compelling storyline
  // Flight A: Scottie/Burns lead, Rahm/Hovland close behind
  const flightAScores = {
    'A-R1-P1': [7,3], 'A-R1-P2': [5,5], 'A-R1-P3': [6,4],  // R1
    'A-R2-P1': [6,4], 'A-R2-P2': [4,6], 'A-R2-P3': [7,3],  // R2
    'A-R3-P1': [5,5], 'A-R3-P2': [6,4], 'A-R3-P3': [5,5],  // R3
    'A-R4-P1': [6,4], 'A-R4-P2': [7,3],                      // R4 (2 of 3 done)
  };
  // Flight B: Fleetwood/Fitzpatrick lead, tight 3-way race
  const flightBScores = {
    'B-R1-P1': [5,5], 'B-R1-P2': [7,3], 'B-R1-P3': [4,6],
    'B-R2-P1': [6,4], 'B-R2-P2': [5,5], 'B-R2-P3': [6,4],
    'B-R3-P1': [3,7], 'B-R3-P2': [6,4], 'B-R3-P3': [5,5],
    'B-R4-P1': [5,5],
  };
  // Flight C: Couples/Love surprise leaders
  const flightCScores = {
    'C-R1-P1': [4,6], 'C-R1-P2': [6,4], 'C-R1-P3': [7,3],
    'C-R2-P1': [5,5], 'C-R2-P2': [7,3], 'C-R2-P3': [4,6],
    'C-R3-P1': [6,4], 'C-R3-P2': [5,5], 'C-R3-P3': [6,4],
    'C-R4-P1': [7,3], 'C-R4-P2': [4,6],
  };
  // Flight D: Brady/Rodgers crushing it, Romo/Manning close
  const flightDScores = {
    'D-R1-P1': [3,7], 'D-R1-P2': [5,5], 'D-R1-P3': [6,4],
    'D-R2-P1': [7,3], 'D-R2-P2': [6,4], 'D-R2-P3': [4,6],
    'D-R3-P1': [5,5], 'D-R3-P2': [7,3], 'D-R3-P3': [5,5],
    'D-R4-P1': [6,4],
  };

  const allScores = { ...flightAScores, ...flightBScores, ...flightCScores, ...flightDScores };
  for (const [matchId, [a, b]] of Object.entries(allScores)) {
    scores[matchId] = { scoreA: a, scoreB: b, status: 'final' };
  }

  // Mark some R4 matches as "live" so the dashboard shows live action
  // (the unscored R4 matches remain as generated with status "scheduled")
  // The last scored match in each flight's R4 → make it "live" instead of "final"
  const liveMatches = ['A-R4-P3', 'B-R4-P2', 'B-R4-P3', 'C-R4-P3', 'D-R4-P2', 'D-R4-P3'];
  for (const mid of liveMatches) {
    // These are in-progress: partial scores visible
    scores[mid] = { scoreA: 5, scoreB: 5, status: 'live' };
  }

  await env.MG_BOOK.put(`${slug}:scores`, JSON.stringify(scores));

  // Clear any stale data from previous seed format
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify({}));
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify({}));

  // Seed demo bets so Bet/My Bets tabs show content
  const demoBets = [
    { id: 'bet-1', bettor: 'Rory McIlroy', matchId: 'A-R4-P1', side: '1', amount: 50, odds: -150, status: 'active', ts: Date.now() - 3600000 },
    { id: 'bet-2', bettor: 'Phil Mickelson', matchId: 'B-R4-P2', side: '11', amount: 25, odds: 130, status: 'active', ts: Date.now() - 7200000 },
    { id: 'bet-3', bettor: 'Tom Brady', matchId: 'D-R4-P2', side: '23', amount: 100, odds: -200, status: 'active', ts: Date.now() - 1800000 },
    { id: 'bet-4', bettor: 'Justin Thomas', matchId: 'A-R5-P2', side: '3', amount: 75, odds: 110, status: 'pending', ts: Date.now() - 900000 },
    { id: 'bet-5', bettor: 'Michael Jordan', matchId: 'D-R5-P1', side: '19', amount: 200, odds: 250, status: 'pending', ts: Date.now() - 600000 },
    { id: 'bet-6', bettor: 'Fred Couples', matchId: 'C-R5-P1', side: '16', amount: 50, odds: -120, status: 'pending', ts: Date.now() - 300000 },
  ];
  await env.MG_BOOK.put(`${slug}:bets`, JSON.stringify(demoBets));

  // Seed player credits
  const playerCredits = {};
  for (const t of Object.values(teams)) {
    playerCredits[t.member] = { name: t.member, credits: 500, handicap: t.memberHI };
    playerCredits[t.guest] = { name: t.guest, credits: 500, handicap: t.guestHI };
  }
  await env.MG_BOOK.put(`${slug}:players`, JSON.stringify(playerCredits));

  // Activity feed
  const feed = [
    { ts: Date.now() - 5000,   type: 'bet',   text: 'Michael Jordan drops $200 on Barkley/Jordan to win Flight D. Bold.', player: 'Michael Jordan' },
    { ts: Date.now() - 15000,  type: 'score', text: 'Scheffler/Burns 7-3 over McIlroy/Lowry in R4. Championship flight leader extending.', player: 'System' },
    { ts: Date.now() - 30000,  type: 'score', text: 'Brady/Rodgers 6-4 in Celebrity Flight R4. They keep stacking points.', player: 'System' },
    { ts: Date.now() - 60000,  type: 'bet',   text: 'Tom Brady bets $100 on himself. Naturally.', player: 'Tom Brady' },
    { ts: Date.now() - 90000,  type: 'chirp', text: 'Couples and Love lead Second Flight. Augusta royalty still has game.', player: 'System' },
    { ts: Date.now() - 120000, type: 'score', text: 'Fleetwood/Fitzpatrick halve 5-5 with Koepka/DeChambeau. First Flight dead heat.', player: 'System' },
    { ts: Date.now() - 180000, type: 'chirp', text: 'Barkley three-putted from 4 feet on Amen Corner. Murray could not watch.', player: 'System' },
    { ts: Date.now() - 240000, type: 'score', text: 'Rahm/Hovland 6-4 in R3. One point behind Scheffler in Championship Flight.', player: 'System' },
    { ts: Date.now() - 300000, type: 'chirp', text: '42 of 60 matches complete. Round 5 is going to decide everything.', player: 'System' },
    { ts: Date.now() - 360000, type: 'bet',   text: 'Rory puts $50 on Scheffler/Burns to take Championship. Hedging against himself.', player: 'Rory McIlroy' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  // Settings with announcements
  const settings = {
    announcements: [
      'Round 4 in progress. Round 5 tee times at 3:00 PM. Dinner at the clubhouse at 7:00.',
    ],
    lockedMatches: [],
    oddsOverrides: {},
  };
  await env.MG_BOOK.put(`${slug}:settings`, JSON.stringify(settings));

  return { seeded: true };
}

async function seedWeekendWarrior(env) {
  const slug = 'weekend-warrior';
  const KEY = `config:${slug}`;
  const existing = await env.MG_BOOK.get(KEY);
  if (existing) return { seeded: false };

  const players = [
    { name: 'Chris', handicapIndex: 14.2 },
    { name: 'Matt', handicapIndex: 18.5 },
    { name: 'Jason', handicapIndex: 10.8 },
    { name: 'Brian', handicapIndex: 22.1 }
  ];
  const pars = [4,4,3,5,4,4,3,4,5, 4,3,4,5,4,4,3,4,5]; // Generic muni par 72

  const config = {
    event: { name: 'Saturday Morning Match', shortName: 'Sat Match', eventType: 'quick', course: 'Bethpage Red', currentRound: 1, venue: 'Bethpage State Park', slug },
    players: players,
    roster: players,
    games: { skins: true, nassau: false, wolf: false },
    structure: {},
    holesPerRound: 18,
    course: { name: 'Bethpage Red', pars: pars, tees: 'White' },
    rounds: { '1': { course: 'Bethpage Red', tees: 'White' } },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  // 8 holes scored — casual Saturday game
  const scoreData = {
    1: { 'Chris': 5, 'Matt': 6, 'Jason': 4, 'Brian': 7 },
    2: { 'Chris': 5, 'Matt': 5, 'Jason': 4, 'Brian': 6 },
    3: { 'Chris': 3, 'Matt': 4, 'Jason': 3, 'Brian': 4 },
    4: { 'Chris': 6, 'Matt': 7, 'Jason': 5, 'Brian': 7 },
    5: { 'Chris': 5, 'Matt': 5, 'Jason': 4, 'Brian': 6 },
    6: { 'Chris': 4, 'Matt': 5, 'Jason': 4, 'Brian': 5 },
    7: { 'Chris': 4, 'Matt': 4, 'Jason': 3, 'Brian': 5 },
    8: { 'Chris': 4, 'Matt': 5, 'Jason': 4, 'Brian': 5 },
  };

  const holes = {};
  for (const [h, s] of Object.entries(scoreData)) {
    holes[h] = { scores: s, timestamp: Date.now() - (8 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins (free game, no money — $0 skins for tracking only)
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 8; h++) {
    const hScores = scoreData[h];
    const entries = players.map(p => ({ name: p.name, score: hScores[p.name] }));
    const minScore = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === minScore);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: 0 });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  const feed = [
    { ts: Date.now() - 60000, type: 'score', text: 'Jason pars #7 for another skin. Three skins through 8.', player: 'Jason' },
    { ts: Date.now() - 120000, type: 'score', text: 'Brian triples the par 5. "I found every bunker on that hole."', player: 'Brian' },
    { ts: Date.now() - 180000, type: 'chirp', text: 'Jason is running away with it. Nobody can touch him today.', player: 'System' },
    { ts: Date.now() - 240000, type: 'score', text: 'Chris and Matt tie on #3. Skin carries.', player: 'System' },
    { ts: Date.now() - 300000, type: 'chirp', text: 'Brian says he is "still warming up." It is hole 8.', player: 'System' },
  ];
  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify(feed));

  return { seeded: true };
}

async function seedDemoSkins(env) {
  const slug = 'demo-skins';
  const KEY = `config:${slug}`;
  if (await env.MG_BOOK.get(KEY)) return { seeded: false };

  const players = [
    { name: 'Mike Reynolds', handicapIndex: 12.0, venmo: '@mikereynolds' },
    { name: 'Danny Torres', handicapIndex: 8.4, venmo: '@dannytorres' },
    { name: 'Chris Lane', handicapIndex: 15.2, venmo: '@chrislane' },
    { name: 'Jake Walsh', handicapIndex: 6.1, venmo: '@jakewalsh' }
  ];
  const pars = [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,3,4,5];

  const config = {
    event: { name: 'Saturday Skins', shortName: 'Skins', eventType: 'buddies_trip', course: 'Pinehurst No. 2', currentRound: 1, venue: 'Pinehurst Resort', slug },
    players, roster: players,
    games: { skins: true },
    structure: { skinsBet: '10' },
    holesPerRound: 18,
    course: { name: 'Pinehurst No. 2', pars, tees: 'Blue' },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  const scores = {
    1: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 5, 'Jake Walsh': 4 },
    2: { 'Mike Reynolds': 5, 'Danny Torres': 4, 'Chris Lane': 6, 'Jake Walsh': 5 },
    3: { 'Mike Reynolds': 3, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 4 },
    4: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 5, 'Jake Walsh': 4 },
    5: { 'Mike Reynolds': 3, 'Danny Torres': 3, 'Chris Lane': 4, 'Jake Walsh': 2 },
    6: { 'Mike Reynolds': 5, 'Danny Torres': 6, 'Chris Lane': 5, 'Jake Walsh': 5 },
    7: { 'Mike Reynolds': 3, 'Danny Torres': 3, 'Chris Lane': 3, 'Jake Walsh': 2 },
    8: { 'Mike Reynolds': 5, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 4 }
  };
  const completeScores = buildFullStrokeScores(scores, players.map(p => p.name), pars);

  const holes = {};
  for (const [h, s] of Object.entries(completeScores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (pars.length - parseInt(h, 10)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= pars.length; h++) {
    const entries = players.map(p => ({ name: p.name, score: completeScores[h][p.name] }));
    const min = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === min);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * 3 * 10 });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify([
    { ts: Date.now() - 60000, type: 'score', text: 'Jake birdies the par-3 7th! Wins the skin ($30).', player: 'Jake Walsh' },
    { ts: Date.now() - 180000, type: 'score', text: 'Jake birdies #5 — breaks a 2-hole carry for $60!', player: 'Jake Walsh' },
    { ts: Date.now() - 300000, type: 'score', text: 'Mike wins #3 with a par. Only clean card on the hole.', player: 'Mike Reynolds' },
    { ts: Date.now() - 420000, type: 'chirp', text: 'Chris is 0-for-8 on skins. The well is dry.', player: 'System' },
  ]));
  return { seeded: true };
}

async function seedDemoNassau(env) {
  const slug = 'demo-nassau';
  const KEY = `config:${slug}`;
  if (await env.MG_BOOK.get(KEY)) return { seeded: false };

  const players = [
    { name: 'Mike Reynolds', handicapIndex: 8.0, venmo: '@mikereynolds' },
    { name: 'Danny Torres', handicapIndex: 12.4, venmo: '@dannytorres' },
    { name: 'Chris Lane', handicapIndex: 6.2, venmo: '@chrislane' },
    { name: 'Jake Walsh', handicapIndex: 14.8, venmo: '@jakewalsh' }
  ];
  const pars = [4,4,5,3,4,4,4,3,5, 4,3,4,5,4,4,3,5,4];

  const config = {
    event: { name: 'Sunday Nassau', shortName: 'Nassau', eventType: 'buddies_trip', course: 'Baltusrol Lower', currentRound: 1, venue: 'Baltusrol Golf Club', slug },
    players, roster: players,
    games: { nassau: true },
    structure: { nassauBet: '20', autoPress: { enabled: true, threshold: 2 } },
    holesPerRound: 18,
    course: { name: 'Baltusrol Lower', pars, tees: 'Championship' },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  const scores = {
    1: { 'Mike Reynolds': 4, 'Danny Torres': 5, 'Chris Lane': 4, 'Jake Walsh': 5 },
    2: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 3, 'Jake Walsh': 5 },
    3: { 'Mike Reynolds': 5, 'Danny Torres': 6, 'Chris Lane': 5, 'Jake Walsh': 6 },
    4: { 'Mike Reynolds': 3, 'Danny Torres': 4, 'Chris Lane': 3, 'Jake Walsh': 3 },
    5: { 'Mike Reynolds': 3, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 5 },
    6: { 'Mike Reynolds': 4, 'Danny Torres': 5, 'Chris Lane': 4, 'Jake Walsh': 4 },
    7: { 'Mike Reynolds': 5, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 5 }
  };
  const completeScores = buildFullStrokeScores(scores, players.map(p => p.name), pars);

  const holes = {};
  for (const [h, s] of Object.entries(completeScores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (pars.length - parseInt(h, 10)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify({
    nassau: { frontWinner: null, backWinner: null, overallWinner: null, presses: [
      { by: 'Danny Torres', hole: 5, amount: 20 }
    ]}
  }));

  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify([
    { ts: Date.now() - 60000, type: 'score', text: 'Mike 2 UP thru 7 on the front. Danny presses.', player: 'Mike Reynolds' },
    { ts: Date.now() - 180000, type: 'score', text: 'Chris birdies #2 to grab the early front 9 lead.', player: 'Chris Lane' },
    { ts: Date.now() - 300000, type: 'chirp', text: 'Danny pressed on 5. The back pocket is getting lighter.', player: 'System' },
  ]));
  return { seeded: true };
}

async function seedDemoWolf(env) {
  const slug = 'demo-wolf';
  const KEY = `config:${slug}`;
  if (await env.MG_BOOK.get(KEY)) return { seeded: false };

  const players = [
    { name: 'Mike Reynolds', handicapIndex: 10.0, venmo: '@mikereynolds' },
    { name: 'Danny Torres', handicapIndex: 7.5, venmo: '@dannytorres' },
    { name: 'Chris Lane', handicapIndex: 13.0, venmo: '@chrislane' },
    { name: 'Jake Walsh', handicapIndex: 5.8, venmo: '@jakewalsh' }
  ];
  const pars = [4,3,4,5,4,4,3,4,4, 4,4,3,4,5,3,4,4,5];

  const config = {
    event: { name: 'Wolf Pack Wednesday', shortName: 'Wolf', eventType: 'buddies_trip', course: 'Merion Golf Club', currentRound: 1, venue: 'Merion Golf Club', slug },
    players, roster: players,
    games: { wolf: true },
    structure: { wolfPoints: '5' },
    holesPerRound: 18,
    course: { name: 'Merion Golf Club', pars, tees: 'East' },
    wolfOrder: ['Mike Reynolds', 'Danny Torres', 'Chris Lane', 'Jake Walsh'],
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  const scores = {
    1: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 5, 'Jake Walsh': 3 },
    2: { 'Mike Reynolds': 3, 'Danny Torres': 2, 'Chris Lane': 4, 'Jake Walsh': 3 },
    3: { 'Mike Reynolds': 4, 'Danny Torres': 5, 'Chris Lane': 4, 'Jake Walsh': 4 },
    4: { 'Mike Reynolds': 5, 'Danny Torres': 5, 'Chris Lane': 6, 'Jake Walsh': 4 },
    5: { 'Mike Reynolds': 4, 'Danny Torres': 3, 'Chris Lane': 5, 'Jake Walsh': 4 },
    6: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 5, 'Jake Walsh': 3 }
  };
  const completeScores = buildFullStrokeScores(scores, players.map(p => p.name), pars);

  const holes = {};
  for (const [h, s] of Object.entries(completeScores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (pars.length - parseInt(h, 10)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify({
    wolf: {
      picks: {
        1: 'Danny Torres',
        2: 'lone',
        3: 'Jake Walsh',
        4: 'Mike Reynolds',
        5: 'lone',
        6: 'Jake Walsh'
      }
    }
  }));

  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify([
    { ts: Date.now() - 60000, type: 'score', text: 'Jake birdies #6 with his Wolf partner. Team wins.', player: 'Jake Walsh' },
    { ts: Date.now() - 180000, type: 'score', text: 'Danny goes LONE WOLF on #2 and birdies! +3 points!', player: 'Danny Torres' },
    { ts: Date.now() - 300000, type: 'score', text: 'Danny goes LONE WOLF on #5 — birdies again! Fearless.', player: 'Danny Torres' },
    { ts: Date.now() - 420000, type: 'chirp', text: 'Chris has been picked 0 times. Nobody wants him.', player: 'System' },
  ]));
  return { seeded: true };
}

async function seedDemoMatchPlay(env) {
  const slug = 'demo-match-play';
  const KEY = `config:${slug}`;
  if (await env.MG_BOOK.get(KEY)) return { seeded: false };

  const players = [
    { name: 'Mike Reynolds', handicapIndex: 8.0, venmo: '@mikereynolds' },
    { name: 'Danny Torres', handicapIndex: 12.0, venmo: '@dannytorres' },
    { name: 'Chris Lane', handicapIndex: 6.5, venmo: '@chrislane' },
    { name: 'Jake Walsh', handicapIndex: 15.0, venmo: '@jakewalsh' }
  ];
  const pars = [4,4,5,3,4,4,3,4,5, 4,3,5,4,4,4,3,4,5];

  const config = {
    event: { name: 'Sunday Match Play', shortName: 'Match', eventType: 'buddies_trip', course: 'Oakmont CC', currentRound: 1, venue: 'Oakmont Country Club', slug },
    players, roster: players,
    games: { match_play: true, skins: true },
    structure: { nassauBet: '50', skinsBet: '10' },
    holesPerRound: 18,
    course: { name: 'Oakmont CC', pars, tees: 'Championship' },
    adminPin: randomPin()
  };
  await env.MG_BOOK.put(KEY, JSON.stringify(config));

  const scores = {
    1:  { 'Mike Reynolds': 4, 'Danny Torres': 5, 'Chris Lane': 4, 'Jake Walsh': 5 },
    2:  { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 3, 'Jake Walsh': 5 },
    3:  { 'Mike Reynolds': 5, 'Danny Torres': 6, 'Chris Lane': 5, 'Jake Walsh': 6 },
    4:  { 'Mike Reynolds': 3, 'Danny Torres': 3, 'Chris Lane': 2, 'Jake Walsh': 4 },
    5:  { 'Mike Reynolds': 4, 'Danny Torres': 5, 'Chris Lane': 4, 'Jake Walsh': 4 },
    6:  { 'Mike Reynolds': 3, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 5 },
    7:  { 'Mike Reynolds': 3, 'Danny Torres': 4, 'Chris Lane': 3, 'Jake Walsh': 3 },
    8:  { 'Mike Reynolds': 5, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 5 },
    9:  { 'Mike Reynolds': 5, 'Danny Torres': 5, 'Chris Lane': 4, 'Jake Walsh': 6 },
    10: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 3, 'Jake Walsh': 5 },
    11: { 'Mike Reynolds': 3, 'Danny Torres': 4, 'Chris Lane': 3, 'Jake Walsh': 3 },
    12: { 'Mike Reynolds': 5, 'Danny Torres': 6, 'Chris Lane': 4, 'Jake Walsh': 5 },
    13: { 'Mike Reynolds': 4, 'Danny Torres': 4, 'Chris Lane': 4, 'Jake Walsh': 5 }
  };

  const holes = {};
  for (const [h, s] of Object.entries(scores)) {
    holes[h] = { scores: s, timestamp: Date.now() - (13 - parseInt(h)) * 600000 };
  }
  await env.MG_BOOK.put(`${slug}:holes`, JSON.stringify(holes));

  // Compute skins
  const gameState = { skins: { history: [], pot: 1 } };
  for (let h = 1; h <= 13; h++) {
    const entries = players.map(p => ({ name: p.name, score: scores[h][p.name] }));
    const min = Math.min(...entries.map(e => e.score));
    const winners = entries.filter(e => e.score === min);
    if (winners.length === 1) {
      gameState.skins.history.push({ hole: h, winner: winners[0].name, pot: gameState.skins.pot, value: gameState.skins.pot * 3 * 10 });
      gameState.skins.pot = 1;
    } else {
      gameState.skins.history.push({ hole: h, winner: null, pot: gameState.skins.pot, carry: true });
      gameState.skins.pot++;
    }
  }
  await env.MG_BOOK.put(`${slug}:game-state`, JSON.stringify(gameState));

  await env.MG_BOOK.put(`${slug}:feed`, JSON.stringify([
    { ts: Date.now() - 60000, type: 'score', text: 'Chris is -3 thru 13. Running away with it.', player: 'Chris Lane' },
    { ts: Date.now() - 180000, type: 'score', text: 'Chris eagles the par-3 4th! Skin worth $30.', player: 'Chris Lane' },
    { ts: Date.now() - 300000, type: 'score', text: 'Mike birdies #6. Keeps the pressure on Chris.', player: 'Mike Reynolds' },
    { ts: Date.now() - 420000, type: 'chirp', text: 'Jake is +7 thru 13. The wheels came off on the back.', player: 'System' },
  ]));
  return { seeded: true };
}

export { seedDemoBuddies, seedDemoScramble, seedDemoEvent, seedFriscoV2, seedLegendsTrip, seedStagNight, seedAugustaScramble, seedMastersMG, seedWeekendWarrior, seedDemoSkins, seedDemoNassau, seedDemoWolf, seedDemoMatchPlay };
