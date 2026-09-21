#!/bin/sh
# Writes extension/config.local.js (gitignored) from the API_KEY in .env,
# so the unpacked extension picks up the key without pasting it into the popup.
set -e
cd "$(dirname "$0")/.."
KEY=$(grep -E '^\s*(TYPESAFE_)?API_KEY\s*=' .env | head -1 | sed 's/^[^=]*=[[:space:]]*//' | tr -d "\"'\r ")
[ -n "$KEY" ] || { echo "API_KEY not found in .env" >&2; exit 1; }
printf 'self.SLOPPY_CONFIG = { apiKey: "%s" };\n' "$KEY" > extension/config.local.js
echo "wrote extension/config.local.js — reload the extension to pick it up"
