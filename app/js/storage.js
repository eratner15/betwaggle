// IndexedDB-backed storage with localStorage fallback for golf event state
// Designed for offline-first operation on golf courses with poor cellular signal.
// IndexedDB stores: 'state' (event state by slug), 'mutations' (pending sync queue), 'feed' (cached feed items)

let STORAGE_KEY = 'mg_state'; // default; overridden by init(matches, slug)

const DB_NAME = 'waggle-events';
const DB_VERSION = 1;
let _db = null; // cached IDBDatabase instance

// ── IndexedDB helpers ──

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state'); // keyed by STORAGE_KEY
        }
        if (!db.objectStoreNames.contains('mutations')) {
          const ms = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
          ms.createIndex('ts', 'ts', { unique: false });
        }
        if (!db.objectStoreNames.contains('feed')) {
          db.createObjectStore('feed'); // keyed by slug
        }
      };
      req.onsuccess = (e) => {
        _db = e.target.result;
        _db.onclose = () => { _db = null; };
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// Write to a single object store
function idbPut(storeName, value, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = key !== undefined ? store.put(value, key) : store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// Read from a single object store
function idbGet(storeName, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// Delete from a single object store
function idbDelete(storeName, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

// Get all records from a store
function idbGetAll(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

// ── State persistence ──

// Load state — reads from IndexedDB first, falls back to localStorage
export function load() {
  // Synchronous path: always return localStorage immediately for backward compat
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Async load — tries IndexedDB first (more durable), falls back to localStorage
export async function loadAsync() {
  try {
    const idbState = await idbGet('state', STORAGE_KEY);
    if (idbState) return idbState;
  } catch (e) {
    console.warn('[waggle-storage] IndexedDB load failed, using localStorage:', e.message);
  }
  return load();
}

// Save state — writes to localStorage (sync, immediate) AND IndexedDB (async, durable)
export function save(state) {
  // Synchronous localStorage write — always available, immediate
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[waggle-storage] localStorage save failed:', e);
  }
  // Async IndexedDB write — fire and forget, more durable
  idbPut('state', state, STORAGE_KEY).catch(e => {
    console.warn('[waggle-storage] IndexedDB save failed:', e.message);
  });
}

const CURRENT_VERSION = 10; // Bump when data schema changes

export async function init(matches, slug) {
  STORAGE_KEY = slug ? `event_${slug}_state` : 'mg_state';

  // Try async load from IndexedDB first, fall back to sync localStorage
  let existing = null;
  try {
    existing = await loadAsync();
  } catch {
    existing = load();
  }

  if (existing && existing.version === CURRENT_VERSION && existing.matches) return existing;

  const state = {
    matches,
    bets: [],
    calcutta: {},
    shootout: { teams: [], holes: {}, eliminated: [] },
    announcements: [],
    adminAuthed: false,
    bettorName: null,
    version: CURRENT_VERSION
  };
  save(state);
  return state;
}

export function reset(matches, slug) {
  STORAGE_KEY = slug ? `event_${slug}_state` : 'mg_state';
  localStorage.removeItem(STORAGE_KEY);
  // Also clear from IndexedDB
  idbDelete('state', STORAGE_KEY).catch(() => {});
  return init(matches, slug);
}

// ── Mutation queue — stores pending API calls for offline sync ──

export async function queueMutation(mutation) {
  // mutation: { type: 'scores'|'bet'|'chirp'|'settings', payload: {...}, ts: Date.now() }
  const record = { ...mutation, ts: mutation.ts || Date.now() };
  try {
    const id = await idbPut('mutations', record);
    return id;
  } catch (e) {
    // Fallback: store in localStorage
    console.warn('[waggle-storage] IndexedDB mutation queue failed, using localStorage:', e.message);
    try {
      const pending = JSON.parse(localStorage.getItem('waggle_pending_mutations') || '[]');
      record._localId = Date.now() + '_' + Math.random().toString(36).slice(2);
      pending.push(record);
      localStorage.setItem('waggle_pending_mutations', JSON.stringify(pending));
      return record._localId;
    } catch (e2) {
      console.error('[waggle-storage] All mutation queue storage failed:', e2);
      return null;
    }
  }
}

export async function getPendingMutations() {
  let mutations = [];

  // Get from IndexedDB
  try {
    mutations = await idbGetAll('mutations');
  } catch (e) {
    console.warn('[waggle-storage] IndexedDB getPending failed:', e.message);
  }

  // Also check localStorage fallback
  try {
    const lsPending = JSON.parse(localStorage.getItem('waggle_pending_mutations') || '[]');
    if (lsPending.length > 0) {
      mutations = mutations.concat(lsPending.map(m => ({ ...m, id: m._localId, _fromLocalStorage: true })));
    }
  } catch {}

  // Sort by timestamp
  mutations.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return mutations;
}

export async function clearMutation(id) {
  // Try IndexedDB first
  try {
    await idbDelete('mutations', id);
    return;
  } catch {}

  // Try localStorage fallback
  try {
    const pending = JSON.parse(localStorage.getItem('waggle_pending_mutations') || '[]');
    const filtered = pending.filter(m => m._localId !== id);
    if (filtered.length !== pending.length) {
      localStorage.setItem('waggle_pending_mutations', JSON.stringify(filtered));
    }
  } catch {}
}

export async function clearAllMutations() {
  try {
    const db = await openDB();
    const tx = db.transaction('mutations', 'readwrite');
    tx.objectStore('mutations').clear();
  } catch {}
  try {
    localStorage.removeItem('waggle_pending_mutations');
  } catch {}
}

// ── Feed cache ──

export async function saveFeed(slug, feedItems) {
  try {
    await idbPut('feed', feedItems, `feed_${slug}`);
  } catch {}
}

export async function loadFeed(slug) {
  try {
    return await idbGet('feed', `feed_${slug}`);
  } catch { return null; }
}

// ── Pending mutation count (for UI indicators) ──

export async function getPendingCount() {
  try {
    const mutations = await getPendingMutations();
    return mutations.length;
  } catch { return 0; }
}
