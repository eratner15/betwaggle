// Golf Event App Shell — config-driven, multi-tenant
import { morph } from './morph.js';
import { generateMatches, loadConfig } from './data.js';
import { init, save, load, reset, queueMutation, getPendingMutations, clearMutation } from './storage.js';
import { placeBet, settleBets, setOddsOverrides, setLockedMatches, getMatchMoneyline, getLiveMatchMoneyline, setConfig as setBettingConfig } from './betting.js';
import {
  renderDashboard, renderRoundFeed, renderScrambleLeaderboard, renderFlightsList, renderFlight, renderTeam,
  renderAdmin, renderBetting, renderMyBets, renderCalcutta,
  renderShootout, renderScorecard, renderCasualScorecard, renderNamePickerModal,
  renderScoreEntryOverlay, renderSettlement, renderScenarios, calcStandings, initViews,
  getPlayersFromConfig, computeRoundPnL, renderTVLeaderboard
} from './views.js';
import * as Sync from './sync.js';
// Sync exports: initSync, adminAuth, adminLogout, isAdminAuthed, requestMagicLink, verifyMagicLink,
// submitBet, fetchBets, fetchBook, updateBet, pushScores, fetchScores, pushSettings, fetchSettings,
// fetchPlayer, fetchPlayers, addCredits, createPlayer, fetchState, submitHoleScores, fetchGameState,
// submitWolfPick, saveVegasTeams, apiFetch

// Detect event slug and base path from URL
// betwaggle.com/:slug/ — events at root level
function getEventInfo() {
  const path = location.pathname;
  // betwaggle.com/:slug/ pattern (primary)
  const match = path.match(/^\/([a-z0-9_-]+)/);
  if (match && !['app','create','ads','marketing','courses','overview','tour','gtm','api','join','affiliate','health','go','demo'].includes(match[1])) {
    return { slug: match[1], basePath: `/${match[1]}` };
  }
  // Backward compat: /waggle/:slug/ (old URLs)
  const waggleMatch = path.match(/^\/waggle\/([a-z0-9_-]+)/);
  if (waggleMatch) {
    return { slug: waggleMatch[1], basePath: `/${waggleMatch[1]}` };
  }
  return { slug: 'mg', basePath: '/app' };
}

// State
let state;
let serverBets = [];  // Bets from ALL devices (fetched from server)
let syncTimer = null;
// Round mode — true for quick/buddies_trip events (2–8 players, no flights/matches)
let isRoundMode = false;
let isScrambleMode = false;
// TV / Spectator big-screen mode — ?tv=true in URL
const isTVMode = new URLSearchParams(location.search).has('tv');
const app = document.getElementById("app");

// Initialize — async to load config first
async function bootstrap() {
  const { slug, basePath } = getEventInfo();

  // Load event config (teams, flights, pairings, scoring rules)
  let config;
  try {
    config = await loadConfig(slug, basePath);
  } catch (e) {
    app.innerHTML = `<div style="padding:40px;text-align:center;color:#c00">
      <p>Could not load event config for <strong>${slug}</strong>.</p>
      <p style="font-size:13px;color:#999;margin-top:8px">${e.message}</p>
    </div>`;
    return;
  }

  // Wire config into modules
  setBettingConfig(config);
  Sync.initSync(slug, basePath);
  initViews(config);

  // Determine product mode — eventType can be at config.eventType OR config.event.eventType
  const _et = config.event?.eventType || config.eventType || '';
  isRoundMode = ['quick', 'buddies_trip'].includes(_et);
  isScrambleMode = _et === 'scramble';
  console.info('[waggle] slug=%s eventType=%s roundMode=%s scrambleMode=%s tvMode=%s', slug, _et, isRoundMode, isScrambleMode, isTVMode);

  // Apply TV mode styles
  if (isTVMode) {
    document.body.classList.add('tv-mode');
  }

  const matches = generateMatches(config);
  state = await init(matches, slug);
  state._config = config;

  // Detect spectator mode from URL params or hash
  const urlParams = new URLSearchParams(location.search);
  const isSpectator = urlParams.get('spectator') === 'true' || location.hash.includes('spectator') || window.__WAGGLE_SPECTATOR__ === true;

  // Transient UI state (not persisted)
  state._adminFlight = state._adminFlight || (config.flightOrder && config.flightOrder[0]) || '';
  state._adminRound = state._adminRound || 1;
  state._betTab = "matches";
  // #4: Restore bet slip from sessionStorage
  state._betSlip = JSON.parse(sessionStorage.getItem('mg_betslip') || '[]');
  state._adminTab = (isRoundMode || isScrambleMode) ? "scorecard" : "takebet"; // round/scramble mode defaults to score entry
  state._takeBet = {};
  state._allPlayers = [];
  state._adminBookFlight = "";
  state._adminBookRound = 1;
  state._propFlight = null;
  state._serverBets = [];  // all bets from server
  state._playerCredits = null;  // current player's credits (from server)
  // Pre-populate player list from config so name picker works before server sync
  if (config.players?.length > 0 && state._allPlayers.length === 0) {
    state._allPlayers = config.players.map(p => ({ name: p.name, handicap: p.handicapIndex ?? p.handicap ?? 0, handicapIndex: p.handicapIndex ?? p.handicap ?? 0, credits: 0 }));
  }
  state._gameState = null;  // live game state (skins, nassau, wolf, etc.)
  state._holes = {};        // hole-by-hole gross scores
  state._scorecardHole = 1; // currently selected hole in scorecard view
  state._scorecardScores = {}; // pending scores for current hole entry
  state._vegasTeamA = null; // Vegas team A player names (null = use game state)
  state._vegasTeamB = null; // Vegas team B player names
  state._scorecardDay = 1;  // active day tab in scorecard (1-based)
  state._seasonData = null; // season leaderboard data (if event is part of a season)
  state._lastSyncAt = null; // timestamp of last successful syncFromServer
  state._slug = slug;       // event slug (used by round feed flash dedup)

  // Restore identity from localStorage — if previously picked or skipped, never show modal again
  const savedIdentity = localStorage.getItem('waggle_identity_' + slug);
  if (savedIdentity !== null) {
    state.bettorName = savedIdentity || null; // empty string = "Just watching"
    state._showIdentityPicker = false;
  } else {
    state._showIdentityPicker = true;
  }
  state._cashBetModal = null; // cash bet entry modal {desc, amount} or null
  state._scoreModal = null;  // player score entry modal {hole, scores} or null
  state._feed = [];           // activity feed items from server
  state._spectatorMode = isSpectator;  // spectator mode (view-only)
  state._disputes = [];       // open/resolved score disputes
  state._props = [];           // propositions (double-or-nothing, side bets)
  state._trophyMode = window.__WAGGLE_TROPHY_MODE__ === true;  // read-only trophy room for completed events
  state._scrambleScores = {};  // temp storage for scramble hole entry
  state._calcutta = null;       // calcutta auction state (from server)
  state._calcuttaBidder = '';   // bidder name input for calcutta
  // Scenario / What-If state (transient)
  state._scenario = {
    flightId: config.flightOrder?.[0] || null,
    simResults: {},  // { matchId: { scoreA, scoreB } }
  };
  // Collapsible section state (survives re-renders, not persisted)
  state._barOpen = false;
  state._gamesOpen = false;
  state._boardSubTab = isSpectator ? 'board' : null; // mid-round sub-tab: 'score' | 'board' | 'bar' (null = auto; spectators default to board)

  // Restore admin auth from session token
  if (Sync.isAdminAuthed()) {
    state.adminAuthed = true;
  }

  // Buddies trips & scrambles: everyone is commissioner — mark as admin locally
  // Server allows public hole submissions for round-mode/scramble events, so no PIN auth needed.
  // (adminPin is stripped from client config by the server for security)
  if (isRoundMode || isScrambleMode) {
    state.adminAuthed = true;
  }

  // Auto-detect magic link token in URL hash: #admin?token=UUID
  const hashStr = location.hash || '';
  const tokenMatch = hashStr.match(/[?&]token=([a-f0-9-]{36})/i);
  if (tokenMatch && !state.adminAuthed) {
    const magicToken = tokenMatch[1];
    // Remove token from hash to avoid re-triggering
    location.hash = '#admin';
    Sync.verifyMagicLink(magicToken).then(result => {
      if (result.ok) {
        state.adminAuthed = true;
        persist();
        refresh();
        toast('Admin access granted via magic link');
        syncFromServer();
      }
    });
  }

  // Initialize settings if missing
  if (!state.settings) state.settings = {};
  if (!state.settings.oddsOverrides) state.settings.oddsOverrides = {};
  if (!state.settings.lockedMatches) state.settings.lockedMatches = [];

  // Push overrides to betting engine
  setOddsOverrides(state.settings.oddsOverrides);
  setLockedMatches(state.settings.lockedMatches);

  // Route
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#dashboard";
  route();

  // #1: Event delegation for share buttons (avoids XSS from apostrophes in onclick)
  app.addEventListener('click', e => {
    const btn = e.target.closest('.mg-share-btn');
    if (btn) {
      const desc = decodeURIComponent(btn.dataset.desc || '');
      const ml = decodeURIComponent(btn.dataset.ml || '');
      const stake = parseInt(btn.dataset.stake) || 0;
      const toWin = parseInt(btn.dataset.towin) || 0;
      const status = btn.dataset.status || '';
      window.MG.shareBet(desc, ml, stake, toWin, status);
    }
  });

  // Fetch player list for dropdown — only overwrite if server has players (don't clobber config players with empty array)
  Sync.fetchPlayers().then(players => {
    if (players && players.length > 0) { state._allPlayers = players; route(); }
  });

  // Online/offline detection
  window.addEventListener('online', () => {
    toast('Back online — syncing...');
    updateConnectivityIndicator();
    syncFromServer(); // Immediately flush queue
  });
  window.addEventListener('offline', () => {
    toast('Offline — scores saved locally');
    updateConnectivityIndicator();
  });

  // Initial sync — pull scores/bets from server
  syncFromServer();

  // Auto-sync — TV mode syncs every 15s, normal mode every 30s
  const syncInterval = isTVMode ? 15000 : 30000;
  syncTimer = setInterval(syncFromServer, syncInterval);

  // Pause/resume sync when page visibility changes (prevents stacked intervals on iOS Safari)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Page backgrounded — stop syncing to prevent stacked requests
      if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    } else {
      // Page foregrounded — sync immediately then restart interval
      syncFromServer();
      if (!syncTimer) syncTimer = setInterval(syncFromServer, 30000);
      updateConnectivityIndicator();
    }
  });

  // Update connectivity indicator every 5s
  setInterval(updateConnectivityIndicator, 5000);

  // Demo auto-simulation — make demo pages feel alive
  startDemoAutoSimulation(slug);
}

// Pull latest from server (scores, announcements, all bets)
async function syncFromServer() {
  try {
    // Snapshot current holes count for flash detection
    const prevHolesPlayed = Object.keys(state._holes || {}).filter(k => k !== 'timestamp').length;

    const data = await Sync.fetchState();
    if (!data) return;

    // Merge server scores into local matches
    if (data.scores && Object.keys(data.scores).length > 0) {
      for (const [matchId, scoreData] of Object.entries(data.scores)) {
        if (state.matches[matchId]) {
          if (scoreData.scoreA !== undefined) state.matches[matchId].scoreA = scoreData.scoreA;
          if (scoreData.scoreB !== undefined) state.matches[matchId].scoreB = scoreData.scoreB;
          if (scoreData.status) state.matches[matchId].status = scoreData.status;
        }
      }
      settleBets(state);
      persist();
    }

    // Store server bets for admin book view
    if (data.bets) {
      state._serverBets = data.bets;
    }

    // Refresh player credits if logged in
    if (state.bettorName) {
      const player = await Sync.fetchPlayer(state.bettorName);
      if (player && player.credits !== undefined) {
        state._playerCredits = player.credits;
      }
    }

    // Merge server settings (announcements, odds overrides, locked matches)
    if (data.settings) {
      if (data.settings.announcements) {
        state.announcements = data.settings.announcements;
      }
      if (data.settings.oddsOverrides) {
        if (!state.settings) state.settings = {};
        state.settings.oddsOverrides = data.settings.oddsOverrides;
        setOddsOverrides(state.settings.oddsOverrides);
      }
      if (data.settings.lockedMatches) {
        if (!state.settings) state.settings = {};
        state.settings.lockedMatches = data.settings.lockedMatches;
        setLockedMatches(state.settings.lockedMatches);
      }
    }

    // Sync live game state (hole scores + game engines)
    const gs = await Sync.fetchGameState();
    if (gs) {
      state._holes = gs.holes || {};
      state._gameState = gs.gameState || null;
    }

    // Sync activity feed
    const feedItems = await Sync.fetchFeed();
    if (feedItems && feedItems.length > 0) {
      state._feed = feedItems;
    }

    // Sync disputes
    const disputeItems = await Sync.fetchDisputes();
    if (disputeItems) {
      state._disputes = disputeItems;
    }

    // Sync props (propositions / side bets)
    const propsData = await Sync.fetchProps();
    if (propsData) state._props = propsData;

    // Sync Calcutta auction state
    const calcuttaData = await Sync.apiFetch('calcutta');
    if (calcuttaData) state._calcutta = calcuttaData;

    // Sync season data if this event is part of a season
    const seasonId = state._config?.seasonId;
    if (seasonId && !state._seasonData) {
      const sd = await Sync.apiFetch(`season/${seasonId}`);
      if (sd) state._seasonData = sd;
    }

    // Flush pending mutations from offline queue
    await flushMutationQueue();

    // Detect new hole data and trigger flash
    const newHolesPlayed = Object.keys(state._holes || {}).filter(k => k !== 'timestamp').length;
    if (newHolesPlayed > prevHolesPlayed) {
      state._flashPlayers = 'all'; // flash all rows
      if (navigator.vibrate) navigator.vibrate(30);
      // Clear flash after animation completes
      setTimeout(() => { delete state._flashPlayers; }, 1600);
    }

    state._lastSyncAt = Date.now();
    updateConnectivityIndicator();
    route(); // re-render with new data
  } catch (e) {
    // Silent fail — offline is OK
    updateConnectivityIndicator();
  }
}

// Flush pending mutations from the IndexedDB queue
async function flushMutationQueue() {
  try {
    const pending = await getPendingMutations();
    if (pending.length === 0) return;

    let flushed = 0;
    for (const mutation of pending) {
      try {
        let result = null;
        switch (mutation.type) {
          case 'scores':
            result = await Sync.submitHoleScores(mutation.payload.holeNum, mutation.payload.scores, mutation.ts);
            break;
          case 'bet':
            result = await Sync.submitBet(mutation.payload);
            if (result) placeBet(state, mutation.payload);
            break;
          case 'chirp':
            result = await Sync.postChirp(mutation.payload.player, mutation.payload.text, mutation.payload.emoji);
            break;
          case 'settings':
            result = await Sync.pushSettings(mutation.payload);
            break;
          default:
            console.warn('[waggle-offline] Unknown mutation type:', mutation.type);
            result = true; // clear unknown mutations
        }
        if (result) {
          await clearMutation(mutation.id);
          flushed++;
        }
      } catch (e) {
        // If we're offline again, stop trying
        if (e.message === 'offline') break;
        console.warn('[waggle-offline] Mutation flush failed:', e);
      }
    }

    if (flushed > 0) {
      toast(`${flushed} offline change${flushed > 1 ? 's' : ''} synced!`);
      persist();
    }
  } catch (e) {
    console.warn('[waggle-offline] flushMutationQueue error:', e);
  }
  updateConnectivityIndicator();
}

// Connectivity indicator — updates the dot in the header
async function updateConnectivityIndicator() {
  const dot = document.getElementById('waggle-connectivity-dot');
  if (!dot) return;

  const online = Sync.isOnline();
  let pendingCount = 0;
  try { pendingCount = (await getPendingMutations()).length; } catch {}

  if (!online) {
    // Red = offline
    dot.style.background = '#ef4444';
    dot.style.boxShadow = '0 0 6px #ef4444';
    dot.style.animation = 'none';
    dot.title = 'Offline';
  } else if (pendingCount > 0) {
    // Orange = online but has pending mutations
    dot.style.background = '#f59e0b';
    dot.style.boxShadow = '0 0 6px #f59e0b';
    dot.style.animation = 'none';
    dot.title = `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync`;
  } else {
    // Green pulsing = connected and synced
    dot.style.background = '#22c55e';
    dot.style.boxShadow = '0 0 6px #22c55e';
    dot.style.animation = 'waggle-pulse 2s ease-in-out infinite';
    dot.title = 'Connected';
  }
}

// Router
function route() {
  const hash = location.hash.slice(1) || "dashboard";
  const [view, param] = hash.split("/");

  // Spectator mode: redirect restricted views to dashboard, show message for settle
  if (state._spectatorMode) {
    if (view === 'admin' || view === 'bet' || view === 'mybets') {
      location.hash = '#dashboard';
      return;
    }
  }

  // Trophy mode: default to settle view and restrict to results-relevant views only
  if (state._trophyMode) {
    if (view === 'admin' || view === 'bet' || view === 'mybets' || (view === 'dashboard' && !location.hash)) {
      location.hash = '#settle';
      return;
    }
  }

  // TV mode: always render the TV leaderboard, skip all other views
  if (isTVMode) {
    const tvHtml = renderTVLeaderboard(state);
    const wrapper = app.querySelector('.mg-content');
    if (wrapper && !app.querySelector('.mg-skeleton')) {
      morph(wrapper, tvHtml);
    } else {
      app.innerHTML = `<div class="mg-content">${tvHtml}</div>`;
    }
    return;
  }

  let html = "";
  switch (view) {
    case "dashboard":
      // Scramble mode gets dedicated leaderboard; Round mode gets live feed; MG gets tournament dashboard
      html = isScrambleMode ? renderScrambleLeaderboard(state) : isRoundMode ? renderRoundFeed(state) : renderDashboard(state);
      break;
    case "flights":
      html = renderFlightsList(state);
      break;
    case "flight":
      html = renderFlight(state, param);
      break;
    case "team":
      html = renderTeam(state, param);
      break;
    case "admin":
      html = renderAdmin(state);
      break;
    case "bet":
      html = renderBetting(state);
      break;
    case "mybets":
      html = renderMyBets(state);
      break;
    case "calcutta":
      html = renderCalcutta(state);
      break;
    case "shootout":
      html = renderShootout(state);
      break;
    case "scorecard":
      html = isRoundMode ? renderCasualScorecard(state) : renderScorecard(state);
      break;
    case "settle":
      html = renderSettlement(state);
      break;
    case "scenarios":
      html = renderScenarios(state);
      break;
    default:
      html = renderDashboard(state);
  }

  // Overlay name picker for round mode — only shows once, never again after dismissed
  if (isRoundMode && state._showIdentityPicker && !state._spectatorMode && !state._trophyMode) {
    html += renderNamePickerModal(state);
  }
  // Overlay score entry modal if open (persists across tab switches, skip for spectators)
  if (isRoundMode && state._scoreModal && !state._spectatorMode) {
    html += renderScoreEntryOverlay(state);
  }

  // Preserve scroll position across re-renders
  const scrollY = window.scrollY;
  const activeEl = document.activeElement?.id || null;

  // DOM diffing: morph existing content instead of full innerHTML rebuild
  // This preserves scroll position, focus, touch highlights, and animations
  const wrapper = app.querySelector('.mg-content');
  if (wrapper && !app.querySelector('.mg-skeleton')) {
    // Existing content — morph in place (only updates changed nodes)
    morph(wrapper, html);
  } else {
    // First render or skeleton screen — full replace for fast initial paint
    app.innerHTML = `<div class="mg-content">${html}</div>`;
  }
  updateNav(view);

  // Apply flash to player rows if data changed
  if (state._flashPlayers) {
    setTimeout(() => {
      const rows = document.querySelectorAll('[data-player-row]');
      rows.forEach(row => row.classList.add('board-row-flash'));
    }, 50);
  }

  // Restore scroll position (prevents jump-to-top on 30s sync)
  if (scrollY > 0) window.scrollTo(0, scrollY);
  // Restore focus if an input was active
  if (activeEl) { const el = document.getElementById(activeEl); if (el) el.focus(); }

  // Demo exit button
  if (state._slug === 'cabot-citrus-invitational' || state._slug === 'demo') {
    if (!document.getElementById('demo-exit-btn')) {
      const exitBtn = document.createElement('div');
      exitBtn.id = 'demo-exit-btn';
      exitBtn.innerHTML = '<a href="/" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--mg-gold);color:var(--mg-green);border-radius:20px;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 2px 12px rgba(0,0,0,.2)">Exit Demo</a>';
      exitBtn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:200;';
      document.body.appendChild(exitBtn);
    }
  }

  // Auto-dismiss full-screen hole flash overlay — DISABLED (flash overlay removed)
  // const flashOverlay = document.getElementById('hole-flash-overlay');
  // if (flashOverlay) { ... }

  // Update floating score button (FAB)
  const fab = document.getElementById('score-fab');
  const fabText = document.getElementById('score-fab-text');
  if (fab && isRoundMode && !state._trophyMode) {
    const holes = state._holes || {};
    const scoredHoles = Object.keys(holes).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    const holesPerRound = state._config?.holesPerRound || 18;
    const latestHole = scoredHoles.length > 0 ? Math.max(...scoredHoles) : 0;
    const roundComplete = scoredHoles.length >= holesPerRound;
    if (roundComplete) {
      fab.style.display = 'none';
    } else {
      const nextHole = latestHole < holesPerRound ? latestHole + 1 : holesPerRound;
      const pars = state._config?.coursePars || [];
      const par = pars[nextHole - 1] || 4;
      fab.style.display = 'flex';
      fabText.textContent = `Hole ${nextHole} \u00b7 Par ${par}`;
    }
  } else if (fab) {
    fab.style.display = 'none';
  }
}

