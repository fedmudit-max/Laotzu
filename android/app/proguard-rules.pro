# King — ProGuard / R8 keep rules
#
# release.minifyEnabled is false today (see app/build.gradle).
# BEFORE turning minify on: keep rules must stay in sync with native plugins,
# then smoke-test a release APK on a real device:
#   - KingBilling (queryProducts, queryPurchases)
#   - KingReminder (schedule, notification tap → log)
#
# See ARCHITECTURE.md → Android release builds.

# Capacitor bridge + @CapacitorPlugin discovery
-keep class com.getcapacitor.** { *; }
-keepattributes *Annotation*
-keepattributes JavascriptInterface

# King native plugins (billing, reminder, backup, receivers)
-keep class com.kingtracker.app.** { *; }

# Google Play Billing
-keep class com.android.billingclient.** { *; }

# Readable stack traces if minify strips line numbers (optional but useful)
-keepattributes SourceFile,LineNumberTable
