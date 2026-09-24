#!/usr/bin/env bash
# Source/review archive for GPT, Claude, or human review — no Gradle build outputs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Running web:copy..."
npm run web:copy -s

VERSION="$(grep versionName android/app/build.gradle 2>/dev/null | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "review")"
STAMP="$(date +%Y%m%d)"
ZIP_NAME="King-${VERSION}-code-review-${STAMP}.zip"
OUT="${REVIEW_ZIP_OUT:-$ROOT/$ZIP_NAME}"

rm -f "$OUT"

echo "Creating $OUT ..."
zip -r "$OUT" . \
  -x ".git/*" \
  -x ".cursor/*" \
  -x "node_modules/*" \
  -x "android/.gradle/*" \
  -x "android/.gradle-user-home/*" \
  -x "android/local.properties" \
  -x "android/app/king-upload.keystore" \
  -x "android/keystore.properties" \
  -x "android/app/build/*" \
  -x "android/build/*" \
  -x "android/capacitor-cordova-android-plugins/build/*" \
  -x "android/*/build/*" \
  -x "android/*/*/build/*" \
  -x "ios/App/Pods/*" \
  -x "ios/App/build/*" \
  -x "ios/DerivedData/*" \
  -x "*.DS_Store" \
  -x "*__MACOSX*" \
  -x "*.zip"

if unzip -l "$OUT" | rg -q '/build/'; then
  echo "WARNING: archive still lists build/ paths:" >&2
  unzip -l "$OUT" | rg '/build/' | head -10 >&2
  exit 1
fi

echo "OK: no build/ paths in archive"
ls -lh "$OUT"
shasum -a 256 "$OUT"

if [[ -d "$HOME/Desktop" ]]; then
  cp "$OUT" "$HOME/Desktop/$(basename "$OUT")"
  echo "Copied to Desktop/$(basename "$OUT")"
fi