function updateNav(view) {
  const games = state?._config?.games || {};
  const hasGames = Object.values(games).some(Boolean);

  // Populate header tabs for round/scramble mode
  const headerTabsEl = document.getElementById('mg-header-tabs');
  if (headerTabsEl) {
    if ((isRoundMode || isScrambleMode) && view === 'dashboard') {
      const activeSubTab = state._boardSubTab || 'score';
      const tabs = [
        { key: 'score', label: 'SCORE' },
        { key: 'board', label: 'BOARD' },
        { key: 'bar', label: 'THE BAR' }
      ];
      headerTabsEl.innerHTML = tabs.map(t =>
        `<button class="${activeSubTab === t.key ? 'active' : ''}" onclick="window.MG.setBoardTab('${t.key}')">${t.label}</button>`
      ).join('');
    } else {
      headerTabsEl.innerHTML = '';
    }
  }

  document.querySelectorAll(".mg-nav a").forEach(a => {
    const tab = a.dataset.tab;
    const label = a.querySelector('.nav-label');

    // Spectator mode: hide betting and admin tabs
    if (state._spectatorMode) {
      if (tab === 'bet' || tab === 'mybets' || tab === 'admin') {
        a.style.display = 'none';
      }
    }

    // Trophy mode: hide admin, bet, mybets; show settle; relabel dashboard
    if (state._trophyMode) {
      if (tab === 'admin' || tab === 'bet' || tab === 'mybets') {
        a.style.display = 'none';
      }
      if (tab === 'settle') {
        a.style.display = '';
      }
      if (tab === 'dashboard' && label) {
        label.textContent = 'Results';
      }
    }

    // Active state
    a.classList.toggle("active",
      tab === view ||
      (tab === "dashboard" && (view === "flight" || view === "team")) ||
      (tab === "flights" && view === "flights") ||
      (tab === "scenarios" && view === "scenarios")
    );

    if (isScrambleMode) {
      // Scramble mode: The Board · Settle only (everything else lives on The Board)
      if (tab !== 'dashboard' && tab !== 'settle') {
        a.style.display = 'none';
      } else {
        a.style.display = '';
      }
      if (label) {
        if (tab === 'dashboard') label.textContent = 'The Board';
        if (tab === 'settle') label.textContent = 'Settle';
      }
      if (tab === 'settle') a.style.display = '';
    } else if (isRoundMode) {
      // Round mode: The Board · Settle only (everything else lives on The Board)
      if (tab !== 'dashboard' && tab !== 'settle') {
        a.style.display = 'none';
      } else {
        a.style.display = '';
      }
      if (label) {
        if (tab === 'dashboard') label.textContent = 'The Board';
        if (tab === 'settle') label.textContent = 'Settle';
      }
      // Show settle tab always (it was hidden before)
      if (tab === 'settle') a.style.display = '';
    } else {
      // MG tournament mode: original tab set
      if (tab === "settle") {
        a.style.display = 'none'; // settle is nav-less in MG — accessed via #settle hash
      } else if (tab === "scorecard") {
        a.style.display = hasGames ? '' : 'none';
      } else if (tab === "scenarios") {
        a.style.display = ''; // always show What-If in tournament mode
      } else {
        a.style.display = '';
      }
      // Restore original MG labels
      if (label) {
        if (tab === "dashboard") label.textContent = "The Board";
        if (tab === "admin") label.textContent = "Admin";
      }
    }
  });
}

