#!/usr/bin/env bash
# Device resilience checks for King (Android). Requires USB/wireless ADB.
# Usage: ./scripts/device-resilience-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="com.kingtracker.app"
ACTIVITY="${PKG}/.MainActivity"
ADB="${ADB:-adb}"

if ! command -v "$ADB" >/dev/null 2>&1; then
  if [[ -x "${ANDROID_HOME:-}/platform-tools/adb" ]]; then
    ADB="${ANDROID_HOME}/platform-tools/adb"
  elif [[ -x "/Users/muditpokhriyal/Library/Android/sdk/platform-tools/adb" ]]; then
    ADB="/Users/muditpokhriyal/Library/Android/sdk/platform-tools/adb"
  else
    echo "adb not found. Set ADB or ANDROID_HOME."
    exit 1
  fi
fi

devices="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "$devices" ]]; then
  echo "No Android device attached. Enable wireless debugging and reconnect."
  exit 1
fi

DEVICE="${DEVICE:-$(echo "$devices" | head -1)}"
echo "Using device: $DEVICE"

run_adb() { "$ADB" -s "$DEVICE" "$@"; }

log_reminder() {
  run_adb logcat -d -s KingReminder:* 2>/dev/null | tail -20
}

alarm_summary() {
  run_adb shell dumpsys alarm 2>/dev/null | grep -i kingtracker | head -10 || true
}

echo "=== 1. Launch app ==="
run_adb shell am start -n "$ACTIVITY" -W

echo "=== 2. Close app (HOME) ==="
run_adb shell input keyevent KEYCODE_HOME
sleep 2

echo "=== 3. Force-stop app ==="
run_adb shell am force-stop "$PKG"
sleep 2
log_reminder

echo "=== 4. Relaunch after force-stop ==="
run_adb shell am start -n "$ACTIVITY" -W
sleep 3
log_reminder
alarm_summary

echo "=== 5. Simulate app update (PACKAGE_REPLACED broadcast) ==="
run_adb shell am broadcast -a android.intent.action.MY_PACKAGE_REPLACED -p "$PKG" 2>/dev/null || true
sleep 2
log_reminder

echo "=== 6. Timezone change broadcast ==="
run_adb shell am broadcast -a android.intent.action.TIMEZONE_CHANGED 2>/dev/null || true
sleep 2
log_reminder

echo "=== 7. Date/time change broadcast ==="
run_adb shell am broadcast -a android.intent.action.TIME_CHANGED 2>/dev/null || true
sleep 2
log_reminder

echo ""
echo "Manual checks still required on device:"
echo "  - Reboot phone → reminder should still fire at set time"
echo "  - Change system date in Settings → journey day / reminders behave sensibly"
echo "  - Export backup → clear data or second device → import"
echo "  - npm run android:install over existing app → data + reminder persist"
echo ""
echo "Done. Review KingReminder log lines above for alarmClock scheduling."
