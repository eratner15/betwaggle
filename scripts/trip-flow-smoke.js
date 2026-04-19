#!/usr/bin/env node

const { chromium, devices } = require('playwright');

const BASE_URL = (process.env.BASE_URL || 'https://betwaggle.com').replace(/\/$/, '');
const SLUG = process.env.TRIP_SLUG || 'demo-buddies';
const EVENT_URL = `${BASE_URL}/${SLUG}/`;
const CREATE_URL = `${BASE_URL}/create/`;
const PLAYERS = [
  'Jake Sullivan',
  'Ryan Costa',
  'Mike Torres',
  'Dan Keller',
];

function holeScores(holeNum) {
  const base = 4 + ((holeNum - 1) % 3);
  return {
    [PLAYERS[0]]: base,
    [PLAYERS[1]]: base + (holeNum % 2 === 0 ? 1 : 0),
    [PLAYERS[2]]: Math.max(3, base - (holeNum % 2 === 1 ? 1 : 0)),
    [PLAYERS[3]]: base + ((holeNum + 1) % 2 === 0 ? 2 : 1),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function maybeDismissIdentityPicker(page) {
  const justWatching = page.getByRole('button', { name: /just watching/i });
  if (await justWatching.count()) {
    await justWatching.first().click().catch(() => {});
    return;
  }
  const playerButton = page.getByRole('button', { name: /jake sullivan|ryan costa|mike torres|dan keller/i });
  if (await playerButton.count()) {
    await playerButton.first().click().catch(() => {});
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 14'],
  });
  const page = await context.newPage();

  try {
    console.log(`Smoke base: ${BASE_URL}`);

    await page.goto(CREATE_URL, { waitUntil: 'networkidle' });
    await page.getByText(/who's playing\?/i).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /find my course & set up fast/i }).waitFor({ timeout: 15000 });
    console.log('PASS create page loads');

    await page.goto(EVENT_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.MG && typeof window.MG.openScoreComposer === 'function', null, { timeout: 20000 });
    await maybeDismissIdentityPicker(page);
    console.log('PASS event board loads');

    for (let holeNum = 1; holeNum <= 18; holeNum += 1) {
      const result = await page.evaluate(async ({ slug, holeNum, scores }) => {
        const res = await fetch(`/${slug}/api/hole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holeNum, scores }),
        });
        let body = null;
        try {
          body = await res.json();
        } catch (_) {}
        return { ok: res.ok, status: res.status, body };
      }, { slug: SLUG, holeNum, scores: holeScores(holeNum) });

      assert(result.ok, `hole ${holeNum} submit failed with ${result.status}`);
    }
    console.log('PASS hole scoring API accepts 18-hole round');

    await page.goto(`${EVENT_URL}#settle`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const settlementSignals = [
      page.locator('#settlement-share-card'),
      page.getByText(/drop this in the group chat/i),
      page.getByText(/settlement/i),
    ];

    let foundSettlement = false;
    for (const signal of settlementSignals) {
      if (await signal.count()) {
        foundSettlement = true;
        break;
      }
    }

    assert(foundSettlement, 'settlement view did not render after scoring');
    console.log('PASS settlement view renders after full round');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`FAIL ${err.message || err}`);
  process.exit(1);
});
