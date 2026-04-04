#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_URL="${1:-https://betwaggle.com/demo/}"
OUT_PATH="${2:-/tmp/spotter-demo-iphone14.png}"
DEVICE="${SPOTTER_PLAYWRIGHT_DEVICE:-iPhone 14}"

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n "$@"
    return
  fi

  echo "ERROR: root or passwordless sudo is required to install browser deps." >&2
  echo "Run this from a privileged shell:" >&2
  echo "  sudo bash scripts/spotter-playwright-bootstrap.sh ${TARGET_URL} ${OUT_PATH}" >&2
  exit 1
}

echo "[spotter] Installing Linux browser dependencies via Playwright..."
run_as_root npx -y playwright@1.52.0 install-deps

echo "[spotter] Installing Playwright browser binaries (chromium + webkit)..."
cd "${ROOT_DIR}"
npx -y playwright@1.52.0 install chromium webkit

echo "[spotter] Running screenshot smoke test (${DEVICE})..."
npx -y playwright@1.52.0 screenshot --device="${DEVICE}" "${TARGET_URL}" "${OUT_PATH}"

echo "[spotter] OK: screenshot written to ${OUT_PATH}"
