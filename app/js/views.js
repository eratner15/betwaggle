// All views for the Golf Event SPA — config-driven, no hardcoded tournament data
import { applyCapRule } from './data.js';
import { flightWinnerOdds, matchOdds, marginOdds, probToAmerican, probToDecimal, mlToDecimal, placeBet, settleBets, getMatchMoneyline, getLiveMatchMoneyline, isMatchLocked, interpolateProb, mlToProb, fmtML } from './betting.js';
import { getFlightScenarioData, getRemainingMatches } from './scenarios.js';

// ─── SKINS FORMAT NORMALIZER ───
// Seed data may store skins as either:
//   A) gameState.skins.holes  — {holeNum: {winner, potWon, ...}}  (game-engine format)
//   B) gameState.skins.history — [{hole, winner, pot, value, carry?}]  (seed format)
// This helper returns a unified holes-style object from whichever format exists.
// If neither exists but hole scores are provided, computes skins on-the-fly.
function getSkinsHoles(gameState, holes, players) {
  const skins = gameState?.skins;
  if (!skins) return {};

  // Format A — already in holes format
  if (skins.holes && Object.keys(skins.holes).length > 0) return skins.holes;

  // Format B — convert history array to holes object
  if (skins.history && skins.history.length > 0) {
    const result = {};
    skins.history.forEach(entry => {
      result[entry.hole] = {
        winner: entry.winner || null,
        potWon: entry.pot || 1,
        carried: !!entry.carry,
        potBefore: entry.carry ? entry.pot : undefined
      };
    });
    return result;
  }

  // Neither format — compute on-the-fly from hole scores (lowest unique score wins)
  if (holes && players && players.length > 0) {
    const result = {};
    let pot = 1;
    const holeNums = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    for (const h of holeNums) {
      const scores = holes[h]?.scores;
      if (!scores) { pot++; continue; }
      const entries = players.map(p => ({ name: p.name, score: scores[p.name] })).filter(e => e.score != null);
      if (entries.length === 0) { pot++; continue; }
      const minScore = Math.min(...entries.map(e => e.score));
      const winners = entries.filter(e => e.score === minScore);
      if (winners.length === 1) {
        result[h] = { winner: winners[0].name, potWon: pot };
        pot = 1;
      } else {
        result[h] = { winner: null, carried: true, potBefore: pot };
        pot++;
      }
    }
    return result;
  }

  return {};
}

// Module-level config ref — set by initViews(config) at bootstrap
let _C = null;

export function initViews(config) {
  _C = config;
}

// Convenience accessors — all views use these instead of imported constants
function T(id) { return _C?.teams?.[id] ?? {}; }           // team by numeric id
function F(id) { const f = _C?.flights?.[id]; if (!f) return {}; return { ...f, teamIds: f.teamIds ?? f.teams ?? [] }; } // flight by id, normalize teamIds/teams
// Team name display — handles solo players (buddies trips) vs pairs (member-guest)
function TN(t) {
  if (!t) return '—';
  const m = (t.member || '').split(' ').pop();
  const g = (t.guest || '').split(' ').pop();
  return (!g || g === '—' || g === '') ? m : `${m} / ${g}`;
}
function TF(t) { // Full name version
  if (!t) return '—';
  return (!t.guest || t.guest === '—' || t.guest === '') ? t.member : `${t.member} & ${t.guest}`;
}
function RT(r)  { return _C?.structure?.roundTimes?.[r] ?? ''; }
function RD(r)  { return _C?.structure?.roundDays?.[r] ?? (r <= 3 ? 'Day 1' : 'Day 2'); }
function flightOrder() { return _C?.flightOrder ?? []; }

/**
 * Extract flat player list from config.teams (member-guest) or config.roster (quick/buddies).
 * Returns [{name, handicapIndex}] sorted by team insertion order.
 */
export function getPlayersFromConfig(config) {
  // Prefer explicit roster (Weekend Warrior / quick events)
  if (config?.roster && config.roster.length > 0) {
    return config.roster.map(r => ({
      name: r.name || r.member,
      handicapIndex: r.handicapIndex ?? r.handicap ?? r.memberHI ?? 0,
    })).filter(p => p.name);
  }
  // config.players — used by create wizard for quick/buddies_trip events
  if (config?.players && config.players.length > 0) {
    return config.players.map(p => ({
      name: p.name,
      handicapIndex: p.handicapIndex ?? p.handicap ?? 0,
    })).filter(p => p.name);
  }
  // Fall back to teams (member-guest / buddies trip)
  const teams = config?.teams || {};
  const players = [];
  Object.values(teams)
    .sort((a, b) => (a.id || 0) - (b.id || 0))
    .forEach(team => {
      if (team.member) players.push({ name: team.member, handicapIndex: team.memberHI ?? 0 });
      const g = team.guest;
      if (g && g !== team.member && g !== '' && g !== '—') {
        players.push({ name: g, handicapIndex: team.guestHI ?? 0 });
      }
    });
  return players;
}

// ===== DASHBOARD =====
export function renderDashboard(state) {
  const matches = state.matches;
  const liveMatches = Object.values(matches).filter(m => m.status === "live");
  const finalMatches = Object.values(matches).filter(m => m.status === "final");
  const totalMatches = Object.values(matches).length;

  let statusText = "Tournament Not Started";
  if (finalMatches.length === totalMatches) statusText = "Tournament Complete";
  else if (liveMatches.length > 0) statusText = `${liveMatches.length} Match${liveMatches.length > 1 ? "es" : ""} Live`;
  else if (finalMatches.length > 0) statusText = `${finalMatches.length}/${totalMatches} Matches Complete`;

  let html = "";

  // Spectator mode banner
  if (state._spectatorMode) {
    html += `<div style="background:linear-gradient(135deg,var(--mg-green),var(--mg-green-light));color:var(--text-primary);padding:10px 16px;border-radius:var(--mg-radius);margin-bottom:12px;text-align:center">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold)">Spectator Mode</div>
      <div style="font-size:13px;margin-top:2px;opacity:.8">You are watching live</div>
    </div>`;
  }

  // Announcements
  if (state.announcements && state.announcements.length > 0) {
    const latest = state.announcements[state.announcements.length - 1];
    html += `<div class="mg-announcement"><p>${escHtml(latest)}</p></div>`;
  }

  // Player welcome / register card
  if (!state.bettorName && !state._spectatorMode) {
    html += `<div class="mg-card" style="text-align:center;padding:20px">
      <div style="font-size:32px;margin-bottom:8px">&#9971;</div>
      <div style="font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:4px">Welcome to ${escHtml(_C?.event?.name || 'the Event')}</div>
      <p class="text-sm text-muted mb-4">Tap your name below to start betting</p>
      ${renderPlayerPicker(state)}
    </div>`;
  } else {
    const credits = state._playerCredits;
    const creditsDisplay = credits !== null && credits !== undefined ? `$${credits}` : '...';
    html += `<div class="mg-card" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--mg-green)">${escHtml(state.bettorName)}</div>
        <div class="text-xs text-muted">Credits: <strong style="color:var(--mg-gold-dim)">${creditsDisplay}</strong></div>
      </div>
      <a href="#bet" class="mg-btn mg-btn-primary" style="width:auto;padding:8px 20px;font-size:13px;text-decoration:none">Place Bets</a>
    </div>`;
  }

  // Status bar
  html += `<div class="mg-card" style="text-align:center">
    <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:1px">${_C?.event?.venue || ''} &bull; ${_C?.event?.dates?.day1 || ''}</div>
    <div style="font-size:16px;font-weight:700;margin-top:4px;color:var(--mg-green)">${statusText}</div>
    <div class="text-xs text-muted mt-2">${finalMatches.length} of ${totalMatches} matches final</div>
  </div>`;

  // Hot matches ticker
  if (liveMatches.length > 0) {
    html += `<div class="mg-section-title">Live Now</div><div class="mg-ticker">`;
    liveMatches.forEach(m => {
      const tA = T(m.teamA), tB = T(m.teamB);
      html += `<div class="mg-ticker-item live" onclick="window.MG.nav('#flight/${m.flight}')">
        <div class="mg-match-live-badge">LIVE</div>
        <div style="margin-top:6px;font-weight:600;font-size:13px">${TN(tA)}</div>
        <div class="text-xs text-muted">vs</div>
        <div style="font-weight:600;font-size:13px">${TN(tB)}</div>
        <div class="text-xs text-muted mt-2">${F(m.flight).name} &bull; Round ${m.round}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // Flight cards grid
  html += `<div class="mg-section-title">Flights</div><div class="mg-flight-grid">`;
  flightOrder().forEach(fId => {
    const flight = F(fId);
    const standings = calcStandings(fId, matches);
    const leader = standings[0];
    const leaderTeam = T(leader.teamId);
    const fMatches = Object.values(matches).filter(m => m.flight === fId);
    const fLive = fMatches.filter(m => m.status === "live").length;
    const fFinal = fMatches.filter(m => m.status === "final").length;

    html += `<a class="mg-flight-card" href="#flight/${fId}">
      <div class="flight-name">${flight.name.replace(" Flight", "")}</div>
      <div class="flight-leader">${TN(leaderTeam)}</div>
      <div class="flight-pts">${leader.points} pts</div>
      <div class="flight-status">`;
    fMatches.forEach(m => {
      const cls = m.status === "live" ? "live" : m.status === "final" ? "final" : "";
      html += `<span class="status-dot ${cls}"></span>`;
    });
    html += `</div></a>`;
  });
  html += `</div>`;

  // Activity Feed (trash talk + score updates)
  html += renderActivityFeed(state);

  return html;
}

// ===== ACTIVITY FEED / TRASH TALK =====

function feedTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function renderActivityFeed(state) {
  const feed = state._feed || [];
  let html = `
  <style>
    .wg-feed-section { margin-top: 16px; }
    .wg-feed-title { display:flex; align-items:center; gap:8px;  font-size:16px; font-weight:700; color:var(--mg-green); padding:0 4px 8px; }
    .wg-feed-dot { width:8px; height:8px; border-radius:50%; background:var(--win); animation:wg-pulse 2s infinite; }
    @keyframes wg-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
    .wg-feed-list { max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding:0 2px; }
    .wg-feed-item { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; border-radius:10px; background:var(--bg-secondary); }
    .wg-feed-item.score { background:rgba(212,160,23,0.06); border-left:3px solid var(--gold-muted); }
    .wg-feed-item.press { background:rgba(255,100,0,0.08); border-left:3px solid var(--gold-bright); }
    .wg-feed-item.chirp { position:relative; }
    .wg-feed-avatar { width:32px; height:32px; min-width:32px; border-radius:50%; background:var(--mg-green); color:var(--text-primary); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; text-transform:uppercase; }
    .wg-feed-body { flex:1; min-width:0; }
    .wg-feed-player { font-size:12px; font-weight:700; color:var(--mg-green); }
    .wg-feed-text { font-size:13px; color:var(--text-secondary); margin-top:2px; word-break:break-word; }
    .wg-feed-emoji { font-size:24px; line-height:1; }
    .wg-feed-ts { font-size:10px; color:var(--text-secondary); margin-top:3px; }
    .wg-feed-input-bar { display:flex; align-items:center; gap:8px; margin-top:10px; padding:8px 12px; background:var(--bg-secondary); border-radius:12px; border:1px solid var(--bg-tertiary); }
    .wg-feed-input { flex:1; background:transparent; border:none; outline:none; color:var(--text-secondary); font-size:14px; padding:6px 0; }
    .wg-feed-input::placeholder { color:var(--text-tertiary); }
    .wg-feed-send { background:var(--mg-green); color:var(--text-primary); border:none; border-radius:8px; padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
    .wg-feed-emoji-bar { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
    .wg-feed-emoji-btn { background:var(--border); border:none; border-radius:8px; padding:6px 10px; font-size:20px; cursor:pointer; transition:transform 0.15s; }
    .wg-feed-emoji-btn:active { transform:scale(1.3); }
    .wg-feed-empty { text-align:center; color:var(--text-tertiary); font-size:13px; padding:20px 0; }
  </style>
  <div class="wg-feed-section">
    <div class="wg-feed-title"><span class="wg-feed-dot"></span> Live Feed</div>
    <div class="wg-feed-list">`;

  if (feed.length === 0) {
    html += `<div class="wg-feed-empty">No activity yet. Be the first to talk trash!</div>`;
  } else {
    feed.slice(0, 50).forEach(item => {
      const typeClass = item.type === 'score' ? 'score' : item.type === 'press' ? 'press' : 'chirp';
      const initial = (item.player || '?')[0].toUpperCase();
      const avatarBg = item.type === 'score' ? 'var(--gold-muted)' : item.type === 'press' ? 'var(--gold-bright)' : 'var(--mg-green)';
      html += `<div class="wg-feed-item ${typeClass}">
        <div class="wg-feed-avatar" style="background:${avatarBg}">${escHtml(initial)}</div>
        <div class="wg-feed-body">
          <div class="wg-feed-player">${escHtml(item.player || 'System')}</div>
          <div class="wg-feed-text">${item.emoji ? `<span class="wg-feed-emoji">${escHtml(item.emoji)}</span> ` : ''}${escHtml(item.text || '')}</div>
          <div class="wg-feed-ts">${feedTimeAgo(item.ts)}</div>
        </div>
      </div>`;
    });
  }

  html += `</div>
    <div class="wg-feed-input-bar">
      <input id="feed-chirp-input" class="wg-feed-input" type="text" placeholder="Talk trash..." maxlength="100"
        onkeydown="if(event.key==='Enter'){event.preventDefault();window.MG.sendChirp()}" />
      <button class="wg-feed-send" onclick="window.MG.sendChirp()">Send</button>
    </div>
    <div class="wg-feed-emoji-bar">
      <button class="wg-feed-emoji-btn" onclick="window.MG.sendEmoji('\u{1F525}')">\u{1F525}</button>
      <button class="wg-feed-emoji-btn" onclick="window.MG.sendEmoji('\u{1F480}')">\u{1F480}</button>
      <button class="wg-feed-emoji-btn" onclick="window.MG.sendEmoji('\u{1F3CC}\u{FE0F}')">\u{1F3CC}\u{FE0F}</button>
      <button class="wg-feed-emoji-btn" onclick="window.MG.sendEmoji('\u{1F426}')">\u{1F426}</button>
      <button class="wg-feed-emoji-btn" onclick="window.MG.sendEmoji('\u{1F4B0}')">\u{1F4B0}</button>
      <button class="wg-feed-emoji-btn" onclick="window.MG.sendEmoji('\u{1F3AF}')">\u{1F3AF}</button>
    </div>
  </div>`;

  return html;
}

// ===== ROUND MODE — LIVE FEED =====

/**
 * Derive ordered event list from server game state + holes.
 * Returns { events[], skinsPot, nassau } — safe with null/undefined gameState.
 *
 * Shadow paths:
 *   gameState=null  → { events:[], skinsPot:1, nassau:{} }
 *   skins.holes missing → no skin events generated
 *   stroke.running missing → leaderboard falls back to roster in renderRoundFeed
 */
function deriveLiveFeed(gameState, holes, players) {
  try {
    if (!gameState) return { events: [], skinsPot: 1, nassau: {} };
    const events = [];

    // Skins events from skins.holes or skins.history per-hole records
    const skinsHoles = getSkinsHoles(gameState, null, null);
    for (const [h, data] of Object.entries(skinsHoles)) {
      const holeNum = parseInt(h);
      if (data.winner) {
        events.push({ type: 'skin_won', hole: holeNum, player: data.winner, pot: data.potWon || 1 });
      } else if (data.carried) {
        events.push({ type: 'skin_carried', hole: holeNum, potBefore: data.potBefore || 1, potAfter: (data.potBefore || 1) + 1 });
      }
    }

    // Nassau completion events (stored on nassau state after hole 9 / hole 18)
    const nassau = gameState.nassau || {};
    if (nassau.frontWinner) {
      events.push({ type: 'nassau_front_complete', hole: 9, winner: nassau.frontWinner });
    }
    if (nassau.backWinner) {
      events.push({ type: 'nassau_back_complete', hole: 18, winner: nassau.backWinner });
    }
    if (nassau.totalWinner) {
      events.push({ type: 'nassau_total_complete', hole: 18, winner: nassau.totalWinner });
    }

    // Wolf hole results
    const wolfResults = gameState.wolf?.results || {};
    for (const [h, result] of Object.entries(wolfResults)) {
      const holeNum = parseInt(h);
      const pick = gameState.wolf?.picks?.[holeNum];
      if (pick) {
        events.push({
          type: 'wolf_result', hole: holeNum,
          wolf: pick.wolf, partner: pick.partner,
          wolfWon: result.wolfWon, loneWolf: !pick.partner,
        });
      }
    }

    // Sort newest hole first
    events.sort((a, b) => b.hole - a.hole);
    return { events, skinsPot: gameState.skins?.pot || 1, nassau };
  } catch (e) {
    console.warn('[waggle] deriveLiveFeed error — gameState shape may be unexpected', e, gameState);
    return { events: [], skinsPot: 1, nassau: {} };
  }
}

// Flash dedup — track which holes have already been shown so the flash doesn't
// re-fire on every 30s sync. Keyed by "{slug}:shown_holes" in localStorage.
function getShownHoles(slug) {
  try { return JSON.parse(localStorage.getItem(`${slug}:shown_holes`) || '[]'); }
  catch (e) { return []; }
}
function markHoleShown(slug, hole) {
  try {
    const shown = getShownHoles(slug);
    if (!shown.includes(hole)) {
      shown.push(hole);
      localStorage.setItem(`${slug}:shown_holes`, JSON.stringify(shown));
    }
  } catch (e) { /* localStorage quota full — silent */ }
}
// On first load mark all already-scored holes as seen so flash only fires
// for NEW holes scored after this device joined the round.
function initFlashBaseline(slug, holes) {
  const key = `${slug}:shown_holes`;
  if (!localStorage.getItem(key)) {
    const scored = Object.keys(holes || {}).map(Number).filter(n => n > 0);
    try { localStorage.setItem(key, JSON.stringify(scored)); } catch (e) {}
  }
}

// ─── CASH BET HELPERS ───
// Cash bets are stored locally (no server) — settled in cash/Venmo outside the app.
function getCashBets(slug) {
  try { return JSON.parse(localStorage.getItem(`${slug}:cash_bets`) || '[]'); }
  catch (e) { return []; }
}

// ─── EVENT TYPE HELPER ───
function getEventType(state) {
  return state._config?.event?.eventType || state._config?.eventType || '';
}

// ─── COURSE PAR HELPERS ───
// Returns array of 18 par values for this event's course.
// Priority: config.coursePars → built-in course lookup → default par 72
const COURSE_DB = {
  'turnberry isle': [4,4,5,3,4,4,4,3,5, 4,3,4,5,4,3,4,4,5], // par 72 soffer
  'turnberry isle soffer': [4,4,5,3,4,4,4,3,5, 4,3,4,5,4,3,4,4,5],
  'pebble beach': [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,4,3,5],
  'Augusta national': [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,4,3,4,4],
};
function getCoursePars(config) {
  if (config?.coursePars?.length === 18) return config.coursePars;
  const name = (config?.event?.course || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  for (const [key, pars] of Object.entries(COURSE_DB)) {
    if (name.includes(key) || key.includes(name.split(' ')[0])) return pars;
  }
  // Default: par 72 (mix of 4s, 3s, 5s)
  return [4,4,5,3,4,4,4,3,5, 4,3,4,5,4,3,4,4,5];
}

// ─── COURSE YARDAGE DATABASE ───
const COURSE_YARDAGE_DB = {
  'pebble beach': [381,502,390,331,188,513,106,428,466, 495,380,202,399,580,397,403,178,543],
  'turnberry isle': [390,414,537,195,442,425,395,180,530, 425,175,405,555,375,205,395,430,535],
  'turnberry isle soffer': [390,414,537,195,442,425,395,180,530, 425,175,405,555,375,205,395,430,535],
  'augusta national': [445,575,350,240,455,180,450,570,460, 495,520,155,510,440,530,170,440,465],
};
function getCourseYardage(config) {
  if (config?.courseYardage?.length >= 9) return config.courseYardage;
  // Check tees data
  if (config?.course?.tees && Array.isArray(config.course.tees)) {
    const tee = config.course.tees.find(t => t.holes?.length > 0);
    if (tee) return tee.holes.map(h => h.yardage || h.yards || 0);
  }
  if (config?.course?.holes?.length > 0) return config.course.holes.map(h => h.yardage || h.yards || 0);
  const name = (config?.event?.course || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  for (const [key, yds] of Object.entries(COURSE_YARDAGE_DB)) {
    if (name.includes(key) || key.includes(name.split(' ')[0])) return yds;
  }
  return null;
}

// ─── COURSE HCP INDEX HELPER ───
const COURSE_HCP_DB = {
  'pebble beach': [6,10,12,16,14,2,18,4,8, 3,9,17,7,1,13,11,15,5],
  'turnberry isle': [4,6,2,16,8,10,12,18,14, 3,17,7,1,9,15,11,5,13],
  'turnberry isle soffer': [4,6,2,16,8,10,12,18,14, 3,17,7,1,9,15,11,5,13],
  'augusta national': [4,1,7,16,11,14,8,5,9, 10,6,12,2,3,13,18,15,17],
};
function getCourseHcpIndex(config) {
  if (config?.courseHcpIndex?.length >= 9) return config.courseHcpIndex;
  const name = (config?.event?.course || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  for (const [key, hcp] of Object.entries(COURSE_HCP_DB)) {
    if (name.includes(key) || key.includes(name.split(' ')[0])) return hcp;
  }
  return [];
}

// ─── PREMIUM SCORECARD RENDERER ───
// Renders a trifold-style country club scorecard with yardage, HCP, par, player scores,
// golf-standard color coding (circles under par, squares over par), and running totals.
function renderPremiumScorecard({ currentHole, pars, hcpIndex, yardage, holes, entities, inlScores, holesPerRound, courseName, isScramble, readOnly }) {
  const isBack9 = currentHole > 9;
  const startHole = isBack9 ? 10 : 1;
  const endHole = isBack9 ? Math.min(18, holesPerRound) : Math.min(9, holesPerRound);
  const numCols = endHole - startHole + 1;
  const inlPar = pars[currentHole - 1] || 4;
  const inlHcpRank = hcpIndex[currentHole - 1] ?? null;
  const inlYds = yardage ? yardage[currentHole - 1] : null;
  const hasYardage = yardage && yardage.some(y => y > 0);
  const hasHcp = hcpIndex && hcpIndex.length > 0;

  // Score style helper — golf standard color coding
  function scoreStyle(score, par) {
    const diff = score - par;
    if (diff <= -2) return { bg: '#1D4ED8', color: '#fff', shape: 'circle', border: '2px solid #1D4ED8' };
    if (diff === -1) return { bg: '#16A34A', color: '#fff', shape: 'circle', border: '2px solid #16A34A' };
    if (diff === 0) return { bg: 'transparent', color: '#1A1A1A', shape: 'none', border: 'none' };
    if (diff === 1) return { bg: 'rgba(220,38,38,0.08)', color: '#DC2626', shape: 'square', border: '1px solid rgba(220,38,38,0.2)' };
    return { bg: 'rgba(220,38,38,0.15)', color: '#DC2626', shape: 'square', border: '1px solid rgba(220,38,38,0.3)' };
  }

  function renderScoreSpan(score, par) {
    const st = scoreStyle(score, par);
    const radius = st.shape === 'circle' ? 'border-radius:50%' : st.shape === 'square' ? 'border-radius:2px' : '';
    const bg = st.bg !== 'transparent' ? `background:${st.bg};` : '';
    const bdr = st.border !== 'none' ? `border:${st.border};` : '';
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;${radius};${bg}${bdr}font-weight:700;font-size:12px;color:${st.color}">${score}</span>`;
  }

  let html = '';

  // Outer card
  html += `<div style="background:#FAFAF7;border-radius:12px;padding:0;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;border:1px solid #E5E7EB">`;

  // Header with course name and hole detail
  html += `<div style="padding:14px 16px 10px;border-bottom:1px solid #E8E5DE">`;
  html += `<div style="display:flex;align-items:flex-start;justify-content:space-between">`;
  html += `<div>`;
  html += `<div style="font-size:15px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#0D2818">${escHtml(courseName || 'Course')}</div>`;
  html += `<div style="font-size:12px;color:#6B7280;margin-top:3px">Hole ${currentHole} &middot; Par ${inlPar}${inlYds ? ' &middot; ' + inlYds + ' yds' : ''}${inlHcpRank !== null ? ' &middot; HCP ' + inlHcpRank : ''}</div>`;
  html += `</div>`;
  // Front/Back toggle
  if (holesPerRound > 9) {
    html += `<div style="display:flex;gap:0;border:1px solid #D1D5DB;border-radius:6px;overflow:hidden">`;
    html += `<button onclick="window.MG.inlineScoreToggle9('front')" style="font-size:11px;font-weight:700;padding:5px 12px;border:none;cursor:pointer;background:${!isBack9 ? '#0D2818' : '#FAFAF7'};color:${!isBack9 ? '#fff' : '#6B7280'}">Front</button>`;
    html += `<button onclick="window.MG.inlineScoreToggle9('back')" style="font-size:11px;font-weight:700;padding:5px 12px;border:none;cursor:pointer;background:${isBack9 ? '#0D2818' : '#FAFAF7'};color:${isBack9 ? '#fff' : '#6B7280'};border-left:1px solid #D1D5DB">Back</button>`;
    html += `</div>`;
  }
  html += `</div></div>`;

  // Scorecard table
  html += `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">`;
  html += `<table style="width:100%;border-collapse:collapse;font-family:'SF Mono','Menlo','Courier New',monospace;font-size:12px;min-width:${numCols * 40 + 64}px">`;

  // ── Hole number header row (dark green) ──
  html += `<tr style="background:#0D2818;color:#fff">`;
  html += `<td style="padding:8px 10px;font-weight:700;font-size:11px;white-space:nowrap;position:sticky;left:0;background:#0D2818;z-index:2;border-right:1px solid #1A472A">${isScramble ? 'Team' : 'Hole'}</td>`;
  for (let h = startHole; h <= endHole; h++) {
    const isCurrent = h === currentHole;
    html += `<td style="padding:8px 2px;text-align:center;min-width:36px;font-weight:700;font-size:12px;cursor:pointer;${isCurrent ? 'background:#B8962E;color:#0D2818' : 'border-right:1px solid #1A472A'}" onclick="window.MG.inlineScoreSetHole(${h})">${h}</td>`;
  }
  html += `<td style="padding:8px 6px;text-align:center;font-weight:700;font-size:10px;letter-spacing:0.5px;border-left:1px solid #1A472A">${isBack9 ? 'IN' : 'OUT'}</td>`;
  html += `</tr>`;

  // ── Yardage row ──
  if (hasYardage) {
    html += `<tr style="background:#F0F7F2">`;
    html += `<td style="padding:4px 10px;font-weight:600;font-size:10px;color:#6B7280;position:sticky;left:0;background:#F0F7F2;z-index:2;border-right:1px solid #E5E7EB">Yds</td>`;
    let ydsTotal = 0;
    for (let h = startHole; h <= endHole; h++) {
      const isCurrent = h === currentHole;
      const y = yardage[h - 1] || 0;
      ydsTotal += y;
      html += `<td style="padding:4px 2px;text-align:center;font-size:10px;color:#6B7280;${isCurrent ? 'background:rgba(184,150,46,0.1);border-left:2px solid #B8962E;border-right:2px solid #B8962E' : 'border-right:1px solid #EEE'}">${y || ''}</td>`;
    }
    html += `<td style="padding:4px 6px;text-align:center;font-size:10px;color:#6B7280;font-weight:700;border-left:1px solid #E5E7EB">${ydsTotal}</td>`;
    html += `</tr>`;
  }

  // ── HCP row ──
  if (hasHcp) {
    html += `<tr style="background:#F0F7F2">`;
    html += `<td style="padding:4px 10px;font-weight:600;font-size:10px;color:#6B7280;position:sticky;left:0;background:#F0F7F2;z-index:2;border-right:1px solid #E5E7EB">HCP</td>`;
    for (let h = startHole; h <= endHole; h++) {
      const isCurrent = h === currentHole;
      html += `<td style="padding:4px 2px;text-align:center;font-size:10px;color:#6B7280;${isCurrent ? 'background:rgba(184,150,46,0.1);border-left:2px solid #B8962E;border-right:2px solid #B8962E' : 'border-right:1px solid #EEE'}">${hcpIndex[h - 1] ?? ''}</td>`;
    }
    html += `<td style="padding:4px 6px;text-align:center;font-size:10px;color:#6B7280;border-left:1px solid #E5E7EB"></td>`;
    html += `</tr>`;
  }

  // ── Par row ──
  html += `<tr style="background:#F0F7F2;border-bottom:2px solid #0D2818">`;
  html += `<td style="padding:5px 10px;font-weight:700;font-size:11px;color:#374151;position:sticky;left:0;background:#F0F7F2;z-index:2;border-right:1px solid #E5E7EB">Par</td>`;
  let parTotal = 0;
  for (let h = startHole; h <= endHole; h++) {
    const isCurrent = h === currentHole;
    const p = pars[h - 1] || 4;
    parTotal += p;
    html += `<td style="padding:5px 2px;text-align:center;font-size:12px;font-weight:700;color:#374151;${isCurrent ? 'background:rgba(184,150,46,0.1);border-left:2px solid #B8962E;border-right:2px solid #B8962E' : 'border-right:1px solid #EEE'}">${p}</td>`;
  }
  html += `<td style="padding:5px 6px;text-align:center;font-size:12px;font-weight:700;color:#374151;border-left:1px solid #E5E7EB">${parTotal}</td>`;
  html += `</tr>`;

  // ── Player/Team score rows ──
  entities.forEach((entity, idx) => {
    const entityName = entity.name || entity;
    // Abbreviate team names for scorecard: "Team Amen Corner" -> "Amen Cnr"
    const displayName = isScramble
      ? entityName.replace(/^Team\s+/i, '').substring(0, 8)
      : (entityName.split(' ')[0].length > 5 ? entityName.split(' ')[0].substring(0, 5) : entityName.split(' ')[0]);

    html += `<tr style="border-bottom:1px solid #E5E7EB;background:#fff">`;
    html += `<td style="padding:6px 10px;font-weight:600;font-size:10px;color:#1A1A1A;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;position:sticky;left:0;background:#fff;z-index:2;border-right:1px solid #E5E7EB">${escHtml(displayName)}</td>`;

    let rowTotal = 0;
    let hasAnyScore = false;
    for (let h = startHole; h <= endHole; h++) {
      const isCurrent = h === currentHole;
      const existingScore = holes[h]?.scores?.[entityName] ?? null;
      const inlineVal = isCurrent ? (inlScores[entityName] ?? null) : null;
      const displayScore = inlineVal || existingScore;
      const par = pars[h - 1] || 4;

      if (displayScore) { rowTotal += displayScore; hasAnyScore = true; }

      const currentHighlight = isCurrent ? 'background:rgba(184,150,46,0.1);border-left:2px solid #B8962E;border-right:2px solid #B8962E;' : 'border-right:1px solid #EEE;';

      if (isCurrent && !readOnly) {
        // Input cell (editable mode)
        const st = displayScore ? scoreStyle(displayScore, par) : null;
        const inputBg = st && st.bg !== 'transparent' ? st.bg : '#FFFEF5';
        const inputColor = st ? st.color : '#1A1A1A';
        const inputBorder = displayScore ? (st && st.border !== 'none' ? st.border.split(' ').pop() : '#B8962E') : '#B8962E';
        const inputRadius = st && st.shape === 'circle' ? 'border-radius:50%;' : 'border-radius:3px;';
        html += `<td style="padding:3px 2px;text-align:center;${currentHighlight}">
          <input type="number" inputmode="numeric" pattern="[0-9]*"
            style="width:36px;height:36px;text-align:center;border:2px solid ${inputBorder};${inputRadius}background:${displayScore ? inputBg : '#FFFEF5'};font-family:'SF Mono','Menlo','Courier New',monospace;font-size:14px;font-weight:700;color:${inputColor};outline:none;-webkit-appearance:none;-moz-appearance:textfield;padding:0;margin:0 auto;display:block;box-shadow:inset 0 1px 3px rgba(0,0,0,0.06)"
            value="${displayScore || ''}"
            onfocus="this.select()"
            oninput="window.MG.inlineScoreType('${escHtml(entityName)}',this.value)"
            placeholder="\u00b7">
        </td>`;
      } else if (isCurrent && readOnly) {
        // Current hole in read-only mode — highlight but no input
        if (displayScore) {
          html += `<td style="padding:4px 2px;text-align:center;cursor:pointer;${currentHighlight}" onclick="window.MG.inlineScoreSetHole(${h})">
            ${renderScoreSpan(displayScore, par)}
          </td>`;
        } else {
          html += `<td style="padding:4px 2px;text-align:center;color:#B8962E;font-weight:700;${currentHighlight}" onclick="window.MG.inlineScoreSetHole(${h})">&bull;</td>`;
        }
      } else if (displayScore) {
        html += `<td style="padding:4px 2px;text-align:center;cursor:pointer;${currentHighlight}" onclick="window.MG.inlineScoreSetHole(${h})">
          ${renderScoreSpan(displayScore, par)}
        </td>`;
      } else {
        // Future hole — empty
        html += `<td style="padding:4px 2px;text-align:center;color:#D1D5DB;${currentHighlight}">&middot;</td>`;
      }
    }
    // Row total with to-par
    const rowParSum = (() => { let s = 0; for (let h = startHole; h <= endHole; h++) { const sc = holes[h]?.scores?.[entityName] ?? ((h === currentHole) ? (inlScores[entityName] ?? null) : null); if (sc) s += (pars[h - 1] || 4); } return s; })();
    const rowToPar = hasAnyScore && rowParSum > 0 ? rowTotal - rowParSum : null;
    const rowToParStr = rowToPar === null ? '' : rowToPar === 0 ? ' E' : rowToPar > 0 ? ' +' + rowToPar : ' ' + rowToPar;
    html += `<td style="padding:6px 6px;text-align:center;font-size:12px;font-weight:700;color:#374151;border-left:1px solid #E5E7EB;background:#F5F0E8">${hasAnyScore ? rowTotal : ''}${rowToParStr ? '<span style="font-size:10px;color:' + (rowToPar < 0 ? '#B8962E' : rowToPar > 0 ? '#DC2626' : '#6B7280') + '">' + rowToParStr + '</span>' : ''}</td>`;
    html += `</tr>`;
  });

  // ── OUT/IN totals row ──
  html += `<tr style="background:#F5F0E8;border-top:2px solid #0D2818">`;
  html += `<td style="padding:6px 10px;font-weight:800;font-size:11px;color:#374151;position:sticky;left:0;background:#F5F0E8;z-index:2;border-right:1px solid #E5E7EB">${isBack9 ? 'IN' : 'OUT'}</td>`;
  for (let h = startHole; h <= endHole; h++) {
    const isCurrent = h === currentHole;
    // Sum all entity scores for this hole
    let holeTotal = 0;
    let holeHasScore = false;
    entities.forEach(entity => {
      const entityName = entity.name || entity;
      const sc = holes[h]?.scores?.[entityName] ?? null;
      const inlineVal = (h === currentHole) ? (inlScores[entityName] ?? null) : null;
      const val = inlineVal || sc;
      if (val) { holeTotal += val; holeHasScore = true; }
    });
    html += `<td style="padding:6px 2px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;${isCurrent ? 'background:rgba(184,150,46,0.15);border-left:2px solid #B8962E;border-right:2px solid #B8962E' : 'border-right:1px solid #E8E5DE'}"></td>`;
  }
  // Grand total
  html += `<td style="padding:6px 6px;text-align:center;font-size:11px;font-weight:800;color:#374151;border-left:1px solid #E5E7EB"></td>`;
  html += `</tr>`;

  html += `</table></div>`;

  // Save button (only in editable mode — not when readOnly with separate keypad below)
  if (!readOnly) {
    const allFilled = entities.length > 0 && entities.every(e => {
      const n = e.name || e;
      return inlScores[n] >= 1 && inlScores[n] <= 15;
    });
    html += `<div style="padding:12px 16px 14px">`;
    html += `<button onclick="window.MG.inlineScoreSave()" ${allFilled ? '' : 'disabled'}
      style="width:100%;padding:14px;background:${allFilled ? '#B8962E' : '#E5E7EB'};color:${allFilled ? '#fff' : '#9CA3AF'};border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:${allFilled ? 'pointer' : 'default'};letter-spacing:0.3px;box-shadow:${allFilled ? '0 3px 12px rgba(184,150,46,0.3)' : 'none'}">
      ${allFilled ? 'Save Hole ' + currentHole + ' \u2192' : 'Fill in all scores for Hole ' + currentHole}
    </button>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ─── RUNNING P&L HELPER ───
// Computes minimum-transfers payment list from a P&L map.
// Returns [{from, to, amount}] — the fewest Venmo payments to settle up.
function computePayablePairs(pnl) {
  const creditors = [];
  const debtors = [];
  Object.entries(pnl).forEach(([name, val]) => {
    const rounded = Math.round(val);
    if (rounded > 0) creditors.push({ name, amount: rounded });
    else if (rounded < 0) debtors.push({ name, amount: -rounded });
  });
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  const txns = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const pay = Math.min(creditors[i].amount, debtors[j].amount);
    if (pay > 0) txns.push({ from: debtors[j].name, to: creditors[i].name, amount: pay });
    creditors[i].amount -= pay;
    debtors[j].amount -= pay;
    if (creditors[i].amount <= 0) i++;
    if (debtors[j].amount <= 0) j++;
  }
  return txns;
}

// Computes settled cash P&L per player from skins/nassau results.
// Returns {playerName: dollarAmount} (positive = winning, negative = losing)
export function computeRoundPnL(gameState, players, games, structure) {
  const skinsBet = parseInt(structure?.skinsBet) || 5;
  const nassauBet = parseInt(structure?.nassauBet) || 10;
  const n = players.length;
  const pnl = {};
  players.forEach(p => { pnl[p.name] = 0; });

  if (games.skins) {
    const skinsH = getSkinsHoles(gameState, null, players);
    Object.values(skinsH).forEach(h => {
      if (h.winner && pnl.hasOwnProperty(h.winner)) {
        const pot = h.potWon || 1;
        pnl[h.winner] += pot * (n - 1) * skinsBet;
        players.forEach(p => { if (p.name !== h.winner) pnl[p.name] -= pot * skinsBet; });
      }
    });
  }

  if (games.nassau && gameState?.nassau) {
    const nas = gameState.nassau;
    [nas.frontWinner, nas.backWinner, nas.totalWinner].forEach(winner => {
      if (!winner) return;
      players.forEach(p => {
        if (p.name === winner) pnl[p.name] += nassauBet * (n - 1);
        else pnl[p.name] -= nassauBet;
      });
    });
  }

  if (games.wolf && gameState?.wolf?.running) {
    const wolfBet = parseInt(structure?.wolfBet) || 5;
    players.forEach(p => {
      pnl[p.name] += (gameState.wolf.running[p.name] || 0) * wolfBet;
    });
  }

  if (games.stableford && gameState?.stableford?.running) {
    const stblBet = parseInt(structure?.stablefordBet) || 5;
    const running = gameState.stableford.running;
    const avg = Object.values(running).reduce((s, v) => s + v, 0) / n;
    players.forEach(p => {
      const pts = running[p.name] || 0;
      pnl[p.name] += Math.round((pts - avg) * stblBet);
    });
  }

  if (games.match_play && gameState?.match_play?.running) {
    const mpBet = parseInt(structure?.matchPlayBet) || 10;
    const running = gameState.match_play.running;
    const avg = Object.values(running).reduce((s, v) => s + v, 0) / n;
    players.forEach(p => {
      const pts = running[p.name] || 0;
      pnl[p.name] += Math.round((pts - avg) * mpBet);
    });
  }

  if (games.banker && gameState?.banker?.running) {
    const bankerBet = parseInt(structure?.bankerBet) || 5;
    players.forEach(p => {
      pnl[p.name] += (gameState.banker.running[p.name] || 0) * bankerBet;
    });
  }

  if (games.bingo && gameState?.bingo?.running) {
    const bbbBet = parseInt(structure?.bbbBet) || 5;
    const running = gameState.bingo.running;
    const avg = Object.values(running).reduce((s, v) => s + v, 0) / n;
    players.forEach(p => {
      const pts = running[p.name] || 0;
      pnl[p.name] += Math.round((pts - avg) * bbbBet);
    });
  }

  if (games.bloodsome && gameState?.bloodsome?.running) {
    const bloodBet = parseInt(structure?.bloodsomeBet) || 5;
    const running = gameState.bloodsome.running;
    const avg = Object.values(running).reduce((s, v) => s + v, 0) / n;
    players.forEach(p => {
      pnl[p.name] += Math.round(((running[p.name] || 0) - avg) * bloodBet);
    });
  }

  return pnl;
}

// ─── NAME PICKER MODAL ───
// One-time centered overlay modal. After picking or skipping, never shows again.
export function renderNamePickerModal(state) {
  const players = (state._allPlayers || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return `<div style="position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:var(--bg-secondary,var(--mg-surface));border:1px solid var(--border,var(--mg-border));border-radius:16px;padding:24px;max-width:340px;width:100%;box-sizing:border-box">
      <div style="font-size:18px;font-weight:700;color:var(--text-primary,var(--mg-text));margin-bottom:4px">Who are you?</div>
      <div style="font-size:13px;color:var(--text-secondary,var(--mg-text-muted));margin-bottom:16px">Pick your name to track your bets and P&amp;L</div>
      <div style="max-height:300px;overflow-y:auto">
        ${players.map(p => `
          <button onclick="window.MG.pickNameFromModal('${escHtml(p.name)}')"
            style="width:100%;padding:14px;margin-bottom:8px;background:var(--bg-tertiary,var(--mg-surface));border:1px solid var(--border,var(--mg-border));border-radius:10px;color:var(--text-primary,var(--mg-text));font-size:15px;font-weight:600;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;-webkit-tap-highlight-color:transparent">
            <span>${escHtml(p.name)}</span>
            <span style="font-size:12px;color:var(--text-secondary,var(--mg-text-muted))">HI ${p.handicapIndex ?? p.handicap ?? 0}</span>
          </button>
        `).join('')}
      </div>
      <button onclick="window.MG.pickNameFromModal('')" style="width:100%;padding:12px;background:transparent;border:none;color:var(--text-tertiary,var(--mg-text-muted));font-size:13px;cursor:pointer;margin-top:4px">Just watching</button>
    </div>
  </div>`;
}

/**
 * Scramble Leaderboard — unified "board is the book" view for scramble/outing events ($149 tier).
 * Mirrors the buddies trip experience: event header, inline score entry, Augusta-style
 * leaderboard with betting lines, live ticker, side games, Calcutta, sponsors, and sharing.
 */
export function renderScrambleLeaderboard(state) {
  const config = state._config;
  const gameState = state._gameState;
  const scramble = gameState?.scramble;
  const holes = state._holes || {};
  const holesPerRound = config?.holesPerRound || 18;
  const pars = getCoursePars(config);
  const totalPar = pars.reduce((s, p) => s + p, 0) || 72;
  const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const holesPlayed = scoredHoles.length;
  const latestHole = holesPlayed > 0 ? Math.max(...scoredHoles) : 0;
  const nextHole = latestHole < holesPerRound ? latestHole + 1 : holesPerRound;
  const roundComplete = holesPlayed >= holesPerRound;
  const holesRemaining = holesPerRound - holesPlayed;

  // Teams & prize pool
  const leaderboard = scramble?.leaderboard || [];
  const totalTeams = leaderboard.length || (config?.scrambleTeams?.length || config?.roster?.length || 0);
  const entryFee = config?.scrambleEntryFee || 0;
  const totalPool = entryFee * (totalTeams || 0);
  const formatLabel = config?.scrambleFormat ? config.scrambleFormat.replace(/_/g, ' ') : 'Scramble';
  const calcuttaTeams = state._calcutta?.teams || {};
  const slug = state._slug || (location.pathname.match(/\/waggle\/([a-z0-9_-]+)/)?.[1]) || 'event';

  // Freshness / live indicator
  const lastSync = state._lastSyncAt;
  const now = Date.now();
  const staleness = lastSync ? (now - lastSync) / 1000 : 999;
  let freshnessColor = 'var(--win)';
  let freshnessLabel = 'LIVE';
  if (staleness > 120) { freshnessColor = 'var(--loss)'; freshnessLabel = 'OFFLINE'; }
  else if (staleness > 30) { freshnessColor = 'var(--gold-bright)'; freshnessLabel = 'DELAYED'; }

  // Prize payouts
  const first = totalPool > 0 ? Math.round(totalPool * 0.5) : 0;
  const second = totalPool > 0 ? Math.round(totalPool * 0.25) : 0;
  const third = totalPool > 0 ? Math.round(totalPool * 0.15) : 0;
  const fourth = totalPool > 0 ? totalPool - first - second - third : 0;
  const payoutByPosition = [first, second, third, fourth];

  let html = '';

  // ================================================================
  // SECTION 1: EVENT HEADER BAR (dark green, compact)
  // ================================================================
  {
    const eventName = config?.event?.name || 'Scramble';
    const venue = config?.event?.venue || config?.event?.course || '';
    const roundNum = config?.currentRound || state._currentRound || 1;

    html += `<div style="background:var(--mg-green);color:var(--text-primary);border-radius:10px;padding:12px 16px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="min-width:0;flex:1">
          <div style="font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(eventName)}</div>
          <div style="font-size:11px;opacity:.6;margin-top:2px">${venue ? escHtml(venue) + ' &middot; ' : ''}R${roundNum}</div>
          ${state.bettorName ? `<div style="margin-top:4px"><span onclick="window.MG.editBettorName()" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.3);border-radius:12px;font-size:10px;font-weight:600;color:var(--gold-bright);cursor:pointer"><span style="width:5px;height:5px;border-radius:50%;background:var(--gold-bright)"></span>${escHtml(state.bettorName)}</span></div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:12px">
          ${totalPool > 0 ? `<div style="font-size:10px;opacity:.5;text-transform:uppercase;letter-spacing:1px">Prize Pool</div>
          <div style="font-size:20px;font-weight:800;color:var(--gold-bright);font-family:'SF Mono',monospace">$${totalPool.toLocaleString()}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <span style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;background:var(--border);color:var(--text-primary);padding:3px 8px;border-radius:4px">${totalTeams} team${totalTeams !== 1 ? 's' : ''}</span>
        <span style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:capitalize;background:var(--border);color:var(--text-primary);padding:3px 8px;border-radius:4px">${escHtml(formatLabel)}</span>
        <span style="font-size:10px;padding:3px 8px;border-radius:4px;background:var(--border);color:var(--text-secondary)">Thru ${holesPlayed} of ${holesPerRound}</span>
        <span style="display:flex;align-items:center;gap:3px;font-size:10px;color:${freshnessColor};font-weight:700;letter-spacing:0.5px;margin-left:auto">
          <span style="width:6px;height:6px;border-radius:50%;background:${freshnessColor};${staleness <= 30 ? 'animation:pulse 1.5s ease-in-out infinite' : ''}"></span>
          ${freshnessLabel}
        </span>
      </div>
    </div>`;
  }

  // ================================================================
  // SUB-TAB BAR (scramble mid-round)
  // ================================================================
  const scrShowSubTabs = holesPlayed > 0 && !roundComplete;
  const scrActiveSubTab = scrShowSubTabs ? (state._boardSubTab || 'score') : null;
  if (scrShowSubTabs) {
    const scrTabItems = [
      { key: 'score', icon: '\u25A6', label: 'Score' },
      { key: 'board', icon: '\uD83C\uDFC6', label: 'Board' },
      { key: 'bar',   icon: '\uD83C\uDF7A', label: 'The Bar' }
    ];
    html += `<div style="display:flex;gap:4px;margin-bottom:8px;padding:3px;border-radius:10px;background:var(--bg-secondary);border:1px solid var(--border)">`;
    scrTabItems.forEach(t => {
      const isActive = scrActiveSubTab === t.key;
      html += `<button onclick="window.MG.setBoardTab('${t.key}')" style="flex:1;padding:10px 8px;font-size:13px;font-weight:700;border:none;cursor:pointer;border-radius:8px;transition:all .15s;${isActive ? 'background:var(--gold-primary,var(--mg-gold));color:var(--bg-primary,var(--mg-green));box-shadow:0 2px 8px rgba(212,160,23,0.3)' : 'background:transparent;color:var(--text-secondary)'}">
        <span style="margin-right:4px;font-size:12px">${t.icon}</span>${t.label}
      </button>`;
    });
    html += `</div>`;
  }

  // ================================================================
  // SECTION 2: INLINE SCORE ENTRY (admin/scorer only)
  // ================================================================
  if ((!scrShowSubTabs || scrActiveSubTab === 'score') && state.adminAuthed && !roundComplete) {
    if (!state._inlineScore) {
      const existingScores = holes[nextHole]?.scores || {};
      state._inlineScore = { hole: nextHole, scores: { ...existingScores } };
    }
    const inl = state._inlineScore;
    const currentHole = inl.hole;
    const inlScores = inl.scores || {};
    const teams = leaderboard.map(e => e.team);
    const teamsFallback = teams.length > 0 ? teams : (config?.scrambleTeams?.map(t => t.name || t) || config?.roster?.map(r => r.name || r) || []);
    const scrYardage = getCourseYardage(config);
    const scrHcp = getCourseHcpIndex(config);
    const scrCourseName = config?.course?.name || config?.event?.course || config?.event?.venue || '';

    // Map team names to entity objects for premium scorecard
    const scrEntities = teamsFallback.map(t => ({ name: typeof t === 'string' ? t : (t.name || t) }));

    html += renderPremiumScorecard({
      currentHole,
      pars,
      hcpIndex: scrHcp,
      yardage: scrYardage,
      holes,
      entities: scrEntities,
      inlScores,
      holesPerRound,
      courseName: scrCourseName,
      isScramble: true
    });
  } else if (roundComplete && state.adminAuthed) {
    html += `<div style="background:var(--bg-secondary);border-radius:12px;padding:20px;margin-bottom:8px;text-align:center;border:1px solid var(--border)">
      <div style="font-size:20px;font-weight:700;color:var(--gold-bright);margin-bottom:8px">Round Complete</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">All ${holesPerRound} holes scored. Final results below.</div>
    </div>`;
  }

  // ================================================================
  // SECTION 3: AUGUSTA-STYLE LEADERBOARD + BETTING (BOARD tab)
  // ================================================================
  if ((!scrShowSubTabs || scrActiveSubTab === 'board') && leaderboard.length > 0) {
    html += `<div style="margin-bottom:8px">`;

    // Header
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:0 2px">
      <span style="font-size:16px;font-weight:800;color:var(--gold-bright)">Leaderboard</span>
    </div>`;

    // Team rows — card-based with depth
    leaderboard.forEach((entry, i) => {
      const parForPlayed = holesPlayed > 0 ? pars.slice(0, Math.max(...scoredHoles)).reduce((s, p) => s + p, 0) : 0;
      const toPar = entry.total - parForPlayed;
      const toParStr = toPar === 0 ? 'E' : toPar > 0 ? '+' + toPar : String(toPar);
      const isLeader = i === 0;
      const isTop3 = i < 3;
      const toParColor = toPar < 0 ? 'var(--gold-bright)' : toPar > 0 ? 'var(--loss)' : 'var(--text-primary)';

      // Implied odds based on position
      const oddsArr = ['+150', '+225', '+350', '+500', '+700', '+900', '+1200', '+1500'];
      const odds = oddsArr[i] || '+' + (1500 + (i - 7) * 500);
      const oddsNum = parseFloat(odds.replace('+', ''));
      const isFavorite = odds.startsWith('-');
      const oddsColor = isFavorite ? 'white' : 'var(--text-secondary)';
      const oddsBorderColor = isFavorite ? 'var(--gold-primary,var(--mg-gold))' : 'var(--border)';

      // Projected payout
      const payout = payoutByPosition[i] || 0;
      const payoutGlow = isLeader && payout > 0 ? 'text-shadow:0 0 8px rgba(212,160,23,0.4)' : '';

      const expanded = state._expandedPlayer === entry.team;
      const cOwner = calcuttaTeams[entry.team];
      const ownerStr = cOwner?.sold ? cOwner.winner : null;

      // Hole-by-hole scores for this team
      const teamHoleScores = [];
      let teamFront = 0, teamBack = 0;
      for (let h = 1; h <= holesPerRound; h++) {
        const sc = holes[h]?.scores?.[entry.team] ?? null;
        teamHoleScores.push(sc);
        if (sc !== null) {
          if (h <= 9) teamFront += sc;
          else teamBack += sc;
        }
      }

      // Card styles — leader gets gold border only (no gradient for readability)
      const cardBg = isLeader
        ? 'background:var(--bg-secondary);border:1.5px solid var(--gold-primary,var(--mg-gold))'
        : 'background:var(--bg-secondary);border:1px solid var(--border)';

      // Position badge
      const badgeBg = isLeader ? 'background:var(--gold-bright);color:var(--bg-secondary)' : isTop3 ? 'background:transparent;border:1.5px solid var(--gold-primary,var(--mg-gold));color:var(--gold-bright)' : 'background:transparent;border:1.5px solid var(--border-strong,var(--border));color:var(--text-secondary)';

      // To-par size — massive for leader
      const toParSize = isLeader ? 'font-size:28px;font-weight:900' : 'font-size:20px;font-weight:800';

      html += `<div onclick="window.MG.togglePlayerExpand('${escHtml(entry.team)}')" style="${cardBg};border-radius:10px;padding:12px 14px;margin-bottom:6px;cursor:pointer;-webkit-tap-highlight-color:transparent">`;

      // Main row
      html += `<div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
            <span style="width:24px;height:24px;border-radius:50%;${badgeBg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;box-sizing:border-box">${entry.position || (i + 1)}</span>
            <span style="font-size:15px;font-weight:${isLeader ? '700' : '500'};color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(entry.team)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:8px">
            <span style="font-family:'SF Mono',monospace;${toParSize};color:${toParColor}">${toParStr}</span>
            ${payout > 0 ? `<span style="font-family:'SF Mono',monospace;font-size:13px;font-weight:800;color:var(--gold-bright);${payoutGlow}">$${payout.toLocaleString()}</span>` : ''}
            <button onclick="event.stopPropagation();window.MG.openOddsBetSlip('${escHtml(entry.team)}','to_win','${odds}')" style="padding:6px 12px;border-radius:8px;border:1.5px solid ${oddsBorderColor};background:var(--bg-tertiary);color:${oddsColor};font-family:'SF Mono',monospace;font-size:15px;font-weight:800;cursor:pointer;min-width:60px;text-align:center;-webkit-tap-highlight-color:transparent;transition:transform .1s" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">${odds}</button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2.5" style="flex-shrink:0;transition:transform .2s;transform:${expanded ? 'rotate(180deg)' : 'rotate(0)'}"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>`;

      // Expanded detail
      if (expanded) {
        html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bg-tertiary);margin-left:32px">`;

        // Hole-by-hole
        if (holesPlayed > 0) {
          const frontScores = teamHoleScores.slice(0, Math.min(9, holesPerRound));
          const backScores = holesPerRound > 9 ? teamHoleScores.slice(9, holesPerRound) : [];
          const frontStr = frontScores.map(s => s !== null ? String(s) : '-').join(' ');
          const backStr = backScores.map(s => s !== null ? String(s) : '-').join(' ');
          html += `<div style="font-size:12px;font-family:'SF Mono',monospace;color:var(--text-secondary);margin-bottom:6px">
            <span style="color:var(--text-tertiary);font-size:10px">OUT:</span> ${frontStr}${teamFront > 0 ? ` <span style="color:var(--text-secondary)">= ${teamFront}</span>` : ''}
          </div>`;
          if (backScores.length > 0) {
            html += `<div style="font-size:12px;font-family:'SF Mono',monospace;color:var(--text-secondary);margin-bottom:6px">
              <span style="color:var(--text-tertiary);font-size:10px">IN:</span>&nbsp; ${backStr}${teamBack > 0 ? ` <span style="color:var(--text-secondary)">= ${teamBack}</span>` : ''}
            </div>`;
          }
        }

        // Pace projection
        if (holesPlayed >= 3) {
          const pace = Math.round((entry.total / holesPlayed) * holesPerRound);
          const projPar = pace - totalPar;
          const projStr = projPar === 0 ? 'E' : projPar > 0 ? '+' + projPar : String(projPar);
          html += `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Pace: ${pace} gross (proj final ${projStr})</div>`;
        }

        // Calcutta owner
        if (ownerStr) {
          html += `<div style="font-size:12px;color:rgba(212,160,23,0.6);margin-bottom:6px">Calcutta: Owned by ${escHtml(ownerStr)} ($${cOwner.amount})</div>`;
        }

        // Lay action button
        html += `<button onclick="event.stopPropagation();window.MG.layAction('${escHtml(entry.team)}')" style="width:100%;padding:10px;margin-top:4px;background:transparent;border:1.5px solid rgba(212,160,23,0.3);border-radius:6px;color:var(--gold-bright);font-size:12px;font-weight:600;cursor:pointer;min-height:44px">Lay Action on ${escHtml(entry.team)}</button>`;

        html += `</div>`;
      } else if (ownerStr) {
        // Show Calcutta owner in collapsed view too
        html += `<div style="margin-left:32px;margin-top:2px"><span style="font-size:10px;color:rgba(212,160,23,0.4)">Calcutta: ${escHtml(ownerStr)} ($${cOwner.amount})</span></div>`;
      }

      html += `</div>`;
    });

    // Prize pool footer
    if (totalPool > 0) {
      html += `<div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-family:'SF Mono',monospace;color:#6B7280">
        <span style="font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:10px">Prize Pool: $${totalPool.toLocaleString()}</span>
        <div style="display:flex;gap:12px;font-size:10px">
          <span style="color:#B8962E">1st $${first.toLocaleString()}</span>
          <span style="color:#555">2nd $${second.toLocaleString()}</span>
          <span style="color:#888">3rd $${third.toLocaleString()}</span>
        </div>
      </div>`;
    }

    // Footer
    html += `<div style="padding:8px 14px;display:flex;justify-content:space-between;font-size:11px;font-family:'SF Mono',monospace;color:#6B7280">
      <span>Thru ${holesPlayed}</span>
      <span>${holesRemaining} hole${holesRemaining !== 1 ? 's' : ''} remaining</span>
    </div>`;

    html += `</div>`;
  } else if (scoredHoles.length === 0) {
    // No scores yet — waiting state
    html += `<div style="background:var(--bg-secondary);border-radius:10px;overflow:hidden;margin-bottom:8px;text-align:center;padding:40px 20px">
      <div style="font-size:18px;font-weight:700;color:var(--gold-bright);margin-bottom:8px">Waiting for Scores</div>
      <div style="font-size:13px;color:var(--text-secondary)">
        ${state.adminAuthed ? 'Use the scorecard above to enter hole 1.' : 'The commissioner will enter scores as teams play.'}
      </div>
      ${totalTeams > 0 ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">${totalTeams} team${totalTeams !== 1 ? 's' : ''} registered</div>` : ''}
    </div>`;
  }

  // ================================================================
  // SECTION 4: LIVE TICKER (BOARD tab)
  // ================================================================
  if (!scrShowSubTabs || scrActiveSubTab === 'board') {
    const feedItems = state._feed || [];
    if (feedItems.length > 0 && holesPlayed > 0) {
      const latestFeed = feedItems.slice(0, 5);
      html += `<div id="board-ticker" style="background:var(--bg-secondary);border-left:3px solid var(--mg-gold);border-radius:0 8px 8px 0;padding:8px 12px;margin-bottom:8px;overflow:hidden;height:28px;cursor:pointer;animation:tickerBorderPulse 2s ease-in-out infinite" onclick="this.style.height=this.style.height==='28px'?'auto':'28px'">`;
      latestFeed.forEach((item, idx) => {
        const text = item.text || '';
        html += `<div style="font-size:12px;font-style:italic;color:rgba(240,236,227,0.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${idx > 0 ? 'margin-top:6px' : ''}">${escHtml(text)}</div>`;
      });
      html += `</div>`;
    }
  }

  // ================================================================
  // SECTION 5: SIDE GAMES (CTP / LD) — BAR tab
  // ================================================================
  const sideGames = config?.scrambleSideGames;
  if ((!scrShowSubTabs || scrActiveSubTab === 'bar') && sideGames) {
    if (sideGames.closestToPin?.length > 0) {
      html += `<div style="padding:16px;background:var(--bg-secondary);border:1px solid var(--mg-border);border-radius:10px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-muted);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <span style="width:3px;height:14px;background:var(--gold-bright);border-radius:2px;display:inline-block"></span>
          CLOSEST TO PIN
        </div>`;
      sideGames.closestToPin.forEach((hole, idx) => {
        const winner = gameState?.sideGames?.ctp?.[hole];
        const played = scoredHoles.includes(hole);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${idx < sideGames.closestToPin.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
          <span style="font-size:15px;font-weight:600;color:var(--mg-text)">Hole ${hole}</span>
          <span style="font-size:15px;font-weight:700;color:${winner ? 'var(--gold-bright)' : 'var(--mg-text-muted)'}">${winner ? escHtml(winner) : (played ? 'No winner' : 'TBD')}</span>
        </div>`;
      });
      html += `</div>`;
    }
    if (sideGames.longestDrive?.length > 0) {
      html += `<div style="padding:16px;background:var(--bg-secondary);border:1px solid var(--mg-border);border-radius:10px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-muted);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <span style="width:3px;height:14px;background:var(--gold-bright);border-radius:2px;display:inline-block"></span>
          LONGEST DRIVE
        </div>`;
      sideGames.longestDrive.forEach((hole, idx) => {
        const winner = gameState?.sideGames?.ld?.[hole];
        const played = scoredHoles.includes(hole);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${idx < sideGames.longestDrive.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
          <span style="font-size:15px;font-weight:600;color:var(--mg-text)">Hole ${hole}</span>
          <span style="font-size:15px;font-weight:700;color:${winner ? 'var(--gold-bright)' : 'var(--mg-text-muted)'}">${winner ? escHtml(winner) : (played ? 'No winner' : 'TBD')}</span>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ================================================================
  // SECTION 6: CALCUTTA (BAR tab)
  // ================================================================
  if (!scrShowSubTabs || scrActiveSubTab === 'bar') {
    html += renderCalcuttaSection(state);
  }

  // ================================================================
  // SECTION 7: HOLE SPONSORS (BAR tab)
  // ================================================================
  const sponsors = config?.sponsors;
  if ((!scrShowSubTabs || scrActiveSubTab === 'bar') && sponsors && Object.keys(sponsors).length > 0) {
    html += `<div style="padding:16px;background:var(--bg-secondary);border:1px solid var(--mg-border);border-radius:10px;margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-muted);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <span style="width:3px;height:14px;background:var(--gold-bright);border-radius:2px;display:inline-block"></span>
        HOLE SPONSORS
      </div>`;
    Object.keys(sponsors).sort((a, b) => parseInt(a) - parseInt(b)).forEach((hole, idx, arr) => {
      const s = sponsors[hole];
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${idx < arr.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <span style="font-size:13px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:0.5px">Hole ${hole}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:15px;font-weight:600;color:var(--gold-bright)">${escHtml(s.name)}</span>
          ${s.logo ? `<img src="${escHtml(s.logo)}" style="height:24px;border-radius:3px" alt="${escHtml(s.name)}">` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ================================================================
  // SECTION 7B: LIVE FEED (BAR tab)
  // ================================================================
  if (scrShowSubTabs === false || scrActiveSubTab === 'bar') {
    const feedItems = state._feed || [];
    if (feedItems.length > 0) {
      const recentFeed = feedItems.slice(0, 8);
      html += `<div style="padding:16px;background:var(--bg-secondary);border:1px solid var(--mg-border);border-radius:10px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-muted);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <span style="width:3px;height:14px;background:var(--gold-bright);border-radius:2px;display:inline-block"></span>
          LIVE FEED
        </div>`;
      recentFeed.forEach((item, idx) => {
        const playerName = item.player || item.name || '??';
        const initials = playerName.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
        const msg = item.msg || item.text || '';
        const ts = item.ts ? new Date(item.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
        html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;${idx < recentFeed.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
          <span style="width:28px;height:28px;border-radius:50%;background:rgba(212,160,23,0.12);color:var(--gold-bright);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:0.5px">${escHtml(initials)}</span>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;color:var(--text-primary);line-height:1.4;overflow:hidden;text-overflow:ellipsis">${escHtml(msg)}</div>
            ${ts ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${ts}</div>` : ''}
          </div>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ================================================================
  // SECTION 7C: BACK 9 OUTLOOK (BAR tab)
  // ================================================================
  if (scrShowSubTabs === false || scrActiveSubTab === 'bar') {
    if (leaderboard.length >= 2) {
      const leader = leaderboard[0];
      const runnerUp = leaderboard[1];
      const leadMargin = (runnerUp.total || 0) - (leader.total || 0);
      let outlookEmoji, outlookText;

      if (roundComplete) {
        outlookEmoji = '🏁';
        outlookText = `Round Complete — ${escHtml(leader.team)} wins${leadMargin > 0 ? ` by ${leadMargin} stroke${leadMargin !== 1 ? 's' : ''}` : leadMargin === 0 ? ' in a tie' : ''}!`;
      } else if (leadMargin > 3) {
        outlookEmoji = '🏆';
        outlookText = `${escHtml(leader.team)} has a commanding ${leadMargin}-stroke lead with ${holesRemaining} hole${holesRemaining !== 1 ? 's' : ''} to play.`;
      } else if (leadMargin >= 1) {
        outlookEmoji = '⚔️';
        outlookText = `Tight race — only ${leadMargin} stroke${leadMargin !== 1 ? 's' : ''} separate the top two with ${holesRemaining} hole${holesRemaining !== 1 ? 's' : ''} left to play.`;
      } else {
        outlookEmoji = '🔥';
        outlookText = `Deadlocked. ${holesRemaining > 0 ? `Back ${holesRemaining > 9 ? holesRemaining : 9} decides it all.` : 'Heading to a playoff.'}`;
      }

      html += `<div style="padding:20px 16px;background:#1a3a2a;border-radius:10px;margin-bottom:8px;position:relative;overflow:hidden">
        <div style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:48px;opacity:0.07;pointer-events:none">⛳</div>
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(212,160,23,0.6);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <span style="width:3px;height:14px;background:var(--gold-bright);border-radius:2px;display:inline-block"></span>
          BACK 9 OUTLOOK
        </div>
        <div style="font-size:28px;margin-bottom:8px;line-height:1">${outlookEmoji}</div>
        <div style="font-size:15px;font-weight:600;color:#F5F0E8;line-height:1.5;position:relative;z-index:1">${outlookText}</div>
        ${!roundComplete && holesRemaining > 0 ? `<div style="font-size:11px;color:rgba(245,240,232,0.4);margin-top:10px">${holesRemaining} hole${holesRemaining !== 1 ? 's' : ''} remaining &middot; ${holesPlayed} played</div>` : ''}
      </div>`;
    }
  }

  // ================================================================
  // SECTION 7D: WHAT'S AT STAKE (BAR tab)
  // ================================================================
  if ((scrShowSubTabs === false || scrActiveSubTab === 'bar') && leaderboard.length >= 2 && !roundComplete) {
    const stakeLeader = leaderboard[0];
    const stakeRunner = leaderboard[1];
    const stakeGap = (stakeRunner.total || 0) - (stakeLeader.total || 0);
    const firstPrize = payoutByPosition[0] || 0;
    const teamsInContention = leaderboard.filter((t, i) => {
      if (i === 0) return true;
      const gap = (t.total || 0) - (stakeLeader.total || 0);
      return gap <= 4;
    }).length;
    const evPerHole = holesRemaining > 0 && firstPrize > 0 ? Math.round(firstPrize / holesRemaining) : 0;

    let stakeText;
    if (stakeGap === 0) {
      stakeText = `It's all even. $${firstPrize.toLocaleString()} goes to whoever handles the back ${holesRemaining > 9 ? holesRemaining : 'nine'}.`;
    } else {
      stakeText = `${escHtml(stakeLeader.team)} leads by ${stakeGap} with ${holesRemaining} hole${holesRemaining !== 1 ? 's' : ''} left. $${firstPrize.toLocaleString()} first place is within reach for ${teamsInContention} team${teamsInContention !== 1 ? 's' : ''}.`;
    }

    html += `<div style="padding:20px 16px;background:#1a3a2a;border-radius:10px;margin-bottom:8px;position:relative;overflow:hidden">
      <div style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:48px;opacity:0.07;pointer-events:none">💰</div>
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(212,160,23,0.6);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <span style="width:3px;height:14px;background:var(--gold-bright);border-radius:2px;display:inline-block"></span>
        WHAT'S AT STAKE
      </div>
      <div style="font-size:15px;font-weight:600;color:#F5F0E8;line-height:1.5;position:relative;z-index:1">${stakeText}</div>
      ${evPerHole > 0 ? `<div style="font-size:13px;color:var(--gold-bright);margin-top:8px;font-weight:600;position:relative;z-index:1">Every hole is worth roughly <span style="font-family:'SF Mono',monospace">$${evPerHole}</span> in expected value.</div>` : ''}
    </div>`;
  }

  // ================================================================
  // SECTION 8: SHARE + REGISTRATION LINK (BAR tab)
  // ================================================================
  if (!scrShowSubTabs || scrActiveSubTab === 'bar') {
  html += `<div style="padding:16px;background:var(--bg-secondary);border:1px solid var(--mg-border);border-radius:10px;margin-bottom:8px;text-align:center">
    <button onclick="if(navigator.share){navigator.share({title:'${escHtml(config?.event?.name || 'Scramble Leaderboard')}',url:location.href})}else{navigator.clipboard.writeText(location.href).then(()=>alert('Link copied!'))}"
      style="width:100%;padding:14px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;min-height:48px;margin-bottom:10px">
      Share Leaderboard
    </button>
    <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:6px">
      Team Registration: <a href="/${slug}/register" style="color:var(--gold-muted);font-weight:600;text-decoration:underline">betwaggle.com/${escHtml(slug)}/register</a>
    </div>
    <div style="font-size:12px">
      <a href="/${slug}?tv=1" style="color:var(--mg-text-muted);text-decoration:none;font-weight:500">Project to big screen &rarr;</a>
    </div>
  </div>`;
  }

  html += renderOddsBetSlip(state);
  return html;
}

/**
 * Live round feed — the home screen for casual (quick / buddies_trip) events.
 * Replaces the empty tournament dashboard for 2–8 player buddy rounds.
 *
 * Layout:
 *   1. Wolf announcement banner (if wolf game + current hole not yet scored)
 *   2. Hole flash modal (once per new hole, auto-dismissed)
 *   3. Round progress bar (hole N of M · skin pot · Nassau status)
 *   4. Live leaderboard (stroke net standings)
 *   5. Event feed (skin won/carried, Nassau events, wolf results)
 *   6. Round complete CTA → #settle
 */
function computeTotalPot(games, structure, playerCount, holesPlayed) {
  let pot = 0;
  const n = playerCount;
  if (games.nassau) {
    const bet = parseInt(structure?.nassauBet) || 10;
    pot += bet * 3 * (n - 1); // front + back + overall per player
  }
  if (games.skins) {
    const bet = parseInt(structure?.skinsBet) || 5;
    pot += bet * holesPlayed * (n - 1);
  }
  return pot;
}

function narrativize(item, gameState, structure) {
  if (item.type === 'score') {
    let narrative = item.text;
    if (gameState?.skins?.pot > 1) {
      narrative += ` Skins pot: \u00d7${gameState.skins.pot}.`;
    }
    return narrative;
  }
  if (item.type === 'press') {
    return item.text;
  }
  return item.text;
}

/**
 * Calculate real moneyline odds for a player to win the event.
 * Uses the 16x16 gross win probability matrix via interpolateProb().
 *
 * @param {number} rank - current leaderboard position (0-based)
 * @param {number} totalPlayers - total players in field
 * @param {object} playerData - { hi, toPar, gross, ... }
 * @param {number} holesPlayed - holes completed so far
 * @param {number} holesPerRound - total holes in the round
 * @param {Array} allPlayers - full standings array with { hi } for each player
 */
function calculateLiveOdds(rank, totalPlayers, playerData, holesPlayed, holesPerRound, allPlayers) {
  const hcp = playerData.hi ?? playerData.handicapIndex ?? 10;
  const others = (allPlayers || []).filter((_, idx) => idx !== rank);

  // Compute win probability vs each opponent, then normalize to field win prob
  let fieldProb;
  if (others.length > 0) {
    // Probability of beating each opponent individually
    const pairProbs = others.map(opp => {
      const oppHcp = opp.hi ?? opp.handicapIndex ?? 10;
      return interpolateProb(hcp, oppHcp);
    });
    // Approximate probability of beating ALL opponents (winning the field)
    // Use geometric mean as a balanced estimator for multi-player fields
    const logSum = pairProbs.reduce((s, p) => s + Math.log(Math.max(p, 0.001)), 0);
    fieldProb = Math.exp(logSum / pairProbs.length);
    // Normalize: in a field of N, a perfectly average player has 1/N chance
    // Scale so probabilities sum closer to 1 across the field
    fieldProb = Math.pow(fieldProb, 1 + 0.3 * Math.log2(Math.max(totalPlayers, 2)));
  } else {
    fieldProb = 0.5;
  }

  // Mid-round: adjust for actual performance vs expectation
  if (holesPlayed > 0 && playerData.toPar !== null && playerData.toPar !== undefined) {
    const expectedToPar = (hcp / 18) * holesPlayed; // expected strokes over par at this point
    const actualToPar = playerData.toPar;
    const performanceDelta = expectedToPar - actualToPar; // positive = better than expected

    // Shift probability using logistic curve
    const shift = 1 / (1 + Math.exp(-0.3 * performanceDelta));
    const adjustedProb = fieldProb * 0.5 + shift * 0.5; // blend pre-match with performance

    // Decay pre-match edge as round progresses
    const decay = Math.sqrt((holesPerRound - holesPlayed) / holesPerRound);
    fieldProb = 0.5 + (adjustedProb - 0.5) * (0.3 + 0.7 * decay);
  }

  fieldProb = Math.max(0.03, Math.min(0.97, fieldProb));
  return formatAmericanOdds(fieldProb);
}

function formatAmericanOdds(prob) {
  if (prob >= 0.98) return '-5000';
  if (prob <= 0.02) return '+5000';
  if (Math.abs(prob - 0.5) < 0.005) return 'EVEN';
  if (prob > 0.5) {
    const ml = Math.round(-100 * prob / (1 - prob));
    return String(ml);
  } else {
    const ml = Math.round(100 * (1 - prob) / prob);
    return '+' + ml;
  }
}

/**
 * Compute H2H moneyline odds between two players using the ML table.
 * Returns formatted American odds string for playerA vs playerB.
 */
function h2hOdds(hcpA, hcpB) {
  const prob = interpolateProb(hcpA, hcpB);
  return formatAmericanOdds(prob);
}

export function renderRoundFeed(state) {
  const config = state._config;
  const gameState = state._gameState;
  const holes = state._holes || {};
  const players = getPlayersFromConfig(config);
  const holesPerRound = config?.holesPerRound || 18;
  const games = config?.games || {};
  const pars = getCoursePars(config);
  const totalPar = pars.reduce((s, p) => s + p, 0) || 72;
  const hcpIndex = config?.courseHcpIndex || [];

  // Slug for flash dedup — prefer stored slug, fall back to URL parse
  const slug = state._slug ||
    (location.pathname.match(/\/waggle\/([a-z0-9_-]+)/)?.[1]) || 'event';

  // Init flash baseline on first render so we don't replay history
  initFlashBaseline(slug, holes);

  const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const latestHole = scoredHoles.length > 0 ? Math.max(...scoredHoles) : 0;
  const shownHoles = getShownHoles(slug);
  // Determine flash hole: most recently scored hole not yet flashed
  const flashHole = latestHole > 0 && !shownHoles.includes(latestHole) ? latestHole : null;
  if (flashHole !== null) markHoleShown(slug, flashHole);

  const { events, skinsPot, nassau } = deriveLiveFeed(gameState, holes, players);
  const roundComplete = scoredHoles.length >= holesPerRound;

  // ================================================================
  // TRIP PAGE — Pre-trip hype page (0 holes scored, 2+ players)
  // ================================================================
  const eventDate = config?.event?.dates?.day1 || config?.event?.startDate;
  const isPreTrip = scoredHoles.length === 0 && players.length >= 2;

  if (isPreTrip) {
    return renderTripPage(state, config, players, pars, hcpIndex, holesPerRound, games, eventDate);
  }

  // ================================================================
  // TROPHY ROOM — Post-trip monument (event complete or frozen)
  // ================================================================
  const isTrophy = config?.event?.status === 'complete' || config?.event?.frozenAt;

  if (isTrophy) {
    return renderTrophyRoom(state, config, players, pars, hcpIndex, holesPerRound, games, holes, gameState, scoredHoles, roundComplete);
  }

  // Wolf rotation
  const playerNames = players.map(p => p.name);
  const wolfOrder = (config?.wolfOrder || playerNames).filter(n => playerNames.includes(n));
  const holeNum = state._scorecardHole || (latestHole + 1) || 1;
  const expectedWolf = wolfOrder.length > 0 ? wolfOrder[(holeNum - 1) % wolfOrder.length] : null;
  const wolfPick = gameState?.wolf?.picks?.[holeNum];
  const currentHoleScored = !!holes[holeNum];

  // P&L computation
  const pnl = computeRoundPnL(gameState, players, games, config?.structure);
  const hasPnL = Object.values(pnl).some(v => v !== 0);

  // Skins won count per player — handles both holes and history formats
  const skinsHolesAll = getSkinsHoles(gameState, holes, players);
  const skinsCount = {};
  players.forEach(p => { skinsCount[p.name] = 0; });
  Object.values(skinsHolesAll).forEach(h => { if (h.winner && skinsCount.hasOwnProperty(h.winner)) skinsCount[h.winner]++; });

  // Stroke data — compute from holes if game engine hasn't run
  const strokeRunning = gameState?.stroke?.running || {};
  if (Object.keys(strokeRunning).length === 0 && scoredHoles.length > 0) {
    players.forEach(p => {
      let total = 0, counted = 0;
      scoredHoles.forEach(h => {
        const sc = holes[h]?.scores?.[p.name];
        if (sc != null) { total += sc; counted++; }
      });
      if (counted > 0) strokeRunning[p.name] = total;
    });
  }

  // Stakes info
  const skinsBetAmt = parseInt(config?.structure?.skinsBet) || 0;
  const nassauBetAmt = parseInt(config?.structure?.nassauBet) || 0;

  // Active game pills
  const activeGamesList = [];
  if (games.nassau) activeGamesList.push('Nassau');
  if (games.skins) activeGamesList.push('Skins');
  if (games.wolf) activeGamesList.push('Wolf');
  if (games.vegas) activeGamesList.push('Vegas');

  // Round info
  const rounds = config?.rounds || config?.structure?.rounds || 1;
  const currentRound = config?.currentRound || state._currentRound || 1;

  // Build standings data (used by multiple cards)
  let standingsData = [];
  if (players.length > 0) {
    standingsData = players.map(p => {
      const name = p.name;
      const gross = strokeRunning[name] ?? null;
      const parForPlayed = scoredHoles.reduce((s, h) => s + (pars[h - 1] || 4), 0);
      const toPar = gross !== null ? gross - parForPlayed : null;
      const money = pnl[name] || 0;
      const skins = skinsCount[name] || 0;
      let thru = 0;
      scoredHoles.forEach(h => {
        if (holes[h]?.scores?.[name] !== undefined && holes[h]?.scores?.[name] !== null) thru++;
      });
      let nassauFront = null, nassauBack = null;
      if (games.nassau) {
        const frontHolesScored = scoredHoles.filter(h => h <= 9);
        const backHolesScored = scoredHoles.filter(h => h > 9);
        if (frontHolesScored.length > 0) {
          let frontGross = 0, frontPar = 0;
          frontHolesScored.forEach(h => {
            const sc = holes[h]?.scores?.[name];
            if (sc !== undefined && sc !== null) { frontGross += sc; frontPar += (pars[h - 1] || 4); }
          });
          nassauFront = frontGross - frontPar;
        }
        if (backHolesScored.length > 0) {
          let backGross = 0, backPar = 0;
          backHolesScored.forEach(h => {
            const sc = holes[h]?.scores?.[name];
            if (sc !== undefined && sc !== null) { backGross += sc; backPar += (pars[h - 1] || 4); }
          });
          nassauBack = backGross - backPar;
        }
      }
      return { name, gross, toPar, money, skins, thru, nassauFront, nassauBack, hi: p.handicapIndex ?? 0 };
    });
    if (hasPnL) {
      standingsData.sort((a, b) => b.money - a.money);
    } else {
      standingsData.sort((a, b) => (a.toPar ?? 999) - (b.toPar ?? 999));
    }
  }

  // ── Odds movement tracking ──
  // Compute current odds for each player, compare with previous, generate movement events
  const oddsMovements = [];
  if (standingsData.length > 0 && scoredHoles.length > 0) {
    const currentOdds = {};
    standingsData.forEach((p, i) => {
      currentOdds[p.name] = calculateLiveOdds(i, standingsData.length, p, scoredHoles.length, holesPerRound, standingsData);
    });
    const prevOdds = state._prevOdds || {};
    Object.keys(currentOdds).forEach(name => {
      const curr = currentOdds[name];
      const prev = prevOdds[name];
      if (prev && prev !== curr) {
        // Parse to numeric for comparison
        const parseOdds = s => s === 'EVEN' ? 0 : parseFloat(s.replace('+', ''));
        const currNum = parseOdds(curr);
        const prevNum = parseOdds(prev);
        const firstName = name.split(' ')[0];
        const lastHole = scoredHoles[scoredHoles.length - 1];
        if (Math.abs(currNum - prevNum) > 20) {  // only show meaningful moves
          const direction = currNum < prevNum ? 'shortened' : 'drifted';
          oddsMovements.push(`${firstName}'s odds moved from ${prev} to ${curr} after #${lastHole}`);
        }
      }
    });
    state._prevOdds = currentOdds;
  }

  // ── Derived values for unified view ──
  const totalPot = computeTotalPot(games, config?.structure, players.length, scoredHoles.length);
  const holesRemaining = holesPerRound - scoredHoles.length;
  const structure = config?.structure || {};
  const eventName = config?.event?.name || 'Round';
  const courseName = config?.event?.course || config?.event?.venue || config?.course?.name || '';
  const roundNum = config?.currentRound || state._currentRound || 1;

  // Games pills HTML
  const gamesPillsHtml = activeGamesList.map(g => {
    let detail = '';
    if (g === 'Nassau' && nassauBetAmt > 0) detail = ' $' + nassauBetAmt;
    if (g === 'Skins' && skinsBetAmt > 0) detail = ' $' + skinsBetAmt;
    return `<span style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;background:var(--border);color:var(--text-primary);padding:4px 10px;border-radius:4px">${escHtml(g)}${detail}</span>`;
  }).join('');

  let html = '';

  // ── Spectator mode banner ──
  if (state._spectatorMode) {
    html += `<div style="background:linear-gradient(135deg,var(--mg-green),var(--mg-green-light));color:var(--text-primary);padding:10px 16px;border-radius:var(--mg-radius);margin-bottom:8px;text-align:center">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold)">Spectator Mode</div>
      <div style="font-size:13px;margin-top:2px;opacity:.8">You are watching live</div>
    </div>`;
  }

  // ================================================================
  // SECTION 1: EVENT HEADER BAR
  // ================================================================
  {
    const lastSync = state._lastSyncAt;
    const now = Date.now();
    const staleness = lastSync ? (now - lastSync) / 1000 : 999;
    let freshnessColor = 'var(--win)';
    let freshnessLabel = 'Live';
    if (staleness > 120) { freshnessColor = 'var(--loss)'; freshnessLabel = 'Offline'; }
    else if (staleness > 30) { freshnessColor = 'var(--gold-bright)'; freshnessLabel = 'Delayed'; }

    const roundsConfig2 = config?.rounds;
    const hasMultiRound = roundsConfig2 && typeof roundsConfig2 === 'object' && Object.keys(roundsConfig2).length > 1;
    const totalRounds = hasMultiRound ? Object.keys(roundsConfig2).length : 1;
    const activeRound = config?.event?.currentRound || currentRound || 1;

    html += `<div style="background:var(--mg-green);color:var(--text-primary);border-radius:10px;padding:12px 16px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:18px;font-weight:700">${escHtml(eventName)}</div>
          <div style="font-size:13px;opacity:.6">${courseName ? escHtml(courseName) + ' \u00b7 ' : ''}R${roundNum}</div>
          ${state.bettorName ? `<div style="margin-top:4px"><span onclick="window.MG.editBettorName()" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.3);border-radius:12px;font-size:10px;font-weight:600;color:var(--gold-bright);cursor:pointer"><span style="width:5px;height:5px;border-radius:50%;background:var(--gold-bright)"></span>${escHtml(state.bettorName)}</span></div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:1px">Pot</div>
          <div style="font-size:24px;font-weight:800;color:var(--gold-bright);font-family:'SF Mono',monospace">$${totalPot}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">`;

    // Round pills
    for (let r = 1; r <= totalRounds; r++) {
      const isActive = r === activeRound;
      const rdComplete = r < activeRound;
      const canStart = r === activeRound + 1 && roundComplete && state.adminAuthed;
      const rdInfo = roundsConfig2?.[r] || {};
      if (isActive) {
        html += `<div style="padding:3px 8px;background:var(--gold-bright);color:var(--bg-secondary);border-radius:4px;font-size:10px;font-weight:800;letter-spacing:.5px">R${r}</div>`;
      } else if (rdComplete) {
        html += `<div style="padding:3px 8px;border:1px solid var(--text-tertiary);border-radius:4px;font-size:10px;font-weight:600;color:var(--text-secondary)">R${r} &#10003;</div>`;
      } else if (canStart) {
        html += `<button onclick="window.MG.startNextRound(${r}${rdInfo.course ? ",'" + rdInfo.course.replace(/'/g, "\\'") + "'" : ''}${rdInfo.courseId ? ",'" + rdInfo.courseId.replace(/'/g, "\\'") + "'" : ''})"
          style="padding:3px 8px;border:1px dashed var(--gold-bright);border-radius:4px;font-size:10px;font-weight:600;color:var(--gold-bright);background:none;cursor:pointer">R${r}</button>`;
      } else {
        html += `<div style="padding:3px 8px;border:1px solid var(--border);border-radius:4px;font-size:10px;font-weight:600;color:var(--border-strong)">R${r}</div>`;
      }
    }

    // Game pills
    html += gamesPillsHtml;

    // Holes status
    html += `<span style="font-size:10px;padding:3px 8px;border-radius:4px;background:var(--border);color:var(--text-secondary)">Thru ${scoredHoles.length} \u00b7 ${holesRemaining} left</span>`;

    // Live indicator with pulsing dot
    html += `<span style="display:flex;align-items:center;gap:3px;font-size:10px;color:${freshnessColor};font-weight:600;margin-left:auto">
      <span style="width:6px;height:6px;border-radius:50%;background:${freshnessColor};${staleness <= 30 ? 'animation:livePulse 1.5s ease-in-out infinite' : ''}"></span>
      ${freshnessLabel}
    </span>`;

    html += `</div></div>`;
  }

  // ── Wolf announcement banner ──
  if (games.wolf && expectedWolf && !currentHoleScored && scoredHoles.length < holesPerRound) {
    const isMyWolfHole = state.adminAuthed && (state.bettorName === expectedWolf);
    if (isMyWolfHole) {
      html += `<div style="background:var(--mg-gold);color:var(--bg-primary);border-radius:10px;padding:12px 16px;margin-bottom:8px;text-align:center">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">You're the Wolf</div>
        <div style="font-size:18px;font-weight:700;margin:4px 0">Hole ${holeNum} -- Pick Your Partner</div>
        <div style="font-size:12px">Tap the score button to make your pick</div>
      </div>`;
    } else {
      html += `<div style="background:rgba(212,160,23,0.12);border:1px solid var(--mg-gold-dim);border-radius:10px;padding:10px 16px;margin-bottom:8px;text-align:center">
        <div style="font-size:11px;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px">Wolf -- Hole ${holeNum}</div>
        <div style="font-size:16px;font-weight:700;color:var(--mg-gold);margin-top:2px">${escHtml(expectedWolf)} is the Wolf</div>
        ${wolfPick ? `<div style="font-size:12px;color:var(--mg-text-muted);margin-top:2px">Picked: ${wolfPick.partner ? escHtml(wolfPick.partner) : 'Lone wolf'}</div>` : ''}
      </div>`;
    }
  }

  // Commissioner unlock (if needed)
  if (!state.adminAuthed && !state._spectatorMode) {
    html += `<div style="text-align:center;margin-bottom:8px">
      <button onclick="var p=prompt('Enter PIN:');if(p)window.MG.inlineAuthQuick(p)"
        style="font-size:11px;color:var(--mg-text-muted);background:none;border:none;cursor:pointer;text-decoration:underline">
        Unlock commissioner features
      </button>
    </div>`;
  }

  // ================================================================
  // SUB-TAB BAR (mid-round only: when scores exist and round not complete)
  // ================================================================
  const showSubTabs = scoredHoles.length > 0 && !roundComplete;
  const activeSubTab = showSubTabs ? (state._boardSubTab || 'score') : null;
  if (showSubTabs) {
    const tabItems = [
      { key: 'score', icon: '\u25A6', label: 'Score' },
      { key: 'board', icon: '\uD83C\uDFC6', label: 'Board' },
      { key: 'bar',   icon: '\uD83C\uDF7A', label: 'The Bar' }
    ];
    html += `<div style="display:flex;gap:4px;margin-bottom:8px;padding:3px;border-radius:10px;background:var(--bg-secondary);border:1px solid var(--border)">`;
    tabItems.forEach(t => {
      const isActive = activeSubTab === t.key;
      html += `<button onclick="window.MG.setBoardTab('${t.key}')" style="flex:1;padding:10px 8px;font-size:13px;font-weight:700;border:none;cursor:pointer;border-radius:8px;transition:all .15s;${isActive ? 'background:var(--gold-primary,var(--mg-gold));color:var(--bg-primary,var(--mg-green));box-shadow:0 2px 8px rgba(212,160,23,0.3)' : 'background:transparent;color:var(--text-secondary)'}">
        <span style="margin-right:4px;font-size:12px">${t.icon}</span>${t.label}
      </button>`;
    });
    html += `</div>`;
  }

  // ================================================================
  // SECTION 2: SCORE ENTRY (inline scorecard grid)
  // ================================================================
  if ((!showSubTabs || activeSubTab === 'score') && !roundComplete && players.length > 0) {
    const yardage = getCourseYardage(config);
    const resolvedHcp = hcpIndex.length > 0 ? hcpIndex : getCourseHcpIndex(config);
    const courseName = config?.course?.name || config?.event?.course || config?.event?.venue || '';
    let currentHole = latestHole || 1;
    let inlScores = {};

    if (!state._spectatorMode) {
      if (!state._inlineScore) {
        const nextH = latestHole < holesPerRound ? latestHole + 1 : holesPerRound;
        const existingScores = holes[nextH]?.scores || {};
        state._inlineScore = { hole: nextH, scores: { ...existingScores } };
        // Init stats for the current hole
        const existingStats = holes[nextH]?.stats || {};
        if (!state._inlineScoreStats || Object.keys(state._inlineScoreStats).length === 0) {
          state._inlineScoreStats = Object.keys(existingStats).length > 0 ? JSON.parse(JSON.stringify(existingStats)) : {};
        }
      }
      const inl = state._inlineScore;
      currentHole = inl.hole;
      inlScores = inl.scores || {};
    }

    // ── 1. RUNNING P&L SUMMARY (digital yardage book) ──
    if (scoredHoles.length > 0 && standingsData.length > 0) {
      const thruLabel = scoredHoles.length;
      // Find the leader for gold highlight
      const leaderToPar = standingsData.reduce((best, p) => (p.toPar !== null && (best === null || p.toPar < best)) ? p.toPar : best, null);

      html += `<div style="background:#FAFAF7;border-radius:12px;padding:16px 18px 14px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border:1px solid #E5E7EB">`;

      // Header
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:14px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#0D2818">Running Standings</span>
        <span style="font-size:13px;color:#374151;font-weight:600">Thru ${thruLabel}</span>
      </div>`;

      // Player rows — compact 2-line per player
      standingsData.forEach((p, i) => {
        const firstName = p.name.split(' ')[0];
        const toParStr = p.toPar === null ? '--' : p.toPar === 0 ? 'E' : p.toPar > 0 ? '+' + p.toPar : String(p.toPar);
        const isLeaderScore = p.toPar !== null && p.toPar === leaderToPar;
        const toParColor = p.toPar === null ? '#9CA3AF' : p.toPar < 0 ? '#B8962E' : p.toPar > 0 ? '#DC2626' : '#374151';
        const moneyStr = p.money === 0 ? '$0' : p.money > 0 ? '+$' + p.money : '-$' + Math.abs(p.money);
        const moneyColor = p.money > 0 ? '#16A34A' : p.money < 0 ? '#DC2626' : '#6B7280';

        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;${i < standingsData.length - 1 ? 'border-bottom:1px solid #F0EDE6;' : ''}">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
            <span style="font-size:13px;font-weight:700;color:#9CA3AF;width:16px;text-align:right;flex-shrink:0">${i + 1}.</span>
            <span style="font-size:15px;font-weight:600;color:#1A1A1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(firstName)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;font-family:'SF Mono','Menlo','Courier New',monospace">
            <span style="font-size:16px;font-weight:800;color:${toParColor};${isLeaderScore ? 'text-shadow:0 0 6px rgba(184,150,46,0.3)' : ''}">${toParStr}</span>
            <span style="font-size:15px;font-weight:700;color:${moneyColor};min-width:50px;text-align:right">${moneyStr}</span>
            <span style="font-size:13px;font-weight:600;color:${p.skins > 0 ? '#B8962E' : '#9CA3AF'};min-width:42px;text-align:right">${p.skins} skin${p.skins !== 1 ? 's' : ''}</span>
          </div>
        </div>`;
      });

      // ── 2. P&L BREAKDOWN BY GAME (collapsible) ──
      const hasNassau = games.nassau;
      const hasSkins = games.skins;
      const nassauBet = parseInt(config?.structure?.nassauBet) || 0;
      const skinsBet = parseInt(config?.structure?.skinsBet) || 0;

      if (hasNassau || hasSkins) {
        html += `<details style="margin-top:10px;border-top:1px solid #E8E5DE;padding-top:8px">
          <summary style="font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#6B7280;cursor:pointer;padding:4px 0;list-style:none;display:flex;align-items:center;gap:4px;-webkit-tap-highlight-color:transparent">
            <span style="font-size:9px;transition:transform .2s">&#9654;</span> P&L Breakdown
          </summary>
          <div style="margin-top:8px;font-size:12px;color:#374151;font-family:'SF Mono','Menlo','Courier New',monospace">`;

        // Nassau breakdown
        if (hasNassau && nassauBet > 0) {
          html += `<div style="margin-bottom:8px">
            <div style="font-size:11px;font-weight:700;color:#0D2818;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Nassau ($${nassauBet}/side)</div>`;

          // Front 9 standings
          const frontHolesScored = scoredHoles.filter(h => h <= 9);
          if (frontHolesScored.length > 0) {
            const frontData = standingsData.map(p => ({
              name: p.name.split(' ')[0],
              toPar: p.nassauFront
            })).sort((a, b) => (a.toPar ?? 999) - (b.toPar ?? 999));
            const frontLeader = frontData[0];
            const frontLeaderStr = frontLeader.toPar !== null ? (frontLeader.toPar === 0 ? 'E' : frontLeader.toPar > 0 ? '+' + frontLeader.toPar : String(frontLeader.toPar)) : '--';
            const nassauNassauResult = gameState?.nassau;
            const frontWinner = nassauNassauResult?.frontWinner;
            html += `<div style="padding:2px 0;color:#374151">Front 9: ${frontData.map(p => {
              const str = p.toPar === null ? '--' : p.toPar === 0 ? 'E' : p.toPar > 0 ? '+' + p.toPar : String(p.toPar);
              const isFrontWinner = frontWinner && p.name === frontWinner.split(' ')[0];
              return `<span style="${isFrontWinner ? 'color:#16A34A;font-weight:700' : ''}">${escHtml(p.name)} ${str}</span>`;
            }).join(', ')}</div>`;
          }

          // Back 9 standings
          const backHolesScored = scoredHoles.filter(h => h > 9);
          if (backHolesScored.length > 0) {
            const backData = standingsData.map(p => ({
              name: p.name.split(' ')[0],
              toPar: p.nassauBack
            })).sort((a, b) => (a.toPar ?? 999) - (b.toPar ?? 999));
            const nassauResult = gameState?.nassau;
            const backWinner = nassauResult?.backWinner;
            html += `<div style="padding:2px 0;color:#374151">Back 9: ${backData.map(p => {
              const str = p.toPar === null ? '--' : p.toPar === 0 ? 'E' : p.toPar > 0 ? '+' + p.toPar : String(p.toPar);
              const isBackWinner = backWinner && p.name === backWinner.split(' ')[0];
              return `<span style="${isBackWinner ? 'color:#16A34A;font-weight:700' : ''}">${escHtml(p.name)} ${str}</span>`;
            }).join(', ')}</div>`;
          }

          // Overall
          const overallData = standingsData.map(p => ({
            name: p.name.split(' ')[0],
            toPar: p.toPar
          })).sort((a, b) => (a.toPar ?? 999) - (b.toPar ?? 999));
          const nassauOverallResult = gameState?.nassau;
          const totalWinner = nassauOverallResult?.totalWinner;
          html += `<div style="padding:2px 0;color:#374151">Overall: ${overallData.map(p => {
            const str = p.toPar === null ? '--' : p.toPar === 0 ? 'E' : p.toPar > 0 ? '+' + p.toPar : String(p.toPar);
            const isTotalWinner = totalWinner && p.name === totalWinner.split(' ')[0];
            return `<span style="${isTotalWinner ? 'color:#16A34A;font-weight:700' : ''}">${escHtml(p.name)} ${str}</span>`;
          }).join(', ')}</div>`;

          html += `</div>`;
        }

        // Skins breakdown
        if (hasSkins && skinsBet > 0) {
          const skinsHoles = getSkinsHoles(gameState, holes, players);
          const skinsEntries = Object.entries(skinsHoles).map(([h, data]) => ({ hole: Number(h), ...data })).sort((a, b) => a.hole - b.hole);
          const totalSkinsWon = skinsEntries.filter(e => e.winner).length;
          const carries = skinsEntries.filter(e => !e.winner || e.carried).length;

          html += `<div style="margin-bottom:4px">
            <div style="font-size:11px;font-weight:700;color:#0D2818;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Skins ($${skinsBet}/skin)</div>
            <div style="padding:2px 0;color:#6B7280;font-size:11px">${totalSkinsWon} skin${totalSkinsWon !== 1 ? 's' : ''} won of ${scoredHoles.length} holes${carries > 0 ? ' (' + carries + ' carries)' : ''}</div>`;

          // Per-player skins detail
          standingsData.forEach(p => {
            const firstName = p.name.split(' ')[0];
            const wonHoles = skinsEntries.filter(e => e.winner === p.name).map(e => '#' + e.hole);
            const skinsMoney = p.skins > 0 ? p.skins * skinsBet * (players.length - 1) : 0;
            const skinsLoss = skinsEntries.filter(e => e.winner && e.winner !== p.name).reduce((sum, e) => sum + (e.potWon || 1) * skinsBet, 0);
            const skinsNet = skinsMoney - skinsLoss;
            const skinsNetStr = skinsNet === 0 ? '$0' : skinsNet > 0 ? '+$' + skinsNet : '-$' + Math.abs(skinsNet);
            const skinsNetColor = skinsNet > 0 ? '#16A34A' : skinsNet < 0 ? '#DC2626' : '#6B7280';
            html += `<div style="padding:2px 0;display:flex;justify-content:space-between">
              <span style="color:#374151">${escHtml(firstName)}: ${p.skins} skin${p.skins !== 1 ? 's' : ''}${wonHoles.length > 0 ? ' -- ' + wonHoles.join(', ') : ''}</span>
              <span style="color:${skinsNetColor};font-weight:600">${skinsNetStr}</span>
            </div>`;
          });

          html += `</div>`;
        }

        html += `</div></details>`;
      }

      html += `</div>`;

      // Gold divider between standings and scorecard
      html += `<div style="height:2px;background:linear-gradient(90deg,transparent,#B8962E,transparent);margin:4px 0 8px;border-radius:1px"></div>`;
    }

    html += renderPremiumScorecard({
      currentHole,
      pars,
      hcpIndex: resolvedHcp,
      yardage,
      holes,
      entities: players,
      inlScores,
      holesPerRound,
      courseName,
      isScramble: false,
      readOnly: true
    });

    // ── 3b. KEYPAD SCORE ENTRY SECTION (below read-only scorecard) ──
    if (!roundComplete && players.length > 0 && !state._spectatorMode) {
      const kpHole = currentHole;
      const kpPar = pars[kpHole - 1] || 4;
      const kpHcp = resolvedHcp[kpHole - 1] ?? '';
      const kpYds = yardage ? yardage[kpHole - 1] : null;
      const kpScores = inlScores;
      const kpStats = state._inlineScoreStats || {};

      html += `<div style="background:#FFFFFF;border-radius:12px;padding:16px;margin-top:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border:1px solid #E5E7EB">`;

      // Header with hole info + nav arrows
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:20px;font-weight:800;color:#0D2818">Hole ${kpHole}</div>
          <div style="font-size:13px;color:#6B7280">Par ${kpPar}${kpYds ? ' &middot; ' + kpYds + ' yds' : ''}${kpHcp ? ' &middot; HCP ' + kpHcp : ''}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="window.MG.inlineScoreNav(-1)" style="width:36px;height:36px;border-radius:50%;border:1px solid #D1D5DB;background:white;color:#1A1A1A;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent">&#9664;</button>
          <button onclick="window.MG.inlineScoreNav(1)" style="width:36px;height:36px;border-radius:50%;border:1px solid #D1D5DB;background:white;color:#1A1A1A;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent">&#9654;</button>
        </div>
      </div>`;

      // Per-player keypad + stat toggles
      players.forEach(p => {
        const name = p.name;
        const firstName = name.split(' ')[0];
        const currentScore = kpScores[name] ?? null;
        const playerStats = kpStats[name] || {};

        html += `<div style="padding:10px 0;border-top:1px solid #F0F0F0">`;

        // Player name
        html += `<div style="font-size:14px;font-weight:700;color:#1A1A1A;margin-bottom:8px">${escHtml(firstName)}</div>`;

        // Score keypad — buttons from par-2 to par+3
        html += `<div style="display:flex;gap:6px;margin-bottom:8px">`;
        for (let s = Math.max(1, kpPar - 2); s <= kpPar + 3; s++) {
          const isSelected = currentScore === s;
          const diff = s - kpPar;
          let btnColor = '#1A1A1A';
          let btnBg = '#F5F5F5';
          let btnBorder = '#D1D5DB';
          if (isSelected) {
            if (diff < 0) { btnBg = '#16A34A'; btnColor = 'white'; btnBorder = '#16A34A'; }
            else if (diff === 0) { btnBg = '#0D2818'; btnColor = 'white'; btnBorder = '#0D2818'; }
            else { btnBg = '#DC2626'; btnColor = 'white'; btnBorder = '#DC2626'; }
          }
          const label = diff <= -2 ? 'Eagle' : diff === -1 ? 'Birdie' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : diff === 2 ? 'Dbl' : '+' + diff;

          html += `<button onclick="window.MG.inlineScoreSet('${escHtml(name)}',${s})"
            style="flex:1;padding:8px 4px;border-radius:8px;border:2px solid ${btnBorder};background:${btnBg};color:${btnColor};font-size:16px;font-weight:800;cursor:pointer;text-align:center;min-height:44px;font-family:'SF Mono','Menlo','Courier New',monospace;-webkit-tap-highlight-color:transparent;transition:transform .08s"
            onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">
            ${s}
            <div style="font-size:8px;font-weight:500;opacity:0.7;margin-top:1px">${label}</div>
          </button>`;
        }
        // "Other" button for scores outside the range
        html += `<button onclick="window.MG.inlineScoreType('${escHtml(name)}',prompt('Score for ${escHtml(firstName)}:'))"
          style="width:44px;padding:8px 4px;border-radius:8px;border:2px solid #D1D5DB;background:#F5F5F5;color:#6B7280;font-size:12px;font-weight:600;cursor:pointer;min-height:44px;-webkit-tap-highlight-color:transparent">+</button>`;
        html += `</div>`;

        // Stats row: FIR, GIR, Putts, Penalty
        html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">`;

        // FIR toggle (only on par 4 and par 5)
        if (kpPar >= 4) {
          const firChecked = playerStats.fir === true;
          html += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#6B7280;cursor:pointer;-webkit-tap-highlight-color:transparent">
            <input type="checkbox" ${firChecked ? 'checked' : ''}
              onchange="window.MG.setHoleStat('${escHtml(name)}','fir',this.checked)"
              style="width:18px;height:18px;accent-color:#0D2818">
            FIR
          </label>`;
        }

        // GIR toggle
        const girChecked = playerStats.gir === true;
        html += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#6B7280;cursor:pointer;-webkit-tap-highlight-color:transparent">
          <input type="checkbox" ${girChecked ? 'checked' : ''}
            onchange="window.MG.setHoleStat('${escHtml(name)}','gir',this.checked)"
            style="width:18px;height:18px;accent-color:#0D2818">
          GIR
        </label>`;

        // Putts
        const putts = playerStats.putts ?? '';
        html += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#6B7280">
          Putts
          <input type="number" inputmode="numeric" value="${putts}" min="0" max="9"
            onchange="window.MG.setHoleStat('${escHtml(name)}','putts',parseInt(this.value)||0)"
            style="width:36px;height:28px;text-align:center;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;font-weight:600;color:#1A1A1A;font-family:'SF Mono','Menlo','Courier New',monospace">
        </label>`;

        // Penalty toggle
        const penalty = playerStats.penalty === true;
        html += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#6B7280;cursor:pointer;-webkit-tap-highlight-color:transparent">
          <input type="checkbox" ${penalty ? 'checked' : ''}
            onchange="window.MG.setHoleStat('${escHtml(name)}','penalty',this.checked)"
            style="width:18px;height:18px;accent-color:#DC2626">
          Pen
        </label>`;

        html += `</div>`;
        html += `</div>`;
      });

      // Save button
      const kpAllFilled = players.every(p => kpScores[p.name] >= 1);
      html += `<button onclick="window.MG.inlineScoreSave()"
        style="width:100%;padding:14px;margin-top:12px;border-radius:10px;border:none;background:${kpAllFilled ? '#0D2818' : '#D1D5DB'};color:${kpAllFilled ? 'white' : '#9CA3AF'};font-size:16px;font-weight:700;cursor:${kpAllFilled ? 'pointer' : 'default'};box-shadow:${kpAllFilled ? '0 3px 12px rgba(13,40,24,0.3)' : 'none'};-webkit-tap-highlight-color:transparent;transition:transform .08s"
        ${kpAllFilled ? '' : 'disabled'}
        ${kpAllFilled ? 'onpointerdown="this.style.transform=\'scale(0.97)\'" onpointerup="this.style.transform=\'\'" onpointerleave="this.style.transform=\'\'"' : ''}>
        ${kpAllFilled ? 'Save Hole ' + kpHole + ' &#8594;' : 'Fill in all scores for Hole ' + kpHole}
      </button>`;

      // Undo last hole button (shown when there's a recent submission to undo)
      if (state._lastScoredHole && state._lastScoredHole.hole !== kpHole) {
        html += `<button onclick="window.MG.undoLastHole()"
          style="width:100%;padding:10px;margin-top:8px;border-radius:8px;border:1px solid #D1D5DB;background:transparent;color:#6B7280;font-size:14px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent">
          Undo Hole ${state._lastScoredHole.hole}
        </button>`;
      }

      html += `</div>`;
    }

    // ── 4. ROUND STATS (actual + estimated, collapsible) ──
    if (scoredHoles.length > 0 && players.length > 0) {
      const statsData = players.map(p => {
        let girActual = 0, girActualTotal = 0, firActual = 0, firActualTotal = 0;
        let puttsActual = 0, puttsActualTotal = 0;
        let girEst = 0, firEst = 0, puttsEst = 0;
        let holesWithScore = 0, firEligible = 0;
        let scrambleOpp = 0, scrambleSaved = 0;
        let penaltyTotal = 0;
        let par3Scores = [], par4Scores = [], par5Scores = [];
        let birdieStreak = 0, maxBirdieStreak = 0;
        let bogeyFreeStreak = 0, maxBogeyFreeStreak = 0;

        scoredHoles.forEach(h => {
          const sc = holes[h]?.scores?.[p.name];
          if (sc == null) return;
          holesWithScore++;
          const par = pars[h - 1] || 4;
          const diff = sc - par;
          const holeStats = holes[h]?.stats?.[p.name];

          // Actual stats from tracked data
          if (holeStats) {
            if (holeStats.fir !== undefined && par >= 4) { firActualTotal++; if (holeStats.fir) firActual++; }
            if (holeStats.gir !== undefined) { girActualTotal++; if (holeStats.gir) girActual++; }
            if (holeStats.putts !== undefined) { puttsActualTotal++; puttsActual += holeStats.putts; }
            if (holeStats.penalty) penaltyTotal++;

            // Scrambling: GIR=false but score <= par
            if (holeStats.gir === false) {
              scrambleOpp++;
              if (sc <= par) scrambleSaved++;
            }
          }

          // Estimated stats (fallback)
          if (sc <= par) girEst++;
          if (par >= 4) {
            firEligible++;
            if (sc <= par) firEst++;
          }
          if (diff <= -1) puttsEst += 1;
          else if (diff <= 1) puttsEst += 2;
          else puttsEst += 3;

          // Scoring by par
          if (par === 3) par3Scores.push(sc);
          else if (par === 4) par4Scores.push(sc);
          else if (par >= 5) par5Scores.push(sc);

          // Birdie streak
          if (diff < 0) { birdieStreak++; maxBirdieStreak = Math.max(maxBirdieStreak, birdieStreak); }
          else { birdieStreak = 0; }

          // Bogey-free streak
          if (diff <= 0) { bogeyFreeStreak++; maxBogeyFreeStreak = Math.max(maxBogeyFreeStreak, bogeyFreeStreak); }
          else { bogeyFreeStreak = 0; }
        });

        // Use actual stats if available, else estimated
        const hasActualFir = firActualTotal > 0;
        const hasActualGir = girActualTotal > 0;
        const hasActualPutts = puttsActualTotal > 0;

        const firPct = hasActualFir ? Math.round((firActual / firActualTotal) * 100) : (firEligible > 0 ? Math.round((firEst / firEligible) * 100) : 0);
        const girPct = hasActualGir ? Math.round((girActual / girActualTotal) * 100) : (holesWithScore > 0 ? Math.round((girEst / holesWithScore) * 100) : 0);
        const avgPutts = hasActualPutts ? (puttsActual / puttsActualTotal).toFixed(1) : (holesWithScore > 0 ? (puttsEst / holesWithScore).toFixed(1) : '--');
        const scramblePct = scrambleOpp > 0 ? Math.round((scrambleSaved / scrambleOpp) * 100) : null;
        const isEstimated = !hasActualFir && !hasActualGir && !hasActualPutts;

        const avgPar3 = par3Scores.length > 0 ? (par3Scores.reduce((a, b) => a + b, 0) / par3Scores.length).toFixed(1) : '--';
        const avgPar4 = par4Scores.length > 0 ? (par4Scores.reduce((a, b) => a + b, 0) / par4Scores.length).toFixed(1) : '--';
        const avgPar5 = par5Scores.length > 0 ? (par5Scores.reduce((a, b) => a + b, 0) / par5Scores.length).toFixed(1) : '--';

        return {
          name: p.name, firstName: p.name.split(' ')[0], holesWithScore,
          firPct, girPct, avgPutts, isEstimated,
          scramblePct, penaltyTotal, maxBirdieStreak, maxBogeyFreeStreak,
          avgPar3, avgPar4, avgPar5
        };
      }).filter(s => s.holesWithScore > 0).sort((a, b) => b.girPct - a.girPct);

      const anyEstimated = statsData.some(s => s.isEstimated);

      if (statsData.length > 0) {
        html += `<div style="background:#FAFAF7;border-radius:12px;padding:0;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border:1px solid #E5E7EB;overflow:hidden">
          <details>
            <summary style="padding:12px 16px;font-size:13px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:#0D2818;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;-webkit-tap-highlight-color:transparent">
              <span style="font-size:9px">&#9654;</span> Round Stats ${anyEstimated ? '<span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:none;letter-spacing:0">(est.)</span>' : ''} <span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:none;letter-spacing:0">Thru ${scoredHoles.length}</span>
            </summary>
            <div style="padding:0 16px 14px">`;

        // Core stats table: FIR, GIR, Putts, Scramble
        html += `<table style="width:100%;border-collapse:collapse;font-family:'SF Mono','Menlo','Courier New',monospace;font-size:12px">
                <tr style="border-bottom:2px solid #E8E5DE">
                  <td style="padding:6px 0;font-weight:700;color:#6B7280;font-size:11px"></td>
                  <td style="padding:6px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">FIR%</td>
                  <td style="padding:6px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">GIR%</td>
                  <td style="padding:6px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">Putts</td>
                  <td style="padding:6px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">Scr%</td>
                  <td style="padding:6px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">Pen</td>
                </tr>`;
        statsData.forEach((s, i) => {
          html += `<tr style="${i < statsData.length - 1 ? 'border-bottom:1px solid #F0EDE6' : ''}">
                  <td style="padding:6px 0;font-weight:600;color:#1A1A1A;font-size:12px">${escHtml(s.firstName)}</td>
                  <td style="padding:6px 4px;text-align:center;color:#374151">${s.firPct}%</td>
                  <td style="padding:6px 4px;text-align:center;color:#374151">${s.girPct}%</td>
                  <td style="padding:6px 4px;text-align:center;color:#374151">${s.avgPutts}</td>
                  <td style="padding:6px 4px;text-align:center;color:#374151">${s.scramblePct !== null ? s.scramblePct + '%' : '--'}</td>
                  <td style="padding:6px 4px;text-align:center;color:${s.penaltyTotal > 0 ? '#DC2626' : '#374151'}">${s.penaltyTotal}</td>
                </tr>`;
        });
        html += `</table>`;

        // Advanced stats: scoring by par, streaks
        html += `<div style="margin-top:10px;border-top:1px solid #E8E5DE;padding-top:8px">
          <div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Scoring by Par</div>
          <table style="width:100%;border-collapse:collapse;font-family:'SF Mono','Menlo','Courier New',monospace;font-size:12px">
            <tr style="border-bottom:1px solid #F0EDE6">
              <td style="padding:4px 0;font-weight:700;color:#6B7280;font-size:11px"></td>
              <td style="padding:4px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">Par 3</td>
              <td style="padding:4px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">Par 4</td>
              <td style="padding:4px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">Par 5</td>
              <td style="padding:4px 4px;text-align:center;font-weight:700;color:#6B7280;font-size:11px">BF</td>
            </tr>`;
        statsData.forEach((s, i) => {
          html += `<tr style="${i < statsData.length - 1 ? 'border-bottom:1px solid #F0EDE6' : ''}">
              <td style="padding:4px 0;font-weight:600;color:#1A1A1A;font-size:12px">${escHtml(s.firstName)}</td>
              <td style="padding:4px 4px;text-align:center;color:#374151">${s.avgPar3}</td>
              <td style="padding:4px 4px;text-align:center;color:#374151">${s.avgPar4}</td>
              <td style="padding:4px 4px;text-align:center;color:#374151">${s.avgPar5}</td>
              <td style="padding:4px 4px;text-align:center;color:${s.maxBogeyFreeStreak >= 3 ? '#16A34A' : '#374151'}">${s.maxBogeyFreeStreak}</td>
            </tr>`;
        });
        html += `</table>
        </div>`;

        if (anyEstimated) {
          html += `<div style="font-size:10px;color:#9CA3AF;margin-top:6px;font-style:italic">Some stats estimated from scores. Use stat toggles when entering scores for actual tracking.</div>`;
        }

        html += `</div>
          </details>
        </div>`;
      }
    }

    // Scan scorecard (below the premium card — commissioner only)
    if (!state._spectatorMode) {
      html += `<div style="display:flex;gap:8px;margin-top:0;margin-bottom:8px">
        <button onclick="document.getElementById('scorecard-camera').click()"
          style="flex:1;padding:10px;background:#FAFAF7;border:1.5px solid #D1D5DB;border-radius:10px;font-size:12px;font-weight:600;color:#6B7280;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Scan Scorecard
        </button>
        <input type="file" id="scorecard-camera" accept="image/*" capture="environment" style="display:none"
          onchange="window.MG.scanScorecard(this.files[0])">
      </div>`;
      html += `<div id="scan-results" style="display:none"></div>`;
    }
  } else if (roundComplete && !state._spectatorMode) {
    html += `<div style="border:2px solid var(--mg-gold);border-radius:10px;padding:20px;margin-bottom:8px;text-align:center;background:var(--bg-primary)">
      <div style="font-size:20px;font-weight:700;color:var(--mg-gold);margin-bottom:8px">Round Complete</div>
      <div style="font-size:13px;color:var(--mg-text-muted);margin-bottom:14px">All ${holesPerRound} holes scored. Time to settle up.</div>
      <a href="#settle" style="display:inline-block;padding:14px 32px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none;box-shadow:0 3px 12px rgba(212,160,23,0.3)">View Settlement</a>
    </div>`;
  }

  // ================================================================
  // SECTION 3: LEADERBOARD + BOOK (THE CORE)
  // ================================================================
  if ((!showSubTabs || activeSubTab === 'board') && scoredHoles.length > 0 && standingsData.length > 0) {
    html += `<div style="margin-bottom:8px">`;

    // Header
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;padding:0 2px">
      <span style="font-size:16px;font-weight:800;color:var(--gold-bright)">Leaderboard</span>
    </div>`;
    html += `<span style="font-size:0.72rem;color:#8a7a5a;font-style:italic;display:block;margin-bottom:8px;padding:0 2px">Odds to win the round outright. Negative = favorite, positive = underdog.</span>`;

    // Player rows — card-based with depth
    standingsData.forEach((p, i) => {
      const isLeader = i === 0;
      const isTop3 = i < 3;
      const isLast = i === standingsData.length - 1 && standingsData.length > 1;
      const toParStr = p.toPar === null ? '--' : p.toPar === 0 ? 'E' : p.toPar > 0 ? '+' + p.toPar : String(p.toPar);
      const toParColor = p.toPar === null ? 'var(--text-tertiary)' : p.toPar < 0 ? 'var(--gold-bright)' : p.toPar > 0 ? 'var(--loss)' : 'white';
      const moneyStr = p.money === 0 ? '--' : p.money > 0 ? '+$' + p.money : '-$' + Math.abs(p.money);
      const moneyColor = p.money > 0 ? 'var(--win)' : p.money < 0 ? 'var(--loss)' : 'var(--text-tertiary)';
      const moneyGlow = p.money > 0 ? 'text-shadow:0 0 8px rgba(63,185,80,0.3)' : p.money < 0 ? 'text-shadow:0 0 8px rgba(248,81,73,0.3)' : '';

      const odds = calculateLiveOdds(i, standingsData.length, p, scoredHoles.length, holesPerRound, standingsData);
      const oddsNum = parseFloat(odds.replace('+', ''));
      const isFavorite = odds.startsWith('-');
      const isHeavyFav = isFavorite && Math.abs(oddsNum) >= 500;
      const oddsColor = isHeavyFav ? 'var(--gold-bright)' : isFavorite ? 'white' : 'var(--text-secondary)';
      const oddsGlow = isHeavyFav ? 'text-shadow:0 0 8px rgba(212,160,23,0.4)' : '';
      const oddsBorderColor = isFavorite ? 'var(--gold-primary,var(--mg-gold))' : 'var(--border)';

      const expanded = state._expandedPlayer === p.name;

      // Card styles — leader gets gold border only (no gradient for readability)
      const cardBg = isLeader
        ? 'background:var(--bg-secondary);border:1.5px solid var(--gold-primary,var(--mg-gold))'
        : 'background:var(--bg-secondary);border:1px solid var(--border)';

      // Position badge
      const badgeBg = isLeader ? 'background:var(--gold-bright);color:var(--bg-secondary)' : isTop3 ? 'background:transparent;border:1.5px solid var(--gold-primary,var(--mg-gold));color:var(--gold-bright)' : 'background:transparent;border:1.5px solid var(--border-strong,var(--border));color:var(--text-secondary)';

      // To-par size — massive for leader, large for others
      const toParSize = isLeader ? 'font-size:32px;font-weight:900' : 'font-size:24px;font-weight:800';

      // COLLAPSED: Card per player
      html += `<div onclick="window.MG.togglePlayerExpand('${escHtml(p.name)}')" style="${cardBg};border-radius:10px;padding:14px 16px;margin-bottom:8px;cursor:pointer;-webkit-tap-highlight-color:transparent">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            <span style="width:28px;height:28px;border-radius:50%;${badgeBg};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;box-sizing:border-box">${i + 1}</span>
            <span style="font-size:17px;font-weight:${isLeader ? '700' : '600'};color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.name)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:8px">
            <span style="font-family:'SF Mono',monospace;${toParSize};color:${toParColor}">${toParStr}</span>
            <button onclick="event.stopPropagation();window.MG.openOddsBetSlip('${escHtml(p.name)}','to_win','${odds}')" style="padding:8px 14px;border-radius:8px;border:1.5px solid ${oddsBorderColor};background:var(--bg-tertiary);color:${oddsColor};font-family:'SF Mono',monospace;font-size:16px;font-weight:800;cursor:pointer;min-width:64px;text-align:center;-webkit-tap-highlight-color:transparent;transition:transform .1s;${oddsGlow}" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">${odds}</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;margin-left:38px;margin-top:6px">
          <div style="display:flex;gap:12px;flex:1;font-size:14px;font-family:'SF Mono',monospace">
            <span style="color:${moneyColor};font-weight:800;${moneyGlow}">${moneyStr}</span>
            <span style="color:${p.skins > 0 ? 'var(--gold-bright)' : 'var(--text-secondary)'};font-weight:600">${p.skins} skin${p.skins !== 1 ? 's' : ''}</span>
            <span style="color:var(--text-secondary);font-weight:500">Thru ${p.thru}</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2.5" style="flex-shrink:0;transition:transform .2s;transform:${expanded ? 'rotate(180deg)' : 'rotate(0)'}"><polyline points="6 9 12 15 18 9"/></svg>
        </div>`;

      // EXPANDED: Betting detail (only if tapped)
      if (expanded) {
        html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bg-tertiary);margin-left:30px">`;

        // Nassau detail
        if (games.nassau) {
          const nassauFStr2 = p.nassauFront !== null ? (p.nassauFront <= 0 ? String(p.nassauFront === 0 ? 'E' : p.nassauFront) : '+' + p.nassauFront) : '--';
          const nassauBStr2 = p.nassauBack !== null ? (p.nassauBack <= 0 ? String(p.nassauBack === 0 ? 'E' : p.nassauBack) : '+' + p.nassauBack) : '--';
          html += `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Nassau: Front ${nassauFStr2} | Back ${nassauBStr2}</div>`;
        }

        // Press button (if behind leader)
        const autoPress = config?.structure?.autoPress;
        if (autoPress?.enabled && games.nassau && !isLeader) {
          const nassauState = gameState?.nassau?.running;
          if (nassauState) {
            const playerNassau = nassauState[p.name];
            const leaderNassau = Object.values(nassauState).sort((a, b) => {
              const aT = typeof a === 'object' ? a.total : a;
              const bT = typeof b === 'object' ? b.total : b;
              return (aT || 0) - (bT || 0);
            })[0];
            const leaderTotal2 = typeof leaderNassau === 'object' ? leaderNassau.total : leaderNassau;
            const playerTotal = typeof playerNassau === 'object' ? playerNassau.total : playerNassau;
            if (playerTotal && leaderTotal2 && (playerTotal - leaderTotal2) >= autoPress.threshold) {
              html += `<button onclick="event.stopPropagation();window.MG.pressNassau('${escHtml(p.name)}')" style="width:100%;padding:10px;margin:6px 0;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">Press \u2014 Double to $${nassauBetAmt * 2}</button>`;
            }
          }
        }

        // Over/Under for this player
        if (scoredHoles.length > 0 && p.gross !== null) {
          const pace = Math.round((p.gross / scoredHoles.length) * holesPerRound);
          const ouLine = Math.round(72 + (p.hi || 0) + 0.5);
          html += `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">O/U ${ouLine}.5 gross (pace: ${pace})</div>`;
        }

        // H2H moneylines vs each other player (real ML table)
        if (standingsData.length >= 2) {
          html += `<div style="margin-top:4px;margin-bottom:4px">
            <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(212,160,23,0.5);margin-bottom:4px">H2H Moneylines</div>`;
          standingsData.forEach((opp, j) => {
            if (j === i) return;
            const myHcp = p.hi ?? 0;
            const oppHcp = opp.hi ?? 0;
            const h2h = h2hOdds(myHcp, oppHcp);
            const h2hFav = h2h.startsWith('-');
            const h2hColor = h2hFav ? 'var(--gold-bright)' : 'var(--text-secondary)';
            const label = h2hFav ? 'fav' : 'dog';
            html += `<div style="display:flex;justify-content:space-between;font-size:12px;font-family:'SF Mono',monospace;padding:1px 0">
              <span style="color:var(--text-secondary)">vs ${escHtml(opp.name.split(' ')[0])}</span>
              <button onclick="event.stopPropagation();window.MG.openOddsBetSlip('${escHtml(p.name)} vs ${escHtml(opp.name.split(' ')[0])}','h2h','${h2h}')" style="padding:2px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-tertiary);color:${h2hColor};font-family:'SF Mono',monospace;font-size:12px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .1s" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">${h2h} <span style="font-size:10px;opacity:0.6">(${label})</span></button>
            </div>`;
          });
          html += `</div>`;
        }

        // Lay Action button
        html += `<button onclick="event.stopPropagation();window.MG.layAction('${escHtml(p.name)}')" style="width:100%;padding:8px;margin-top:4px;background:transparent;border:1.5px solid rgba(212,160,23,0.3);border-radius:6px;color:var(--gold-bright);font-size:12px;font-weight:600;cursor:pointer">Lay Action on ${escHtml(p.name.split(' ')[0])}</button>`;

        html += `</div>`;
      }

      html += `</div>`;
    });

    // Add Player inline (admin only)
    if (state.adminAuthed) {
      html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:6px">
        <div style="display:flex;gap:6px">
          <input type="text" id="add-player-name" placeholder="Name" style="flex:2;padding:8px 10px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;background:transparent;color:var(--text-primary)">
          <input type="number" id="add-player-hcp" placeholder="HCP" step="0.1" style="width:60px;padding:8px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;text-align:center;background:transparent;color:var(--text-primary)">
          <button onclick="window.MG.addPlayerInline()" style="padding:8px 14px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Add</button>
        </div>
        <details style="margin-top:8px">
          <summary style="font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;padding:4px 0">Paste multiple players</summary>
          <div style="margin-top:6px">
            <textarea id="paste-players-input" rows="4" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;background:transparent;color:var(--text-primary)" placeholder="One per line, or CSV: Name, HCP, @Venmo&#10;Tiger Woods, 0.6, @tigerwoods&#10;Rory McIlroy, -1.2"></textarea>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
              <button onclick="window.MG.pasteImportPlayers()" style="padding:6px 14px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Import</button>
              <span id="paste-import-status" style="font-size:12px;color:var(--text-secondary)"></span>
            </div>
          </div>
        </details>
      </div>`;
    }

    // Footer
    html += `<div style="padding:10px 14px;display:flex;justify-content:space-between;font-size:0.72rem;font-family:'SF Mono',monospace;color:#1a1a1a">
      <span>Total: $${totalPot}</span>
      <span>${holesRemaining} holes remaining</span>
    </div>`;

    html += `</div>`;
  } else if (scoredHoles.length === 0 && players.length >= 2) {
    // ================================================================
    // SECTION 7: PRE-MATCH ACTION (when scoredHoles === 0)
    // ================================================================
    const sorted = [...players].sort((a, b) => (a.handicapIndex || 0) - (b.handicapIndex || 0));

    // Header
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:0 2px">
      <span style="font-size:14px;font-weight:700;color:var(--gold-bright)">Pre-Match Action</span>
      <span style="font-size:10px;color:var(--text-tertiary);font-style:italic">Lines are set</span>
    </div>`;

    // Player rows with odds — card-based
    sorted.forEach((p, i) => {
      const sortedForOdds = sorted.map(s => ({ hi: s.handicapIndex || 0, toPar: null }));
      const odds = calculateLiveOdds(i, sorted.length, { hi: p.handicapIndex || 0, toPar: null }, 0, holesPerRound, sortedForOdds);
      const isFav2 = odds.startsWith('-');
      const oddsColor2 = isFav2 ? 'white' : 'var(--text-secondary)';
      const oddsBorderColor = isFav2 ? 'var(--gold-primary,var(--mg-gold))' : 'var(--border)';
      const isFavCard = i === 0;

      // Card styles — FAV gets gold gradient
      const cardBg = isFavCard
        ? 'background:linear-gradient(135deg,rgba(212,160,23,0.08),var(--bg-secondary));border:1px solid var(--gold-primary,var(--mg-gold));box-shadow:0 0 12px rgba(212,160,23,0.1)'
        : 'background:var(--bg-secondary);border:1px solid var(--border)';
      const badgeBg = isFavCard ? 'background:var(--gold-bright);color:var(--bg-secondary)' : i < 3 ? 'background:transparent;border:1.5px solid var(--gold-primary,var(--mg-gold));color:var(--gold-bright)' : 'background:transparent;border:1.5px solid var(--border-strong,var(--border));color:var(--text-secondary)';

      html += `<div style="${cardBg};border-radius:10px;padding:12px 14px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
            <span style="width:24px;height:24px;border-radius:50%;${badgeBg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;box-sizing:border-box">${i + 1}</span>
            <div style="min-width:0">
              <div style="font-size:15px;font-weight:${isFavCard ? '700' : '500'};color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.name)}</div>
              <div style="font-size:11px;color:var(--text-secondary);font-family:'SF Mono',monospace;margin-top:1px">HI ${p.handicapIndex || 0}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:8px">
            <button onclick="window.MG.openOddsBetSlip('${escHtml(p.name)}','to_win','${odds}')" style="padding:6px 12px;border-radius:8px;border:1.5px solid ${oddsBorderColor};background:var(--bg-tertiary);color:${oddsColor2};font-family:'SF Mono',monospace;font-size:15px;font-weight:800;cursor:pointer;min-width:60px;text-align:center;-webkit-tap-highlight-color:transparent;transition:transform .1s" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">${odds}</button>
          </div>
        </div>
      </div>`;
    });

    // Opening Lines — head-to-head spreads — card-based
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:12px 2px 8px;padding:0">
      <span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(212,160,23,0.5)">Opening Lines</span>
    </div>`;
    for (let i = 0; i < Math.floor(sorted.length / 2); i++) {
      const fav = sorted[i];
      const dog = sorted[sorted.length - 1 - i];
      const spread = ((dog.handicapIndex || 0) - (fav.handicapIndex || 0)).toFixed(1);
      html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:600;color:var(--text-primary)">${escHtml(fav.name.split(' ')[0])}</span>
          <button style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--gold-primary,var(--mg-gold));background:var(--bg-tertiary);color:var(--win);font-family:'SF Mono',monospace;font-size:15px;font-weight:800;min-width:60px;text-align:center;cursor:default">-${spread}</button>
          <span style="font-size:11px;color:var(--text-tertiary);font-weight:600">vs</span>
          <button style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg-tertiary);color:var(--loss);font-family:'SF Mono',monospace;font-size:15px;font-weight:800;min-width:60px;text-align:center;cursor:default">+${spread}</button>
          <span style="font-size:14px;font-weight:600;color:var(--text-primary)">${escHtml(dog.name.split(' ')[0])}</span>
        </div>
      </div>`;
    }

    // Props — card-based with gold accent
    const bestPlayer = sorted[0];
    const worstPlayer = sorted[sorted.length - 1];
    const overUnder = Math.round(72 + (bestPlayer.handicapIndex || 10) + 0.5);
    const propsList = [
      `Over/Under ${overUnder}.5 \u2014 ${bestPlayer.name.split(' ')[0]}'s gross score`,
      `Most skins won: ${bestPlayer.name.split(' ')[0]} vs Field`,
      `${worstPlayer.name.split(' ')[0]} makes a birdie today: Yes/No`,
    ];
    html += `<div style="margin-top:12px;margin-bottom:6px;padding:0 2px">
      <span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(212,160,23,0.5)">Prop Bets</span>
    </div>`;
    propsList.forEach(prop => {
      html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--gold-primary,var(--mg-gold));border-radius:10px;padding:12px 14px;margin-bottom:6px">
        <div style="font-size:12px;color:var(--text-primary);font-style:italic">${escHtml(prop)}</div>
      </div>`;
    });

    // Trash talk — dark card with gold left border
    html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--gold-primary,var(--mg-gold));border-radius:10px;padding:12px 14px;margin-top:8px;margin-bottom:6px">
      <div style="font-size:12px;font-style:italic;color:var(--text-secondary)">"${escHtml(worstPlayer.name.split(' ')[0])} is getting ${Math.round((worstPlayer.handicapIndex || 0) - (bestPlayer.handicapIndex || 0))} strokes and still won't win a skin. Prove me wrong."</div>
    </div>`;

    // Add Player inline (admin only)
    if (state.adminAuthed) {
      html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-top:8px">
        <div style="display:flex;gap:6px">
          <input type="text" id="add-player-name" placeholder="Name" style="flex:2;padding:8px 10px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;background:transparent;color:var(--text-primary)">
          <input type="number" id="add-player-hcp" placeholder="HCP" step="0.1" style="width:60px;padding:8px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;text-align:center;background:transparent;color:var(--text-primary)">
          <button onclick="window.MG.addPlayerInline()" style="padding:8px 14px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Add</button>
        </div>
        <details style="margin-top:8px">
          <summary style="font-size:12px;font-weight:600;color:var(--text-secondary);cursor:pointer;padding:4px 0">Paste multiple players</summary>
          <div style="margin-top:6px">
            <textarea id="paste-players-input" rows="4" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;background:transparent;color:var(--text-primary)" placeholder="One per line, or CSV: Name, HCP, @Venmo&#10;Tiger Woods, 0.6, @tigerwoods&#10;Rory McIlroy, -1.2"></textarea>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
              <button onclick="window.MG.pasteImportPlayers()" style="padding:6px 14px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Import</button>
              <span id="paste-import-status" style="font-size:12px;color:var(--text-secondary)"></span>
            </div>
          </div>
        </details>
      </div>`;
    }
  } else if (players.length > 0 && scoredHoles.length === 0) {
    // Players exist but no scores yet and < 2 players — show roster
    // Hidden once scores exist (scorecard already shows player names)
    html += `<div style="background:var(--bg-secondary);border-radius:10px;overflow:hidden;margin-bottom:8px">
      <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
        <span style="font-size:14px;font-weight:700;color:var(--gold-bright)">Players</span>
      </div>`;
    players.forEach((p, i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;${i < players.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <span style="font-size:15px;font-weight:500;color:var(--text-primary)">${escHtml(p.name)}</span>
        <span style="font-size:12px;color:var(--text-secondary);font-family:'SF Mono',monospace">HI ${p.handicapIndex || 0}</span>
      </div>`;
    });
    if (state.adminAuthed) {
      html += `<div style="padding:10px 16px;border-top:1px solid var(--border)">
        <div style="display:flex;gap:6px">
          <input type="text" id="add-player-name" placeholder="Name" style="flex:2;padding:8px 10px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;background:transparent;color:var(--text-primary)">
          <input type="number" id="add-player-hcp" placeholder="HCP" step="0.1" style="width:60px;padding:8px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;text-align:center;background:transparent;color:var(--text-primary)">
          <button onclick="window.MG.addPlayerInline()" style="padding:8px 14px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Add</button>
        </div>
      </div>`;
    }
    html += `<div style="text-align:center;padding:10px 16px;font-size:13px;color:var(--text-secondary)">${state.adminAuthed ? 'Tap the score card to enter hole 1' : 'Waiting for round to start...'}</div>`;
    html += `</div>`;
  }

  // ================================================================
  // SECTION 3.5: SETTLEMENT PREVIEW (BOARD tab)
  // ================================================================
  if ((!showSubTabs || activeSubTab === 'board') && scoredHoles.length > 0 && hasPnL) {
    const payPairs = computePayablePairs(pnl);
    if (payPairs.length > 0) {
      const venmoHandles = {};
      (config?.players || config?.roster || []).forEach(p => {
        if (p.venmo) venmoHandles[p.name || p.member] = p.venmo.replace(/^@/, '');
      });
      const noteText = encodeURIComponent(`${eventName} \u00b7 Waggle`);
      html += `<div style="background:var(--bg-secondary,#0d2818);color:#f0ece3;border:1px solid rgba(212,160,23,0.3);border-left:3px solid var(--gold-primary,#c9a84c);border-radius:10px;padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#c9a84c">Settlement${roundComplete ? '' : ' (Running)'}</div>
          ${roundComplete ? `<a href="#settle" style="font-size:13px;font-weight:600;color:#c9a84c;text-decoration:none">Full Card &rarr;</a>` : `<span style="font-size:0.78rem;color:rgba(240,236,227,0.6);font-weight:600">Thru ${scoredHoles.length} holes</span>`}
        </div>`;
      payPairs.forEach(pair => {
        const toVenmo = venmoHandles[pair.to] || pair.to;
        const venmoUrl = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(toVenmo)}&amount=${pair.amount}&note=${noteText}`;
        const venmoWeb = `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(toVenmo)}&amount=${pair.amount}&note=${noteText}`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(212,160,23,0.2)">
          <div style="font-size:16px;font-weight:600;color:#f0ece3">${escHtml(pair.from.split(' ')[0])} <span style="font-size:14px;color:rgba(240,236,227,0.6)">\u2192</span> ${escHtml(pair.to.split(' ')[0])}</div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-family:'SF Mono',monospace;font-size:22px;font-weight:800;color:#c9a84c">$${pair.amount}</span>
            ${venmoHandles[pair.to] ? `<a href="${venmoUrl}" onclick="event.preventDefault();window.location.href='${venmoUrl}';setTimeout(()=>window.open('${venmoWeb}','_blank'),1200)" style="padding:8px 16px;background:#3D95CE;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;min-height:40px;display:flex;align-items:center">Venmo</a>` : ''}
          </div>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ================================================================
  // SECTION 4: LIVE TICKER (BOARD tab)
  // ================================================================
  if (!showSubTabs || activeSubTab === 'board') {
    const feedItems = state._feed || [];
    const allTickerItems = [...(feedItems || []).slice(0, 5)];
    // Inject odds movement events into the ticker
    oddsMovements.forEach(msg => {
      allTickerItems.unshift({ text: msg, isOddsMove: true });
    });
    if (allTickerItems.length > 0 && scoredHoles.length > 0) {
      html += `<div id="board-ticker" style="background:rgba(212,160,23,0.06);border-left:3px solid var(--mg-gold);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:8px;overflow:hidden;height:34px;cursor:pointer;animation:tickerBorderPulse 2s ease-in-out infinite" onclick="this.style.height=this.style.height==='34px'?'auto':'34px'">`;
      allTickerItems.slice(0, 7).forEach((item, i) => {
        const text = item.text || '';
        const color = item.isOddsMove ? 'var(--gold-bright)' : 'var(--mg-text)';
        const prefix = item.isOddsMove ? '<span style="font-weight:700;margin-right:4px">LINE MOVE</span>' : '';
        html += `<div style="font-size:14px;font-style:italic;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${i > 0 ? 'margin-top:6px' : ''}">${prefix}${escHtml(text)}</div>`;
      });
      html += `</div>`;
    }
  }

  // ================================================================
  // SECTION 5: THE BAR (BAR tab — projections, chirps, momentum)
  // ================================================================
  if ((!showSubTabs || activeSubTab === 'bar') && scoredHoles.length > 0) {
    const barHasContent = scoredHoles.length >= 3;
    const barOpen = state._barOpen;
    // When shown as a dedicated tab, always open and no toggle button needed
    const barIsTab = showSubTabs && activeSubTab === 'bar';
    html += `<div style="margin-bottom:8px">`;
    if (!barIsTab) {
      html += `<button onclick="window.MG.toggleSection('bar')" style="width:100%;padding:10px 16px;background:transparent;border:1px solid var(--border);border-radius:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer">
        <span style="font-style:italic;font-size:14px;color:var(--mg-text)">The Bar</span>
        <span style="display:flex;align-items:center;gap:6px">
          <span style="font-size:10px;color:var(--mg-text-muted)">Projections + Chirps</span>
          <svg class="bar-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="transform:${barOpen?'rotate(180deg)':''}"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>`;
    }
    html += `<div id="bar-section" style="display:${barIsTab || barOpen?'block':'none'};padding:12px 0">`;

    // ── TRASH TALK / LIVE FEED (first thing in The Bar — the best part) ──
    {
      const barFeed = state._feed || [];
      const barFeedEvts = events || [];
      const barItems = [];
      barFeedEvts.slice(0, 5).forEach(ev => {
        let t = '';
        if (ev.type === 'skin_won') t = `${ev.player} wins the skin on Hole ${ev.hole}`;
        else if (ev.type === 'skin_carried') t = `Skin carried on Hole ${ev.hole}`;
        else if (ev.type === 'nassau_front_complete') t = `Front 9: ${ev.winner} leads`;
        else if (ev.type === 'nassau_back_complete') t = `Back 9: ${ev.winner} wins`;
        else if (ev.type === 'nassau_total_complete') t = `Nassau: ${ev.winner} wins`;
        else if (ev.type === 'wolf_result') t = ev.wolfWon ? `Wolf wins Hole ${ev.hole}` : `Opponents win wolf Hole ${ev.hole}`;
        if (t) barItems.push({ text: t, type: 'game', ts: ev.ts || Date.now() });
      });
      barFeed.slice(0, 15).forEach(fi => {
        barItems.push({ text: fi.text || '', type: fi.type || 'chirp', player: fi.player, emoji: fi.emoji, ts: fi.ts || Date.now() });
      });
      barItems.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const barShown = barItems.slice(0, 10);

      html += `<div style="background:var(--bg-secondary);border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--win);animation:wg-pulse 2s infinite"></span> Live Feed
        </div>`;
      if (barShown.length > 0) {
        html += `<div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:8px">`;
        barShown.forEach(bi => {
          const bc = bi.type === 'game' ? 'var(--mg-gold)' : bi.type === 'score' ? 'var(--mg-gold-dim)' : 'var(--mg-green)';
          const bn = bi.player ? bi.player[0].toUpperCase() : (bi.type === 'game' ? '\u26F3' : '?');
          const bd = narrativize(bi, gameState, config?.structure);
          html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:var(--mg-surface);border:1px solid var(--mg-border)">
            <div style="width:24px;height:24px;min-width:24px;border-radius:50%;background:${bc};color:var(--text-primary);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${escHtml(String(bn))}</div>
            <div style="flex:1;min-width:0"><div style="font-size:12px;color:var(--mg-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bi.emoji ? '<span style="font-size:18px;margin-right:4px">' + escHtml(bi.emoji) + '</span>' : ''}${escHtml(bd)}</div></div>
            <div style="font-size:10px;color:var(--mg-text-muted);flex-shrink:0">${feedTimeAgo(bi.ts)}</div>
          </div>`;
        });
        html += `</div>`;
      } else {
        html += `<div style="text-align:center;padding:16px;font-size:13px;color:var(--mg-text-muted)">No trash talk yet. Be the first!</div>`;
      }
      // Chirp input
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--mg-surface);border-radius:12px;border:1px solid var(--mg-border)">
        <input id="bar-chirp-input" type="text" placeholder="Talk trash..." maxlength="100"
          onkeydown="if(event.key==='Enter'){event.preventDefault();window.MG.sendChirp()}"
          style="flex:1;background:transparent;border:none;outline:none;color:var(--text-secondary);font-size:14px;padding:6px 0" />
        <button onclick="window.MG.sendChirp()" style="background:var(--mg-green);color:var(--text-primary);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">Send</button>
      </div>`;
      // Emoji reactions
      html += `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">`;
      ['\u{1F525}','\u{1F480}','\u{1F3CC}\u{FE0F}','\u{1F426}','\u{1F4B0}','\u{1F3AF}'].forEach(em => {
        html += `<button onclick="window.MG.sendEmoji('${em}')" style="background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;padding:6px 10px;font-size:18px;cursor:pointer">${em}</button>`;
      });
      html += `</div>`;
      // AI Trash Talk
      if (scoredHoles.length >= 2) {
        html += `<button id="ai-chirp-btn" onclick="window.MG.generateAIChirp()" style="width:100%;margin-top:8px;padding:10px;background:linear-gradient(135deg,rgba(212,160,23,0.12),rgba(212,160,23,0.04));border:1.5px solid var(--mg-gold);border-radius:8px;color:var(--mg-gold);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;letter-spacing:0.5px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Generate Trash Talk
        </button>`;
        html += `<div id="ai-chirp-result" style="margin-top:4px"></div>`;
      }
      html += `</div>`;
    }

    // If Everyone Pars Out
    {
      const remainingHoles = [];
      for (let h = 1; h <= holesPerRound; h++) {
        if (!scoredHoles.includes(h)) remainingHoles.push(h);
      }
      if (remainingHoles.length > 0) {
        const simParOut = {};
        remainingHoles.forEach(h => {
          simParOut[h] = {};
          players.forEach(p => { simParOut[h][p.name] = pars[h - 1] || 4; });
        });
        const projPnl = computeSimulatedPnL(gameState, simParOut, players, games, structure, holesPerRound, pars, holes);
        const currentPnl = pnl;

        html += `<div style="padding:12px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:10px">If Everyone Pars Out</div>`;

        const projSorted = players.map(p => ({ name: p.name, current: currentPnl[p.name] || 0, projected: projPnl[p.name] || 0 }))
          .sort((a, b) => b.projected - a.projected);

        projSorted.forEach((pp, pi) => {
          const delta = pp.projected - pp.current;
          const arrow = delta > 0 ? '\u25B2' : delta < 0 ? '\u25BC' : '';
          const deltaColor = delta > 0 ? 'var(--win)' : delta < 0 ? 'var(--loss)' : 'var(--mg-text-muted)';
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${pi < projSorted.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
            <div style="font-size:14px;font-weight:600;color:var(--mg-text)">${escHtml(pp.name.split(' ')[0])}</div>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:10px;color:${deltaColor}">${arrow} ${delta !== 0 ? '$' + Math.abs(delta) : '\u2014'}</span>
              <span style="font-size:16px;font-weight:800;font-family:'SF Mono',monospace;color:${pp.projected >= 0 ? 'var(--win)' : 'var(--loss)'}">${pp.projected >= 0 ? '+' : ''}$${Math.abs(pp.projected)}</span>
            </div>
          </div>`;
        });
        html += `</div>`;
      }
    }

    // What You Need
    if (scoredHoles.length >= 3) {
      const myName = state.bettorName || players[0]?.name || '';
      const myPnl = pnl[myName] || 0;
      const leader = standingsData[0];
      const leaderPnl = pnl[leader?.name] || 0;
      const remainingCount = holesPerRound - scoredHoles.length;

      if (myName && leader && leader.name !== myName && leaderPnl > myPnl) {
        const deficit = leaderPnl - myPnl;
        html += `<div style="padding:12px;background:var(--mg-surface);border:1px solid var(--mg-border);border-left:3px solid var(--mg-gold);border-radius:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:6px">What You Need</div>
          <div style="font-size:14px;color:var(--mg-text);line-height:1.5">You're <span style="font-family:'SF Mono',monospace;color:var(--loss);font-weight:700">$${deficit}</span> behind ${escHtml(leader.name.split(' ')[0])} with ${remainingCount} holes left. ${games.skins ? `A skin is worth $${parseInt(structure?.skinsBet) || 5} \u00d7 ${players.length - 1} = $${(parseInt(structure?.skinsBet) || 5) * (players.length - 1)}.` : 'Make birdies.'}</div>
        </div>`;
      } else if (myName && leader && leader.name === myName) {
        const second = standingsData[1];
        const lead = myPnl - (pnl[second?.name] || 0);
        html += `<div style="padding:12px;background:var(--mg-surface);border:1px solid var(--mg-border);border-left:3px solid var(--win);border-radius:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--win);margin-bottom:6px">You're Leading</div>
          <div style="font-size:14px;color:var(--mg-text);line-height:1.5">Up <span style="font-family:'SF Mono',monospace;color:var(--win);font-weight:700">$${lead}</span> on ${escHtml((second?.name || '').split(' ')[0])} with ${remainingCount} to play. Don't get comfortable.</div>
        </div>`;
      }
    }

    // The Chirps
    if (scoredHoles.length >= 3) {
      const chirps = [];
      const recentHoles = scoredHoles.slice(-3);
      players.forEach(p => {
        let bogeys = 0;
        recentHoles.forEach(h => {
          const hData = holes[h];
          const score = hData?.scores ? hData.scores[p.name] : hData?.[p.name];
          const par = pars[h - 1] || 4;
          if (score && score > par) bogeys++;
        });
        if (bogeys >= 2) chirps.push(`${p.name.split(' ')[0]} has bogeyed ${bogeys} of the last 3 holes. Is it nerves or just bad golf?`);
      });
      if (gameState?.skins) {
        const skinCounts = {};
        players.forEach(p => { skinCounts[p.name] = 0; });
        if (gameState.skins.history) {
          gameState.skins.history.forEach(s => { if (s.winner) skinCounts[s.winner] = (skinCounts[s.winner] || 0) + 1; });
        }
        const maxSkins = Math.max(...Object.values(skinCounts));
        const skinless = players.filter(p => skinCounts[p.name] === 0);
        if (skinless.length > 0 && maxSkins > 0) {
          chirps.push(`${skinless.map(p => p.name.split(' ')[0]).join(' and ')} ${skinless.length === 1 ? 'hasn\'t' : 'haven\'t'} won a single skin. Somebody buy them a drink.`);
        }
      }
      const sortedPnl = players.map(p => ({ name: p.name, pnl: pnl[p.name] || 0 })).sort((a, b) => b.pnl - a.pnl);
      if (sortedPnl.length >= 2) {
        const spread = sortedPnl[0].pnl - sortedPnl[sortedPnl.length - 1].pnl;
        if (spread >= 20) chirps.push(`$${spread} separates first and last. That's a round of drinks for ${sortedPnl[sortedPnl.length - 1].name.split(' ')[0]}.`);
      }

      if (chirps.length > 0) {
        html += `<div style="padding:12px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:8px">The Chirps</div>`;
        chirps.forEach(c => {
          html += `<div style="font-size:13px;color:var(--mg-text);padding:6px 0;border-bottom:1px solid var(--mg-border);line-height:1.4;font-style:italic">"${escHtml(c)}"</div>`;
        });
        html += `</div>`;
      }
    }

    // Momentum / Trends
    if (scoredHoles.length >= 6) {
      const halfHoles = scoredHoles.slice(0, Math.floor(scoredHoles.length / 2));
      const secondHalf = scoredHoles.slice(Math.floor(scoredHoles.length / 2));
      const trendData = players.map(p => {
        let firstHalfTotal = 0, secondHalfTotal = 0;
        halfHoles.forEach(h => {
          const hData = holes[h];
          const score = hData?.scores ? hData.scores[p.name] : hData?.[p.name];
          const par = pars[h - 1] || 4;
          if (score) firstHalfTotal += score - par;
        });
        secondHalf.forEach(h => {
          const hData = holes[h];
          const score = hData?.scores ? hData.scores[p.name] : hData?.[p.name];
          const par = pars[h - 1] || 4;
          if (score) secondHalfTotal += score - par;
        });
        return { name: p.name, first: firstHalfTotal, second: secondHalfTotal, trend: firstHalfTotal - secondHalfTotal };
      }).filter(t => t.trend !== 0).sort((a, b) => b.trend - a.trend);

      if (trendData.length > 0) {
        html += `<div style="padding:12px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:8px">Momentum</div>`;
        trendData.forEach(t => {
          const improving = t.trend > 0;
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
            <span style="font-size:13px;font-weight:600;color:var(--mg-text)">${escHtml(t.name.split(' ')[0])}</span>
            <span style="font-size:12px;font-weight:700;color:${improving ? 'var(--win)' : 'var(--loss)'}">
              ${improving ? '\u25B2 Heating Up' : '\u25BC Cooling Off'}
              <span style="font-family:'SF Mono',monospace;margin-left:4px">(${t.second > 0 ? '+' : ''}${t.second} \u2192 ${t.first > 0 ? '+' : ''}${t.first})</span>
            </span>
          </div>`;
        });
        html += `</div>`;
      }
    }

    html += `</div></div>`;
  }

  // ================================================================
  // SECTION 6: PROPS + SIDE ACTION (BAR tab)
  // ================================================================
  if (!showSubTabs || activeSubTab === 'bar') {
    const propsData = state._props || [];
    const openProps = propsData.filter(p => p.status === 'open');
    const acceptedProps = propsData.filter(p => p.status === 'accepted');
    const settledProps = propsData.filter(p => p.status === 'settled');
    const hasWinners = Object.values(pnl).some(v => v > 0);
    const winners = players.filter(p => (pnl[p.name] || 0) > 0).sort((a, b) => (pnl[b.name] || 0) - (pnl[a.name] || 0));
    const topWinAmount = winners.length > 0 ? pnl[winners[0].name] : 0;
    const hasAnyAction = openProps.length > 0 || acceptedProps.length > 0 || settledProps.length > 0 || (roundComplete && hasWinners);

    if (hasAnyAction || scoredHoles.length > 0) {
      html += `<div style="margin-bottom:8px">`;

      // Double or Nothing
      if (roundComplete && hasWinners && roundNum >= 1) {
        const existingDoN = propsData.find(p => p.type === 'double_or_nothing' && p.roundNumber === roundNum + 1);
        if (!existingDoN) {
          html += `<div style="background:linear-gradient(135deg, rgba(212,160,23,0.08), rgba(212,160,23,0.02));border:1.5px solid var(--mg-gold);border-radius:10px;padding:14px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:6px">Double or Nothing</div>
            <div style="font-size:13px;color:var(--mg-text);margin-bottom:10px">${escHtml(winners[0].name)} won <span style="font-family:'SF Mono',monospace;color:var(--win);font-weight:700">+$${topWinAmount}</span> this round. Run it back?</div>
            <button onclick="window.MG.createDoubleOrNothing()" style="width:100%;padding:12px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.5px;min-height:44px">
              Double or Nothing \u2014 $${topWinAmount * 2} on Round ${roundNum + 1}
            </button>
          </div>`;
        }
      }

      // Open propositions
      openProps.forEach(prop => {
        const bettorName = state.bettorName || '';
        const alreadyAccepted = (prop.acceptedBy || []).includes(bettorName);
        html += `<div style="background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;padding:12px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--mg-gold-dim)">${escHtml(prop.type.replace(/_/g, ' '))}</div>
            <div style="font-size:10px;color:var(--mg-text-muted)">by ${escHtml((prop.creator || '').split(' ')[0])}</div>
          </div>
          <div style="font-size:13px;color:var(--mg-text);margin-bottom:8px">${escHtml(prop.description)}</div>
          <div style="font-size:16px;font-weight:800;font-family:'SF Mono',monospace;color:var(--mg-gold);margin-bottom:8px">$${prop.amount || 0}</div>
          ${!alreadyAccepted && prop.creator !== bettorName
            ? `<button onclick="window.MG.acceptProp('${prop.id}')" style="width:100%;padding:10px;background:var(--mg-green);color:var(--text-primary);border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">Accept</button>`
            : `<div style="font-size:11px;color:var(--mg-text-muted);text-align:center;padding:6px">Waiting for opponent...</div>`
          }
        </div>`;
      });

      // Accepted/locked props
      acceptedProps.forEach(prop => {
        html += `<div style="background:rgba(63,185,80,0.04);border:1.5px solid var(--win);border-radius:8px;padding:12px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--win)">Locked In</div>
            <div style="font-size:16px;font-weight:800;font-family:'SF Mono',monospace;color:var(--win)">$${prop.amount || 0}</div>
          </div>
          <div style="font-size:13px;color:var(--mg-text)">${escHtml(prop.description)}</div>
        </div>`;
      });

      // Settled props
      settledProps.slice(0, 3).forEach(prop => {
        html += `<div style="background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;padding:10px;margin-bottom:6px;opacity:0.7">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:12px;color:var(--mg-text)">${escHtml(prop.description)}</div>
            <div style="font-size:12px;font-weight:700;font-family:'SF Mono',monospace;color:var(--mg-gold)">$${prop.amount || 0}</div>
          </div>
          <div style="font-size:10px;color:var(--mg-text-muted);margin-top:2px">${prop.result || 'Settled'}</div>
        </div>`;
      });

      // Side bet button
      html += `<button onclick="window.MG.createSideBet()" style="width:100%;padding:10px;background:transparent;border:1.5px dashed var(--mg-gold);border-radius:8px;color:var(--mg-gold-dim);font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.5px;min-height:44px">
        + Propose a Side Bet
      </button>`;

      html += `</div>`;
    }
  }

  // ================================================================
  // GAMES CONFIG (BAR tab — collapsible)
  // ================================================================
  if (!showSubTabs || activeSubTab === 'bar') {
    const allGameIds = ['nassau', 'skins', 'wolf', 'vegas', 'stableford', 'matchPlay', 'banker', 'bbb', 'nines', 'scramble'];
    const allGameLabels = { nassau: 'Nassau', skins: 'Skins', wolf: 'Wolf', vegas: 'Vegas', stableford: 'Stableford', matchPlay: 'Match Play', banker: 'Banker', bbb: 'BBB', nines: '9s', scramble: 'Scramble' };
    const inactiveGames = allGameIds.filter(g => !games[g]);

    const gamesOpen = state._gamesOpen;
    const gamesIsTab = showSubTabs && activeSubTab === 'bar';
    html += `<div style="margin-bottom:8px">`;
    if (!gamesIsTab) {
      html += `<button onclick="window.MG.toggleSection('games')" style="width:100%;padding:10px 16px;background:transparent;border:1px solid var(--border);border-radius:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer">
        <span style="font-size:13px;font-weight:600;color:var(--mg-text)">Games & Stakes</span>
        <span style="font-size:10px;color:var(--mg-text-muted)">${activeGamesList.join(' \u00b7 ') || 'None set'}</span>
      </button>`;
    }
    html += `<div id="games-config-section" style="display:${gamesIsTab || gamesOpen?'block':'none'};padding:12px 0">`;

    // AI advisor
    if (scoredHoles.length === 0) {
      html += `<div style="padding:12px;background:rgba(212,160,23,0.04);border:1.5px solid var(--mg-gold);border-radius:8px;margin-bottom:8px">
        <button onclick="window.MG.getAIGameAdvice()" style="width:100%;padding:10px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Recommend Games for This Group
        </button>
        <div id="ai-game-advice" style="margin-top:8px"></div>
      </div>`;
    }

    // Active games pills
    if (activeGamesList.length > 0) {
      html += `<div style="margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:6px">Active</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      activeGamesList.forEach(g => {
        const gId = g.toLowerCase().replace(' ', '');
        let detail = '';
        if (g === 'Nassau' && nassauBetAmt > 0) detail = ' $' + nassauBetAmt;
        if (g === 'Skins' && skinsBetAmt > 0) detail = ' $' + skinsBetAmt;
        html += `<button onclick="window.MG.toggleGame('${gId}')"
          style="padding:8px 14px;background:rgba(212,160,23,0.15);color:var(--mg-gold-dim);border:1.5px solid var(--mg-gold);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;min-height:44px;-webkit-tap-highlight-color:transparent">
          ${escHtml(g)}${detail}
          <span style="font-size:10px;opacity:.5">&times;</span>
        </button>`;
      });
      html += `</div></div>`;
    }

    // Add Game
    if (inactiveGames.length > 0 && !state._spectatorMode) {
      html += `<div style="margin-bottom:8px">
        <button onclick="document.getElementById('inactive-games-list').style.display=document.getElementById('inactive-games-list').style.display==='none'?'flex':'none'"
          style="padding:8px 14px;background:none;color:var(--mg-text-muted);border:1.5px dashed var(--mg-border);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;min-height:44px;-webkit-tap-highlight-color:transparent">+ Add Game</button>
        <div id="inactive-games-list" style="display:none;flex-wrap:wrap;gap:6px;margin-top:8px">`;
      inactiveGames.forEach(gId => {
        const label = allGameLabels[gId] || gId;
        html += `<button onclick="window.MG.toggleGame('${gId}')"
          style="padding:8px 14px;background:var(--mg-surface);color:var(--mg-text-muted);border:1.5px dashed var(--mg-border);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;min-height:44px;-webkit-tap-highlight-color:transparent">${escHtml(label)}</button>`;
      });
      html += `</div></div>`;
    }

    // Stakes quick-pick
    if ((games.nassau || games.skins) && !state._spectatorMode) {
      html += `<div style="padding:10px 0;border-top:1px solid var(--mg-border)">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:8px">Stakes</div>`;
      if (games.nassau) {
        const nassauOptions = [5, 10, 20, 50];
        html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="font-size:12px;font-weight:600;min-width:52px">Nassau</span>
          <div style="display:flex;gap:4px;flex:1">`;
        nassauOptions.forEach(amt => {
          const isActive = nassauBetAmt === amt;
          html += `<button onclick="window.MG.updateStakesQuick('nassau',${amt})"
            style="flex:1;padding:10px 4px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid ${isActive ? 'var(--mg-gold)' : 'var(--mg-border)'};background:${isActive ? 'rgba(212,160,23,0.15)' : 'var(--mg-surface)'};color:${isActive ? 'var(--mg-gold)' : 'var(--mg-text-muted)'};min-height:44px;-webkit-tap-highlight-color:transparent">$${amt}</button>`;
        });
        html += `</div></div>`;
      }
      if (games.skins) {
        const skinsOptions = [2, 5, 10, 25];
        html += `<div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;font-weight:600;min-width:52px">Skins</span>
          <div style="display:flex;gap:4px;flex:1">`;
        skinsOptions.forEach(amt => {
          const isActive = skinsBetAmt === amt;
          html += `<button onclick="window.MG.updateStakesQuick('skins',${amt})"
            style="flex:1;padding:10px 4px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid ${isActive ? 'var(--mg-gold)' : 'var(--mg-border)'};background:${isActive ? 'rgba(212,160,23,0.15)' : 'var(--mg-surface)'};color:${isActive ? 'var(--mg-gold)' : 'var(--mg-text-muted)'};min-height:44px;-webkit-tap-highlight-color:transparent">$${amt}</button>`;
        });
        html += `</div></div>`;
      }
      html += `</div>`;
    }

    html += `</div></div>`;
  }

  // ================================================================
  // ROUND COMPLETE CTA + ROUND MANAGER
  // ================================================================
  if (roundComplete) {
    html += `<div style="padding:20px;text-align:center;border-top:3px solid var(--mg-gold);border-radius:10px;background:var(--mg-surface);margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--mg-gold);margin-bottom:8px">ROUND COMPLETE</div>
      <div style="font-size:18px;font-weight:700;color:var(--mg-text);margin-bottom:14px">Final results are ready</div>
      <a href="#settle" style="text-decoration:none;display:inline-block;padding:14px 32px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:10px;font-size:15px;font-weight:700;min-height:44px">View Settlement</a>
    </div>`;
  }

  if (roundComplete && state.adminAuthed) {
    const curRound = config?.event?.currentRound || 1;
    const roundsConfig3 = config?.rounds;
    const nextRound = curRound + 1;
    const nextRoundInfo = roundsConfig3?.[nextRound];

    html += `<div style="padding:16px;border:1.5px solid var(--mg-gold);border-radius:10px;background:var(--mg-surface);margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:12px">Set Up Round ${nextRound}</div>`;

    if (nextRoundInfo) {
      html += `<div style="padding:12px;background:rgba(212,160,23,0.04);border:1px solid var(--mg-gold);border-radius:8px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:700;color:var(--mg-green)">${escHtml(nextRoundInfo.course || '')}</div>
        <div style="font-size:12px;color:var(--mg-text-muted);margin-top:2px">${escHtml(nextRoundInfo.tees || '')} &middot; Par ${nextRoundInfo.par || 72}</div>
      </div>
      <button onclick="window.MG.startNextRound(${nextRound}, '${escHtml(nextRoundInfo.course || '').replace(/'/g, "\\'")}', '${escHtml(nextRoundInfo.courseId || '').replace(/'/g, "\\'")}')"
        style="width:100%;padding:14px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;min-height:44px">
        Start Round ${nextRound}: ${escHtml(nextRoundInfo.course || 'Next Course')}
      </button>`;
    } else {
      html += `<div style="margin-bottom:10px">
        <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:8px">Select course for Round ${nextRound}:</div>
        <input type="text" id="next-round-course" placeholder="Search course..." oninput="window.MG.searchNextRoundCourse(this.value)"
          style="width:100%;padding:10px;background:var(--mg-surface);color:var(--mg-text);border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box">
        <div id="next-round-results"></div>
      </div>
      <button onclick="window.MG.startNextRound(${nextRound})"
        style="width:100%;padding:14px;background:var(--mg-gold);color:var(--mg-green);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;min-height:44px">
        Start Round ${nextRound}
      </button>`;
    }

    html += `<div style="margin-top:10px;font-size:11px;color:var(--mg-text-muted);text-align:center">This archives Round ${curRound} scores and resets the scorecard</div>
    </div>`;
  }

  html += renderOddsBetSlip(state);
  return html;
}

// ─── SCORE ENTRY MODAL (round mode — no PIN) ───
// Exported so route() can inject it as a global overlay on any tab
export function renderScoreEntryOverlay(state) {
  if (!state._scoreModal) return '';
  const config = state._config;
  const players = getPlayersFromConfig(config);
  return renderScoreModal(state, players);
}

function renderScoreModal(state, players) {
  const modal = state._scoreModal;
  if (!modal) return '';
  const { hole, scores } = modal;
  const pars = getCoursePars(state._config);
  const par = pars[hole - 1] || 4;
  const hcpRank = state._config?.courseHcpIndex?.[hole - 1] ?? null;
  const holesPerRound = state._config?.holesPerRound || 18;

  // Hole picker — shows hole number + par for each hole
  let holePicker = `<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;-webkit-overflow-scrolling:touch">`;
  for (let h = 1; h <= holesPerRound; h++) {
    const isActive = h === hole;
    const hPar = pars[h - 1] || 4;
    const hasScore = state._holes?.[h]?.scores && Object.keys(state._holes[h].scores).length > 0;
    // Par 3 = teal dot, Par 5 = gold dot, Par 4 = no dot
    const parDot = hPar === 3 ? `<div style="width:5px;height:5px;border-radius:50%;background:${isActive ? 'var(--text-primary)' : '#0D9488'};margin:0 auto;margin-top:1px"></div>`
                 : hPar === 5 ? `<div style="width:5px;height:5px;border-radius:50%;background:${isActive ? 'var(--text-primary)' : 'var(--gold-primary)'};margin:0 auto;margin-top:1px"></div>`
                 : `<div style="width:5px;height:5px;margin-top:1px"></div>`;
    holePicker += `<button onclick="window.MG.setScoreModalHole(${h})"
      style="min-width:36px;height:44px;border-radius:8px;border:2px solid ${isActive ? 'var(--mg-green)' : 'var(--mg-border)'};background:${isActive ? 'var(--mg-green)' : (hasScore ? 'rgba(35,134,54,0.08)' : 'transparent')};color:${isActive ? 'var(--text-primary)' : 'var(--mg-text)'};font-size:12px;font-weight:${isActive ? '700' : '500'};cursor:pointer;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 0;line-height:1.1">
      <span>${h}</span>
      ${parDot}
      </button>`;
  }
  holePicker += `</div>`;
  // Legend
  holePicker += `<div style="display:flex;gap:12px;font-size:11px;color:var(--mg-text-muted);margin-bottom:12px;margin-top:-8px">
    <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#0D9488;display:inline-block"></span>Par 3</span>
    <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--gold-primary);display:inline-block"></span>Par 5</span>
    <span style="color:var(--mg-text-muted)">No dot = Par 4</span>
  </div>`;

  // Score inputs per player
  let playerRows = players.map(p => {
    const val = scores[p.name] ?? '';
    const net = typeof val === 'number' ? val - par : null;
    let relStyle = '';
    if (net !== null) {
      if (net <= -2) relStyle = 'color:#1565C0;font-weight:700';
      else if (net === -1) relStyle = 'color:var(--win);font-weight:700';
      else if (net === 0) relStyle = 'color:var(--mg-text-muted)';
      else if (net === 1) relStyle = 'color:var(--loss)';
      else relStyle = 'color:var(--loss);font-weight:700';
    }
    // Score buttons: show par-2 through par+4 (covers 95% of amateur scores)
    const lo = Math.max(1, par - 2);
    const hi = par + 4;
    const btns = [];
    for (let s = lo; s <= hi; s++) btns.push(s);
    const btnHtml = btns.map(s => {
      const isActive = val === s;
      const diff = s - par;
      let bg = isActive ? 'var(--mg-green)' : 'var(--mg-surface)';
      let col = isActive ? 'var(--text-primary)' : 'var(--mg-text)';
      let border = isActive ? 'var(--mg-green)' : 'var(--mg-border)';
      if (!isActive && diff <= -2) { col = '#1565C0'; }
      else if (!isActive && diff === -1) { col = 'var(--win)'; }
      else if (!isActive && diff >= 2) { col = 'var(--loss)'; }
      return `<button onclick="window.MG.setScoreModalScore('${escHtml(p.name)}',${s})"
        style="min-width:38px;height:40px;border-radius:8px;border:2px solid ${border};background:${bg};color:${col};font-size:16px;font-weight:700;cursor:pointer;flex:1">${s}</button>`;
    }).join('');
    return `<div style="padding:10px 0;border-bottom:1px solid var(--mg-border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:15px;font-weight:600">${escHtml(p.name)}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--mg-text-muted)">HCP ${p.handicapIndex}</span>
          ${net !== null ? `<span style="font-size:12px;font-weight:700;${relStyle}">${net === 0 ? 'E' : (net > 0 ? '+' + net : net)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px">${btnHtml}</div>
    </div>`;
  }).join('');

  const allFilled = players.length > 0 && players.every(p => scores[p.name] >= 1 && scores[p.name] <= 15);

  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:flex-end" onclick="if(event.target===this)window.MG.closeScoreModal()">
    <div style="background:var(--mg-surface);border-radius:16px 16px 0 0;padding:20px 20px 40px;width:100%;max-width:480px;margin:0 auto;box-sizing:border-box;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--mg-green)">Hole ${hole}</div>
          <div style="font-size:12px;color:var(--mg-text-muted)">Par ${par}${hcpRank !== null ? ` &nbsp;·&nbsp; HCP ${hcpRank}` : ''} &nbsp;·&nbsp; Enter gross scores</div>
        </div>
        <button onclick="window.MG.closeScoreModal()" style="width:32px;height:32px;border:none;background:var(--mg-border);border-radius:50%;font-size:18px;cursor:pointer;color:var(--mg-text);line-height:1">×</button>
      </div>
      ${holePicker}
      <div>${playerRows}</div>
      <button onclick="window.MG.submitScoreModal()" ${allFilled ? '' : 'disabled'}
        style="width:100%;margin-top:16px;padding:16px;background:${allFilled ? 'var(--mg-green)' : 'var(--mg-border)'};color:${allFilled ? 'var(--text-primary)' : 'var(--mg-text-muted)'};border:none;border-radius:12px;font-size:17px;font-weight:700;cursor:${allFilled ? 'pointer' : 'default'}">
        ${allFilled ? `Save Hole ${hole}` : 'Fill in all scores'}
      </button>
    </div>
  </div>`;
}

// ===== FLIGHTS LIST =====
export function renderFlightsList(state) {
  let html = `<div class="mg-section-title">All Flights</div>`;
  flightOrder().forEach(fId => {
    const flight = F(fId);
    const standings = calcStandings(fId, state.matches);

    html += `<div class="mg-card" style="cursor:pointer" onclick="window.MG.nav('#flight/${fId}')">
      <div class="mg-card-header">${flight.name} <span class="text-xs text-muted">(${flight.tees} Tees)</span></div>
      <table class="mg-standings"><thead><tr><th>#</th><th>Team</th><th>Pts</th></tr></thead><tbody>`;
    standings.forEach((s, i) => {
      const t = T(s.teamId);
      html += `<tr><td class="rank-cell">${i + 1}</td><td>${TN(t)}</td><td>${s.points}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  });
  return html;
}

// ===== FLIGHT DETAIL =====
export function renderFlight(state, flightId) {
  const flight = F(flightId);
  if (!flight) return `<p>Flight not found</p>`;

  const standings = calcStandings(flightId, state.matches);
  const fMatches = Object.values(state.matches).filter(m => m.flight === flightId);

  let html = `<div class="mg-section-title">${flight.name}</div>
    <div class="text-xs text-muted mb-4">${flight.tees} Tees</div>

    <div class="mg-card">
      <div class="mg-card-header">Standings</div>
      <div class="mg-standings-wrap">
      <table class="mg-standings">
        <thead><tr><th>#</th><th>Team</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>R5</th><th>Tot</th></tr></thead>
        <tbody>`;

  standings.forEach((s, i) => {
    const t = T(s.teamId);
    const roundPts = getRoundPoints(s.teamId, flightId, state.matches);
    const isHouse = t.isHouse ? ' style="color:var(--mg-gold-dim)"' : '';
    html += `<tr onclick="window.MG.nav('#team/${s.teamId}')" style="cursor:pointer">
      <td class="rank-cell">${i + 1}</td>
      <td${isHouse}>${TN(t)}${t.isHouse ? " \u{1F451}" : ""}</td>`;
    for (let r = 1; r <= 5; r++) {
      html += `<td>${roundPts[r] !== null ? roundPts[r] : "-"}</td>`;
    }
    html += `<td style="font-weight:700">${s.points}</td></tr>`;
  });

  html += `</tbody></table></div></div>`;

  // Matches by round
  for (let r = 1; r <= 5; r++) {
    const roundMatches = fMatches.filter(m => m.round === r);
    const day = RD(r);
    html += `<div class="mg-section-title mt-4">Round ${r} <span class="text-xs text-muted">(${day} ${RT(r)})</span></div>`;
    roundMatches.forEach(m => {
      html += renderMatchCard(m);
    });
  }

  return html;
}

// ===== TEAM DETAIL =====
export function renderTeam(state, teamId) {
  teamId = parseInt(teamId);
  const team = T(teamId);
  if (!team) return `<p>Team not found</p>`;

  const flight = F(team.flight);
  const standings = calcStandings(team.flight, state.matches);
  const rank = standings.findIndex(s => s.teamId === teamId) + 1;
  const totalPts = standings.find(s => s.teamId === teamId).points;

  let html = `<div class="mg-team-header">
      <div class="mg-team-names">${TF(team)}</div>
      <div class="mg-team-handicaps">${(!team.guest || team.guest === '—') ? `HI: ${team.memberHI}` : `HI: ${team.memberHI} / ${team.guestHI} &bull; Combined: ${team.combined ?? 0}`}</div>
      <div class="text-xs text-muted mt-2">${flight.name} &bull; ${flight.tees} Tees</div>
      ${team.isHouse ? '<div class="mg-house-badge">THE HOUSE</div>' : ''}
    </div>

    <div class="mg-card">
      <div class="flex-between">
        <div>
          <div class="text-xs text-muted">Flight Rank</div>
          <div style="font-size:24px;font-weight:700;color:var(--mg-gold-dim)">#${rank}</div>
        </div>
        <div style="text-align:right">
          <div class="text-xs text-muted">Total Points</div>
          <div style="font-size:24px;font-weight:700;color:var(--mg-green)">${totalPts}</div>
        </div>
      </div>
    </div>`;

  // Team's matches
  html += `<div class="mg-section-title">Matches</div>`;
  const teamMatches = Object.values(state.matches)
    .filter(m => m.teamA === teamId || m.teamB === teamId)
    .sort((a, b) => a.round - b.round);

  teamMatches.forEach(m => {
    const isA = m.teamA === teamId;
    const oppId = isA ? m.teamB : m.teamA;
    const opp = T(oppId);
    const myScore = isA ? m.scoreA : m.scoreB;
    const oppScore = isA ? m.scoreB : m.scoreA;

    let resultClass = "";
    let resultText = "Scheduled";
    if (m.status === "final") {
      if (myScore > oppScore) { resultClass = "win"; resultText = `W ${myScore}-${oppScore}`; }
      else if (myScore < oppScore) { resultClass = "loss"; resultText = `L ${myScore}-${oppScore}`; }
      else { resultClass = "push"; resultText = `T ${myScore}-${oppScore}`; }
    } else if (m.status === "live") {
      resultText = "LIVE";
      resultClass = "";
    }

    // Get moneyline for this matchup
    const { mlA } = getMatchMoneyline(teamId, oppId);
    const myML = mlA === 0 ? "EVEN" : (mlA > 0 ? `+${mlA}` : `${mlA}`);

    html += `<div class="mg-match ${m.status}">
      <div class="mg-match-round">Round ${m.round} &bull; ${RT(m.round)} &bull; ${RD(m.round)}</div>
      <div class="flex-between">
        <div>
          <div style="font-size:13px;font-weight:600">vs ${TN(opp)}</div>
          <div class="text-xs text-muted">HI: ${T(oppId).combined ?? 0} &bull; ML: ${myML}</div>
        </div>
        <div class="mg-bet-result ${resultClass}" style="font-size:16px">${resultText}</div>
      </div>
    </div>`;
  });

  return html;
}

// ===== ADMIN =====
export function renderAdmin(state) {
  if (!state.adminAuthed) {
    return `<div class="mg-admin-pin">
        <div class="mg-section-title">Commissioner Access</div>

        <div id="magic-link-section">
          <p class="text-sm text-muted" style="margin-bottom:12px">Enter your phone or email to receive a login link</p>
          <input type="text" id="magic-contact" placeholder="Phone or email" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:15px;margin-bottom:10px">
          <button class="mg-btn mg-btn-primary" style="width:100%" onclick="window.MG.requestMagicLink()">Send Magic Link</button>
        </div>

        <div id="magic-sent-section" style="display:none">
          <p class="text-sm" style="color:var(--mg-green);margin-bottom:12px;font-weight:600">Check your messages — a login code was sent.</p>
          <input type="text" id="magic-code" maxlength="6" placeholder="Enter 6-character code" autocomplete="off" autocapitalize="characters"
            style="width:100%;padding:14px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:18px;text-align:center;letter-spacing:4px;font-family:monospace;margin-bottom:10px">
          <button class="mg-btn mg-btn-primary" style="width:100%" onclick="window.MG.verifyMagicCode()">Verify Code</button>
          <button class="mg-btn" style="width:100%;margin-top:6px;background:transparent;color:var(--text-secondary);font-size:13px" onclick="window.MG.showMagicLinkForm()">Send again</button>
        </div>

        <div style="margin-top:16px;text-align:center">
          <button id="toggle-pin-btn" style="background:none;border:none;color:var(--text-secondary);font-size:12px;cursor:pointer;text-decoration:underline" onclick="window.MG.togglePinEntry()">Use PIN instead</button>
        </div>

        <div id="pin-section" style="display:none;margin-top:12px">
          <p class="text-sm text-muted" style="margin-bottom:8px">Enter admin PIN</p>
          <input type="tel" id="admin-pin" maxlength="4" placeholder="****" inputmode="numeric">
          <button class="mg-btn mg-btn-primary" style="width:160px;margin-top:8px" onclick="window.MG.checkPin()">Enter</button>
        </div>
      </div>`;
  }

  const adminTab = state._adminTab || "takebet";
  const eventSlug = state._config?.event?.slug || 'event';
  const onboardedKey = `waggle_onboarded_${eventSlug}`;
  const isOnboarded = localStorage.getItem(onboardedKey);

  let html = '';

  // First-time admin onboarding modal
  if (!isOnboarded) {
    html += `<div id="onboard-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:12px;max-width:380px;width:100%;padding:24px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:28px;font-weight:700;color:var(--mg-gold)">W</div>
          <div style="font-size:20px;font-weight:700;color:var(--mg-gold-dim);margin-top:8px">Welcome, Admin</div>
          <p class="text-sm text-muted" style="margin-top:4px">Here's how to run your event in 3 steps</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="background:var(--mg-green);color:var(--bg-primary);font-weight:700;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div>
            <div>
              <div style="font-size:14px;font-weight:600">Set up your games</div>
              <div style="font-size:12px;color:var(--mg-text-muted)">Go to Scorecard tab → assign Vegas teams, set wolf order if needed</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="background:var(--mg-green);color:var(--bg-primary);font-weight:700;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div>
            <div>
              <div style="font-size:14px;font-weight:600">Enter scores hole by hole</div>
              <div style="font-size:12px;color:var(--mg-text-muted)">Scorecard tab → pick a hole → enter gross scores → Save. Odds update live.</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="background:var(--mg-green);color:var(--bg-primary);font-weight:700;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div>
            <div>
              <div style="font-size:14px;font-weight:600">Share the settlement card</div>
              <div style="font-size:12px;color:var(--mg-text-muted)">After round ends → Scores tab → "View Settlement Card" → Share with group</div>
            </div>
          </div>
        </div>
        <button class="mg-btn mg-btn-primary" onclick="window.MG.dismissOnboarding()">Got it — let's play</button>
      </div>
    </div>`;
  }

  html += `<div class="flex-between mb-4">
      <div class="mg-section-title" style="margin-bottom:0">Admin</div>
      <button class="mg-btn mg-btn-outline" style="width:auto;padding:6px 12px;font-size:12px" onclick="window.MG.adminLogout()">Lock</button>
    </div>
    <div class="mg-tabs" style="flex-wrap:wrap">
      <button class="mg-tab ${adminTab === 'takebet' ? 'active' : ''}" onclick="window.MG.setAdminTab('takebet')" style="font-size:11px">Take Bet</button>
      <button class="mg-tab ${adminTab === 'scores' ? 'active' : ''}" onclick="window.MG.setAdminTab('scores')" style="font-size:11px">Scores</button>
      <button class="mg-tab ${adminTab === 'book' ? 'active' : ''}" onclick="window.MG.setAdminTab('book')" style="font-size:11px">Book</button>
      <button class="mg-tab ${adminTab === 'lines' ? 'active' : ''}" onclick="window.MG.setAdminTab('lines')" style="font-size:11px">Lines</button>
      <button class="mg-tab ${adminTab === 'players' ? 'active' : ''}" onclick="window.MG.setAdminTab('players')" style="font-size:11px">Players</button>
      <button class="mg-tab ${adminTab === 'scorecard' ? 'active' : ''}" onclick="window.MG.setAdminTab('scorecard')" style="font-size:11px">Scorecard</button>
      <button class="mg-tab ${adminTab === 'settings' ? 'active' : ''}" onclick="window.MG.setAdminTab('settings')" style="font-size:11px">Settings</button>
    </div>`;

  if (adminTab === "takebet") html += renderAdminTakeBet(state);
  else if (adminTab === "scores") html += renderAdminScores(state);
  else if (adminTab === "book") html += renderAdminBook(state);
  else if (adminTab === "lines") html += renderAdminLines(state);
  else if (adminTab === "players") html += renderAdminPlayers(state);
  else if (adminTab === "scorecard") html += renderAdminScorecard(state);
  else html += renderAdminSettings(state);

  return html;
}

// ─── TAKE BET TAB (Problem 2) ───
function renderAdminTakeBet(state) {
  const tb = state._takeBet || {};
  let html = '';

  // 1. Bettor name with autocomplete
  const allBettors = [...new Set((state._serverBets || []).map(b => b.bettor).filter(Boolean))].sort();
  const allPlayers = (state._allPlayers || []).map(p => p.name);
  const knownNames = [...new Set([...allBettors, ...allPlayers])].sort();
  const nameFilter = (tb.name || '').toLowerCase();
  const suggestions = nameFilter.length >= 2 ? knownNames.filter(n => n.toLowerCase().includes(nameFilter)).slice(0, 6) : [];

  html += `<div class="mg-card" style="padding:12px">
    <label class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:1px">Bettor</label>
    <input type="text" id="tb-name" placeholder="Type name..." value="${escHtml(tb.name || '')}" oninput="window.MG.tbSetName(this.value)" style="width:100%;padding:10px 12px;border:2px solid var(--mg-border);border-radius:8px;font-size:16px;margin-top:4px;font-weight:600">`;
  if (suggestions.length > 0 && !tb.nameConfirmed) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">`;
    suggestions.forEach(n => {
      html += `<button onclick="window.MG.tbPickName('${escHtml(n)}')" style="padding:6px 12px;border:1px solid var(--mg-green);border-radius:6px;background:transparent;color:var(--mg-green);font-size:12px;font-weight:600;cursor:pointer">${escHtml(n)}</button>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // 2. Match picker — current round first
  if (tb.name && tb.name.trim()) {
    const currentRound = state._adminRound || 1;
    const bettable = Object.values(state.matches)
      .filter(m => m.status !== 'final' && !isMatchLocked(m.id))
      .sort((a, b) => {
        // Current round first, then by round
        const aR = a.round === currentRound ? 0 : a.round;
        const bR = b.round === currentRound ? 0 : b.round;
        return aR - bR || a.round - b.round;
      });

    if (!tb.matchId) {
      // Round filter
      html += `<div class="mg-round-selector">`;
      for (let r = 1; r <= 5; r++) {
        const rMatches = bettable.filter(m => m.round === r);
        const active = (state._adminBookRound || currentRound) === r ? "active" : "";
        html += `<button class="mg-round-btn ${active}" onclick="window.MG.setAdminBookRound(${r})" style="font-size:11px">R${r} (${rMatches.length})</button>`;
      }
      html += `</div>`;

      const filteredRound = state._adminBookRound || currentRound;
      const roundMatches = bettable.filter(m => m.round === filteredRound);

      roundMatches.forEach(m => {
        const tA = T(m.teamA), tB = T(m.teamB);
        const { mlA, mlB } = getMatchMoneyline(m.teamA, m.teamB, m.id);
        const fmtMlA = mlA === 0 ? "EVEN" : (mlA > 0 ? `+${mlA}` : `${mlA}`);
        const fmtMlB = mlB === 0 ? "EVEN" : (mlB > 0 ? `+${mlB}` : `${mlB}`);
        const decA = mlToDecimal(mlA);
        const decB = mlToDecimal(mlB);
        const nameA = TN(tA);
        const nameB = TN(tB);

        html += `<div style="display:flex;gap:6px;margin-bottom:6px">
          <button class="mg-odds-btn" onclick="window.MG.tbPickMatch('${m.id}',${m.teamA},'${fmtMlA}',${decA},'${escHtml(nameA)}')" style="flex:1;min-height:52px">
            <div class="odds-label">${nameA}</div>
            <div class="odds-line">${fmtMlA}</div>
          </button>
          <button class="mg-odds-btn" onclick="window.MG.tbPickMatch('${m.id}',${m.teamB},'${fmtMlB}',${decB},'${escHtml(nameB)}')" style="flex:1;min-height:52px">
            <div class="odds-label">${nameB}</div>
            <div class="odds-line">${fmtMlB}</div>
          </button>
        </div>`;
      });
      if (roundMatches.length === 0) {
        html += `<p class="text-sm text-muted" style="text-align:center;padding:12px">No open matches in Round ${filteredRound}</p>`;
      }
    } else {
      // 3. Match selected — show stake input
      const m = state.matches[tb.matchId];
      const selTeam = T(tb.selection);
      const oppId = tb.selection == m.teamA ? m.teamB : m.teamA;
      const oppTeam = T(oppId);
      const selName = TN(selTeam);
      const oppName = TN(oppTeam);
      const toWin = tb.stake ? Math.round(tb.stake * tb.decimalOdds) - tb.stake : 0;

      html += `<div class="mg-card" style="padding:12px">
        <div class="flex-between mb-2">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--mg-green)">${selName} <span style="font-size:18px">${tb.americanOdds}</span></div>
            <div class="text-xs text-muted">vs ${oppName} &bull; ${F(m.flight).name} R${m.round}</div>
          </div>
          <button onclick="window.MG.tbClearMatch()" style="background:transparent;border:1px solid var(--mg-border);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--mg-text-muted)">Change</button>
        </div>

        <label class="text-xs text-muted" style="display:block;margin-top:12px">STAKE</label>
        <div class="mg-preset-amounts" style="margin-top:4px;margin-bottom:6px">
          <button class="mg-preset-btn ${tb.stake === 10 ? 'active' : ''}" onclick="window.MG.tbSetStake(10)">$10</button>
          <button class="mg-preset-btn ${tb.stake === 25 ? 'active' : ''}" onclick="window.MG.tbSetStake(25)">$25</button>
          <button class="mg-preset-btn ${tb.stake === 50 ? 'active' : ''}" onclick="window.MG.tbSetStake(50)">$50</button>
          <button class="mg-preset-btn ${tb.stake === 100 ? 'active' : ''}" onclick="window.MG.tbSetStake(100)">$100</button>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:18px;font-weight:700">$</span>
          <input type="number" id="tb-stake" value="${tb.stake || ''}" oninput="window.MG.tbSetStake(parseInt(this.value)||0)" inputmode="numeric" style="flex:1;padding:10px;border:2px solid var(--mg-border);border-radius:8px;font-size:18px;font-weight:700;text-align:center">
        </div>
        ${tb.stake > 0 ? `<div style="text-align:center;margin-top:6px;font-size:13px;color:var(--mg-gold-dim);font-weight:600">To win $${toWin.toLocaleString()}</div>` : ''}
      </div>`;

      // 5. Confirm button
      if (tb.stake > 0) {
        html += `<button class="mg-btn mg-btn-primary" style="padding:16px;font-size:15px;margin-top:8px" onclick="window.MG.tbPlaceBet()">
          Place $${tb.stake} on ${selName} (${tb.americanOdds}) for ${escHtml(tb.name)}
        </button>`;
      }
    }
  }

  return html;
}

// ─── SCORES TAB (Problem 1 — dense round view) ───
function renderAdminScores(state) {
  let html = "";

  // Round selector (primary)
  html += `<div class="mg-round-selector">`;
  for (let r = 1; r <= 5; r++) {
    const active = (state._adminRound || 1) === r ? "active" : "";
    const roundMatches = Object.values(state.matches).filter(m => m.round === r);
    const finalCount = roundMatches.filter(m => m.status === 'final').length;
    const label = finalCount === roundMatches.length && finalCount > 0 ? `R${r} ✓` : `R${r}`;
    html += `<button class="mg-round-btn ${active}" onclick="window.MG.setAdminRound(${r})" style="font-size:12px;padding:8px 4px">${label}</button>`;
  }
  html += `</div>`;

  const selectedRound = state._adminRound || 1;
  const roundMatches = Object.values(state.matches).filter(m => m.round === selectedRound);
  const allScored = roundMatches.every(m => m.scoreA !== null && m.scoreA !== undefined);
  const allFinal = roundMatches.every(m => m.status === 'final');
  const finalCount = roundMatches.filter(m => m.status === 'final').length;

  // Settle Round button (Problem 7)
  if (!allFinal && allScored) {
    html += `<button class="mg-btn mg-btn-gold" style="margin-bottom:12px;padding:12px" onclick="window.MG.settleRound(${selectedRound})">Settle Round ${selectedRound} (${roundMatches.length - finalCount} remaining)</button>`;
  } else if (allFinal) {
    html += `<div style="text-align:center;padding:8px;margin-bottom:8px;color:var(--mg-win);font-weight:600;font-size:13px">Round ${selectedRound} — All ${roundMatches.length} matches final ✓</div>`;
  }

  // Dense match rows grouped by flight
  flightOrder().forEach(fId => {
    const fMatches = roundMatches.filter(m => m.flight === fId);
    if (fMatches.length === 0) return;

    html += `<div style="padding:4px 0 2px"><span class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:1px;font-weight:600">${F(fId).name.replace(" Flight","")}</span></div>`;

    fMatches.forEach(m => {
      const tA = T(m.teamA), tB = T(m.teamB);
      const nameA = tA.member.split(" ").pop();
      const nameB = tB.member.split(" ").pop();
      const isFinal = m.status === 'final';

      html += `<div style="display:flex;align-items:center;gap:2px;padding:4px 0;border-bottom:1px solid var(--mg-border);${isFinal ? 'opacity:0.6' : ''}">
        <div style="flex:1;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameA}/${tA.guest.split(" ").pop()}</div>
        <div style="display:flex;gap:2px">
          <button class="mg-score-btn ${m.scoreA === 7 && m.scoreB === 3 ? 'selected' : ''}" onclick="window.MG.setScoreFinal('${m.id}',7,3)" style="min-width:36px;min-height:36px;padding:2px;font-size:10px"><span class="score-val" style="font-size:11px">7-3</span></button>
          <button class="mg-score-btn ${m.scoreA === 6 && m.scoreB === 4 ? 'selected' : ''}" onclick="window.MG.setScoreFinal('${m.id}',6,4)" style="min-width:36px;min-height:36px;padding:2px;font-size:10px"><span class="score-val" style="font-size:11px">6-4</span></button>
          <button class="mg-score-btn ${m.scoreA === 5 && m.scoreB === 5 ? 'selected' : ''}" onclick="window.MG.setScoreFinal('${m.id}',5,5)" style="min-width:36px;min-height:36px;padding:2px;font-size:10px"><span class="score-val" style="font-size:11px">5-5</span></button>
          <button class="mg-score-btn ${m.scoreA === 4 && m.scoreB === 6 ? 'selected' : ''}" onclick="window.MG.setScoreFinal('${m.id}',4,6)" style="min-width:36px;min-height:36px;padding:2px;font-size:10px"><span class="score-val" style="font-size:11px">4-6</span></button>
          <button class="mg-score-btn ${m.scoreA === 3 && m.scoreB === 7 ? 'selected' : ''}" onclick="window.MG.setScoreFinal('${m.id}',3,7)" style="min-width:36px;min-height:36px;padding:2px;font-size:10px"><span class="score-val" style="font-size:11px">3-7</span></button>
        </div>
        <div style="flex:1;font-size:11px;font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameB}/${tB.guest.split(" ").pop()}</div>
        <div style="width:18px;text-align:center;font-size:12px">${isFinal ? '✓' : ''}</div>
      </div>`;
    });
  });

  return html;
}

// ─── BOOK TAB (with Danger Board — Problem 5) ───
function renderAdminBook(state) {
  const allBets = (state._serverBets && state._serverBets.length > 0) ? state._serverBets : (state.bets || []);
  const activeBets = allBets.filter(b => b.status === "active");
  const settledBets = allBets.filter(b => b.status !== "active" && b.status !== "voided");

  const totalHandle = allBets.reduce((s, b) => s + (b.stake || 0), 0);
  const maxExposure = activeBets.reduce((s, b) => s + Math.max(0, Math.round(b.stake * b.odds) - b.stake), 0);
  const settledPL = settledBets.reduce((s, b) => {
    if (b.status === "won") return s - (b.payout - b.stake);
    if (b.status === "lost") return s + b.stake;
    return s;
  }, 0);
  const uniqueBettors = new Set(allBets.map(b => (b.bettor || '').toLowerCase())).size;

  let html = "";

  // Summary
  html += `<div class="mg-card">
    <div class="mg-card-header" style="display:flex;align-items:center;gap:8px">
      <span style="font-size:14px">SPORTSBOOK</span>
      <span style="font-size:10px;background:${settledPL >= 0 ? 'var(--mg-win)' : 'var(--mg-loss)'};color:var(--text-primary);padding:2px 8px;border-radius:4px;font-weight:700">${settledPL >= 0 ? 'HOUSE UP' : 'HOUSE DOWN'}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;font-size:11px">
      <div style="text-align:center"><div class="text-xs text-muted">Handle</div><div style="font-weight:700">$${totalHandle.toLocaleString()}</div></div>
      <div style="text-align:center"><div class="text-xs text-muted">Active</div><div style="font-weight:700">${activeBets.length}</div></div>
      <div style="text-align:center"><div class="text-xs text-muted">Exposure</div><div style="font-weight:700;color:var(--mg-loss)">$${maxExposure.toLocaleString()}</div></div>
      <div style="text-align:center"><div class="text-xs text-muted">P&L</div><div style="font-weight:700;color:${settledPL >= 0 ? 'var(--mg-win)' : 'var(--mg-loss)'}">${settledPL >= 0 ? '+' : ''}$${settledPL.toLocaleString()}</div></div>
    </div>
  </div>`;

  // ─── DANGER BOARD (Problem 5) ───
  const matchExposure = {};
  activeBets.forEach(b => {
    if (!b.matchId) return;
    if (!matchExposure[b.matchId]) matchExposure[b.matchId] = { handleA: 0, handleB: 0, handleDraw: 0, total: 0 };
    const me = matchExposure[b.matchId];
    const m = state.matches[b.matchId];
    if (!m) return;
    if (b.selection == m.teamA) me.handleA += b.stake;
    else if (b.selection == m.teamB) me.handleB += b.stake;
    else me.handleDraw += b.stake;
    me.total += b.stake;
  });

  const dangerMatches = Object.entries(matchExposure)
    .filter(([, me]) => me.total > 0)
    .map(([matchId, me]) => {
      const m = state.matches[matchId];
      const maxSide = Math.max(me.handleA, me.handleB);
      const pct = Math.round(100 * maxSide / me.total);
      const heavy = me.handleA > me.handleB ? 'A' : 'B';
      return { matchId, m, me, pct, heavy };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);

  if (dangerMatches.length > 0) {
    html += `<div class="mg-card" style="padding:0;overflow:hidden">
      <div style="padding:8px 14px 4px"><div class="mg-card-header" style="margin:0;padding:0;font-size:13px">DANGER BOARD</div></div>`;
    dangerMatches.forEach(({ m, me, pct, heavy }) => {
      if (!m) return;
      const tA = T(m.teamA), tB = T(m.teamB);
      const nameA = TN(tA);
      const nameB = TN(tB);
      const color = pct > 70 ? 'var(--mg-loss)' : pct > 55 ? 'var(--gold-bright)' : 'var(--mg-win)';
      const heavyName = heavy === 'A' ? nameA : nameB;
      html += `<div style="padding:6px 14px;border-bottom:1px solid var(--mg-border);display:flex;align-items:center;gap:8px">
        <div style="width:40px;font-size:16px;font-weight:800;color:${color};text-align:center">${pct}%</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nameA} vs ${nameB}</div>
          <div style="font-size:10px;color:var(--mg-text-muted)">${heavyName} heavy &bull; $${me.total.toLocaleString()} handle</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // Recent bets
  const recentBets = [...allBets].sort((a, b) => {
    const tA = b.placedAt || b.timestamp || 0;
    const tB = a.placedAt || a.timestamp || 0;
    return tA > tB ? 1 : -1;
  }).slice(0, 10);
  if (recentBets.length > 0) {
    html += `<div class="mg-card" style="padding:0;overflow:hidden">
      <div style="padding:8px 14px 4px"><div class="mg-card-header" style="margin:0;padding:0;font-size:13px">RECENT BETS</div></div>`;
    recentBets.forEach(b => {
      let badge = '';
      if (b.status === 'won') badge = '<span style="color:var(--mg-win);font-weight:700;font-size:10px">W</span>';
      else if (b.status === 'lost') badge = '<span style="color:var(--mg-loss);font-weight:700;font-size:10px">L</span>';
      else if (b.status === 'voided') badge = '<span style="color:var(--text-tertiary);font-size:10px">V</span>';
      html += `<div style="padding:4px 14px;border-bottom:1px solid var(--mg-border);display:flex;align-items:center;gap:6px;font-size:11px">
        <span style="font-weight:600;min-width:60px">${escHtml(b.bettor || '')}</span>
        <span style="flex:1;color:var(--mg-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(b.description || '')}</span>
        <span style="font-weight:700">$${(b.stake||0).toLocaleString()}</span>
        ${badge}
        ${b.status === 'active' ? `<button onclick="window.MG.voidBet('${b.id}')" style="background:var(--mg-loss);color:var(--text-primary);border:none;border-radius:4px;padding:2px 6px;font-size:9px;cursor:pointer">Void</button>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Bettor ledger
  const bettorMap = {};
  allBets.forEach(b => {
    const name = b.bettor || 'Unknown';
    if (!bettorMap[name]) bettorMap[name] = { bets: 0, wagered: 0, settledPL: 0 };
    bettorMap[name].bets++;
    bettorMap[name].wagered += (b.stake || 0);
    if (b.status === "won") bettorMap[name].settledPL -= ((b.payout || 0) - b.stake);
    if (b.status === "lost") bettorMap[name].settledPL += b.stake;
  });
  const bettorEntries = Object.entries(bettorMap).sort((a, b) => b[1].wagered - a[1].wagered);
  if (bettorEntries.length > 0) {
    html += `<div class="mg-card" style="padding:0;overflow:hidden">
      <div style="padding:8px 14px 4px"><div class="mg-card-header" style="margin:0;padding:0;font-size:13px">BETTOR LEDGER</div></div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="border-bottom:2px solid var(--mg-border)">
          <th style="padding:4px 10px;text-align:left;color:var(--mg-text-muted)">Name</th>
          <th style="padding:4px 6px;text-align:center;color:var(--mg-text-muted)">#</th>
          <th style="padding:4px 6px;text-align:right;color:var(--mg-text-muted)">Wagered</th>
          <th style="padding:4px 10px;text-align:right;color:var(--mg-text-muted)">P&L</th>
        </tr></thead><tbody>`;
    bettorEntries.forEach(([name, data]) => {
      const pl = data.settledPL;
      html += `<tr style="border-bottom:1px solid var(--mg-border)">
        <td style="padding:4px 10px;font-weight:600">${escHtml(name)}</td>
        <td style="padding:4px 6px;text-align:center">${data.bets}</td>
        <td style="padding:4px 6px;text-align:right">$${data.wagered.toLocaleString()}</td>
        <td style="padding:4px 10px;text-align:right;font-weight:700;color:${pl >= 0 ? 'var(--mg-win)' : 'var(--mg-loss)'}">${pl >= 0 ? '+' : ''}$${pl.toLocaleString()}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  return html;
}

// ─── PLAYERS TAB (Problem 3) ───
function renderAdminPlayers(state) {
  const players = state._allPlayers || [];
  const allBets = (state._serverBets && state._serverBets.length > 0) ? state._serverBets : (state.bets || []);
  const joinReqs = state._joinRequests || [];

  let html = `<div class="flex-between mb-4">
    <button class="mg-btn mg-btn-outline" style="width:auto;padding:6px 14px;font-size:12px" onclick="window.MG.loadJoinRequests();window.MG.syncNow()">Refresh</button>
    <button class="mg-btn mg-btn-primary" style="width:auto;padding:6px 14px;font-size:12px" onclick="window.MG.adminNewPlayer()">+ Add Player</button>
  </div>`;

  // ── Join Requests section ──
  if (joinReqs.length > 0) {
    html += `<div class="mg-card" style="margin-bottom:16px">
      <div class="mg-card-header" style="margin-bottom:10px">WAITING TO JOIN (${joinReqs.length})</div>`;
    joinReqs.forEach(r => {
      html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--mg-border)">
        <div>
          <div style="font-weight:600;font-size:14px">${escHtml(r.name)}</div>
          <div class="text-xs text-muted">HI ${r.hi}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="window.MG.approveJoin('${r.id}','${escHtml(r.name)}')" style="background:var(--mg-green);color:var(--text-primary);border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Approve</button>
          <button onclick="window.MG.rejectJoin('${r.id}')" style="background:transparent;color:var(--mg-text-muted);border:1px solid var(--mg-border);border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer">Reject</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (players.length === 0) {
    html += `<p class="text-sm text-muted" style="text-align:center;padding:20px">No players registered. Add players or run create-players.sh</p>`;
  } else {
    html += `<div class="mg-card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="border-bottom:2px solid var(--mg-border)">
          <th style="padding:6px 10px;text-align:left;color:var(--mg-text-muted)">Player</th>
          <th style="padding:6px 6px;text-align:right;color:var(--mg-text-muted)">Credits</th>
          <th style="padding:6px 6px;text-align:right;color:var(--mg-text-muted)">Wagered</th>
          <th style="padding:6px 6px;text-align:center;color:var(--mg-text-muted)">Bets</th>
          <th style="padding:6px 10px;text-align:center;color:var(--mg-text-muted)">+/-</th>
        </tr></thead><tbody>`;
    players.sort((a, b) => (b.credits || 0) - (a.credits || 0)).forEach(p => {
      const pBets = allBets.filter(b => (b.bettor || '').toLowerCase() === (p.name || '').toLowerCase());
      const active = pBets.filter(b => b.status === 'active').length;
      html += `<tr style="border-bottom:1px solid var(--mg-border)">
        <td style="padding:6px 10px;font-weight:600">${escHtml(p.name || '')}</td>
        <td style="padding:6px 6px;text-align:right;font-weight:700;color:var(--mg-gold-dim)">$${(p.credits || 0).toLocaleString()}</td>
        <td style="padding:6px 6px;text-align:right">$${(p.totalWagered || 0).toLocaleString()}</td>
        <td style="padding:6px 6px;text-align:center">${pBets.length}${active > 0 ? ` (${active})` : ''}</td>
        <td style="padding:6px 10px;text-align:center"><button onclick="window.MG.adminAddCredits('${escHtml(p.name)}')" style="background:var(--mg-green);color:var(--text-primary);border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">+/-</button></td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  // Bulk Import Players
  html += `<div class="mg-card" style="padding:16px;margin-top:12px">
    <div class="mg-card-header">Bulk Import Players</div>
    <p style="font-size:12px;color:var(--mg-text-muted);margin-bottom:8px">Name, Handicap, @Venmo (optional) — one per line</p>
    <textarea id="bulk-players-input" style="width:100%;min-height:100px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box" placeholder="Tiger Woods, 0.6, @tigerwoods\nRory McIlroy, -1.2"></textarea>
    <button class="mg-btn mg-btn-primary" style="margin-top:8px" onclick="window.MG.bulkImportPlayers()">Import Players</button>
  </div>`;

  return html;
}

function renderAdminLines(state) {
  const allBets = (state._serverBets && state._serverBets.length > 0) ? state._serverBets : (state.bets || []);

  // Round tabs
  let html = `<div class="mg-round-selector">`;
  for (let r = 1; r <= 5; r++) {
    const active = (state._adminBookRound || 1) === r ? "active" : "";
    html += `<button class="mg-round-btn ${active}" onclick="window.MG.setAdminBookRound(${r})">R${r}</button>`;
  }
  html += `</div>`;

  html += renderLineBoard(state, state._adminBookRound || 1, allBets);
  return html;
}

// ─── LINE MANAGEMENT BOARD (per round) ───
function renderLineBoard(state, round, allBets) {
  const roundMatches = Object.values(state.matches).filter(m => m.round === round);
  const overrides = (state.settings && state.settings.oddsOverrides) || {};
  const lockedArr = (state.settings && state.settings.lockedMatches) || [];

  // Pre-compute bets by matchId
  const betsByMatch = {};
  allBets.forEach(b => {
    if (!b.matchId) return;
    if (!betsByMatch[b.matchId]) betsByMatch[b.matchId] = [];
    betsByMatch[b.matchId].push(b);
  });

  let html = '<div style="padding:8px 0">';

  // Group by flight for cleaner display
  flightOrder().forEach(fId => {
    const fMatches = roundMatches.filter(m => m.flight === fId);
    if (fMatches.length === 0) return;

    html += `<div style="padding:4px 14px 2px"><div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:1px;font-weight:600">${F(fId).name}</div></div>`;

    fMatches.forEach(m => {
      const tA = T(m.teamA), tB = T(m.teamB);
      const { mlA, mlB } = getMatchMoneyline(m.teamA, m.teamB, m.id);
      const fmtMlA = mlA === 0 ? "EVEN" : (mlA > 0 ? `+${mlA}` : `${mlA}`);
      const fmtMlB = mlB === 0 ? "EVEN" : (mlB > 0 ? `+${mlB}` : `${mlB}`);
      const hasOverride = !!overrides[m.id];
      const locked = lockedArr.includes(m.id);
      const isFinal = m.status === "final";

      const nameA = TN(tA);
      const nameB = TN(tB);

      // Bet analysis for this match
      const matchBets = betsByMatch[m.id] || [];
      const activeMB = matchBets.filter(b => b.status === "active");
      let handleA = 0, handleB = 0, handleDraw = 0;
      let countA = 0, countB = 0, countDraw = 0;
      activeMB.forEach(b => {
        if (b.selection == m.teamA) { handleA += b.stake; countA++; }
        else if (b.selection == m.teamB) { handleB += b.stake; countB++; }
        else if (b.selection === "draw") { handleDraw += b.stake; countDraw++; }
      });
      const totalMatchHandle = handleA + handleB + handleDraw;
      const pctA = totalMatchHandle > 0 ? Math.round(100 * handleA / totalMatchHandle) : 0;
      const pctB = totalMatchHandle > 0 ? Math.round(100 * handleB / totalMatchHandle) : 0;

      // Exposure indicator color
      let exposureColor = 'var(--mg-win)'; // balanced (green)
      let exposureLabel = 'Balanced';
      if (totalMatchHandle > 0) {
        const maxPct = Math.max(pctA, pctB);
        if (maxPct > 70) { exposureColor = 'var(--mg-loss)'; exposureLabel = pctA > pctB ? nameA + ' heavy' : nameB + ' heavy'; }
        else if (maxPct > 55) { exposureColor = 'var(--gold-bright)'; exposureLabel = pctA > pctB ? nameA + ' leaning' : nameB + ' leaning'; }
      } else {
        exposureLabel = 'No action';
        exposureColor = 'var(--mg-text-muted)';
      }

      // Match status overlay
      let statusTag = '';
      if (isFinal) statusTag = '<span style="background:var(--text-tertiary);color:var(--text-primary);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:6px">FINAL</span>';
      else if (m.status === 'live') statusTag = '<span style="background:var(--mg-loss);color:var(--text-primary);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:6px;animation:pulse 1.5s infinite">LIVE</span>';
      if (locked) statusTag += '<span style="background:var(--loss);color:var(--text-primary);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:4px">LOCKED</span>';
      if (hasOverride) statusTag += '<span style="background:#8b5cf6;color:var(--text-primary);padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:4px">MOVED</span>';

      html += `<div style="margin:0 10px 8px;padding:10px 12px;border:1px solid ${locked ? 'var(--loss)' : 'var(--mg-border)'};border-radius:10px;background:${isFinal ? 'var(--border)' : locked ? 'rgba(248,81,73,0.05)' : 'var(--mg-card-bg)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:11px;color:var(--mg-text-muted)">P${m.pairing}${statusTag}</div>
          <div style="display:flex;gap:4px">
            ${!isFinal ? `<button onclick="window.MG.lockMatch('${m.id}')" style="background:${locked ? 'var(--loss)' : 'transparent'};color:${locked ? 'var(--text-primary)' : 'var(--mg-text-muted)'};border:1px solid ${locked ? 'var(--loss)' : 'var(--mg-border)'};border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">${locked ? 'Unlock' : 'Lock'}</button>` : ''}
            ${hasOverride && !isFinal ? `<button onclick="window.MG.resetLine('${m.id}')" style="background:transparent;color:#8b5cf6;border:1px solid #8b5cf6;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">Reset</button>` : ''}
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
          <div style="flex:1;text-align:center">
            <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nameA}</div>
            <div style="font-size:18px;font-weight:800;color:var(--mg-green);margin:2px 0">${fmtMlA}</div>
            <div class="text-xs text-muted">${countA} bet${countA !== 1 ? 's' : ''} &bull; $${handleA.toLocaleString()}</div>
          </div>
          <div style="text-align:center;padding:0 4px">
            <div style="font-size:10px;font-weight:600;color:var(--mg-text-muted)">VS</div>
            ${totalMatchHandle > 0 ? `<div style="font-size:10px;margin-top:2px;color:${exposureColor};font-weight:600">${pctA}%-${pctB}%</div>` : ''}
          </div>
          <div style="flex:1;text-align:center">
            <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nameB}</div>
            <div style="font-size:18px;font-weight:800;color:var(--mg-green);margin:2px 0">${fmtMlB}</div>
            <div class="text-xs text-muted">${countB} bet${countB !== 1 ? 's' : ''} &bull; $${handleB.toLocaleString()}</div>
          </div>
        </div>

        ${totalMatchHandle > 0 ? `<div style="margin-top:6px">
          <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;background:var(--mg-border)">
            <div style="width:${pctA}%;background:var(--mg-green);transition:width 0.3s"></div>
            <div style="width:${100 - pctA - pctB}%;background:var(--gold-bright)"></div>
            <div style="width:${pctB}%;background:#3b82f6;transition:width 0.3s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:2px">
            <span class="text-xs text-muted">${nameA} ${pctA}%</span>
            ${handleDraw > 0 ? `<span class="text-xs text-muted">Draw $${handleDraw.toLocaleString()}</span>` : ''}
            <span class="text-xs text-muted">${nameB} ${pctB}%</span>
          </div>
          <div style="text-align:center;margin-top:4px"><span style="font-size:10px;color:${exposureColor};font-weight:600">${exposureLabel}</span></div>
        </div>` : ''}

        ${!isFinal && !locked ? `<div style="margin-top:8px;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
          <div style="display:flex;gap:2px;align-items:center">
            <span class="text-xs text-muted" style="width:30px;text-align:right;font-size:9px">${nameA.split('/')[0]}</span>
            <button onclick="window.MG.moveLine('${m.id}','A',-50)" style="background:var(--mg-card-bg);border:1px solid var(--mg-border);border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;color:var(--mg-text)">-50</button>
            <button onclick="window.MG.moveLine('${m.id}','A',-25)" style="background:var(--mg-card-bg);border:1px solid var(--mg-border);border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;color:var(--mg-text)">-25</button>
            <button onclick="window.MG.moveLine('${m.id}','A',-10)" style="background:var(--mg-card-bg);border:1px solid var(--mg-border);border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;color:var(--mg-text)">-10</button>
            <button onclick="window.MG.moveLine('${m.id}','A',10)" style="background:var(--mg-card-bg);border:1px solid var(--mg-border);border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;color:var(--mg-text)">+10</button>
            <button onclick="window.MG.moveLine('${m.id}','A',25)" style="background:var(--mg-card-bg);border:1px solid var(--mg-border);border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;color:var(--mg-text)">+25</button>
            <button onclick="window.MG.moveLine('${m.id}','A',50)" style="background:var(--mg-card-bg);border:1px solid var(--mg-border);border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;color:var(--mg-text)">+50</button>
          </div>
        </div>` : ''}
      </div>`;
    });
  });

  html += '</div>';
  return html;
}

// ─── SCRAMBLE HELPERS ───
function deriveScrambleTeams(config) {
  if (config?.scrambleTeams?.length > 0) return config.scrambleTeams;
  const players = (config?.players || config?.roster || []).map(p => p.name || p.member).filter(Boolean);
  if (players.length <= 1) return players.map(n => ({ name: n }));
  const teams = [];
  for (let i = 0; i < players.length; i += 2) {
    if (i + 1 < players.length) {
      teams.push({ name: `${players[i]} / ${players[i+1]}` });
    } else {
      teams.push({ name: players[i] });
    }
  }
  return teams;
}

// ─── SCRAMBLE SCORE ENTRY (admin panel) ───
function renderScrambleScoreEntry(state) {
  const config = state._config;
  const holes = state._holes || {};
  const gameState = state._gameState;
  const holesPerRound = config?.holesPerRound || 18;
  const holeNum = state._scorecardHole || 1;
  const teams = deriveScrambleTeams(config);
  const pars = getCoursePars(config);
  const par = pars[holeNum - 1] || 4;

  // Get pending scramble scores from state
  const pendingScores = state._scrambleScores || {};

  let html = '';

  // Hole selector
  html += `<div class="mg-card" style="padding:12px">
    <div class="mg-card-header" style="margin-bottom:8px">SCRAMBLE — HOLE ${holeNum}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">`;
  for (let h = 1; h <= holesPerRound; h++) {
    const hasScore = !!(holes[h]?.scores || holes[h]);
    const isActive = h === holeNum;
    html += `<button onclick="window.MG.setScorecardHole(${h})"
      style="width:36px;height:36px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;
      border:2px solid ${isActive ? 'var(--mg-green)' : hasScore ? 'var(--mg-gold-dim)' : 'var(--mg-border)'};
      background:${isActive ? 'var(--mg-green)' : hasScore ? 'rgba(212,160,23,0.15)' : 'var(--mg-surface)'};
      color:${isActive ? 'var(--text-primary)' : 'var(--mg-text)'}">${h}</button>`;
  }
  html += `</div></div>`;

  // Score entry per team
  html += `<div class="mg-card" style="padding:16px">
    <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:12px">Par ${par} &middot; Enter gross score per team</div>`;

  // Get existing scores for this hole (already saved to server)
  const existingHole = holes[holeNum];
  const existingScores = existingHole?.scores || existingHole || {};

  teams.forEach(team => {
    const teamName = team.name || team;
    // Pending score overrides existing; show existing if no pending
    const currentScore = pendingScores[teamName] ?? existingScores[teamName];
    const scores = [par - 2, par - 1, par, par + 1, par + 2, par + 3];
    const labels = ['Eagle', 'Birdie', 'Par', 'Bogey', 'Dbl', '+3'];

    html += `<div style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:var(--mg-text);margin-bottom:8px">${escHtml(teamName)}</div>
      <div style="display:flex;gap:6px">`;

    scores.forEach((s, i) => {
      const selected = currentScore === s;
      html += `<button onclick="window.MG.setScrambleScore('${escHtml(teamName).replace(/'/g, "\\'")}',${s})"
        style="flex:1;min-height:48px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;
        border:2px solid ${selected ? 'var(--mg-gold)' : 'var(--mg-border)'};
        background:${selected ? 'var(--mg-gold)' : 'var(--mg-surface)'};
        color:${selected ? 'var(--mg-green)' : 'var(--mg-text)'};
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
        <span>${s}</span>
        <span style="font-size:9px;font-weight:500;opacity:.6">${labels[i]}</span>
      </button>`;
    });

    html += `</div></div>`;
  });

  // Submit button
  html += `<button class="mg-btn mg-btn-gold" onclick="window.MG.submitScrambleHole(${holeNum})" style="width:100%">Save Hole ${holeNum}</button>`;
  html += `</div>`;

  // Live leaderboard
  if (gameState?.scramble?.leaderboard?.length > 0) {
    html += `<div class="mg-card" style="padding:16px">
      <div class="mg-card-header" style="margin-bottom:10px">LIVE LEADERBOARD</div>`;
    gameState.scramble.leaderboard.forEach((entry, i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--mg-border)">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="scramble-position" style="color:${i === 0 ? 'var(--mg-gold)' : 'var(--mg-text-muted)'}">${entry.position}</span>
          <span style="font-size:14px;font-weight:${i === 0 ? '700' : '500'}">${escHtml(entry.team)}</span>
        </div>
        <span class="scramble-total" style="color:${i === 0 ? 'var(--mg-gold)' : 'var(--mg-text)'}">${entry.total}</span>
      </div>`;
    });
    html += `</div>`;
  }

  return html;
}

// ─── SCORECARD TAB (admin score entry) ───
function renderAdminScorecard(state) {
  const config = state._config;
  // Scramble mode: enter one score per team, not per player
  if (config?.games?.scramble) {
    return renderScrambleScoreEntry(state);
  }
  const players = getPlayersFromConfig(config);
  const playerNames = players.map(p => p.name);
  const holeNum = state._scorecardHole || 1;
  const holes = state._holes || {};
  const gameState = state._gameState;
  const holesPerRound = config?.holesPerRound || 18;
  const games = config?.games || {};

  // Wolf rotation order: use config.wolfOrder if set, otherwise roster order
  const wolfOrder = (config?.wolfOrder || playerNames).filter(n => playerNames.includes(n));
  const expectedWolf = wolfOrder.length > 0 ? wolfOrder[(holeNum - 1) % wolfOrder.length] : null;

  // Wolf picks for this hole
  const wolfPicks = gameState?.wolf?.picks || {};
  const wolfPick = wolfPicks[holeNum];

  // Vegas team assignment from game state
  const vegasTeamA = state._vegasTeamA ?? gameState?.vegas?.teamA ?? [];
  const vegasTeamB = state._vegasTeamB ?? gameState?.vegas?.teamB ?? [];
  const vegasAssigned = vegasTeamA.length > 0 || vegasTeamB.length > 0;

  // ── Dispute banners (if any open) ──
  let html = '';
  const disputes = state._disputes || [];
  const openDisputes = disputes.filter(d => d.status === 'open');
  if (openDisputes.length > 0) {
    html += `<div style="margin-bottom:12px">`;
    openDisputes.forEach(d => {
      html += `<div class="dispute-banner">
        <div class="dispute-icon">\u26A0\uFE0F</div>
        <div class="dispute-body">
          <div class="dispute-title">Score Dispute — Hole ${d.hole}: ${escHtml(d.player)}</div>
          <div class="dispute-desc">Server: ${d.serverScore ?? '?'} &middot; Claimed: ${d.claimedScore}${d.reason ? ' &mdash; ' + escHtml(d.reason) : ''}</div>
          <div class="dispute-actions">
            <button class="dispute-btn accept" onclick="window.MG.resolveDispute('${d.id}','accept')">Accept ${d.claimedScore}</button>
            <button class="dispute-btn override" onclick="window.MG.resolveDispute('${d.id}','reject')">Keep ${d.serverScore ?? 'current'}</button>
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Hole selector ──
  html += `<div class="mg-card" style="padding:12px">
    <div class="mg-card-header" style="margin-bottom:8px">HOLE SELECTOR</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">`;
  for (let h = 1; h <= holesPerRound; h++) {
    const hasScore = !!holes[h];
    const isActive = h === holeNum;
    html += `<button onclick="window.MG.setScorecardHole(${h})"
      style="width:36px;height:36px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;
      border:2px solid ${isActive ? 'var(--mg-green)' : hasScore ? 'var(--mg-gold-dim)' : 'var(--mg-border)'};
      background:${isActive ? 'var(--mg-green)' : hasScore ? 'rgba(212,160,23,0.15)' : 'var(--mg-surface)'};
      color:${isActive ? 'var(--text-primary)' : 'var(--mg-text)'}">${h}</button>`;
  }
  html += `</div></div>`;

  // ── Vegas Teams Setup (shown when vegas is enabled) ──
  if (games.vegas) {
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">VEGAS TEAMS
        ${vegasAssigned ? `<span style="font-size:11px;color:var(--mg-green);font-weight:400;margin-left:8px">✓ Assigned</span>` : `<span style="font-size:11px;color:var(--gold-bright);font-weight:400;margin-left:8px">Not set — assign before Round 1</span>`}
      </div>`;
    if (players.length >= 2) {
      const tA = vegasTeamA.length > 0 ? vegasTeamA : playerNames.slice(0, Math.ceil(playerNames.length / 2));
      const tB = vegasTeamB.length > 0 ? vegasTeamB : playerNames.slice(Math.ceil(playerNames.length / 2));
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--mg-gold);margin-bottom:6px;text-transform:uppercase">Team A</div>
          ${tA.map(n => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(212,160,23,0.12);border-radius:6px;margin-bottom:4px;font-size:12px;font-weight:500">
            <span>${escHtml(n)}</span>
            <button onclick="window.MG.vegasMovePlayer('${escHtml(n)}','B')" style="border:none;background:none;color:var(--mg-text-muted);cursor:pointer;font-size:11px;padding:0 2px" title="Move to Team B">→</button>
          </div>`).join('')}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--mg-green);margin-bottom:6px;text-transform:uppercase">Team B</div>
          ${tB.map(n => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(63,185,80,0.1);border-radius:6px;margin-bottom:4px;font-size:12px;font-weight:500">
            <button onclick="window.MG.vegasMovePlayer('${escHtml(n)}','A')" style="border:none;background:none;color:var(--mg-text-muted);cursor:pointer;font-size:11px;padding:0 2px" title="Move to Team A">←</button>
            <span>${escHtml(n)}</span>
          </div>`).join('')}
        </div>
      </div>
      <button class="mg-btn mg-btn-primary" style="width:auto;padding:8px 16px;font-size:13px" onclick="window.MG.saveVegasTeams()">Save Teams</button>`;
    } else {
      html += `<div style="font-size:13px;color:var(--mg-text-muted)">Need at least 2 players for Vegas.</div>`;
    }
    html += `</div>`;
  }

  // ── Wolf Pick Card ──
  if (games.wolf) {
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:4px">WOLF — HOLE ${holeNum}</div>`;

    // Wolf rotation order display
    if (wolfOrder.length > 0) {
      html += `<div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:10px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">
        <span>Order:</span>`;
      wolfOrder.forEach((name, i) => {
        const isExpected = name === expectedWolf;
        html += `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:${isExpected?700:400};
          background:${isExpected?'var(--mg-gold)':'var(--mg-surface)'};
          color:${isExpected?'var(--bg-primary)':'var(--mg-text-muted)'};
          border:1px solid ${isExpected?'var(--mg-gold)':'var(--mg-border)'}">${escHtml(name.split(' ').pop())}${isExpected?' ★':''}</span>`;
      });
      html += `</div>`;
    }

    if (wolfPick) {
      // Already picked — show result with edit option
      html += `<div style="background:rgba(212,160,23,0.1);border:1px solid var(--mg-gold-dim);border-radius:8px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:13px">Wolf: <strong style="color:var(--mg-gold)">${escHtml(wolfPick.wolf)}</strong>`;
      if (wolfPick.partner) html += ` &nbsp;+&nbsp; Partner: <strong style="color:var(--mg-green)">${escHtml(wolfPick.partner)}</strong>`;
      else html += ` &nbsp;<span style="color:var(--gold-bright);font-size:12px">(Lone wolf)</span>`;
      html += `</div></div>
      <button class="mg-btn mg-btn-outline" style="width:auto;padding:6px 12px;font-size:12px" onclick="window.MG._wolfEditMode=true;window.MG.refresh()">Edit Pick</button>`;
    } else {
      // Wolf picker UI
      html += `<div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:8px">
        ${expectedWolf ? `Suggested wolf: <strong style="color:var(--mg-gold)">${escHtml(expectedWolf)}</strong> — tap to confirm or pick another` : 'Select wolf:'}
      </div>`;

      // Wolf buttons
      html += `<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--mg-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Wolf</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="wolf-sel-row">`;
      players.forEach(p => {
        const isExpected = p.name === expectedWolf;
        const isSelected = `window.MG._wolfSelWolf==='${escHtml(p.name)}'`;
        html += `<button
          id="wbtn-${escHtml(p.name.replace(/\s+/g,'_'))}"
          onclick="window.MG._wolfSelWolf='${escHtml(p.name)}';document.querySelectorAll('[id^=wbtn-]').forEach(b=>{b.style.background='';b.style.color='';b.style.borderColor=''});this.style.background='var(--mg-gold)';this.style.color='var(--bg-primary)';this.style.borderColor='var(--mg-gold)'"
          style="padding:7px 12px;border:2px solid ${isExpected?'var(--mg-gold)':'var(--mg-border)'};border-radius:8px;background:${isExpected?'rgba(212,160,23,0.15)':'var(--mg-surface)'};color:var(--mg-text);cursor:pointer;font-size:13px;font-weight:${isExpected?700:400}">
          ${escHtml(p.name.split(' ').pop())}${isExpected?' ★':''}
        </button>`;
      });
      html += `</div></div>`;

      // Partner buttons
      html += `<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--mg-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Partner <span style="font-weight:400">(skip = lone wolf)</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button onclick="window.MG._wolfSelPartner=null;document.querySelectorAll('[id^=pbtn-]').forEach(b=>{b.style.background='';b.style.borderColor=''});this.style.background='rgba(240,192,64,0.2)';this.style.borderColor='var(--gold-bright)'"
            id="pbtn-none"
            style="padding:7px 12px;border:2px solid var(--gold-bright);border-radius:8px;background:rgba(240,192,64,0.2);color:var(--mg-text);cursor:pointer;font-size:13px">
            Lone wolf
          </button>`;
      players.forEach(p => {
        html += `<button
          id="pbtn-${escHtml(p.name.replace(/\s+/g,'_'))}"
          onclick="window.MG._wolfSelPartner='${escHtml(p.name)}';document.querySelectorAll('[id^=pbtn-]').forEach(b=>{b.style.background='';b.style.borderColor=''});this.style.background='var(--mg-green)';this.style.borderColor='var(--mg-green)'"
          style="padding:7px 12px;border:2px solid var(--mg-border);border-radius:8px;background:var(--mg-surface);color:var(--mg-text);cursor:pointer;font-size:13px">
          ${escHtml(p.name.split(' ').pop())}
        </button>`;
      });
      html += `</div></div>
      <button class="mg-btn mg-btn-primary" style="width:auto;padding:9px 20px"
        onclick="if(window.MG._wolfSelWolf){window.MG.setWolfPick(${holeNum},window.MG._wolfSelWolf,window.MG._wolfSelPartner===undefined?null:window.MG._wolfSelPartner)}else{window.MG.toast('Tap a wolf first')}">
        Confirm Wolf Pick
      </button>`;
    }
    html += `</div>`;
  }

  // ── Score entry grid ──
  html += `<div class="mg-card" style="padding:12px">
    <div class="mg-card-header" style="margin-bottom:10px">GROSS SCORES — HOLE ${holeNum}</div>`;

  if (players.length === 0) {
    html += `<div style="color:var(--mg-text-muted);font-size:13px;padding:8px 0">No players in event config. Check that roster was saved during event creation.</div>`;
  } else {
    const pending = state._scorecardScores || {};
    const existing = (holes[holeNum] && holes[holeNum].scores) ? holes[holeNum].scores : (holes[holeNum] || {});
    html += `<div style="display:flex;flex-direction:column;gap:10px">`;
    players.forEach(p => {
      const curVal = pending[p.name] ?? existing[p.name] ?? '';
      const isWolf = wolfPick?.wolf === p.name;
      const isPartner = wolfPick?.partner === p.name;
      html += `<div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;font-size:14px;font-weight:${isWolf?700:500}">
          ${escHtml(p.name)}
          ${isWolf ? `<span style="font-size:10px;background:var(--mg-gold);color:var(--bg-primary);border-radius:4px;padding:1px 5px;margin-left:4px">WOLF</span>` : ''}
          ${isPartner ? `<span style="font-size:10px;background:var(--mg-green);color:var(--text-primary);border-radius:4px;padding:1px 5px;margin-left:4px">PARTNER</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--mg-text-muted)">+${p.handicapIndex ?? 0}</div>
        <input type="number" min="1" max="15" inputmode="numeric" value="${curVal}"
          style="width:62px;padding:8px 4px;border:2px solid var(--mg-border);border-radius:8px;font-size:18px;text-align:center;background:var(--mg-surface);color:var(--mg-text);font-weight:700"
          onchange="window.MG.setScorecardScore('${escHtml(p.name)}',this.value)"
          oninput="window.MG.setScorecardScore('${escHtml(p.name)}',this.value)"
          placeholder="—">
      </div>`;
    });
    html += `</div>
    <button class="mg-btn mg-btn-primary" style="margin-top:14px" onclick="window.MG.submitHoleScores()">&#10003; Save Hole ${holeNum}</button>`;
  }
  html += `</div>`;

  // Live game summary (admin can see press buttons)
  if (gameState) {
    html += renderGameSummaryCards(gameState, games, holes, true);
  }

  return html;
}

// ===== SCORECARD (public tab — read-only live view) =====
export function renderScorecard(state) {
  const holes = state._holes || {};
  const gameState = state._gameState;
  const config = state._config;
  const games = config?.games || {};
  const players = getPlayersFromConfig(config);
  const holesPerRound = config?.holesPerRound || 18;
  const activeDay = state._scorecardDay || 1;

  // Stale data banner
  let staleHtml = '';
  if (state._lastSyncAt) {
    const ageMs = Date.now() - state._lastSyncAt;
    const ageMins = Math.floor(ageMs / 60000);
    if (ageMins >= 5) {
      staleHtml = `<div style="background:var(--bg-secondary);border:1px solid var(--gold-bright);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--gold-bright);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span>⚠</span><span>Last updated ${ageMins} min ago — tap to refresh</span>
        <button onclick="window.MG.refresh()" style="margin-left:auto;background:var(--gold-bright);color:var(--bg-primary);border:none;border-radius:5px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer">Refresh</button>
      </div>`;
    }
  }

  let html = `<div class="mg-section-title">Live Scorecard</div>${staleHtml}`;

  if (Object.keys(holes).length === 0) {
    html += `<div class="mg-card" style="text-align:center;padding:32px 20px">
      <div style="font-size:36px;margin-bottom:12px">&#9971;</div>
      <div style="font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:4px">Round Not Started</div>
      <p class="text-sm text-muted">Scores will appear here once the admin enters hole results</p>
    </div>`;
    return html;
  }

  const maxHole = Math.max(...Object.keys(holes).map(Number));
  const totalRounds = Math.ceil(maxHole / holesPerRound);

  // Multi-day tabs (only show if more than 1 round has data)
  if (totalRounds > 1) {
    html += `<div class="mg-tabs" style="margin-bottom:8px">`;
    for (let d = 1; d <= totalRounds; d++) {
      const dayStart = (d - 1) * holesPerRound + 1;
      const dayEnd = d * holesPerRound;
      const hasData = Object.keys(holes).some(h => parseInt(h) >= dayStart && parseInt(h) <= dayEnd);
      const dayLabel = config?.event?.dates?.[`day${d}`] ? `Day ${d} (${config.event.dates[`day${d}`]})` : `Day ${d}`;
      html += `<button class="mg-tab ${activeDay === d ? 'active' : ''}" onclick="window.MG.setScorecardDay(${d})" style="font-size:12px">${dayLabel}</button>`;
    }
    html += `</div>`;
  }

  // Compute hole range for current day
  const dayStart = (activeDay - 1) * holesPerRound + 1;
  const dayEnd = activeDay * holesPerRound;
  const dayHoles = Object.fromEntries(
    Object.entries(holes).filter(([h]) => parseInt(h) >= dayStart && parseInt(h) <= dayEnd)
  );
  const holesPlayed = Object.keys(dayHoles).length;

  // Hole-by-hole score grid
  html += `<div class="mg-card" style="padding:12px;overflow-x:auto">
    <div class="mg-card-header" style="margin-bottom:8px">GROSS SCORES${totalRounds > 1 ? ` — DAY ${activeDay}` : ''}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr>
          <th style="text-align:left;padding:4px 6px;color:var(--mg-text-muted)">Player</th>`;
  for (let h = dayStart; h <= Math.min(dayEnd, Math.max(dayStart + 8, dayStart + holesPlayed - 1)); h++) {
    html += `<th style="padding:4px 4px;text-align:center;color:var(--mg-text-muted);min-width:26px">${h - dayStart + 1}</th>`;
  }
  html += `<th style="padding:4px 6px;text-align:center;font-weight:700;color:var(--mg-gold)">TOT</th>
        </tr>
      </thead><tbody>`;

  players.forEach(p => {
    const name = p.name;
    let total = 0;
    html += `<tr style="border-top:1px solid var(--mg-border)">
      <td style="padding:6px 6px;font-weight:500">${escHtml(name.split(' ').pop())}</td>`;
    for (let h = dayStart; h <= Math.min(dayEnd, Math.max(dayStart + 8, dayStart + holesPlayed - 1)); h++) {
      const hData = holes[h];
      const gross = hData?.scores?.[name] ?? hData?.[name] ?? null;
      if (gross) total += gross;
      html += `<td style="padding:4px;text-align:center;${gross ? 'font-weight:600' : 'color:var(--mg-text-muted)'}">${gross || '·'}</td>`;
    }
    html += `<td style="padding:6px;text-align:center;font-weight:700;color:var(--mg-gold)">${total || '—'}</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;

  // Round-by-round comparison (only for multi-day)
  if (totalRounds > 1 && players.length > 0) {
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">ROUND COMPARISON (Gross Total)</div>
      <div style="display:grid;grid-template-columns:1fr ${Array.from({length:totalRounds},(_,i)=>`auto`).join(' ')} auto;gap:6px;font-size:11px;color:var(--mg-text-muted);margin-bottom:6px">
        <span>Player</span>${Array.from({length:totalRounds},(_,i)=>`<span style="text-align:center">R${i+1}</span>`).join('')}<span style="text-align:center">Total</span>
      </div>`;

    // Sort by total gross
    const sorted = players.map(p => {
      const rounds = Array.from({length: totalRounds}, (_, d) => {
        let t = 0;
        const s = (d) * holesPerRound + 1;
        const e = (d + 1) * holesPerRound;
        for (let h = s; h <= e; h++) {
          const hData = holes[h];
          const g = hData?.scores?.[p.name] ?? hData?.[p.name] ?? 0;
          t += g;
        }
        return t;
      });
      return { name: p.name, rounds, total: rounds.reduce((a,b)=>a+b,0) };
    }).sort((a,b) => a.total - b.total);

    sorted.forEach((row, i) => {
      html += `<div style="display:grid;grid-template-columns:1fr ${Array.from({length:totalRounds},()=>'auto').join(' ')} auto;gap:6px;padding:5px 0;border-bottom:1px solid var(--mg-border);align-items:center">
        <span style="font-size:13px;font-weight:${i===0?'700':'400'}">${escHtml(row.name)}${i===0?' <span style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--mg-gold);background:rgba(212,160,23,0.12);border:1px solid rgba(212,160,23,0.3);padding:1px 5px;border-radius:3px;margin-left:5px">1ST</span>':''}</span>
        ${row.rounds.map(r => `<span style="font-size:12px;text-align:center">${r || '—'}</span>`).join('')}
        <span style="font-size:14px;font-weight:700;text-align:center;color:${i===0?'var(--mg-green)':'inherit'}">${row.total || '—'}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Game state summaries
  if (gameState) {
    html += renderGameSummaryCards(gameState, games, holes);
  }

  // Settlement card link + push notification opt-in
  const pushSubscribed = typeof localStorage !== 'undefined' && localStorage.getItem('waggle_push_subscribed');
  html += `<div style="text-align:center;padding:12px 0;display:flex;flex-direction:column;gap:10px;align-items:center">
    <a href="#settle" class="mg-btn mg-btn-gold" style="display:inline-block;width:auto;padding:10px 28px;font-size:14px;text-decoration:none">View Settlement Card</a>
    ${!pushSubscribed && 'Notification' in window ? `<button class="mg-btn mg-btn-outline" style="width:auto;padding:8px 20px;font-size:13px" onclick="window.MG.subscribePush()">🔔 Get Notified on Each Hole</button>` : pushSubscribed ? `<div style="font-size:12px;color:var(--mg-green)">🔔 Notifications enabled</div>` : ''}
  </div>`;

  return html;
}

// ─── Shared game summary card renderer ───
function renderGameSummaryCards(gameState, games, holes, isAdmin = false) {
  let html = '';
  const holesPlayed = Object.keys(holes || {}).length;

  // Skins
  if (games.skins && gameState.skins) {
    const s = gameState.skins;
    const sHolesDetail = getSkinsHoles(gameState, holes, players);
    const pot = s.pot || 1;
    const won = Object.values(sHolesDetail).filter(h => h.winner).length;
    const carried = Object.values(sHolesDetail).filter(h => h.carried).length;
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">SKINS <span style="font-weight:400;color:var(--mg-text-muted)">${holesPlayed} holes</span></div>
      <div style="display:flex;gap:16px;margin-bottom:8px">
        <div><div style="font-size:11px;color:var(--mg-text-muted)">Pot</div><div style="font-size:20px;font-weight:700;color:var(--mg-gold)">×${pot}</div></div>
        <div><div style="font-size:11px;color:var(--mg-text-muted)">Won</div><div style="font-size:20px;font-weight:700;color:var(--mg-green)">${won}</div></div>
        <div><div style="font-size:11px;color:var(--mg-text-muted)">Carried</div><div style="font-size:20px;font-weight:700">${carried}</div></div>
      </div>`;
    const holeEntries = Object.entries(sHolesDetail);
    if (holeEntries.length > 0) {
      html += `<div style="display:flex;flex-direction:column;gap:4px">`;
      holeEntries.forEach(([h, data]) => {
        if (data.winner) {
          html += `<div style="font-size:12px;display:flex;justify-content:space-between"><span>Hole ${h}</span><span style="color:var(--mg-green);font-weight:600">${escHtml(data.winner)} ×${data.potWon||1}</span></div>`;
        } else if (data.carried) {
          html += `<div style="font-size:12px;display:flex;justify-content:space-between"><span>Hole ${h}</span><span style="color:var(--mg-text-muted)">Carried →</span></div>`;
        }
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Nassau
  if (games.nassau && gameState.nassau?.running) {
    const r = gameState.nassau.running;
    const players = Object.keys(r);
    const holesPlayedCount = Object.keys(holes || {}).length;
    // Find best (lowest) total to compute who is 2+ down
    const bestTotal = Math.min(...players.map(n => r[n].total || 0));
    const bestFront = Math.min(...players.map(n => r[n].front || 0));
    const bestBack  = Math.min(...players.map(n => r[n].back  || 0));
    // Active presses
    const activePresses = (gameState.nassau.presses || []).filter(p => p.active);

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">NASSAU</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr${isAdmin?' 1fr':''};gap:4px;font-size:11px;font-weight:600;color:var(--mg-text-muted);margin-bottom:4px;padding:0 4px">
        <span>Player</span><span style="text-align:center">Front</span><span style="text-align:center">Back</span><span style="text-align:center">Total</span>${isAdmin?'<span></span>':''}
      </div>`;
    players.sort((a, b) => (r[a].total||0) - (r[b].total||0)).forEach(name => {
      const s = r[name];
      const frontDown = (s.front || 0) - bestFront;
      const backDown  = (s.back  || 0) - bestBack;
      const totalDown = (s.total || 0) - bestTotal;
      const canPressFront = isAdmin && frontDown >= 2 && holesPlayedCount < 9;
      const canPressBack  = isAdmin && backDown  >= 2 && holesPlayedCount >= 9 && holesPlayedCount < 18;
      const canPressTotal = isAdmin && totalDown >= 2;
      const hasPress = activePresses.some(p => p.player === name);

      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr${isAdmin?' 1fr':''};gap:4px;font-size:13px;padding:6px 4px;border-top:1px solid var(--mg-border);align-items:center">
        <span style="font-weight:500">${escHtml(name.split(' ').pop())}${hasPress?` <span style="font-size:9px;background:var(--gold-bright);color:var(--text-primary);border-radius:3px;padding:1px 4px">PRESS</span>`:''}
        </span>
        <span style="text-align:center;color:${(s.front||0)<0?'var(--mg-green)':(s.front||0)>0?'var(--loss)':'var(--mg-text)'}">${s.front||0}</span>
        <span style="text-align:center;color:${(s.back||0)<0?'var(--mg-green)':(s.back||0)>0?'var(--loss)':'var(--mg-text)'}">${s.back||0}</span>
        <span style="text-align:center;font-weight:700;color:${(s.total||0)<0?'var(--mg-green)':(s.total||0)>0?'var(--loss)':'var(--mg-text)'}">${s.total||0}</span>
        ${isAdmin ? `<span style="text-align:right">
          ${canPressFront ? `<button onclick="window.MG.pressNassau('${escHtml(name)}','front',${holesPlayedCount+1})" style="font-size:10px;padding:3px 6px;border:1px solid var(--gold-bright);border-radius:4px;background:rgba(240,192,64,0.1);color:var(--gold-bright);cursor:pointer;white-space:nowrap">Press F</button>` : ''}
          ${canPressBack  ? `<button onclick="window.MG.pressNassau('${escHtml(name)}','back',${holesPlayedCount+1})" style="font-size:10px;padding:3px 6px;border:1px solid var(--gold-bright);border-radius:4px;background:rgba(240,192,64,0.1);color:var(--gold-bright);cursor:pointer;white-space:nowrap">Press B</button>` : ''}
          ${!canPressFront && !canPressBack && canPressTotal ? `<button onclick="window.MG.pressNassau('${escHtml(name)}','full',${holesPlayedCount+1})" style="font-size:10px;padding:3px 6px;border:1px solid var(--gold-bright);border-radius:4px;background:rgba(240,192,64,0.1);color:var(--gold-bright);cursor:pointer;white-space:nowrap">Press</button>` : ''}
        </span>` : ''}
      </div>`;
    });

    // Show active presses
    if (activePresses.length > 0) {
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--mg-border)">
        <div style="font-size:11px;color:var(--mg-text-muted);font-weight:600;margin-bottom:4px">ACTIVE PRESSES</div>`;
      activePresses.forEach(p => {
        const pressLeader = Object.entries(p.running || {}).sort((a,b)=>a[1]-b[1])[0];
        html += `<div style="font-size:12px;display:flex;justify-content:space-between;padding:3px 0">
          <span><strong>${escHtml(p.player)}</strong> pressed ${p.segment} from H${p.startHole}</span>
          <span style="color:var(--mg-text-muted)">${pressLeader ? `Leader: ${escHtml(pressLeader[0].split(' ').pop())} (${pressLeader[1]})` : 'No scores yet'}</span>
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Stroke play leaderboard
  if (games.stroke_play && gameState.stroke?.running) {
    const entries = Object.entries(gameState.stroke.running)
      .map(([name, net]) => ({ name, net }))
      .sort((a, b) => a.net - b.net);
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">STROKE PLAY (NET)</div>`;
    entries.forEach((e, i) => {
      html += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-top:${i>0?'1px solid var(--mg-border)':'none'};font-size:13px">
        <span><span style="color:var(--mg-text-muted);margin-right:6px">${i+1}</span>${escHtml(e.name.split(' ').pop())}</span>
        <span style="font-weight:700;color:${e.net<0?'var(--mg-green)':e.net>0?'var(--loss)':'var(--mg-text)'}">${e.net===0?'E':e.net>0?'+'+e.net:e.net}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Vegas
  if (games.vegas && gameState.vegas) {
    const v = gameState.vegas;
    const score = v.score || { A: 0, B: 0 };
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">VEGAS</div>
      <div style="display:flex;justify-content:space-around;text-align:center">
        <div><div style="font-size:12px;color:var(--mg-text-muted)">Team A</div>
          <div style="font-size:11px;color:var(--mg-text-muted)">${(v.teamA||[]).map(n=>n.split(' ').pop()).join(' / ')}</div>
          <div style="font-size:24px;font-weight:700;color:${score.A>score.B?'var(--mg-green)':'var(--mg-text)'}">${score.A}</div>
        </div>
        <div style="font-size:14px;color:var(--mg-text-muted);align-self:center">vs</div>
        <div><div style="font-size:12px;color:var(--mg-text-muted)">Team B</div>
          <div style="font-size:11px;color:var(--mg-text-muted)">${(v.teamB||[]).map(n=>n.split(' ').pop()).join(' / ')}</div>
          <div style="font-size:24px;font-weight:700;color:${score.B>score.A?'var(--mg-green)':'var(--mg-text)'}">${score.B}</div>
        </div>
      </div>
    </div>`;
  }

  // Wolf
  if (games.wolf && gameState.wolf?.results) {
    const results = gameState.wolf.results;
    const score = {};
    Object.values(results).forEach(r => {
      if (r.wolfTeamWon) {
        score[r.wolf] = (score[r.wolf] || 0) + 1;
        if (r.partner) score[r.partner] = (score[r.partner] || 0) + 1;
      } else {
        Object.keys(r.net || {}).forEach(name => {
          if (name !== r.wolf && name !== r.partner) score[name] = (score[name] || 0) + 1;
        });
      }
    });
    if (Object.keys(score).length > 0) {
      html += `<div class="mg-card" style="padding:12px">
        <div class="mg-card-header" style="margin-bottom:8px">WOLF — Holes Won</div>`;
      Object.entries(score).sort((a,b) => b[1]-a[1]).forEach(([name, n]) => {
        html += `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px solid var(--mg-border)">
          <span>${escHtml(name.split(' ').pop())}</span>
          <span style="font-weight:700;color:var(--mg-gold)">${n} hole${n!==1?'s':''}</span>
        </div>`;
      });
      html += `</div>`;
    }
  }

  return html;
}

function renderAdminSettings(state) {
  let html = "";

  // Join link — derive slug from event URL (/:slug/)
  const eventUrlSlug = (state._config?.event?.url || '').replace(/.*\/waggle\/([^/]+)\/.*/, '$1') || window.location.pathname.split('/')[2] || '';
  const joinUrl = window.location.origin + '/join/' + eventUrlSlug;
  html += `<div class="mg-card" style="margin-bottom:16px">
    <div class="mg-card-header" style="margin-bottom:8px">PLAYER JOIN LINK</div>
    <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:8px">Share this link so players can self-register</div>
    <div style="background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:monospace;word-break:break-all;margin-bottom:8px">${joinUrl}</div>
    <button class="mg-btn mg-btn-outline" style="width:auto;padding:6px 16px;font-size:12px" onclick="navigator.clipboard.writeText('${joinUrl}').then(()=>window.MG.toast('Link copied!'))">Copy Link</button>
  </div>`;

  // Announcement input
  html += `<div class="mg-card">
    <div class="mg-card-header">Announcement</div>
    <div style="display:flex;gap:8px">
      <input type="text" id="announcement-input" placeholder="Type announcement..." style="flex:1;padding:8px 10px;border:2px solid var(--mg-border);border-radius:8px;font-size:14px">
      <button class="mg-btn mg-btn-primary" style="width:auto;padding:8px 16px" onclick="window.MG.postAnnouncement()">Post</button>
    </div>
  </div>`;

  // Co-Organizers
  const coAdminEmails = state._config?.event?.adminEmails || [];
  html += `<div class="mg-card" style="padding:16px;margin-top:12px">
    <div class="mg-card-header">Co-Organizers</div>
    <p style="font-size:12px;color:var(--mg-text-muted);margin-bottom:8px">Invite someone to help manage this event</p>
    <div style="display:flex;gap:8px">
      <input type="email" id="co-admin-email" placeholder="Email address" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
      <button class="mg-btn mg-btn-gold" style="width:auto;padding:10px 16px;font-size:13px" onclick="window.MG.inviteCoAdmin()">Invite</button>
    </div>
    ${coAdminEmails.length > 0 ? `
    <div style="margin-top:10px">
      ${coAdminEmails.map(e => `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--mg-border);color:var(--mg-text)">${escHtml(e)}</div>`).join('')}
    </div>` : ''}
  </div>`;

  // Game Selection — commissioner can toggle games on/off between rounds
  const games = state._config?.games || {};
  const allGameOptions = [
    { id: 'nassau', name: 'Nassau', desc: 'Front 9, Back 9, Overall' },
    { id: 'skins', name: 'Skins', desc: 'Per-hole winner takes pot' },
    { id: 'wolf', name: 'Wolf', desc: 'Pick your partner each hole' },
    { id: 'vegas', name: 'Vegas', desc: 'Team 2-digit scores' },
    { id: 'stableford', name: 'Stableford', desc: 'Points for performance' },
    { id: 'match_play', name: 'Match Play', desc: 'Hole-by-hole head-to-head' },
    { id: 'stroke_play', name: 'Stroke Play', desc: 'Net total score' },
    { id: 'nines', name: '3-Player 9s', desc: '9 points split per hole' },
    { id: 'scramble', name: 'Scramble', desc: 'Team best-ball' },
  ];
  html += `<div class="mg-card" style="padding:16px;margin-top:12px">
    <div class="mg-card-header" style="margin-bottom:4px">Active Games</div>
    <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:12px">Toggle games on or off. Changes apply immediately.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">`;
  allGameOptions.forEach(g => {
    const active = !!games[g.id];
    html += `<button onclick="window.MG.toggleGame('${g.id}')" style="padding:12px;border-radius:8px;border:2px solid ${active ? 'var(--mg-gold)' : 'var(--mg-border)'};background:${active ? 'rgba(212,160,23,0.08)' : 'var(--mg-surface)'};cursor:pointer;text-align:left">
      <div style="font-size:13px;font-weight:700;color:${active ? 'var(--mg-gold-dim)' : 'var(--mg-text)'}">${g.name}</div>
      <div style="font-size:11px;color:var(--mg-text-muted);margin-top:2px">${g.desc}</div>
    </button>`;
  });
  html += `</div></div>`;

  // Stakes
  const structure = state._config?.structure || {};
  html += `<div class="mg-card" style="padding:16px;margin-top:12px">
    <div class="mg-card-header" style="margin-bottom:8px">Stakes</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:.5px">Nassau</label>
        <input type="number" id="stakes-nassau" value="${structure.nassauBet || 10}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:16px;font-weight:700;margin-top:4px" onchange="window.MG.updateStakes()">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:.5px">Skins</label>
        <input type="number" id="stakes-skins" value="${structure.skinsBet || 5}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:16px;font-weight:700;margin-top:4px" onchange="window.MG.updateStakes()">
      </div>
    </div>
  </div>`;

  // AI Game Advisor
  html += `<div class="mg-card" style="padding:16px;margin-top:12px">
    <div class="mg-card-header" style="margin-bottom:4px">AI Game Advisor</div>
    <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:12px">Let AI recommend the best format based on your group size and handicaps.</div>
    <button class="mg-btn mg-btn-gold" onclick="window.MG.getAIGameAdvice()">Get Recommendation</button>
    <div id="ai-game-advice" style="margin-top:12px"></div>
  </div>`;

  // Export / Reset
  html += `<div class="mt-4" style="display:flex;gap:8px">
    <button class="mg-btn mg-btn-outline" style="flex:1" onclick="window.MG.exportData()">Export JSON</button>
    <button class="mg-btn mg-btn-danger" style="flex:1" onclick="window.MG.resetData()">Reset All</button>
  </div>`;

  return html;
}

// ===== BETTING BOARD =====
// ─── CASH BETTING TAB (Warrior / Buddies) ───
function renderCashBetting(state) {
  const slug = state._slug || 'event';
  const gameState = state._gameState;
  const games = state._config?.games || {};
  const holes = state._holes || {};
  const holesPlayed = Object.keys(holes).length;
  const myName = state.bettorName || '';

  let html = '';

  if (!myName) {
    return `<div style="padding:40px 20px;text-align:center">
      <div style="font-size:40px;margin-bottom:12px">&#9971;</div>
      <div style="font-size:22px;font-weight:700;color:var(--mg-green);margin-bottom:8px">Pick Your Name First</div>
      <p class="text-sm text-muted" style="margin-bottom:16px">So your bets are tracked to you</p>
      <a href="#dashboard" class="mg-btn mg-btn-primary" style="width:auto;padding:12px 32px;font-size:15px;text-decoration:none;display:inline-block">Go to Home</a>
    </div>`;
  }

  // Player bar
  html += `<div class="mg-card" style="padding:10px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:14px;font-weight:700;color:var(--mg-green)">${escHtml(myName)}</div>
      <button class="mg-btn mg-btn-outline" style="width:auto;padding:4px 10px;font-size:11px" onclick="window.MG.editBettorName()">Change</button>
    </div>
  </div>`;

  // ── Live Odds or Pre-Round Setup ──
  if (holesPlayed === 0) {
    html += `<div class="mg-section-title" style="margin-top:16px">Bets Available This Round</div>`;

    if (games.nassau) {
      html += `<div class="mg-card" style="padding:12px">
        <div style="font-size:13px;font-weight:700;color:var(--mg-text);margin-bottom:4px">Nassau</div>
        <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:10px">Front nine · Back nine · Total match</div>
        <div style="display:flex;gap:6px">
          <button class="mg-odds-btn" onclick="window.MG.openCashBetModal('Wins Front Nine','')" style="flex:1"><div class="odds-label">Front 9</div><div class="odds-pays">Holes 1–9</div></button>
          <button class="mg-odds-btn" onclick="window.MG.openCashBetModal('Wins Back Nine','')" style="flex:1"><div class="odds-label">Back 9</div><div class="odds-pays">Holes 10–18</div></button>
          <button class="mg-odds-btn" onclick="window.MG.openCashBetModal('Wins Nassau Total','')" style="flex:1"><div class="odds-label">Total</div><div class="odds-pays">Full 18</div></button>
        </div>
      </div>`;
    }

    if (games.skins) {
      html += `<div class="mg-card" style="padding:12px">
        <div style="font-size:13px;font-weight:700;color:var(--mg-text);margin-bottom:4px">Skins</div>
        <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:10px">Best score wins the hole — pot carries on ties</div>
        <button class="mg-odds-btn" onclick="window.MG.openCashBetModal('Wins Most Skins','')" style="width:100%">
          <div class="odds-label">Skins Winner</div><div class="odds-pays">Most skins at end of round</div>
        </button>
      </div>`;
    }

    if (games.wolf) {
      html += `<div class="mg-card" style="padding:12px">
        <div style="font-size:13px;font-weight:700;color:var(--mg-text);margin-bottom:4px">Wolf</div>
        <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:10px">Wolf picks partner (or goes lone) each hole</div>
        <button class="mg-odds-btn" onclick="window.MG.openCashBetModal('Wins Wolf','')" style="width:100%">
          <div class="odds-label">Wolf Winner</div><div class="odds-pays">Most points at 18</div>
        </button>
      </div>`;
    }

  } else {
    // Mid-round: live odds from game state
    html += `<div class="mg-section-title" style="margin-top:16px">Live Odds <span style="font-size:11px;font-weight:400;color:var(--mg-text-muted)">${holesPlayed} hole${holesPlayed!==1?'s':''} played</span></div>`;

    // Skins live odds
    if (games.skins) {
      const skinsHolesLive = getSkinsHoles(gameState, holes, getPlayersFromConfig(state._config));
      const skinsWon = {};
      Object.values(skinsHolesLive).forEach(h => {
        if (h.winner) skinsWon[h.winner] = (skinsWon[h.winner] || 0) + (h.potWon || 1);
      });
      const potSize = gameState.skins?.pot || 1;
      const allPlayers = getPlayersFromConfig(state._config);
      const standings = Object.entries(skinsWon).map(([name, n]) => ({ name, score: -n })).sort((a, b) => a.score - b.score);
      allPlayers.forEach(p => { if (!skinsWon[p.name]) standings.push({ name: p.name, score: 0 }); });
      const odds = gameStandingsToOdds(standings);
      html += `<div class="mg-card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700">SKINS WINNER</div>
          <div style="font-size:12px;color:var(--mg-gold-dim);font-weight:700">Pot ×${potSize}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      odds.slice(0, 6).forEach(o => {
        const won = skinsWon[o.name] || 0;
        html += `<button class="mg-odds-btn" onclick="window.MG.openCashBetModal('${escHtml(o.name)} Wins Skins','')" style="flex:1;min-width:42%">
          <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
          <div class="odds-line">${o.americanStr}</div>
          <div class="odds-pays">${won} skin${won!==1?'s':''} · ${o.decimal}x</div>
        </button>`;
      });
      html += `</div></div>`;
    }

    // Nassau live odds
    if (games.nassau && gameState?.nassau?.running) {
      const r = gameState.nassau.running;
      const playerNames = Object.keys(r);
      if (playerNames.length > 0) {
        html += `<div class="mg-card" style="padding:12px"><div style="font-size:13px;font-weight:700;margin-bottom:10px">NASSAU</div>`;

        // Front nine (show while on front)
        if (holesPlayed < 9) {
          const frontStandings = playerNames.map(name => ({ name, score: r[name].front || 0 })).sort((a, b) => a.score - b.score);
          const frontOdds = gameStandingsToOdds(frontStandings);
          html += `<div style="font-size:11px;font-weight:600;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Front Nine</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">`;
          frontOdds.slice(0, 4).forEach(o => {
            const net = frontStandings.find(s => s.name === o.name)?.score || 0;
            const nd = net > 0 ? '+'+net : net === 0 ? 'E' : String(net);
            html += `<button class="mg-odds-btn" onclick="window.MG.openCashBetModal('${escHtml(o.name)} Wins Front Nine','')" style="flex:1;min-width:42%">
              <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
              <div class="odds-line">${o.americanStr}</div>
              <div class="odds-pays">${nd} · ${o.decimal}x</div>
            </button>`;
          });
          html += `</div>`;
        }

        // Back nine (show after hole 9)
        if (holesPlayed >= 9) {
          const backStandings = playerNames.map(name => ({ name, score: r[name].back || 0 })).sort((a, b) => a.score - b.score);
          const backOdds = gameStandingsToOdds(backStandings);
          html += `<div style="font-size:11px;font-weight:600;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Back Nine</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">`;
          backOdds.slice(0, 4).forEach(o => {
            const net = backStandings.find(s => s.name === o.name)?.score || 0;
            const nd = net > 0 ? '+'+net : net === 0 ? 'E' : String(net);
            html += `<button class="mg-odds-btn" onclick="window.MG.openCashBetModal('${escHtml(o.name)} Wins Back Nine','')" style="flex:1;min-width:42%">
              <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
              <div class="odds-line">${o.americanStr}</div>
              <div class="odds-pays">${nd} · ${o.decimal}x</div>
            </button>`;
          });
          html += `</div>`;
        }

        // Total
        const totalStandings = playerNames.map(name => ({ name, score: r[name].total || 0 })).sort((a, b) => a.score - b.score);
        const totalOdds = gameStandingsToOdds(totalStandings);
        html += `<div style="font-size:11px;font-weight:600;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Total</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">`;
        totalOdds.slice(0, 4).forEach(o => {
          const net = totalStandings.find(s => s.name === o.name)?.score || 0;
          const nd = net > 0 ? '+'+net : net === 0 ? 'E' : String(net);
          html += `<button class="mg-odds-btn" onclick="window.MG.openCashBetModal('${escHtml(o.name)} Wins Nassau Total','')" style="flex:1;min-width:42%">
            <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
            <div class="odds-line">${o.americanStr}</div>
            <div class="odds-pays">${nd} · ${o.decimal}x</div>
          </button>`;
        });
        html += `</div></div>`;
      }
    }

    // Wolf live odds
    if (games.wolf && gameState?.wolf?.running) {
      const r = gameState.wolf.running;
      const wolfStandings = Object.entries(r).map(([name, pts]) => ({ name, score: -(pts||0) })).sort((a,b) => a.score - b.score);
      const wolfOdds = gameStandingsToOdds(wolfStandings);
      html += `<div class="mg-card" style="padding:12px">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px">WOLF WINNER</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      wolfOdds.slice(0, 4).forEach(o => {
        const pts = r[o.name] || 0;
        html += `<button class="mg-odds-btn" onclick="window.MG.openCashBetModal('${escHtml(o.name)} Wins Wolf','')" style="flex:1;min-width:42%">
          <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
          <div class="odds-line">${o.americanStr}</div>
          <div class="odds-pays">${pts} pts · ${o.decimal}x</div>
        </button>`;
      });
      html += `</div></div>`;
    }
  }

  // ── My active cash bets ──
  const cashBets = getCashBets(slug);
  const myActiveBets = cashBets.filter(b => b.player === myName && b.status === 'active');
  if (myActiveBets.length > 0) {
    html += `<div class="mg-section-title" style="margin-top:16px">My Active Bets (${myActiveBets.length})</div>`;
    myActiveBets.forEach(b => {
      html += `<div class="mg-bet-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="mg-bet-desc" style="font-size:13px">${escHtml(b.desc)}</div>
          <div style="font-size:20px;font-weight:800;color:var(--mg-gold)">$${b.amount}</div>
        </div>
        <button onclick="window.MG.removeCashBet('${b.id}')" style="flex-shrink:0;background:transparent;border:1px solid var(--mg-border);border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;color:var(--mg-text-muted)">Remove</button>
      </div>`;
    });
  }

  // ── Make a Bet CTA ──
  html += `<button class="mg-btn mg-btn-primary" style="margin-top:16px" onclick="window.MG.openCashBetModal('','')">+ Make a Bet</button>`;

  // ── Cash Bet Modal ──
  if (state._cashBetModal) {
    const m = state._cashBetModal;
    const amt = parseInt(m.amount) || 0;
    html += `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:200;display:flex;align-items:flex-end" onclick="if(event.target===this)window.MG.closeCashBetModal()">
      <div style="background:var(--mg-surface);border-radius:16px 16px 0 0;padding:24px 20px 32px;width:100%;max-width:480px;margin:0 auto;box-sizing:border-box">
        <div style="font-size:20px;font-weight:700;color:var(--mg-green);margin-bottom:16px">Make a Bet</div>
        <label class="text-xs text-muted" style="display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">What's the bet?</label>
        <input type="text" id="cash-bet-desc" value="${escHtml(m.desc)}" placeholder="e.g. Dave wins Front Nine" oninput="window.MG.setCashBetDesc(this.value)"
          style="width:100%;padding:12px;border:2px solid var(--mg-border);border-radius:8px;font-size:16px;margin-bottom:14px;background:var(--bg-tertiary);color:var(--mg-text);box-sizing:border-box">
        <label class="text-xs text-muted" style="display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Amount</label>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          ${[5,10,20,50].map(n => `<button onclick="window.MG.setCashBetAmount(${n})" style="flex:1;padding:8px 0;border:2px solid ${amt===n?'var(--mg-green)':'var(--mg-border)'};border-radius:8px;background:${amt===n?'rgba(35,134,54,0.4)':'transparent'};color:var(--mg-text);font-size:14px;font-weight:700;cursor:pointer">$${n}</button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <span style="font-size:20px;font-weight:700;color:var(--mg-text)">$</span>
          <input type="number" id="cash-bet-amount" value="${m.amount||''}" placeholder="0" oninput="window.MG.setCashBetAmount(parseInt(this.value)||0)"
            inputmode="numeric" style="flex:1;padding:10px;border:2px solid var(--mg-border);border-radius:8px;font-size:20px;font-weight:700;text-align:center;background:var(--bg-tertiary);color:var(--mg-text)">
        </div>
        <div style="display:flex;gap:10px">
          <button class="mg-btn mg-btn-outline" style="flex:1" onclick="window.MG.closeCashBetModal()">Cancel</button>
          <button class="mg-btn mg-btn-primary" style="flex:2" onclick="window.MG.logCashBet()">Save Bet</button>
        </div>
      </div>
    </div>`;
  }

  return html;
}

export function renderBetting(state) {
  const eventType = getEventType(state);
  if (eventType === 'quick' || eventType === 'buddies_trip') return renderCashBetting(state);

  const tab = state._betTab || "matches";

  let html = ``;

  // Name is REQUIRED — send to dashboard to pick from dropdown
  if (!state.bettorName) {
    html += `<div style="padding:40px 20px;text-align:center">
      <div style="font-size:40px;margin-bottom:12px">&#9971;</div>
      <div style="font-size:22px;font-weight:700;color:var(--mg-green);margin-bottom:8px">Select Your Name First</div>
      <p class="text-sm text-muted mb-4">Go to the home page to pick your name</p>
      <a href="#dashboard" class="mg-btn mg-btn-primary" style="width:auto;padding:12px 32px;font-size:15px;text-decoration:none;display:inline-block">Go to Home</a>
    </div>`;
    return html;
  }

  // Player info bar with credits + refresh button (#6)
  const credits = state._playerCredits;
  const creditsDisplay = credits !== null && credits !== undefined ? `$${credits}` : '';
  html += `<div class="mg-card" style="padding:10px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--mg-green)">${escHtml(state.bettorName)}</div>
        ${creditsDisplay ? `<div class="text-xs" style="color:var(--mg-gold-dim);font-weight:700">Credits: ${creditsDisplay}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="mg-btn mg-btn-outline" style="width:auto;padding:4px 10px;font-size:11px" onclick="window.MG.syncNow()">&#x21bb; Refresh</button>
        <button class="mg-btn mg-btn-outline" style="width:auto;padding:4px 10px;font-size:11px" onclick="window.MG.editBettorName()">Change</button>
      </div>
    </div>
  </div>`;

  html += `<div class="mg-tabs">
      <button class="mg-tab ${tab === 'matches' ? 'active' : ''}" onclick="window.MG.setBetTab('matches')">Matches</button>
      <button class="mg-tab ${tab === 'futures' ? 'active' : ''}" onclick="window.MG.setBetTab('futures')">Futures</button>
      <button class="mg-tab ${tab === 'props' ? 'active' : ''}" onclick="window.MG.setBetTab('props')">Props</button>
    </div>`;

  if (tab === "matches") {
    html += renderMatchBets(state);
  } else if (tab === "futures") {
    html += renderFutureBets(state);
  } else {
    html += renderPropBets(state);
  }

  // Bet slip
  if (state._betSlip && state._betSlip.length > 0) {
    html += renderBetSlip(state);
  }

  return html;
}

function renderMatchBets(state) {
  let html = "";
  // Show bettable matches (scheduled or live)
  const bettable = Object.values(state.matches).filter(m => m.status !== "final");

  if (bettable.length === 0) {
    return `<div class="mg-card text-center"><p class="text-muted">No open matches to bet on</p></div>`;
  }

  // Group by flight
  flightOrder().forEach(fId => {
    const fMatches = bettable.filter(m => m.flight === fId);
    if (fMatches.length === 0) return;

    html += `<div class="mg-card-header">${F(fId).name}</div>`;
    fMatches.forEach(m => {
      // Skip locked matches
      if (isMatchLocked(m.id)) {
        const tA = T(m.teamA), tB = T(m.teamB);
        html += `<div class="mg-match" style="margin-bottom:10px;opacity:0.5">
          <div class="mg-match-round">R${m.round} &bull; ${RT(m.round)} &bull; BETTING LOCKED</div>
          <div style="text-align:center;padding:12px;color:var(--mg-text-muted);font-size:12px">${TN(tA)} vs ${TN(tB)} &mdash; Locked</div>
        </div>`;
        return;
      }
      const tA = T(m.teamA), tB = T(m.teamB);
      const nA = TN(tA), nB = TN(tB);
      const odds = matchOdds(m);
      if (!odds) return;

      // Raw moneyline from chart + adjusted odds with draw
      const { mlA, mlB } = getMatchMoneyline(m.teamA, m.teamB, m.id);
      const fmtMlA = mlA === 0 ? "EVEN" : (mlA > 0 ? `+${mlA}` : `${mlA}`);
      const fmtMlB = mlB === 0 ? "EVEN" : (mlB > 0 ? `+${mlB}` : `${mlB}`);
      const decA = mlToDecimal(mlA);
      const decB = mlToDecimal(mlB);
      const oddsDraw = probToAmerican(odds.draw);
      const decDraw = mlToDecimal(typeof oddsDraw === 'string' ? parseInt(oddsDraw.replace('+','')) : oddsDraw);

      const isLive = m.status === "live";
      html += `<div class="mg-match ${m.status}" style="margin-bottom:10px">
        ${isLive ? '<div class="mg-match-live-badge mb-2">LIVE</div>' : ''}
        <div class="mg-match-round">R${m.round} &bull; ${RT(m.round)} &bull; HI: ${tA.combined} vs ${tB.combined}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="mg-odds-btn ${isSlipSelected(state, m.id, m.teamA) ? 'selected' : ''}" onclick="window.MG.addToSlip('match_winner','${m.id}',${m.teamA},'${nA} ML',${decA},'${fmtMlA}')">
            <div class="odds-label">${nA}</div>
            <div class="odds-line">${fmtMlA}</div>
            <div class="odds-pays">Pays ${decA}x</div>
          </button>
          <button class="mg-odds-btn ${isSlipSelected(state, m.id, 'draw') ? 'selected' : ''}" onclick="window.MG.addToSlip('match_winner','${m.id}','draw','${F(m.flight).name.replace(" Flight","")} R${m.round} Draw',${decDraw},'${oddsDraw}')">
            <div class="odds-label">Draw</div>
            <div class="odds-line">${oddsDraw}</div>
            <div class="odds-pays">Pays ${decDraw}x</div>
          </button>
          <button class="mg-odds-btn ${isSlipSelected(state, m.id, m.teamB) ? 'selected' : ''}" onclick="window.MG.addToSlip('match_winner','${m.id}',${m.teamB},'${nB} ML',${decB},'${fmtMlB}')">
            <div class="odds-label">${nB}</div>
            <div class="odds-line">${fmtMlB}</div>
            <div class="odds-pays">Pays ${decB}x</div>
          </button>
        </div>
      </div>`;
    });
  });

  return html;
}

/**
 * Convert leader-gap standings to bet odds.
 * standings: [{name, score}] sorted best-first (lowest net).
 * Returns [{name, american, decimal}] sorted by prob desc.
 */
function gameStandingsToOdds(standings) {
  if (!standings || standings.length === 0) return [];
  const leader = standings[0].score;
  const raw = standings.map(s => 1 / (1 + Math.max(0, s.score - leader) * 0.6 + 0.3));
  const total = raw.reduce((a, b) => a + b, 0);
  return standings.map((s, i) => {
    const prob = raw[i] / total;
    const american = probToAmerican(prob);
    const americanNum = typeof american === 'number' ? american : parseInt(String(american).replace('+','')) * (String(american).startsWith('+') ? 1 : -1);
    return { name: s.name, prob, american, decimal: mlToDecimal(americanNum),
      americanStr: typeof american === 'number' ? (american > 0 ? '+' + american : String(american)) : String(american) };
  });
}

function renderFutureBets(state) {
  let html = '';
  const gameState = state._gameState;
  const holes = state._holes || {};
  const holesPlayed = Object.keys(holes).length;
  const games = state._config?.games || {};

  // ── Live Game Bets (Phase 3: live odds from hole-by-hole scores) ──
  if (gameState && holesPlayed > 0) {
    html += `<div class="mg-section-title">Live Game Bets <span style="font-size:11px;font-weight:400;color:var(--mg-text-muted)">${holesPlayed} holes played</span></div>`;

    // Skins: bet on who wins the most skins
    if (games.skins) {
      const skinsHolesBets = getSkinsHoles(gameState, holes, getPlayersFromConfig(state._config));
      const skinsWon = {};
      Object.values(skinsHolesBets).forEach(h => {
        if (h.winner) skinsWon[h.winner] = (skinsWon[h.winner] || 0) + (h.potWon || 1);
      });
      const potSize = gameState.skins?.pot || 1;
      const standings = Object.entries(skinsWon)
        .map(([name, n]) => ({ name, score: -n })) // negative so lower = better for sorting
        .sort((a, b) => a.score - b.score);
      // Add players with 0 skins
      const allPlayers = getPlayersFromConfig(state._config);
      allPlayers.forEach(p => {
        if (!skinsWon[p.name]) standings.push({ name: p.name, score: 0 });
      });
      const odds = gameStandingsToOdds(standings);
      html += `<div class="mg-card">
        <div class="mg-card-header" style="margin-bottom:4px">SKINS WINNER <span style="font-size:11px;font-weight:400;color:var(--mg-text-muted)">pot ×${potSize} remaining</span></div>
        <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:8px">Bet on who wins the most skins this round</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      odds.slice(0, 6).forEach(o => {
        const won = skinsWon[o.name] || 0;
        const isSelected = isSlipSelected(state, 'skins_winner', o.name);
        html += `<button class="mg-odds-btn ${isSelected ? 'selected' : ''}"
          onclick="window.MG.addToSlip('game_winner','skins_winner','${escHtml(o.name)}','${escHtml(o.name)} to win Skins',${o.decimal},'${o.americanStr}')"
          style="flex:1;min-width:42%">
          <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
          <div class="odds-line">${o.americanStr}</div>
          <div class="odds-pays">${won} skin${won!==1?'s':''} won &bull; ${o.decimal}x</div>
        </button>`;
      });
      html += `</div></div>`;
    }

    // Nassau: bet on front/back/total leader
    if (games.nassau && gameState.nassau?.running) {
      const r = gameState.nassau.running;
      const playerNames = Object.keys(r);
      if (playerNames.length > 0) {
        // Total standings
        const totalStandings = playerNames
          .map(name => ({ name, score: r[name].total || 0 }))
          .sort((a, b) => a.score - b.score);
        const totalOdds = gameStandingsToOdds(totalStandings);

        html += `<div class="mg-card">
          <div class="mg-card-header" style="margin-bottom:4px">NASSAU TOTAL WINNER</div>
          <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:8px">Current leader: <strong style="color:var(--mg-green)">${escHtml(totalStandings[0]?.name || '—')}</strong> (${totalStandings[0]?.score ?? 0})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">`;
        totalOdds.slice(0, 6).forEach(o => {
          const standing = totalStandings.find(s => s.name === o.name);
          const scoreDisp = standing ? (standing.score > 0 ? '+' + standing.score : standing.score === 0 ? 'E' : String(standing.score)) : 'E';
          const isSelected = isSlipSelected(state, 'nassau_total_winner', o.name);
          html += `<button class="mg-odds-btn ${isSelected ? 'selected' : ''}"
            onclick="window.MG.addToSlip('game_winner','nassau_total_winner','${escHtml(o.name)}','${escHtml(o.name)} wins Nassau Total',${o.decimal},'${o.americanStr}')"
            style="flex:1;min-width:42%">
            <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
            <div class="odds-line">${o.americanStr}</div>
            <div class="odds-pays">${scoreDisp} net &bull; ${o.decimal}x</div>
          </button>`;
        });
        html += `</div></div>`;
      }
    }

    // Stroke play: bet on net total leaderboard
    if (games.stroke_play && gameState.stroke?.running) {
      const strokeStandings = Object.entries(gameState.stroke.running)
        .map(([name, net]) => ({ name, score: net }))
        .sort((a, b) => a.score - b.score);
      const strokeOdds = gameStandingsToOdds(strokeStandings);
      html += `<div class="mg-card">
        <div class="mg-card-header" style="margin-bottom:4px">STROKE PLAY WINNER (NET)</div>
        <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:8px">Leader: <strong style="color:var(--mg-green)">${escHtml(strokeStandings[0]?.name || '—')}</strong></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      strokeOdds.slice(0, 6).forEach(o => {
        const net = gameState.stroke.running[o.name] || 0;
        const netDisp = net > 0 ? '+' + net : net === 0 ? 'E' : String(net);
        const isSelected = isSlipSelected(state, 'stroke_winner', o.name);
        html += `<button class="mg-odds-btn ${isSelected ? 'selected' : ''}"
          onclick="window.MG.addToSlip('game_winner','stroke_winner','${escHtml(o.name)}','${escHtml(o.name)} wins Stroke Play',${o.decimal},'${o.americanStr}')"
          style="flex:1;min-width:42%">
          <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
          <div class="odds-line">${o.americanStr}</div>
          <div class="odds-pays">${netDisp} net &bull; ${o.decimal}x</div>
        </button>`;
      });
      html += `</div></div>`;
    }
  }

  // ── Season Bets (if season data is loaded) ──
  const seasonData = state._seasonData;
  if (seasonData?.leaderboard?.length > 0) {
    const standings = seasonData.leaderboard.map(p => ({ name: p.name, score: p.totalNet }));
    const seasonOdds = gameStandingsToOdds(standings);
    html += `<div class="mg-section-title">Season Bets <span style="font-size:11px;font-weight:400;color:var(--mg-text-muted)">${seasonData.season?.name}</span></div>
    <div class="mg-card">
      <div class="mg-card-header" style="margin-bottom:4px">SEASON STROKE PLAY WINNER</div>
      <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:8px">Bet on the season-long net stroke play champion across all events</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">`;
    seasonOdds.slice(0, 6).forEach(o => {
      const player = seasonData.leaderboard.find(p => p.name === o.name);
      const isSelected = isSlipSelected(state, 'season_stroke_winner', o.name);
      html += `<button class="mg-odds-btn ${isSelected ? 'selected' : ''}"
        onclick="window.MG.addToSlip('game_winner','season_stroke_winner','${escHtml(o.name)}','${escHtml(o.name)} wins Season',${o.decimal},'${o.americanStr}')"
        style="flex:1;min-width:42%">
        <div class="odds-label">${escHtml(o.name.split(' ').pop())}</div>
        <div class="odds-line">${o.americanStr}</div>
        <div class="odds-pays">${player?.eventCount||0} events · ${player?.totalNet>=0?'+':''}${player?.totalNet||0} net &bull; ${o.decimal}x</div>
      </button>`;
    });
    html += `</div></div>`;
  }

  // ── Flight Winners (existing) ──
  const hasFlights = flightOrder().length > 0;
  if (hasFlights) {
    html += `<div class="mg-section-title">Flight Winners</div>`;
    flightOrder().forEach(fId => {
      const flight = F(fId);
      const odds = flightWinnerOdds(fId, state.matches);
      html += `<div class="mg-card">
        <div class="mg-card-header">${flight.name}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      const sorted = Object.entries(odds).sort((a, b) => b[1] - a[1]);
      sorted.forEach(([teamId, prob]) => {
        const t = T(parseInt(teamId));
        const american = probToAmerican(prob);
        const americanNum = typeof american === 'string' ? parseInt(american.replace('+','')) : american;
        const decimal = mlToDecimal(americanNum);
        const americanStr = typeof american === 'number' ? (american > 0 ? `+${american}` : `${american}`) : `${american}`;
        html += `<button class="mg-odds-btn ${isSlipSelected(state, fId, parseInt(teamId)) ? 'selected' : ''}" onclick="window.MG.addToSlip('flight_winner','${fId}',${teamId},'${TN(t)} — ${flight.name}',${decimal},'${americanStr}')" style="flex:1;min-width:45%">
          <div class="odds-label">${TN(t)}</div>
          <div class="odds-line">${american}</div>
          <div class="odds-pays">HI: ${T(parseInt(teamId)).combined ?? 0} &bull; ${decimal}x</div>
        </button>`;
      });
      html += `</div></div>`;
    });
  }

  if (!html) {
    html = `<div class="mg-card" style="text-align:center;padding:32px 20px">
      <div style="font-size:36px;margin-bottom:12px">&#9971;</div>
      <div style="font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:4px">No Live Markets Yet</div>
      <p class="text-sm text-muted">Markets open once hole scores are entered</p>
    </div>`;
  }

  return html;
}

function renderPropBets(state) {
  let html = `<div class="mg-section-title">Match Margins</div>
    <p class="text-sm text-muted mb-4">Pick the exact score outcome (7-3, 6-4, 5-5)</p>`;

  const bettable = Object.values(state.matches).filter(m => m.status !== "final");
  if (bettable.length === 0) {
    return `<div class="mg-card text-center"><p class="text-muted">No matches available for prop bets</p></div>`;
  }

  // Show each flight as a collapsible dropdown
  const openFlight = state._propFlight || null;

  flightOrder().forEach(fId => {
    const flight = F(fId);
    const fMatches = bettable.filter(m => m.flight === fId);
    if (fMatches.length === 0) return;

    const isOpen = openFlight === fId;
    const matchCount = fMatches.length;

    html += `<div class="mg-card" style="padding:0;overflow:hidden;cursor:pointer" onclick="window.MG.togglePropFlight('${fId}')">
      <div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--mg-green)">${flight.name}</div>
          <div class="text-xs text-muted">${matchCount} match${matchCount !== 1 ? 'es' : ''} open &bull; ${flight.tees} Tees</div>
        </div>
        <div style="font-size:18px;color:var(--mg-text-muted);transition:transform 0.2s;transform:rotate(${isOpen ? '180' : '0'}deg)">&#9660;</div>
      </div>`;

    if (isOpen) {
      html += `<div style="padding:0 12px 12px" onclick="event.stopPropagation()">`;
      fMatches.sort((a, b) => a.round - b.round).forEach(m => {
        if (isMatchLocked(m.id)) return;
        const tA = T(m.teamA), tB = T(m.teamB);
        const mOdds = marginOdds(m);
        if (!mOdds) return;

        const nameA = TN(tA);
        const nameB = TN(tB);

        html += `<div style="padding:10px 0;border-top:1px solid var(--mg-border)">
          <div style="font-weight:600;font-size:12px">${nameA} vs ${nameB}</div>
          <div class="text-xs text-muted mb-2">Round ${m.round} &bull; ${RT(m.round)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">`;

        Object.entries(mOdds).forEach(([outcome, data]) => {
          const american = probToAmerican(data.prob);
          const americanNum = typeof american === 'string' ? parseInt(american.replace('+','')) : american;
          const dec = mlToDecimal(americanNum);
          const americanStr = typeof american === 'number' ? (american > 0 ? `+${american}` : `${american}`) : `${american}`;
          html += `<button class="mg-odds-btn ${isSlipSelected(state, m.id + '_margin', outcome) ? 'selected' : ''}" onclick="event.stopPropagation();window.MG.addToSlip('match_margin','${m.id}','${outcome}','${data.label} (${flight.name.replace(" Flight","")} R${m.round})',${dec},'${americanStr}')" style="flex:1;min-width:18%;padding:4px 2px">
            <div class="odds-label" style="font-size:9px">${data.label}</div>
            <div class="odds-line" style="font-size:13px">${american}</div>
            <div class="odds-pays">${dec}x</div>
          </button>`;
        });

        html += `</div></div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  });

  return html;
}

function isSlipSelected(state, matchId, selection) {
  if (!state._betSlip) return false;
  return state._betSlip.some(b => b.matchId === matchId && b.selection == selection);
}

function renderBetSlip(state) {
  let html = `<div class="mg-betslip open">
    <div class="mg-betslip-header">
      <h3>Bet Slip (${state._betSlip.length})</h3>
      <button class="mg-betslip-remove" onclick="window.MG.clearSlip()">&times;</button>
    </div>
    <div class="mg-betslip-content">`;

  state._betSlip.forEach((b, i) => {
    const americanDisplay = b.americanOdds || '';
    const winnings = b.stake ? Math.round(b.stake * b.odds) - b.stake : 0;
    const totalReturn = b.stake ? Math.round(b.stake * b.odds) : 0;

    // Preview: what $100 wins at these odds
    const preview100 = Math.round(100 * b.odds) - 100;

    html += `<div class="mg-betslip-item">
      <div class="flex-between">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.description}</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px">
            <span style="font-size:20px;font-weight:700;color:var(--mg-green)">${americanDisplay}</span>
            <span class="text-xs text-muted">${b.odds}x &bull; $100 wins $${preview100}</span>
          </div>
        </div>
        <button class="mg-betslip-remove" onclick="window.MG.removeFromSlip(${i})">&times;</button>
      </div>
      <div style="margin-top:10px">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:16px;font-weight:700;color:var(--mg-text)">$</span>
          <input class="mg-stake-input" type="number" placeholder="Enter wager" value="${b.stake || ''}" oninput="window.MG.updateStake(${i}, this.value)" inputmode="numeric" style="flex:1">
        </div>
        <div class="mg-preset-amounts">
          <button class="mg-preset-btn" onclick="window.MG.updateStake(${i},10);this.closest('.mg-betslip-item').querySelector('.mg-stake-input').value=10">$10</button>
          <button class="mg-preset-btn" onclick="window.MG.updateStake(${i},25);this.closest('.mg-betslip-item').querySelector('.mg-stake-input').value=25">$25</button>
          <button class="mg-preset-btn" onclick="window.MG.updateStake(${i},50);this.closest('.mg-betslip-item').querySelector('.mg-stake-input').value=50">$50</button>
          <button class="mg-preset-btn" onclick="window.MG.updateStake(${i},100);this.closest('.mg-betslip-item').querySelector('.mg-stake-input').value=100">$100</button>
        </div>
        <div class="mg-slip-payout" style="margin-top:6px;display:flex;justify-content:space-between;font-size:13px">
          ${b.stake
            ? `<div style="color:var(--mg-win)">To win: $${winnings.toLocaleString()}</div><div style="font-weight:600;color:var(--mg-gold-dim)">Total return: $${totalReturn.toLocaleString()}</div>`
            : `<div style="color:var(--mg-text-muted)">Enter stake amount</div>`
          }
        </div>
      </div>
    </div>`;
  });

  const allHaveStakes = state._betSlip.every(b => b.stake > 0);
  const totalStake = state._betSlip.reduce((sum, b) => sum + (b.stake || 0), 0);

  html += `<div class="mt-2">
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">Total stake</span>
        <span class="fw-bold mg-slip-total">$${totalStake.toLocaleString()}</span>
      </div>
      <button class="mg-btn mg-btn-primary" ${!allHaveStakes ? 'disabled' : ''} onclick="window.MG.placeBets()">
        Place Bet${state._betSlip.length > 1 ? 's' : ''}
      </button>
    </div>
    </div></div>`;

  return html;
}

// ─── CASH MY BETS (Warrior / Buddies) ───
function renderCashMyBets(state) {
  const slug = state._slug || 'event';
  const myName = state.bettorName || '';

  if (!myName) {
    return `<div style="padding:40px 20px;text-align:center">
      <p class="text-sm text-muted">Pick your name on the Bet tab to track your bets</p>
      <a href="#bet" class="mg-btn mg-btn-primary" style="margin-top:12px;width:auto;padding:10px 24px;text-decoration:none;display:inline-block">Go to Bet</a>
    </div>`;
  }

  const allBets = getCashBets(slug);
  const myBets = allBets.filter(b => b.player === myName);
  const active = myBets.filter(b => b.status === 'active');
  const won = myBets.filter(b => b.status === 'won');
  const lost = myBets.filter(b => b.status === 'lost');
  const totalRisked = myBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = won.reduce((s, b) => s + (b.amount || 0), 0);
  const totalLost = lost.reduce((s, b) => s + (b.amount || 0), 0);
  const net = totalWon - totalLost;

  let html = `<div class="mg-card">
    <div style="font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:10px">${escHtml(myName)}</div>
    <div style="display:flex;gap:0;border:1px solid var(--mg-border);border-radius:8px;overflow:hidden">
      <div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid var(--mg-border)">
        <div class="text-xs text-muted">Active</div>
        <div style="font-weight:700;font-size:18px">${active.length}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid var(--mg-border)">
        <div class="text-xs text-muted">Won</div>
        <div style="font-weight:700;font-size:18px;color:var(--mg-win)">${won.length}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid var(--mg-border)">
        <div class="text-xs text-muted">Lost</div>
        <div style="font-weight:700;font-size:18px;color:var(--mg-loss)">${lost.length}</div>
      </div>
      <div style="flex:1;text-align:center;padding:10px 6px">
        <div class="text-xs text-muted">Net</div>
        <div style="font-weight:700;font-size:18px;color:${net>=0?'var(--mg-win)':'var(--mg-loss)'}">${net>=0?'+':''}$${net}</div>
      </div>
    </div>
  </div>`;

  if (myBets.length === 0) {
    html += `<div class="mg-card" style="text-align:center;padding:40px 20px">
      <div style="font-size:32px;margin-bottom:8px">&#127183;</div>
      <p style="font-size:16px;font-weight:600;color:var(--mg-green)">No bets yet</p>
      <p class="text-sm text-muted" style="margin-top:4px;margin-bottom:16px">Head to the Bet tab to note your first wager</p>
      <a href="#bet" class="mg-btn mg-btn-primary" style="width:auto;padding:10px 24px;text-decoration:none;display:inline-block">+ Make a Bet</a>
    </div>`;
    return html;
  }

  if (active.length > 0) {
    html += `<div class="mg-section-title">Active (${active.length})</div>`;
    active.forEach(b => {
      html += `<div class="mg-bet-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="mg-bet-desc">${escHtml(b.desc)}</div>
          <div style="font-size:20px;font-weight:800;color:var(--mg-gold)">$${b.amount}</div>
        </div>
        <button onclick="window.MG.removeCashBet('${b.id}')" style="flex-shrink:0;background:transparent;border:1px solid var(--mg-border);border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;color:var(--mg-text-muted)">Remove</button>
      </div>`;
    });
  }

  if (won.length > 0) {
    html += `<div class="mg-section-title" style="margin-top:16px">Won (${won.length})</div>`;
    won.forEach(b => {
      html += `<div class="mg-bet-card" style="border-left:3px solid var(--mg-win)">
        <div class="mg-bet-desc">${escHtml(b.desc)}</div>
        <div style="font-size:16px;font-weight:700;color:var(--mg-win)">+$${b.amount}</div>
      </div>`;
    });
  }

  if (lost.length > 0) {
    html += `<div class="mg-section-title" style="margin-top:16px">Lost (${lost.length})</div>`;
    lost.forEach(b => {
      html += `<div class="mg-bet-card" style="border-left:3px solid var(--mg-loss);opacity:0.7">
        <div class="mg-bet-desc">${escHtml(b.desc)}</div>
        <div style="font-size:16px;font-weight:700;color:var(--mg-loss)">-$${b.amount}</div>
      </div>`;
    });
  }

  return html;
}

// ===== MY BETS =====
export function renderMyBets(state) {
  const eventType = getEventType(state);
  if (eventType === 'quick' || eventType === 'buddies_trip') return renderCashMyBets(state);
  if (!state.bettorName) {
    return `<div style="padding:40px 20px;text-align:center">
      <p class="text-sm text-muted">Enter your name on the Bet tab to see your bets</p>
    </div>`;
  }

  // #2: Merge server bets with local — server is source of truth
  const myName = state.bettorName.toLowerCase();
  const serverMyBets = (state._serverBets || []).filter(b => (b.bettor || '').toLowerCase() === myName);
  const localMyBets = (state.bets || []).filter(b => (b.bettor || '').toLowerCase() === myName);
  // Dedupe: prefer server version if same id exists
  const serverIds = new Set(serverMyBets.map(b => b.id));
  const merged = [...serverMyBets, ...localMyBets.filter(b => !serverIds.has(b.id))];
  // Add pending bets
  const pendingBets = JSON.parse(sessionStorage.getItem('mg_pending_bets') || '[]')
    .filter(b => (b.bettor || '').toLowerCase() === myName);

  const active = merged.filter(b => b.status === "active");
  const settled = merged.filter(b => b.status !== "active" && b.status !== "voided");
  const voided = merged.filter(b => b.status === "voided");

  let html = ``;

  // Player card
  html += `<div class="mg-card">
    <div style="margin-bottom:8px">
      <div style="font-size:18px;font-weight:700;color:var(--mg-green)">${escHtml(state.bettorName)}</div>
    </div>
    <div style="display:flex;gap:12px">
      <div style="flex:1;text-align:center">
        <div class="text-xs text-muted">Active</div>
        <div style="font-weight:700">${active.length}</div>
      </div>
      <div style="flex:1;text-align:center">
        <div class="text-xs text-muted">Won</div>
        <div style="font-weight:700;color:var(--mg-win)">${settled.filter(b=>b.status==='won').length}</div>
      </div>
      <div style="flex:1;text-align:center">
        <div class="text-xs text-muted">Lost</div>
        <div style="font-weight:700;color:var(--mg-loss)">${settled.filter(b=>b.status==='lost').length}</div>
      </div>
    </div>
  </div>`;

  // Pending bets (offline queue)
  if (pendingBets.length > 0) {
    html += `<div class="mg-section-title">Pending (${pendingBets.length})</div>`;
    pendingBets.forEach(b => {
      html += `<div class="mg-bet-card" style="border-left:3px solid var(--gold-bright)">
        <div class="mg-bet-type">PENDING — will submit when online</div>
        <div class="mg-bet-desc">${escHtml(b.description || '')}</div>
        <div class="text-xs text-muted">$${(b.stake || 0).toLocaleString()}</div>
      </div>`;
    });
  }

  if (merged.length === 0 && pendingBets.length === 0) {
    html += `<div class="mg-card text-center" style="padding:40px 20px">
      <div style="font-size:32px;margin-bottom:8px">&#127183;</div>
      <p style="font-size:16px;font-weight:600;color:var(--mg-green)">No bets yet</p>
      <p class="text-sm text-muted mt-2">Head to the Bet tab to place your first wager</p>
    </div>`;
  }

  if (active.length > 0) {
    html += `<div class="mg-section-title">Active (${active.length})</div>`;
    active.forEach(b => {
      const potentialPayout = Math.round(b.stake * b.odds);
      const toWin = potentialPayout - b.stake;
      const americanDisplay = b.americanOdds || '';
      const timeStr = formatBetTime(b);
      html += `<div class="mg-bet-card">
        <div class="mg-bet-type">${b.type.replace(/_/g, " ")}${timeStr ? ` &bull; ${timeStr}` : ''}</div>
        <div class="mg-bet-desc">${escHtml(b.description || '')}</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin:4px 0">
          <span style="font-size:20px;font-weight:800;color:var(--mg-green)">${americanDisplay}</span>
          <span class="text-xs text-muted">${b.odds}x</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="mg-bet-details" style="flex:1">
            <span>Risking $${b.stake.toLocaleString()}</span>
            <span style="font-weight:700;color:var(--mg-gold-dim)">To win $${toWin.toLocaleString()}</span>
          </div>
        </div>
        <button class="mg-share-btn" data-desc="${encodeURIComponent(b.description || '')}" data-ml="${encodeURIComponent(americanDisplay)}" data-stake="${b.stake}" data-towin="${toWin}" style="margin-top:8px;width:100%;padding:8px;border:1px solid var(--mg-border);border-radius:8px;background:transparent;color:var(--mg-text-secondary);font-size:12px;font-weight:600;cursor:pointer">Share This Bet</button>
      </div>`;
    });
  }

  if (settled.length > 0) {
    html += `<div class="mg-section-title mt-4">Settled (${settled.length})</div>`;
    settled.forEach(b => {
      const cls = b.status === "won" ? "win" : b.status === "lost" ? "loss" : "push";
      const label = b.status === "won" ? `WON +$${((b.payout || b.stake) - b.stake).toLocaleString()}`
        : b.status === "lost" ? `LOST -$${b.stake.toLocaleString()}`
        : b.status === "voided" ? `VOIDED`
        : `PUSH`;
      const americanDisplay = b.americanOdds || '';
      const timeStr = formatBetTime(b);
      html += `<div class="mg-bet-card" ${b.status === 'voided' ? 'style="opacity:0.5"' : ''}>
        <div class="flex-between">
          <div>
            <div class="mg-bet-type">${b.type.replace(/_/g, " ")}${timeStr ? ` &bull; ${timeStr}` : ''}</div>
            <div class="mg-bet-desc">${escHtml(b.description || '')}</div>
            <div class="text-xs text-muted">${americanDisplay} &bull; $${b.stake.toLocaleString()}</div>
          </div>
          <div class="mg-bet-result ${cls}" style="font-size:15px;font-weight:800">${label}</div>
        </div>
        ${b.status === 'won' ? `<button class="mg-share-btn" data-desc="${encodeURIComponent(b.description || '')}" data-ml="${encodeURIComponent(americanDisplay)}" data-stake="${b.stake}" data-towin="${(b.payout || b.stake) - b.stake}" data-status="won" style="margin-top:8px;width:100%;padding:8px;border:1px solid var(--mg-win);border-radius:8px;background:rgba(63,185,80,0.1);color:var(--mg-win);font-size:12px;font-weight:700;cursor:pointer">Brag About This Win</button>` : ''}
      </div>`;
    });
  }

  return html;
}

// #9: Format bet timestamp
function formatBetTime(b) {
  const ts = b.placedAt || b.timestamp;
  if (!ts) return '';
  const d = new Date(ts);
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ===== CALCUTTA AUCTION =====
export function renderCalcutta(state) {
  const calcutta = state._calcutta || { status: 'pending', currentTeam: null, teams: {}, pool: 0, payoutSplit: [50, 25, 15, 10], teamOrder: [] };
  const isAdmin = state.adminAuthed;
  const teams = calcutta.teams || {};
  const teamOrder = calcutta.teamOrder || Object.keys(teams);
  const soldCount = Object.values(teams).filter(t => t.sold).length;
  const totalTeams = teamOrder.length;

  let html = '';

  // Header
  html += `<div class="mg-card" style="background:linear-gradient(135deg,var(--mg-green),var(--mg-green-light));color:var(--text-primary);padding:20px;text-align:center;border:none">
    <div style="font-size:22px;font-weight:700">Calcutta Auction</div>
    <div style="display:flex;justify-content:center;gap:24px;margin-top:12px">
      <div><div style="font-size:24px;font-weight:800;color:var(--gold-bright)">$${calcutta.pool.toLocaleString()}</div><div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:1px">Auction Pool</div></div>
      <div><div style="font-size:24px;font-weight:800;color:var(--text-primary)">${soldCount}/${totalTeams}</div><div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:1px">Teams Sold</div></div>
    </div>
  </div>`;

  // ── PENDING STATE ──
  if (calcutta.status === 'pending') {
    html += `<div class="mg-card" style="text-align:center;padding:40px 20px">
      <div style="font-size:48px;margin-bottom:12px">&#9939;</div>
      <div style="font-size:16px;font-weight:600;color:var(--mg-text)">Auction has not started</div>
      <div style="font-size:13px;color:var(--mg-text-muted);margin-top:4px">${totalTeams > 0 ? totalTeams + ' teams available' : 'Teams will be loaded from event config'}</div>
      ${isAdmin ? `<button class="mg-btn mg-btn-gold" style="margin-top:20px;padding:14px 28px;font-size:15px;min-height:48px" onclick="window.MG.calcuttaStart()">Start Auction</button>` : ''}
    </div>`;
    return html;
  }

  // ── ACTIVE STATE ──
  if (calcutta.status === 'active' && calcutta.currentTeam) {
    const teamName = calcutta.currentTeam;
    const teamData = teams[teamName] || { bids: [], sold: false };
    const highBid = teamData.bids.length > 0 ? teamData.bids[teamData.bids.length - 1] : null;
    const teamIdx = teamOrder.indexOf(teamName);

    // Progress indicator
    html += `<div style="padding:8px 16px;font-size:11px;color:var(--mg-text-muted);text-align:center">
      Team ${teamIdx + 1} of ${totalTeams}
    </div>`;

    // Current bidding card
    html += `<div class="mg-card" style="border:2px solid var(--mg-gold);padding:0;overflow:hidden">
      <div style="background:var(--mg-green);padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px">NOW BIDDING</div>
        <div style="font-size:20px;font-weight:700;color:var(--text-primary)">${escHtml(teamName)}</div>
      </div>
      <div style="padding:20px;text-align:center">`;

    if (highBid) {
      html += `<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:4px">CURRENT BID</div>
        <div style="font-size:36px;font-weight:900;color:var(--mg-gold);font-family:'SF Mono',monospace">$${highBid.amount.toLocaleString()}</div>
        <div style="font-size:13px;color:var(--mg-text-secondary);margin-top:4px">${escHtml(highBid.bidder)}</div>`;
    } else {
      html += `<div style="font-size:36px;font-weight:900;color:var(--mg-text-muted);font-family:'SF Mono',monospace">$0</div>
        <div style="font-size:13px;color:var(--mg-text-muted);margin-top:4px">No bids yet</div>`;
    }

    html += `</div>`;

    // Quick bid buttons (large touch targets for tablet)
    const currentAmt = highBid ? highBid.amount : 0;
    const increments = [25, 50, 100];
    html += `<div style="padding:0 20px 12px;display:flex;gap:8px;justify-content:center">`;
    increments.forEach(inc => {
      const newBid = currentAmt + inc;
      html += `<button class="mg-btn" style="flex:1;padding:14px 8px;font-size:15px;font-weight:700;min-height:48px;background:var(--mg-green);color:var(--text-primary);border:none;border-radius:8px;cursor:pointer"
        onclick="window.MG.calcuttaQuickBid(${newBid})">+$${inc}</button>`;
    });
    html += `</div>`;

    // Custom bid input
    html += `<div style="padding:0 20px 16px">
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="calcutta-bidder" placeholder="Your Name"
          style="flex:1;padding:12px;border:1px solid var(--mg-border);border-radius:8px;font-size:14px;min-height:48px;background:var(--mg-surface);color:var(--mg-text)"
          value="${escHtml(state._calcuttaBidder || state.bettorName || '')}">
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <div style="position:relative;flex:1">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mg-text-muted);font-size:14px;font-weight:600">$</span>
          <input type="number" id="calcutta-amount" placeholder="Custom amount" min="${currentAmt + 1}"
            style="width:100%;padding:12px 12px 12px 24px;border:1px solid var(--mg-border);border-radius:8px;font-size:14px;min-height:48px;background:var(--mg-surface);color:var(--mg-text)">
        </div>
        <button class="mg-btn mg-btn-gold" style="padding:12px 20px;font-size:14px;font-weight:700;min-height:48px;white-space:nowrap" onclick="window.MG.calcuttaPlaceBid()">Place Bid</button>
      </div>
    </div>`;

    // Admin controls
    if (isAdmin) {
      html += `<div style="padding:12px 20px 20px;border-top:1px solid var(--mg-border);display:flex;gap:8px">
        <button class="mg-btn" style="flex:1;padding:12px;font-size:14px;font-weight:700;min-height:48px;background:var(--gold-primary);color:var(--bg-secondary);border:none;border-radius:8px;cursor:pointer" onclick="window.MG.calcuttaSold()">Sold!</button>
        <button class="mg-btn" style="flex:1;padding:12px;font-size:14px;font-weight:600;min-height:48px;background:var(--mg-surface);color:var(--mg-text);border:1px solid var(--mg-border);border-radius:8px;cursor:pointer" onclick="window.MG.calcuttaNext()">Next Team</button>
      </div>`;
    }

    // Bid history for current team
    if (teamData.bids.length > 0) {
      html += `<div style="padding:0 20px 16px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:8px">Bid History</div>`;
      [...teamData.bids].reverse().forEach((bid, i) => {
        html += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--mg-border);${i === 0 ? 'font-weight:700;color:var(--mg-gold-dim)' : 'color:var(--mg-text-muted)'}">
          <span style="font-size:13px">${escHtml(bid.bidder)}</span>
          <span style="font-size:13px;font-family:'SF Mono',monospace">$${bid.amount.toLocaleString()}</span>
        </div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  }

  // ── COMPLETE STATE ──
  if (calcutta.status === 'complete') {
    html += `<div class="mg-card" style="text-align:center;padding:20px">
      <div style="font-size:16px;font-weight:700;color:var(--mg-green)">Auction Complete</div>
      <div style="font-size:13px;color:var(--mg-text-muted);margin-top:4px">All teams have been sold</div>
    </div>`;
  }

  // ── ALL TEAMS LISTING (sold results + payout projection) ──
  if (soldCount > 0 || calcutta.status === 'complete') {
    const payoutSplit = calcutta.payoutSplit || [50, 25, 15, 10];
    html += `<div class="mg-card" style="padding:16px">
      <div class="mg-card-header" style="margin-bottom:12px">AUCTION RESULTS</div>`;

    // Payout split info
    if (calcutta.pool > 0) {
      html += `<div style="display:flex;gap:8px;margin-bottom:16px;justify-content:center">`;
      payoutSplit.forEach((pct, i) => {
        const places = ['1st', '2nd', '3rd', '4th'];
        const amt = Math.round(calcutta.pool * pct / 100);
        html += `<div style="text-align:center;padding:8px 12px;background:${i === 0 ? 'rgba(212,160,23,0.15)' : 'var(--mg-odds-bg)'};border-radius:6px">
          <div style="font-size:10px;font-weight:700;color:${i === 0 ? 'var(--mg-gold-dim)' : 'var(--mg-text-muted)'}">${places[i] || (i+1)+'th'}</div>
          <div style="font-size:14px;font-weight:700;color:var(--mg-text);font-family:'SF Mono',monospace">$${amt.toLocaleString()}</div>
          <div style="font-size:9px;color:var(--mg-text-muted)">${pct}%</div>
        </div>`;
      });
      html += `</div>`;
    }

    // Teams list
    teamOrder.forEach(name => {
      const t = teams[name] || {};
      if (t.sold) {
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--mg-border)">
          <div>
            <div style="font-size:14px;font-weight:600">${escHtml(name)}</div>
            <div style="font-size:12px;color:var(--mg-text-muted)">Owned by ${escHtml(t.winner)}</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--mg-gold-dim);font-family:'SF Mono',monospace">$${t.amount.toLocaleString()}</div>
        </div>`;
      } else {
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--mg-border)">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--mg-text-muted)">${escHtml(name)}</div>
          </div>
          <div style="font-size:12px;color:var(--mg-text-muted)">Unsold</div>
        </div>`;
      }
    });
    html += `</div>`;
  }

  // Admin reset
  if (isAdmin && calcutta.status !== 'pending') {
    html += `<div style="text-align:center;padding:20px">
      <button class="mg-btn mg-btn-outline" style="font-size:12px;padding:8px 16px;color:var(--mg-text-muted)" onclick="if(confirm('Reset the entire Calcutta auction?')) window.MG.calcuttaReset()">Reset Auction</button>
    </div>`;
  }

  return html;
}

// ===== CALCUTTA SECTION FOR SCRAMBLE LEADERBOARD =====
function renderCalcuttaSection(state) {
  const calcutta = state._calcutta;
  if (!calcutta) return '';
  const config = state._config;
  if (!config?.features?.calcutta) return '';

  const teams = calcutta.teams || {};
  const soldCount = Object.values(teams).filter(t => t.sold).length;

  let html = `<div class="mg-card" style="padding:16px;border:1px solid rgba(212,160,23,0.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="mg-card-header" style="margin:0">CALCUTTA AUCTION</div>
      <a href="#calcutta" style="font-size:12px;color:var(--mg-gold);text-decoration:none;font-weight:600">View Full Auction</a>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <span style="font-size:10px;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px">Pool</span>
        <span style="font-size:18px;font-weight:800;color:var(--mg-gold);margin-left:8px;font-family:'SF Mono',monospace">$${(calcutta.pool || 0).toLocaleString()}</span>
      </div>
      <div style="font-size:12px;color:var(--mg-text-muted)">${soldCount} teams sold</div>
    </div>`;

  if (calcutta.status === 'active' && calcutta.currentTeam) {
    const teamData = teams[calcutta.currentTeam] || { bids: [] };
    const topBid = teamData.bids.length > 0 ? teamData.bids[teamData.bids.length - 1] : null;
    html += `<div style="margin-top:12px;padding:10px;background:rgba(212,160,23,0.08);border-radius:6px;text-align:center">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--mg-gold-dim)">NOW BIDDING</div>
      <div style="font-size:14px;font-weight:700;margin-top:2px">${escHtml(calcutta.currentTeam)}</div>
      ${topBid ? `<div style="font-size:18px;font-weight:800;color:var(--mg-gold);font-family:'SF Mono',monospace;margin-top:4px">$${topBid.amount.toLocaleString()}</div>` : ''}
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ===== SHOOTOUT =====
export function renderShootout(state) {
  if (!state.shootout) state.shootout = { teams: [], holes: {}, eliminated: [] };

  let html = `<div class="mg-section-title">Championship Shootout</div>
    <p class="text-sm text-muted mb-4">8 flight winners + 1 wild card. 4 elimination holes (15-18).</p>`;

  if (state.shootout.teams.length === 0) {
    // Check if all flights are decided
    const flightWinners = [];
    let allDecided = true;
    flightOrder().forEach(fId => {
      const standings = calcStandings(fId, state.matches);
      const flightMatches = Object.values(state.matches).filter(m => m.flight === fId);
      const allFinal = flightMatches.every(m => m.status === "final");
      if (allFinal && standings[0].points > 0) {
        flightWinners.push({ teamId: standings[0].teamId, flight: fId, points: standings[0].points });
      } else {
        allDecided = false;
      }
    });

    if (!allDecided) {
      html += `<div class="mg-card text-center" style="padding:40px 20px">
        <p style="font-size:16px;font-weight:600;color:var(--mg-green)">Awaiting Flight Results</p>
        <p class="text-sm text-muted mt-2">Shootout begins after all flights are decided</p>
      </div>`;
    } else {
      html += `<div class="mg-card">
        <div class="mg-card-header">Flight Winners</div>`;
      flightWinners.forEach(fw => {
        const t = T(fw.teamId);
        html += `<div style="padding:6px 0;font-size:13px"><strong>${F(fw.flight).name}:</strong> ${t.member} & ${t.guest} (${fw.points} pts)</div>`;
      });
      html += `<button class="mg-btn mg-btn-gold mt-4" onclick="window.MG.startShootout()">Start Shootout</button></div>`;
    }
  } else {
    // Shootout in progress
    const holes = [15, 16, 17, 18];
    const alive = state.shootout.teams.filter(tid => !state.shootout.eliminated.includes(tid));

    html += `<div class="mg-card">
      <div class="mg-card-header">Remaining Teams (${alive.length})</div>`;
    alive.forEach(tid => {
      const t = T(tid);
      html += `<div style="padding:4px 0;font-size:13px;font-weight:600">${t.member} & ${t.guest}</div>`;
    });
    html += `</div>`;

    if (state.shootout.eliminated.length > 0) {
      html += `<div class="mg-card">
        <div class="mg-card-header">Eliminated</div>`;
      state.shootout.eliminated.forEach(tid => {
        const t = T(tid);
        html += `<div class="mg-eliminated" style="padding:4px 0;font-size:13px">${t.member} & ${t.guest}</div>`;
      });
      html += `</div>`;
    }

    if (alive.length === 1) {
      const winner = T(alive[0]);
      html += `<div class="mg-card text-center" style="padding:30px">
        <div style="font-size:40px">\u{1F3C6}</div>
        <div style="font-size:22px;font-weight:700;color:var(--mg-gold-dim);margin-top:8px">Champions!</div>
        <div style="font-size:18px;font-weight:600;color:var(--mg-green);margin-top:4px">${winner.member} & ${winner.guest}</div>
      </div>`;
    }
  }

  return html;
}

// ===== SETTLEMENT CARD =====
export function renderSettlement(state) {
  // Spectator mode: show informational message with admin PIN entry
  if (state._spectatorMode && !state.adminAuthed) {
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:40px 20px;text-align:center">
      <div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--gold-bright);margin-bottom:16px">SETTLE</div>
      <div style="font-size:18px;font-weight:600;color:var(--text-primary);margin-bottom:8px;line-height:1.4">This round's settlement is managed by the event organizer.</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:28px">Enter the admin PIN to view or manage settlement.</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="inline-pin" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" style="width:100px;padding:12px 14px;border:1.5px solid var(--border-strong,var(--border));border-radius:8px;font-size:16px;text-align:center;background:var(--bg-secondary);color:var(--text-primary);letter-spacing:4px" onkeydown="if(event.key==='Enter')window.MG.inlineAuth()">
        <button onclick="window.MG.inlineAuth()" style="padding:12px 24px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap">Enter Admin PIN</button>
      </div>
    </div>`;
  }

  const gameState = state._gameState;
  const holes = state._holes || {};
  const config = state._config;
  const games = config?.games || {};
  const holesPlayed = Object.keys(holes).length;

  const isTrophy = state._trophyMode;

  let html = '';

  if (isTrophy) {
    html += `<div class="mg-card" style="background:linear-gradient(135deg,var(--mg-gold),var(--mg-gold-dim));padding:20px;text-align:center;border:none">
      <div style="font-size:22px;font-weight:700;color:var(--mg-green)">Trophy Room</div>
      <div style="font-size:13px;color:var(--mg-green);opacity:.7;margin-top:4px">${escHtml(config?.event?.name || 'Golf Event')} &middot; Final Results</div>
    </div>`;
  }

  html += `<div class="mg-section-title" style="display:flex;justify-content:space-between;align-items:center">
    <span>Settlement Card</span>
    <div style="display:flex;gap:8px">
      ${isTrophy ? '' : `<button class="mg-btn" style="width:auto;padding:6px 14px;font-size:12px;background:var(--mg-surface);border:1px solid var(--mg-border);color:var(--mg-text)" onclick="window.MG.getRecap()">AI Recap</button>
      <button class="mg-btn mg-btn-gold" style="width:auto;padding:6px 16px;font-size:13px" onclick="window.MG.exportSettlementCard()">&#x1F4F8; Export</button>
      <button class="mg-btn mg-btn-gold" style="width:auto;padding:6px 16px;font-size:13px" onclick="window.MG.shareSettlement()">Share</button>`}
    </div>
  </div>
  <div id="mg-recap-card" style="display:none"></div>`;

  if (!gameState || holesPlayed === 0) {
    html += `<div class="mg-card" style="text-align:center;padding:40px 20px">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--mg-text-muted);margin-bottom:10px">NO SCORES YET</div>
      <div style="font-size:16px;font-weight:600;color:var(--mg-text)">Settlement appears after holes are scored</div>
    </div>`;
    return html;
  }

  const eventName = config?.event?.name || 'Golf Event';
  const eventDate = config?.event?.dates?.day1 || '';
  const settlePlayers = getPlayersFromConfig(config);
  const settlePnL = computeRoundPnL(gameState, settlePlayers, games, config?.structure);
  const settleHasPnL = Object.values(settlePnL).some(v => v !== 0);
  const payPairs = computePayablePairs(settlePnL);

  html += `<div class="mg-card" style="background:var(--mg-surface);border:1px solid var(--mg-gold-dim);padding:16px;text-align:center">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--mg-text-muted)">${escHtml(eventDate)}</div>
    <div style="font-size:20px;font-weight:700;color:var(--mg-gold-dim);margin:4px 0">${escHtml(eventName)}</div>
    <div style="font-size:12px;color:var(--mg-text-muted)">${holesPlayed} hole${holesPlayed !== 1 ? 's' : ''} played</div>
  </div>`;

  // ── Who pays who (top-level summary) ──
  if (settleHasPnL) {
    // P&L summary row per player
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">FINAL STANDINGS</div>`;
    const sortedPlayers = [...settlePlayers].sort((a, b) => (settlePnL[b.name] || 0) - (settlePnL[a.name] || 0));
    sortedPlayers.forEach((p, i) => {
      const money = settlePnL[p.name] || 0;
      const moneyStr = money === 0 ? 'Even' : money > 0 ? `+$${money}` : `-$${Math.abs(money)}`;
      const moneyColor = money > 0 ? 'var(--win)' : money < 0 ? 'var(--loss)' : 'var(--mg-text-muted)';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;${i < sortedPlayers.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <div style="font-size:15px;font-weight:600">${escHtml(p.name)}</div>
        <div style="font-size:22px;font-weight:800;color:${moneyColor}">${moneyStr}</div>
      </div>`;
    });
    html += `</div>`;

    if (payPairs.length > 0) {
      html += `<div class="mg-card" style="padding:16px;border:2px solid var(--mg-gold)">
        <div class="mg-card-header" style="margin-bottom:12px">WHO PAYS WHO</div>
        <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:12px">Tap a name to open payment app with amount pre-filled</div>`;
      // Build venmo handle lookup from config players
      const venmoHandles = {};
      (config?.players || config?.roster || []).forEach(p => {
        if (p.venmo) venmoHandles[p.name || p.member] = p.venmo.replace(/^@/, '');
      });
      payPairs.forEach(({ from, to, amount }) => {
        const noteText = encodeURIComponent(`${eventName} \u00b7 Waggle Settlement`);
        // Use Venmo handle if available, otherwise fall back to name
        const toVenmo = venmoHandles[to] || to;
        const venmoUrl = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(toVenmo)}&amount=${amount}&note=${noteText}`;
        const venmoWeb = `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(toVenmo)}&amount=${amount}&note=${noteText}`;
        const cashappUrl = `https://cash.app/$${encodeURIComponent(toVenmo.split(' ')[0].toLowerCase())}/${amount}`;
        html += `<div style="padding:14px 0;border-bottom:1px solid var(--mg-border)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div>
              <div style="font-size:15px;font-weight:700"><span style="color:var(--loss)">${escHtml(from)}</span> <span style="font-size:13px;font-weight:500;color:var(--mg-text-muted)">pays</span> <span style="color:var(--win)">${escHtml(to)}</span></div>
            </div>
            <div style="font-size:28px;font-weight:900;color:var(--mg-text)">$${amount}</div>
          </div>
          <div style="display:flex;gap:8px">
            <a href="${venmoUrl}" onclick="if(!this.href.startsWith('venmo'))return;event.preventDefault();window.location.href=this.href;setTimeout(()=>window.open('${venmoWeb}','_blank'),1200)"
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:#3D95CE;color:var(--text-primary);padding:14px 12px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;min-height:48px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 1.5c.9 1.5 1.3 3 1.3 4.9 0 6.1-5.2 14-9.4 19.6H3.5L0 2.3l7.1-.7 1.9 15.2C11.3 13 14 6.4 14 3.5c0-1.2-.2-2-.6-2.7l6.1.7z"/></svg>
              Venmo $${amount}</a>
            <a href="${cashappUrl}" target="_blank" rel="noopener"
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--win);color:var(--text-primary);padding:14px 12px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;min-height:48px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm3.5 14.3c-.7.9-1.8 1.4-3.2 1.4-1.6 0-2.8-.6-3.6-1.6l1.5-1.5c.5.6 1.2 1 2.1 1 .7 0 1.2-.3 1.2-.8s-.4-.7-1.4-1l-.8-.2c-1.8-.5-2.6-1.3-2.6-2.8 0-2 1.5-3.1 3.3-3.1 1.3 0 2.4.5 3.1 1.3l-1.4 1.4c-.4-.5-1-.8-1.7-.8-.6 0-1 .3-1 .7 0 .4.3.6 1.1.8l.9.3c2 .6 2.8 1.4 2.8 2.9 0 .8-.3 1.5-.8 2z"/></svg>
              Cash App</a>
          </div>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ── Skins ──
  if (games.skins && gameState.skins) {
    const s = gameState.skins;
    const sHolesNorm = getSkinsHoles(gameState, holes, players);
    const skinWinners = Object.entries(sHolesNorm).filter(([, d]) => d.winner);
    const carryovers = Object.entries(sHolesNorm).filter(([, d]) => d.carried);
    const totalPot = skinWinners.reduce((sum, [, d]) => sum + (d.potWon || 1), 0);

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span>SKINS</span>
        <span style="font-size:12px;color:var(--mg-text-muted)">${skinWinners.length} won · ${carryovers.length} carried</span>
      </div>`;

    if (skinWinners.length === 0) {
      html += `<div style="font-size:13px;color:var(--mg-text-muted);text-align:center;padding:8px 0">No skins won yet</div>`;
    } else {
      // Aggregate skins per player
      const tally = {};
      skinWinners.forEach(([h, d]) => {
        if (!tally[d.winner]) tally[d.winner] = { holes: [], total: 0 };
        tally[d.winner].holes.push(parseInt(h));
        tally[d.winner].total += (d.potWon || 1);
      });
      Object.entries(tally)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([name, data]) => {
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border)">
            <div>
              <div style="font-size:13px;font-weight:600">${escHtml(name)}</div>
              <div style="font-size:11px;color:var(--mg-text-muted)">H${data.holes.join(', H')}</div>
            </div>
            <div style="font-size:18px;font-weight:700;color:var(--mg-gold)">×${data.total}</div>
          </div>`;
        });
    }

    if (carryovers.length > 0) {
      html += `<div style="font-size:12px;color:var(--mg-text-muted);margin-top:8px">Carried: H${carryovers.map(([h]) => h).join(', H')}</div>`;
    }
    html += `</div>`;
  }

  // ── Nassau ──
  if (games.nassau && gameState.nassau?.running) {
    const r = gameState.nassau.running;
    const players = Object.keys(r).sort((a, b) => (r[a].total || 0) - (r[b].total || 0));

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">NASSAU</div>
      <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;font-size:11px;font-weight:600;color:var(--mg-text-muted);margin-bottom:6px">
        <span>Player</span><span>Front</span><span>Back</span><span>Total</span>
      </div>`;

    const best = { total: Math.min(...players.map(n => r[n].total || 0)) };
    players.forEach((name, i) => {
      const s = r[name];
      const isLeader = (s.total || 0) === best.total;
      html += `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border);${i === 0 ? 'background:rgba(63,185,80,0.05);' : ''}">
        <span style="font-size:13px;font-weight:${isLeader ? '700' : '400'}">${escHtml(name)}</span>${isLeader ? `<span style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--mg-gold);background:rgba(212,160,23,0.12);border:1px solid rgba(212,160,23,0.3);padding:1px 5px;border-radius:3px;margin-left:6px">1ST</span>` : ''}
        <span style="font-size:12px;text-align:right;color:${(s.front||0) === Math.min(...players.map(n=>r[n].front||0)) ? 'var(--mg-green)' : 'inherit'}">${s.front ?? '—'}</span>
        <span style="font-size:12px;text-align:right;color:${(s.back||0) === Math.min(...players.map(n=>r[n].back||0)) ? 'var(--mg-green)' : 'inherit'}">${s.back ?? '—'}</span>
        <span style="font-size:14px;font-weight:700;text-align:right;color:${isLeader ? 'var(--mg-green)' : 'inherit'}">${s.total ?? '—'}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Wolf ──
  if (games.wolf && gameState.wolf?.running) {
    const r = gameState.wolf.running;
    const players = Object.keys(r).sort((a, b) => (r[b] || 0) - (r[a] || 0));
    const leader = players[0];

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">WOLF</div>`;

    players.forEach((name, i) => {
      const pts = r[name] || 0;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border)">
        <span style="font-size:13px;font-weight:${i === 0 ? '700' : '400'}">${escHtml(name)}</span>${i === 0 ? `<span style="font-size:9px;font-weight:800;letter-spacing:1px;color:#9B6DFF;background:rgba(155,109,255,0.1);border:1px solid rgba(155,109,255,0.3);padding:1px 5px;border-radius:3px;margin-left:6px">WOLF</span>` : ''}
        <span style="font-size:14px;font-weight:700;color:${i === 0 ? 'var(--mg-gold)' : 'inherit'}">${pts} pts</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── 3-Player 9s ──
  if (games.nines && gameState.nines?.running) {
    const ninesRunning = gameState.nines.running;
    const ninesPlayers = Object.entries(ninesRunning).sort((a, b) => b[1] - a[1]);

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">3-PLAYER 9s</div>`;

    ninesPlayers.forEach(([name, pts], i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border)">
        <span style="font-size:13px;font-weight:${i === 0 ? '700' : '400'}">${escHtml(name)}</span>
        <span style="font-size:14px;font-weight:700;color:${i === 0 ? 'var(--mg-gold)' : 'inherit'}">${pts} pts</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Team Scramble ──
  if (games.scramble && gameState.scramble?.leaderboard) {
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">SCRAMBLE LEADERBOARD</div>`;

    gameState.scramble.leaderboard.forEach((entry, i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--mg-text-muted);width:16px">${entry.position}</span>
          <span style="font-size:13px;font-weight:${i === 0 ? '700' : '400'}">${escHtml(entry.team)}</span>
        </div>
        <span style="font-size:14px;font-weight:700;color:${i === 0 ? 'var(--mg-gold)' : 'inherit'}">${entry.total}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Vegas ──
  if (games.vegas && gameState.vegas?.scores) {
    const vs = gameState.vegas.scores;
    const holesV = Object.keys(vs).length;
    const teamA = gameState.vegas.teamA || [];
    const teamB = gameState.vegas.teamB || [];
    let aTotal = 0, bTotal = 0;
    Object.values(vs).forEach(h => {
      aTotal += (h.teamAScore || 0);
      bTotal += (h.teamBScore || 0);
    });
    const diff = Math.abs(aTotal - bTotal);
    const winner = aTotal < bTotal ? 'A' : bTotal < aTotal ? 'B' : null;

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">VEGAS</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;text-align:center">
        <div>
          <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:4px">Team A</div>
          ${teamA.map(n => `<div style="font-size:12px">${escHtml(n)}</div>`).join('')}
          <div style="font-size:22px;font-weight:700;color:${winner==='A'?'var(--mg-green)':'inherit'};margin-top:6px">${aTotal}</div>
        </div>
        <div style="font-size:11px;color:var(--mg-text-muted)">vs</div>
        <div>
          <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:4px">Team B</div>
          ${teamB.map(n => `<div style="font-size:12px">${escHtml(n)}</div>`).join('')}
          <div style="font-size:22px;font-weight:700;color:${winner==='B'?'var(--mg-green)':'inherit'};margin-top:6px">${bTotal}</div>
        </div>
      </div>
      ${winner ? `<div style="text-align:center;margin-top:10px;font-size:13px;color:var(--mg-green);font-weight:600">Team ${winner} leads by ${diff}</div>` : `<div style="text-align:center;margin-top:10px;font-size:13px;color:var(--mg-text-muted)">All square</div>`}
    </div>`;
  }

  // ── Stroke Play Net Leaderboard ──
  if (games.stroke_play && gameState.stroke_play?.net) {
    const net = gameState.stroke_play.net;
    const sorted = Object.entries(net).sort((a, b) => (a[1] || 0) - (b[1] || 0));

    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">STROKE PLAY (Net)</div>`;

    sorted.forEach(([name, score], i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--mg-text-muted);width:16px">${i + 1}</span>
          <span style="font-size:13px;font-weight:${i === 0 ? '700' : '400'}">${escHtml(name)}</span>
        </div>
        <span style="font-size:14px;font-weight:700;color:${i === 0 ? 'var(--mg-green)' : 'inherit'}">${score}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Cash Bets Settlement ──
  const slug = state._slug || 'event';
  const cashBets = getCashBets(slug);
  if (cashBets.length > 0) {
    // Net per player: amounts they wagered on active bets (unsettled = ?)
    const activeBets = cashBets.filter(b => b.status === 'active');
    if (activeBets.length > 0) {
      html += `<div class="mg-card" style="padding:12px">
        <div class="mg-card-header" style="margin-bottom:10px">SIDE BETS (Cash)</div>
        <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:8px">These bets settle in cash or Venmo outside the app</div>`;
      activeBets.forEach(b => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--mg-border)">
          <div>
            <div style="font-size:13px;font-weight:600">${escHtml(b.player)}</div>
            <div style="font-size:12px;color:var(--mg-text-muted)">${escHtml(b.desc)}</div>
          </div>
          <div style="font-size:16px;font-weight:700;color:var(--mg-gold)">$${b.amount}</div>
        </div>`;
      });
      html += `</div>`;
    }
  }

  if (isTrophy) {
    html += `<div class="mg-card" style="text-align:center;padding:20px;font-size:13px;color:var(--mg-text-muted);border:1px dashed var(--mg-border)">
      This event is archived. Share the link to revisit these results anytime.
    </div>`;
  }

  html += `<div style="text-align:center;padding:16px 0;font-size:11px;color:var(--mg-text-muted)">Powered by Waggle · betwaggle.com</div>`;

  // Auto-present share modal when round is complete
  const holesPerRound = config?.holesPerRound || 18;
  if (holesPlayed >= holesPerRound && settleHasPnL) {
    const shownKey = `waggle_share_shown_${state._slug}`;
    if (!sessionStorage.getItem(shownKey)) {
      sessionStorage.setItem(shownKey, '1');
      const eventUrl = location.href.replace(/#.*$/, '');
      const referralUrl = 'https://betwaggle.com/create/?ref=' + encodeURIComponent(state._slug);
      html += `<div id="settle-share-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .3s ease">
        <div style="background:var(--bg-primary);border-radius:16px;max-width:380px;width:100%;padding:28px 24px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:var(--bg-secondary);margin-bottom:4px">Round Complete</div>
          <div style="font-size:14px;color:var(--text-secondary);margin-bottom:20px">${escHtml(eventName)}</div>
          <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:20px;line-height:1.6">Drop the settlement card in the group chat. Everyone sees who owes what — with Venmo links.</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button onclick="window.MG.exportSettlementCard()" style="width:100%;padding:16px;background:var(--gold-primary);color:var(--bg-secondary);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">Export Settlement Card</button>
            <button onclick="window.MG.shareSettlement()" style="width:100%;padding:16px;background:var(--bg-secondary);color:var(--text-primary);border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">Share Results</button>
          </div>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--text-secondary)">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Want to run your own?</div>
            <a href="${referralUrl}" style="display:block;padding:12px;background:rgba(212,160,23,0.1);border:1px solid rgba(212,160,23,0.3);border-radius:8px;color:var(--gold-muted);font-size:14px;font-weight:700;text-decoration:none">Create Your Outing</a>
          </div>
          <button onclick="document.getElementById('settle-share-modal').remove()" style="margin-top:12px;background:none;border:none;color:var(--text-secondary);font-size:13px;cursor:pointer;padding:8px">Dismiss</button>
        </div>
      </div>`;
    }
  }

  return html;
}

// ===== CASUAL SCORECARD =====
export function renderCasualScorecard(state) {
  const config = state._config;
  const holes = state._holes || {};
  const players = getPlayersFromConfig(config);
  const pars = getCoursePars(config);
  const hcpIndex = config?.courseHcpIndex || null; // stroke index per hole (1=hardest)
  const courseName = config?.course?.name || config?.event?.course || 'Course';
  const holesPerRound = config?.holesPerRound || 18;
  const pnl = computeRoundPnL(state._gameState, players, config?.games || {}, config?.structure);

  if (players.length === 0) {
    return `<div class="mg-card" style="text-align:center;padding:40px 20px">
      <p class="text-sm text-muted">No players found</p>
    </div>`;
  }

  let html = `<div class="mg-section-title" style="display:flex;justify-content:space-between;align-items:center">
    <span>Scorecard</span>
    <span style="font-size:11px;font-weight:400;color:var(--mg-text-muted)">${escHtml(courseName)}</span>
  </div>`;

  // Running P&L summary cards
  if (Object.values(pnl).some(v => v !== 0)) {
    html += `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:4px">`;
    players.forEach(p => {
      const money = pnl[p.name] || 0;
      const moneyStr = money === 0 ? 'E' : money > 0 ? `+$${money}` : `-$${Math.abs(money)}`;
      const color = money > 0 ? 'var(--win)' : money < 0 ? 'var(--loss)' : 'var(--mg-text-muted)';
      html += `<div style="flex-shrink:0;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;padding:8px 12px;text-align:center;min-width:70px">
        <div style="font-size:11px;color:var(--mg-text-muted);margin-bottom:2px">${escHtml(p.name.split(' ')[0])}</div>
        <div style="font-size:16px;font-weight:800;color:${color}">${moneyStr}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // Split players into groups of 4 for readability (8 players = 2 groups)
  const groupSize = 4;
  const playerGroups = [];
  for (let i = 0; i < players.length; i += groupSize) {
    playerGroups.push(players.slice(i, i + groupSize));
  }

  // Build tables: for each player group, show front 9 + back 9
  playerGroups.forEach((groupPlayers, gi) => {
    if (playerGroups.length > 1) {
      html += `<div style="font-size:11px;font-weight:700;color:var(--mg-gold-dim);text-transform:uppercase;letter-spacing:1px;margin:12px 0 4px;padding-left:4px">Group ${gi + 1}</div>`;
    }

  [0, 1].forEach(half => {
    const startHole = half * 9 + 1;
    const endHole = Math.min(startHole + 8, holesPerRound);
    const holeNums = Array.from({ length: endHole - startHole + 1 }, (_, i) => startHole + i);
    const halfPar = holeNums.reduce((s, h) => s + (pars[h - 1] || 4), 0);

    html += `<div class="mg-card" style="padding:10px;overflow-x:auto">
      <div style="font-size:11px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${half === 0 ? 'Front Nine' : 'Back Nine'}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:${holeNums.length * 32 + 80}px">
        <thead>
          <tr style="color:var(--mg-text-muted);font-size:11px">
            <th style="text-align:left;padding:3px 6px;font-weight:600;min-width:72px">Player</th>
            ${holeNums.map(h => `<th style="text-align:center;padding:3px 4px;width:28px">${h}</th>`).join('')}
            <th style="text-align:center;padding:3px 6px;min-width:32px;color:var(--mg-text)">Out</th>
          </tr>
          <tr style="background:var(--bg-tertiary)">
            <td style="padding:3px 6px;font-weight:700;font-size:11px;color:var(--mg-text-muted)">Par</td>
            ${holeNums.map(h => `<td style="text-align:center;padding:3px 4px;font-weight:600">${pars[h-1] || 4}</td>`).join('')}
            <td style="text-align:center;padding:3px 6px;font-weight:700">${halfPar}</td>
          </tr>
          ${hcpIndex ? `<tr>
            <td style="padding:3px 6px;font-weight:700;font-size:11px;color:var(--mg-text-muted)">HCP</td>
            ${holeNums.map(h => `<td style="text-align:center;padding:3px 4px;font-size:11px;color:var(--mg-text-muted)">${hcpIndex[h-1] ?? ''}</td>`).join('')}
            <td></td>
          </tr>` : ''}
        </thead>
        <tbody>`;

    groupPlayers.forEach((player, pi) => {
      let playerTotal = 0;
      const playerScores = holeNums.map(h => {
        const holeData = holes[h] || {};
        // Handle both formats: { scores: { name: score } } and { name: score }
        const holeScores = holeData.scores || holeData;
        const gross = holeScores[player.name] !== undefined ? holeScores[player.name] : null;
        if (gross !== null) playerTotal += gross;
        return gross;
      });
      const parTotal = holeNums.reduce((s, h) => s + (pars[h - 1] || 4), 0);

      html += `<tr style="${pi % 2 === 1 ? 'background:rgba(240,246,252,0.03)' : ''}">
        <td style="padding:4px 6px;font-weight:600;font-size:13px">${escHtml(player.name.split(' ')[0])}</td>`;

      playerScores.forEach((gross, idx) => {
        const h = holeNums[idx];
        const par = pars[h - 1] || 4;
        let cellStyle = 'text-align:center;padding:4px 2px;font-size:13px;';
        let display = gross !== null ? gross : '·';
        if (gross !== null) {
          const diff = gross - par;
          if (diff <= -2) cellStyle += 'background:#1d4ed8;color:var(--text-primary);border-radius:50%;width:22px;height:22px;line-height:22px;display:inline-block;'; // eagle
          else if (diff === -1) cellStyle += 'background:var(--mg-green);color:var(--text-primary);border-radius:50%;width:22px;height:22px;line-height:22px;display:inline-block;'; // birdie
          else if (diff === 1) cellStyle += 'border:2px solid var(--loss);border-radius:2px;'; // bogey
          else if (diff >= 2) cellStyle += 'border:2px solid var(--loss);border-radius:50%;'; // double+
        }
        html += `<td style="text-align:center;padding:2px"><span style="${cellStyle}">${display}</span></td>`;
      });

      const allScored = playerScores.every(s => s !== null);
      html += `<td style="text-align:center;padding:4px 6px;font-weight:700;font-size:13px">${allScored ? playerTotal : '—'}</td>`;
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
  }); // end half loop

  }); // end playerGroups loop

  // Legend
  html += `<div style="display:flex;gap:12px;padding:8px 0;font-size:11px;color:var(--mg-text-muted);justify-content:center">
    <span><span style="display:inline-block;width:14px;height:14px;background:var(--mg-green);border-radius:50%;vertical-align:middle;margin-right:3px"></span>Birdie</span>
    <span><span style="display:inline-block;width:14px;height:14px;background:#1d4ed8;border-radius:50%;vertical-align:middle;margin-right:3px"></span>Eagle</span>
    <span><span style="display:inline-block;width:14px;height:14px;border:2px solid var(--loss);border-radius:2px;vertical-align:middle;margin-right:3px"></span>Bogey+</span>
  </div>`;

  return html;
}

// ===== HELPERS =====
export function calcStandings(flightId, matches, config) {
  // config param accepted but _C is already set by initViews(); ignore
  const flight = F(flightId);
  const points = {};
  const h2h = {};
  flight.teamIds.forEach(id => { points[id] = 0; h2h[id] = {}; });

  Object.values(matches).forEach(m => {
    if (m.flight === flightId && m.status === "final") {
      points[m.teamA] += m.scoreA;
      points[m.teamB] += m.scoreB;
      // Track h2h
      h2h[m.teamA][m.teamB] = m.scoreA;
      h2h[m.teamB][m.teamA] = m.scoreB;
    }
  });

  return flight.teamIds
    .map(id => ({ teamId: id, points: points[id] }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      // Tiebreaker: h2h points between tied teams
      const h2hA = h2h[a.teamId][b.teamId] || 0;
      const h2hB = h2h[b.teamId][a.teamId] || 0;
      return h2hB - h2hA;
    });
}

function getRoundPoints(teamId, flightId, matches) {
  const pts = {};
  for (let r = 1; r <= 5; r++) pts[r] = null;

  Object.values(matches).forEach(m => {
    if (m.flight !== flightId) return;
    if (m.status !== "final") return;
    if (m.teamA === teamId) pts[m.round] = m.scoreA;
    else if (m.teamB === teamId) pts[m.round] = m.scoreB;
  });

  return pts;
}

function renderMatchCard(m) {
  const tA = T(m.teamA), tB = T(m.teamB);
  const isLive = m.status === "live";
  const isFinal = m.status === "final";

  let scoreDisplay = `<span class="pending">TBD</span>`;
  if (isFinal || m.scoreA !== null) {
    scoreDisplay = `${m.scoreA} - ${m.scoreB}`;
  }

  const winA = isFinal && m.scoreA > m.scoreB;
  const winB = isFinal && m.scoreB > m.scoreA;

  // Show moneyline + combined HI for non-final matches
  let mlInfo = "";
  if (!isFinal) {
    const { mlA, mlB } = getMatchMoneyline(m.teamA, m.teamB);
    const fmtA = mlA === 0 ? "EVEN" : (mlA > 0 ? `+${mlA}` : `${mlA}`);
    const fmtB = mlB === 0 ? "EVEN" : (mlB > 0 ? `+${mlB}` : `${mlB}`);
    mlInfo = `<div class="text-xs text-muted" style="display:flex;justify-content:space-between;margin-top:4px"><span>HI ${tA.combined} &bull; ${fmtA}</span><span>${fmtB} &bull; HI ${tB.combined}</span></div>`;
  } else {
    mlInfo = `<div class="text-xs text-muted" style="display:flex;justify-content:space-between;margin-top:4px"><span>HI ${tA.combined}</span><span>HI ${tB.combined}</span></div>`;
  }

  return `<div class="mg-match ${m.status}">
    <div class="mg-match-round">Round ${m.round} &bull; ${RT(m.round)} ${isLive ? '<span class="mg-match-live-badge">LIVE</span>' : ''}</div>
    <div class="mg-match-teams">
      <div class="mg-match-team ${winA ? 'winner' : ''}">${TN(tA)}</div>
      <div class="mg-match-score ${!isFinal && m.scoreA === null ? 'pending' : ''}">${scoreDisplay}</div>
      <div class="mg-match-team ${winB ? 'winner' : ''}" style="text-align:right">${TN(tB)}</div>
    </div>
    ${mlInfo}
  </div>`;
}

// ─── Player picker (searchable dropdown) ───
function renderPlayerPicker(state) {
  const players = (state._allPlayers || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const filter = (state._playerFilter || '').toLowerCase();

  let html = `<div style="max-width:320px;margin:0 auto">
    <input type="text" id="bettor-name-input" placeholder="Search or type name..." value="${escHtml(state._playerFilter || '')}" oninput="window.MG.filterPlayers(this.value)" style="width:100%;padding:12px 14px;border:2px solid var(--mg-border);border-radius:10px;font-size:16px;text-align:center;margin-bottom:8px">`;

  const filtered = filter
    ? players.filter(p => (p.name || '').toLowerCase().includes(filter))
    : players;

  if (filtered.length > 0) {
    html += `<div style="max-height:300px;overflow-y:auto;border:1px solid var(--mg-border);border-radius:10px;background:var(--mg-surface)">`;
    filtered.forEach(p => {
      const credits = p.credits !== undefined ? p.credits : 0;
      html += `<button onclick="window.MG.setBettorName('${escHtml(p.name)}')" style="display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;padding:12px 16px;border:none;border-bottom:1px solid var(--mg-border);background:transparent;cursor:pointer;font-size:14px;text-align:left;-webkit-tap-highlight-color:transparent">
        <span style="font-weight:600;color:var(--mg-text)">${escHtml(p.name)}</span>
        <span style="font-size:12px;font-weight:700;color:var(--mg-gold-dim)">$${credits}</span>
      </button>`;
    });
    html += `</div>`;
  } else if (filter) {
    html += `<button class="mg-btn mg-btn-primary" style="margin-top:4px" onclick="window.MG.setBettorName()">Join as "${escHtml(state._playerFilter)}"</button>`;
  } else {
    html += `<p class="text-sm text-muted">Loading players...</p>`;
  }

  html += `</div>`;
  return html;
}

// ─── Scramble What-If Simulator ─────────────────────────────────
function renderScrambleWhatIf(state) {
  const config = state._config;
  const gameState = state._gameState;
  const holes = state._holes || {};
  const holesPerRound = config?.holesPerRound || 18;
  const pars = getCoursePars(config);
  const teams = deriveScrambleTeams(config);
  const teamNames = teams.map(t => t.name || t);

  const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const holesPlayed = scoredHoles.length;
  const remainingHoles = [];
  for (let h = 1; h <= holesPerRound; h++) {
    if (!scoredHoles.includes(h)) remainingHoles.push(h);
  }

  if (!state._scenario) state._scenario = {};
  if (!state._scenario.simHoles) state._scenario.simHoles = {};
  const simHoles = state._scenario.simHoles;

  let html = '';

  // Header
  html += `<div style="margin-bottom:16px">
    <div style="font-size:22px;font-weight:700;color:var(--mg-text)">Scramble What If...</div>
    <div style="font-size:13px;color:var(--mg-text-muted);margin-top:2px">Project how remaining holes change the leaderboard</div>
  </div>`;

  // Current leaderboard
  const leaderboard = gameState?.scramble?.leaderboard || [];
  if (leaderboard.length > 0) {
    html += `<div class="mg-card" style="padding:12px;margin-bottom:12px">
      <div class="mg-card-header" style="margin-bottom:8px">CURRENT STANDINGS &middot; THRU ${holesPlayed}</div>`;
    leaderboard.forEach((entry, i) => {
      const totalColor = entry.total <= 0 ? 'var(--win)' : entry.total > 0 ? 'var(--loss)' : 'var(--mg-text-muted)';
      const totalStr = entry.total === 0 ? 'E' : entry.total > 0 ? `+${entry.total}` : `${entry.total}`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i < leaderboard.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--mg-text-muted);width:16px">${entry.position}</span>
          <span style="font-size:14px;font-weight:${i === 0 ? '700' : '500'}">${escHtml(entry.team)}</span>
        </div>
        <span style="font-size:16px;font-weight:700;color:${totalColor}">${totalStr}</span>
      </div>`;
    });
    html += `</div>`;
  }

  if (remainingHoles.length === 0) {
    html += `<div class="mg-card" style="padding:20px;text-align:center;color:var(--mg-text-muted)">
      All ${holesPerRound} holes have been scored. The scramble is complete!
    </div>`;
    return html;
  }

  // Simulated holes input
  const simCount = Object.keys(simHoles).length;
  html += `<div class="mg-card" style="padding:12px">
    <div class="mg-card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span>SIMULATE REMAINING HOLES</span>
      <span style="font-size:10px;background:var(--mg-gold);color:var(--mg-green);padding:2px 8px;border-radius:4px;font-weight:700">${remainingHoles.length} left</span>
    </div>`;

  remainingHoles.forEach(h => {
    const par = pars[h - 1] || 4;
    const hasSim = !!simHoles[h];
    html += `<div style="padding:10px 0;${h !== remainingHoles[remainingHoles.length - 1] ? 'border-bottom:1px solid var(--mg-border)' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600">Hole ${h} <span style="font-size:11px;color:var(--mg-text-muted);font-weight:400">Par ${par}</span></span>
        ${hasSim ? `<span style="font-size:10px;color:var(--mg-gold-dim);font-weight:700;cursor:pointer" onclick="window.MG.clearSimHole(${h})">Clear</span>` : ''}
      </div>`;
    teamNames.forEach(teamName => {
      const simScore = simHoles[h]?.[teamName];
      const scores = [par - 2, par - 1, par, par + 1, par + 2];
      const escapedName = escHtml(teamName).replace(/'/g, "\\'");
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;min-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(teamName)}</span>
        <div style="display:flex;gap:3px">`;
      scores.forEach(s => {
        const selected = simScore === s;
        const label = s === par - 2 ? 'Eag' : s === par - 1 ? 'Bir' : s === par ? 'Par' : s === par + 1 ? 'Bog' : 'Dbl';
        html += `<button style="min-width:32px;height:28px;border-radius:6px;border:1px solid ${selected ? 'var(--mg-gold)' : 'var(--mg-border)'};background:${selected ? 'rgba(212,160,23,0.15)' : 'transparent'};color:${selected ? 'var(--mg-gold)' : 'var(--mg-text-muted)'};font-size:10px;font-weight:${selected ? '800' : '600'};cursor:pointer" onclick="window.MG.setSimHoleScore(${h},'${escapedName}',${s})">${s}</button>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;

  // Reset button
  if (simCount > 0) {
    html += `<div style="margin-top:8px">
      <button class="mg-btn" style="width:100%;border:1px solid var(--mg-green);color:var(--mg-green);background:transparent;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:12px" onclick="window.MG.resetRoundScenarios()">Reset All Scenarios</button>
    </div>`;
  }

  // Projected leaderboard — merge real scramble state with simulated holes
  if (simCount > 0) {
    // Replay scramble logic: compute running totals from real holes + simulated holes
    const teamTotals = {};
    teamNames.forEach(t => { teamTotals[t] = 0; });
    for (let h = 1; h <= holesPerRound; h++) {
      const realScores = holes[h]?.scores || holes[h] || {};
      const simScoresForHole = simHoles[h] || {};
      const holeScores = holes[h] ? realScores : simScoresForHole;
      teamNames.forEach(t => {
        const s = holeScores[t];
        if (s != null) {
          const par = pars[h - 1] || 4;
          teamTotals[t] += (s - par);
        }
      });
    }
    const projLeaderboard = teamNames.map(t => ({ team: t, total: teamTotals[t] }))
      .sort((a, b) => a.total - b.total);
    projLeaderboard.forEach((entry, i) => { entry.position = i + 1; });

    html += `<div class="mg-card" style="padding:12px;margin-top:12px;border:2px solid var(--mg-gold)">
      <div class="mg-card-header" style="margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;background:var(--mg-gold);color:var(--mg-green);padding:2px 6px;border-radius:3px;font-weight:800">SIM</span>
        PROJECTED LEADERBOARD
      </div>`;
    projLeaderboard.forEach((entry, i) => {
      const curEntry = leaderboard.find(e => e.team === entry.team);
      const curTotal = curEntry?.total ?? 0;
      const diff = entry.total - curTotal;
      const totalColor = entry.total <= 0 ? 'var(--win)' : entry.total > 0 ? 'var(--loss)' : 'var(--mg-text-muted)';
      const totalStr = entry.total === 0 ? 'E' : entry.total > 0 ? `+${entry.total}` : `${entry.total}`;
      const diffStr = diff === 0 ? '' : diff > 0 ? `(+${diff})` : `(${diff})`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i < projLeaderboard.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:${i === 0 ? 'var(--mg-gold)' : 'var(--mg-text-muted)'};width:16px">${entry.position}</span>
          <span style="font-size:14px;font-weight:${i === 0 ? '700' : '500'}">${escHtml(entry.team)}</span>
        </div>
        <div style="text-align:right">
          <span style="font-size:16px;font-weight:700;color:${totalColor}">${totalStr}</span>
          ${diffStr ? `<span style="font-size:11px;color:var(--mg-text-muted);margin-left:4px">${diffStr}</span>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  return html;
}

// ─── Round-Mode "The Bar" — projections, trash talk, side action ──
function renderRoundScenarios(state) {
  const config = state._config;
  const gameState = state._gameState;
  const holes = state._holes || {};
  const players = getPlayersFromConfig(config);
  const holesPerRound = config?.holesPerRound || 18;
  const games = config?.games || {};
  const pars = getCoursePars(config);
  const structure = config?.structure || {};

  // Scramble-specific What-If view
  if (games.scramble) {
    return renderScrambleWhatIf(state);
  }

  const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const holesPlayed = scoredHoles.length;
  const remainingHoles = [];
  for (let h = 1; h <= holesPerRound; h++) {
    if (!scoredHoles.includes(h)) remainingHoles.push(h);
  }

  const currentPnl = computeRoundPnL(gameState, players, games, structure);
  const props = state._props || [];

  let html = '';

  // ── If Everyone Pars Out ──
  if (remainingHoles.length > 0 && holesPlayed > 0) {
    // Build simulated "par out" scores for remaining holes
    const simParOut = {};
    remainingHoles.forEach(h => {
      simParOut[h] = {};
      players.forEach(p => { simParOut[h][p.name] = pars[h - 1] || 4; });
    });
    const projPnl = computeSimulatedPnL(gameState, simParOut, players, games, structure, holesPerRound, pars, holes);

    html += `<div class="mg-card" style="padding:14px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:10px">If Everyone Pars Out</div>`;

    // Sort by projected P&L
    const sorted = players.map(p => ({ name: p.name, current: currentPnl[p.name] || 0, projected: projPnl[p.name] || 0 }))
      .sort((a, b) => b.projected - a.projected);

    sorted.forEach((p, i) => {
      const delta = p.projected - p.current;
      const arrow = delta > 0 ? '&#9650;' : delta < 0 ? '&#9660;' : '';
      const deltaColor = delta > 0 ? 'var(--win)' : delta < 0 ? 'var(--loss)' : 'var(--mg-text-muted)';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;${i < sorted.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:20px;height:20px;border-radius:50%;background:${i === 0 ? 'var(--mg-gold)' : 'var(--mg-surface)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${i === 0 ? 'var(--mg-green)' : 'var(--mg-text-muted)'}">${i + 1}</div>
          <div style="font-size:14px;font-weight:600;color:var(--mg-text)">${escHtml(p.name.split(' ')[0])}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:10px;color:${deltaColor}">${arrow} ${delta !== 0 ? '$' + Math.abs(delta) : '—'}</div>
          <div style="font-size:16px;font-weight:800;font-family:'SF Mono',monospace;color:${p.projected >= 0 ? 'var(--win)' : 'var(--loss)'}">${p.projected >= 0 ? '+' : ''}$${Math.abs(p.projected)}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── What You Need ──
  if (remainingHoles.length > 0 && holesPlayed >= 3) {
    const myName = state.bettorName || players[0]?.name || '';
    const myPnl = currentPnl[myName] || 0;
    const leader = players.reduce((best, p) => (currentPnl[p.name] || 0) > (currentPnl[best.name] || 0) ? p : best, players[0]);
    const leaderPnl = currentPnl[leader.name] || 0;

    if (myName && leader.name !== myName && leaderPnl > myPnl) {
      const deficit = leaderPnl - myPnl;
      html += `<div class="mg-card" style="padding:14px;margin-bottom:10px;border-left:3px solid var(--mg-gold)">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:6px">What You Need</div>
        <div style="font-size:14px;color:var(--mg-text);line-height:1.5">You're <span style="font-family:'SF Mono',monospace;color:var(--loss);font-weight:700">$${deficit}</span> behind ${escHtml(leader.name.split(' ')[0])} with ${remainingHoles.length} holes left. ${games.skins ? `A skin is worth $${parseInt(structure?.skinsBet) || 5} × ${players.length - 1} = $${(parseInt(structure?.skinsBet) || 5) * (players.length - 1)}. You need ${Math.ceil(deficit / ((parseInt(structure?.skinsBet) || 5) * (players.length - 1)))} skin${Math.ceil(deficit / ((parseInt(structure?.skinsBet) || 5) * (players.length - 1))) > 1 ? 's' : ''} to take the lead.` : 'Make birdies.'}</div>
      </div>`;
    } else if (myName && leader.name === myName) {
      const second = players.filter(p => p.name !== myName).reduce((best, p) => (currentPnl[p.name] || 0) > (currentPnl[best.name] || 0) ? p : best, players.filter(p => p.name !== myName)[0]);
      const lead = myPnl - (currentPnl[second?.name] || 0);
      html += `<div class="mg-card" style="padding:14px;margin-bottom:10px;border-left:3px solid var(--win)">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--win);margin-bottom:6px">You're Leading</div>
        <div style="font-size:14px;color:var(--mg-text);line-height:1.5">Up <span style="font-family:'SF Mono',monospace;color:var(--win);font-weight:700">$${lead}</span> on ${escHtml((second?.name || '').split(' ')[0])} with ${remainingHoles.length} to play. Don't get comfortable.</div>
      </div>`;
    }
  }

  // ── Trash Talk / The Chirps ──
  if (holesPlayed >= 3) {
    const chirps = [];
    // Who's cold?
    const recentHoles = scoredHoles.slice(-3);
    players.forEach(p => {
      let bogeys = 0;
      recentHoles.forEach(h => {
        const hData = holes[h];
        const score = hData?.scores ? hData.scores[p.name] : hData?.[p.name];
        const par = pars[h - 1] || 4;
        if (score && score > par) bogeys++;
      });
      if (bogeys >= 2) chirps.push(`${p.name.split(' ')[0]} has bogeyed ${bogeys} of the last 3 holes. Is it nerves or just bad golf?`);
    });
    // Who's winning skins?
    if (gameState?.skins) {
      const skinCounts = {};
      players.forEach(p => { skinCounts[p.name] = 0; });
      if (gameState.skins.history) {
        gameState.skins.history.forEach(s => { if (s.winner) skinCounts[s.winner] = (skinCounts[s.winner] || 0) + 1; });
      }
      const maxSkins = Math.max(...Object.values(skinCounts));
      const skinless = players.filter(p => skinCounts[p.name] === 0);
      if (skinless.length > 0 && maxSkins > 0) {
        chirps.push(`${skinless.map(p => p.name.split(' ')[0]).join(' and ')} ${skinless.length === 1 ? 'hasn\'t' : 'haven\'t'} won a single skin. Somebody buy them a drink.`);
      }
    }
    // Biggest swing
    const sorted = players.map(p => ({ name: p.name, pnl: currentPnl[p.name] || 0 })).sort((a, b) => b.pnl - a.pnl);
    if (sorted.length >= 2) {
      const spread = sorted[0].pnl - sorted[sorted.length - 1].pnl;
      if (spread >= 20) chirps.push(`$${spread} separates first and last. That's a round of drinks for ${sorted[sorted.length - 1].name.split(' ')[0]}.`);
    }

    if (chirps.length > 0) {
      html += `<div class="mg-card" style="padding:14px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:10px">The Chirps</div>`;
      chirps.forEach(c => {
        html += `<div style="font-size:13px;color:var(--mg-text);padding:8px 0;border-bottom:1px solid var(--mg-border);line-height:1.4;font-style:italic">"${escHtml(c)}"</div>`;
      });
      html += `</div>`;
    }
  }

  // ── Side Action (active props) ──
  const activeProps = props.filter(p => p.status === 'open' || p.status === 'accepted');
  if (activeProps.length > 0) {
    html += `<div class="mg-card" style="padding:14px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:10px">Side Action</div>`;
    activeProps.forEach(prop => {
      const statusBadge = prop.status === 'accepted'
        ? '<span style="font-size:9px;font-weight:700;background:var(--win);color:var(--text-primary);padding:2px 6px;border-radius:4px">LOCKED</span>'
        : '<span style="font-size:9px;font-weight:700;background:var(--mg-gold);color:var(--mg-green);padding:2px 6px;border-radius:4px">OPEN</span>';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--mg-border)">
        <div>
          <div style="font-size:13px;color:var(--mg-text)">${escHtml(prop.description)}</div>
          <div style="font-size:11px;color:var(--mg-text-muted);margin-top:2px">by ${escHtml((prop.creator || '').split(' ')[0])}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-size:14px;font-weight:800;font-family:'SF Mono',monospace;color:var(--mg-gold)">$${prop.amount || 0}</div>
          ${statusBadge}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Round Trends ──
  if (holesPlayed >= 6) {
    const halfHoles = scoredHoles.slice(0, Math.floor(holesPlayed / 2));
    const secondHalf = scoredHoles.slice(Math.floor(holesPlayed / 2));
    const trendData = players.map(p => {
      let firstHalfTotal = 0, secondHalfTotal = 0;
      halfHoles.forEach(h => {
        const hData = holes[h];
        const score = hData?.scores ? hData.scores[p.name] : hData?.[p.name];
        const par = pars[h - 1] || 4;
        if (score) firstHalfTotal += score - par;
      });
      secondHalf.forEach(h => {
        const hData = holes[h];
        const score = hData?.scores ? hData.scores[p.name] : hData?.[p.name];
        const par = pars[h - 1] || 4;
        if (score) secondHalfTotal += score - par;
      });
      return { name: p.name, first: firstHalfTotal, second: secondHalfTotal, trend: firstHalfTotal - secondHalfTotal };
    }).filter(t => t.trend !== 0).sort((a, b) => b.trend - a.trend);

    if (trendData.length > 0) {
      html += `<div class="mg-card" style="padding:14px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mg-text-muted);margin-bottom:10px">Momentum</div>`;
      trendData.forEach(t => {
        const improving = t.trend > 0;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
          <div style="font-size:13px;font-weight:600;color:var(--mg-text)">${escHtml(t.name.split(' ')[0])}</div>
          <div style="font-size:12px;font-weight:700;color:${improving ? 'var(--win)' : 'var(--loss)'}">
            ${improving ? '&#9650; Heating Up' : '&#9660; Cooling Off'}
            <span style="font-family:'SF Mono',monospace;margin-left:4px">(${t.second > 0 ? '+' : ''}${t.second} → ${t.first > 0 ? '+' : ''}${t.first})</span>
          </div>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ── No data yet state ──
  if (holesPlayed === 0) {
    html += `<div class="mg-card" style="padding:24px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">&#127866;</div>
      <div style="font-size:14px;color:var(--mg-text-muted)">The Bar opens after the first few holes are scored. Until then, grab a drink and talk trash in person.</div>
    </div>`;
  }

  // ── All holes scored ──
  if (remainingHoles.length === 0 && holesPlayed > 0) {
    html += `<div class="mg-card" style="padding:20px;text-align:center;color:var(--mg-text-muted)">
      All ${holesPerRound} holes scored. The bar is closed — head to <a href="#settle" style="color:var(--mg-gold)">settlement</a> to settle up.
    </div>`;
  }

  return html;
}

/**
 * Compute projected P&L by replaying skins/nassau logic over real + simulated holes.
 * This is a simplified simulation — it re-runs the skins pot and nassau logic from scratch
 * using actual scored holes plus the hypothetical scores from simHoles.
 */
function computeSimulatedPnL(gameState, simHoles, players, games, structure, holesPerRound, pars, realHoles) {
  const skinsBet = parseInt(structure?.skinsBet) || 5;
  const nassauBet = parseInt(structure?.nassauBet) || 10;
  const n = players.length;
  const pnl = {};
  players.forEach(p => { pnl[p.name] = 0; });

  // Merge real hole scores with simulated ones
  // Real scores come from realHoles: { holeNum: { playerName: score } }
  // Sim scores come from simHoles: { holeNum: { playerName: score } }
  const allScores = {};
  for (let h = 1; h <= holesPerRound; h++) {
    if (realHoles[h]) allScores[h] = { ...realHoles[h] };
    else if (simHoles[h]) allScores[h] = { ...simHoles[h] };
  }

  // Replay skins
  if (games.skins) {
    let pot = 1;
    for (let h = 1; h <= holesPerRound; h++) {
      const hScores = allScores[h];
      if (!hScores) continue;
      const entries = players.map(p => ({ name: p.name, score: hScores[p.name] })).filter(e => e.score != null);
      if (entries.length < 2) continue;
      const minScore = Math.min(...entries.map(e => e.score));
      const winners = entries.filter(e => e.score === minScore);
      if (winners.length === 1) {
        // Skin won
        pnl[winners[0].name] += pot * (n - 1) * skinsBet;
        players.forEach(p => { if (p.name !== winners[0].name) pnl[p.name] -= pot * skinsBet; });
        pot = 1;
      } else {
        // Carry
        pot++;
      }
    }
  }

  // Replay nassau (simplified: best net total for front/back/total)
  if (games.nassau) {
    const frontTotals = {};
    const backTotals = {};
    players.forEach(p => { frontTotals[p.name] = 0; backTotals[p.name] = 0; });
    for (let h = 1; h <= holesPerRound; h++) {
      const hScores = allScores[h];
      if (!hScores) continue;
      const par = pars[h - 1] || 4;
      players.forEach(p => {
        const score = hScores[p.name];
        if (score != null) {
          const rel = score - par;
          if (h <= 9) frontTotals[p.name] += rel;
          else backTotals[p.name] += rel;
        }
      });
    }
    // Determine front/back/total winners (lowest relative to par)
    const findWinner = (totals) => {
      const entries = Object.entries(totals).sort((a, b) => a[1] - b[1]);
      if (entries.length < 2) return null;
      if (entries[0][1] < entries[1][1]) return entries[0][0];
      return null; // tie = no winner
    };
    // Check if all front 9 scored
    const frontScored = Array.from({ length: 9 }, (_, i) => i + 1).every(h => allScores[h]);
    const backScored = Array.from({ length: 9 }, (_, i) => i + 10).every(h => allScores[h]);
    if (frontScored) {
      const fw = findWinner(frontTotals);
      if (fw) {
        pnl[fw] += nassauBet * (n - 1);
        players.forEach(p => { if (p.name !== fw) pnl[p.name] -= nassauBet; });
      }
    }
    if (backScored) {
      const bw = findWinner(backTotals);
      if (bw) {
        pnl[bw] += nassauBet * (n - 1);
        players.forEach(p => { if (p.name !== bw) pnl[p.name] -= nassauBet; });
      }
    }
    if (frontScored && backScored) {
      const totalTotals = {};
      players.forEach(p => { totalTotals[p.name] = frontTotals[p.name] + backTotals[p.name]; });
      const tw = findWinner(totalTotals);
      if (tw) {
        pnl[tw] += nassauBet * (n - 1);
        players.forEach(p => { if (p.name !== tw) pnl[p.name] -= nassauBet; });
      }
    }
  }

  return pnl;
}

// ─── Scenario / What-If View ───────────────────────────────────
export function renderScenarios(state) {
  const scenario = state._scenario || {};
  const flightId = scenario.flightId || flightOrder()[0];
  const simResults = scenario.simResults || {};
  const flight = F(flightId);

  // Round mode what-if: simulate remaining holes
  const isRound = !flight || !flight.teamIds?.length;
  if (isRound) {
    return renderRoundScenarios(state);
  }

  // Compute scenario data
  const data = getFlightScenarioData(flightId, state.matches, simResults, flight, getMatchMoneyline);

  // Flight selector tabs
  let html = `<div class="mg-section-title">Scenario Analysis</div>`;
  html += `<div class="mg-scenario-flights">`;
  flightOrder().forEach(fId => {
    const f = F(fId);
    const active = fId === flightId ? 'active' : '';
    html += `<button class="mg-scenario-flight-btn ${active}" onclick="window.MG.setScenarioFlight('${fId}')">${f.name || fId}</button>`;
  });
  html += `</div>`;

  // Two-column layout on wider screens
  html += `<div class="mg-scenario-layout">`;

  // LEFT: Match Simulator
  html += `<div class="mg-scenario-sim">`;
  html += `<div class="mg-card">`;
  html += `<div class="mg-card-header" style="display:flex;justify-content:space-between;align-items:center">
    <span>Match Simulator</span>
    <span style="font-size:10px;background:var(--mg-gold);color:var(--mg-green);padding:2px 8px;border-radius:4px;font-weight:700;text-transform:uppercase">${data.remaining.length} remaining</span>
  </div>`;

  // Get all matches for this flight
  const flightMatches = Object.values(state.matches)
    .filter(m => m.flight === flightId)
    .sort((a, b) => a.round - b.round || a.pairing - b.pairing);

  const nonFinalMatches = flightMatches.filter(m => m.status !== 'final');
  const finalMatches = flightMatches.filter(m => m.status === 'final');

  if (nonFinalMatches.length === 0) {
    html += `<div style="padding:16px;text-align:center;color:var(--mg-text-secondary);font-size:13px">All matches in this flight are final.</div>`;
  }

  nonFinalMatches.forEach(m => {
    const tA = T(m.teamA);
    const tB = T(m.teamB);
    const sim = simResults[m.id];
    const isSimulated = !!sim;
    const isLive = m.status === 'live';

    html += `<div class="mg-scenario-match ${isSimulated ? 'simulated' : ''}" style="padding:12px 16px;border-bottom:1px solid var(--mg-border)">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:10px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:0.5px">R${m.round} &bull; Match ${m.pairing}</span>
      ${isLive ? '<span style="font-size:10px;font-weight:700;color:var(--mg-live);font-style:italic">Live</span>' : ''}
      ${isSimulated ? '<span style="font-size:10px;font-weight:700;color:var(--mg-gold-dim);font-style:italic;cursor:pointer" onclick="window.MG.clearSimResult(\'' + m.id + '\')">Clear</span>' : ''}
    </div>`;

    // Team A row
    html += `<div style="margin-bottom:6px">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center">`;
    html += `<span style="font-size:15px;${isSimulated && sim.scoreA < sim.scoreB ? 'color:var(--mg-text-muted)' : ''}">${TN(tA)}</span>`;
    html += `<div style="display:flex;gap:3px">`;
    [7, 6, 5].forEach(score => {
      const otherScore = 10 - score;
      const selected = isSimulated && sim.scoreA === score && sim.scoreB === otherScore;
      html += `<button class="mg-score-btn ${selected ? 'selected' : ''}" onclick="window.MG.setSimResult('${m.id}',${score},${otherScore})">${score}</button>`;
    });
    html += `</div></div></div>`;

    // Team B row
    html += `<div>`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center">`;
    html += `<span style="font-size:15px;${isSimulated && sim.scoreB < sim.scoreA ? 'color:var(--mg-text-muted)' : ''}">${TN(tB)}</span>`;
    html += `<div style="display:flex;gap:3px">`;
    [7, 6, 5].forEach(score => {
      const otherScore = 10 - score;
      const selected = isSimulated && sim.scoreB === score && sim.scoreA === otherScore;
      html += `<button class="mg-score-btn ${selected ? 'selected' : ''}" onclick="window.MG.setSimResult('${m.id}',${otherScore},${score})">${score}</button>`;
    });
    html += `</div></div></div>`;

    html += `</div>`;
  });

  // Reset button
  if (Object.keys(simResults).length > 0) {
    html += `<div style="padding:12px 16px">
      <button class="mg-btn" style="width:100%;border:1px solid var(--mg-green);color:var(--mg-green);background:transparent;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase" onclick="window.MG.resetScenarios()">Reset All Scenarios</button>
    </div>`;
  }

  html += `</div>`; // card
  html += `</div>`; // sim column

  // RIGHT: Projected Standings
  html += `<div class="mg-scenario-standings">`;
  html += `<div class="mg-card" style="overflow:hidden">`;
  html += `<div class="mg-card-header" style="display:flex;justify-content:space-between;align-items:center">
    <span>Projected Standings</span>
    <span style="font-size:10px;color:var(--mg-text-muted);text-transform:uppercase;font-weight:700;letter-spacing:0.5px">${flight.name || flightId}</span>
  </div>`;

  // Standings table
  html += `<div style="overflow-x:auto">`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:13px">`;
  html += `<thead><tr style="background:var(--bg-primary);font-size:10px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:0.5px">
    <th style="padding:8px 12px;text-align:left">Team</th>
    <th style="padding:8px 8px;text-align:center">Pts</th>
    <th style="padding:8px 8px;text-align:center;min-width:80px">Win %</th>
    <th style="padding:8px 8px;text-align:center">Magic#</th>
    <th style="padding:8px 12px;text-align:right">Status</th>
  </tr></thead><tbody>`;

  data.projectedStandings.forEach((s, idx) => {
    const team = T(s.teamId);
    const ts = data.teamStatus[s.teamId];
    const hasDelta = ts.delta !== 0;
    const isSimImpact = hasDelta;

    // Status badge colors
    const statusColors = {
      clinched: { bg: 'var(--mg-green)', color: 'var(--text-primary)' },
      alive: { bg: 'var(--mg-gold)', color: 'var(--mg-green)' },
      bubble: { bg: 'var(--mg-odds-bg)', color: 'var(--mg-text-secondary)' },
      eliminated: { bg: 'rgba(248,81,73,0.15)', color: 'var(--loss)' },
    };
    const sc = statusColors[ts.status] || statusColors.bubble;
    const statusLabel = ts.status === 'clinched' ? 'Clinched' : ts.status === 'alive' ? 'Alive' : ts.status === 'bubble' ? 'Bubble' : 'Dead';

    // Win probability bar width
    const probPct = Math.round(ts.winProb * 100);

    // Magic number display
    let magicDisplay = ts.magicNumber <= 0 ? '—' : ts.magicNumber.toFixed(1);
    if (ts.status === 'clinched') magicDisplay = '—';
    if (ts.status === 'eliminated') magicDisplay = 'E';

    // Row highlight for sim-impacted teams
    const rowStyle = isSimImpact
      ? 'border-left:3px solid var(--mg-gold);background:rgba(212,160,23,0.05)'
      : 'border-left:3px solid transparent';

    html += `<tr style="${rowStyle};${ts.status === 'eliminated' ? 'opacity:0.5' : ''}">
      <td style="padding:10px 12px">
        <div style="font-size:14px;line-height:1.2">${TN(team)}</div>
        ${idx === 0 ? '<div style="font-size:9px;font-weight:700;color:var(--mg-gold);text-transform:uppercase;margin-top:1px">Leader</div>' : ''}
      </td>
      <td style="padding:10px 8px;text-align:center;font-size:16px;font-weight:700">
        ${ts.projectedPoints}
        ${hasDelta ? `<span style="font-size:10px;font-family:Inter,sans-serif;color:${ts.delta > 0 ? 'var(--mg-win)' : 'var(--mg-loss)'};font-weight:700;font-style:italic;margin-left:2px">${ts.delta > 0 ? '+' : ''}${ts.delta}</span>` : ''}
      </td>
      <td style="padding:10px 8px">
        <div style="display:flex;align-items:center;gap:4px">
          <div style="flex:1;height:4px;background:var(--mg-border);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${probPct}%;background:${ts.status === 'eliminated' ? 'var(--mg-text-muted)' : 'var(--mg-green)'};border-radius:2px;transition:width 0.3s"></div>
          </div>
          <span style="font-size:11px;font-weight:700;min-width:28px;text-align:right">${probPct}%</span>
        </div>
      </td>
      <td style="padding:10px 8px;text-align:center;font-weight:700;font-size:12px;color:${ts.status === 'eliminated' ? 'var(--mg-text-muted)' : 'var(--mg-green)'}">${magicDisplay}</td>
      <td style="padding:10px 12px;text-align:right">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:${sc.bg};color:${sc.color}">${statusLabel}</span>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  html += `</div>`; // card

  // Scenario Props
  if (data.scenarioProps.length > 0) {
    html += `<div class="mg-card" style="margin-top:12px;background:var(--mg-green);color:var(--text-primary);overflow:hidden">`;
    html += `<div style="padding:16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--mg-gold)">Scenario Props</div>`;
    data.scenarioProps.forEach(prop => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:600">${escHtml(String(prop.description))}</div>
          <div style="font-size:10px;color:var(--text-secondary)">${escHtml(String(prop.detail))}</div>
        </div>
        <span style="font-size:18px;color:var(--mg-gold)">${prop.odds}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Info cards
  html += `<div class="mg-scenario-info">`;
  html += `<div class="mg-card" style="padding:16px;display:flex;gap:12px;align-items:flex-start;margin-top:12px">
    <div style="font-size:24px;min-width:40px;height:40px;background:var(--bg-primary);border-radius:8px;display:flex;align-items:center;justify-content:center">&#9881;</div>
    <div>
      <div style="font-size:16px;margin-bottom:4px">Elimination Math</div>
      <div style="font-size:12px;color:var(--mg-text-secondary);line-height:1.5">Magic numbers represent points needed to guarantee a spot. Cap rule: max 7 pts per match, 10 total per match.</div>
    </div>
  </div>`;
  html += `<div class="mg-card" style="padding:16px;display:flex;gap:12px;align-items:flex-start;margin-top:8px">
    <div style="font-size:24px;min-width:40px;height:40px;background:var(--bg-primary);border-radius:8px;display:flex;align-items:center;justify-content:center">&#9733;</div>
    <div>
      <div style="font-size:16px;margin-bottom:4px">Win Probability</div>
      <div style="font-size:12px;color:var(--mg-text-secondary);line-height:1.5">${nonFinalMatches.length <= 6 ? 'Exact enumeration' : 'Monte Carlo simulation (10K samples)'} across all remaining match outcomes, weighted by handicap-based moneyline odds.</div>
    </div>
  </div>`;
  html += `</div>`; // info cards

  html += `</div>`; // standings column
  html += `</div>`; // layout

  return html;
}

// ================================================================
// TRIP PAGE — Pre-trip hype when event exists but no scores yet
// ================================================================
function renderTripPage(state, config, players, pars, hcpIndex, holesPerRound, games, eventDate) {
  const sorted = [...players].sort((a, b) => (a.handicapIndex || 0) - (b.handicapIndex || 0));
  const eventName = config?.event?.name || 'The Round';
  const courseName = config?.event?.course || config?.event?.venue || config?.course?.name || '';
  const totalPar = pars.reduce((s, p) => s + p, 0) || 72;
  const skinsBetAmt = parseInt(config?.structure?.skinsBet) || 0;
  const nassauBetAmt = parseInt(config?.structure?.nassauBet) || 0;
  const slug = state._slug || (location.pathname.match(/\/waggle\/([a-z0-9_-]+)/)?.[1]) || 'event';
  const totalPot = computeTotalPot(games, config?.structure, players.length, 0);

  let html = '';

  // ── a) Countdown Header ──
  {
    let countdownHtml = '';
    if (eventDate) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const target = new Date(eventDate + 'T00:00:00');
      const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        countdownHtml = `<div style="font-size:64px;font-weight:900;color:var(--gold-bright);font-family:'SF Mono','Menlo',monospace;line-height:1;text-shadow:0 0 24px rgba(212,160,23,0.4),0 0 48px rgba(212,160,23,0.15)">${diffDays}</div>
          <div style="font-size:18px;font-weight:600;color:var(--text-primary);margin-top:4px">day${diffDays !== 1 ? 's' : ''} until tee time</div>`;
      } else if (diffDays === 0) {
        countdownHtml = `<div style="font-size:36px;font-weight:900;color:var(--gold-bright);line-height:1;text-shadow:0 0 20px rgba(212,160,23,0.4)">Game Day</div>
          <div style="font-size:14px;color:var(--text-primary);margin-top:6px">Lines are set. Time to play.</div>`;
      } else {
        countdownHtml = `<div style="font-size:28px;font-weight:700;color:var(--gold-bright);text-shadow:0 0 16px rgba(212,160,23,0.3)">Lines Are Set</div>
          <div style="font-size:14px;color:var(--text-primary);margin-top:6px">Waiting for first tee</div>`;
      }
    } else {
      countdownHtml = `<div style="font-size:28px;font-weight:700;color:var(--gold-bright);text-shadow:0 0 16px rgba(212,160,23,0.3)">Lines Are Set</div>
        <div style="font-size:14px;color:var(--text-primary);margin-top:6px">Place your bets before first tee</div>`;
    }

    html += `<div style="background:linear-gradient(135deg,var(--bg-secondary) 0%,var(--green-muted) 100%);border:1px solid var(--gold-primary,var(--mg-gold));border-radius:12px;padding:32px 20px;text-align:center;margin-bottom:10px;position:relative;overflow:hidden;box-shadow:0 0 20px rgba(212,160,23,0.1)">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(45deg,transparent,transparent 20px,rgba(212,160,23,0.02) 20px,rgba(212,160,23,0.02) 40px);pointer-events:none"></div>
      <div style="position:relative;z-index:1">
        <div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(212,160,23,0.5);margin-bottom:12px">You Are Invited</div>
        <div style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${escHtml(eventName)}</div>
        ${courseName ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${escHtml(courseName)}${eventDate ? ' &middot; ' + escHtml(eventDate) : ''}</div>` : ''}
        ${state.bettorName ? `<div style="margin-bottom:12px"><span onclick="window.MG.editBettorName()" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.3);border-radius:12px;font-size:11px;font-weight:600;color:var(--gold-bright);cursor:pointer"><span style="width:5px;height:5px;border-radius:50%;background:var(--gold-bright)"></span>${escHtml(state.bettorName)}</span></div>` : ''}
        ${countdownHtml}
        ${totalPot > 0 ? `<div style="margin-top:16px;font-size:12px;color:rgba(212,160,23,0.6)">Estimated pot: <span style="font-family:'SF Mono',monospace;font-weight:800;color:var(--gold-bright);font-size:16px">$${totalPot}</span></div>` : ''}
      </div>
    </div>`;
  }

  // ── b) Course Preview ──
  if (courseName) {
    const totalYardage = config?.courseYardage?.reduce((s, y) => s + y, 0) || 0;
    html += `<div style="background:var(--mg-surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--mg-green)">${escHtml(courseName)}</div>
          <div style="font-size:12px;color:var(--mg-text-muted);margin-top:2px">Par ${totalPar}${totalYardage ? ' &middot; ' + totalYardage.toLocaleString() + ' yards' : ''}</div>
        </div>
        <div style="font-size:28px">&#9971;</div>
      </div>
      <details style="cursor:pointer">
        <summary style="font-size:12px;font-weight:600;color:var(--mg-gold-dim);padding:6px 0">Hole-by-Hole</summary>
        <div style="overflow-x:auto;margin-top:8px">
          <table style="width:100%;border-collapse:collapse;font-family:'SF Mono','Menlo','Courier New',monospace;font-size:11px">
            <tr style="background:var(--mg-green);color:var(--text-primary)">
              <td style="padding:4px 6px;font-weight:700">Hole</td>
              ${pars.map((_, i) => `<td style="padding:4px 3px;text-align:center;min-width:26px">${i + 1}</td>`).join('')}
            </tr>
            <tr style="background:rgba(35,134,54,0.06)">
              <td style="padding:4px 6px;font-weight:600;color:var(--mg-text-muted)">Par</td>
              ${pars.map(p => `<td style="padding:4px 3px;text-align:center;color:var(--mg-text-muted)">${p}</td>`).join('')}
            </tr>
            ${hcpIndex.length > 0 ? `<tr>
              <td style="padding:4px 6px;font-weight:600;color:var(--mg-text-muted)">HCP</td>
              ${hcpIndex.map(h => `<td style="padding:4px 3px;text-align:center;color:var(--mg-text-muted);font-size:10px">${h}</td>`).join('')}
            </tr>` : ''}
            ${config?.courseYardage?.length ? `<tr>
              <td style="padding:4px 6px;font-weight:600;color:var(--mg-text-muted)">Yds</td>
              ${config.courseYardage.map(y => `<td style="padding:4px 3px;text-align:center;color:var(--mg-text-muted);font-size:10px">${y}</td>`).join('')}
            </tr>` : ''}
          </table>
        </div>
      </details>
    </div>`;
  }

  // ── c) Player Cards ──
  html += `<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px 10px">
      <span style="font-size:14px;font-weight:700;color:var(--gold-bright)">The Field</span>
      <span style="font-size:10px;color:var(--text-tertiary);font-family:'SF Mono',monospace">${sorted.length} players</span>
    </div>`;

  sorted.forEach((p, i) => {
    const sortedForOdds3 = sorted.map(s => ({ hi: s.handicapIndex || 0, toPar: null }));
    const odds = calculateLiveOdds(i, sorted.length, { hi: p.handicapIndex || 0, toPar: null }, 0, holesPerRound, sortedForOdds3);
    const isFav = i === 0;
    const oddsNum = parseFloat(odds.replace('+', ''));
    const isFavorite = odds.startsWith('-');
    const oddsColor = isFavorite ? 'white' : 'var(--text-secondary)';
    const oddsBorderColor = isFavorite ? 'var(--gold-primary,var(--mg-gold))' : 'var(--border)';

    // Card styles — FAV gets gold gradient, others get standard card
    const cardBg = isFav
      ? 'background:linear-gradient(135deg,rgba(212,160,23,0.08),var(--bg-secondary));border:1px solid var(--gold-primary,var(--mg-gold));box-shadow:0 0 12px rgba(212,160,23,0.1)'
      : 'background:var(--bg-secondary);border:1px solid var(--border)';

    // Position badge
    const badgeBg = isFav ? 'background:var(--gold-bright);color:var(--bg-secondary)' : i < 3 ? 'background:transparent;border:1.5px solid var(--gold-primary,var(--mg-gold));color:var(--gold-bright)' : 'background:transparent;border:1.5px solid var(--border-strong,var(--border));color:var(--text-secondary)';

    html += `<div style="${cardBg};border-radius:10px;padding:12px 14px;margin-bottom:6px;position:relative">
      ${isFav ? '<div style="position:absolute;top:10px;right:12px;font-size:10px;font-weight:800;letter-spacing:1px;color:var(--gold-bright);background:rgba(212,160,23,0.12);border:1px solid rgba(212,160,23,0.3);padding:2px 6px;border-radius:4px">FAV</div>' : ''}
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
          <span style="width:24px;height:24px;border-radius:50%;${badgeBg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;box-sizing:border-box">${i + 1}</span>
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:${isFav ? '700' : '500'};color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary);font-family:'SF Mono',monospace;margin-top:1px">HI ${p.handicapIndex || 0}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:8px">
          <button onclick="window.MG.openOddsBetSlip('${escHtml(p.name)}','to_win','${odds}')" style="padding:6px 12px;border-radius:8px;border:1.5px solid ${oddsBorderColor};background:var(--bg-tertiary);color:${oddsColor};font-family:'SF Mono',monospace;font-size:15px;font-weight:800;cursor:pointer;min-width:60px;text-align:center;-webkit-tap-highlight-color:transparent;transition:transform .1s" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">${odds}</button>
        </div>
      </div>
    </div>`;
  });

  html += `</div>`;

  // ── d) Opening Lines Section (card-based, DraftKings-style) ──
  html += `<div style="margin-bottom:10px">`;
  html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px 10px">
    <span style="font-size:14px;font-weight:700;color:var(--gold-bright)">Opening Lines</span>
    <span style="font-size:10px;color:var(--text-tertiary);font-style:italic">H2H spreads</span>
  </div>`;

  // All H2H matchups — each as a card
  const MAX_H2H_VISIBLE = 6;
  let h2hIdx = 0;
  let h2hOverflow = '';
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const fav = sorted[i];
      const dog = sorted[j];
      const spread = ((dog.handicapIndex || 0) - (fav.handicapIndex || 0)).toFixed(1);
      const card = `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:600;color:var(--text-primary)">${escHtml(fav.name.split(' ')[0])}</span>
          <button style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--gold-primary,var(--mg-gold));background:var(--bg-tertiary);color:var(--win);font-family:'SF Mono',monospace;font-size:15px;font-weight:800;min-width:60px;text-align:center;cursor:default">-${spread}</button>
          <span style="font-size:11px;color:var(--text-tertiary);font-weight:600">vs</span>
          <button style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg-tertiary);color:var(--loss);font-family:'SF Mono',monospace;font-size:15px;font-weight:800;min-width:60px;text-align:center;cursor:default">+${spread}</button>
          <span style="font-size:14px;font-weight:600;color:var(--text-primary)">${escHtml(dog.name.split(' ')[0])}</span>
        </div>
      </div>`;
      if (h2hIdx < MAX_H2H_VISIBLE) {
        html += card;
      } else {
        h2hOverflow += card;
      }
      h2hIdx++;
    }
  }
  if (h2hOverflow) {
    html += `<details style="margin-top:4px"><summary style="font-size:12px;color:var(--text-secondary);cursor:pointer;padding:8px 0;list-style:none;-webkit-appearance:none">+ ${h2hIdx - MAX_H2H_VISIBLE} more matchups</summary>${h2hOverflow}</details>`;
  }
  html += `</div>`;

  // Props — card-based with gold accent
  if (sorted.length >= 2) {
    const bestPlayer = sorted[0];
    const worstPlayer = sorted[sorted.length - 1];
    const overUnder = Math.round(72 + (bestPlayer.handicapIndex || 10) + 0.5);
    const propsList = [
      `Over/Under ${overUnder}.5 \u2014 ${bestPlayer.name.split(' ')[0]}'s gross score`,
      `Most skins won: ${bestPlayer.name.split(' ')[0]} vs Field`,
      `${worstPlayer.name.split(' ')[0]} makes a birdie: Yes/No`,
    ];
    html += `<div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(212,160,23,0.5);padding:0 2px 8px">Prop Bets</div>`;
    propsList.forEach(prop => {
      html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--gold-primary,var(--mg-gold));border-radius:10px;padding:12px 14px;margin-bottom:6px">
        <div style="font-size:13px;color:var(--text-primary);font-style:italic">${escHtml(prop)}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // Active games — card-based
  const activeGamesList = [];
  if (games.nassau) activeGamesList.push('Nassau' + (nassauBetAmt > 0 ? ' $' + nassauBetAmt : ''));
  if (games.skins) activeGamesList.push('Skins' + (skinsBetAmt > 0 ? ' $' + skinsBetAmt : ''));
  if (games.wolf) activeGamesList.push('Wolf');
  if (games.vegas) activeGamesList.push('Vegas');
  if (activeGamesList.length > 0) {
    html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">
      <span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(212,160,23,0.5);width:100%;margin-bottom:2px">Games</span>
      ${activeGamesList.map(g => `<span style="font-size:11px;font-weight:700;letter-spacing:0.5px;background:var(--bg-tertiary);color:var(--text-primary);padding:4px 10px;border-radius:4px">${escHtml(g)}</span>`).join('')}
    </div>`;
  }

  // ── e) Trash Talk Feed — dark card with gold left border ──
  {
    const feed = state._feed || [];
    html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--gold-primary,var(--mg-gold));border-radius:10px;padding:14px 16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--gold-bright);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--win);animation:wg-pulse 2s infinite"></span> Trash Talk
      </div>`;
    if (feed.length > 0) {
      feed.slice(0, 5).forEach(item => {
        const initial = item.player ? item.player[0].toUpperCase() : '?';
        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:var(--mg-green);color:var(--text-primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${escHtml(String(initial))}</div>
          <div style="flex:1;font-size:13px;color:var(--text-primary)">${escHtml(item.text || '')}</div>
          <div style="font-size:10px;color:var(--text-tertiary);flex-shrink:0">${feedTimeAgo(item.ts)}</div>
        </div>`;
      });
    } else {
      html += `<div style="text-align:center;padding:16px;font-size:13px;color:var(--text-tertiary);font-style:italic">Talk trash before tee time</div>`;
    }
    html += `</div>`;
  }

  // ── f) Share Button — secondary style ──
  {
    const shareText = `${eventName} \u2014 Lines are set. Who's taking the action?`;
    html += `<div style="display:flex;gap:8px;margin-bottom:10px">
      <button onclick="(function(){var t='${escHtml(shareText).replace(/'/g, "\\'")} '+location.href;if(navigator.share){navigator.share({title:'${escHtml(eventName).replace(/'/g, "\\'")}',text:t,url:location.href}).catch(function(){})}else{navigator.clipboard.writeText(t).then(function(){alert('Link copied!')})}})()"
        style="flex:1;padding:14px;background:transparent;border:2px solid var(--gold-primary,var(--mg-gold));border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;color:var(--gold-bright)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share This Page
      </button>
    </div>`;
  }

  // Commissioner unlock
  if (!state.adminAuthed && !state._spectatorMode) {
    html += `<div style="text-align:center;margin-bottom:8px">
      <button onclick="var p=prompt('Enter PIN:');if(p)window.MG.inlineAuthQuick(p)"
        style="font-size:11px;color:var(--mg-text-muted);background:none;border:none;cursor:pointer;text-decoration:underline">
        Unlock commissioner features
      </button>
    </div>`;
  }

  // Add Player (admin only)
  if (state.adminAuthed) {
    html += `<div style="background:var(--bg-secondary);border-radius:10px;padding:12px 16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(212,160,23,0.5);margin-bottom:8px">Add Player</div>
      <div style="display:flex;gap:6px">
        <input type="text" id="add-player-name" placeholder="Name" style="flex:2;padding:8px 10px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;background:transparent;color:var(--text-primary)">
        <input type="number" id="add-player-hcp" placeholder="HCP" step="0.1" style="width:60px;padding:8px;border:1.5px solid var(--border-strong);border-radius:6px;font-size:14px;text-align:center;background:transparent;color:var(--text-primary)">
        <button onclick="window.MG.addPlayerInline()" style="padding:8px 14px;background:var(--gold-bright);color:var(--bg-secondary);border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Add</button>
      </div>
    </div>`;
  }

  return html;
}

// ================================================================
// TROPHY ROOM — Post-trip monument for completed events
// ================================================================
function renderTrophyRoom(state, config, players, pars, hcpIndex, holesPerRound, games, holes, gameState, scoredHoles, roundComplete) {
  const eventName = config?.event?.name || 'Golf Event';
  const courseName = config?.event?.course || config?.event?.venue || config?.course?.name || '';
  const eventDate = config?.event?.dates?.day1 || config?.event?.startDate || '';
  const structure = config?.structure || {};
  const skinsBetAmt = parseInt(structure?.skinsBet) || 0;
  const nassauBetAmt = parseInt(structure?.nassauBet) || 0;
  const pnl = computeRoundPnL(gameState, players, games, structure);
  const payPairs = computePayablePairs(pnl);
  const totalPar = pars.reduce((s, p) => s + p, 0) || 72;
  const slug = state._slug || (location.pathname.match(/\/waggle\/([a-z0-9_-]+)/)?.[1]) || 'event';

  // Stroke data — compute from holes if game engine hasn't run
  const strokeRunning = gameState?.stroke?.running || {};
  if (Object.keys(strokeRunning).length === 0 && scoredHoles.length > 0) {
    players.forEach(p => {
      let total = 0, counted = 0;
      scoredHoles.forEach(h => {
        const sc = holes[h]?.scores?.[p.name];
        if (sc != null) { total += sc; counted++; }
      });
      if (counted > 0) strokeRunning[p.name] = total;
    });
  }
  const skinsHolesAllTrophy = getSkinsHoles(gameState, holes, players);
  const skinsCount = {};
  players.forEach(p => { skinsCount[p.name] = 0; });
  Object.values(skinsHolesAllTrophy).forEach(h => { if (h.winner && skinsCount.hasOwnProperty(h.winner)) skinsCount[h.winner]++; });

  // Build standings
  const standingsData = players.map(p => {
    const name = p.name;
    const gross = strokeRunning[name] ?? null;
    const parForPlayed = scoredHoles.reduce((s, h) => s + (pars[h - 1] || 4), 0);
    const toPar = gross !== null ? gross - parForPlayed : null;
    const money = pnl[name] || 0;
    const skins = skinsCount[name] || 0;
    return { name, gross, toPar, money, skins, hi: p.handicapIndex ?? 0 };
  }).sort((a, b) => {
    if (Object.values(pnl).some(v => v !== 0)) return b.money - a.money;
    return (a.toPar ?? 999) - (b.toPar ?? 999);
  });

  const winner = standingsData[0];

  let html = '';

  // ── a) Trophy Header — gold gradient glow ──
  html += `<div style="background:linear-gradient(135deg,rgba(212,160,23,0.08) 0%,var(--bg-secondary) 30%,var(--green-muted) 60%,rgba(212,160,23,0.06) 100%);border:1px solid var(--gold-primary,var(--mg-gold));border-radius:12px;padding:32px 20px;text-align:center;margin-bottom:10px;position:relative;overflow:hidden;box-shadow:0 0 24px rgba(212,160,23,0.15)">
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-conic-gradient(rgba(212,160,23,0.03) 0% 25%,transparent 0% 50%) 0 0/40px 40px;pointer-events:none"></div>
    <div style="position:relative;z-index:1">
      <div style="font-size:56px;margin-bottom:8px">&#127942;</div>
      <div style="font-size:26px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${escHtml(eventName)}</div>
      <div style="display:inline-block;padding:4px 14px;background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.4);border-radius:4px;margin-bottom:10px">
        <span style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--gold-bright)">Final Results</span>
      </div>
      ${courseName ? `<div style="font-size:13px;color:var(--text-secondary)">${escHtml(courseName)}</div>` : ''}
      ${eventDate ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${escHtml(eventDate)}</div>` : ''}
      ${state.bettorName ? `<div style="margin-top:8px"><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:rgba(212,160,23,0.15);border:1px solid rgba(212,160,23,0.3);border-radius:12px;font-size:11px;font-weight:600;color:var(--gold-bright)"><span style="width:5px;height:5px;border-radius:50%;background:var(--gold-bright)"></span>${escHtml(state.bettorName)}</span></div>` : ''}
      ${winner ? `<div style="margin-top:16px">
        <div style="font-size:11px;color:rgba(212,160,23,0.5);text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Champion</div>
        <div style="font-size:24px;font-weight:700;color:var(--gold-bright);margin-top:4px;text-shadow:0 0 16px rgba(212,160,23,0.4)">${escHtml(winner.name)}</div>
        ${winner.money > 0 ? `<div style="font-family:'SF Mono',monospace;font-size:22px;font-weight:800;color:var(--win);margin-top:4px;text-shadow:0 0 8px rgba(63,185,80,0.3)">+$${winner.money}</div>` : ''}
      </div>` : ''}
    </div>
  </div>`;

  // ── b) Final Leaderboard — card-based rows ──
  html += `<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px 10px">
      <span style="font-size:16px;font-weight:800;color:var(--gold-bright)">Final Leaderboard</span>
      <span style="font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:rgba(212,160,23,0.4);background:rgba(212,160,23,0.08);padding:3px 8px;border-radius:3px">FINAL</span>
    </div>`;

  standingsData.forEach((p, i) => {
    const isLeader = i === 0;
    const isTop3 = i < 3;
    const toParStr = p.toPar === null ? '--' : p.toPar === 0 ? 'E' : p.toPar > 0 ? '+' + p.toPar : String(p.toPar);
    const toParColor = p.toPar === null ? 'var(--text-tertiary)' : p.toPar < 0 ? 'var(--gold-bright)' : p.toPar > 0 ? 'var(--loss)' : 'white';
    const moneyStr = p.money === 0 ? '--' : p.money > 0 ? '+$' + p.money : '-$' + Math.abs(p.money);
    const moneyColor = p.money > 0 ? 'var(--win)' : p.money < 0 ? 'var(--loss)' : 'var(--text-tertiary)';
    const moneyGlow = p.money > 0 ? 'text-shadow:0 0 8px rgba(63,185,80,0.3)' : p.money < 0 ? 'text-shadow:0 0 8px rgba(248,81,73,0.3)' : '';

    // Card styles — leader gets gold border only (no gradient for readability)
    const cardBg = isLeader
      ? 'background:var(--bg-secondary);border:1.5px solid var(--gold-primary,var(--mg-gold))'
      : 'background:var(--bg-secondary);border:1px solid var(--border)';

    // Position badge
    const badgeBg = isLeader ? 'background:var(--gold-bright);color:var(--bg-secondary)' : isTop3 ? 'background:transparent;border:1.5px solid var(--gold-primary,var(--mg-gold));color:var(--gold-bright)' : 'background:transparent;border:1.5px solid var(--border-strong,var(--border));color:var(--text-secondary)';

    // To-par size
    const toParSize = isLeader ? 'font-size:28px;font-weight:900' : 'font-size:20px;font-weight:800';

    html += `<div style="${cardBg};border-radius:10px;padding:12px 14px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
          <span style="width:24px;height:24px;border-radius:50%;${badgeBg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;box-sizing:border-box">${isLeader ? '&#127942;' : i + 1}</span>
          <span style="font-size:15px;font-weight:${isLeader ? '700' : '500'};color:var(--text-primary)">${escHtml(p.name)}</span>
        </div>
        <span style="font-family:'SF Mono',monospace;${toParSize};color:${toParColor};flex-shrink:0;margin-left:8px">${toParStr}</span>
      </div>
      <div style="display:flex;gap:12px;margin-left:32px;margin-top:4px;font-size:12px;font-family:'SF Mono',monospace">
        <span style="color:${moneyColor};font-weight:700;${moneyGlow}">${moneyStr}</span>
        <span style="color:${p.skins > 0 ? 'var(--gold-bright)' : 'var(--border-strong)'}">${p.skins} skin${p.skins !== 1 ? 's' : ''}</span>
        ${p.gross !== null ? `<span style="color:var(--text-tertiary)">${p.gross} gross</span>` : ''}
      </div>
    </div>`;
  });

  html += `</div>`;

  // ── c) Settlement Summary ──
  if (payPairs.length > 0) {
    const venmoHandles = {};
    (config?.players || config?.roster || []).forEach(p => {
      if (p.venmo) venmoHandles[p.name || p.member] = p.venmo.replace(/^@/, '');
    });

    html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--gold-primary,var(--mg-gold));border-radius:10px;padding:16px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-bright);margin-bottom:12px">Who Pays Who</div>`;

    payPairs.forEach(({ from, to, amount }) => {
      const noteText = encodeURIComponent(`${eventName} \u00b7 Waggle Settlement`);
      const toVenmo = venmoHandles[to] || to;
      const venmoUrl = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(toVenmo)}&amount=${amount}&note=${noteText}`;
      const venmoWeb = `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(toVenmo)}&amount=${amount}&note=${noteText}`;

      html += `<div style="background:var(--bg-tertiary);border-radius:10px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:15px;font-weight:700"><span style="color:var(--loss)">${escHtml(from)}</span> <span style="font-size:13px;font-weight:500;color:var(--text-tertiary)">pays</span> <span style="color:var(--win)">${escHtml(to)}</span></div>
          <div style="font-size:24px;font-weight:900;color:var(--text-primary)">$${amount}</div>
        </div>
        <a href="${venmoUrl}" onclick="if(!this.href.startsWith('venmo'))return;event.preventDefault();window.location.href=this.href;setTimeout(()=>window.open('${venmoWeb}','_blank'),1200)"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:#008CFF;color:white;padding:14px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;min-height:44px;box-shadow:0 2px 8px rgba(0,140,255,0.3)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 1.5c.9 1.5 1.3 3 1.3 4.9 0 6.1-5.2 14-9.4 19.6H3.5L0 2.3l7.1-.7 1.9 15.2C11.3 13 14 6.4 14 3.5c0-1.2-.2-2-.6-2.7l6.1.7z"/></svg>
          Venmo $${amount}
        </a>
      </div>`;
    });

    html += `</div>`;
  }

  // ── d) AI Recap ──
  {
    const recap = state._lastRecap;
    if (recap) {
      html += `<div style="background:linear-gradient(135deg,rgba(212,160,23,0.06),rgba(212,160,23,0.02));border:1.5px solid var(--mg-gold);border-radius:10px;padding:16px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--mg-gold-dim);margin-bottom:10px">AI Recap</div>
        <div style="font-size:14px;line-height:1.6;color:var(--mg-text);font-style:italic;white-space:pre-wrap">${escHtml(recap)}</div>
      </div>`;
    } else {
      html += `<div style="margin-bottom:10px">
        <button onclick="window.MG.getRecap()" style="width:100%;padding:14px;background:var(--mg-surface);border:1.5px solid var(--mg-gold);border-radius:10px;color:var(--mg-gold-dim);font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Generate AI Recap
        </button>
        <div id="mg-recap-card" style="display:none"></div>
      </div>`;
    }
  }

  // ── e) Memorable Moments ──
  {
    const moments = [];

    // Biggest Skin
    if (games.skins) {
      const skinsHolesMoments = skinsHolesAllTrophy;
      let biggestSkin = null;
      Object.entries(skinsHolesMoments).forEach(([h, d]) => {
        if (d.winner && (d.potWon || 1) > (biggestSkin?.pot || 0)) {
          biggestSkin = { player: d.winner, hole: parseInt(h), pot: d.potWon || 1 };
        }
      });
      if (biggestSkin) {
        const amt = biggestSkin.pot * (players.length - 1) * skinsBetAmt;
        const carryText = biggestSkin.pot > 1 ? ` (${biggestSkin.pot}-hole carry)` : '';
        moments.push(`Biggest Skin: ${biggestSkin.player} \u2014 ${amt > 0 ? '$' + amt : biggestSkin.pot + 'x'} on Hole ${biggestSkin.hole}${carryText}`);
      }
    }

    // Most Skins
    if (games.skins) {
      let mostSkinsPlayer = null;
      let mostSkinsCount = 0;
      Object.entries(skinsCount).forEach(([name, cnt]) => {
        if (cnt > mostSkinsCount) { mostSkinsPlayer = name; mostSkinsCount = cnt; }
      });
      if (mostSkinsPlayer && mostSkinsCount > 0) {
        const totalAmt = Object.entries(skinsHolesAllTrophy)
          .filter(([, d]) => d.winner === mostSkinsPlayer)
          .reduce((s, [, d]) => s + (d.potWon || 1), 0) * (players.length - 1) * skinsBetAmt;
        moments.push(`Most Skins: ${mostSkinsPlayer} \u2014 ${mostSkinsCount} skin${mostSkinsCount !== 1 ? 's' : ''}${totalAmt > 0 ? ' ($' + totalAmt + ')' : ''}`);
      }
    }

    // Worst Hole
    let worstHoleData = null;
    scoredHoles.forEach(h => {
      const scores = holes[h]?.scores || {};
      Object.entries(scores).forEach(([name, score]) => {
        const par = pars[h - 1] || 4;
        const over = score - par;
        if (over >= 2 && (!worstHoleData || over > worstHoleData.over)) {
          const label = over === 2 ? 'double bogey' : over === 3 ? 'triple bogey' : '+' + over;
          worstHoleData = { player: name, hole: h, over, label };
        }
      });
    });
    if (worstHoleData) {
      moments.push(`Worst Hole: ${worstHoleData.player} \u2014 ${worstHoleData.label} on #${worstHoleData.hole}`);
    }

    // Best Comeback (biggest P&L swing from negative to less negative or positive)
    if (standingsData.length >= 2) {
      const last = standingsData[standingsData.length - 1];
      const secondToLast = standingsData[standingsData.length - 2];
      if (last.money > secondToLast.money && last.money < 0) {
        moments.push(`Fought Hard: ${last.name} \u2014 finished at $${last.money} despite being the underdog`);
      }
    }

    if (moments.length > 0) {
      html += `<div style="margin-bottom:10px">
        <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-bright);padding:0 2px 10px">Memorable Moments</div>`;
      const momentIcons = ['&#127942;', '&#127775;', '&#128165;', '&#128170;'];
      moments.forEach((m, mi) => {
        html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
          <div style="font-size:20px;flex-shrink:0">${momentIcons[mi % momentIcons.length]}</div>
          <div style="font-size:13px;color:var(--text-primary);line-height:1.4">${escHtml(m)}</div>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ── f) Run It Back Button — gold CTA, most prominent ──
  html += `<div style="display:flex;gap:8px;margin-bottom:10px">
    <a href="/app/?create=1&clone=${encodeURIComponent(slug)}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;background:var(--gold-bright,var(--mg-gold));color:var(--bg-primary,var(--mg-green));border:none;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none;min-height:52px;box-shadow:0 3px 12px rgba(212,160,23,0.3)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      Run It Back
    </a>
  </div>`;

  // ── g) Share Results Button ──
  {
    const standingsText = standingsData.map((p, i) => {
      const moneyStr = p.money === 0 ? 'Even' : p.money > 0 ? '+$' + p.money : '-$' + Math.abs(p.money);
      return `${i + 1}. ${p.name} (${moneyStr})`;
    }).join('\\n');
    const shareText = `${eventName} \u2014 Final Results\\n${standingsText}\\n`;

    html += `<div style="margin-bottom:10px">
      <button onclick="(function(){var t='${escHtml(shareText).replace(/'/g, "\\'")}\\n'+location.href;if(navigator.share){navigator.share({title:'${escHtml(eventName).replace(/'/g, "\\'")} - Results',text:t,url:location.href}).catch(function(){})}else{navigator.clipboard.writeText(t).then(function(){alert('Results copied!')})}})()"
        style="width:100%;padding:14px;background:transparent;border:2px solid var(--gold-primary,var(--mg-gold));border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;color:var(--gold-bright)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share Results
      </button>
    </div>`;
  }

  return html;
}

// ===== TV / SPECTATOR MODE LEADERBOARD =====
export function renderTVLeaderboard(state) {
  const config = state._config;
  const gameState = state._gameState;
  const holes = state._holes || {};
  const pars = getCoursePars(config);
  const holesPerRound = config?.holesPerRound || 18;
  const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const holesPlayed = scoredHoles.length;
  const eventName = config?.event?.name || 'Golf Scramble';
  const venue = config?.event?.venue || '';
  const isScramble = (config?.event?.eventType || config?.eventType) === 'scramble';

  let html = '';

  // Full-screen TV container
  html += `<div class="tv-container">`;

  // Header bar
  html += `<div class="tv-header">
    <div class="tv-event-name">${escHtml(eventName)}</div>
    <div class="tv-event-meta">${escHtml(venue)}${venue && holesPlayed > 0 ? ' &middot; ' : ''}${holesPlayed > 0 ? holesPlayed + ' of ' + holesPerRound + ' holes' : ''} &middot; LIVE</div>
  </div>`;

  // Leaderboard table
  html += `<div class="tv-leaderboard">`;

  // Column headers
  html += `<div class="tv-row tv-row-header">
    <div class="tv-col-pos">POS</div>
    <div class="tv-col-team">TEAM</div>
    <div class="tv-col-thru">THRU</div>
    <div class="tv-col-score">SCORE</div>
    <div class="tv-col-topar">TO PAR</div>
  </div>`;

  if (isScramble && gameState?.scramble?.leaderboard?.length > 0) {
    const calcuttaTeams = state._calcutta?.teams || {};
    gameState.scramble.leaderboard.forEach((entry, i) => {
      const parForPlayed = holesPlayed > 0 ? pars.slice(0, Math.max(...scoredHoles)).reduce((s, p) => s + p, 0) : 0;
      const toPar = entry.total - parForPlayed;
      const toParStr = toPar === 0 ? 'E' : toPar > 0 ? '+' + toPar : String(toPar);
      const isLeader = i === 0;
      const isTop3 = i < 3;
      const toParColor = toPar < 0 ? 'var(--gold-bright)' : toPar > 0 ? 'var(--loss)' : 'var(--text-primary)';
      const cOwner = calcuttaTeams[entry.team];
      const ownerLabel = cOwner?.sold ? ` (${escHtml(cOwner.winner)})` : '';

      html += `<div class="tv-row ${isLeader ? 'tv-row-leader' : ''} ${isTop3 ? 'tv-row-top3' : ''}">
        <div class="tv-col-pos"><div class="tv-pos-badge ${isLeader ? 'tv-pos-leader' : ''}">${entry.position}</div></div>
        <div class="tv-col-team">
          <span class="tv-team-name">${escHtml(entry.team)}</span>
          ${ownerLabel ? `<span class="tv-team-owner">${ownerLabel}</span>` : ''}
        </div>
        <div class="tv-col-thru">${holesPlayed}</div>
        <div class="tv-col-score">${entry.total}</div>
        <div class="tv-col-topar" style="color:${toParColor}">${toParStr}</div>
      </div>`;
    });
  } else {
    // Buddies trip / player standings for TV mode
    const players = getPlayersFromConfig(config);
    const strokeRunning = gameState?.stroke?.running || {};
    const standings = players.map(p => ({
      name: p.name,
      total: strokeRunning[p.name] || 0,
      hi: p.handicapIndex || 0,
    })).sort((a, b) => a.total - b.total);

    standings.forEach((entry, i) => {
      const parForPlayed = holesPlayed > 0 ? pars.slice(0, Math.max(...scoredHoles)).reduce((s, p) => s + p, 0) : 0;
      const toPar = entry.total - parForPlayed;
      const toParStr = toPar === 0 ? 'E' : toPar > 0 ? '+' + toPar : String(toPar);
      const isLeader = i === 0;
      const isTop3 = i < 3;
      const toParColor = toPar < 0 ? 'var(--gold-bright)' : toPar > 0 ? 'var(--loss)' : 'var(--text-primary)';

      html += `<div class="tv-row ${isLeader ? 'tv-row-leader' : ''} ${isTop3 ? 'tv-row-top3' : ''}">
        <div class="tv-col-pos"><div class="tv-pos-badge ${isLeader ? 'tv-pos-leader' : ''}">${i + 1}</div></div>
        <div class="tv-col-team"><span class="tv-team-name">${escHtml(entry.name)}</span></div>
        <div class="tv-col-thru">${holesPlayed}</div>
        <div class="tv-col-score">${entry.total || '-'}</div>
        <div class="tv-col-topar" style="color:${toParColor}">${entry.total ? toParStr : '-'}</div>
      </div>`;
    });
  }

  html += `</div>`;

  // Footer bar: side games + branding
  const sideGames = config?.scrambleSideGames;
  const sponsors = config?.sponsors;
  html += `<div class="tv-footer">`;
  html += `<div class="tv-footer-left">`;

  // CTP results
  if (sideGames?.closestToPin?.length > 0) {
    sideGames.closestToPin.forEach(hole => {
      const winner = gameState?.sideGames?.ctp?.[hole];
      if (winner) html += `<span class="tv-footer-item">CTP #${hole}: ${escHtml(winner)}</span>`;
    });
  }
  // LD results
  if (sideGames?.longestDrive?.length > 0) {
    sideGames.longestDrive.forEach(hole => {
      const winner = gameState?.sideGames?.ld?.[hole];
      if (winner) html += `<span class="tv-footer-item">LD #${hole}: ${escHtml(winner)}</span>`;
    });
  }
  // Prize pool
  const entryFee = config?.scrambleEntryFee || 0;
  const teamCount = config?.scrambleTeams?.length || 0;
  const pool = entryFee * teamCount;
  if (pool > 0) html += `<span class="tv-footer-item">Prize Pool: $${pool.toLocaleString()}</span>`;
  // Calcutta pool
  if (state._calcutta?.pool > 0) html += `<span class="tv-footer-item">Calcutta Pool: $${state._calcutta.pool.toLocaleString()}</span>`;

  html += `</div>`;
  html += `<div class="tv-footer-right">betwaggle.com</div>`;
  html += `</div>`;

  // Sponsor ticker at very bottom
  if (sponsors && Object.keys(sponsors).length > 0) {
    html += `<div class="tv-sponsor-ticker"><div class="tv-sponsor-ticker-inner">`;
    Object.keys(sponsors).sort((a, b) => parseInt(a) - parseInt(b)).forEach(hole => {
      const s = sponsors[hole];
      html += `<span class="tv-sponsor-item">Hole ${hole}: ${escHtml(s.name)}</span>`;
    });
    // Duplicate for seamless scroll
    Object.keys(sponsors).sort((a, b) => parseInt(a) - parseInt(b)).forEach(hole => {
      const s = sponsors[hole];
      html += `<span class="tv-sponsor-item">Hole ${hole}: ${escHtml(s.name)}</span>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`;

  return html;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/'/g, '&#39;');
}

// ─── ODDS BET SLIP (DraftKings-style bottom sheet) ───
export function renderOddsBetSlip(state) {
  if (!state._oddsBetSlip) return '';
  const { player, betType, odds } = state._oddsBetSlip;
  const amount = state._oddsBetSlipAmount || '';
  const oddsNum = parseInt(odds.replace('+', ''));
  const isNeg = odds.startsWith('-');
  const payout = amount ? (isNeg
    ? (parseFloat(amount) * 100 / Math.abs(oddsNum)).toFixed(2)
    : (parseFloat(amount) * Math.abs(oddsNum) / 100).toFixed(2)
  ) : '0.00';

  return `<div data-odds-bet-slip style="position:fixed;bottom:0;left:0;right:0;z-index:300;background:var(--bg-secondary);border-top:2px solid var(--gold-primary, var(--gold-bright));border-radius:16px 16px 0 0;padding:16px;box-shadow:0 -4px 24px rgba(0,0,0,0.4);animation:slideUpSlip .25s ease-out">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;font-weight:600">${betType === 'to_win' ? 'To Win' : 'Head to Head'}</div>
        <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${escHtml(player)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'SF Mono',monospace;font-size:20px;font-weight:800;color:var(--gold-bright)">${odds}</span>
        <button onclick="window.MG.closeOddsBetSlip()" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">\u00d7</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      ${[5, 10, 20, 50].map(amt => `
        <button onclick="window.MG.setOddsBetAmount(${amt})" style="flex:1;padding:10px;border-radius:8px;border:1px solid ${String(amount)==String(amt)?'var(--gold-bright)':'var(--border)'};background:${String(amount)==String(amt)?'rgba(212,160,23,0.1)':'var(--bg-tertiary)'};color:${String(amount)==String(amt)?'var(--gold-bright)':'var(--text-primary)'};font-size:14px;font-weight:700;cursor:pointer;font-family:'SF Mono',monospace;-webkit-tap-highlight-color:transparent;transition:all .1s" onpointerdown="this.style.transform='scale(0.95)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">$${amt}</button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <input type="number" inputmode="numeric" placeholder="Custom \$" value="${amount}"
        oninput="window.MG.setOddsBetAmount(this.value)"
        style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);font-size:16px;font-family:'SF Mono',monospace;outline:none;-webkit-appearance:none">
      <div style="text-align:right;min-width:80px">
        <div style="font-size:11px;color:var(--text-secondary)">To win</div>
        <div style="font-size:18px;font-weight:800;color:var(--win, #4ade80);font-family:'SF Mono',monospace">\$${payout}</div>
      </div>
    </div>
    <button onclick="window.MG.placeOddsBet()"
      style="width:100%;padding:14px;border-radius:10px;border:none;background:${amount?'var(--gold-bright)':'var(--border)'};color:${amount?'var(--bg-primary, #111)':'var(--text-tertiary)'};font-size:16px;font-weight:800;cursor:${amount?'pointer':'default'};letter-spacing:0.5px;-webkit-tap-highlight-color:transparent;transition:all .15s;min-height:48px"
      ${amount?'':'disabled'}>
      ${amount ? 'Lock It In \u2014 \$' + amount + ' to win \$' + payout : 'Enter amount'}
    </button>
  </div>`;
}
