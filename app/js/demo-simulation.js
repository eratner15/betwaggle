// Demo Auto-Simulation Module — makes demo pages feel like live sportsbook.
// Adds score ticks, odds movement, leaderboard reordering, confetti, and optional sound/haptics.

const DEMO_PLAYERS = {
  buddies: ['Tommy H.', 'Jake M.', 'Ryan K.', 'Mike P.', 'Chris L.', 'Dave S.'],
  scramble: ['Team Eagle', 'Team Birdie', 'Team Ace', 'Team Albatross', 'Team Par', 'Team Bogey']
};

const BET_TYPES = [
  { text: 'placed a $25 Nassau bet', emoji: '💰' },
  { text: 'doubled down on Skins', emoji: '🔥' },
  { text: 'backed the underdog', emoji: '🎯' },
  { text: 'took the favorite', emoji: '👑' },
  { text: 'hedged their position', emoji: '🛡️' },
  { text: 'went all-in', emoji: '💎' }
];

const SCORE_EVENTS = [
  { text: 'sank a 20-footer for birdie', emoji: '🏌️' },
  { text: 'chipped it close for par', emoji: '⛳' },
  { text: 'made a clutch putt', emoji: '🎯' },
  { text: 'recovered from the bunker', emoji: '🏖️' },
  { text: 'drained it from the fringe', emoji: '🔥' },
  { text: 'stuck it tight', emoji: '🎯' },
  { text: 'found trouble off the tee', emoji: '💀' },
  { text: 'made a great up-and-down', emoji: '✨' }
];

const TRASH_TALK = [
  { text: 'That was lucky! 😤', emoji: '' },
  { text: 'Show me the money! 💵', emoji: '' },
  { text: 'Ice in the veins ❄️', emoji: '' },
  { text: "Can't buy a putt today...", emoji: '' },
  { text: 'The pressure is real 😰', emoji: '' },
  { text: "Let's gooo! 🚀", emoji: '' },
  { text: 'This is heating up! 🌶️', emoji: '' }
];

let simulationInterval = null;
let oddsInterval = null;
let leaderboardInterval = null;
let settlementObserver = null;
let interactionBound = false;

const SFX_STORAGE_KEY = 'waggle_sfx_enabled';
let audioContext = null;

function pathIncludesDemo(pathname) {
  return pathname.includes('/demo') ||
    pathname.includes('/demo-buddies') ||
    pathname.includes('/demo-scramble') ||
    pathname.includes('/legends-trip') ||
    pathname.includes('/stag-night') ||
    pathname.includes('/augusta-scramble');
}

function isDemoPage() {
  return pathIncludesDemo(location.pathname || '');
}

function getDemoType() {
  const path = location.pathname;
  if (path.includes('scramble')) return 'scramble';
  return 'buddies';
}

function getRandomPlayer(demoType = 'buddies') {
  const players = DEMO_PLAYERS[demoType] || DEMO_PLAYERS.buddies;
  return players[Math.floor(Math.random() * players.length)];
}

function getState() {
  if (typeof window.MG === 'undefined' || !window.MG.getState) return null;
  return window.MG.getState();
}

function parseAmericanOdds(text) {
  const match = String(text || '').replace(/−/g, '-').match(/([+-]\d{2,4})/);
  return match ? parseInt(match[1], 10) : null;
}

function formatAmericanOdds(odds) {
  const value = Math.max(-450, Math.min(450, Math.round(odds)));
  return value > 0 ? `+${value}` : `${value}`;
}

