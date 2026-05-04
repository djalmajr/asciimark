#!/usr/bin/env bash
# Capture a coverage summary (line %, function %) for both the Bun
# (packages/core) and Rust (apps/desktop/src-tauri) sides into
# `packages/core/__coverage__/last-run.json`. Compare against the
# committed baseline at `packages/core/__coverage__/baseline.json` if
# one exists; fail if either ratio drops by more than 2 percentage
# points.
#
#   bun run coverage:snapshot              # diff against baseline
#   COVERAGE_UPDATE_BASELINE=1 ...         # accept current as new baseline
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p packages/core/__coverage__

# ─── Bun coverage (packages/core) ───────────────────────────────────────────

BUN_OUT=$(cd packages/core && bun test --coverage --coverage-reporter=text 2>&1 || true)
BUN_LINE=$(echo "$BUN_OUT" | awk '/^All files/ { print $5; exit }')
BUN_FUNC=$(echo "$BUN_OUT" | awk '/^All files/ { print $3; exit }')

# ─── Rust coverage (apps/desktop/src-tauri) ─────────────────────────────────

RUST_OUT=$(cd apps/desktop/src-tauri && cargo llvm-cov --lib --summary-only 2>&1 || true)
# Last data row of the summary table holds totals.
RUST_LINE=$(echo "$RUST_OUT" | awk '/^TOTAL/ { print $7; exit }' | tr -d '%')
RUST_FUNC=$(echo "$RUST_OUT" | awk '/^TOTAL/ { print $4; exit }' | tr -d '%')

CURRENT_FILE=packages/core/__coverage__/last-run.json
BASELINE_FILE=packages/core/__coverage__/baseline.json

cat > "$CURRENT_FILE" <<EOF
{
  "capturedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "bun": { "line": ${BUN_LINE:-0}, "func": ${BUN_FUNC:-0} },
  "rust": { "line": ${RUST_LINE:-0}, "func": ${RUST_FUNC:-0} }
}
EOF

echo
echo "Snapshot captured ($(date -u +%H:%M:%SZ)):"
cat "$CURRENT_FILE"
echo

if [ "${COVERAGE_UPDATE_BASELINE:-0}" = "1" ]; then
  cp "$CURRENT_FILE" "$BASELINE_FILE"
  echo "[coverage] baseline overwritten."
  exit 0
fi

if [ ! -f "$BASELINE_FILE" ]; then
  echo "[coverage] no baseline found; capturing current snapshot as the first one."
  cp "$CURRENT_FILE" "$BASELINE_FILE"
  exit 0
fi

# Diff against baseline (jq is the easy way to do field math).
if ! command -v jq >/dev/null 2>&1; then
  echo "[coverage] jq not installed; skipping diff comparison."
  exit 0
fi

DROP=$(jq -n \
  --argjson cur "$(cat "$CURRENT_FILE")" \
  --argjson base "$(cat "$BASELINE_FILE")" \
  '[
    {area: "bun.line",  delta: ($cur.bun.line - $base.bun.line)},
    {area: "bun.func",  delta: ($cur.bun.func - $base.bun.func)},
    {area: "rust.line", delta: ($cur.rust.line - $base.rust.line)},
    {area: "rust.func", delta: ($cur.rust.func - $base.rust.func)}
  ] | map(select(.delta < -2))')

if [ "$DROP" = "[]" ]; then
  echo "[coverage] OK — no metric dropped more than 2pp vs baseline."
  exit 0
fi

echo "[coverage] ✖ regression(s) > 2pp:"
echo "$DROP"
echo
echo "Accept the new floor with:  COVERAGE_UPDATE_BASELINE=1 bun run coverage:snapshot"
exit 1
