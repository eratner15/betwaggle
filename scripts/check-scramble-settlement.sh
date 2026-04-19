#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://betwaggle.com}"
SLUG_LIVE="${2:-demo-scramble}"
SLUG_FINAL="${3:-augusta-scramble}"
TMP_JS="$(mktemp)"
SHOT_DIR="${TMPDIR:-/tmp}/betwaggle-scramble-settlement"
mkdir -p "$SHOT_DIR"
trap 'rm -f "$TMP_JS"' EXIT

cat > "$TMP_JS" <<'EOF'
const { chromium, devices } = require('playwright');
const path = require('path');

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
  const shotDir = process.env.SHOT_DIR;

  await page.goto(`${process.env.BASE_URL}/${process.env.SLUG_LIVE}/#settle`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const liveText = await page.locator('body').innerText();
  assertIncludes(liveText, 'Round still moving.', 'scramble incomplete settlement hero renders');
  assertIncludes(liveText, 'LIVE MONEY BOARD', 'scramble incomplete settlement board renders');
  await page.screenshot({ path: path.join(shotDir, `${process.env.SLUG_LIVE}-settle-mobile.png`), fullPage: true });
  console.log(`PASS live settlement screenshot saved`);

  await page.goto(`${process.env.BASE_URL}/${process.env.SLUG_FINAL}/#settle`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const finalText = await page.locator('body').innerText();
  assertIncludes(finalText, 'OFFICIAL MONEY BOARD', 'scramble final settlement hero renders');
  assertIncludes(finalText, 'FINAL STANDINGS', 'scramble final standings render');
  assertIncludes(finalText, 'Screenshot this card for the group chat.', 'scramble share caption renders');
  const shareCard = page.locator('#settlement-share-card');
  if ((await shareCard.count()) < 1) {
    console.error('FAIL scramble share card missing');
    process.exit(1);
  }
  const shareCardBox = await shareCard.boundingBox();
  if (!shareCardBox || shareCardBox.width < 280 || shareCardBox.height < 300) {
    console.error('FAIL scramble share card dimensions too small');
    process.exit(1);
  }
  console.log('PASS scramble share card dimensions look healthy');
  await shareCard.screenshot({ path: path.join(shotDir, `${process.env.SLUG_FINAL}-share-card.png`) });
  await page.screenshot({ path: path.join(shotDir, `${process.env.SLUG_FINAL}-settle-mobile.png`), fullPage: true });
  console.log(`PASS final settlement screenshots saved`);

  await browser.close();
})().catch((err) => {
  console.error(`FAIL ${err.message || err}`);
  process.exit(1);
});
EOF

BASE_URL="$BASE_URL" SLUG_LIVE="$SLUG_LIVE" SLUG_FINAL="$SLUG_FINAL" SHOT_DIR="$SHOT_DIR" npx -y -p playwright@1.52.0 bash -lc "
  set -euo pipefail
  export NODE_PATH=\"\$(dirname \"\$(dirname \"\$(command -v playwright)\")\")\"
  node \"$TMP_JS\"
"

echo "Screenshots saved to $SHOT_DIR"
