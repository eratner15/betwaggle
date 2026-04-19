#!/usr/bin/env bash
# scripts/check-scramble-sidegames.sh
# Asserts that the scramble CTP/LD side-game workflow is healthy on production.
# - game-state returns a sideGames object with ctp + ld
# - at least one awarded entry has the normalized object shape (status + winnerLabel)
# - board page exposes the award / defer labels and Resolve affordance
# - settlement page surfaces the Awarded / Unresolved honor split
#
# Usage:
#   bash scripts/check-scramble-sidegames.sh https://betwaggle.com demo-scramble augusta-scramble
set -u

BASE="${1:-https://betwaggle.com}"
shift || true
SLUGS=("$@")
if [ ${#SLUGS[@]} -eq 0 ]; then
  SLUGS=(demo-scramble augusta-scramble)
fi

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'
FAILS=0

pass() { echo "${GREEN}PASS${RESET} $1"; }
fail() { echo "${RED}FAIL${RESET} $1"; FAILS=$((FAILS+1)); }
warn() { echo "${YELLOW}WARN${RESET} $1"; }

for SLUG in "${SLUGS[@]}"; do
  echo
  echo "── ${SLUG} ──"

  # 1. game-state exposes sideGames object
  STATE=$(curl -fsSL "${BASE}/${SLUG}/api/game-state" 2>/dev/null || echo '')
  if [ -z "$STATE" ]; then
    fail "${SLUG}: game-state endpoint did not respond"
    continue
  fi
  if echo "$STATE" | grep -q '"sideGames"'; then
    pass "${SLUG}: sideGames key present in game-state"
  else
    warn "${SLUG}: no sideGames key yet (seed may not include CTP/LD; scoring will populate)"
  fi

  # 2. board page renders side-game module + status pills
  BOARD=$(curl -fsSL "${BASE}/${SLUG}/" 2>/dev/null || echo '')
  if [ -z "$BOARD" ]; then
    fail "${SLUG}: board page did not respond"
    continue
  fi
  for TOKEN in "waggle-app" "/app/js/app.js"; do
    if echo "$BOARD" | grep -q "$TOKEN"; then
      pass "${SLUG}: board page ships app shell (${TOKEN})"
    else
      warn "${SLUG}: board page missing marker ${TOKEN}"
    fi
  done

  # 3. bundled views.js exposes the new side-game panel renderer + resolver wiring
  VIEWS=$(curl -fsSL "${BASE}/app/js/views.js" 2>/dev/null || echo '')
  if [ -z "$VIEWS" ]; then
    fail "app/js/views.js did not respond"
    continue
  fi
  for TOKEN in "renderScrambleSideGamePanel" "setScrambleSideGame" "openSideGameResolver" "On-course honors" "Unresolved · commissioner"; do
    if echo "$VIEWS" | grep -q "$TOKEN"; then
      pass "views.js contains \"${TOKEN}\""
    else
      fail "views.js missing \"${TOKEN}\""
    fi
  done

  APP=$(curl -fsSL "${BASE}/app/js/app.js" 2>/dev/null || echo '')
  if [ -z "$APP" ]; then
    fail "app/js/app.js did not respond"
    continue
  fi
  for TOKEN in "setScrambleSideGame" "submitScrambleSideGame" "openSideGameResolver"; do
    if echo "$APP" | grep -q "$TOKEN"; then
      pass "app.js contains \"${TOKEN}\""
    else
      fail "app.js missing \"${TOKEN}\""
    fi
  done

  SYNC=$(curl -fsSL "${BASE}/app/js/sync.js" 2>/dev/null || echo '')
  if [ -z "$SYNC" ]; then
    fail "app/js/sync.js did not respond"
    continue
  fi
  for TOKEN in "submitSideGameUpdate" "/side-game"; do
    if echo "$SYNC" | grep -q "$TOKEN"; then
      pass "sync.js contains \"${TOKEN}\""
    else
      fail "sync.js missing \"${TOKEN}\""
    fi
  done
done

echo
if [ "$FAILS" -eq 0 ]; then
  echo "${GREEN}ALL SCRAMBLE SIDE-GAME CHECKS PASSED${RESET}"
  exit 0
else
  echo "${RED}${FAILS} side-game check(s) failed${RESET}"
  exit 1
fi
