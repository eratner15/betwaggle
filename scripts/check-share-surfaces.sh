#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://betwaggle.com}"
SLUG="${2:-blue-monster-at-trump-national-doral-apr-753cae}"
TMP_JS="$(mktemp)"
trap 'rm -f "$TMP_JS"' EXIT

cat > "$TMP_JS" <<'EOF'
const { chromium, devices } = require('playwright');

function assertIncludes(body, needle, label) {
  if (!body.includes(needle)) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`PASS ${label}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await context.newPage();

  await page.goto(`${process.env.BASE_URL}/${process.env.SLUG}/#scorecard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const scoreText = await page.locator('body').innerText();
  assertIncludes(scoreText, 'SCORING DESK', 'score surface renders scoring desk');
  assertIncludes(scoreText, 'NEXT UNLOCK', 'score surface renders next unlock');
  assertIncludes(scoreText, 'ON DECK', 'score surface renders on deck card');

  await page.goto(`${process.env.BASE_URL}/create/?clone=${process.env.SLUG}&mode=weekly`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const weeklyText = await page.locator('body').innerText();
  assertIncludes(weeklyText, 'WEEKLY MONEY GAME', 'weekly create route renders weekly banner');
  assertIncludes(weeklyText, 'LEDGER PREVIEW', 'weekly create route renders ledger preview');

  await page.goto(`${process.env.BASE_URL}/create/`, { waitUntil: 'networkidle' });
  await page.fill('#manual-name', 'QA One');
  await page.fill('#manual-hi', '10');
  await page.locator('button', { hasText: '+ Add' }).click();
  await page.fill('#manual-name', 'QA Two');
  await page.fill('#manual-hi', '14');
  await page.locator('button', { hasText: '+ Add' }).click();
  await page.click('#next-btn');
  await page.locator('button', { hasText: /Skip/ }).click();
  await page.waitForSelector('#step-3.active');
  await page.click('#next-btn');
  await page.waitForTimeout(6000);
  const launchText = await page.locator('body').innerText();
  assertIncludes(launchText, 'WHAT HAPPENS NEXT', 'post-create launch screen renders next-steps block');
  assertIncludes(launchText, '3. Share settlement', 'post-create launch screen renders share loop');

  await browser.close();
})().catch((err) => {
  console.error(`FAIL ${err.message || err}`);
  process.exit(1);
});
EOF

BASE_URL="$BASE_URL" SLUG="$SLUG" npx -y -p playwright@1.52.0 bash -lc "
  set -euo pipefail
  export NODE_PATH=\"\$(dirname \"\$(dirname \"\$(command -v playwright)\")\")\"
  node \"$TMP_JS\"
"

