// data.js — Pure utility functions for config-driven golf events
// All tournament-specific data lives in config.json (one per event slug).
// This file provides computations only; nothing hardcoded.

// ── Config loader ──────────────────────────────────────────────
export async function loadConfig(slug, basePath) {
  const configUrl = `${basePath}/config.json`;
  const res = await fetch(configUrl);
  if (res.ok) return res.json();

  const isLocalPreview =
    location.hostname === '127.0.0.1' ||
    location.hostname === 'localhost' ||
    location.protocol === 'file:';

  if (isLocalPreview) {
    const previewRes = await fetch('/app/config.json');
    if (previewRes.ok) {
      const previewConfig = await previewRes.json();
      const previewSlug = slug || previewConfig?.event?.slug || 'demo-buddies';
      return {
        ...previewConfig,
        event: {
          ...previewConfig.event,
          slug: previewSlug,
        },
      };
    }
  }

  throw new Error(`Config not found for event: ${slug}`);
}

// ── Match generator ───────────────────────────────────────────
// Builds the full matches map from config pairings.
export function generateMatches(config) {
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
        matches[matchId] = {
          id: matchId,
          flight: flightId,
          round,
          pairing: p + 1,
          teamA: a,
          teamB: b,
          scoreA: null,
          scoreB: null,
          status: "scheduled"
        };
      }
    }
  }
  return matches;
}

// ── Pure utilities ─────────────────────────────────────────────

// Apply cap rule: max capMax for winner, min capMin for loser.
export function applyCapRule(rawA, rawB, capMax = 7, capMin = 3) {
  if (rawA > capMax) return { teamA: capMax, teamB: capMin };
  if (rawB > capMax) return { teamA: capMin, teamB: capMax };
  return { teamA: rawA, teamB: rawB };
}

// Short display name from teams map: "Green/Pryor"
export function teamShortName(teams, teamId) {
  const t = teams[teamId];
  if (!t) return `T${teamId}`;
  return t.member.split(" ").pop() + "/" + t.guest.split(" ").pop();
}

// Combined handicap index for a team
export function combinedHI(teams, teamId) {
  return teams[teamId]?.combined ?? 0;
}

// Best (lowest) individual HI from a team
export function bestPlayerHI(teams, teamId) {
  const t = teams[teamId];
  if (!t) return 0;
  return Math.min(t.memberHI, t.guestHI);
}
