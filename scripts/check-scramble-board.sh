#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://betwaggle.com}"
SLUG_A="${2:-demo-scramble}"
SLUG_B="${3:-augusta-scramble}"
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

  await page.goto(`${process.env.BASE_URL}/${process.env.SLUG_A}/#dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const textA = await page.locator('body').innerText();
  assertIncludes(textA, 'CURRENT SCRAMBLE', 'scramble hero renders');
  assertIncludes(textA, 'WHAT MATTERS NEXT', 'scramble pressure card renders');
  assertIncludes(textA, 'SIDE GAMES LIVE NOW', 'scramble sidegame rail renders');

  await page.goto(`${process.env.BASE_URL}/${process.env.SLUG_B}/#dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const textB = await page.locator('body').innerText();
  assertIncludes(textB, 'LIVE STANDINGS', 'scramble standings header renders');
  const textBUpper = textB.toUpperCase();
  if (!(textBUpper.includes('CLUBHOUSE BOARD') || textBUpper.includes('FINAL BOARD'))) {
    console.error('FAIL scramble premium leaderboard copy renders');
    process.exit(1);
  }
  console.log('PASS scramble premium leaderboard copy renders');
  if (!(textB.includes('CHECK THE BAR') || textB.includes('OPEN THE BAR'))) {
    console.error('FAIL scramble hero actions render');
    process.exit(1);
  }
  console.log('PASS scramble hero actions render');

  await browser.close();
})().catch((err) => {
  console.error(`FAIL ${err.message || err}`);
  process.exit(1);
});
EOF

BASE_URL="$BASE_URL" SLUG_A="$SLUG_A" SLUG_B="$SLUG_B" npx -y -p playwright@1.52.0 bash -lc "
  set -euo pipefail
  export NODE_PATH=\"\$(dirname \"\$(dirname \"\$(command -v playwright)\")\")\"
  node \"$TMP_JS\"
"
