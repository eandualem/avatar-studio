#!/usr/bin/env bash
# Start Blender with the bridge listening, idempotently.
#   scripts/blender-up.sh            # opens Blender (GUI) with the addon enabled
#   scripts/blender-up.sh FILE.blend # same, opening a file
# Exit 0 when port 9876 is listening. Never kills an existing Blender.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${BLENDER_PORT:-9876}"
BLENDER="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
listening() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; }

if listening; then echo "bridge already listening on $PORT"; exit 0; fi
[ -x "$BLENDER" ] || { echo "Blender not found at $BLENDER (set BLENDER_BIN)"; exit 1; }
uvx blender-mcp addon-paths 2>/dev/null | grep -q '(missing)' && uvx blender-mcp install-addon
mkdir -p "$ROOT/.tmp"
nohup "$BLENDER" "$@" --python "$ROOT/scripts/blender_boot.py" >"$ROOT/.tmp/blender.log" 2>&1 &
for _ in $(seq 1 60); do
  if listening; then echo "bridge listening on $PORT (log: .tmp/blender.log)"; exit 0; fi
  sleep 1
done
echo "Blender started but port $PORT never opened; see .tmp/blender.log"; exit 1
