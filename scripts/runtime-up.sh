#!/usr/bin/env bash
# Start the one assistant-runtime Avatar Studio talks to (text, voice, body)
# from this repository's checked-in launch file. Run from anywhere:
#   scripts/runtime-up.sh            # 127.0.0.1:7100, replaces a previous runtime there
#   scripts/runtime-up.sh --no-replace
# RUNTIME_DIR points at the assistant-runtime checkout (default: ../assistant-runtime).
# Provider credentials stay in that checkout's .env; nothing here is a secret.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${RUNTIME_DIR:-$APP_DIR/../assistant-runtime}"
if [ ! -f "$RUNTIME_DIR/pyproject.toml" ]; then
  echo "assistant-runtime checkout not found at $RUNTIME_DIR (set RUNTIME_DIR)" >&2
  exit 1
fi
cd "$RUNTIME_DIR"
# Shell variables take precedence over --env-file values in uv.
export ASSISTANT__PROFILE="$APP_DIR/profiles/avatar-studio.toml"
export VOICE__CONVERSATION_INSTRUCTIONS_FILE="$APP_DIR/profiles/live-instructions.md"
if [ -z "${OAUTH__ENCRYPTION_KEY:-}" ]; then
  # Ephemeral: without a database nothing is persisted with it.
  OAUTH__ENCRYPTION_KEY="$(uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
  export OAUTH__ENCRYPTION_KEY
fi
exec uv run --env-file "$APP_DIR/runtime/avatar-runtime.env" \
  assistant-runtime serve --host "${RUNTIME_HOST:-127.0.0.1}" --port "${RUNTIME_PORT:-7100}" "$@"
