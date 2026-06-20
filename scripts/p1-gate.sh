#!/usr/bin/env bash
# P1 gate loop step: build -> serve -> run gate -> teardown. Exit code = gate.
set -u
cd "$(dirname "$0")/.." || exit 2

echo "### [1/3] build"
npm run build || { echo "BUILD FAILED"; exit 2; }

echo "### [2/3] preview"
npm run preview > /tmp/p1-preview.log 2>&1 &
PV=$!
trap 'kill "$PV" 2>/dev/null' EXIT
for _ in $(seq 1 40); do
  curl -fs http://localhost:4173/ >/dev/null 2>&1 && break
  sleep 0.5
done

echo "### [3/3] gate"
node scripts/gate.mjs
exit $?