// Toast
function toast(msg, duration) {
  const el = document.getElementById("mg-toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration || 2500);
}

// Save and re-render — auto-saves to localStorage + shows save indicator
function persist() {
  const toSave = { ...state };
  delete toSave._adminFlight;
  delete toSave._adminRound;
  delete toSave._betTab;
  delete toSave._betSlip;
  delete toSave._adminTab;
  delete toSave._adminBookFlight;
  delete toSave._adminBookRound;
  delete toSave._propFlight;
  delete toSave._serverBets;
  delete toSave._playerCredits;
  delete toSave._gameState;
  delete toSave._holes;
  delete toSave._scorecardHole;
  delete toSave._scorecardScores;
  delete toSave._scrambleScores;
  delete toSave._vegasTeamA;
  delete toSave._vegasTeamB;
  delete toSave._scorecardDay;
  delete toSave._seasonData;
  delete toSave._lastSyncAt;
  delete toSave._slug;
  delete toSave._takeBet;
  delete toSave._allPlayers;
  delete toSave._feed;
  delete toSave._disputes;
  delete toSave._props;
  delete toSave._playerFilter;
  delete toSave._config;
  delete toSave._cashBetModal;
  delete toSave._scoreModal;
  delete toSave._spectatorMode;
  delete toSave._trophyMode;
  delete toSave._calcutta;
  delete toSave._calcuttaBidder;
  delete toSave._scenario;
  delete toSave._expandedPlayer;
  delete toSave._flashPlayers;
  delete toSave._barOpen;
  delete toSave._gamesOpen;
  delete toSave._boardSubTab;
  // _oddsBetSlip removed
  delete toSave._inlineScoreStats;
  save(toSave);

  // Flash save indicator if admin is authed
  if (state.adminAuthed) {
    const ind = document.getElementById('save-indicator');
    if (ind) {
      ind.textContent = 'Saved';
      ind.style.opacity = '1';
      clearTimeout(ind._timer);
      ind._timer = setTimeout(() => { ind.style.opacity = '0'; }, 1500);
    }
  }
}

// Safety net: warn before closing with unsaved state
window.addEventListener('beforeunload', () => { persist(); });

function refresh() {
  route();
}

// Shift a moneyline by an adjustment amount
// American odds skip from -100 to +100 (no values in between)
// We map to a continuous scale, shift, then map back
function shiftML(ml, adj) {
  // To continuous: negative stays as-is, positive gets +200 offset removed
  // -300 → -300, -100 → -100, EVEN(0) → 0, +100 → +100, +300 → +300
  // Actually just shift directly and handle the dead zone
  let result = ml + adj;
  // Clamp: if result is between -99 and +99 (exclusive of 0), snap to nearest valid value
  if (result > -100 && result < 0) result = adj > 0 ? 0 : -100;
  if (result > 0 && result < 100) result = adj > 0 ? 100 : 0;
  return result;
}

// ===== PUBLIC API (window.MG) =====
window.MG = {
  nav(hash) {
    location.hash = hash;
  },

  setBoardTab(tab) {
    state._boardSubTab = tab;
    route();
  },

  toggleSection(section) {
    if (section === 'bar') {
      state._barOpen = !state._barOpen;
    } else if (section === 'games') {
      state._gamesOpen = !state._gamesOpen;
    }
    route();
  },

  togglePlayerExpand(playerName) {
    if (state._expandedPlayer === playerName) {
      state._expandedPlayer = null;
    } else {
      state._expandedPlayer = playerName;
    }
    route();
  },

  // Admin
  async inlineAuth() {
    const input = document.getElementById("inline-pin");
    if (!input) return;
    const pin = input.value;
    if (!pin || pin.length < 4) { toast("Enter your PIN"); input.focus(); return; }
    const ok = await Sync.adminAuth(pin);
    if (ok) {
      state.adminAuthed = true;
      persist();
      if (navigator.vibrate) navigator.vibrate(30);
      toast("Commissioner unlocked");
      route();
    } else {
      toast("Invalid PIN");
      input.value = "";
    }
  },

  async inlineAuthQuick(pin) {
    if (!pin || pin.length < 4) { toast("Enter your PIN"); return; }
    const ok = await Sync.adminAuth(pin);
    if (ok) {
      state.adminAuthed = true;
      persist();
      if (navigator.vibrate) navigator.vibrate(30);
      toast("Commissioner unlocked");
      route();
    } else {
      toast("Invalid PIN");
    }
  },

  async checkPin() {
    const input = document.getElementById("admin-pin");
    if (!input) return;
    const pin = input.value;
    const ok = await Sync.adminAuth(pin);
    if (ok) {
      state.adminAuthed = true;
      persist();
      refresh();
      toast("Admin access granted");
      syncFromServer(); // pull latest on login
      window.MG.loadJoinRequests();
    } else {
      toast("Invalid PIN");
      input.value = "";
    }
  },

  // Magic Link auth
  async requestMagicLink() {
    const input = document.getElementById('magic-contact');
    if (!input) return;
    const contact = input.value.trim();
    if (!contact) { toast('Enter your phone or email'); return; }
    const btn = document.querySelector('#magic-link-section .mg-btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    const result = await Sync.requestMagicLink(contact);
    if (result.ok) {
      const linkSec = document.getElementById('magic-link-section');
      const sentSec = document.getElementById('magic-sent-section');
      if (linkSec) linkSec.style.display = 'none';
      if (sentSec) sentSec.style.display = 'block';
      toast('Login code sent');
    } else {
      toast(result.error || 'Could not send magic link');
      if (btn) { btn.disabled = false; btn.textContent = 'Send Magic Link'; }
    }
  },

  showMagicLinkForm() {
    const linkSec = document.getElementById('magic-link-section');
    const sentSec = document.getElementById('magic-sent-section');
    if (linkSec) linkSec.style.display = 'block';
    if (sentSec) sentSec.style.display = 'none';
  },

  async verifyMagicCode() {
    const input = document.getElementById('magic-code');
    if (!input) return;
    const code = input.value.trim();
    if (!code) { toast('Enter the 6-character code'); return; }
    const result = await Sync.verifyMagicLink(code);
    if (result.ok) {
      state.adminAuthed = true;
      persist();
      refresh();
      toast('Admin access granted');
      syncFromServer();
      window.MG.loadJoinRequests();
    } else {
      toast(result.error || 'Invalid code');
      input.value = '';
    }
  },

  togglePinEntry() {
    const pinSec = document.getElementById('pin-section');
    const btn = document.getElementById('toggle-pin-btn');
    if (!pinSec) return;
    const visible = pinSec.style.display !== 'none';
    pinSec.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? 'Use PIN instead' : 'Hide PIN';
  },

  adminLogout() {
    state.adminAuthed = false;
    Sync.adminLogout();
    persist();
    refresh();
  },

  setAdminFlight(fId) {
    state._adminFlight = fId;
    refresh();
  },

  setAdminRound(r) {
    state._adminRound = r;
    refresh();
  },

  async setAdminTab(tab) {
    state._adminTab = tab;
    if (tab === "book" || tab === "takebet") syncFromServer();
    if (tab === "scorecard") syncFromServer();
    if (tab === "players") {
      const players = await Sync.fetchPlayers();
      if (players) state._allPlayers = players;
    }
    refresh();
  },

  // ─── Scorecard / Live Scoring ───
  setScorecardHole(holeNum) {
    state._scorecardHole = parseInt(holeNum);
    state._scorecardScores = {};
    state._scrambleScores = {};
    // Pre-fill existing scores if already entered
    const existing = state._holes?.[state._scorecardHole];
    if (existing) {
      state._scorecardScores = { ...existing };
      // Also pre-fill scramble scores if in scramble mode
      if (state._config?.games?.scramble) {
        state._scrambleScores = { ...(existing.scores || existing) };
      }
    }
    refresh();
  },

  setScorecardScore(playerName, score) {
    if (!state._scorecardScores) state._scorecardScores = {};
    const val = parseInt(score);
    if (!isNaN(val) && val >= 1 && val <= 15) {
      state._scorecardScores[playerName] = val;
    } else if (score === '' || score === null) {
      delete state._scorecardScores[playerName];
    }
    // Don't re-render — let input stay focused
  },

  async submitHoleScores() {
    const holeNum = state._scorecardHole || 1;
    const scores = state._scorecardScores || {};
    if (Object.keys(scores).length === 0) { toast('Enter at least one score'); return; }
    try {
      const result = await Sync.submitHoleScores(holeNum, scores);
      if (result && result.ok) {
        if (navigator.vibrate) navigator.vibrate(30);
        toast(`Hole ${holeNum} scores saved!`);
        await syncFromServer();
        // Advance to next hole
        if (holeNum < 18) {
          state._scorecardHole = holeNum + 1;
          state._scorecardScores = {};
          const existing = state._holes?.[state._scorecardHole];
          if (existing) state._scorecardScores = { ...existing };
        }
        refresh();
      } else {
        // Server rejected or returned null — queue offline
        throw new Error('submit returned null');
      }
    } catch (e) {
      // Offline or failed — queue mutation and update UI optimistically
      await queueMutation({ type: 'scores', payload: { holeNum, scores: { ...scores } }, ts: Date.now() });
      // Optimistic UI update — write scores into local state
      if (!state._holes) state._holes = {};
      state._holes[holeNum] = { ...scores };
      toast('Saved offline — will sync when connected');
      // Advance to next hole
      if (holeNum < 18) {
        state._scorecardHole = holeNum + 1;
        state._scorecardScores = {};
        const existing = state._holes?.[state._scorecardHole];
        if (existing) state._scorecardScores = { ...existing };
      }
      persist();
      updateConnectivityIndicator();
      refresh();
    }
  },

  // Expose refresh for wolf edit mode button
  refresh() { refresh(); },

  // ─── Scramble Score Entry ───
  setScrambleScore(teamName, score) {
    if (!state._scrambleScores) state._scrambleScores = {};
    state._scrambleScores[teamName] = score;
    refresh();
  },

  async submitScrambleHole(holeNum) {
    const scores = state._scrambleScores;
    if (!scores || Object.keys(scores).length === 0) { toast('Enter scores first'); return; }
    if (navigator.vibrate) navigator.vibrate(30);
    try {
      const result = await Sync.submitHoleScores(holeNum, scores);
      if (result && result.ok) {
        toast('Hole ' + holeNum + ' saved');
        state._scrambleScores = {};
        const maxHole = state._config?.holesPerRound || 18;
        if (holeNum < maxHole) {
          state._scorecardHole = holeNum + 1;
          // Pre-fill existing scores if already entered for next hole
          const existing = state._holes?.[state._scorecardHole];
          if (existing) {
            state._scrambleScores = { ...(existing.scores || existing) };
          }
        }
        await syncFromServer();
        refresh();
      } else {
        throw new Error('submit returned null');
      }
    } catch (e) {
      // Offline — queue mutation and update optimistically
      await queueMutation({ type: 'scores', payload: { holeNum, scores: { ...scores } }, ts: Date.now() });
      if (!state._holes) state._holes = {};
      state._holes[holeNum] = { ...scores };
      toast('Saved offline — will sync when connected');
      state._scrambleScores = {};
      const maxHole = state._config?.holesPerRound || 18;
      if (holeNum < maxHole) {
        state._scorecardHole = holeNum + 1;
      }
      persist();
      updateConnectivityIndicator();
      refresh();
    }
  },

  // ─── Push Notifications ───
  async subscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('Push notifications not supported in this browser');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast('Notification permission denied'); return; }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = await Sync.fetchVapidPublicKey();
      if (!vapidKey) { toast('Notifications not configured for this event'); return; }

      // Convert VAPID public key from base64url to Uint8Array
      const keyBytes = Uint8Array.from(atob(vapidKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes,
      });
      const result = await Sync.subscribePush(sub.toJSON());
      if (result?.ok) {
        localStorage.setItem('waggle_push_subscribed', '1');
        toast('Notifications enabled! You\'ll get updates as holes are scored.');
        refresh();
      } else {
        toast('Failed to save subscription — try again');
      }
    } catch (e) {
      toast('Notification setup failed: ' + e.message);
    }
  },

  // ─── Multi-day scorecard ───
  setScorecardDay(day) {
    state._scorecardDay = parseInt(day) || 1;
    refresh();
  },

  // ─── Onboarding ───
  dismissOnboarding() {
    const eventSlug = state._config?.event?.slug || 'event';
    localStorage.setItem(`waggle_onboarded_${eventSlug}`, '1');
    const overlay = document.getElementById('onboard-overlay');
    if (overlay) overlay.remove();
  },

  // ─── Score Disputes ───
  async resolveDispute(disputeId, resolution) {
    const result = await Sync.resolveDispute(disputeId, resolution);
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate(30);
      toast(resolution === 'accept' ? 'Score corrected' : 'Dispute rejected — keeping original score');
      // Re-sync to get updated state
      syncFromServer();
    } else {
      toast('Failed to resolve dispute');
    }
  },

  async fileDispute(holeNum, player, claimedScore, reason) {
    const result = await Sync.fileDispute(holeNum, player, claimedScore, reason);
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate(30);
      toast('Dispute filed — commissioner will review');
      syncFromServer();
    } else {
      toast('Failed to file dispute');
    }
  },

  getInviteStakeSummary() {
    const config = state._config || {};
    const games = config.games || {};
    const structure = config.structure || {};
    const stakes = [];
    if (games.nassau && structure.nassauBet > 0) stakes.push(`Nassau $${structure.nassauBet}`);
    if (games.skins && structure.skinsBet > 0) stakes.push(`Skins $${structure.skinsBet}`);
    if (games.wolf) stakes.push('Wolf');
    if (games.vegas) stakes.push('Vegas');
    return stakes.length ? stakes.join(' · ') : 'Live scores + instant settle';
  },

  async shareInviteLink(joinUrl) {
    const eventName = (state._config?.event?.name || 'Your event').trim();
    const safeName = eventName.length > 30 ? `${eventName.slice(0, 27)}...` : eventName;
    const url = joinUrl || `${location.origin}/join/${encodeURIComponent(state._slug || '')}`;
    const text = [
      `You're in: ${safeName}`,
      `Stakes: ${window.MG.getInviteStakeSummary()}`,
      'Join in 30 sec. No app needed.',
      url
    ].join('\n');

    if (navigator.share) {
      navigator.share({ title: eventName, text, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => toast('Invite copied!')).catch(() => {});
    }
  },

  async shareReplayInvite() {
    const eventName = state._config?.event?.name || 'this event';
    const slug = state._slug || '';
    const replayUrl = `https://betwaggle.com/create?clone=${encodeURIComponent(slug)}`;
    const text = [
      `Run it back at ${eventName}?`,
      'Same group, same format, new round.',
      'Tap to join the replay:',
      replayUrl
    ].join('\n');

    if (navigator.share) {
      navigator.share({ title: `${eventName} - Replay`, text, url: replayUrl }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => toast('Replay invite copied!')).catch(() => {});
    }
  },

  // ─── Settlement Card ───
  async shareSettlement() {
    if (navigator.vibrate) navigator.vibrate(30);
    const eventName = state._config?.event?.name || 'Golf Event';
    const url = location.href.replace(/#.*$/, '');
    const config = state._config || {};
    const games = config.games || {};
    const structure = config.structure || {};

    // Build share text with standings + payments
    const { computeRoundPnLShare, computePayablePairsShare, getPlayersShare } = (() => {
      // Inline helpers since we can't import from views.js here
      const players = (config.players || config.roster || []).map(p => ({
        name: p.name || p.member, handicapIndex: p.handicapIndex ?? p.handicap ?? 0
      })).filter(p => p.name);
      const pnl = {};
      players.forEach(p => { pnl[p.name] = 0; });
      const gs = state._gameState;
      const skinsBet = parseInt(structure.skinsBet) || 5;
      const nassauBet = parseInt(structure.nassauBet) || 10;
      const n = players.length;
      if (games.skins && gs?.skins?.holes) {
        Object.values(gs.skins.holes).forEach(h => {
          if (h.winner && pnl.hasOwnProperty(h.winner)) {
            const pot = h.potWon || 1;
            pnl[h.winner] += pot * (n - 1) * skinsBet;
            players.forEach(p => { if (p.name !== h.winner) pnl[p.name] -= pot * skinsBet; });
          }
        });
      }
      if (games.nassau && gs?.nassau) {
        const nas = gs.nassau;
        [nas.frontWinner, nas.backWinner, nas.totalWinner].forEach(winner => {
          if (!winner) return;
          players.forEach(p => {
            if (p.name === winner) pnl[p.name] += nassauBet * (n - 1);
            else pnl[p.name] -= nassauBet;
          });
        });
      }
      // Payable pairs
      const creditors = [], debtors = [];
      Object.entries(pnl).forEach(([name, val]) => {
        const r = Math.round(val);
        if (r > 0) creditors.push({ name, amount: r });
        else if (r < 0) debtors.push({ name, amount: -r });
      });
      creditors.sort((a,b) => b.amount - a.amount);
      debtors.sort((a,b) => b.amount - a.amount);
      const txns = [];
      let i = 0, j = 0;
      while (i < creditors.length && j < debtors.length) {
        const pay = Math.min(creditors[i].amount, debtors[j].amount);
        if (pay > 0) txns.push({ from: debtors[j].name, to: creditors[i].name, amount: pay });
        creditors[i].amount -= pay; debtors[j].amount -= pay;
        if (creditors[i].amount <= 0) i++; if (debtors[j].amount <= 0) j++;
      }
      return { computeRoundPnLShare: pnl, computePayablePairsShare: txns, getPlayersShare: players };
    })();

    const pnl = computeRoundPnLShare;
    const pairs = computePayablePairsShare;
    const players = getPlayersShare;
    const sorted = [...players].sort((a,b) => (pnl[b.name]||0) - (pnl[a.name]||0));

    const stakeParts = [];
    if (games.nassau && structure.nassauBet > 0) stakeParts.push(`Nassau $${structure.nassauBet}`);
    if (games.skins && structure.skinsBet > 0) stakeParts.push(`Skins $${structure.skinsBet}`);
    if (games.wolf) stakeParts.push('Wolf');
    if (games.vegas) stakeParts.push('Vegas');

    const gs = state._gameState;
    const holes = state._holes || {};
    const holesPlayed = Object.keys(holes).length;
    const eventDate = config?.event?.dates?.day1 || '';

    // ── Build premium share text ──
    let lines = [];

    // Header block
    lines.push(`\u26F3 ${eventName}`);
    if (eventDate) lines.push(`\u{1F4C5} ${eventDate}`);
    if (stakeParts.length > 0) lines.push(`\u{1F3B0} ${stakeParts.join(' \u00b7 ')}`);
    if (holesPlayed > 0) lines.push(`\u{1F3CC}\u{FE0F} ${holesPlayed} holes played`);
    lines.push('');

    // Standings with medal emojis and bar chart
    if (sorted.length > 0 && Object.values(pnl).some(v => v !== 0)) {
      lines.push('\u{1F3C6} FINAL STANDINGS');
      lines.push('\u2500'.repeat(24));
      const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
      const maxNameLen = Math.max(...sorted.map(p => p.name.length));
      sorted.forEach((p, i) => {
        const money = pnl[p.name] || 0;
        const moneyStr = money === 0 ? '  Even' : money > 0 ? ` +$${money}` : ` -$${Math.abs(money)}`;
        const medal = i < 3 ? medals[i] : '  ';
        const bar = money > 0 ? '\u{1F7E2}'.repeat(Math.min(Math.ceil(money / 10), 5)) : money < 0 ? '\u{1F534}'.repeat(Math.min(Math.ceil(Math.abs(money) / 10), 5)) : '\u26AA';
        const name = p.name.padEnd(maxNameLen);
        lines.push(`${medal} ${name} ${moneyStr}  ${bar}`);
      });
      lines.push('');
    }

    // Skins highlights
    if (games.skins && gs?.skins?.holes) {
      const skinWinners = Object.entries(gs.skins.holes).filter(([, d]) => d.winner);
      if (skinWinners.length > 0) {
        lines.push('\u{1F4B0} SKINS');
        const tally = {};
        skinWinners.forEach(([h, d]) => {
          if (!tally[d.winner]) tally[d.winner] = { holes: [], total: 0 };
          tally[d.winner].holes.push(parseInt(h));
          tally[d.winner].total += (d.potWon || 1);
        });
        Object.entries(tally)
          .sort((a, b) => b[1].total - a[1].total)
          .forEach(([name, data]) => {
            lines.push(`   ${name}: \u00d7${data.total} (H${data.holes.join(', H')})`);
          });
        const carries = Object.entries(gs.skins.holes).filter(([, d]) => d.carried);
        if (carries.length > 0) {
          lines.push(`   Carried: H${carries.map(([h]) => h).join(', H')}`);
        }
        lines.push('');
      }
    }

    // Nassau results
    if (games.nassau && gs?.nassau) {
      const nas = gs.nassau;
      lines.push('\u{1F3CC}\u{FE0F} NASSAU');
      if (nas.frontWinner) lines.push(`   Front 9: ${nas.frontWinner} \u2705`);
      if (nas.backWinner) lines.push(`   Back 9:  ${nas.backWinner} \u2705`);
      if (nas.totalWinner) lines.push(`   Overall: ${nas.totalWinner} \u2705`);
      if (nas.presses?.length > 0) {
        const activePresses = nas.presses.filter(p => p.active || p.winner);
        if (activePresses.length > 0) lines.push(`   Presses: ${activePresses.length}`);
      }
      lines.push('');
    }

    // Wolf results
    if (games.wolf && gs?.wolf?.running) {
      const wolfRunning = gs.wolf.running;
      const wolfPlayers = Object.entries(wolfRunning).sort((a, b) => (b[1] || 0) - (a[1] || 0));
      if (wolfPlayers.length > 0) {
        lines.push('\u{1F43A} WOLF');
        wolfPlayers.forEach(([name, pts]) => {
          lines.push(`   ${name}: ${pts} pts`);
        });
        lines.push('');
      }
    }

    // Payments with Venmo deep links
    if (pairs.length > 0) {
      // Build venmo handle lookup from config
      const venmoHandles = {};
      (config.players || config.roster || []).forEach(p => {
        if (p.venmo) venmoHandles[p.name || p.member] = p.venmo.replace(/^@/, '');
      });

      lines.push('\u{1F4B8} SETTLE UP');
      lines.push('\u2500'.repeat(24));
      const noteText = encodeURIComponent(`${eventName} \u00b7 Waggle`);
      pairs.forEach(({ from, to, amount }) => {
        const toHandle = venmoHandles[to] || to;
        const venmoLink = `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(toHandle)}&amount=${amount}&note=${noteText}`;
        lines.push(`   ${from} \u2192 ${to}:  $${amount}`);
        lines.push(`   Pay now: ${venmoLink}`);
      });
      lines.push('');
    }

    // Try to fetch AI recap snippet for the share text
    try {
      const recapRes = await fetch(`/api/recap?slug=${encodeURIComponent(state._slug)}`);
      const recapData = await recapRes.json();
      if (recapData.ok && recapData.recap) {
        // Take first 1-2 sentences as a snippet
        const snippet = recapData.recap.split('.').slice(0, 2).join('.').trim();
        if (snippet.length > 20) {
          lines.push('\u{1F4DD} RECAP');
          lines.push(`"${snippet}."`);
          lines.push('');
        }
      }
    } catch {} // Non-blocking — share works without recap

    if (state._slug) {
      const replayUrl = `https://betwaggle.com/create?clone=${encodeURIComponent(state._slug)}`;
      lines.push('Round complete. Replay open.');
      lines.push(`Replay: ${replayUrl}`);
      lines.push('');
    }

    // Footer
    lines.push('\u2500'.repeat(24));
    lines.push(`Powered by Waggle \u26F3`);
    lines.push(`https://betwaggle.com`);

    const text = lines.join('\n');

    if (navigator.share) {
      navigator.share({
        title: `${eventName} \u2014 Settlement`,
        text: text,
        url: 'https://betwaggle.com'
      }).catch(() => {
        navigator.clipboard?.writeText(text).then(() => toast('Results copied!')).catch(() => {});
      });
    } else {
      navigator.clipboard?.writeText(text).then(() => toast('Results copied to clipboard!')).catch(() => {});
    }
  },

  // ─── Export Settlement Card as Image ───
  exportSettlementCard() {
    if (navigator.vibrate) navigator.vibrate(30);
    const config = state._config || {};
    const games = config.games || {};
    const structure = config.structure || {};
    const gs = state._gameState;

    // --- Compute P&L (same logic as shareSettlement) ---
    const players = (config.players || config.roster || []).map(p => ({
      name: p.name || p.member, handicapIndex: p.handicapIndex ?? p.handicap ?? 0
    })).filter(p => p.name);
    const pnl = {};
    players.forEach(p => { pnl[p.name] = 0; });
    const n = players.length;
    const skinsBet = parseInt(structure.skinsBet) || 5;
    const nassauBet = parseInt(structure.nassauBet) || 10;

    if (games.skins && gs?.skins?.holes) {
      Object.values(gs.skins.holes).forEach(h => {
        if (h.winner && pnl.hasOwnProperty(h.winner)) {
          const pot = h.potWon || 1;
          pnl[h.winner] += pot * (n - 1) * skinsBet;
          players.forEach(p => { if (p.name !== h.winner) pnl[p.name] -= pot * skinsBet; });
        }
      });
    }
    if (games.nassau && gs?.nassau) {
      const nas = gs.nassau;
      [nas.frontWinner, nas.backWinner, nas.totalWinner].forEach(winner => {
        if (!winner) return;
        players.forEach(p => {
          if (p.name === winner) pnl[p.name] += nassauBet * (n - 1);
          else pnl[p.name] -= nassauBet;
        });
      });
    }

    // Payment pairs
    const creditors = [], debtors = [];
    Object.entries(pnl).forEach(([name, val]) => {
      const r = Math.round(val);
      if (r > 0) creditors.push({ name, amount: r });
      else if (r < 0) debtors.push({ name, amount: -r });
    });
    creditors.sort((a,b) => b.amount - a.amount);
    debtors.sort((a,b) => b.amount - a.amount);
    const payPairs = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const pay = Math.min(creditors[ci].amount, debtors[di].amount);
      if (pay > 0) payPairs.push({ from: debtors[di].name, to: creditors[ci].name, amount: pay });
      creditors[ci].amount -= pay; debtors[di].amount -= pay;
      if (creditors[ci].amount <= 0) ci++; if (debtors[di].amount <= 0) di++;
    }

    const sortedPlayers = [...players].sort((a,b) => (pnl[b.name]||0) - (pnl[a.name]||0));
    const hasPnL = Object.values(pnl).some(v => v !== 0);
    const eventName = config?.event?.name || 'Golf Event';
    const eventDate = config?.event?.dates?.day1 || '';
    const holesPlayed = Object.keys(state._holes || {}).length;

    // --- Skins summary ---
    const skinsSummary = [];
    if (games.skins && gs?.skins?.holes) {
      const tally = {};
      Object.entries(gs.skins.holes).filter(([,d]) => d.winner).forEach(([h, d]) => {
        if (!tally[d.winner]) tally[d.winner] = { holes: [], total: 0 };
        tally[d.winner].holes.push(parseInt(h));
        tally[d.winner].total += (d.potWon || 1);
      });
      Object.entries(tally).sort((a,b) => b[1].total - a[1].total).forEach(([name, data]) => {
        skinsSummary.push({ name, holes: data.holes, count: data.total });
      });
    }

    // --- Nassau summary ---
    const nassauSummary = [];
    if (games.nassau && gs?.nassau?.running) {
      const r = gs.nassau.running;
      Object.keys(r).sort((a,b) => (r[a].total||0) - (r[b].total||0)).forEach(name => {
        const s = r[name];
        nassauSummary.push({ name, front: s.front ?? '-', back: s.back ?? '-', total: s.total ?? '-' });
      });
    }

    // --- Stakes line ---
    const stakeParts = [];
    if (games.nassau && structure.nassauBet > 0) stakeParts.push(`Nassau $${structure.nassauBet}`);
    if (games.skins && structure.skinsBet > 0) stakeParts.push(`Skins $${structure.skinsBet}`);
    if (games.wolf) stakeParts.push('Wolf');

    // --- Canvas Drawing ---
    const DPR = 2;
    const W = 600;
    const PAD = 28;
    const CONTENT_W = W - PAD * 2;

    // Pre-calculate height
    let totalH = 0;
    totalH += 120; // header
    totalH += 20;  // spacing
    if (hasPnL) {
      totalH += 44 + sortedPlayers.length * 48 + 20; // standings card
      if (payPairs.length > 0) totalH += 44 + payPairs.length * 56 + 20; // pay pairs card
    }
    if (skinsSummary.length > 0) totalH += 44 + skinsSummary.length * 40 + 20; // skins card
    if (nassauSummary.length > 0) totalH += 44 + nassauSummary.length * 36 + 28 + 20; // nassau card
    totalH += 80; // footer
    totalH = Math.max(totalH, 400);

    const canvas = document.createElement('canvas');
    canvas.width = W * DPR;
    canvas.height = totalH * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    // --- Helper functions ---
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function drawCard(y, h, opts = {}) {
      const x = PAD - 8;
      const w = CONTENT_W + 16;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      roundRect(x, y, w, h, 10);
      ctx.fillStyle = opts.bg || '#FFFFFF';
      ctx.fill();
      if (opts.border) {
        ctx.strokeStyle = opts.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      return { x: x + 12, y: y + 14, w: w - 24 };
    }

    function drawCardHeader(inner, text) {
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#8B8680';
      ctx.letterSpacing = '1.5px';
      ctx.fillText(text.toUpperCase(), inner.x, inner.y + 4);
      ctx.letterSpacing = '0px';
    }

    // --- Background ---
    roundRect(0, 0, W, totalH, 16);
    ctx.fillStyle = '#F5F0E8';
    ctx.fill();

    // --- Subtle watermark "W" ---
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.font = 'bold 320px Georgia, serif';
    ctx.fillStyle = '#1A472A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('W', W / 2, totalH / 2);
    ctx.restore();

    // --- Header ---
    roundRect(0, 0, W, 110, 16);
    // Clip bottom corners to be square for seamless look
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arcTo(W, 0, W, 16, 16);
    ctx.lineTo(W, 0);
    ctx.arcTo(W, 0, W, 16, 16);
    ctx.lineTo(W, 110);
    ctx.lineTo(0, 110);
    ctx.lineTo(0, 16);
    ctx.arcTo(0, 0, 16, 0, 16);
    ctx.closePath();
    // Dark green gradient header
    const hGrad = ctx.createLinearGradient(0, 0, W, 0);
    hGrad.addColorStop(0, '#1A472A');
    hGrad.addColorStop(1, '#245C38');
    ctx.fillStyle = hGrad;
    ctx.fill();
    ctx.restore();

    // Header decorative line
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(PAD, 100, CONTENT_W, 2);

    // Event date
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(eventDate, W / 2, 18);

    // Event name
    ctx.font = '700 24px Georgia, serif';
    ctx.fillStyle = '#D4AF37';
    ctx.fillText(eventName, W / 2, 38);

    // Stakes + holes
    const subParts = [];
    if (stakeParts.length) subParts.push(stakeParts.join(' · '));
    subParts.push(`${holesPlayed} hole${holesPlayed !== 1 ? 's' : ''} played`);
    ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(subParts.join('  |  '), W / 2, 72);

    ctx.textAlign = 'left';
    let curY = 130;

    // --- Final Standings ---
    if (hasPnL) {
      const cardH = 36 + sortedPlayers.length * 48;
      const inner = drawCard(curY, cardH);
      drawCardHeader(inner, 'FINAL STANDINGS');

      sortedPlayers.forEach((p, i) => {
        const rowY = inner.y + 24 + i * 48;
        const money = pnl[p.name] || 0;
        const moneyStr = money === 0 ? 'Even' : money > 0 ? `+$${money}` : `-$${Math.abs(money)}`;
        const moneyColor = money > 0 ? '#16A34A' : money < 0 ? '#DC2626' : '#8B8680';

        // Rank badge
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = i === 0 ? '#D4AF37' : '#8B8680';
        ctx.fillText(`${i + 1}`, inner.x, rowY + 6);

        // Name
        ctx.font = `${i === 0 ? '700' : '500'} 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = '#1C1917';
        ctx.fillText(p.name, inner.x + 22, rowY + 6);

        // P&L - right aligned
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = moneyColor;
        ctx.textAlign = 'right';
        ctx.fillText(moneyStr, inner.x + inner.w, rowY + 8);
        ctx.textAlign = 'left';

        // Divider
        if (i < sortedPlayers.length - 1) {
          ctx.strokeStyle = '#E8E2D8';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(inner.x, rowY + 36);
          ctx.lineTo(inner.x + inner.w, rowY + 36);
          ctx.stroke();
        }
      });
      curY += cardH + 16;

      // --- Who Pays Who ---
      if (payPairs.length > 0) {
        const ppH = 36 + payPairs.length * 56;
        const ppInner = drawCard(curY, ppH, { border: '#D4AF37' });
        drawCardHeader(ppInner, 'WHO PAYS WHO');

        payPairs.forEach(({ from, to, amount }, i) => {
          const rowY = ppInner.y + 24 + i * 56;

          // "From pays To"
          ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#DC2626';
          ctx.fillText(from, ppInner.x, rowY + 4);
          ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#8B8680';
          const fromWidth = ctx.measureText(from).width;
          // Re-measure with bold font
          ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          const fW = ctx.measureText(from).width;
          ctx.font = '400 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#8B8680';
          ctx.fillText(' pays ', ppInner.x + fW, rowY + 4);
          const paysW = ctx.measureText(' pays ').width;
          ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#16A34A';
          ctx.fillText(to, ppInner.x + fW + paysW, rowY + 4);

          // Amount - right aligned, big
          ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#1C1917';
          ctx.textAlign = 'right';
          ctx.fillText(`$${amount}`, ppInner.x + ppInner.w, rowY + 8);
          ctx.textAlign = 'left';

          // Divider
          if (i < payPairs.length - 1) {
            ctx.strokeStyle = '#E8E2D8';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(ppInner.x, rowY + 44);
            ctx.lineTo(ppInner.x + ppInner.w, rowY + 44);
            ctx.stroke();
          }
        });
        curY += ppH + 16;
      }
    }

    // --- Skins Summary ---
    if (skinsSummary.length > 0) {
      const skH = 36 + skinsSummary.length * 40;
      const skInner = drawCard(curY, skH);
      drawCardHeader(skInner, 'SKINS');

      skinsSummary.forEach(({ name, holes, count }, i) => {
        const rowY = skInner.y + 24 + i * 40;
        ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#1C1917';
        ctx.fillText(name, skInner.x, rowY + 4);
        ctx.font = '400 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#8B8680';
        ctx.fillText(`H${holes.join(', H')}`, skInner.x, rowY + 22);
        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#D4AF37';
        ctx.textAlign = 'right';
        ctx.fillText(`x${count}`, skInner.x + skInner.w, rowY + 8);
        ctx.textAlign = 'left';

        if (i < skinsSummary.length - 1) {
          ctx.strokeStyle = '#E8E2D8';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(skInner.x, rowY + 32);
          ctx.lineTo(skInner.x + skInner.w, rowY + 32);
          ctx.stroke();
        }
      });
      curY += skH + 16;
    }

    // --- Nassau Summary ---
    if (nassauSummary.length > 0) {
      const nsH = 36 + 24 + nassauSummary.length * 36;
      const nsInner = drawCard(curY, nsH);
      drawCardHeader(nsInner, 'NASSAU');

      // Column headers
      const colX = [nsInner.x, nsInner.x + nsInner.w * 0.55, nsInner.x + nsInner.w * 0.72, nsInner.x + nsInner.w * 0.88];
      const headY = nsInner.y + 24;
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#8B8680';
      ctx.fillText('Player', colX[0], headY);
      ctx.textAlign = 'right';
      ctx.fillText('Front', colX[1] + 30, headY);
      ctx.fillText('Back', colX[2] + 30, headY);
      ctx.fillText('Total', colX[3] + 30, headY);
      ctx.textAlign = 'left';

      nassauSummary.forEach(({ name, front, back, total }, i) => {
        const rowY = headY + 20 + i * 36;
        const isLeader = i === 0;
        ctx.font = `${isLeader ? '700' : '400'} 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = '#1C1917';
        ctx.fillText(name, colX[0], rowY);
        ctx.textAlign = 'right';
        ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = isLeader ? '#16A34A' : '#1C1917';
        ctx.fillText(`${front}`, colX[1] + 30, rowY);
        ctx.fillText(`${back}`, colX[2] + 30, rowY);
        ctx.font = `bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillText(`${total}`, colX[3] + 30, rowY);
        ctx.textAlign = 'left';

        if (i < nassauSummary.length - 1) {
          ctx.strokeStyle = '#E8E2D8';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(nsInner.x, rowY + 20);
          ctx.lineTo(nsInner.x + nsInner.w, rowY + 20);
          ctx.stroke();
        }
      });
      curY += nsH + 16;
    }

    // --- Footer ---
    const footY = curY + 10;

    // Divider line
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.3, footY);
    ctx.lineTo(W * 0.7, footY);
    ctx.stroke();

    // "Powered by Waggle" text
    ctx.textAlign = 'center';
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#8B8680';
    ctx.fillText('Powered by', W / 2, footY + 18);

    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillStyle = '#1A472A';
    ctx.fillText('Waggle', W / 2, footY + 40);

    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#D4AF37';
    ctx.fillText('betwaggle.com', W / 2, footY + 58);

    ctx.textAlign = 'left';

    // --- Export ---
    canvas.toBlob(async (blob) => {
      if (!blob) { toast('Export failed'); return; }
      const file = new File([blob], 'waggle-settlement.png', { type: 'image/png' });

      // Try native share (mobile) — include image + text + URL
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          const eventName = state._config?.event?.name || 'Golf Event';
          const shareUrl = 'https://betwaggle.com';
          await navigator.share({
            files: [file],
            title: eventName + ' \u2014 Settlement',
            text: eventName + ' \u2014 Final standings and settlement. Powered by Waggle.',
            url: shareUrl
          });
          return;
        } catch (e) {
          // User cancelled or share failed, fall through to download
          if (e.name === 'AbortError') return;
        }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'waggle-settlement.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Settlement card saved!');
    }, 'image/png');
  },

  // ─── AI Round Recap ───
  async getRecap() {
    const slug = state._slug;
    if (!slug) return;
    const card = document.getElementById('mg-recap-card');
    if (!card) return;
    card.style.display = 'block';
    card.innerHTML = `<div class="mg-card" style="padding:16px;text-align:center">
      <div style="font-size:12px;color:var(--mg-text-muted)">Generating AI recap...</div>
    </div>`;
    try {
      const res = await fetch(`/api/recap?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (data.ok && data.recap) {
        card.innerHTML = `<div class="mg-card" style="padding:16px;border:1px solid var(--mg-gold-dim)">
          <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--mg-text-muted);margin-bottom:10px">AI ROUND RECAP</div>
          <div style="font-size:14px;color:var(--mg-text);line-height:1.7;white-space:pre-wrap">${data.recap}</div>
          <button onclick="navigator.share?navigator.share({title:'${(state._config?.event?.name||'Round Recap').replace(/'/g,"\\'")}',text:document.getElementById('mg-recap-card').querySelector('div:last-child').textContent}):navigator.clipboard?.writeText(document.getElementById('mg-recap-card').querySelector('div:last-child').textContent).then(()=>window.MG&&window.MG.toast&&window.MG.toast('Copied!'))"
            style="margin-top:12px;width:100%;padding:10px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;font-size:13px;font-weight:600;color:var(--mg-text);cursor:pointer">Share Recap</button>
        </div>`;
      } else {
        card.innerHTML = `<div class="mg-card" style="padding:12px;text-align:center"><div style="font-size:13px;color:var(--mg-text-muted)">Could not generate recap — play a few holes first.</div></div>`;
      }
    } catch {
      card.innerHTML = `<div class="mg-card" style="padding:12px;text-align:center"><div style="font-size:13px;color:var(--mg-text-muted)">Network error — try again.</div></div>`;
    }
  },

  // ─── Vegas Teams ───
  vegasMovePlayer(name, toTeam) {
    // Initialize from game state if not yet set
    if (!state._vegasTeamA) {
      const gs = state._gameState;
      const allPlayers = Object.values(state._config?.teams || {})
        .sort((a,b)=>(a.id||0)-(b.id||0))
        .flatMap(t => [t.member, (t.guest && t.guest !== t.member && t.guest !== '—') ? t.guest : null].filter(Boolean));
      state._vegasTeamA = gs?.vegas?.teamA || allPlayers.slice(0, Math.ceil(allPlayers.length / 2));
      state._vegasTeamB = gs?.vegas?.teamB || allPlayers.slice(Math.ceil(allPlayers.length / 2));
    }
    // Remove from both, add to target
    state._vegasTeamA = (state._vegasTeamA || []).filter(n => n !== name);
    state._vegasTeamB = (state._vegasTeamB || []).filter(n => n !== name);
    if (toTeam === 'A') state._vegasTeamA.push(name);
    else state._vegasTeamB.push(name);
    refresh();
  },

  async autoPress(playerName) {
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

    const config = state._config;
    const nassauBet = parseInt(config?.structure?.nassauBet) || 10;

    // Auto-press: just record it, no acceptance needed
    try {
      const result = await Sync.apiFetch('event/press', 'POST', {
        player: playerName,
        hole: state._inlineScore?.hole || 1,
        bet: nassauBet
      });

      if (result?.ok) {
        window.MG.toast(`${playerName.split(' ')[0]} pressed! Stakes doubled.`);
        await syncFromServer();
      } else {
        window.MG.toast('Press failed');
      }
    } catch(e) {
      window.MG.toast('Press failed');
    }
    route();
  },

  async quickSideBet(type, hole, player, amount) {
    if (navigator.vibrate) navigator.vibrate(30);

    const descriptions = {
      birdie_streak: `${player.split(' ')[0]} birdies #${hole} — back-to-back`,
      par3_green: `Green hit on par 3 #${hole}`,
      skin_streak: `${player.split(' ')[0]} wins skin on #${hole}`,
    };

    try {
      await Sync.createProp({
        type: 'side_bet',
        description: descriptions[type] || `Side bet: ${type} on #${hole}`,
        amount,
        creator: state.bettorName || 'Anonymous',
        parties: player ? [player] : [],
        roundNumber: state._config?.event?.currentRound || 1,
        settlementHole: hole,
        betType: type
      });
      window.MG.toast(`Side bet posted: $${amount}`);
      await syncFromServer();
    } catch(e) {
      window.MG.toast('Failed');
    }
    route();
  },

  async saveVegasTeams() {
    const teamA = state._vegasTeamA || [];
    const teamB = state._vegasTeamB || [];
    if (teamA.length === 0 && teamB.length === 0) { toast('No teams to save'); return; }
    const result = await Sync.saveVegasTeams(teamA, teamB);
    if (result?.ok) {
      toast('Vegas teams saved!');
      await syncFromServer();
      refresh();
    } else {
      toast('Failed to save teams');
    }
  },

  async setWolfPick(holeNum, wolf, partner) {
    const result = await Sync.submitWolfPick(holeNum, wolf, partner || null);
    if (result) {
      toast(`Wolf pick saved: ${wolf}${partner ? ' + ' + partner : ' (lone wolf)'}`);
      await syncFromServer();
      refresh();
    } else {
      toast('Wolf pick failed');
    }
  },

  setAdminBookFlight(fId) {
    state._adminBookFlight = fId;
    refresh();
  },

  setAdminBookRound(r) {
    state._adminBookRound = r;
    refresh();
  },

  // ─── Take Bet flow (Problem 2) ───
  tbSetName(val) {
    if (!state._takeBet) state._takeBet = {};
    state._takeBet.name = val;
    state._takeBet.nameConfirmed = false;
    refresh();
  },
  tbPickName(name) {
    if (!state._takeBet) state._takeBet = {};
    state._takeBet.name = name;
    state._takeBet.nameConfirmed = true;
    refresh();
  },
  tbPickMatch(matchId, selection, americanOdds, decimalOdds, teamName) {
    if (!state._takeBet) state._takeBet = {};
    state._takeBet.matchId = matchId;
    state._takeBet.selection = selection;
    state._takeBet.americanOdds = americanOdds;
    state._takeBet.decimalOdds = decimalOdds;
    state._takeBet.teamName = teamName;
    state._takeBet.stake = 0;
    refresh();
  },
  tbClearMatch() {
    if (!state._takeBet) state._takeBet = {};
    state._takeBet.matchId = null;
    state._takeBet.selection = null;
    state._takeBet.stake = 0;
    refresh();
  },
  tbSetStake(amount) {
    if (!state._takeBet) state._takeBet = {};
    state._takeBet.stake = amount;
    // Update input if it exists
    const inp = document.getElementById('tb-stake');
    if (inp && parseInt(inp.value) !== amount) inp.value = amount || '';
    refresh();
  },
  async tbPlaceBet() {
    const tb = state._takeBet;
    if (!tb || !tb.name || !tb.matchId || !tb.stake || tb.stake <= 0) return;

    const m = state.matches[tb.matchId];
    if (!m) return;

    const isFlightKey = state._config.flightOrder.includes(tb.matchId);
    const selTeam = state._config.teams[tb.selection];
    const oppId = tb.selection == m.teamA ? m.teamB : m.teamA;
    const oppTeam = state._config.teams[oppId];
    const description = selTeam && oppTeam
      ? `${selTeam.member.split(" ").pop()}/${selTeam.guest.split(" ").pop()} to beat ${oppTeam.member.split(" ").pop()}/${oppTeam.guest.split(" ").pop()}`
      : `Team ${tb.selection}`;

    const betData = {
      bettor: tb.name.trim(),
      type: 'match_winner',
      selection: typeof tb.selection === "string" && !isNaN(tb.selection) ? parseInt(tb.selection) : tb.selection,
      matchId: tb.matchId,
      flightId: null,
      stake: tb.stake,
      odds: tb.decimalOdds,
      americanOdds: tb.americanOdds,
      description,
    };

    // Bet confirmation ceremony
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const result = await Sync.submitBet(betData);
    if (result) {
      state.bets.push(result);

      // Gold pulse animation on place bet button
      const betButton = document.querySelector('[onclick="window.MG.tbPlaceBet()"]');
      if (betButton) {
        betButton.classList.add('bet-placed');
        setTimeout(() => betButton.classList.remove('bet-placed'), 600);
      }

      // Ticket stamp animation
      showTicketStampAnimation(tb.stake);

      // Update running bet tally
      incrementBetTally(tb.stake);

      persist();
      toast(`$${tb.stake} on ${tb.teamName} for ${tb.name} — placed!`);

      // Reset match+stake but keep name
      state._takeBet = { name: tb.name, nameConfirmed: true };
      await syncFromServer();
      refresh();
    } else {
      toast("Bet failed — try again");
    }
  },

  // ─── One-tap score + finalize (Problem 1) ───
  setScoreFinal(matchId, scoreA, scoreB) {
    const m = state.matches[matchId];
    if (!m) return;

    // Toggle off if same score tapped again (revert)
    if (m.scoreA === scoreA && m.scoreB === scoreB && m.status === 'final') {
      // Fix D: Check if this match has settled bets — require confirmation to revert
      const settledBets = (state._serverBets || state.bets || []).filter(
        b => b.matchId === matchId && (b.status === 'won' || b.status === 'lost' || b.status === 'push')
      );
      if (settledBets.length > 0) {
        if (!confirm(`This match has ${settledBets.length} settled bet(s). Reverting will unsettle them. Continue?`)) {
          return;
        }
        // Log the revert as an announcement for paper trail
        if (!state.announcements) state.announcements = [];
        state.announcements.push(`[REVERT] Match ${matchId} reverted by admin at ${new Date().toLocaleTimeString()} — ${settledBets.length} bet(s) unsettled`);
        Sync.pushSettings({ announcements: state.announcements });
      }
      m.scoreA = null;
      m.scoreB = null;
      m.status = "scheduled";
    } else {
      m.scoreA = scoreA;
      m.scoreB = scoreB;
      m.status = "final";
    }

    settleBets(state);
    persist();
    refresh();

    // Push to server (triggers server-side settlement too)
    const scoreUpdate = {};
    scoreUpdate[matchId] = { scoreA: m.scoreA, scoreB: m.scoreB, status: m.status, teamA: m.teamA, teamB: m.teamB };
    Sync.pushScores(scoreUpdate);
  },

  // ─── Settle Round (Problem 7) ───
  async settleRound(round) {
    const roundMatches = Object.values(state.matches).filter(m => m.round === round);
    const unfinished = roundMatches.filter(m => m.status !== 'final');

    if (unfinished.some(m => m.scoreA === null || m.scoreA === undefined)) {
      toast("Enter scores for all matches first");
      return;
    }

    // Finalize all unfinished matches
    const scoreUpdate = {};
    unfinished.forEach(m => {
      m.status = "final";
      scoreUpdate[m.id] = { scoreA: m.scoreA, scoreB: m.scoreB, status: 'final', teamA: m.teamA, teamB: m.teamB };
    });

    settleBets(state);
    persist();

    // Push all scores in one batch (triggers server-side settlement)
    if (Object.keys(scoreUpdate).length > 0) {
      await Sync.pushScores(scoreUpdate);
    }

    await syncFromServer();
    refresh();
    toast(`Round ${round} settled — ${roundMatches.length} matches final`);
  },

  moveLine(matchId, teamSide, adjustment) {
    if (!state.settings) state.settings = {};
    if (!state.settings.oddsOverrides) state.settings.oddsOverrides = {};

    const match = state.matches[matchId];
    if (!match) return;

    // Get current odds (may already be overridden)
    const current = getMatchMoneyline(match.teamA, match.teamB, matchId);
    let newMlA = current.mlA;
    let newMlB = current.mlB;

    // Adjustment: positive adjustment makes that side's line move toward underdog (higher number)
    // Moving A's line up by +25 means A becomes more of an underdog
    if (teamSide === 'A') {
      newMlA = shiftML(newMlA, adjustment);
      newMlB = shiftML(newMlB, -adjustment);
    } else {
      newMlB = shiftML(newMlB, adjustment);
      newMlA = shiftML(newMlA, -adjustment);
    }

    state.settings.oddsOverrides[matchId] = { mlA: newMlA, mlB: newMlB };
    setOddsOverrides(state.settings.oddsOverrides);
    persist();
    refresh();
    Sync.pushSettings({ oddsOverrides: state.settings.oddsOverrides });
  },

  resetLine(matchId) {
    if (!state.settings || !state.settings.oddsOverrides) return;
    delete state.settings.oddsOverrides[matchId];
    setOddsOverrides(state.settings.oddsOverrides);
    persist();
    refresh();
    Sync.pushSettings({ oddsOverrides: state.settings.oddsOverrides });
  },

  lockMatch(matchId) {
    if (!state.settings) state.settings = {};
    if (!state.settings.lockedMatches) state.settings.lockedMatches = [];

    const idx = state.settings.lockedMatches.indexOf(matchId);
    if (idx >= 0) {
      state.settings.lockedMatches.splice(idx, 1);
    } else {
      state.settings.lockedMatches.push(matchId);
    }
    setLockedMatches(state.settings.lockedMatches);
    persist();
    refresh();
    Sync.pushSettings({ lockedMatches: state.settings.lockedMatches });
  },

  setScore(matchId, scoreA, scoreB) {
    const m = state.matches[matchId];
    if (!m) return;

    if (m.scoreA === scoreA && m.scoreB === scoreB) {
      m.scoreA = null;
      m.scoreB = null;
      m.status = "scheduled";
    } else {
      m.scoreA = scoreA;
      m.scoreB = scoreB;
      if (m.status === "scheduled") m.status = "final";
    }

    settleBets(state);
    persist();
    refresh();

    // Push scores to server so all devices get them
    const scoreUpdate = {};
    scoreUpdate[matchId] = { scoreA: m.scoreA, scoreB: m.scoreB, status: m.status, teamA: m.teamA, teamB: m.teamB };
    Sync.pushScores(scoreUpdate);
  },

  toggleStatus(matchId, newStatus) {
    const m = state.matches[matchId];
    if (!m) return;

    if (m.status === newStatus) {
      m.status = "scheduled";
    } else {
      m.status = newStatus;
      if (newStatus === "final" && m.scoreA === null) {
        toast("Enter a score first");
        return;
      }
    }

    if (newStatus === "final") {
      settleBets(state);
    }

    persist();
    refresh();
    toast(newStatus === "live" ? "Match is LIVE" : newStatus === "final" ? "Match finalized" : "Status reset");

    // Push to server
    const scoreUpdate = {};
    scoreUpdate[matchId] = { scoreA: m.scoreA, scoreB: m.scoreB, status: m.status, teamA: m.teamA, teamB: m.teamB };
    Sync.pushScores(scoreUpdate);
  },

  postAnnouncement() {
    const input = document.getElementById("announcement-input");
    if (!input || !input.value.trim()) return;
    state.announcements.push(input.value.trim());
    persist();
    refresh();
    toast("Announcement posted");
    // Push to server
    Sync.pushSettings({ announcements: state.announcements });
  },

  exportData() {
    // Export includes server bets
    const exportObj = { ...state, serverBets: state._serverBets };
    delete exportObj._adminFlight;
    delete exportObj._adminRound;
    delete exportObj._betTab;
    delete exportObj._betSlip;
    delete exportObj._adminTab;
    delete exportObj._adminBookRound;
    delete exportObj._playerCredits;
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mg-2026-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Data exported");
  },

  async resetData() {
    if (!confirm("Reset ALL tournament data? This cannot be undone.")) return;
    const savedConfig = state._config;
    const matches = generateMatches(savedConfig);
    state = await reset(matches, getEventInfo().slug);
    state._config = savedConfig;
    state._adminFlight = state._config.flightOrder[0];
    state._adminRound = 1;
    state._betTab = "matches";
    state._betSlip = [];
    state._adminTab = "takebet";
    state._takeBet = {};
    state._allPlayers = [];
    state._adminBookRound = 1;
    state._propFlight = null;
    state._serverBets = [];
    state.adminAuthed = true;
    refresh();
    toast("All data reset");
  },

  // Bettor name — select from player list or type
  async setBettorName(name) {
    // Accept name param (from dropdown) or read from input
    if (!name) {
      const input = document.getElementById("bettor-name-input");
      if (!input || !input.value.trim()) return;
      name = input.value.trim();
    }
    state.bettorName = name;
    persist();
    // Fetch player credits from server
    const player = await Sync.fetchPlayer(state.bettorName);
    if (player && player.credits !== undefined) {
      state._playerCredits = player.credits;
      toast(`Welcome, ${state.bettorName}! $${player.credits} credits.`);
    } else {
      state._playerCredits = null;
      toast(`Welcome, ${state.bettorName}!`);
    }
    // Go to bet tab
    location.hash = '#bet';
    refresh();
  },

  filterPlayers(val) {
    state._playerFilter = val;
    refresh();
  },

  // Pick name from the first-load modal (round mode only)
  pickNameFromModal(name) {
    const slug = state._slug || 'event';
    if (name && name.trim()) {
      state.bettorName = name.trim();
      localStorage.setItem('waggle_identity_' + slug, name.trim());
    } else {
      // "Just watching" — save empty string so modal never shows again
      state.bettorName = null;
      localStorage.setItem('waggle_identity_' + slug, '');
    }
    state._showIdentityPicker = false;
    state._playerFilter = '';
    persist();
    refresh();
  },
  setNameInput(v) {
    state._nameInput = v;
  },

  editBettorName() {
    const slug = state._slug || 'event';
    state.bettorName = null;
    state._playerCredits = null;
    state._playerFilter = '';
    localStorage.removeItem('waggle_identity_' + slug);
    state._showIdentityPicker = true;
    refresh();
  },

  // ── Player Score Entry (round mode — no PIN required) ──
  openScoreModal() {
    // Determine next unscored hole
    const holes = state._holes || {};
    let nextHole = 1;
    for (let h = 1; h <= 18; h++) {
      if (!holes[h] || !holes[h].scores || Object.keys(holes[h].scores).length === 0) {
        nextHole = h;
        break;
      }
      if (h === 18) nextHole = 18;
    }
    const existing = holes[nextHole]?.scores || {};
    state._scoreModal = { hole: nextHole, scores: { ...existing } };
    refresh();
  },
  closeScoreModal() {
    state._scoreModal = null;
    refresh();
  },
  setScoreModalHole(h) {
    const holeNum = parseInt(h);
    if (isNaN(holeNum) || holeNum < 1 || holeNum > 18) return;
    const existing = (state._holes || {})[holeNum]?.scores || {};
    state._scoreModal = { hole: holeNum, scores: { ...existing } };
    refresh();
  },
  setScoreModalScore(player, val) {
    if (!state._scoreModal) return;
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1 && n <= 15) {
      // Track previous score for undo functionality
      if (!state._scoreModal.undoStack) state._scoreModal.undoStack = [];
      const previousScore = state._scoreModal.scores[player];
      if (previousScore !== n) {
        state._scoreModal.undoStack.push({ player, score: previousScore });
        // Keep only last 10 undos to prevent memory issues
        if (state._scoreModal.undoStack.length > 10) {
          state._scoreModal.undoStack.shift();
        }
      }

      state._scoreModal.scores[player] = n;

      // Haptic feedback on score tap
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Animate score change based on par performance
      const config = state._config;
      const pars = config?.coursePars || [];
      const par = pars[state._scoreModal.hole - 1] || 4;
      const diff = n - par;

      // Trigger visual animation
      this.animateScoreChange(player, n, diff);

    } else if (val === '' || val === null) {
      delete state._scoreModal.scores[player];
    }

    // Defer refresh so input doesn't lose focus mid-typing
    clearTimeout(window._scoreRefreshTimer);
    window._scoreRefreshTimer = setTimeout(() => refresh(), 400);
  },

  animateScoreChange(player, score, diff) {
    // Find the button that was just clicked and animate it
    setTimeout(() => {
      const buttons = document.querySelectorAll(`button[onclick*="setScoreModalScore('${player}',${score})"]`);
      buttons.forEach(btn => {
        if (btn) {
          // Remove any existing animation classes
          btn.classList.remove('score-flash-eagle', 'score-flash-birdie', 'score-flash-par', 'score-flash-bogey');

          // Add appropriate animation class based on score
          let flashClass = 'score-flash-par';
          if (diff <= -2) flashClass = 'score-flash-eagle';      // Eagle or better
          else if (diff === -1) flashClass = 'score-flash-birdie'; // Birdie
          else if (diff >= 2) flashClass = 'score-flash-bogey';    // Double bogey or worse

          btn.classList.add(flashClass);

          // Remove animation class after animation completes
          setTimeout(() => {
            btn.classList.remove(flashClass);
          }, 600);
        }
      });
    }, 50);
  },

  undoLastScore() {
    if (!state._scoreModal || !state._scoreModal.undoStack || state._scoreModal.undoStack.length === 0) {
      toast('Nothing to undo');
      return;
    }

    const lastAction = state._scoreModal.undoStack.pop();
    if (lastAction.score !== undefined) {
      state._scoreModal.scores[lastAction.player] = lastAction.score;
    } else {
      delete state._scoreModal.scores[lastAction.player];
    }

    // Haptic feedback for undo
    if (navigator.vibrate) {
      navigator.vibrate([30, 30, 30]);
    }

    toast('Score undone');
    refresh();
  },
  async submitScoreModal() {
    if (!state._scoreModal) return;
    const { hole, scores } = state._scoreModal;
    if (Object.keys(scores).length === 0) { toast('Enter at least one score'); return; }
    try {
      const result = await Sync.submitHoleScores(hole, scores);
      if (result && result.ok) {
        if (navigator.vibrate) navigator.vibrate(30);
        toast(`Hole ${hole} saved!`);
        state._scoreModal = null;
        await syncFromServer();
        refresh();

        // Auto-advance to next hole after 1.5 seconds
        const config = state._config;
        const holesPerRound = config?.holesPerRound || 18;
        const nextHole = hole + 1;

        if (nextHole <= holesPerRound) {
          setTimeout(() => {
            // Check if user hasn't manually opened another modal
            if (!state._scoreModal) {
              this.setScoreModalHole(nextHole);
              toast(`Auto-advanced to Hole ${nextHole}`);
            }
          }, 1500);
        }
      } else {
        throw new Error('submit returned null');
      }
    } catch (e) {
      // Offline or failed — queue mutation and update UI optimistically
      await queueMutation({ type: 'scores', payload: { holeNum: hole, scores: { ...scores } }, ts: Date.now() });
      if (!state._holes) state._holes = {};
      state._holes[hole] = { ...scores };
      state._scoreModal = null;
      toast('Saved offline — will sync when connected');
      persist();
      updateConnectivityIndicator();
      refresh();
    }
  },

  // ── Hole Stat Tracking (FIR/GIR/Putts/Penalty) ──
  setHoleStat(player, stat, value) {
    if (!state._inlineScoreStats) state._inlineScoreStats = {};
    if (!state._inlineScoreStats[player]) state._inlineScoreStats[player] = {};
    state._inlineScoreStats[player][stat] = value;
    // Don't re-render — just update the state silently
  },

  // ── Inline Score Card (replaces modal) ──
  inlineScoreNav(dir) {
    if (!state._inlineScore) return;
    const holesPerRound = state._config?.holesPerRound || 18;
    const newHole = Math.max(1, Math.min(holesPerRound, state._inlineScore.hole + dir));
    const existing = (state._holes || {})[newHole]?.scores || {};
    state._inlineScore = { hole: newHole, scores: { ...existing } };
    // Load existing stats for this hole or clear
    const existingStats = (state._holes || {})[newHole]?.stats || {};
    state._inlineScoreStats = Object.keys(existingStats).length > 0 ? JSON.parse(JSON.stringify(existingStats)) : {};
    refresh();
  },
  inlineScoreSetHole(h) {
    const holeNum = parseInt(h);
    const holesPerRound = state._config?.holesPerRound || 18;
    if (isNaN(holeNum) || holeNum < 1 || holeNum > holesPerRound) return;
    const existing = (state._holes || {})[holeNum]?.scores || {};
    state._inlineScore = { hole: holeNum, scores: { ...existing } };
    // Load existing stats for this hole or clear
    const existingStats = (state._holes || {})[holeNum]?.stats || {};
    state._inlineScoreStats = Object.keys(existingStats).length > 0 ? JSON.parse(JSON.stringify(existingStats)) : {};
    refresh();
  },

  // Hole progress strip navigation - jump to any hole
  jumpToHole(holeNum) {
    this.inlineScoreSetHole(holeNum);
    // Add haptic feedback for hole navigation
    if (navigator.vibrate) navigator.vibrate(30);
    toast(`Jumped to Hole ${holeNum}`);
  },
  inlineScoreSet(player, val) {
    if (!state._inlineScore) return;
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1 && n <= 15) {
      state._inlineScore.scores[player] = n;
      // Warn on outlier scores (triple bogey or worse)
      const hole = state._inlineScore.hole;
      const pars = state._config?.coursePars || state._config?.course?.pars || [];
      const par = pars[hole - 1] || 4;
      if (n >= par + 4) {
        toast(`${n} on a par ${par}? Tap again to change.`, 2000);
      }
    } else {
      delete state._inlineScore.scores[player];
    }
    // Defer refresh so rapid taps don't lag
    clearTimeout(window._inlineScoreRefreshTimer);
    window._inlineScoreRefreshTimer = setTimeout(() => refresh(), 150);
  },

  // Premium score entry with haptic feedback and auto-advance
  premiumScoreSet(player, score, scoreToPar) {
    // Set the score using existing logic
    this.inlineScoreSet(player, score);

    // Haptic feedback based on performance
    if (navigator.vibrate) {
      if (scoreToPar <= -2) {
        navigator.vibrate([30, 50, 30]); // Eagle celebration
      } else if (scoreToPar === -1) {
        navigator.vibrate([50, 30]); // Birdie success
      } else if (scoreToPar === 0) {
        navigator.vibrate(30); // Par confirmation
      } else {
        navigator.vibrate(15); // Bogey+ light tap
      }
    }

    // Visual feedback toast
    const scoreNames = {
      [-3]: 'Albatross! 🦅',
      [-2]: 'Eagle! 🦅',
      [-1]: 'Birdie! 🐦',
      [0]: 'Par',
      [1]: 'Bogey',
      [2]: 'Double Bogey',
      [3]: 'Triple Bogey'
    };
    const scoreName = scoreNames[scoreToPar] || `+${scoreToPar}`;
    toast(`${player.split(' ')[0]}: ${scoreName}`, 1000);

    // Clear any existing auto-advance timer
    if (window._autoAdvanceTimer) {
      clearTimeout(window._autoAdvanceTimer);
      window._autoAdvanceTimer = null;
    }

    // Auto-advance after 1.5 seconds (with visual countdown)
    this.startAutoAdvanceCountdown();
  },

  startAutoAdvanceCountdown() {
    const countdownDuration = 1500; // 1.5 seconds
    const startTime = Date.now();

    // Create countdown ring overlay if not exists
    let countdownEl = document.getElementById('auto-advance-countdown');
    if (!countdownEl) {
      countdownEl = document.createElement('div');
      countdownEl.id = 'auto-advance-countdown';
      countdownEl.innerHTML = `
        <div style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 1000;
          pointer-events: none;
        ">
          <svg width="80" height="80" style="transform: rotate(-90deg)">
            <circle cx="40" cy="40" r="30" fill="none" stroke="#374151" stroke-width="8" opacity="0.2"/>
            <circle
              id="countdown-progress"
              cx="40" cy="40" r="30"
              fill="none"
              stroke="#D4AF37"
              stroke-width="8"
              stroke-linecap="round"
              stroke-dasharray="188.5"
              stroke-dashoffset="0"
              style="animation: countdown-ring ${countdownDuration}ms linear forwards;"
            />
          </svg>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #D4AF37;
            font-size: 12px;
            font-weight: 700;
            text-align: center;
            line-height: 1;
          ">
            <div>AUTO</div>
            <div>ADVANCE</div>
          </div>
        </div>
      `;
      document.body.appendChild(countdownEl);
    }

    // Auto-advance timer
    window._autoAdvanceTimer = setTimeout(() => {
      const holesPerRound = state._config?.holesPerRound || 18;
      const currentHole = state._inlineScore?.hole || 1;

      if (currentHole < holesPerRound) {
        // Check if all players have scores for current hole
        const currentScores = state._inlineScore?.scores || {};
        const players = state._config?.players || [];
        const allScored = players.every(p => currentScores[p.name] != null);

        if (allScored) {
          this.jumpToHole(currentHole + 1);
          toast(`Auto-advanced to Hole ${currentHole + 1}`);
        }
      }

      // Remove countdown
      if (countdownEl) {
        countdownEl.remove();
      }
    }, countdownDuration);

    // Allow canceling by tapping countdown
    countdownEl.style.pointerEvents = 'auto';
    countdownEl.onclick = () => {
      if (window._autoAdvanceTimer) {
        clearTimeout(window._autoAdvanceTimer);
        window._autoAdvanceTimer = null;
      }
      countdownEl.remove();
      toast('Auto-advance canceled');
    };
  },

  // Undo score history with swipe gesture
  handleUndoSwipe(player, event) {
    if (!window._undoState) {
      window._undoState = {};
    }

    const playerId = player.replace(/[^a-zA-Z0-9]/g, '');
    const strip = document.getElementById(`undo-strip-${player}`);
    const indicator = document.getElementById(`undo-indicator-${player}`);

    if (!strip || !indicator) return;

    const rect = strip.getBoundingClientRect();
    const isTouch = event.type.startsWith('touch');
    const clientX = isTouch ? event.touches?.[0]?.clientX || event.changedTouches?.[0]?.clientX : event.clientX;

    if (event.type === 'touchstart' || event.type === 'mousedown') {
      window._undoState[playerId] = {
        startX: clientX,
        startTime: Date.now(),
        swiping: true
      };
      strip.style.cursor = 'grabbing';
      event.preventDefault();
    }

    else if ((event.type === 'touchmove' || event.type === 'mousemove') && window._undoState[playerId]?.swiping) {
      const deltaX = clientX - window._undoState[playerId].startX;
      const progress = Math.max(0, Math.min(1, deltaX / (rect.width * 0.7)));

      // Visual feedback
      indicator.style.left = `${-100 + (progress * 120)}%`;
      indicator.style.width = `${progress * 100}%`;
      strip.style.transform = `translateX(${Math.min(deltaX * 0.1, 20)}px)`;
      strip.style.background = `rgba(220,38,38,${0.08 + progress * 0.15})`;

      event.preventDefault();
    }

    else if ((event.type === 'touchend' || event.type === 'mouseup') && window._undoState[playerId]?.swiping) {
      const deltaX = clientX - window._undoState[playerId].startX;
      const swipeDistance = Math.abs(deltaX);
      const swipeTime = Date.now() - window._undoState[playerId].startTime;
      const swipeVelocity = swipeDistance / swipeTime;

      // Reset visual state
      strip.style.cursor = 'grab';
      strip.style.transform = '';
      strip.style.background = 'rgba(220,38,38,0.08)';
      indicator.style.left = '-100%';
      indicator.style.width = '0';

      // Trigger undo if swipe was significant
      if (deltaX > rect.width * 0.5 || (swipeDistance > 50 && swipeVelocity > 0.3)) {
        this.undoLastScores(player);
      }

      window._undoState[playerId].swiping = false;
      event.preventDefault();
    }
  },

  undoLastScores(player) {
    if (!state._holes || !state._config) return;

    const holes = state._holes;
    const currentHole = state._inlineScore?.hole || 1;
    let undoCount = 0;
    const maxUndo = 3;

    // Undo scores from current hole backwards
    for (let h = currentHole; h >= 1 && undoCount < maxUndo; h--) {
      if (holes[h]?.scores?.[player] != null) {
        delete holes[h].scores[player];

        // Also clear stats for this hole
        if (holes[h]?.stats?.[player]) {
          delete holes[h].stats[player];
        }

        undoCount++;
      }
    }

    if (undoCount > 0) {
      // Haptic feedback for undo
      if (navigator.vibrate) navigator.vibrate([20, 20, 20]);

      // Toast notification
      const playerName = player.split(' ')[0];
      toast(`${playerName}: Undid ${undoCount} score${undoCount > 1 ? 's' : ''}`, 1500);

      // Update inline score state if current hole was affected
      if (state._inlineScore && holes[state._inlineScore.hole]) {
        state._inlineScore.scores = { ...holes[state._inlineScore.hole].scores };
        const existingStats = holes[state._inlineScore.hole]?.stats || {};
        state._inlineScoreStats = Object.keys(existingStats).length > 0 ? JSON.parse(JSON.stringify(existingStats)) : {};
      }

      // Sync changes to server
      this.saveInlineScore();
      refresh();
    } else {
      toast(`${player.split(' ')[0]}: No recent scores to undo`);
    }
  },

  inlineScoreType(player, value) {
    const n = parseInt(value);
    if (!state._inlineScore) state._inlineScore = { hole: 1, scores: {} };
    if (isNaN(n) || n < 1 || n > 15) {
      delete state._inlineScore.scores[player];
    } else {
      state._inlineScore.scores[player] = n;
    }
    // Defer re-render to avoid losing focus during typing
    clearTimeout(window._inlineTypeTimer);
    window._inlineTypeTimer = setTimeout(() => refresh(), 400);
  },
  inlineScoreToggle9(side) {
    if (!state._inlineScore) return;
    const h = state._inlineScore.hole;
    if (side === 'front' && h > 9) {
      state._inlineScore.hole = 1;
    } else if (side === 'back' && h <= 9) {
      state._inlineScore.hole = 10;
    }
    const existing = (state._holes || {})[state._inlineScore.hole]?.scores || {};
    state._inlineScore.scores = { ...existing };
    // Load existing stats for the new hole
    const existingStats = (state._holes || {})[state._inlineScore.hole]?.stats || {};
    state._inlineScoreStats = Object.keys(existingStats).length > 0 ? JSON.parse(JSON.stringify(existingStats)) : {};
    refresh();
  },
  async inlineScoreSave() {
    if (!state._inlineScore) return;
    const { hole, scores } = state._inlineScore;
    if (Object.keys(scores).length === 0) { toast('Enter at least one score'); return; }

    // Capture stats for this hole before clearing
    const holeStats = state._inlineScoreStats && Object.keys(state._inlineScoreStats).length > 0
      ? JSON.parse(JSON.stringify(state._inlineScoreStats))
      : null;

    // Analytics: track score entry
    try {
      const pars = state._config?.coursePars || state._config?.course?.pars || [];
      const par = pars[hole - 1] || 4;
      const playerCount = Object.keys(scores).length;
      const avgScore = playerCount > 0 ? (Object.values(scores).reduce((a, b) => a + b, 0) / playerCount).toFixed(1) : 0;
      const hasStats = !!holeStats;
      window._mgAnalytics = window._mgAnalytics || [];
      window._mgAnalytics.push({
        event: 'hole_scored',
        hole,
        par,
        avgScore: parseFloat(avgScore),
        playerCount,
        hasStats,
        statsTracked: holeStats ? Object.keys(holeStats).length : 0,
        timestamp: Date.now()
      });
    } catch (_) { /* analytics should never break scoring */ }

    try {
      const result = await Sync.submitHoleScores(hole, scores);
      if (result && result.ok) {
        if (navigator.vibrate) navigator.vibrate(30);

        // Store undo data before advancing
        state._lastScoredHole = { hole, scores: { ...scores }, stats: holeStats ? JSON.parse(JSON.stringify(holeStats)) : null };
        toast(`Hole ${hole} saved`);

        // Store stats locally alongside hole data
        if (!state._holes) state._holes = {};
        if (holeStats) {
          if (!state._holes[hole]) state._holes[hole] = {};
          state._holes[hole].stats = holeStats;
        }

        await syncFromServer();

        // Re-attach stats after sync (server may not return them yet)
        if (holeStats && state._holes && state._holes[hole]) {
          state._holes[hole].stats = holeStats;
        }

        // Auto-advance to next unscored hole
        const holesPerRound = state._config?.holesPerRound || 18;
        const holes = state._holes || {};
        let nextHole = null;
        for (let h = 1; h <= holesPerRound; h++) {
          if (!holes[h] || !holes[h].scores || Object.keys(holes[h].scores).length === 0) {
            nextHole = h;
            break;
          }
        }
        if (nextHole) {
          const existingNext = holes[nextHole]?.scores || {};
          state._inlineScore = { hole: nextHole, scores: { ...existingNext } };
          // Load existing stats for next hole or clear
          const nextStats = holes[nextHole]?.stats || {};
          state._inlineScoreStats = Object.keys(nextStats).length > 0 ? JSON.parse(JSON.stringify(nextStats)) : {};
        } else {
          state._inlineScore = null; // round complete
          state._inlineScoreStats = {};
        }
        refresh();
      } else {
        throw new Error('submit returned null');
      }
    } catch (e) {
      // Offline or failed — queue mutation and update UI optimistically
      await queueMutation({ type: 'scores', payload: { holeNum: hole, scores: { ...scores } }, ts: Date.now() });
      if (!state._holes) state._holes = {};
      state._holes[hole] = { ...scores };
      // Store stats locally even when offline
      if (holeStats) {
        if (!state._holes[hole] || typeof state._holes[hole] !== 'object') {
          state._holes[hole] = { scores: { ...scores } };
        }
        state._holes[hole].stats = holeStats;
      }
      if (navigator.vibrate) navigator.vibrate(30);
      toast('Saved offline — will sync when connected');
      // Auto-advance
      const holesPerRound = state._config?.holesPerRound || 18;
      let nextHole = null;
      for (let h = 1; h <= holesPerRound; h++) {
        if (!state._holes[h] || !state._holes[h].scores || Object.keys(state._holes[h].scores).length === 0) {
          nextHole = h;
          break;
        }
      }
      if (nextHole) {
        state._inlineScore = { hole: nextHole, scores: {} };
        state._inlineScoreStats = {};
      } else {
        state._inlineScore = null;
        state._inlineScoreStats = {};
      }
      persist();
      updateConnectivityIndicator();
      refresh();
    }
  },

  // ── Undo Last Hole ──
  async undoLastHole() {
    const last = state._lastScoredHole;
    if (!last) { toast('Nothing to undo'); return; }
    const hole = last.hole;
    // Re-submit with empty scores to clear the hole
    try {
      const emptyScores = {};
      const players = state._config?.players || state._config?.roster || [];
      players.forEach(p => { emptyScores[p.name || p.member] = 0; });
      const result = await Sync.submitHoleScores(hole, emptyScores);
      if (result && result.ok) {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        toast(`Hole ${hole} undone`);
        // Navigate back to that hole for re-entry
        state._inlineScore = { hole, scores: { ...last.scores } };
        state._inlineScoreStats = last.stats ? JSON.parse(JSON.stringify(last.stats)) : {};
        state._lastScoredHole = null;
        await syncFromServer();
        refresh();
      }
    } catch (e) {
      toast('Could not undo — try again');
    }
  },

  // ── Cash Bets (all event modes — settle in cash/Venmo) ──
  openCashBetModal(desc, amount) {
    state._cashBetModal = { desc: desc || '', amount: amount || '' };
    refresh();
  },
  closeCashBetModal() {
    state._cashBetModal = null;
    refresh();
  },
  setCashBetDesc(v) {
    if (state._cashBetModal) { state._cashBetModal.desc = v; }
  },
  setCashBetAmount(v) {
    if (state._cashBetModal) {
      state._cashBetModal.amount = v;
      refresh();
    }
  },
  logCashBet() {
    const m = state._cashBetModal;
    if (!m || !m.desc.trim()) { toast('Add a description'); return; }
    const amt = parseInt(m.amount) || 0;
    if (amt <= 0) { toast('Add an amount'); return; }
    if (!state.bettorName) { toast('Pick your name first'); return; }
    const slug = state._slug || 'event';
    let bets = [];
    try { bets = JSON.parse(localStorage.getItem(`${slug}:cash_bets`) || '[]'); } catch(e) {}
    bets.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      desc: m.desc.trim(),
      amount: amt,
      player: state.bettorName,
      createdAt: Date.now(),
      status: 'active'
    });
    try { localStorage.setItem(`${slug}:cash_bets`, JSON.stringify(bets)); } catch(e) {}
    state._cashBetModal = null;
    toast('Bet placed');
    refresh();
  },
  removeCashBet(id) {
    const slug = state._slug || 'event';
    let bets = [];
    try { bets = JSON.parse(localStorage.getItem(`${slug}:cash_bets`) || '[]'); } catch(e) {}
    bets = bets.filter(b => b.id !== id);
    try { localStorage.setItem(`${slug}:cash_bets`, JSON.stringify(bets)); } catch(e) {}
    refresh();
  },

  // Betting (MG match-play sportsbook)
  setBetTab(tab) {
    state._betTab = tab;
    refresh();
  },

  togglePropFlight(fId) {
    state._propFlight = state._propFlight === fId ? null : fId;
    refresh();
  },

  addToSlip(type, matchId, selection, description, odds, americanOdds) {
    if (!state._betSlip) state._betSlip = [];

    const idx = state._betSlip.findIndex(b => b.matchId === matchId && b.selection == selection);
    if (idx >= 0) {
      state._betSlip.splice(idx, 1);
      saveBetSlip();
      refresh();
      return;
    }

    if (type === "match_winner") {
      state._betSlip = state._betSlip.filter(b => b.matchId !== matchId || b.type !== "match_winner");
    }

    state._betSlip.push({
      type,
      matchId,
      flightId: type === "flight_winner" ? matchId : null,
      selection: typeof selection === "string" && !isNaN(selection) ? parseInt(selection) : selection,
      description,
      odds,
      americanOdds,
      stake: 0
    });
    saveBetSlip();
    refresh();
    // Scroll to make the bet slip visible on mobile
    setTimeout(() => {
      const slip = document.querySelector('.mg-betslip.open');
      if (slip) slip.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  },

  removeFromSlip(idx) {
    state._betSlip.splice(idx, 1);
    saveBetSlip();
    refresh();
  },

  clearSlip() {
    state._betSlip = [];
    saveBetSlip();
    refresh();
  },

  updateStake(idx, value) {
    state._betSlip[idx].stake = parseInt(value) || 0;
    saveBetSlip();
    // Re-render just the bet slip so payout math updates live
    const slipEl = document.querySelector(".mg-betslip");
    if (slipEl) {
      // Import renderBetSlip is not available here, so re-render via route
      // But we need to preserve focus — use a targeted update instead
      const b = state._betSlip[idx];
      const winnings = b.stake ? Math.round(b.stake * b.odds) - b.stake : 0;
      const totalReturn = b.stake ? Math.round(b.stake * b.odds) : 0;

      // Update this bet's payout display
      const items = slipEl.querySelectorAll(".mg-betslip-item");
      if (items[idx]) {
        const payoutDiv = items[idx].querySelector(".mg-slip-payout");
        if (payoutDiv) {
          payoutDiv.innerHTML = b.stake
            ? `<div style="color:var(--mg-win)">To win: $${winnings.toLocaleString()}</div><div style="font-weight:600;color:var(--mg-gold-dim)">Total return: $${totalReturn.toLocaleString()}</div>`
            : `<div style="color:var(--mg-text-muted)">Enter stake amount</div>`;
        }
      }

      // Update footer totals
      const totalStake = state._betSlip.reduce((sum, s) => sum + (s.stake || 0), 0);
      const allHaveStakes = state._betSlip.every(s => s.stake > 0);
      const totalEl = slipEl.querySelector(".mg-slip-total");
      if (totalEl) totalEl.textContent = `$${totalStake.toLocaleString()}`;
      const btn = slipEl.querySelector(".mg-btn-primary");
      if (btn) {
        btn.disabled = !allHaveStakes;
        btn.textContent = "Place Bet" + (state._betSlip.length > 1 ? "s" : "");
      }
    }
  },

  async placeBets() {
    if (!state._betSlip || state._betSlip.length === 0) return;

    // #10: Confirm large bets
    const totalStake = state._betSlip.reduce((sum, b) => sum + (b.stake || 0), 0);
    if (totalStake > 100) {
      const summary = state._betSlip.map(b => `${b.description} — $${b.stake}`).join('\n');
      if (!confirm(`Confirm $${totalStake} total?\n\n${summary}`)) return;
    }

    let placed = 0;
    let queued = 0;
    for (const b of state._betSlip) {
      if (b.stake <= 0) continue;

      const betData = {
        type: b.type,
        selection: b.selection,
        matchId: b.type === "flight_winner" ? null : b.matchId,
        flightId: b.flightId,
        odds: b.odds,
        americanOdds: b.americanOdds,
        stake: b.stake,
        description: b.description,
        bettor: state.bettorName
      };

      // Send to server
      const result = await Sync.submitBet(betData);
      if (result) {
        placeBet(state, betData);
        placed++;
      } else {
        // #8: Offline queue — save for retry
        const pending = JSON.parse(sessionStorage.getItem('mg_pending_bets') || '[]');
        pending.push(betData);
        sessionStorage.setItem('mg_pending_bets', JSON.stringify(pending));
        queued++;
      }
    }

    state._betSlip = [];
    saveBetSlip();
    persist();
    refresh();

    // Enhanced bet confirmation ceremony
    if (placed > 0) {
      // Stronger haptic feedback - triple pulse
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);

      // Gold pulse animation on bet slip button
      const betButton = document.querySelector('[onclick="window.MG.placeBets()"]');
      if (betButton) {
        betButton.classList.add('bet-placed');
        setTimeout(() => betButton.classList.remove('bet-placed'), 600);
      }

      // Ticket stamp animation for each bet
      showTicketStampAnimation(totalStake);

      // Update running bet tally
      incrementBetTally(totalStake);
    }

    if (placed > 0 && queued === 0) toast(`${placed} bet${placed > 1 ? "s" : ""} placed!`);
    else if (queued > 0 && placed === 0) toast(`${queued} bet${queued > 1 ? "s" : ""} saved — will submit when online`);
    else if (placed > 0 && queued > 0) toast(`${placed} placed, ${queued} pending`);
  },

  // Void bet (admin)
  async voidBet(betId) {
    // Void locally
    const bet = state.bets.find(b => b.id === betId);
    if (bet && bet.status === "active") {
      bet.status = "voided";
      persist();
    }

    // Void on server
    await Sync.updateBet(betId, { status: "voided" });
    await syncFromServer();
    refresh();
    toast("Bet voided");
  },

  // Admin quick bet — places directly on server
  async adminQuickBet(matchId, selection, americanOdds, decimalOdds) {
    // Try to read from the admin input field first
    const nameInput = document.getElementById("admin-bettor-name");
    let bettorName = nameInput ? nameInput.value.trim() : "";
    if (!bettorName) bettorName = prompt("Bettor name:");
    if (!bettorName || !bettorName.trim()) return;
    const stakeStr = prompt("Stake amount ($):");
    if (!stakeStr || !stakeStr.trim()) return;
    const stake = parseInt(stakeStr);
    if (isNaN(stake) || stake <= 0) return;

    const isFlightKey = state._config.flightOrder.includes(matchId);
    const type = isFlightKey ? "flight_winner" : "match_winner";

    let description = "";
    if (isFlightKey) {
      const team = state._config.teams[selection];
      description = team ? `${team.member} / ${team.guest} to win ${state._config.flights[matchId].name}` : `Team ${selection}`;
    } else {
      const match = state.matches[matchId];
      if (match) {
        const selTeam = state._config.teams[selection];
        const oppTeam = state._config.teams[selection == match.teamA ? match.teamB : match.teamA];
        description = selTeam && oppTeam
          ? `${selTeam.member.split(" ").pop()}/${selTeam.guest.split(" ").pop()} to beat ${oppTeam.member.split(" ").pop()}/${oppTeam.guest.split(" ").pop()}`
          : `Team ${selection}`;
      }
    }

    // Send directly to server (admin bets = real money, not virtual balance)
    const betData = {
      bettor: bettorName.trim(),
      type,
      selection: typeof selection === "string" && !isNaN(selection) ? parseInt(selection) : selection,
      matchId: isFlightKey ? null : matchId,
      flightId: isFlightKey ? matchId : null,
      stake,
      odds: decimalOdds,
      americanOdds,
      description,
    };

    const result = await Sync.submitBet(betData);
    if (result) {
      if (navigator.vibrate) navigator.vibrate(30);
      // Also store locally for immediate display
      state.bets.push(result);
      persist();
      await syncFromServer();
      refresh();
      toast(`$${stake} bet placed for ${bettorName.trim()}`);
    } else {
      await syncFromServer();
      refresh();
      toast(`Bet failed — try again`);
    }
  },

  // Manual sync trigger
  async syncNow() {
    toast("Syncing...");
    await syncFromServer();
    toast("Synced!");
  },

  // Player credits (admin)
  async adminAddCredits(playerName) {
    const amountStr = prompt(`Add credits for ${playerName}. Amount ($):`);
    if (!amountStr || !amountStr.trim()) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount === 0) return;
    const result = await Sync.addCredits(playerName, amount);
    if (result && result.ok) {
      toast(`${amount > 0 ? '+' : ''}$${amount} credits for ${playerName}`);
      refresh();
    } else {
      toast("Failed to update credits");
    }
  },

  async adminNewPlayer() {
    const name = prompt("Player name:");
    if (!name || !name.trim()) return;
    const creditsStr = prompt("Starting credits ($):", "50");
    if (!creditsStr) return;
    const credits = parseInt(creditsStr);
    if (isNaN(credits) || credits < 0) return;
    const result = await Sync.createPlayer(name.trim(), credits);
    if (result && result.ok) {
      toast(`${name.trim()} created with $${credits} credits`);
      refresh();
    } else {
      toast("Failed to create player");
    }
  },

  // Join requests (admin)
  async loadJoinRequests() {
    try {
      const res = await Sync.apiFetch('join-requests', 'GET');
      if (res && Array.isArray(res)) {
        state._joinRequests = res;
        refresh();
      }
    } catch {}
  },

  async approveJoin(id, name) {
    const creditsStr = prompt(`Approve ${name}. Starting credits ($):`, '50');
    if (creditsStr === null) return;
    const credits = parseInt(creditsStr) || 0;
    const res = await Sync.apiFetch('join-approve', 'POST', { id, credits });
    if (res && res.ok) {
      state._joinRequests = (state._joinRequests || []).filter(r => r.id !== id);
      toast(`${name} approved — $${credits} credits`);
      await Sync.fetchPlayers();
      refresh();
    } else {
      toast('Failed to approve');
    }
  },

  async rejectJoin(id) {
    const res = await Sync.apiFetch('join-reject', 'POST', { id });
    if (res && res.ok) {
      state._joinRequests = (state._joinRequests || []).filter(r => r.id !== id);
      toast('Request rejected');
      refresh();
    }
  },

  // Share bet — visual trash talk card
  async shareBet(desc, ml, stake, toWin, status) {
    const name = state.bettorName || 'Someone';

    // Trash talk lines
    const activeTaunts = [
      "Money where my mouth is.",
      "Lock it in. No hesitation.",
      "You gonna match this or just watch?",
      "Feeling dangerous today.",
      "This one's a lock.",
      "Tell the bartender I said you're welcome.",
      "I don't miss.",
    ];
    const winTaunts = [
      "Called it. Pay up.",
      "CASH MONEY.",
      "Never in doubt.",
      "That's how it's done.",
      "Drinks on me. Actually, drinks on you.",
      "I'd like to thank the academy.",
      "Too easy.",
    ];
    const taunts = status === 'won' ? winTaunts : activeTaunts;
    const taunt = taunts[Math.floor(Math.random() * taunts.length)];

    const isWin = status === 'won';
    const headline = isWin ? 'CASHED' : 'LOCKED IN';

    // Show visual card overlay
    const overlay = document.createElement('div');
    overlay.id = 'share-overlay';
    overlay.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px" onclick="this.remove()">
        <div onclick="event.stopPropagation()" style="width:100%;max-width:360px">
          <div id="share-card" style="background:linear-gradient(135deg, #1A472A 0%, #2D6A3E 100%);border-radius:16px;padding:24px 20px;color:#fff;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
            <div style="font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:4px">${state._config.event.name}</div>
            <div style="font-family:'Inter',sans-serif;font-size:13px;letter-spacing:3px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin:8px 0">${isWin ? 'Winner' : 'Active Bet'}</div>
            <div style="font-family:'Inter',sans-serif;font-size:24px;font-weight:700;letter-spacing:2px;color:#D4AF37">${headline}</div>
            <div style="font-size:18px;font-weight:700;margin:12px 0 4px">${name}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-bottom:16px">${desc}</div>
            <div style="display:flex;justify-content:center;gap:24px;margin:16px 0;padding:16px 0;border-top:1px solid rgba(255,255,255,0.15);border-bottom:1px solid rgba(255,255,255,0.15)">
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase">Line</div>
                <div style="font-size:22px;font-weight:800;color:#22C55E">${ml}</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase">${isWin ? 'Risked' : 'Risking'}</div>
                <div style="font-size:22px;font-weight:800">$${stake}</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase">${isWin ? 'Won' : 'To Win'}</div>
                <div style="font-size:22px;font-weight:800;color:#D4AF37">$${toWin}</div>
              </div>
            </div>
            <div style="font-style:italic;font-size:14px;color:rgba(255,255,255,0.7);margin-top:8px">"${taunt}"</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:12px">${state._config.event.url || location.hostname}</div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button onclick="window.MG._doShare('text')" style="flex:1;padding:14px;border-radius:10px;border:none;background:#fff;color:#1A472A;font-size:14px;font-weight:700;cursor:pointer">Share</button>
            <button onclick="document.getElementById('share-overlay').remove()" style="padding:14px 20px;border-radius:10px;border:2px solid rgba(255,255,255,0.3);background:transparent;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Close</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Store share data for the button
    window.MG._shareData = { name, desc, ml, stake, toWin, status, taunt };
  },

  async _doShare(mode) {
    const d = window.MG._shareData;
    if (!d) return;
    const isWin = d.status === 'won';
    const headline = isWin ? 'CASHED' : 'LOCKED IN';

    const eventLabel = state._config?.event?.name || 'Golf Event';
    const eventUrl = location.href.replace(/#.*$/, '');
    const lines = [];
    lines.push(isWin ? '\u{1F4B0} CASHED \u{1F4B0}' : '\u{1F512} LOCKED IN');
    lines.push('');
    lines.push(`\u{1F3CC}\u{FE0F} ${eventLabel}`);
    lines.push('\u2500'.repeat(20));
    lines.push(`${d.name}`);
    lines.push(`${d.desc}`);
    lines.push('');
    lines.push(`Line:    ${d.ml}`);
    lines.push(`${isWin ? 'Risked' : 'Risking'}:  $${d.stake}`);
    lines.push(`${isWin ? 'Won' : 'To Win'}:    $${d.toWin}`);
    if (isWin) {
      lines.push('');
      lines.push(`\u{1F4B5} P&L: +$${d.toWin}`);
    }
    lines.push('');
    lines.push(`\u201C${d.taunt}\u201D`);
    lines.push('');
    lines.push('\u2500'.repeat(20));
    lines.push(`Waggle \u26F3 ${eventUrl}`);
    const text = lines.join('\n');

    const overlay = document.getElementById('share-overlay');

    if (navigator.share) {
      try {
        await navigator.share({ title: `${d.name} \u2014 ${headline}`, text, url: 'https://betwaggle.com' });
        if (overlay) overlay.remove();
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard!");
      if (overlay) overlay.remove();
    } catch {
      toast("Share not available");
    }
  },

  // Calcutta
  editCalcutta(teamId) {
    const t = state._config.teams[teamId];
    const existing = state.calcutta[teamId] || {};
    const buyer = prompt(`Buyer for ${t.member} / ${t.guest}:`, existing.buyer || "");
    if (buyer === null) return;
    if (!buyer.trim()) {
      delete state.calcutta[teamId];
      persist();
      refresh();
      return;
    }
    const price = parseInt(prompt("Purchase price ($):", existing.price || "400"));
    if (isNaN(price)) return;
    state.calcutta[teamId] = { buyer: buyer.trim(), price };
    persist();
    refresh();
    toast(`${t.member.split(" ").pop()} sold to ${buyer.trim()}`);
  },

  // Shootout
  startShootout() {
    const winners = [];
    let wildCard = null;
    let wildCardPts = -1;

    state._config.flightOrder.forEach(fId => {
      const standings = calcStandings(fId, state.matches, state._config);
      winners.push(standings[0].teamId);
      if (standings[1].points > wildCardPts) {
        wildCard = standings[1].teamId;
        wildCardPts = standings[1].points;
      }
    });

    if (wildCard) winners.push(wildCard);

    state.shootout = {
      teams: winners,
      holes: {},
      eliminated: []
    };
    persist();
    refresh();
    toast("Shootout started!");
  },

  // ── Scenario / What-If handlers ──
  setScenarioFlight(flightId) {
    state._scenario.flightId = flightId;
    state._scenario.simResults = {};
    refresh();
  },
  setSimResult(matchId, scoreA, scoreB) {
    state._scenario.simResults[matchId] = { scoreA, scoreB };
    refresh();
  },
  clearSimResult(matchId) {
    delete state._scenario.simResults[matchId];
    refresh();
  },
  resetScenarios() {
    state._scenario.simResults = {};
    refresh();
  },
  // Round-mode scenario handlers
  setSimHoleScore(hole, playerName, score) {
    if (!state._scenario.simHoles) state._scenario.simHoles = {};
    if (!state._scenario.simHoles[hole]) state._scenario.simHoles[hole] = {};
    state._scenario.simHoles[hole][playerName] = score;
    refresh();
  },
  clearSimHole(hole) {
    if (state._scenario.simHoles) delete state._scenario.simHoles[hole];
    refresh();
  },
  resetRoundScenarios() {
    state._scenario.simHoles = {};
    refresh();
  },

  // ── What-If Battle Mode ──
  setWhatIfPlayer(which, name) {
    if (!state._scenario) state._scenario = {};
    if (which === 'my') state._scenario.myPlayer = name;
    else state._scenario.rivalPlayer = name;
    if (navigator.vibrate) navigator.vibrate(20);
    route();
  },

  setWhatIfScore(hole, who, score) {
    if (!state._scenario) state._scenario = {};
    if (!state._scenario.simHoles) state._scenario.simHoles = {};
    if (!state._scenario.simHoles[hole]) state._scenario.simHoles[hole] = {};
    state._scenario.simHoles[hole][who] = score;
    if (navigator.vibrate) navigator.vibrate(30);
    route();
  },

  resetWhatIf() {
    if (!state._scenario) state._scenario = {};
    state._scenario.simHoles = {};
    route();
  },

  // ── Activity Feed / Trash Talk ──
  async sendChirp() {
    // Check both feed input locations (board feed and bar tab)
    const input = document.getElementById('feed-chirp-input') || document.getElementById('bar-chirp-input');
    if (!input) return;
    const text = input.value.trim().slice(0, 100);
    if (!text) return;
    const player = state.bettorName || 'Anonymous';
    input.value = '';
    const result = await Sync.postChirp(player, text, '');
    if (result && result.ok) {
      // Optimistic add
      state._feed.unshift(result.item);
      route();
    } else {
      toast('Could not send message');
    }
  },

  async generateAIChirp() {
    const btn = document.getElementById('ai-chirp-btn');
    const resultDiv = document.getElementById('ai-chirp-result');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    try {
      const slug = state._slug || location.pathname.split('/').filter(Boolean).pop() || '';
      const resp = await fetch(`/${slug}/ai/chirp`);
      const data = await resp.json();
      const chirpText = data.chirp || 'No chirp available.';
      // Post as a chirp in the feed
      const player = 'AI';
      const result = await Sync.postChirp(player, chirpText, '');
      if (result && result.ok) {
        state._feed.unshift(result.item);
        route();
      } else if (resultDiv) {
        resultDiv.innerHTML = `<div style="padding:8px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:6px;font-size:13px;color:var(--mg-text);font-style:italic">"${chirpText.replace(/</g,'&lt;')}"</div>`;
      }
    } catch (e) {
      if (resultDiv) resultDiv.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--loss)">AI is taking a mulligan.</div>`;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Generate Trash Talk'; }
  },

  // ── Props / Side Bets / Double-or-Nothing ──
  async createDoubleOrNothing() {
    const pnl = computeRoundPnL(state._gameState, getPlayersFromConfig(state._config), state._config?.games || {}, state._config?.structure);
    const winners = Object.entries(pnl).filter(([,v]) => v > 0).sort((a,b) => b[1] - a[1]);
    const losers = Object.entries(pnl).filter(([,v]) => v < 0).sort((a,b) => a[1] - b[1]);
    if (winners.length === 0) { toast('No winners to double'); return; }
    const totalWon = winners.reduce((s, [,v]) => s + v, 0);
    const desc = winners.map(([n]) => n.split(' ')[0]).join('/') + ' won $' + totalWon + '. Double or nothing on Round ' + ((state._config?.event?.currentRound || 1) + 1) + '?';
    const result = await Sync.createProp({
      type: 'double_or_nothing',
      description: desc,
      amount: totalWon * 2,
      creator: state.bettorName || 'Commissioner',
      parties: [...winners.map(([n]) => n), ...losers.map(([n]) => n)],
      roundNumber: (state._config?.event?.currentRound || 1) + 1,
    });
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate([30, 80, 30]);
      toast('Double or nothing proposed!');
      syncFromServer();
    }
  },

  async acceptProp(propId) {
    const player = state.bettorName || 'Anonymous';
    const result = await Sync.acceptProp(propId, player);
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate(30);
      toast('Accepted!');
      syncFromServer();
    }
  },

  async createSideBet() {
    const desc = prompt('Describe the bet:');
    if (!desc) return;
    const amount = parseFloat(prompt('Amount ($):') || '0');
    const result = await Sync.createProp({
      type: 'side_bet',
      description: desc,
      amount,
      creator: state.bettorName || 'Anonymous',
      parties: [],
    });
    if (result?.ok) { toast('Side bet posted!'); syncFromServer(); }
  },

  async bulkImportPlayers() {
    const input = document.getElementById('bulk-players-input');
    if (!input || !input.value.trim()) return;
    const lines = input.value.trim().split('\n').filter(l => l.trim());
    const players = lines.map(line => {
      const parts = line.split(/[,\t]+/).map(s => s.trim());
      if (parts.length < 2) return null;
      let venmo = '';
      let hiIdx = parts.length - 1;
      if (parts.length >= 3 && parts[parts.length-1].startsWith('@')) {
        venmo = parts[parts.length-1];
        hiIdx = parts.length - 2;
      }
      return { name: parts.slice(0, hiIdx).join(' '), handicapIndex: parseFloat(parts[hiIdx]) || 0, venmo };
    }).filter(Boolean);

    if (players.length === 0) { toast('No valid players found'); return; }

    const result = await Sync.apiFetch('event/bulk-add-players', 'POST', { players });
    if (result?.ok) {
      toast(result.added + ' players added' + (result.skipped > 0 ? ', ' + result.skipped + ' skipped' : ''));
      input.value = '';
      syncFromServer();
    } else {
      toast('Import failed');
    }
  },

  async addPlayerInline() {
    const nameEl = document.getElementById('add-player-name');
    const hcpEl = document.getElementById('add-player-hcp');
    if (!nameEl || !nameEl.value.trim()) { toast('Enter a name'); return; }
    const name = nameEl.value.trim();
    const hi = parseFloat(hcpEl?.value) || 0;
    const result = await Sync.apiFetch('event/add-player', 'POST', { name, handicapIndex: hi });
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate(30);
      toast(name + ' added');
      nameEl.value = '';
      if (hcpEl) hcpEl.value = '';
      syncFromServer();
    } else {
      toast(result?.error || 'Failed to add player');
    }
  },

  async pasteImportPlayers() {
    const input = document.getElementById('paste-players-input');
    const status = document.getElementById('paste-import-status');
    if (!input || !input.value.trim()) { toast('Paste player names first'); return; }
    const raw = input.value.trim();
    // Send as CSV to the bulk-import-players endpoint
    const result = await Sync.apiFetch('event/bulk-import-players', 'POST', { csv: raw });
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate(30);
      const msg = result.added + ' player' + (result.added !== 1 ? 's' : '') + ' imported' + (result.skipped > 0 ? ', ' + result.skipped + ' skipped' : '');
      toast(msg);
      if (status) status.textContent = msg;
      input.value = '';
      syncFromServer();
    } else {
      toast(result?.error || 'Import failed');
    }
  },

  async inviteCoAdmin() {
    const input = document.getElementById('co-admin-email');
    if (!input || !input.value.trim()) return;
    const result = await Sync.apiFetch('event/invite-admin', 'POST', { email: input.value.trim() });
    if (result?.ok) {
      toast('Co-organizer invited: ' + result.email);
      input.value = '';
      syncFromServer();
    } else {
      toast(result?.error || 'Invite failed');
    }
  },

  async toggleGame(gameId) {
    const games = { ...(state._config?.games || {}) };
    games[gameId] = !games[gameId];
    const result = await Sync.apiFetch('event/update-games', 'POST', { games });
    if (result?.ok) {
      state._config.games = games;
      if (navigator.vibrate) navigator.vibrate(30);
      toast(games[gameId] ? gameId + ' enabled' : gameId + ' disabled');
      route();
    } else {
      toast('Failed to update games');
    }
  },

  async updateStakesQuick(type, amount) {
    const structure = {};
    if (type === 'nassau') structure.nassauBet = amount;
    else if (type === 'skins') structure.skinsBet = amount;
    const result = await Sync.apiFetch('event/update-games', 'POST', { structure });
    if (result?.ok) {
      if (state._config?.structure) {
        if (type === 'nassau') state._config.structure.nassauBet = amount;
        if (type === 'skins') state._config.structure.skinsBet = amount;
      }
      if (navigator.vibrate) navigator.vibrate(30);
      toast(`${type.charAt(0).toUpperCase() + type.slice(1)} set to $${amount}`);
      route();
    }
  },

  async updateStakes() {
    const nassau = parseInt(document.getElementById('stakes-nassau')?.value) || 10;
    const skins = parseInt(document.getElementById('stakes-skins')?.value) || 5;
    const result = await Sync.apiFetch('event/update-games', 'POST', {
      structure: { nassauBet: nassau, skinsBet: skins }
    });
    if (result?.ok) {
      if (state._config?.structure) {
        state._config.structure.nassauBet = nassau;
        state._config.structure.skinsBet = skins;
      }
      toast('Stakes updated');
    }
  },

  async getAIGameAdvice() {
    const container = document.getElementById('ai-game-advice');
    if (!container) return;
    container.innerHTML = '<div style="font-size:13px;color:var(--mg-text-muted)">Thinking...</div>';
    try {
      const result = await fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        slug: state._slug,
        players: (state._config?.players || []).map(p => ({ name: p.name, hi: p.handicapIndex })),
        type: state._config?.event?.eventType || 'trip',
      })}).then(r => r.json());
      const advice = result?.advice;
      if (advice) {
        container.innerHTML = `<div style="padding:14px;background:rgba(212,175,55,.04);border:1.5px solid var(--mg-gold);border-radius:10px">
          <div style="font-size:15px;font-weight:700;color:var(--mg-gold-dim);margin-bottom:6px">${advice.recommended_format || 'Nassau + Skins'}</div>
          <div style="font-size:13px;color:var(--mg-text);line-height:1.6;margin-bottom:8px">${advice.reasoning || ''}</div>
          ${advice.stakes ? `<div style="font-size:12px;color:var(--mg-text-muted)">Stakes: ${advice.stakes}</div>` : ''}
          ${advice.handicap_advice ? `<div style="font-size:12px;color:var(--mg-text-muted);margin-top:4px">${advice.handicap_advice}</div>` : ''}
          ${advice.fun_tip ? `<div style="font-size:12px;color:var(--mg-gold-dim);margin-top:6px;font-style:italic">${advice.fun_tip}</div>` : ''}
        </div>`;
      } else {
        // Fallback: recommend based on handicaps
        const players = state._config?.players || [];
        const his = players.map(p => p.handicapIndex || 0);
        const spread = Math.max(...his) - Math.min(...his);
        const n = players.length;
        let rec = 'Nassau + Skins';
        let why = '';
        if (n === 3) { rec = '3-Player 9s + Skins'; why = 'Perfect for a threesome. 9s keeps all three players competing every hole.'; }
        else if (n === 4 && spread < 5) { rec = 'Nassau + Skins + Wolf'; why = 'Similar handicaps — Wolf adds strategy. Nassau gives structure. Skins for the hero shots.'; }
        else if (n === 4 && spread >= 5) { rec = 'Nassau + Stableford'; why = 'Big handicap spread — Stableford prevents blowouts. Nassau keeps it structured.'; }
        else if (n >= 5) { rec = 'Skins + Stableford'; why = 'Large group — Skins keeps everyone engaged. Stableford equalizes the field.'; }
        else { rec = 'Nassau + Skins'; why = 'The classic combo. Front, back, overall, plus per-hole pots.'; }
        container.innerHTML = `<div style="padding:14px;background:rgba(212,175,55,.04);border:1.5px solid var(--mg-gold);border-radius:10px">
          <div style="font-size:15px;font-weight:700;color:var(--mg-gold-dim);margin-bottom:6px">${rec}</div>
          <div style="font-size:13px;color:var(--mg-text);line-height:1.6">${why}</div>
          <div style="font-size:11px;color:var(--mg-text-muted);margin-top:6px">Handicap spread: ${spread.toFixed(1)} strokes across ${n} players</div>
        </div>`;
      }
    } catch {
      // Fallback when completely offline or API down
      const players = state._config?.players || [];
      const n = players.length;
      const rec = n === 3 ? '3-Player 9s + Skins' : n >= 5 ? 'Skins + Stableford' : 'Nassau + Skins + Wolf';
      container.innerHTML = `<div style="padding:12px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px">
        <div style="font-size:14px;font-weight:700;color:var(--mg-text)">${rec}</div>
        <div style="font-size:12px;color:var(--mg-text-muted);margin-top:4px">Recommended for ${n} players</div>
      </div>`;
    }
  },

  async sendEmoji(emoji) {
    const player = state.bettorName || 'Anonymous';
    const result = await Sync.postChirp(player, '', emoji);
    if (result && result.ok) {
      state._feed.unshift(result.item);
      route();
    }
  },

  // ── Scorecard Scanner (AI OCR) ──
  async scanScorecard(file) {
    if (!file) return;
    toast('Scanning scorecard...');

    const resultsDiv = document.getElementById('scan-results');
    if (resultsDiv) {
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = '<div class="mg-card" style="padding:16px;text-align:center"><div style="font-size:13px;color:var(--mg-text-muted)">AI is reading the scorecard...</div></div>';
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`/${state._slug}/api/scan-scorecard`, {
        method: 'POST',
        headers: { 'X-Admin-Token': sessionStorage.getItem('mg_admin_token') || '' },
        body: formData,
      });
      const data = await res.json();

      if (data.ok && data.scores) {
        const holes = Object.keys(data.scores).sort((a, b) => parseInt(a) - parseInt(b));
        const players = state._config?.players || [];

        let preview = `<div class="mg-card" style="padding:16px">
          <div style="font-size:14px;font-weight:700;color:var(--mg-gold-dim);margin-bottom:4px">Scores Extracted</div>
          <div style="font-size:12px;color:var(--mg-text-muted);margin-bottom:12px">Confidence: ${data.confidence || 'unknown'}${data.notes ? ' \u2014 ' + data.notes : ''}</div>
          <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
            <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'SF Mono',monospace">
              <tr style="border-bottom:1px solid var(--mg-border)">
                <th style="text-align:left;padding:4px;font-size:10px;color:var(--mg-text-muted)">Hole</th>
                ${holes.map(h => '<th style="text-align:center;padding:4px;min-width:24px">' + h + '</th>').join('')}
              </tr>`;

        players.forEach(p => {
          preview += `<tr style="border-bottom:1px solid var(--mg-border)">
            <td style="padding:4px;font-weight:600;font-size:11px;white-space:nowrap">${p.name.split(' ')[0]}</td>
            ${holes.map(h => '<td style="text-align:center;padding:4px;font-weight:600">' + (data.scores[h]?.[p.name] ?? '-') + '</td>').join('')}
          </tr>`;
        });

        preview += `</table></div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button onclick="window.MG.applyScanScores()" class="mg-btn mg-btn-gold" style="flex:1">Apply All Scores</button>
            <button onclick="document.getElementById('scan-results').style.display='none'" style="flex:1;padding:10px;background:var(--mg-surface);border:1.5px solid var(--mg-border);border-radius:8px;font-size:13px;font-weight:600;color:var(--mg-text-muted);cursor:pointer">Cancel</button>
          </div>
        </div>`;

        if (resultsDiv) resultsDiv.innerHTML = preview;
        state._scannedScores = data.scores;
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      } else {
        if (resultsDiv) resultsDiv.innerHTML = `<div class="mg-card" style="padding:16px"><div style="color:var(--mg-loss)">Could not read scorecard. ${data.raw ? 'AI response: ' + data.raw.slice(0, 200) : data.parseError || 'Try again.'}</div></div>`;
      }
    } catch (e) {
      if (resultsDiv) resultsDiv.innerHTML = `<div class="mg-card" style="padding:16px"><div style="color:var(--mg-loss)">Scan failed: ${e.message}</div></div>`;
    }
    // Reset file input so same file can be re-selected
    const cam = document.getElementById('scorecard-camera');
    if (cam) cam.value = '';
  },

  async applyScanScores() {
    const scores = state._scannedScores;
    if (!scores) { toast('No scanned scores'); return; }

    const holes = Object.keys(scores).sort((a, b) => parseInt(a) - parseInt(b));
    let applied = 0;

    for (const hole of holes) {
      const holeScores = scores[hole];
      if (!holeScores || Object.keys(holeScores).length === 0) continue;
      try {
        await Sync.submitHoleScores(parseInt(hole), holeScores);
        applied++;
      } catch (e) {
        console.error('Failed to submit hole', hole, e);
      }
    }

    toast(applied + ' holes saved');
    state._scannedScores = null;
    document.getElementById('scan-results').style.display = 'none';
    if (navigator.vibrate) navigator.vibrate(30);
    syncFromServer();
  },

  // ── Round Manager ──
  async startNextRound(roundNumber, course, courseId) {
    const c = course || state._nextRoundCourse || '';
    const cId = courseId || state._nextRoundCourseId || '';
    if (!confirm('Start Round ' + roundNumber + '? This archives current scores and resets the scorecard.')) return;
    const result = await Sync.apiFetch('event/start-round', 'POST', { roundNumber, course: c, courseId: cId });
    if (result?.ok) {
      if (navigator.vibrate) navigator.vibrate([30, 80, 30]);
      toast('Round ' + roundNumber + ' started!');
      state._nextRoundCourse = null;
      state._nextRoundCourseId = null;
      syncFromServer();
    } else {
      toast(result?.error || 'Failed to start round');
    }
  },

  async searchNextRoundCourse(query) {
    if (query.length < 2) return;
    try {
      const res = await fetch('/api/courses/search?q=' + encodeURIComponent(query));
      const courses = await res.json();
      const container = document.getElementById('next-round-results');
      if (!container) return;
      container.innerHTML = courses.slice(0, 5).map(c =>
        `<button onclick="window.MG.selectNextRoundCourse('${(c.club_name || '').replace(/'/g, "\\'")}', '${c.id}')"
          style="display:block;width:100%;text-align:left;padding:10px;margin-top:4px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:6px;cursor:pointer;font-size:13px;color:var(--mg-text)">
          <div style="font-weight:600">${c.club_name || ''}</div>
          <div style="font-size:11px;color:var(--mg-text-muted)">${c.location || ''}</div>
        </button>`
      ).join('');
    } catch {}
  },

  selectNextRoundCourse(name, id) {
    const input = document.getElementById('next-round-course');
    if (input) input.value = name;
    document.getElementById('next-round-results').innerHTML = '';
    state._nextRoundCourse = name;
    state._nextRoundCourseId = id;
  },

  async layAction(playerName) {
    if (navigator.vibrate) navigator.vibrate(30);
    const pnl = state._gameState ? 'their current P&L' : '$0';

    // Simple prompt-based side bet (can be upgraded to modal later)
    const amount = prompt(`Side bet on ${playerName}\nEnter amount ($5, $10, $20):`);
    if (!amount || isNaN(parseInt(amount))) return;
    const amtNum = parseInt(amount);
    if (amtNum <= 0 || amtNum > 100) { window.MG.toast('Invalid amount'); return; }

    try {
      await Sync.createProp({
        type: 'side_bet',
        description: `Side action: ${playerName} over/under — $${amtNum}`,
        amount: amtNum,
        creator: state.bettorName || 'Spectator',
        parties: [playerName],
        roundNumber: state._config?.event?.currentRound || 1
      });
      window.MG.toast(`Side bet on ${playerName} posted!`);
      await syncFromServer();
    } catch(e) {
      window.MG.toast('Bet failed — try again');
    }
  },

  // Odds bet slip removed — use quickSideBet instead

  // ── Calcutta Auction ──
  async calcuttaStart() {
    const result = await Sync.apiFetch('calcutta/start', 'POST');
    if (result?.ok) { toast('Auction started!'); await syncFromServer(); route(); }
    else toast(result?.error || 'Failed to start auction');
  },

  async calcuttaQuickBid(amount) {
    const bidderEl = document.getElementById('calcutta-bidder');
    const bidder = bidderEl?.value?.trim() || state.bettorName || '';
    if (!bidder) { toast('Enter your name'); bidderEl?.focus(); return; }
    state._calcuttaBidder = bidder;
    const teamId = state._calcutta?.currentTeam;
    if (!teamId) { toast('No team being auctioned'); return; }
    const result = await Sync.apiFetch('calcutta/bid', 'POST', { teamId, bidder, amount });
    if (result?.ok) { toast(`Bid: $${amount}`); await syncFromServer(); route(); }
    else toast(result?.error || 'Bid failed');
  },

  async calcuttaPlaceBid() {
    const bidderEl = document.getElementById('calcutta-bidder');
    const amountEl = document.getElementById('calcutta-amount');
    const bidder = bidderEl?.value?.trim() || state.bettorName || '';
    const amount = parseInt(amountEl?.value);
    if (!bidder) { toast('Enter your name'); bidderEl?.focus(); return; }
    if (!amount || amount <= 0) { toast('Enter a bid amount'); amountEl?.focus(); return; }
    state._calcuttaBidder = bidder;
    const teamId = state._calcutta?.currentTeam;
    if (!teamId) { toast('No team being auctioned'); return; }
    const result = await Sync.apiFetch('calcutta/bid', 'POST', { teamId, bidder, amount });
    if (result?.ok) { toast(`Bid: $${amount}`); if (amountEl) amountEl.value = ''; await syncFromServer(); route(); }
    else toast(result?.error || 'Bid failed');
  },

  async calcuttaSold() {
    const teamId = state._calcutta?.currentTeam;
    if (!teamId) return;
    const result = await Sync.apiFetch('calcutta/sold', 'POST', { teamId });
    if (result?.ok) { toast(`SOLD to ${result.winner} for $${result.amount}!`); await syncFromServer(); route(); }
    else toast(result?.error || 'Failed');
  },

  async calcuttaNext() {
    const result = await Sync.apiFetch('calcutta/next', 'POST');
    if (result?.ok) {
      if (result.status === 'complete') toast('Auction complete!');
      else toast(`Now bidding: ${result.currentTeam}`);
      await syncFromServer(); route();
    } else toast(result?.error || 'Failed');
  },

  async calcuttaReset() {
    const result = await Sync.apiFetch('calcutta/reset', 'POST');
    if (result?.ok) { toast('Auction reset'); await syncFromServer(); route(); }
    else toast(result?.error || 'Failed');
  },

  // ─── ODDS BET SLIP FUNCTIONS ───

  // Open odds bet slip for tappable odds
  openOddsBetSlip(player, betType, odds) {
    state._oddsBetSlip = {
      player: player,
      betType: betType,
      odds: odds
    };
    state._oddsBetSlipAmount = 10; // Default bet amount

    // Haptic feedback for opening bet slip
    if (navigator.vibrate) navigator.vibrate(30);

    refresh();

    // Scroll to make bet slip visible
    setTimeout(() => {
      const slip = document.querySelector('[data-odds-bet-slip]');
      if (slip && window.innerHeight < document.body.scrollHeight) {
        slip.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100);
  },

  setOddsBetAmount(amount) {
    state._oddsBetSlipAmount = parseInt(amount) || 0;
    refresh();
  },

  closeOddsBetSlip() {
    delete state._oddsBetSlip;
    delete state._oddsBetSlipAmount;
    refresh();
  },

  async placeOddsBet() {
    const slip = state._oddsBetSlip;
    const amount = state._oddsBetSlipAmount;

    if (!slip || !amount || amount <= 0) return;

    // Bet confirmation ceremony - enhanced haptic feedback
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const betData = {
      type: slip.betType === 'to_win' ? 'player_winner' : 'head_to_head',
      selection: slip.player,
      stake: amount,
      odds: parseFloat(slip.odds.replace('+', '')) / 100,
      americanOdds: slip.odds,
      description: slip.betType === 'to_win'
        ? `${slip.player} to win`
        : `${slip.player} head-to-head`,
      bettor: state.bettorName
    };

    // Visual ceremony - add gold pulse animation to button
    const button = document.querySelector('[onclick="window.MG.placeOddsBet()"]');
    if (button) {
      button.classList.add('bet-placed');
      button.style.transform = 'scale(1.02)';
      button.style.boxShadow = '0 0 20px rgba(212,175,55,0.4)';
    }

    // Ticket stamp animation
    showTicketStampAnimation(amount);

    // Update bet tally counter
    incrementBetTally(amount);

    try {
      const result = await Sync.submitBet(betData);
      if (result) {
        placeBet(state, betData);
        toast(`$${amount} bet placed on ${slip.player}!`);

        // Clean up visual effects
        if (button) {
          setTimeout(() => {
            button.classList.remove('bet-placed');
            button.style.transform = '';
            button.style.boxShadow = '';
          }, 500);
        }
      } else {
        // Queue for offline
        const pending = JSON.parse(sessionStorage.getItem('mg_pending_bets') || '[]');
        pending.push(betData);
        sessionStorage.setItem('mg_pending_bets', JSON.stringify(pending));
        toast("Bet saved — will submit when online");
      }
    } catch (error) {
      toast("Bet failed — try again");
      console.error('Bet placement error:', error);
    }

    // Close the slip
    this.closeOddsBetSlip();
    persist();
    refresh();
  }
};

// #4: Persist bet slip to sessionStorage
function saveBetSlip() {
  sessionStorage.setItem('mg_betslip', JSON.stringify(state._betSlip || []));
}

// ─── BET CONFIRMATION CEREMONY HELPERS ───

// Ticket stamp animation for bet placement
function showTicketStampAnimation(amount) {
  const stamp = document.createElement('div');
  stamp.className = 'ticket-stamp';
  stamp.innerHTML = `BET PLACED<br>$${amount}`;

  document.body.appendChild(stamp);

  // Remove after animation completes
  setTimeout(() => {
    if (stamp.parentNode) {
      stamp.parentNode.removeChild(stamp);
    }
  }, 1000);
}

// Running bet tally counter
let betTallyTotal = 0;
let betTallyElement = null;

function initializeBetTally() {
  if (!betTallyElement) {
    betTallyElement = document.createElement('div');
    betTallyElement.className = 'bet-tally-counter';
    betTallyElement.innerHTML = '🎰 $0 staked';
    document.body.appendChild(betTallyElement);
  }

  // Load saved tally from session
  const saved = sessionStorage.getItem('mg_bet_tally');
  if (saved) {
    betTallyTotal = parseInt(saved) || 0;
    updateBetTallyDisplay();
  }
}

function incrementBetTally(amount) {
  betTallyTotal += amount;

  // Save to session
  sessionStorage.setItem('mg_bet_tally', betTallyTotal.toString());

  // Initialize if needed
  if (!betTallyElement) {
    initializeBetTally();
  }

  // Animate update
  betTallyElement.classList.add('animate');
  updateBetTallyDisplay();

  setTimeout(() => {
    betTallyElement.classList.remove('animate');
  }, 600);
}

function updateBetTallyDisplay() {
  if (betTallyElement) {
    betTallyElement.innerHTML = `🎰 $${betTallyTotal.toLocaleString()} staked`;

    // Hide if zero
    if (betTallyTotal === 0) {
      betTallyElement.style.display = 'none';
    } else {
      betTallyElement.style.display = 'block';
    }
  }
}

// Initialize bet tally on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBetTally);
} else {
  initializeBetTally();
}

