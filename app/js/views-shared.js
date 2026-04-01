// views-shared.js — Shared utility functions for all view renderers
// Extracted from views.js to reduce file size and establish modular pattern

// ─── HTML Escaping ───
export function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/'/g, '&#39;');
}

// ─── SKINS FORMAT NORMALIZER ───
// Seed data may store skins as either:
//   A) gameState.skins.holes  — {holeNum: {winner, potWon, ...}}  (game-engine format)
//   B) gameState.skins.history — [{hole, winner, pot, value, carry?}]  (seed format)
// This helper returns a unified holes-style object from whichever format exists.
// If neither exists but hole scores are provided, computes skins on-the-fly.
export function getSkinsHoles(gameState, holes, players) {
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

// ─── SHARED: Skins Panel Renderer ───
// Used by both buddies and scramble Board tabs
export function renderSkinsPanel({ title, skinsHoles, scoredHoles, entities, skinsBetVal, maxHoles }) {
  let html = '';
  const numP = entities.length;
  let currentPot = 1;
  const skinsWon = {};
  entities.forEach(e => { skinsWon[e.name] = { count: 0, value: 0 }; });

  html += `<div style="background:var(--bg-tertiary,#FFFFFF);border:1px solid var(--border,rgba(197,160,89,0.12));border-top:2px solid var(--gold-primary,#C5A059);border-radius:10px;padding:var(--space-3,12px) var(--space-4,16px);margin-bottom:var(--space-3,12px)">`;
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <span style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--page-text);letter-spacing:-0.01em">${title}</span>
    <span style="font-size:12px;color:var(--page-text-muted);font-weight:600">$${skinsBetVal}/skin</span>
  </div>`;

  const holesToShow = maxHoles ? scoredHoles.slice(-maxHoles) : scoredHoles;
  holesToShow.forEach(h => {
    const sk = skinsHoles[h];
    if (!sk) return;
    if (sk.winner) {
      const val = (sk.potWon || 1) * (numP - 1) * skinsBetVal;
      if (skinsWon[sk.winner]) { skinsWon[sk.winner].count++; skinsWon[sk.winner].value += val; }
      const isCarryWin = (sk.potWon || 1) > 1;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${h < Math.max(...scoredHoles) ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:var(--page-text-muted);width:28px">H${h}</span>
          <span style="font-size:13px;font-weight:600;color:var(--win,#16A34A)">${escHtml(String(sk.winner).split(' ')[0])}</span>
          ${isCarryWin ? `<span style="font-size:10px;font-weight:700;background:var(--gold-primary,#C5A059);color:white;padding:2px 6px;border-radius:4px">${sk.potWon}x CARRY</span>` : ''}
        </div>
        <span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:var(--gold-primary,#C5A059)">$${val}</span>
      </div>`;
      currentPot = 1;
    } else if (sk.carried) {
      currentPot = (sk.potBefore || currentPot) + 1;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:var(--page-text-muted);width:28px">H${h}</span>
          <span style="font-size:12px;font-weight:600;color:var(--page-text-muted)">Tied</span>
        </div>
        <span style="font-size:11px;font-weight:700;background:rgba(197,160,89,0.15);color:var(--gold-primary);padding:3px 8px;border-radius:4px">CARRY \u2192 ${currentPot}x</span>
      </div>`;
    }
  });

  const skinsRanked = Object.entries(skinsWon).sort((a, b) => b[1].value - a[1].value);
  if (skinsRanked.some(([, v]) => v.count > 0)) {
    html += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">`;
    skinsRanked.forEach(([name, data]) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
        <span style="font-size:13px;font-weight:600;color:var(--page-text)">${escHtml(name.split(' ')[0])}</span>
        <div style="display:flex;gap:12px;align-items:center">
          <span style="font-size:12px;color:var(--page-text-muted)">${data.count} skin${data.count !== 1 ? 's' : ''}</span>
          <span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--gold-primary)">$${data.value}</span>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (currentPot > 1) {
    html += `<div style="margin-top:8px;text-align:center;font-size:12px;font-weight:700;color:var(--gold-primary);background:rgba(197,160,89,0.08);padding:6px;border-radius:6px">
      ${currentPot}x carry active \u2022 Next skin worth $${currentPot * (numP - 1) * skinsBetVal}
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ─── Course Data Helpers ───
export function getCoursePars(config) {
  if (config?.course?.pars && Array.isArray(config.course.pars)) return config.course.pars;
  if (config?.coursePars && Array.isArray(config.coursePars)) return config.coursePars;
  return [4,4,3,5,4,4,3,4,5, 4,3,5,4,4,4,3,4,5]; // default par 72
}

export function getCourseYardage(config) {
  if (config?.course?.yardage && Array.isArray(config.course.yardage)) return config.course.yardage;
  if (config?.courseYardage && Array.isArray(config.courseYardage)) return config.courseYardage;
  return null;
}

export function getCourseHcpIndex(config) {
  if (config?.course?.hcpIndex && Array.isArray(config.course.hcpIndex)) return config.course.hcpIndex;
  if (config?.courseHcpIndex && Array.isArray(config.courseHcpIndex)) return config.courseHcpIndex;
  return [];
}

// ─── Player Extraction ───
export function getPlayersFromConfig(config) {
  if (config?.players && config.players.length > 0) return config.players;
  if (config?.roster && config.roster.length > 0) return config.roster.map(r => ({
    name: r.name || r.member || '',
    handicapIndex: r.handicapIndex ?? r.memberHI ?? 0,
    venmo: r.venmo || ''
  }));
  // Fall back to teams
  if (config?.teams) {
    return Object.values(config.teams).map(t => ({
      name: t.member || t.name || '',
      handicapIndex: t.memberHI ?? t.handicapIndex ?? 0,
      venmo: t.venmo || ''
    }));
  }
  return [];
}
