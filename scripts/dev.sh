#!/usr/bin/env bash
# One command for local work: make sure the Avatar Studio runtime is serving
# on 7100, then run the Next.js app on 7140 in the foreground.
#   scripts/dev.sh                 # reuse a healthy Avatar runtime, else start one
#   RESTART_RUNTIME=1 scripts/dev.sh   # always start a fresh runtime first
# A runtime this script started stops when the app stops (Ctrl-C). A runtime
# it found already serving the Avatar profile is left running.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${RUNTIME_HOST:-127.0.0.1}"
PORT="${RUNTIME_PORT:-7100}"
BASE="http://$HOST:$PORT"
LOG="$APP_DIR/.tmp/runtime.log"

# The generic `assistant-runtime serve` answers /health too; the Avatar launch
# file is the one with GPT-Live on and delegation off.
avatar_runtime_ready() {
  local status
  status="$(curl -sf -m 2 "$BASE/api/voice/status" 2>/dev/null)" || return 1
  [[ "$status" == *'"enabled":true'* && "$status" == *'"delegation_enabled":false'* ]]
}

RUNTIME_PID=""
stop_runtime() {
  if [ -n "$RUNTIME_PID" ]; then
    echo "Stopping the runtime started by this session (pid $RUNTIME_PID)"
    kill "$RUNTIME_PID" 2>/dev/null || true
    wait "$RUNTIME_PID" 2>/dev/null || true
    # uv run may leave the serve process behind; free the port it holds.
    for pid in $(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
      kill "$pid" 2>/dev/null || true
    done
  fi
}
trap stop_runtime EXIT

if [ "${RESTART_RUNTIME:-0}" != "1" ] && avatar_runtime_ready; then
  echo "Runtime already serving the Avatar profile at $BASE; leaving it running"
else
  if curl -sf -m 2 "$BASE/health" >/dev/null 2>&1; then
    echo "Replacing the runtime on $PORT (not launched from runtime/avatar-runtime.env)"
  fi
  mkdir -p "$APP_DIR/.tmp"
  echo "Starting assistant-runtime on $BASE (log: $LOG)"
  "$APP_DIR/scripts/runtime-up.sh" >"$LOG" 2>&1 &
  RUNTIME_PID=$!
  for _ in $(seq 1 90); do
    if avatar_runtime_ready; then break; fi
    if ! kill -0 "$RUNTIME_PID" 2>/dev/null; then
      echo "Runtime exited before it became healthy; last lines of $LOG:" >&2
      tail -n 30 "$LOG" >&2
      exit 1
    fi
    sleep 1
  done
  if ! avatar_runtime_ready; then
    echo "Runtime did not become healthy within 90 s; see $LOG" >&2
    exit 1
  fi
  echo "Runtime ready: $BASE/health"
fi

cd "$APP_DIR"
bun run dev