// Demo auto-simulation for live sportsbook feel
let demoSimTimer = null;

function startDemoAutoSimulation(slug) {
  // Only run on demo pages
  const isDemoPage = ['demo-buddies', 'demo-scramble', 'legends-trip', 'stag-night', 'augusta-scramble', 'masters-member-guest'].includes(slug);
  if (!isDemoPage) return;

  console.log('[waggle] Starting auto-simulation for demo:', slug);

  // Stop any existing timer
  if (demoSimTimer) {
    clearInterval(demoSimTimer);
  }

  // Run simulation every 8 seconds with 60% activity chance
  demoSimTimer = setInterval(() => {
    if (Math.random() > 0.6) return; // Skip 40% of cycles for realistic pacing
    generateDemoActivity(slug);
  }, 8000);

  // Initialize feed with sample content immediately
  initializeDemoFeed(slug);

  // Generate initial activity after 3 seconds
  setTimeout(() => generateDemoActivity(slug), 3000);
}

function generateDemoActivity(slug) {
  if (!state?._config?.players) return;

  const players = state._config.players;
  const eventType = Math.random();

  if (eventType < 0.25) {
    // Generate fake bet placement (25% chance)
    generateFakeBet(players, slug);
  } else if (eventType < 0.45) {
    // Generate score update (20% chance)
    generateScoreUpdate(players, slug);
  } else if (eventType < 0.65) {
    // Generate odds movement (20% chance)
    generateOddsMovement(players, slug);
  } else if (eventType < 0.8) {
    // Generate press event (15% chance)
    generatePressEvent(players, slug);
  } else {
    // Generate trash talk/chirp (20% chance)
    generateFakeChirp(players, slug);
  }
}

