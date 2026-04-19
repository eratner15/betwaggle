#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://betwaggle.com}"
SLUG="${2:-blue-monster-at-trump-national-doral-apr-753cae}"
EVENT_URL="${BASE_URL%/}/${SLUG}/"
OG_URL="${BASE_URL%/}/${SLUG}/og-image.svg"

page_html="$(curl -fsSL "$EVENT_URL")"
og_svg="$(curl -fsSL "$OG_URL")"

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if grep -Fq "$needle" <<<"$haystack"; then
    echo "PASS $label"
  else
    echo "FAIL $label"
    exit 1
  fi
}

assert_contains "$page_html" "<meta property=\"og:image\" content=\"$OG_URL\">" "event page uses dynamic OG image"
assert_contains "$page_html" "<meta name=\"twitter:image\" content=\"$OG_URL\">" "event page uses dynamic Twitter image"
assert_contains "$og_svg" "THE LEDGER" "OG image renders ledger headline"
assert_contains "$og_svg" "betwaggle.com/${SLUG}" "OG image renders event-specific path"