function parseToPar(text) {
  const raw = String(text || '').trim().toUpperCase();
  if (!raw || raw === 'E' || raw === 'EVEN' || raw === 'AS') return 0;

  const upMatch = raw.match(/(\d+)\s*UP/);
  if (upMatch) return -parseInt(upMatch[1], 10);

  const downMatch = raw.match(/(\d+)\s*DN/);
  if (downMatch) return parseInt(downMatch[1], 10);

  const signed = raw.match(/([+-]?\d+)/);
  if (signed) {
    const n = parseInt(signed[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatToPar(value) {
  if (value === 0) return 'E';
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function readAmount(text) {
  const clean = String(text || '').replace(/,/g, '').trim();
  if (/^EVEN$/i.test(clean)) return 0;
  const m = clean.match(/^([+-])?\$(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * parseFloat(m[2]);
}

function formatAmount(value, alwaysSign = true) {
  if (Math.abs(value) < 0.005) return 'EVEN';
  const rounded = Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const hasCents = Math.abs(abs - Math.round(abs)) > 0.0001;
  const amount = hasCents ? abs.toFixed(2) : String(Math.round(abs));
  if (!alwaysSign && rounded > 0) return `$${amount}`;
  return `${rounded > 0 ? '+' : '-'}$${amount}`;
}

function isSfxEnabled() {
  try {
    return localStorage.getItem(SFX_STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function setSfxEnabled(enabled) {
  try {
    localStorage.setItem(SFX_STORAGE_KEY, enabled ? '1' : '0');
  } catch (_) {}
  renderSfxToggle();
}

function ensureAudioContext() {
  if (audioContext) return audioContext;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    audioContext = null;
  }
  return audioContext;
}

function playTone({ frequency, durationMs, type = 'sine', gain = 0.045, whenMs = 0 }) {
  if (!isSfxEnabled()) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const start = ctx.currentTime + (whenMs / 1000);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + (durationMs / 1000));

  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + (durationMs / 1000) + 0.02);
}

function playBetPlacedSound() {
  playTone({ frequency: 660, durationMs: 85, type: 'triangle' });
  playTone({ frequency: 920, durationMs: 110, type: 'triangle', whenMs: 60 });
}

function playOddsShiftSound() {
  playTone({ frequency: 420, durationMs: 60, type: 'square', gain: 0.03 });
}

function playSettlementFanfare() {
  [523, 659, 784, 1047].forEach((freq, i) => {
    playTone({ frequency: freq, durationMs: 220, type: 'sine', whenMs: i * 100, gain: 0.05 });
  });
}

function vibrate(pattern) {
  if (!navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function ensureSfxToggle() {
  if (document.querySelector('.waggle-sfx-toggle')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'waggle-sfx-toggle';
  button.setAttribute('aria-label', 'Toggle sound effects');
  button.addEventListener('click', () => {
    const next = !isSfxEnabled();
    if (next) ensureAudioContext();
    setSfxEnabled(next);
    if (next) {
      playBetPlacedSound();
      vibrate(20);
    }
  });
  document.body.appendChild(button);
  renderSfxToggle();
}

function renderSfxToggle() {
  const button = document.querySelector('.waggle-sfx-toggle');
  if (!button) return;
  const enabled = isSfxEnabled();
  button.classList.toggle('is-on', enabled);
  button.textContent = enabled ? 'SFX ON' : 'SFX OFF';
  button.title = enabled ? 'Sound effects on' : 'Sound effects muted';
}

function createCanvasConfetti(options = {}) {
  const colors = ['#D4AF37', '#1A472A', '#16A34A', '#F5F0E8'];
  const count = options.count || 120;
  const originX = typeof options.originX === 'number' ? options.originX : window.innerWidth * 0.5;
  const originY = typeof options.originY === 'number' ? options.originY : window.innerHeight * 0.26;
  const spread = options.spread || Math.max(130, window.innerWidth * 0.2);
  const duration = options.duration || 2600;

  const canvas = document.createElement('canvas');
  canvas.className = 'settlement-confetti-canvas';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(dpr, dpr);

  const pieces = Array.from({ length: count }, () => {
    const launch = (Math.random() - 0.5) * spread;
    return {
      x: originX + launch * 0.25,
      y: originY + (Math.random() - 0.5) * 30,
      vx: launch * 0.03,
      vy: -4 - Math.random() * 8,
      size: 4 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.28,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
      drag: 0.985 + Math.random() * 0.01
    };
  });

  const gravity = 0.22;
  const started = performance.now();

  function frame(now) {
    const elapsed = now - started;
    ctx.clearRect(0, 0, width, height);

    pieces.forEach((piece) => {
      piece.vx *= piece.drag;
      piece.vy += gravity;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rot += piece.vr;
      piece.life = Math.max(0, 1 - elapsed / duration);

      ctx.save();
      ctx.globalAlpha = piece.life;
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rot);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.62);
      ctx.restore();
    });

    if (elapsed < duration) {
      requestAnimationFrame(frame);
      return;
    }

    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  requestAnimationFrame(frame);
}

function pulseBetCardsForOddsImpact(intensity) {
  const cards = Array.from(document.querySelectorAll('.mg-bet-card'));
  if (!cards.length) return;
  const maxPulse = intensity >= 22 ? 3 : 1;

  for (let i = 0; i < maxPulse; i++) {
    const card = cards[Math.floor(Math.random() * cards.length)];
    if (!card) continue;
    card.classList.remove('odds-impact');
    void card.offsetWidth;
    card.classList.add('odds-impact');
    setTimeout(() => card.classList.remove('odds-impact'), 900);
  }
}

function getLeaderboardRows() {
  const selectors = ['.mg-premium-player-row', '.mg-leaderboard-row', '.tv-row'];
  for (const selector of selectors) {
    const rows = Array.from(document.querySelectorAll(selector));
    if (rows.length >= 3) return rows;
  }
  return [];
}

function rowScoreElement(row) {
  return row.querySelector('.mg-premium-player-to-par, .tv-col-topar, [data-topar], .to-par, .score-to-par');
}

function maybeTickScore() {
  const rows = getLeaderboardRows();
  if (!rows.length) return;

  const row = rows[Math.floor(Math.random() * rows.length)];
  const scoreEl = rowScoreElement(row);
  if (!scoreEl) return;

  const current = parseToPar(scoreEl.textContent);
  const deltaCandidates = [-1, 0, 1, 1, 0, -1];
  const delta = deltaCandidates[Math.floor(Math.random() * deltaCandidates.length)];
  const next = Math.max(-12, Math.min(12, current + delta));

  scoreEl.textContent = formatToPar(next);
  scoreEl.classList.remove('demo-score-tick');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('demo-score-tick');
  setTimeout(() => scoreEl.classList.remove('demo-score-tick'), 700);

  row.classList.remove('demo-row-hot');
  void row.offsetWidth;
  row.classList.add('demo-row-hot');
  setTimeout(() => row.classList.remove('demo-row-hot'), 900);
}

function reorderLeaderboardWithFlip() {
  const rows = getLeaderboardRows();
  if (rows.length < 3) return;

  const parent = rows[0].parentElement;
  if (!parent) return;

  const firstRects = new Map(rows.map((row) => [row, row.getBoundingClientRect()]));

  const sorted = [...rows].sort((a, b) => {
    const aScore = parseToPar(rowScoreElement(a)?.textContent || '0');
    const bScore = parseToPar(rowScoreElement(b)?.textContent || '0');
    return aScore - bScore;
  });

  const sameOrder = sorted.every((row, i) => row === rows[i]);
  if (sameOrder) return;

  sorted.forEach((row) => parent.appendChild(row));

  sorted.forEach((row) => {
    const first = firstRects.get(row);
    const last = row.getBoundingClientRect();
    if (!first) return;

    const dy = first.top - last.top;
    if (Math.abs(dy) < 0.5) return;

    row.classList.add('demo-leaderboard-moving');
    row.style.transition = 'none';
    row.style.transform = `translateY(${dy}px)`;

    requestAnimationFrame(() => {
      row.style.transition = 'transform 520ms cubic-bezier(0.2, 0.85, 0.2, 1), box-shadow 220ms ease';
      row.style.transform = '';
    });

    setTimeout(() => {
      row.classList.remove('demo-leaderboard-moving');
      row.style.transition = '';
      row.style.transform = '';
    }, 620);
  });
}

function generateOddsChange(current) {
  const steps = [6, 8, 10, 12, 14, 18, 22, 28];
  const magnitude = steps[Math.floor(Math.random() * steps.length)];
  const direction = Math.random() > 0.5 ? 1 : -1;

  let next = current + (magnitude * direction);
  if (next > -100 && next < 100) {
    next = next >= 0 ? 100 : -100;
  }

  next = Math.max(-350, Math.min(350, next));
  return next;
}

function animateOddsButton(button, change) {
  if (window.MG && typeof window.MG.animateOddsButton === 'function') {
    window.MG.animateOddsButton(button, change);
    return;
  }

  button.classList.remove('odds-slide-up', 'odds-slide-down', 'odds-flash-green', 'odds-flash-red');
  void button.offsetWidth;
  button.classList.add(change.animationType === 'up' ? 'odds-slide-up' : 'odds-slide-down');
  button.classList.add(change.flashType === 'green' ? 'odds-flash-green' : 'odds-flash-red');

  const existingArrow = button.querySelector('.odds-arrow');
  if (existingArrow) existingArrow.remove();

  const arrow = document.createElement('div');
  arrow.className = `odds-arrow odds-arrow-${change.animationType} fade-out`;
  button.appendChild(arrow);

  setTimeout(() => {
    button.classList.remove('odds-slide-up', 'odds-slide-down', 'odds-flash-green', 'odds-flash-red');
    arrow.remove();
  }, 1300);
}

function isElementVisible(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (!node.isConnected) return false;

  const style = window.getComputedStyle(node);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

  const hiddenAncestor = node.closest('[hidden],[aria-hidden="true"]');
  if (hiddenAncestor && hiddenAncestor !== node) return false;

  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const verticalBuffer = Math.max(120, Math.floor(viewportHeight * 0.3));

  return (
    rect.bottom >= -verticalBuffer &&
    rect.top <= (viewportHeight + verticalBuffer) &&
    rect.right >= 0 &&
    rect.left <= viewportWidth
  );
}

function resolveOddsTarget(node) {
  if (!(node instanceof HTMLElement)) return null;

  let button = null;
  let lineEl = null;

  if (node.classList.contains('odds-line')) {
    lineEl = node;
    button = node.closest('button, .mg-odds-btn, .heritage-odds-chip') || node.parentElement;
  } else {
    button = node;
    lineEl = node.querySelector('.odds-line') || node;
  }

  if (!(button instanceof HTMLElement) || !(lineEl instanceof HTMLElement)) return null;
  if (!isElementVisible(button) && !isElementVisible(lineEl)) return null;

  const currentOdds = parseAmericanOdds(lineEl.textContent);
  if (currentOdds === null) return null;

  return { button, lineEl, currentOdds };
}

function getOddsButtons() {
  const selectors = [
    '.mg-odds-btn',
    '.mg-odds-btn .odds-line',
    '.odds-line',
    'button[onclick*="addToSlip"]',
    'button[onclick*="openCashBetModal"]',
    'button[onclick*="openOddsBetSlip"]',
    '.heritage-odds-chip'
  ];

  const seen = new Set();
  const targets = [];

  selectors.forEach((selector) => {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((node) => {
      const target = resolveOddsTarget(node);
      if (!target) return;
      if (seen.has(target.button)) return;
      seen.add(target.button);
      targets.push(target);
    });
  });

  return targets;
}

function simulateOddsMovement() {
  const targets = getOddsButtons();
  if (!targets.length) return 0;

  const moveCount = targets.length > 5 ? 2 : 1;
  let movedCount = 0;
  const available = [...targets];

  for (let i = 0; i < moveCount && available.length; i++) {
    const idx = Math.floor(Math.random() * available.length);
    const target = available.splice(idx, 1)[0];
    if (!target) continue;
    const { button, lineEl, currentOdds } = target;

    const nextOdds = generateOddsChange(currentOdds);
    const delta = nextOdds - currentOdds;
    if (!delta) continue;

    lineEl.textContent = formatAmericanOdds(nextOdds);

    const change = {
      animationType: delta > 0 ? 'up' : 'down',
      flashType: delta < 0 ? 'green' : 'red',
      oddsChange: Math.abs(delta),
      newOdds: formatAmericanOdds(nextOdds)
    };

    animateOddsButton(button, change);

    if (Math.abs(delta) >= 18) {
      pulseBetCardsForOddsImpact(Math.abs(delta));
      playOddsShiftSound();
      vibrate(20);
    }

    movedCount++;
  }

  return movedCount;
}

function kickstartVisibleOddsMovement() {
  let attempts = 0;
  const maxAttempts = 8;

  const run = () => {
    if (!isDemoPage()) return;
    attempts++;
    const moved = simulateOddsMovement();
    if (moved > 0 || attempts >= maxAttempts) return;
    setTimeout(run, 700);
  };

  setTimeout(run, 900);
}

function generateRandomActivity(demoType = 'buddies') {
  const activityTypes = ['bet', 'score', 'chirp'];
  const weights = [0.36, 0.44, 0.2];

  const rand = Math.random();
  let type = 'chirp';
  if (rand < weights[0]) {
    type = 'bet';
  } else if (rand < weights[0] + weights[1]) {
    type = 'score';
  }

  const player = getRandomPlayer(demoType);
  const now = Date.now();

  if (type === 'bet') {
    const bet = BET_TYPES[Math.floor(Math.random() * BET_TYPES.length)];
    return {
      type: 'press',
      player,
      text: bet.text,
      emoji: bet.emoji,
      ts: now
    };
  }

  if (type === 'score') {
    const score = SCORE_EVENTS[Math.floor(Math.random() * SCORE_EVENTS.length)];
    return {
      type: 'score',
      player,
      text: score.text,
      emoji: score.emoji,
      ts: now
    };
  }

  const chirp = TRASH_TALK[Math.floor(Math.random() * TRASH_TALK.length)];
  return {
    type: 'chirp',
    player,
    text: chirp.text,
    emoji: chirp.emoji,
    ts: now
  };
}

function addSimulatedActivity() {
  if (!isDemoPage()) return;

  const state = getState();
  if (!state) return;

  if (!state._feed) state._feed = [];

  const demoType = getDemoType();
  const newActivity = generateRandomActivity(demoType);
  state._feed.unshift(newActivity);

  if (state._feed.length > 100) {
    state._feed = state._feed.slice(0, 100);
  }

  if (window.MG.route && typeof window.MG.route === 'function') {
    window.MG.route();
  }
}

function settleAmountNodes(scopeRoot) {
  const root = scopeRoot || document;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const targets = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node || !node.textContent) continue;
    const text = node.textContent.trim();
    const amount = readAmount(text);
    if (amount === null) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    targets.push({ parent, amount, originalText: text });
  }

  return targets;
}

function animateSettlementAmounts(scopeRoot) {
  const targets = settleAmountNodes(scopeRoot);
  if (!targets.length) return;

  targets.forEach(({ parent, amount, originalText }) => {
    if (parent.dataset.waggleAnimatedAmount === '1') return;
    parent.dataset.waggleAnimatedAmount = '1';
    parent.classList.add('settlement-money-value');

    const start = performance.now();
    const duration = 1100;
    const alwaysSign = /^[+-]\$/.test(originalText);

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = amount * eased;
      parent.textContent = formatAmount(value, alwaysSign);

      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }

      parent.textContent = formatAmount(amount, alwaysSign);
    }

    parent.textContent = formatAmount(0, alwaysSign);
    requestAnimationFrame(tick);
  });
}

function settlementBurst(originEl) {
  if (originEl) {
    const rect = originEl.getBoundingClientRect();
    createCanvasConfetti({ originX: rect.left + rect.width * 0.5, originY: rect.top + rect.height * 0.35, count: 140 });
  } else {
    createCanvasConfetti({ count: 120 });
  }
  playSettlementFanfare();
  vibrate([90, 45, 120, 45, 180]);
}

function maybeEnhanceSettlement() {
  const overlay = document.getElementById('settlement-overlay');
  if (!overlay || overlay.dataset.waggleEnhanced === '1') return;

  overlay.dataset.waggleEnhanced = '1';

  setTimeout(() => {
    animateSettlementAmounts(overlay);
  }, 1600);

  setTimeout(() => {
    const winnerCard = overlay.querySelector('.settlement-winner-card') || overlay.querySelector('[id^="settlement-player-"]');
    settlementBurst(winnerCard || undefined);
  }, 3400);
}

function bindInteractionEffects() {
  if (interactionBound) return;
  interactionBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const oddsBtn = target.closest('.mg-odds-btn');
    if (oddsBtn) {
      vibrate(15);
      return;
    }

    const button = target.closest('button, [role="button"]');
    if (!button) return;

    const label = (button.textContent || '').trim();
    const isBetPlacement = /(^place\s+bet|lock\s+it\s+in|confirm\s+bet|submit\s+bet|add\s+to\s+slip)/i.test(label);

    if (isBetPlacement) {
      playBetPlacedSound();
      vibrate([30, 40, 55]);
      const card = button.closest('.mg-bet-card');
      if (card) {
        card.classList.remove('odds-impact');
        void card.offsetWidth;
        card.classList.add('odds-impact');
      }
    }

    if (/settle\s+round|finalize|final\s+results/i.test(label)) {
      setTimeout(() => {
        maybeEnhanceSettlement();
      }, 250);
    }
  }, true);
}

function bindSettlementObserver() {
  if (settlementObserver) return;

  settlementObserver = new MutationObserver(() => {
    maybeEnhanceSettlement();
  });

  settlementObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

function exposeUxHelpers() {
  window.MG = window.MG || {};
  if (typeof window.MG.triggerConfettiBurst !== 'function') {
    window.MG.triggerConfettiBurst = function triggerConfettiBurst(options) {
      createCanvasConfetti(options || {});
    };
  }

  if (typeof window.MG.playSettlementFanfare !== 'function') {
    window.MG.playSettlementFanfare = playSettlementFanfare;
  }
}

function startAutoSimulation(intervalMs = 6500) {
  if (simulationInterval) return;

  simulationInterval = setInterval(() => {
    if (Math.random() < 0.78) {
      addSimulatedActivity();
      maybeTickScore();
    }
  }, intervalMs);

  if (!oddsInterval) {
    oddsInterval = setInterval(() => {
      simulateOddsMovement();
    }, 4200);
  }

  if (!leaderboardInterval) {
    leaderboardInterval = setInterval(() => {
      reorderLeaderboardWithFlip();
    }, 5200);
  }
}

function stopAutoSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }

  if (oddsInterval) {
    clearInterval(oddsInterval);
    oddsInterval = null;
  }

  if (leaderboardInterval) {
    clearInterval(leaderboardInterval);
    leaderboardInterval = null;
  }
}

function initWaggleUxPolish() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  ensureSfxToggle();
  bindInteractionEffects();
  bindSettlementObserver();
  exposeUxHelpers();

  if (!pathIncludesDemo(location.pathname || '')) return;

  setTimeout(() => {
    maybeTickScore();
    reorderLeaderboardWithFlip();
    kickstartVisibleOddsMovement();
  }, 1100);
}

function initDemoSimulation() {
  if (!isDemoPage()) return;

  setTimeout(() => {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        addSimulatedActivity();
        maybeTickScore();
      }, i * 900);
    }

    startAutoSimulation();
    kickstartVisibleOddsMovement();
  }, 1400);
}

export {
  addSimulatedActivity,
  initDemoSimulation,
  initWaggleUxPolish,
  isDemoPage,
  startAutoSimulation,
  stopAutoSimulation
};
