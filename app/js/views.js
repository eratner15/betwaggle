// All views for the Golf Event SPA — config-driven, no hardcoded tournament data
import { applyCapRule } from './data.js';
import { flightWinnerOdds, matchOdds, marginOdds, probToAmerican, probToDecimal, mlToDecimal, placeBet, settleBets, getMatchMoneyline, isMatchLocked } from './betting.js';
import { getFlightScenarioData, getRemainingMatches } from './scenarios.js';

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
function getPlayersFromConfig(config) {
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

  // Announcements
  if (state.announcements && state.announcements.length > 0) {
    const latest = state.announcements[state.announcements.length - 1];
    html += `<div class="mg-announcement"><p>${escHtml(latest)}</p></div>`;
  }

  // Player welcome / register card
  if (!state.bettorName) {
    html += `<div class="mg-card" style="text-align:center;padding:20px">
      <div style="font-size:32px;margin-bottom:8px">&#9971;</div>
      <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:4px">Welcome to ${escHtml(_C?.event?.name || 'the Event')}</div>
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
    .wg-feed-title { display:flex; align-items:center; gap:8px; font-family:'Playfair Display',serif; font-size:16px; font-weight:700; color:var(--mg-green); padding:0 4px 8px; }
    .wg-feed-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; animation:wg-pulse 2s infinite; }
    @keyframes wg-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
    .wg-feed-list { max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; padding:0 2px; }
    .wg-feed-item { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; border-radius:10px; background:var(--mg-card-bg,#1a1a2e); }
    .wg-feed-item.score { background:rgba(255,215,0,0.06); border-left:3px solid var(--mg-gold-dim,#b8860b); }
    .wg-feed-item.press { background:rgba(255,100,0,0.08); border-left:3px solid #f97316; }
    .wg-feed-item.chirp { position:relative; }
    .wg-feed-avatar { width:32px; height:32px; min-width:32px; border-radius:50%; background:var(--mg-green); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; text-transform:uppercase; }
    .wg-feed-body { flex:1; min-width:0; }
    .wg-feed-player { font-size:12px; font-weight:700; color:var(--mg-green); }
    .wg-feed-text { font-size:13px; color:var(--mg-text,#e0e0e0); margin-top:2px; word-break:break-word; }
    .wg-feed-emoji { font-size:24px; line-height:1; }
    .wg-feed-ts { font-size:10px; color:#888; margin-top:3px; }
    .wg-feed-input-bar { display:flex; align-items:center; gap:8px; margin-top:10px; padding:8px 12px; background:var(--mg-card-bg,#1a1a2e); border-radius:12px; border:1px solid rgba(255,255,255,0.08); }
    .wg-feed-input { flex:1; background:transparent; border:none; outline:none; color:var(--mg-text,#e0e0e0); font-size:14px; padding:6px 0; }
    .wg-feed-input::placeholder { color:#666; }
    .wg-feed-send { background:var(--mg-green); color:#fff; border:none; border-radius:8px; padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
    .wg-feed-emoji-bar { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
    .wg-feed-emoji-btn { background:rgba(255,255,255,0.06); border:none; border-radius:8px; padding:6px 10px; font-size:20px; cursor:pointer; transition:transform 0.15s; }
    .wg-feed-emoji-btn:active { transform:scale(1.3); }
    .wg-feed-empty { text-align:center; color:#666; font-size:13px; padding:20px 0; }
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
      const avatarBg = item.type === 'score' ? 'var(--mg-gold-dim,#b8860b)' : item.type === 'press' ? '#f97316' : 'var(--mg-green)';
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

    // Skins events from skins.holes per-hole records
    const skinsHoles = gameState.skins?.holes || {};
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
function computeRoundPnL(gameState, players, games, structure) {
  const skinsBet = parseInt(structure?.skinsBet) || 5;
  const nassauBet = parseInt(structure?.nassauBet) || 10;
  const n = players.length;
  const pnl = {};
  players.forEach(p => { pnl[p.name] = 0; });

  if (games.skins && gameState?.skins?.holes) {
    Object.values(gameState.skins.holes).forEach(h => {
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
    // Wolf P&L is complex — show points only, skip dollar calc for now
  }

  return pnl;
}

// ─── NAME PICKER MODAL ───
// Overlays a bottom sheet on first load until the player identifies themselves.
export function renderNamePickerModal(state) {
  const players = (state._allPlayers || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const input = state._nameInput || '';

  const filtered = input.length >= 1
    ? players.filter(p => (p.name || '').toLowerCase().includes(input.toLowerCase()))
    : players;

  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:flex-end">
    <div style="background:var(--mg-surface);border-radius:16px 16px 0 0;padding:24px 20px 40px;width:100%;max-width:480px;margin:0 auto;box-sizing:border-box">
      <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--mg-green);margin-bottom:4px">Who are you?</div>
      <div style="font-size:13px;color:var(--mg-text-muted);margin-bottom:16px">Pick your name to track bets and scores</div>
      <input type="text" placeholder="Search players..." value="${escHtml(input)}"
        oninput="window.MG.setNameInput(this.value);window.MG.refresh()"
        style="width:100%;padding:12px;border:2px solid var(--mg-border);border-radius:10px;font-size:16px;margin-bottom:12px;background:var(--mg-surface);color:var(--mg-text);box-sizing:border-box">
      <div style="display:flex;flex-direction:column;gap:2px;max-height:240px;overflow-y:auto;border:1px solid var(--mg-border);border-radius:10px">
        ${filtered.map(p => `<button onclick="window.MG.pickNameFromModal('${escHtml(p.name)}')"
          style="display:block;width:100%;padding:14px 16px;border:none;border-bottom:1px solid var(--mg-border);background:transparent;color:var(--mg-text);font-size:16px;font-weight:600;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent">
          ${escHtml(p.name)}<span style="font-size:12px;color:var(--mg-text-muted);font-weight:400;margin-left:8px">HI ${p.handicapIndex ?? p.handicap ?? 0}</span>
        </button>`).join('')}
        ${input.length >= 2 && !players.some(p => p.name.toLowerCase() === input.toLowerCase())
          ? `<button onclick="window.MG.pickNameFromModal('${escHtml(input)}')"
              style="display:block;width:100%;padding:14px 16px;border:none;background:transparent;color:var(--mg-green);font-size:16px;font-weight:700;text-align:left;cursor:pointer">
              + Join as "${escHtml(input)}"
             </button>`
          : ''}
      </div>
    </div>
  </div>`;
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
export function renderRoundFeed(state) {
  const config = state._config;
  const gameState = state._gameState;
  const holes = state._holes || {};
  const players = getPlayersFromConfig(config);
  const holesPerRound = config?.holesPerRound || 18;
  const games = config?.games || {};
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

  // Wolf rotation
  const playerNames = players.map(p => p.name);
  const wolfOrder = (config?.wolfOrder || playerNames).filter(n => playerNames.includes(n));
  const holeNum = state._scorecardHole || (latestHole + 1) || 1;
  const expectedWolf = wolfOrder.length > 0 ? wolfOrder[(holeNum - 1) % wolfOrder.length] : null;
  const wolfPick = gameState?.wolf?.picks?.[holeNum];
  const currentHoleScored = !!holes[holeNum];

  let html = '';

  // ── 0. Stakes context strip ──
  const skinsBetAmt = parseInt(config?.structure?.skinsBet) || 0;
  const nassauBetAmt = parseInt(config?.structure?.nassauBet) || 0;
  const stakeParts = [];
  if (games.nassau && nassauBetAmt > 0) stakeParts.push(`Nassau $${nassauBetAmt}`);
  if (games.skins && skinsBetAmt > 0) stakeParts.push(`Skins $${skinsBetAmt}`);
  if (games.wolf) stakeParts.push('Wolf');
  if (games.vegas) stakeParts.push('Vegas');
  if (stakeParts.length > 0 && players.length > 0) {
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);border-radius:8px;margin-bottom:10px;font-size:12px;color:var(--mg-text-muted)">
      <span>${stakeParts.join(' · ')}</span>
      <span>${players.length} players · Hole ${latestHole > 0 ? latestHole : 1} of ${holesPerRound}</span>
    </div>`;
  }

  // ── 1. Wolf announcement banner ──
  if (games.wolf && expectedWolf && !currentHoleScored && scoredHoles.length < holesPerRound) {
    const isMyWolfHole = state.adminAuthed && (state.bettorName === expectedWolf);
    if (isMyWolfHole) {
      html += `<div style="background:var(--mg-gold);color:#000;border-radius:10px;padding:12px 16px;margin-bottom:12px;text-align:center">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">You're the Wolf</div>
        <div style="font-size:18px;font-weight:700;margin:4px 0">Hole ${holeNum} — Pick Your Partner</div>
        <div style="font-size:12px">Go to Score tab to make your pick</div>
      </div>`;
    } else {
      html += `<div style="background:rgba(180,140,60,0.12);border:1px solid var(--mg-gold-dim);border-radius:10px;padding:10px 16px;margin-bottom:12px;text-align:center">
        <div style="font-size:11px;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:1px">Wolf · Hole ${holeNum}</div>
        <div style="font-size:16px;font-weight:700;color:var(--mg-gold);margin-top:2px">${escHtml(expectedWolf)} is the Wolf</div>
        ${wolfPick ? `<div style="font-size:12px;color:var(--mg-text-muted);margin-top:2px">Picked: ${wolfPick.partner ? escHtml(wolfPick.partner) : 'Lone wolf'}</div>` : ''}
      </div>`;
    }
  }

  // ── 2. Hole flash — full-screen overlay ──
  if (flashHole !== null && gameState) {
    const flashHoleData = gameState.skins?.holes?.[flashHole];
    const wolfResult = gameState.wolf?.results?.[flashHole];
    const wolfPickFlash = gameState.wolf?.picks?.[flashHole];
    const nassauFrontDone = flashHole === 9 && nassau.frontWinner;
    const nassauBackDone = flashHole === 18 && nassau.backWinner;
    const nassauTotalDone = flashHole === 18 && nassau.totalWinner;
    const skinsBet2 = parseInt(config?.structure?.skinsBet) || 5;
    const nassauBet2 = parseInt(config?.structure?.nassauBet) || 10;
    const n2 = players.length || 2;

    let flashType = 'hole'; // 'skin_win' | 'skin_carry' | 'nassau' | 'wolf' | 'hole'
    let flashTitle = `Hole ${flashHole}`;
    let flashMoney = '';
    let flashMoneyColor = 'var(--mg-gold)';
    let flashAccent = 'var(--mg-gold)';
    const flashLines = [];

    if (flashHoleData?.winner) {
      flashType = 'skin_win';
      flashTitle = `${escHtml(flashHoleData.winner)} wins`;
      const pot = flashHoleData.potWon || 1;
      const earned = pot * skinsBet2 * (n2 - 1);
      flashMoney = `+$${earned}`;
      flashMoneyColor = '#22c55e';
      flashAccent = '#22c55e';
      flashLines.push(pot > 1 ? `${pot} skins · Hole ${flashHole}` : `Hole ${flashHole}`);
    } else if (flashHoleData?.carried) {
      flashType = 'skin_carry';
      flashTitle = `Carried — Hole ${flashHole}`;
      const potAfter = gameState.skins?.pot || (flashHoleData.potBefore + 1);
      flashMoney = `$${potAfter * skinsBet2 * (n2 - 1)} pot`;
      flashMoneyColor = 'var(--mg-gold)';
      flashAccent = 'var(--mg-gold)';
      flashLines.push(`${potAfter} skin${potAfter !== 1 ? 's' : ''} on the line`);
    }
    if (nassauFrontDone) {
      const marker = nassau.frontWinner ? escHtml(nassau.frontWinner) : '?';
      flashLines.push(`Front 9: ${marker} leads · $${nassauBet2 * (n2 - 1)} at stake`);
    }
    if (nassauBackDone) {
      const marker = nassau.backWinner ? escHtml(nassau.backWinner) : '?';
      flashLines.push(`Back 9: ${marker} wins · +$${nassauBet2 * (n2 - 1)}`);
    }
    if (nassauTotalDone && nassau.totalWinner) {
      flashLines.push(`Nassau: ${escHtml(nassau.totalWinner)} wins · +$${nassauBet2 * (n2 - 1)}`);
    }
    if (wolfResult && wolfPickFlash) {
      const side = wolfPickFlash.partner
        ? `${escHtml(wolfPickFlash.wolf)} + ${escHtml(wolfPickFlash.partner)}`
        : `${escHtml(wolfPickFlash.wolf)} (lone wolf)`;
      flashLines.push(`Wolf: ${wolfResult.wolfWon ? side + ' win' : 'Opponents win'}`);
    }

    // Badge label per type
    const flashBadge = flashType === 'skin_win' ? 'SKIN' : flashType === 'skin_carry' ? 'CARRY' : flashType === 'nassau' ? 'NASSAU' : 'HOLE';

    html += `<div id="hole-flash-overlay" onclick="this.remove()" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;animation:flashIn 0.25s ease;cursor:pointer">
      <div style="background:var(--mg-surface);border-top:3px solid ${flashAccent};border-radius:16px;padding:28px 24px;text-align:center;width:100%;max-width:340px;position:relative" onclick="event.stopPropagation()">
        <button onclick="document.getElementById('hole-flash-overlay')?.remove()" style="position:absolute;top:10px;right:14px;background:none;border:none;color:var(--mg-text-muted);font-size:20px;cursor:pointer;line-height:1;padding:4px">×</button>
        <div style="display:inline-block;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--mg-gold);margin-bottom:14px">${flashBadge}</div>
        <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--mg-text);margin-bottom:4px;line-height:1.2">${flashTitle}</div>
        ${flashMoney ? `<div style="font-size:38px;font-weight:900;color:${flashMoneyColor};margin:12px 0 4px;line-height:1;letter-spacing:-1px">${flashMoney}</div>` : ''}
        ${flashLines.map(l => `<div style="font-size:12px;color:var(--mg-text-muted);margin-top:6px;letter-spacing:0.2px">${l}</div>`).join('')}
        <div style="font-size:10px;color:var(--mg-text-muted);margin-top:18px;letter-spacing:0.5px;opacity:0.5">TAP TO DISMISS</div>
      </div>
    </div>`;
  }

  // ── 3. Round progress bar ──
  const progress = scoredHoles.length > 0 ? Math.round((scoredHoles.length / holesPerRound) * 100) : 0;
  let nassauStatusText = '';
  if (games.nassau) {
    if (scoredHoles.length === 0) nassauStatusText = '';
    else if (scoredHoles.length < 9) nassauStatusText = 'Front 9 in progress';
    else if (scoredHoles.length === 9) nassauStatusText = nassau.frontWinner ? `Front 9 · ${escHtml(nassau.frontWinner)} leads` : 'Front 9 complete';
    else if (scoredHoles.length < 18) nassauStatusText = 'Back 9 in progress';
    else nassauStatusText = 'Round complete';
  }

  html += `<div class="mg-card" style="padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="font-size:13px;font-weight:600">${scoredHoles.length === 0 ? 'Round not started' : roundComplete ? 'Round complete' : `Through hole ${latestHole} of ${holesPerRound}`}</div>
      <div style="font-size:12px;color:var(--mg-text-muted)">${games.skins && scoredHoles.length > 0 ? `Skin pot: ${skinsPot}` : ''}</div>
    </div>
    <div style="height:6px;background:var(--mg-border);border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${progress}%;background:var(--mg-green);border-radius:3px;transition:width 0.6s ease"></div>
    </div>
    ${nassauStatusText ? `<div style="font-size:11px;color:var(--mg-text-muted);margin-top:5px">${nassauStatusText}</div>` : ''}
  </div>`;

  // ── 4. Live leaderboard (stroke net + running P&L) ──
  const strokeRunning = gameState?.stroke?.running || {};
  const strokeEntries = Object.entries(strokeRunning).sort((a, b) => a[1] - b[1]);
  const pnl = computeRoundPnL(gameState, players, games, config?.structure);
  const hasPnL = Object.values(pnl).some(v => v !== 0);

  if (strokeEntries.length > 0 && scoredHoles.length > 0) {
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:10px">LEADERBOARD</div>`;
    strokeEntries.forEach(([name, net], i) => {
      const isLead = i === 0;
      const netStr = net === 0 ? 'E' : net > 0 ? `+${net}` : `${net}`;
      const money = pnl[name] || 0;
      const moneyStr = money === 0 ? 'E' : money > 0 ? `+$${money}` : `-$${Math.abs(money)}`;
      const moneyColor = money > 0 ? '#22c55e' : money < 0 ? '#ef4444' : 'var(--mg-text-muted)';
      const netColor = net < 0 ? 'var(--mg-green)' : net === 0 ? 'var(--mg-text-muted)' : '#e74c3c';
      html += `<div style="display:flex;align-items:center;padding:10px 0;${i < strokeEntries.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <div style="width:22px;font-size:12px;font-weight:700;color:${isLead ? 'var(--mg-gold)' : 'var(--mg-text-muted)'};flex-shrink:0">${i + 1}</div>
        <div style="flex:1;font-size:15px;font-weight:${isLead ? '700' : '500'};min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</div>
        ${hasPnL ? `<div style="font-size:22px;font-weight:800;color:${moneyColor};margin-right:12px;min-width:60px;text-align:right">${moneyStr}</div>` : ''}
        <div style="font-size:14px;font-weight:600;color:${netColor};min-width:28px;text-align:right">${netStr}</div>
      </div>`;
    });
    html += `</div>`;
  } else if (scoredHoles.length === 0 && players.length > 0) {
    // Pre-round: show player roster
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">PLAYERS</div>`;
    players.forEach((p, i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i < players.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <div style="font-size:14px;font-weight:500">${escHtml(p.name)}</div>
        <div style="font-size:12px;color:var(--mg-text-muted)">HI: ${p.handicapIndex}</div>
      </div>`;
    });
    html += `<div style="text-align:center;padding:10px 0 4px">
      <div style="font-size:13px;color:var(--mg-text-muted)">${state.adminAuthed ? 'Tap <strong>Score</strong> to enter hole 1' : 'Waiting for round to start...'}</div>
    </div></div>`;
  }

  // ── 5. Event feed ──
  if (events.length > 0) {
    html += `<div class="mg-section-title">Feed</div>`;
    events.slice(0, 10).forEach(ev => {
      let badge = '', badgeBg = 'rgba(212,175,55,0.1)', badgeColor = 'var(--mg-gold)', text = '', sub = '';
      if (ev.type === 'skin_won') {
        badge = 'SKIN';
        badgeBg = 'rgba(34,197,94,0.1)'; badgeColor = '#22c55e';
        text = `<strong>${escHtml(ev.player)}</strong> wins the skin`;
        sub = `Hole ${ev.hole} &bull; ${ev.pot} skin${ev.pot !== 1 ? 's' : ''}`;
      } else if (ev.type === 'skin_carried') {
        badge = 'CARRY';
        text = `Skin carried`;
        sub = `Hole ${ev.hole} &bull; Pot now ${ev.potAfter || (ev.potBefore + 1)} skins`;
      } else if (ev.type === 'nassau_front_complete') {
        badge = 'FRONT';
        badgeBg = 'rgba(26,71,42,0.12)'; badgeColor = 'var(--mg-green)';
        text = `Front 9 complete`;
        sub = `${escHtml(ev.winner)} leads after 9`;
      } else if (ev.type === 'nassau_back_complete') {
        badge = 'BACK';
        badgeBg = 'rgba(26,71,42,0.12)'; badgeColor = 'var(--mg-green)';
        text = `Back 9 complete`;
        sub = `${escHtml(ev.winner)} wins back 9`;
      } else if (ev.type === 'nassau_total_complete') {
        badge = 'NASSAU';
        badgeBg = 'rgba(26,71,42,0.12)'; badgeColor = 'var(--mg-green)';
        text = `Nassau — round complete`;
        sub = `${escHtml(ev.winner)} wins total`;
      } else if (ev.type === 'wolf_result') {
        badge = 'WOLF';
        badgeBg = 'rgba(155,109,255,0.1)'; badgeColor = '#9B6DFF';
        const side = ev.loneWolf
          ? `${escHtml(ev.wolf)} (lone wolf)`
          : `${escHtml(ev.wolf)} + ${escHtml(ev.partner || '?')}`;
        text = ev.wolfWon ? `${side} wins hole` : `Opponents win wolf hole`;
        sub = `Hole ${ev.hole}`;
      } else {
        badge = `H${ev.hole || ''}`;
      }
      html += `<div class="mg-card" style="padding:10px 12px;display:flex;align-items:center;gap:12px">
        <div style="flex-shrink:0;min-width:44px;height:44px;background:${badgeBg};border:1px solid ${badgeColor};border-radius:8px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:9px;font-weight:800;letter-spacing:1px;color:${badgeColor}">${badge}</span>
        </div>
        <div>
          <div style="font-size:14px;font-weight:500">${text}</div>
          <div style="font-size:11px;color:var(--mg-text-muted)">${sub}</div>
        </div>
      </div>`;
    });
  } else if (scoredHoles.length > 0) {
    html += `<div class="mg-card" style="padding:12px;text-align:center">
      <div style="font-size:13px;color:var(--mg-text-muted)">Round in progress — no game events yet</div>
    </div>`;
  }

  // ── 6. Round complete CTA or Score Entry button ──
  if (roundComplete) {
    html += `<div class="mg-card" style="padding:20px;text-align:center;border-top:3px solid var(--mg-gold)">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--mg-gold);margin-bottom:8px">ROUND COMPLETE</div>
      <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--mg-text);margin-bottom:14px">Final results are ready</div>
      <a href="#settle" class="mg-btn mg-btn-primary" style="text-decoration:none;display:inline-block;width:auto;padding:11px 32px;font-size:15px">View Settlement</a>
    </div>`;
  } else {
    // Next hole to score
    const nextHole = latestHole < holesPerRound ? latestHole + 1 : holesPerRound;
    const pars2 = getCoursePars(config);
    const nextPar = pars2[nextHole - 1] || 4;
    html += `<button onclick="window.MG.openScoreModal()"
      style="width:100%;padding:14px 16px;background:var(--mg-green);color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px;-webkit-tap-highlight-color:transparent">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      <span>Score Hole ${nextHole}<span style="font-size:13px;font-weight:500;opacity:0.85;margin-left:6px">· Par ${nextPar}</span></span>
    </button>`;
  }

  // Activity Feed (trash talk + score updates)
  html += renderActivityFeed(state);

  // Score entry modal overlay
  if (state._scoreModal) {
    html += renderScoreModal(state, players);
  }

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
    const parDot = hPar === 3 ? `<div style="width:5px;height:5px;border-radius:50%;background:${isActive ? 'rgba(255,255,255,0.8)' : '#0D9488'};margin:0 auto;margin-top:1px"></div>`
                 : hPar === 5 ? `<div style="width:5px;height:5px;border-radius:50%;background:${isActive ? 'rgba(255,255,255,0.8)' : '#D4AF37'};margin:0 auto;margin-top:1px"></div>`
                 : `<div style="width:5px;height:5px;margin-top:1px"></div>`;
    holePicker += `<button onclick="window.MG.setScoreModalHole(${h})"
      style="min-width:36px;height:44px;border-radius:8px;border:2px solid ${isActive ? 'var(--mg-green)' : 'var(--mg-border)'};background:${isActive ? 'var(--mg-green)' : (hasScore ? 'rgba(26,71,42,0.08)' : 'transparent')};color:${isActive ? '#fff' : 'var(--mg-text)'};font-size:12px;font-weight:${isActive ? '700' : '500'};cursor:pointer;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 0;line-height:1.1">
      <span>${h}</span>
      ${parDot}
      </button>`;
  }
  holePicker += `</div>`;
  // Legend
  holePicker += `<div style="display:flex;gap:12px;font-size:11px;color:var(--mg-text-muted);margin-bottom:12px;margin-top:-8px">
    <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#0D9488;display:inline-block"></span>Par 3</span>
    <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#D4AF37;display:inline-block"></span>Par 5</span>
    <span style="color:var(--mg-text-muted)">No dot = Par 4</span>
  </div>`;

  // Score inputs per player
  let playerRows = players.map(p => {
    const val = scores[p.name] ?? '';
    const net = typeof val === 'number' ? val - par : null;
    let relStyle = '';
    if (net !== null) {
      if (net <= -2) relStyle = 'color:#1565C0;font-weight:700';
      else if (net === -1) relStyle = 'color:#2E7D32;font-weight:700';
      else if (net === 0) relStyle = 'color:var(--mg-text-muted)';
      else if (net === 1) relStyle = 'color:#C62828';
      else relStyle = 'color:#B71C1C;font-weight:700';
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
      let col = isActive ? '#fff' : 'var(--mg-text)';
      let border = isActive ? 'var(--mg-green)' : 'var(--mg-border)';
      if (!isActive && diff <= -2) { col = '#1565C0'; }
      else if (!isActive && diff === -1) { col = '#2E7D32'; }
      else if (!isActive && diff >= 2) { col = '#C62828'; }
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
          <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--mg-green)">Hole ${hole}</div>
          <div style="font-size:12px;color:var(--mg-text-muted)">Par ${par}${hcpRank !== null ? ` &nbsp;·&nbsp; HCP ${hcpRank}` : ''} &nbsp;·&nbsp; Enter gross scores</div>
        </div>
        <button onclick="window.MG.closeScoreModal()" style="width:32px;height:32px;border:none;background:var(--mg-border);border-radius:50%;font-size:18px;cursor:pointer;color:var(--mg-text);line-height:1">×</button>
      </div>
      ${holePicker}
      <div>${playerRows}</div>
      <button onclick="window.MG.submitScoreModal()" ${allFilled ? '' : 'disabled'}
        style="width:100%;margin-top:16px;padding:16px;background:${allFilled ? 'var(--mg-green)' : 'var(--mg-border)'};color:${allFilled ? '#fff' : 'var(--mg-text-muted)'};border:none;border-radius:12px;font-size:17px;font-weight:700;cursor:${allFilled ? 'pointer' : 'default'}">
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
          <input type="text" id="magic-contact" placeholder="Phone or email" style="width:100%;padding:12px;border:1.5px solid var(--mg-border,#333);border-radius:8px;background:var(--mg-surface,#1a1a1a);color:var(--mg-text,#fff);font-size:15px;margin-bottom:10px">
          <button class="mg-btn mg-btn-primary" style="width:100%" onclick="window.MG.requestMagicLink()">Send Magic Link</button>
        </div>

        <div id="magic-sent-section" style="display:none">
          <p class="text-sm" style="color:var(--mg-green,#16A34A);margin-bottom:12px;font-weight:600">Check your messages — a login code was sent.</p>
          <input type="text" id="magic-code" maxlength="6" placeholder="Enter 6-character code" autocomplete="off" autocapitalize="characters"
            style="width:100%;padding:14px;border:1.5px solid var(--mg-border,#333);border-radius:8px;background:var(--mg-surface,#1a1a1a);color:var(--mg-text,#fff);font-size:18px;text-align:center;letter-spacing:4px;font-family:monospace;margin-bottom:10px">
          <button class="mg-btn mg-btn-primary" style="width:100%" onclick="window.MG.verifyMagicCode()">Verify Code</button>
          <button class="mg-btn" style="width:100%;margin-top:6px;background:transparent;color:var(--mg-text-muted,#888);font-size:13px" onclick="window.MG.showMagicLinkForm()">Send again</button>
        </div>

        <div style="margin-top:16px;text-align:center">
          <button id="toggle-pin-btn" style="background:none;border:none;color:var(--mg-text-muted,#888);font-size:12px;cursor:pointer;text-decoration:underline" onclick="window.MG.togglePinEntry()">Use PIN instead</button>
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
          <div style="font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:var(--mg-gold)">W</div>
          <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--mg-gold-dim);margin-top:8px">Welcome, Admin</div>
          <p class="text-sm text-muted" style="margin-top:4px">Here's how to run your event in 3 steps</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="background:var(--mg-green);color:#000;font-weight:700;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div>
            <div>
              <div style="font-size:14px;font-weight:600">Set up your games</div>
              <div style="font-size:12px;color:var(--mg-text-muted)">Go to Scorecard tab → assign Vegas teams, set wolf order if needed</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="background:var(--mg-green);color:#000;font-weight:700;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div>
            <div>
              <div style="font-size:14px;font-weight:600">Enter scores hole by hole</div>
              <div style="font-size:12px;color:var(--mg-text-muted)">Scorecard tab → pick a hole → enter gross scores → Save. Odds update live.</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="background:var(--mg-green);color:#000;font-weight:700;font-size:13px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div>
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
      <span style="font-size:10px;background:${settledPL >= 0 ? 'var(--mg-win)' : 'var(--mg-loss)'};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700">${settledPL >= 0 ? 'HOUSE UP' : 'HOUSE DOWN'}</span>
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
      const color = pct > 70 ? 'var(--mg-loss)' : pct > 55 ? '#f59e0b' : 'var(--mg-win)';
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
      else if (b.status === 'voided') badge = '<span style="color:#666;font-size:10px">V</span>';
      html += `<div style="padding:4px 14px;border-bottom:1px solid var(--mg-border);display:flex;align-items:center;gap:6px;font-size:11px">
        <span style="font-weight:600;min-width:60px">${escHtml(b.bettor || '')}</span>
        <span style="flex:1;color:var(--mg-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(b.description || '')}</span>
        <span style="font-weight:700">$${(b.stake||0).toLocaleString()}</span>
        ${badge}
        ${b.status === 'active' ? `<button onclick="window.MG.voidBet('${b.id}')" style="background:var(--mg-loss);color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:9px;cursor:pointer">Void</button>` : ''}
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
          <button onclick="window.MG.approveJoin('${r.id}','${escHtml(r.name)}')" style="background:var(--mg-green);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Approve</button>
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
        <td style="padding:6px 10px;text-align:center"><button onclick="window.MG.adminAddCredits('${escHtml(p.name)}')" style="background:var(--mg-green);color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">+/-</button></td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

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
        else if (maxPct > 55) { exposureColor = '#f59e0b'; exposureLabel = pctA > pctB ? nameA + ' leaning' : nameB + ' leaning'; }
      } else {
        exposureLabel = 'No action';
        exposureColor = 'var(--mg-text-muted)';
      }

      // Match status overlay
      let statusTag = '';
      if (isFinal) statusTag = '<span style="background:#666;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:6px">FINAL</span>';
      else if (m.status === 'live') statusTag = '<span style="background:var(--mg-loss);color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:6px;animation:pulse 1.5s infinite">LIVE</span>';
      if (locked) statusTag += '<span style="background:#ef4444;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:4px">LOCKED</span>';
      if (hasOverride) statusTag += '<span style="background:#8b5cf6;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-left:4px">MOVED</span>';

      html += `<div style="margin:0 10px 8px;padding:10px 12px;border:1px solid ${locked ? '#ef4444' : 'var(--mg-border)'};border-radius:10px;background:${isFinal ? 'rgba(100,100,100,0.1)' : locked ? 'rgba(239,68,68,0.05)' : 'var(--mg-card-bg)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:11px;color:var(--mg-text-muted)">P${m.pairing}${statusTag}</div>
          <div style="display:flex;gap:4px">
            ${!isFinal ? `<button onclick="window.MG.lockMatch('${m.id}')" style="background:${locked ? '#ef4444' : 'transparent'};color:${locked ? '#fff' : 'var(--mg-text-muted)'};border:1px solid ${locked ? '#ef4444' : 'var(--mg-border)'};border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">${locked ? 'Unlock' : 'Lock'}</button>` : ''}
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
            <div style="width:${100 - pctA - pctB}%;background:#f59e0b"></div>
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

// ─── SCORECARD TAB (admin score entry) ───
function renderAdminScorecard(state) {
  const config = state._config;
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
      background:${isActive ? 'var(--mg-green)' : hasScore ? 'rgba(180,140,60,0.15)' : 'var(--mg-surface)'};
      color:${isActive ? '#fff' : 'var(--mg-text)'}">${h}</button>`;
  }
  html += `</div></div>`;

  // ── Vegas Teams Setup (shown when vegas is enabled) ──
  if (games.vegas) {
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">VEGAS TEAMS
        ${vegasAssigned ? `<span style="font-size:11px;color:var(--mg-green);font-weight:400;margin-left:8px">✓ Assigned</span>` : `<span style="font-size:11px;color:#e67e22;font-weight:400;margin-left:8px">Not set — assign before Round 1</span>`}
      </div>`;
    if (players.length >= 2) {
      const tA = vegasTeamA.length > 0 ? vegasTeamA : playerNames.slice(0, Math.ceil(playerNames.length / 2));
      const tB = vegasTeamB.length > 0 ? vegasTeamB : playerNames.slice(Math.ceil(playerNames.length / 2));
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--mg-gold);margin-bottom:6px;text-transform:uppercase">Team A</div>
          ${tA.map(n => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(180,140,60,0.12);border-radius:6px;margin-bottom:4px;font-size:12px;font-weight:500">
            <span>${escHtml(n)}</span>
            <button onclick="window.MG.vegasMovePlayer('${escHtml(n)}','B')" style="border:none;background:none;color:var(--mg-text-muted);cursor:pointer;font-size:11px;padding:0 2px" title="Move to Team B">→</button>
          </div>`).join('')}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--mg-green);margin-bottom:6px;text-transform:uppercase">Team B</div>
          ${tB.map(n => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(34,139,34,0.1);border-radius:6px;margin-bottom:4px;font-size:12px;font-weight:500">
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
          color:${isExpected?'#000':'var(--mg-text-muted)'};
          border:1px solid ${isExpected?'var(--mg-gold)':'var(--mg-border)'}">${escHtml(name.split(' ').pop())}${isExpected?' ★':''}</span>`;
      });
      html += `</div>`;
    }

    if (wolfPick) {
      // Already picked — show result with edit option
      html += `<div style="background:rgba(180,140,60,0.1);border:1px solid var(--mg-gold-dim);border-radius:8px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:13px">Wolf: <strong style="color:var(--mg-gold)">${escHtml(wolfPick.wolf)}</strong>`;
      if (wolfPick.partner) html += ` &nbsp;+&nbsp; Partner: <strong style="color:var(--mg-green)">${escHtml(wolfPick.partner)}</strong>`;
      else html += ` &nbsp;<span style="color:#e67e22;font-size:12px">(Lone wolf)</span>`;
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
          onclick="window.MG._wolfSelWolf='${escHtml(p.name)}';document.querySelectorAll('[id^=wbtn-]').forEach(b=>{b.style.background='';b.style.color='';b.style.borderColor=''});this.style.background='var(--mg-gold)';this.style.color='#000';this.style.borderColor='var(--mg-gold)'"
          style="padding:7px 12px;border:2px solid ${isExpected?'var(--mg-gold)':'var(--mg-border)'};border-radius:8px;background:${isExpected?'rgba(180,140,60,0.15)':'var(--mg-surface)'};color:var(--mg-text);cursor:pointer;font-size:13px;font-weight:${isExpected?700:400}">
          ${escHtml(p.name.split(' ').pop())}${isExpected?' ★':''}
        </button>`;
      });
      html += `</div></div>`;

      // Partner buttons
      html += `<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--mg-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Partner <span style="font-weight:400">(skip = lone wolf)</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button onclick="window.MG._wolfSelPartner=null;document.querySelectorAll('[id^=pbtn-]').forEach(b=>{b.style.background='';b.style.borderColor=''});this.style.background='rgba(230,119,34,0.2)';this.style.borderColor='#e67e22'"
            id="pbtn-none"
            style="padding:7px 12px;border:2px solid #e67e22;border-radius:8px;background:rgba(230,119,34,0.2);color:var(--mg-text);cursor:pointer;font-size:13px">
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
          ${isWolf ? `<span style="font-size:10px;background:var(--mg-gold);color:#000;border-radius:4px;padding:1px 5px;margin-left:4px">WOLF</span>` : ''}
          ${isPartner ? `<span style="font-size:10px;background:var(--mg-green);color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px">PARTNER</span>` : ''}
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
      staleHtml = `<div style="background:#1a1a1a;border:1px solid #fbbf24;border-radius:8px;padding:8px 12px;font-size:12px;color:#fbbf24;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span>⚠</span><span>Last updated ${ageMins} min ago — tap to refresh</span>
        <button onclick="window.MG.refresh()" style="margin-left:auto;background:#fbbf24;color:#000;border:none;border-radius:5px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer">Refresh</button>
      </div>`;
    }
  }

  let html = `<div class="mg-section-title">Live Scorecard</div>${staleHtml}`;

  if (Object.keys(holes).length === 0) {
    html += `<div class="mg-card" style="text-align:center;padding:32px 20px">
      <div style="font-size:36px;margin-bottom:12px">&#9971;</div>
      <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:4px">Round Not Started</div>
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
        <span style="font-size:13px;font-weight:${i===0?'700':'400'}">${escHtml(row.name)}${i===0?' <span style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--mg-gold);background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);padding:1px 5px;border-radius:3px;margin-left:5px">1ST</span>':''}</span>
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
    const pot = s.pot || 1;
    const won = Object.values(s.holes || {}).filter(h => h.winner).length;
    const carried = Object.values(s.holes || {}).filter(h => h.carried).length;
    html += `<div class="mg-card" style="padding:12px">
      <div class="mg-card-header" style="margin-bottom:8px">SKINS <span style="font-weight:400;color:var(--mg-text-muted)">${holesPlayed} holes</span></div>
      <div style="display:flex;gap:16px;margin-bottom:8px">
        <div><div style="font-size:11px;color:var(--mg-text-muted)">Pot</div><div style="font-size:20px;font-weight:700;color:var(--mg-gold)">×${pot}</div></div>
        <div><div style="font-size:11px;color:var(--mg-text-muted)">Won</div><div style="font-size:20px;font-weight:700;color:var(--mg-green)">${won}</div></div>
        <div><div style="font-size:11px;color:var(--mg-text-muted)">Carried</div><div style="font-size:20px;font-weight:700">${carried}</div></div>
      </div>`;
    const holeEntries = Object.entries(s.holes || {});
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
        <span style="font-weight:500">${escHtml(name.split(' ').pop())}${hasPress?` <span style="font-size:9px;background:#e67e22;color:#fff;border-radius:3px;padding:1px 4px">PRESS</span>`:''}
        </span>
        <span style="text-align:center;color:${(s.front||0)<0?'var(--mg-green)':(s.front||0)>0?'#e74c3c':'var(--mg-text)'}">${s.front||0}</span>
        <span style="text-align:center;color:${(s.back||0)<0?'var(--mg-green)':(s.back||0)>0?'#e74c3c':'var(--mg-text)'}">${s.back||0}</span>
        <span style="text-align:center;font-weight:700;color:${(s.total||0)<0?'var(--mg-green)':(s.total||0)>0?'#e74c3c':'var(--mg-text)'}">${s.total||0}</span>
        ${isAdmin ? `<span style="text-align:right">
          ${canPressFront ? `<button onclick="window.MG.pressNassau('${escHtml(name)}','front',${holesPlayedCount+1})" style="font-size:10px;padding:3px 6px;border:1px solid #e67e22;border-radius:4px;background:rgba(230,119,34,0.1);color:#e67e22;cursor:pointer;white-space:nowrap">Press F</button>` : ''}
          ${canPressBack  ? `<button onclick="window.MG.pressNassau('${escHtml(name)}','back',${holesPlayedCount+1})" style="font-size:10px;padding:3px 6px;border:1px solid #e67e22;border-radius:4px;background:rgba(230,119,34,0.1);color:#e67e22;cursor:pointer;white-space:nowrap">Press B</button>` : ''}
          ${!canPressFront && !canPressBack && canPressTotal ? `<button onclick="window.MG.pressNassau('${escHtml(name)}','full',${holesPlayedCount+1})" style="font-size:10px;padding:3px 6px;border:1px solid #e67e22;border-radius:4px;background:rgba(230,119,34,0.1);color:#e67e22;cursor:pointer;white-space:nowrap">Press</button>` : ''}
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
        <span style="font-weight:700;color:${e.net<0?'var(--mg-green)':e.net>0?'#e74c3c':'var(--mg-text)'}">${e.net===0?'E':e.net>0?'+'+e.net:e.net}</span>
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
      <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--mg-green);margin-bottom:8px">Pick Your Name First</div>
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
    if (games.skins && gameState?.skins?.holes) {
      const skinsWon = {};
      Object.values(gameState.skins.holes).forEach(h => {
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
        <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--mg-green);margin-bottom:16px">Make a Bet</div>
        <label class="text-xs text-muted" style="display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">What's the bet?</label>
        <input type="text" id="cash-bet-desc" value="${escHtml(m.desc)}" placeholder="e.g. Dave wins Front Nine" oninput="window.MG.setCashBetDesc(this.value)"
          style="width:100%;padding:12px;border:2px solid var(--mg-border);border-radius:8px;font-size:16px;margin-bottom:14px;background:var(--mg-surface-2,var(--mg-surface));color:var(--mg-text);box-sizing:border-box">
        <label class="text-xs text-muted" style="display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Amount</label>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          ${[5,10,20,50].map(n => `<button onclick="window.MG.setCashBetAmount(${n})" style="flex:1;padding:8px 0;border:2px solid ${amt===n?'var(--mg-green)':'var(--mg-border)'};border-radius:8px;background:${amt===n?'rgba(27,67,50,0.4)':'transparent'};color:var(--mg-text);font-size:14px;font-weight:700;cursor:pointer">$${n}</button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <span style="font-size:20px;font-weight:700;color:var(--mg-text)">$</span>
          <input type="number" id="cash-bet-amount" value="${m.amount||''}" placeholder="0" oninput="window.MG.setCashBetAmount(parseInt(this.value)||0)"
            inputmode="numeric" style="flex:1;padding:10px;border:2px solid var(--mg-border);border-radius:8px;font-size:20px;font-weight:700;text-align:center;background:var(--mg-surface-2,var(--mg-surface));color:var(--mg-text)">
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
      <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--mg-green);margin-bottom:8px">Select Your Name First</div>
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
    if (games.skins && gameState.skins?.holes) {
      const skinsWon = {};
      Object.values(gameState.skins.holes).forEach(h => {
        if (h.winner) skinsWon[h.winner] = (skinsWon[h.winner] || 0) + (h.potWon || 1);
      });
      const potSize = gameState.skins.pot || 1;
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
      <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:4px">No Live Markets Yet</div>
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
          <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:600;color:var(--mg-green)">${flight.name}</div>
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
    <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--mg-green);margin-bottom:10px">${escHtml(myName)}</div>
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
      <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--mg-green)">${escHtml(state.bettorName)}</div>
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
      html += `<div class="mg-bet-card" style="border-left:3px solid #f59e0b">
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
        ${b.status === 'won' ? `<button class="mg-share-btn" data-desc="${encodeURIComponent(b.description || '')}" data-ml="${encodeURIComponent(americanDisplay)}" data-stake="${b.stake}" data-towin="${(b.payout || b.stake) - b.stake}" data-status="won" style="margin-top:8px;width:100%;padding:8px;border:1px solid var(--mg-win);border-radius:8px;background:rgba(0,200,83,0.1);color:var(--mg-win);font-size:12px;font-weight:700;cursor:pointer">Brag About This Win</button>` : ''}
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

// ===== CALCUTTA =====
export function renderCalcutta(state) {
  if (!state.calcutta) state.calcutta = {};

  let totalPool = 0;
  Object.values(state.calcutta).forEach(c => totalPool += (c.price || 0));

  let html = `<div class="mg-section-title">Calcutta Auction</div>
    <div class="mg-card">
      <div class="flex-between">
        <div>
          <div class="text-xs text-muted">Total Pool</div>
          <div style="font-size:24px;font-weight:700;color:var(--mg-gold-dim)">$${totalPool.toLocaleString()}</div>
        </div>
        <div style="text-align:right">
          <div class="text-xs text-muted">Teams Sold</div>
          <div style="font-size:24px;font-weight:700;color:var(--mg-green)">${Object.keys(state.calcutta).length}/48</div>
        </div>
      </div>
    </div>`;

  flightOrder().forEach(fId => {
    const flight = F(fId);
    html += `<div class="mg-card">
      <div class="mg-card-header">${flight.name}</div>`;

    flight.teamIds.forEach(tid => {
      const t = T(tid);
      const c = state.calcutta[tid] || {};
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--mg-border)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${TN(t)}</div>
          ${c.buyer ? `<div class="text-xs text-muted">${escHtml(c.buyer)} — $${c.price}</div>` : '<div class="text-xs text-muted">Unsold</div>'}
        </div>
        <button class="mg-btn mg-btn-outline" style="width:auto;padding:4px 10px;font-size:11px" onclick="window.MG.editCalcutta(${tid})">
          ${c.buyer ? 'Edit' : 'Sell'}
        </button>
      </div>`;
    });

    html += `</div>`;
  });

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
        <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--mg-gold-dim);margin-top:8px">Champions!</div>
        <div style="font-size:18px;font-weight:600;color:var(--mg-green);margin-top:4px">${winner.member} & ${winner.guest}</div>
      </div>`;
    }
  }

  return html;
}

// ===== SETTLEMENT CARD =====
export function renderSettlement(state) {
  const gameState = state._gameState;
  const holes = state._holes || {};
  const config = state._config;
  const games = config?.games || {};
  const holesPlayed = Object.keys(holes).length;

  let html = `<div class="mg-section-title" style="display:flex;justify-content:space-between;align-items:center">
    <span>Settlement Card</span>
    <div style="display:flex;gap:8px">
      <button class="mg-btn" style="width:auto;padding:6px 14px;font-size:12px;background:var(--mg-surface);border:1px solid var(--mg-border);color:var(--mg-text)" onclick="window.MG.getRecap()">AI Recap</button>
      <button class="mg-btn mg-btn-gold" style="width:auto;padding:6px 16px;font-size:13px" onclick="window.MG.exportSettlementCard()">📸 Export</button>
      <button class="mg-btn mg-btn-gold" style="width:auto;padding:6px 16px;font-size:13px" onclick="window.MG.shareSettlement()">Share</button>
    </div>
  </div>
  <div id="mg-recap-card" style="display:none"></div>`;

  if (!gameState || holesPlayed === 0) {
    html += `<div class="mg-card" style="text-align:center;padding:40px 20px">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--mg-text-muted);margin-bottom:10px">NO SCORES YET</div>
      <div style="font-family:'Playfair Display',serif;font-size:16px;font-weight:600;color:var(--mg-text)">Settlement appears after holes are scored</div>
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
    <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--mg-gold-dim);margin:4px 0">${escHtml(eventName)}</div>
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
      const moneyColor = money > 0 ? '#22c55e' : money < 0 ? '#ef4444' : 'var(--mg-text-muted)';
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
              <div style="font-size:15px;font-weight:700"><span style="color:#ef4444">${escHtml(from)}</span> <span style="font-size:13px;font-weight:500;color:var(--mg-text-muted)">pays</span> <span style="color:#22c55e">${escHtml(to)}</span></div>
            </div>
            <div style="font-size:28px;font-weight:900;color:var(--mg-text)">$${amount}</div>
          </div>
          <div style="display:flex;gap:8px">
            <a href="${venmoUrl}" onclick="if(!this.href.startsWith('venmo'))return;event.preventDefault();window.location.href=this.href;setTimeout(()=>window.open('${venmoWeb}','_blank'),1200)"
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:#3D95CE;color:#fff;padding:14px 12px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;min-height:48px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 1.5c.9 1.5 1.3 3 1.3 4.9 0 6.1-5.2 14-9.4 19.6H3.5L0 2.3l7.1-.7 1.9 15.2C11.3 13 14 6.4 14 3.5c0-1.2-.2-2-.6-2.7l6.1.7z"/></svg>
              Venmo $${amount}</a>
            <a href="${cashappUrl}" target="_blank" rel="noopener"
              style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:#00D64F;color:#fff;padding:14px 12px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;min-height:48px">
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
    const skinWinners = Object.entries(s.holes || {}).filter(([, d]) => d.winner);
    const carryovers = Object.entries(s.holes || {}).filter(([, d]) => d.carried);
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
      html += `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--mg-border);${i === 0 ? 'background:rgba(52,211,153,0.05);' : ''}">
        <span style="font-size:13px;font-weight:${isLeader ? '700' : '400'}">${escHtml(name)}</span>${isLeader ? `<span style="font-size:9px;font-weight:800;letter-spacing:1px;color:var(--mg-gold);background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);padding:1px 5px;border-radius:3px;margin-left:6px">1ST</span>` : ''}
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
        <div style="background:#FAF8F5;border-radius:16px;max-width:380px;width:100%;padding:28px 24px;text-align:center">
          <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#0D2818;margin-bottom:4px">Round Complete</div>
          <div style="font-size:14px;color:#7A7A7A;margin-bottom:20px">${escHtml(eventName)}</div>
          <div style="font-size:13px;color:#3D3D3D;margin-bottom:20px;line-height:1.6">Drop the settlement card in the group chat. Everyone sees who owes what — with Venmo links.</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button onclick="window.MG.exportSettlementCard()" style="width:100%;padding:16px;background:#C9A84C;color:#0D2818;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">Export Settlement Card</button>
            <button onclick="window.MG.shareSettlement()" style="width:100%;padding:16px;background:#0D2818;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">Share Results</button>
          </div>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid #D4CFC7">
            <div style="font-size:12px;color:#7A7A7A;margin-bottom:8px">Want to run your own?</div>
            <a href="${referralUrl}" style="display:block;padding:12px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);border-radius:8px;color:#9A7A2E;font-size:14px;font-weight:700;text-decoration:none">Create Your Outing</a>
          </div>
          <button onclick="document.getElementById('settle-share-modal').remove()" style="margin-top:12px;background:none;border:none;color:#7A7A7A;font-size:13px;cursor:pointer;padding:8px">Dismiss</button>
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
      const color = money > 0 ? 'var(--mg-win,#22c55e)' : money < 0 ? 'var(--mg-loss,#ef4444)' : 'var(--mg-text-muted)';
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
          <tr style="background:var(--mg-surface-2,rgba(0,0,0,0.05))">
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

      html += `<tr style="${pi % 2 === 1 ? 'background:rgba(0,0,0,0.03)' : ''}">
        <td style="padding:4px 6px;font-weight:600;font-size:13px">${escHtml(player.name.split(' ')[0])}</td>`;

      playerScores.forEach((gross, idx) => {
        const h = holeNums[idx];
        const par = pars[h - 1] || 4;
        let cellStyle = 'text-align:center;padding:4px 2px;font-size:13px;';
        let display = gross !== null ? gross : '·';
        if (gross !== null) {
          const diff = gross - par;
          if (diff <= -2) cellStyle += 'background:#1d4ed8;color:#fff;border-radius:50%;width:22px;height:22px;line-height:22px;display:inline-block;'; // eagle
          else if (diff === -1) cellStyle += 'background:var(--mg-green);color:#fff;border-radius:50%;width:22px;height:22px;line-height:22px;display:inline-block;'; // birdie
          else if (diff === 1) cellStyle += 'border:2px solid #e74c3c;border-radius:2px;'; // bogey
          else if (diff >= 2) cellStyle += 'border:2px solid #e74c3c;border-radius:50%;'; // double+
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
    <span><span style="display:inline-block;width:14px;height:14px;border:2px solid #e74c3c;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Bogey+</span>
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

// ─── Round-Mode Scenario / What-If ─────────────────────────────
function renderRoundScenarios(state) {
  const config = state._config;
  const gameState = state._gameState;
  const holes = state._holes || {};
  const players = getPlayersFromConfig(config);
  const holesPerRound = config?.holesPerRound || 18;
  const games = config?.games || {};
  const pars = getCoursePars(config);

  const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  const holesPlayed = scoredHoles.length;
  const remainingHoles = [];
  for (let h = 1; h <= holesPerRound; h++) {
    if (!scoredHoles.includes(h)) remainingHoles.push(h);
  }

  // Simulated scores stored in state._scenario.simHoles = { holeNum: { playerName: score } }
  if (!state._scenario) state._scenario = {};
  if (!state._scenario.simHoles) state._scenario.simHoles = {};
  const simHoles = state._scenario.simHoles;

  let html = '';

  // Header
  html += `<div style="margin-bottom:16px">
    <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--mg-text)">What If...</div>
    <div style="font-size:13px;color:var(--mg-text-muted);margin-top:2px">See how remaining holes change the outcome</div>
  </div>`;

  // Current standings
  const currentPnl = computeRoundPnL(gameState, players, games, config?.structure);
  const hasPnl = Object.values(currentPnl).some(v => v !== 0);
  const nassau = gameState?.nassau || {};

  if (hasPnl || holesPlayed > 0) {
    const sorted = [...players].sort((a, b) => (currentPnl[b.name] || 0) - (currentPnl[a.name] || 0));
    html += `<div class="mg-card" style="padding:12px;margin-bottom:12px">
      <div class="mg-card-header" style="margin-bottom:8px">CURRENT STANDINGS · THRU ${holesPlayed}</div>`;
    sorted.forEach((p, i) => {
      const money = currentPnl[p.name] || 0;
      const moneyStr = money === 0 ? 'E' : money > 0 ? `+$${money}` : `-$${Math.abs(money)}`;
      const moneyColor = money > 0 ? '#22c55e' : money < 0 ? '#ef4444' : 'var(--mg-text-muted)';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i < sorted.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <span style="font-size:14px;font-weight:${i === 0 && money > 0 ? '700' : '500'}">${escHtml(p.name)}</span>
        <span style="font-size:16px;font-weight:700;color:${moneyColor}">${moneyStr}</span>
      </div>`;
    });
    // Nassau status
    const nassauParts = [];
    if (nassau.frontWinner) nassauParts.push(`Front: ${escHtml(nassau.frontWinner)}`);
    if (nassau.backWinner) nassauParts.push(`Back: ${escHtml(nassau.backWinner)}`);
    if (nassau.totalWinner) nassauParts.push(`Total: ${escHtml(nassau.totalWinner)}`);
    if (nassauParts.length > 0) {
      html += `<div style="font-size:11px;color:var(--mg-text-muted);margin-top:8px;padding-top:6px;border-top:1px solid var(--mg-border)">Nassau: ${nassauParts.join(' · ')}</div>`;
    }
    // Skins leader
    const skinsHoles = gameState?.skins?.holes || {};
    const skinsCount = {};
    players.forEach(p => { skinsCount[p.name] = 0; });
    Object.values(skinsHoles).forEach(h => { if (h.winner && skinsCount.hasOwnProperty(h.winner)) skinsCount[h.winner]++; });
    const skinsEntries = Object.entries(skinsCount).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    if (skinsEntries.length > 0) {
      html += `<div style="font-size:11px;color:var(--mg-text-muted);margin-top:4px">Skins: ${skinsEntries.map(([n, c]) => `${escHtml(n)} (${c})`).join(', ')}</div>`;
    }
    html += `</div>`;
  }

  if (remainingHoles.length === 0) {
    html += `<div class="mg-card" style="padding:20px;text-align:center;color:var(--mg-text-muted)">
      All ${holesPerRound} holes have been scored. View <a href="#settle" style="color:var(--mg-gold)">settlement</a> for final results.
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
    players.forEach(p => {
      const simScore = simHoles[h]?.[p.name];
      // Score buttons: range based on par
      const scores = [par - 2, par - 1, par, par + 1, par + 2];
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.name)}</span>
        <div style="display:flex;gap:3px">`;
      scores.forEach(s => {
        const selected = simScore === s;
        const label = s === par - 2 ? 'Eag' : s === par - 1 ? 'Bir' : s === par ? 'Par' : s === par + 1 ? 'Bog' : 'Dbl';
        html += `<button style="min-width:32px;height:28px;border-radius:6px;border:1px solid ${selected ? 'var(--mg-gold)' : 'var(--mg-border)'};background:${selected ? 'rgba(212,175,55,0.15)' : 'transparent'};color:${selected ? 'var(--mg-gold)' : 'var(--mg-text-muted)'};font-size:10px;font-weight:${selected ? '800' : '600'};cursor:pointer" onclick="window.MG.setSimHoleScore(${h},'${escHtml(p.name)}',${s})">${s}</button>`;
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

  // Projected P&L — merge real game state with simulated holes
  if (simCount > 0) {
    // Build a merged gameState by replaying skins/nassau with sim scores
    const mergedPnl = computeSimulatedPnL(gameState, simHoles, players, games, config?.structure, holesPerRound, pars, holes);
    const projSorted = [...players].sort((a, b) => (mergedPnl[b.name] || 0) - (mergedPnl[a.name] || 0));

    html += `<div class="mg-card" style="padding:12px;margin-top:12px;border:2px solid var(--mg-gold)">
      <div class="mg-card-header" style="margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span style="font-size:10px;background:var(--mg-gold);color:var(--mg-green);padding:2px 6px;border-radius:3px;font-weight:800">SIM</span>
        PROJECTED P&L
      </div>`;
    projSorted.forEach((p, i) => {
      const money = mergedPnl[p.name] || 0;
      const cur = currentPnl[p.name] || 0;
      const diff = money - cur;
      const moneyStr = money === 0 ? 'E' : money > 0 ? `+$${money}` : `-$${Math.abs(money)}`;
      const moneyColor = money > 0 ? '#22c55e' : money < 0 ? '#ef4444' : 'var(--mg-text-muted)';
      const diffStr = diff === 0 ? '' : diff > 0 ? `(+$${diff})` : `(-$${Math.abs(diff)})`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i < projSorted.length - 1 ? 'border-bottom:1px solid var(--mg-border)' : ''}">
        <span style="font-size:14px;font-weight:${i === 0 && money > 0 ? '700' : '500'}">${escHtml(p.name)}</span>
        <div style="text-align:right">
          <span style="font-size:16px;font-weight:700;color:${moneyColor}">${moneyStr}</span>
          ${diffStr ? `<span style="font-size:11px;color:var(--mg-text-muted);margin-left:4px">${diffStr}</span>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
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
    html += `<span style="font-family:'Playfair Display',serif;font-size:15px;${isSimulated && sim.scoreA < sim.scoreB ? 'color:var(--mg-text-muted)' : ''}">${TN(tA)}</span>`;
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
    html += `<span style="font-family:'Playfair Display',serif;font-size:15px;${isSimulated && sim.scoreB < sim.scoreA ? 'color:var(--mg-text-muted)' : ''}">${TN(tB)}</span>`;
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
  html += `<thead><tr style="background:var(--mg-bg);font-size:10px;font-weight:700;color:var(--mg-text-muted);text-transform:uppercase;letter-spacing:0.5px">
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
      clinched: { bg: 'var(--mg-green)', color: '#fff' },
      alive: { bg: 'var(--mg-gold)', color: 'var(--mg-green)' },
      bubble: { bg: 'var(--mg-odds-bg)', color: 'var(--mg-text-secondary)' },
      eliminated: { bg: '#FEE2E2', color: '#DC2626' },
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
      ? 'border-left:3px solid var(--mg-gold);background:rgba(212,175,55,0.05)'
      : 'border-left:3px solid transparent';

    html += `<tr style="${rowStyle};${ts.status === 'eliminated' ? 'opacity:0.5' : ''}">
      <td style="padding:10px 12px">
        <div style="font-family:'Playfair Display',serif;font-size:14px;line-height:1.2">${TN(team)}</div>
        ${idx === 0 ? '<div style="font-size:9px;font-weight:700;color:var(--mg-gold);text-transform:uppercase;margin-top:1px">Leader</div>' : ''}
      </td>
      <td style="padding:10px 8px;text-align:center;font-family:'Playfair Display',serif;font-size:16px;font-weight:700">
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
    html += `<div class="mg-card" style="margin-top:12px;background:var(--mg-green);color:#fff;overflow:hidden">`;
    html += `<div style="padding:16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--mg-gold)">Scenario Props</div>`;
    data.scenarioProps.forEach(prop => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid rgba(255,255,255,0.1)">
        <div>
          <div style="font-size:13px;font-weight:600">${escHtml(String(prop.description))}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.5)">${escHtml(String(prop.detail))}</div>
        </div>
        <span style="font-family:'Playfair Display',serif;font-size:18px;color:var(--mg-gold)">${prop.odds}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Info cards
  html += `<div class="mg-scenario-info">`;
  html += `<div class="mg-card" style="padding:16px;display:flex;gap:12px;align-items:flex-start;margin-top:12px">
    <div style="font-size:24px;min-width:40px;height:40px;background:var(--mg-bg);border-radius:8px;display:flex;align-items:center;justify-content:center">&#9881;</div>
    <div>
      <div style="font-family:'Playfair Display',serif;font-size:16px;margin-bottom:4px">Elimination Math</div>
      <div style="font-size:12px;color:var(--mg-text-secondary);line-height:1.5">Magic numbers represent points needed to guarantee a spot. Cap rule: max 7 pts per match, 10 total per match.</div>
    </div>
  </div>`;
  html += `<div class="mg-card" style="padding:16px;display:flex;gap:12px;align-items:flex-start;margin-top:8px">
    <div style="font-size:24px;min-width:40px;height:40px;background:var(--mg-bg);border-radius:8px;display:flex;align-items:center;justify-content:center">&#9733;</div>
    <div>
      <div style="font-family:'Playfair Display',serif;font-size:16px;margin-bottom:4px">Win Probability</div>
      <div style="font-size:12px;color:var(--mg-text-secondary);line-height:1.5">${nonFinalMatches.length <= 6 ? 'Exact enumeration' : 'Monte Carlo simulation (10K samples)'} across all remaining match outcomes, weighted by handicap-based moneyline odds.</div>
    </div>
  </div>`;
  html += `</div>`; // info cards

  html += `</div>`; // standings column
  html += `</div>`; // layout

  return html;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/'/g, '&#39;');
}
