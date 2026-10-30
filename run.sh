#!/bin/sh
# Chart Desk launcher — resolves node at start time (newest nvm install first,
# then Homebrew/system) and runs the server from this script's own directory.
# Handy for a login-item / LaunchAgent; for normal use, `npm start` is enough.
DIR="$(cd "$(dirname "$0")" && pwd)"
NVM_DIR="$HOME/.nvm/versions/node"
NODE=""
if [ -d "$NVM_DIR" ]; then
  NODE="$(ls -1 "$NVM_DIR" 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE" ] && NODE="$NVM_DIR/$NODE/bin/node"
fi
[ -x "$NODE" ] || NODE="$(command -v node)"
[ -x "$NODE" ] || { for p in /opt/homebrew/bin/node /usr/local/bin/node; do [ -x "$p" ] && NODE="$p" && break; done; }
[ -x "$NODE" ] || { echo "chart-desk: no node binary found" >&2; exit 1; }
echo "chart-desk: starting with $NODE ($($NODE --version))"
exec "$NODE" "$DIR/server.mjs"
