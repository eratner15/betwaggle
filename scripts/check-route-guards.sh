#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://betwaggle.com}"
PRIVATE_TOKEN="${WAGGLE_PRIVATE_ROUTE_TOKEN:-}"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

status_code() {
  local path="$1"
  shift
  curl -s -o /dev/null -w "%{http_code}" "$@" "${BASE_URL}${path}"
}

assert_code() {
  local expected="$1"
  local path="$2"
  shift 2
  local actual
  actual="$(status_code "$path" "$@")"
  if [[ "$actual" != "$expected" ]]; then
    fail "${path} expected ${expected}, got ${actual}"
  fi
  echo "OK: ${path} -> ${actual}"
}

echo "Checking route guards against ${BASE_URL}"

# Public aliases must always be hidden.
assert_code 404 /marketing
assert_code 404 /marketing/
assert_code 404 /gtm
assert_code 404 /gtm/
assert_code 404 /ads
assert_code 404 /ads/

# Private aliases must return 404 without auth.
assert_code 404 /marketing-private/
assert_code 404 /gtm-private/
assert_code 404 /ads-private/

# Optional token-gated check (only when token env var is provided).
if [[ -n "${PRIVATE_TOKEN}" ]]; then
  echo "Checking token-gated private route access"
  assert_code 200 /marketing-private/ -H "x-waggle-private-token: ${PRIVATE_TOKEN}"
  assert_code 200 /gtm-private/ -H "x-waggle-private-token: ${PRIVATE_TOKEN}"
  assert_code 200 /ads-private/ -H "x-waggle-private-token: ${PRIVATE_TOKEN}"
fi

echo "Route guard checks passed."
