package com.kingtracker.app.reminder;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Calendar;

public final class ReminderPrefs {
    static final String PREFS = "king_reminder";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_HOUR = "hour";
    static final String KEY_MINUTE = "minute";
    static final String KEY_PENDING_LOG = "pendingLog";
    static final String KEY_LOGGED_DATE = "loggedDate";
    static final String KEY_NOTIFIED_DATE = "notifiedDate";

    static final int DEFAULT_HOUR = 20;
    static final int DEFAULT_MINUTE = 0;

    private ReminderPrefs() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    static int hour(Context context) {
        return clampHour(prefs(context).getInt(KEY_HOUR, DEFAULT_HOUR));
    }

    static int minute(Context context) {
        return clampMinute(prefs(context).getInt(KEY_MINUTE, DEFAULT_MINUTE));
    }

    static void save(Context context, boolean enabled, int hour, int minute) {
        prefs(context)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putInt(KEY_HOUR, clampHour(hour))
            .putInt(KEY_MINUTE, clampMinute(minute))
            .apply();
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    static String todayKey() {
        Calendar c = Calendar.getInstance();
        int y = c.get(Calendar.YEAR);
        int m = c.get(Calendar.MONTH) + 1;
        int d = c.get(Calendar.DAY_OF_MONTH);
        return y
            + "-"
            + (m < 10 ? "0" + m : String.valueOf(m))
            + "-"
            + (d < 10 ? "0" + d : String.valueOf(d));
    }

    static String loggedDate(Context context) {
        return prefs(context).getString(KEY_LOGGED_DATE, "");
    }

    static boolean isLoggedToday(Context context) {
        return todayKey().equals(loggedDate(context));
    }

    /** @return true if the stored date changed */
    static boolean setLoggedDate(Context context, String dateKey) {
        String next = normalizeDateKey(dateKey);
        String prev = loggedDate(context);
        if (next.equals(prev)) return false;
        prefs(context).edit().putString(KEY_LOGGED_DATE, next).apply();
        return true;
    }

    static String notifiedDate(Context context) {
        return prefs(context).getString(KEY_NOTIFIED_DATE, "");
    }

    static boolean wasNotifiedToday(Context context) {
        return todayKey().equals(notifiedDate(context));
    }

    static void markNotifiedToday(Context context) {
        prefs(context).edit().putString(KEY_NOTIFIED_DATE, todayKey()).apply();
    }

    /** True when today should not get another daily reminder. */
    static boolean skipDailyToday(Context context) {
        return isLoggedToday(context) || wasNotifiedToday(context);
    }

    static String normalizeDateKey(String dateKey) {
        if (dateKey == null) return "";
        String trimmed = dateKey.trim();
        if (!trimmed.matches("\\d{4}-\\d{2}-\\d{2}")) return "";
        return trimmed;
    }

    public static void setPendingLog(Context context, String kind) {
        if (!"strong".equals(kind) && !"slip".equals(kind)) return;
        prefs(context).edit().putString(KEY_PENDING_LOG, kind).apply();
    }

    public static String takePendingLog(Context context) {
        String kind = prefs(context).getString(KEY_PENDING_LOG, "");
        prefs(context).edit().remove(KEY_PENDING_LOG).apply();
        if ("strong".equals(kind) || "slip".equals(kind)) return kind;
        return "";
    }

    static int clampHour(int hour) {
        if (hour < 0) return 0;
        if (hour > 23) return 23;
        return hour;
    }

    static int clampMinute(int minute) {
        if (minute < 0) return 0;
        if (minute > 59) return 59;
        return minute;
    }
}