function generateFakeBet(players, slug) {
  const player = players[Math.floor(Math.random() * players.length)];
  const betTypes = [
    'Nassau Front 9', 'Nassau Back 9', 'Nassau Overall',
    'Skins', 'Wolf', 'Vegas', 'Bingo Bango Bongo',
    'Closest to Pin', 'Long Drive', 'Greenies',
    'Match Play', 'Low Ball', 'High Ball',
    'Best Ball', 'Scramble', 'Stableford'
  ];
  const betType = betTypes[Math.floor(Math.random() * betTypes.length)];
  const amounts = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  const amount = amounts[Math.floor(Math.random() * amounts.length)];

  const feedItem = {
    id: 'demo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    type: 'bet',
    player: player.name,
    text: `placed a $${amount} ${betType} bet`,
    emoji: '💰',
    timestamp: Date.now(),
    createdAt: new Date().toISOString()
  };

  // Add to feed with realistic styling
  state._feed.unshift(feedItem);

  // Limit feed to 50 items to prevent memory bloat
  if (state._feed.length > 50) {
    state._feed = state._feed.slice(0, 50);
  }

  // Re-render current view to show new activity
  route();
}

function generateScoreUpdate(players, slug) {
  const player = players[Math.floor(Math.random() * players.length)];
  const scoreEvents = [
    'sank a 20-footer for birdie',
    'chipped in for eagle',
    'made a clutch par putt',
    'holed out from the bunker',
    'drained a 30-foot putt',
    'hit it stiff from 150 yards',
    'made an impossible recovery shot',
    'sank the birdie putt',
    'rolled in a 15-footer for par',
    'made birdie from the rough',
    'stuck it to 3 feet on a par 3',
    'bombed a 320-yard drive',
    'made bogey after a terrible tee shot',
    'saved par with a 40-foot putt',
    'aced the par 3 7th hole!',
    'skulled it over the green',
    'found the water on 18',
    'made double bogey',
    'recovered with a chip-in birdie',
    'birdied three holes in a row',
    'made par after hitting it in the trees',
    'stuck the approach to 2 feet',
    'drained a slider for par',
    'hit it OB and took a penalty',
    'made a miracle up and down',
    'lipped out for eagle',
    'made the turn at -2',
    'carded a 76 on the front 9',
    'shot 39 on the back nine',
    'finished with a birdie'
  ];

  const scoreEvent = scoreEvents[Math.floor(Math.random() * scoreEvents.length)];

  const feedItem = {
    id: 'demo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    type: 'score',
    player: player.name,
    text: scoreEvent,
    emoji: '🏌️',
    timestamp: Date.now(),
    createdAt: new Date().toISOString()
  };

  state._feed.unshift(feedItem);

  if (state._feed.length > 50) {
    state._feed = state._feed.slice(0, 50);
  }

  route();
}

