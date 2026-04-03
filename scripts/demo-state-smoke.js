#!/usr/bin/env node

const DEMO_SLUGS = [
  'demo-buddies',
  'legends-trip',
  'demo-scramble',
  'stag-night',
  'augusta-scramble',
  'masters-member-guest',
];

function parseArgs(argv) {
  const args = { baseUrl: 'https://betwaggle.com', slugs: DEMO_SLUGS.slice() };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if ((part === '--base-url' || part === '--base') && argv[i + 1]) {
      args.baseUrl = String(argv[i + 1]).trim().replace(/\/$/, '');
      i += 1;
      continue;
    }
    if (part === '--slugs' && argv[i + 1]) {
      args.slugs = String(argv[i + 1])
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    }
  }
  return args;
}

function summarize(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return JSON.stringify(obj).slice(0, 500);
}

function getPlayersList(payload) {
  if (Array.isArray(payload?.players)) return payload.players;
  if (payload?.players && typeof payload.players === 'object') return Object.values(payload.players);
  if (Array.isArray(payload?.config?.players)) return payload.config.players;
  if (Array.isArray(payload?.config?.roster)) return payload.config.roster;
  return [];
}

function countTruthyGameKeys(configGames) {
  if (!configGames || typeof configGames !== 'object') return 0;
  return Object.entries(configGames).filter(([, v]) => !!v).length;
}

async function checkSlug(baseUrl, slug) {
  const url = `${baseUrl}/${slug}/api/state`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });

  const bodyText = await res.text();
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (err) {
    return {
      slug,
      url,
      ok: false,
      status: res.status,
      checks: [{ name: 'json_parse', ok: false, detail: err.message }],
      excerpt: bodyText.slice(0, 500),
    };
  }

  const players = getPlayersList(payload);
  const gameStateKeys = Object.keys(payload?.gameState || {});
  const configGameKeys = countTruthyGameKeys(payload?.config?.games);

  const checks = [
    { name: 'http_ok', ok: res.ok, detail: `status=${res.status}` },
    { name: 'config_object', ok: !!(payload?.config && typeof payload.config === 'object'), detail: summarize(payload?.config) },
    { name: 'players_non_empty', ok: players.length > 0, detail: `players=${players.length}` },
    {
      name: 'game_section_present',
      ok: gameStateKeys.length > 0 || configGameKeys > 0,
      detail: `gameStateKeys=${gameStateKeys.length}, configGameKeys=${configGameKeys}`,
    },
  ];

  return {
    slug,
    url,
    ok: checks.every((c) => c.ok),
    status: res.status,
    checks,
    excerpt: summarize({
      config: payload?.config ? {
        event: payload.config.event || null,
        games: payload.config.games || null,
      } : null,
      playersCount: players.length,
      gameStateKeys,
      keys: Object.keys(payload || {}),
    }),
  };
}

async function main() {
  const { baseUrl, slugs } = parseArgs(process.argv.slice(2));
  if (!slugs.length) {
    console.error('No slugs specified.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const results = [];
  for (const slug of slugs) {
    try {
      results.push(await checkSlug(baseUrl, slug));
    } catch (err) {
      results.push({
        slug,
        url: `${baseUrl}/${slug}/api/state`,
        ok: false,
        status: 0,
        checks: [{ name: 'request_error', ok: false, detail: err.message }],
        excerpt: null,
      });
    }
  }

  console.log(`# Demo state smoke (${startedAt})`);
  console.log(`Base URL: ${baseUrl}`);
  console.log('');

  let failed = 0;
  for (const result of results) {
    const icon = result.ok ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.slug} (${result.status})`);
    for (const check of result.checks) {
      const mark = check.ok ? '  - ok  ' : '  - fail';
      console.log(`${mark} ${check.name}: ${check.detail || ''}`);
    }
    console.log(`  - url: ${result.url}`);
    if (result.excerpt) console.log(`  - excerpt: ${result.excerpt}`);
    console.log('');
    if (!result.ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`Smoke failed: ${failed}/${results.length} slugs did not meet integrity checks.`);
    process.exit(1);
  }
  console.log(`Smoke passed: ${results.length}/${results.length} slugs valid.`);
}

main().catch((err) => {
  console.error('Fatal smoke runner error:', err);
  process.exit(1);
});
