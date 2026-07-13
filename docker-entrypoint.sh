#!/bin/sh
# Fix ownership of the mounted data volume, then drop from root to the app user.
# Synology (and most NAS) bind-mounts are owned by a host user, not uid 1000 —
# starting as root lets us chown /data before writing, avoiding a crash loop.
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec gosu node node server/index.js
fi

# Already unprivileged (e.g. compose `user:` override) — run directly.
exec node server/index.js
