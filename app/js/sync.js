// sync.js — Backend sync layer for golf event Book API
// All bets are stored both locally AND on the server (KV)
// Scores pushed by admin sync to all devices.
// Offline-aware: checks navigator.onLine before making requests.
// Call initSync(slug, basePath) at bootstrap to configure.

let API = '/app/api';
let ADMIN_TOKEN = null;

// Check if we're online (defaults to true if API unavailable)
export function isOnline() {
  return navigator.onLine !== false;
}

// Wrap fetch with offline detection — throws 'offline' error if no connection
async function offlineAwareFetch(url, options) {
  if (!isOnline()) {
    throw new Error('offline');
  }
  return fetch(url, options);
}

export function initSync(slug, basePath) {
  API = basePath ? `${basePath}/api` : `/${slug}/api`;
  // Restore admin token from sessionStorage
  ADMIN_TOKEN = sessionStorage.getItem('mg_admin_token');
}

// ── Admin authentication (PIN → session token) ──
export async function adminAuth(pin) {
  try {
    const res = await offlineAwareFetch(`${API}/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.token) {
      ADMIN_TOKEN = data.token;
      sessionStorage.setItem('mg_admin_token', data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Magic Link authentication ──
export async function requestMagicLink(contact) {
  try {
    const res = await offlineAwareFetch(`${API}/admin/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Request failed' };
    return { ok: true, sent: data.sent };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function verifyMagicLink(tokenOrCode) {
  try {
    // Determine if this looks like a UUID token or a 6-char code
    const isToken = tokenOrCode.length > 10;
    const payload = isToken ? { token: tokenOrCode } : { code: tokenOrCode };
    const res = await offlineAwareFetch(`${API}/admin/magic-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Verification failed' };
    if (data.token) {
      ADMIN_TOKEN = data.token;
      sessionStorage.setItem('mg_admin_token', data.token);
      return { ok: true };
    }
    return { ok: false, error: 'No session token returned' };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export function adminLogout() {
  ADMIN_TOKEN = null;
  sessionStorage.removeItem('mg_admin_token');
}

export function isAdminAuthed() {
  return !!ADMIN_TOKEN;
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN || '' };
}
function publicHeaders() {
  return { 'Content-Type': 'application/json' };
}

// ── Place a bet (sends to server) ──
export async function submitBet(bet) {
  try {
    const res = await offlineAwareFetch(`${API}/bet`, {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify(bet),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Bet rejected:', err.error || res.status);
      return null;
    }
    const data = await res.json();
    return { ...data.bet, credits: data.credits };
  } catch (e) {
    console.warn('Bet submit failed (offline?):', e);
    return null;
  }
}

// ── Get all bets from server ──
export async function fetchBets() {
  try {
    const res = await offlineAwareFetch(`${API}/bets`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Get book summary (admin) ──
export async function fetchBook() {
  try {
    const res = await offlineAwareFetch(`${API}/book`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Update bet status (admin: settle, void) ──
export async function updateBet(betId, updates) {
  try {
    const res = await offlineAwareFetch(`${API}/bet/${betId}`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Push scores to server (admin) ──
export async function pushScores(scores) {
  try {
    const res = await offlineAwareFetch(`${API}/scores`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(scores),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Fetch scores from server ──
export async function fetchScores() {
  try {
    const res = await offlineAwareFetch(`${API}/scores`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Push settings (admin) ──
export async function pushSettings(settings) {
  try {
    const res = await offlineAwareFetch(`${API}/settings`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(settings),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Fetch settings ──
export async function fetchSettings() {
  try {
    const res = await offlineAwareFetch(`${API}/settings`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Get player info ──
export async function fetchPlayer(name) {
  try {
    const res = await offlineAwareFetch(`${API}/player/${encodeURIComponent(name.toLowerCase())}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Get all players (admin) ──
export async function fetchPlayers() {
  try {
    const res = await offlineAwareFetch(`${API}/players`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Add credits to a player (admin) ──
export async function addCredits(name, amount) {
  try {
    const res = await offlineAwareFetch(`${API}/player/add-credits`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ name, amount }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Create/update player (admin) ──
export async function createPlayer(name, credits) {
  try {
    const res = await offlineAwareFetch(`${API}/player`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ name, credits }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Get full state (scores + bets + settings) ──
export async function fetchState() {
  try {
    const res = await offlineAwareFetch(`${API}/state`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Submit hole scores (admin token if available, otherwise player-mode for round events) ──
export async function submitHoleScores(holeNum, scores) {
  try {
    // Include admin token if present; server accepts unauthenticated for quick/buddies_trip
    const headers = ADMIN_TOKEN ? adminHeaders() : publicHeaders();
    const res = await offlineAwareFetch(`${API}/hole`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ holeNum, scores }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Hole submit rejected:', err.error || res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('Hole submit failed (offline?):', e);
    return null;
  }
}

// ── Fetch live game state (holes + engine results) ──
export async function fetchGameState() {
  try {
    const res = await offlineAwareFetch(`${API}/game-state`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Declare a Nassau press (admin) ──
export async function submitNassauPress(player, segment, startHole) {
  try {
    const res = await offlineAwareFetch(`${API}/nassau-press`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ player, segment, startHole }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Save Vegas team assignments (admin) ──
export async function saveVegasTeams(teamA, teamB) {
  try {
    const res = await offlineAwareFetch(`${API}/vegas-teams`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ teamA, teamB }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Submit wolf pick before a hole (admin) ──
export async function submitWolfPick(holeNum, wolf, partner) {
  try {
    const res = await offlineAwareFetch(`${API}/wolf-pick`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ holeNum, wolf, partner }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Wolf pick rejected:', err.error || res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('Wolf pick failed:', e);
    return null;
  }
}

// ── Subscribe to push notifications ──
export async function subscribePush(subscription) {
  try {
    const res = await offlineAwareFetch(`${API}/push-subscribe`, {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ subscription }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Get VAPID public key ──
export async function fetchVapidPublicKey() {
  try {
    const res = await offlineAwareFetch(`${API}/vapid-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || null;
  } catch { return null; }
}

// ── Fetch activity feed (public) ──
export async function fetchFeed() {
  try {
    const res = await offlineAwareFetch(`${API}/feed`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ── Post a chirp / emoji reaction (public) ──
export async function postChirp(player, text, emoji) {
  try {
    const res = await offlineAwareFetch(`${API}/feed`, {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ player, text, emoji }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Chirp rejected:', err.error || res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('Chirp failed:', e);
    return null;
  }
}

// ── Generic admin API call ──
export async function apiFetch(path, method = 'GET', body = null) {
  try {
    const opts = { method, headers: method === 'GET' ? {} : adminHeaders() };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await offlineAwareFetch(`${API}/${path}`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