function generateFakeChirp(players, slug) {
  const player = players[Math.floor(Math.random() * players.length)];
  const chirps = [
    'Ice in the veins',
    'That\'s how it\'s done!',
    'Reading these greens like a book',
    'Money in the bank',
    'Pressure makes diamonds',
    'Pure stroke',
    'Can\'t buy a putt today',
    'Golf is hard',
    'Lucky bounce!',
    'Time to press',
    'Momentum shift',
    'Getting hot out here',
    'Dialed in today',
    'Putting like a machine',
    'Course knowledge pays off',
    'That pin was made for me',
    'Nerves of steel',
    'Lucky horseshoe today',
    'Should have stayed in the cart',
    'Swing looking smooth',
    'Pin hunting mode activated',
    'Feeling dangerous today',
    'Cart path bounce for the win',
    'Reading the wind like a pro',
    'Channeling Tiger right now',
    'GPS says 147, hitting 9 iron',
    'Greens are rolling true today',
    'Playing the percentages',
    'Risk vs reward paying off',
    'Short game is money today',
    'Driver is finding fairways',
    'Irons are dialed in',
    'Putting stroke is pure',
    'Playing within myself',
    'Course management 101',
    'Weather is perfect for golf',
    'Pin positions are fair today',
    'Rough isn\'t too penal',
    'Greens have good pace',
    'Wind is helping on this hole'
  ];

  const chirp = chirps[Math.floor(Math.random() * chirps.length)];
  const emojis = ['🔥', '💪', '⛳', '❄️', '👑', '💎', '🎯'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const feedItem = {
    id: 'demo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    type: 'chirp',
    player: player.name,
    text: chirp,
    emoji: emoji,
    timestamp: Date.now(),
    createdAt: new Date().toISOString()
  };

  state._feed.unshift(feedItem);

  if (state._feed.length > 50) {
    state._feed = state._feed.slice(0, 50);
  }

  route();
}

function generateOddsMovement(players, slug) {
  const player = players[Math.floor(Math.random() * players.length)];
  const betTypes = ['Nassau Front 9', 'Nassau Back 9', 'Nassau Overall', 'Skins', 'Wolf', 'Match Play', 'Low Ball', 'Closest to Pin'];
  const betType = betTypes[Math.floor(Math.random() * betTypes.length)];

  // Simulate odds movement - more realistic ranges
  const movements = [
    { direction: 'up', text: 'odds lengthened', emoji: '📈', color: 'red' },
    { direction: 'down', text: 'odds shortened', emoji: '📉', color: 'green' },
    { direction: 'hot', text: 'odds moving fast', emoji: '🔥', color: 'gold' }
  ];
  const movement = movements[Math.floor(Math.random() * movements.length)];

  const oldOdds = ['+150', '+200', '+250', '+300', '+350', '+400', '-110', '-120', '-150', '-200'];
  const newOdds = ['+120', '+180', '+220', '+280', '+320', '+450', '-105', '-115', '-140', '-180'];
  const oldOdd = oldOdds[Math.floor(Math.random() * oldOdds.length)];
  const newOdd = newOdds[Math.floor(Math.random() * newOdds.length)];

  const feedItem = {
    id: 'demo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    type: 'odds',
    player: 'System',
    text: `${betType} for ${player.name}: ${oldOdd} → ${newOdd}`,
    emoji: movement.emoji,
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    oddsMovement: movement.direction,
    betType: betType,
    targetPlayer: player.name
  };

  state._feed.unshift(feedItem);

  if (state._feed.length > 50) {
    state._feed = state._feed.slice(0, 50);
  }

  // Trigger visual feedback for odds movement
  triggerOddsMovementAnimation(movement.direction, betType);

  route();
}

function generatePressEvent(players, slug) {
  const player = players[Math.floor(Math.random() * players.length)];
  const pressTypes = [
    'Nassau press on back 9',
    'Automatic press activated',
    'Side bet press',
    'Match play press',
    'Wolf press',
    'Skins press'
  ];
  const pressType = pressTypes[Math.floor(Math.random() * pressTypes.length)];

  const pressAmounts = [20, 25, 30, 40, 50, 75, 100];
  const amount = pressAmounts[Math.floor(Math.random() * pressAmounts.length)];

  const feedItem = {
    id: 'demo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    type: 'press',
    player: player.name,
    text: `initiated ${pressType} for $${amount}`,
    emoji: '⚡',
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    amount: amount,
    pressType: pressType
  };

  state._feed.unshift(feedItem);

  if (state._feed.length > 50) {
    state._feed = state._feed.slice(0, 50);
  }

  // Add haptic feedback if available
  if (navigator.vibrate) {
    navigator.vibrate([50, 100, 50]);
  }

  route();
}

function initializeDemoFeed(slug) {
  if (!state?._config?.players || state._feed.length > 0) return;

  const players = state._config.players;
  const initialContent = [
    {
      type: 'score',
      player: players[0]?.name || 'Player 1',
      text: 'made birdie on hole 3',
      emoji: '🏌️',
      timestamp: Date.now() - 180000 // 3 minutes ago
    },
    {
      type: 'odds',
      player: 'System',
      text: `Nassau Overall for ${players[1]?.name || 'Player 2'}: +200 → +175`,
      emoji: '📉',
      timestamp: Date.now() - 120000 // 2 minutes ago
    },
    {
      type: 'bet',
      player: players[2]?.name || 'Player 3',
      text: 'placed a $25 Skins bet',
      emoji: '💰',
      timestamp: Date.now() - 60000 // 1 minute ago
    }
  ];

  initialContent.forEach((content, index) => {
    const feedItem = {
      id: 'demo-init-' + Date.now() + '-' + index,
      type: content.type,
      player: content.player,
      text: content.text,
      emoji: content.emoji,
      timestamp: content.timestamp,
      createdAt: new Date(content.timestamp).toISOString()
    };
    state._feed.push(feedItem);
  });

  route(); // Re-render to show initial content
}

function triggerOddsMovementAnimation(direction, betType) {
  // Find odds buttons and add flash animation based on movement direction
  setTimeout(() => {
    const oddsButtons = document.querySelectorAll('.odds-btn, .bet-odd, [class*="odd"]');
    oddsButtons.forEach(btn => {
      if (Math.random() < 0.3) { // Only animate some odds for realism
        btn.classList.add(direction === 'down' ? 'odds-flash-green' : 'odds-flash-red');
        setTimeout(() => {
          btn.classList.remove('odds-flash-green', 'odds-flash-red');
        }, 1500);
      }
    });
  }, 100);
}

// Boot
bootstrap().catch(e => console.error('Bootstrap failed:', e));
