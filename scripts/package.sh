#!/bin/sh
# Builds the Chrome Web Store upload: dist/sloppyyt-<version>.zip
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
OUT="dist/sloppyyt-$VERSION.zip"
mkdir -p dist && rm -f "$OUT"
(cd extension && zip -qr "../$OUT" . -x '.*' -x '*/.*' -x 'config.local.js')
echo "$OUT"
unzip -l "$OUT" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4}'
