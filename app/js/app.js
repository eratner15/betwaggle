// Golf Event App Shell — config-driven, multi-tenant
import { generateMatches, loadConfig } from './data.js';
import { init, save, load, reset, queueMutation, getPendingMutations, clearMutation } from './storage.js';
import { placeBet, settleBets, setOddsOverrides, setLockedMatches, getMatchMoneyline, setConfig as setBettingConfig } from './betting.js';
import {
  renderDashboard, renderRoundFeed, renderFlightsList, renderFlight, renderTeam,
  renderAdmin, renderBetting, renderMyBets, renderCalcutta,
  renderShootout, renderScorecard, renderCasualScorecard, renderNamePickerModal,
  renderScoreEntryOverlay, renderSettlement, renderScenarios, calcStandings, initViews
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
  console.info('[waggle] slug=%s eventType=%s roundMode=%s', slug, _et, isRoundMode);

  const matches = generateMatches(config);
  state = await init(matches, slug);
  state._config = config;

  // Transient UI state (not persisted)
  state._adminFlight = state._adminFlight || config.flightOrder[0];
  state._adminRound = state._adminRound || 1;
  state._betTab = "matches";
  // #4: Restore bet slip from sessionStorage
  state._betSlip = JSON.parse(sessionStorage.getItem('mg_betslip') || '[]');
  state._adminTab = isRoundMode ? "scorecard" : "takebet"; // round mode defaults to score entry
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
  state._cashBetModal = null; // cash bet entry modal {desc, amount} or null
  state._scoreModal = null;  // player score entry modal {hole, scores} or null
  state._feed = [];           // activity feed items from server
  state._disputes = [];       // open/resolved score disputes
  // Scenario / What-If state (transient)
  state._scenario = {
    flightId: config.flightOrder?.[0] || null,
    simResults: {},  // { matchId: { scoreA, scoreB } }
  };

  // Restore admin auth from session token
  if (Sync.isAdminAuthed()) {
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

  // Auto-sync every 30s
  syncTimer = setInterval(syncFromServer, 30000);

  // Update connectivity indicator every 5s
  setInterval(updateConnectivityIndicator, 5000);
}

// Pull latest from server (scores, announcements, all bets)
async function syncFromServer() {
  try {
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

    // Sync season data if this event is part of a season
    const seasonId = state._config?.seasonId;
    if (seasonId && !state._seasonData) {
      const sd = await Sync.apiFetch(`season/${seasonId}`);
      if (sd) state._seasonData = sd;
    }

    // Flush pending mutations from offline queue
    await flushMutationQueue();

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

  let html = "";
  switch (view) {
    case "dashboard":
      // Round mode (quick / buddies_trip) gets the live feed; MG gets tournament dashboard
      html = isRoundMode ? renderRoundFeed(state) : renderDashboard(state);
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

  // Overlay name picker for round mode until player identifies themselves
  if (isRoundMode && !state.bettorName) {
    html += renderNamePickerModal(state);
  }
  // Overlay score entry modal if open (persists across tab switches)
  if (isRoundMode && state._scoreModal) {
    html += renderScoreEntryOverlay(state);
  }

  app.innerHTML = `<div class="mg-content">${html}</div>`;
  updateNav(view);

  // Auto-dismiss full-screen hole flash overlay after 5 seconds
  const flashOverlay = document.getElementById('hole-flash-overlay');
  if (flashOverlay) {
    clearTimeout(window._flashDismissTimer);
    window._flashDismissTimer = setTimeout(() => {
      const el = document.getElementById('hole-flash-overlay');
      if (el) {
        el.style.animation = 'flashOut 0.3s ease forwards';
        setTimeout(() => el?.remove(), 300);
      }
    }, 5000);
  }
}

function updateNav(view) {
  const games = state?._config?.games || {};
  const hasGames = Object.values(games).some(Boolean);

  document.querySelectorAll(".mg-nav a").forEach(a => {
    const tab = a.dataset.tab;
    const label = a.querySelector('.nav-label');

    // Active state
    a.classList.toggle("active",
      tab === view ||
      (tab === "dashboard" && (view === "flight" || view === "team")) ||
      (tab === "flights" && view === "flights") ||
      (tab === "scenarios" && view === "scenarios")
    );

    if (isRoundMode) {
      // Round mode: Feed · Scorecard · Bet · My Bets · Score  (Flights + Settle hidden)
      if (tab === "flights" || tab === "settle") {
        a.style.display = 'none';
      } else {
        a.style.display = '';
      }
      // Relabel for round context
      if (label) {
        if (tab === "dashboard") label.textContent = "Feed";
        if (tab === "admin") label.textContent = "Score";
      }
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
        if (tab === "dashboard") label.textContent = "Home";
        if (tab === "admin") label.textContent = "Admin";
      }
    }
  });
}

// Toast
function toast(msg) {
  const el = document.getElementById("mg-toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
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
  delete toSave._playerFilter;
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

  // Admin
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
    // Pre-fill existing scores if already entered
    const existing = state._holes?.[state._scorecardHole];
    if (existing) state._scorecardScores = { ...existing };
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
      toast('Dispute filed — commissioner will review');
      syncFromServer();
    } else {
      toast('Failed to file dispute');
    }
  },

  // ─── Settlement Card ───
  shareSettlement() {
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

    // Payments
    if (pairs.length > 0) {
      lines.push('\u{1F4B8} SETTLE UP');
      lines.push('\u2500'.repeat(24));
      pairs.forEach(({ from, to, amount }) => {
        lines.push(`   ${from} \u2192 ${to}:  $${amount}`);
      });
      lines.push('');
    }

    // Footer
    lines.push('\u2500'.repeat(24));
    lines.push(`Powered by Waggle \u26F3`);
    lines.push(url);

    const text = lines.join('\n');

    if (navigator.share) {
      // Try sharing with the canvas image if available
      const tryShareWithImage = async () => {
        try {
          // Quick check if exportSettlementCard can give us a blob
          if (typeof window.MG.exportSettlementCard === 'function') {
            // Share text only for now — image export is a separate button
          }
        } catch {}
        return navigator.share({ title: `${eventName} \u2014 Settlement`, text });
      };
      tryShareWithImage().catch(() => {
        navigator.clipboard?.writeText(text).then(() => toast('Results copied!')).catch(() => {});
      });
    } else {
      navigator.clipboard?.writeText(text).then(() => toast('Results copied to clipboard!')).catch(() => toast(url));
    }
  },

  // ─── Export Settlement Card as Image ───
  exportSettlementCard() {
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
    ctx.font = '700 24px Georgia, "Playfair Display", serif';
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

    ctx.font = 'bold 20px Georgia, "Playfair Display", serif';
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

      // Try native share (mobile)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: eventName + ' — Waggle' });
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

  async pressNassau(player, segment, startHole) {
    const result = await Sync.submitNassauPress(player, segment, startHole);
    if (result?.ok) {
      toast(`Press declared: ${player} pressed ${segment} from H${startHole}`);
      await syncFromServer();
      refresh();
    } else {
      toast('Press failed — check connection');
    }
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

    const result = await Sync.submitBet(betData);
    if (result) {
      state.bets.push(result);
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
    if (!name || !name.trim()) return;
    state.bettorName = name.trim();
    state._playerFilter = '';
    refresh();
  },
  setNameInput(v) {
    state._nameInput = v;
  },

  editBettorName() {
    state.bettorName = null;
    state._playerCredits = null;
    state._playerFilter = '';
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
      state._scoreModal.scores[player] = n;
    } else if (val === '' || val === null) {
      delete state._scoreModal.scores[player];
    }
    // Defer refresh so input doesn't lose focus mid-typing
    clearTimeout(window._scoreRefreshTimer);
    window._scoreRefreshTimer = setTimeout(() => refresh(), 400);
  },
  async submitScoreModal() {
    if (!state._scoreModal) return;
    const { hole, scores } = state._scoreModal;
    if (Object.keys(scores).length === 0) { toast('Enter at least one score'); return; }
    try {
      const result = await Sync.submitHoleScores(hole, scores);
      if (result && result.ok) {
        toast(`Hole ${hole} saved!`);
        state._scoreModal = null;
        await syncFromServer();
        refresh();
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

    // #11: Haptic feedback
    if (placed > 0 && navigator.vibrate) navigator.vibrate(50);

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
            <div style="font-family:'Playfair Display',serif;font-size:13px;letter-spacing:3px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin:8px 0">${isWin ? 'Winner' : 'Active Bet'}</div>
            <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;letter-spacing:2px;color:#D4AF37">${headline}</div>
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
        await navigator.share({ title: `${d.name} — ${headline}`, text });
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

  // ── Activity Feed / Trash Talk ──
  async sendChirp() {
    const input = document.getElementById('feed-chirp-input');
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

  async sendEmoji(emoji) {
    const player = state.bettorName || 'Anonymous';
    const result = await Sync.postChirp(player, '', emoji);
    if (result && result.ok) {
      state._feed.unshift(result.item);
      route();
    }
  }
};

// #4: Persist bet slip to sessionStorage
function saveBetSlip() {
  sessionStorage.setItem('mg_betslip', JSON.stringify(state._betSlip || []));
}

// Boot
bootstrap().catch(e => console.error('Bootstrap failed:', e));
