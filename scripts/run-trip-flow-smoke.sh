#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

npx -y -p playwright@1.52.0 bash -lc '
  set -euo pipefail
  export NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")"
  node "'"${ROOT_DIR}"'/scripts/trip-flow-smoke.js"
'
