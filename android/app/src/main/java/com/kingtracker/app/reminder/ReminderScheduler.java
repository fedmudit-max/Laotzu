package com.kingtracker.app.reminder;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Calendar;

public final class ReminderScheduler {
    static final String ACTION_DAILY = "com.kingtracker.app.REMIND_DAILY";
    static final String ACTION_TEST = "com.kingtracker.app.REMIND_TEST";
    static final int REQUEST_DAILY = 7101;
    static final int REQUEST_TEST = 7102;
    static final int REQUEST_SHOW = 7103;
    static final int REQUEST_LOG_STRONG = 7104;
    static final int REQUEST_LOG_SLIP = 7105;
    static final int REQUEST_ALARM_CLOCK_SHOW = 7106;
    private static final long DUE_TODAY_DELAY_MS = 2000L;

    private ReminderScheduler() {}

    static long nextTriggerMillis(Context context, int hour, int minute) {
        return nextTriggerMillis(context, hour, minute, false);
    }

    static long nextTriggerMillis(Context context, int hour, int minute, boolean forceTodayAtNewTime) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, ReminderPrefs.clampHour(hour));
        next.set(Calendar.MINUTE, ReminderPrefs.clampMinute(minute));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        long now = System.currentTimeMillis();

        // User moved today's reminder to a later time after an earlier fire — honor today
        // unless they already logged (no second nudge needed).
        if (forceTodayAtNewTime && !ReminderPrefs.isLoggedToday(context)) {
            if (next.getTimeInMillis() > now) {
                return next.getTimeInMillis();
            }
            return now + DUE_TODAY_DELAY_MS;
        }

        boolean skipToday = ReminderPrefs.skipDailyToday(context);

        if (skipToday) {
            if (next.getTimeInMillis() <= now || isSameWallDate(next, Calendar.getInstance())) {
                next.add(Calendar.DAY_OF_YEAR, 1);
            }
            return next.getTimeInMillis();
        }

        // Still due today (not logged, not already reminded). Do not push to
        // tomorrow — that cancelled tonight's pending alarm when King was opened.
        if (next.getTimeInMillis() <= now) {
            return now + DUE_TODAY_DELAY_MS;
        }
        return next.getTimeInMillis();
    }

    private static boolean isSameWallDate(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
            && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    static void scheduleDaily(Context context) {
        scheduleDaily(context, false);
    }

    static void scheduleDaily(Context context, boolean forceTodayAtNewTime) {
        ReminderNotifier.ensureChannel(context);
        if (!ReminderPrefs.isEnabled(context)) {
            cancelDaily(context);
            return;
        }
        long when = nextTriggerMillis(
            context,
            ReminderPrefs.hour(context),
            ReminderPrefs.minute(context),
            forceTodayAtNewTime
        );
        setWakeup(context, when, dailyIntent(context));
    }

    public static void scheduleTest(Context context, int delaySeconds) {
        int wait = Math.max(1, delaySeconds);
        long when = System.currentTimeMillis() + wait * 1000L;
        PendingIntent pi = pendingBroadcast(context, REQUEST_TEST, ACTION_TEST);
        setWakeup(context, when, pi);
    }

    static void cancelDaily(Context context) {
        AlarmManager am = alarmManager(context);
        if (am != null) {
            am.cancel(dailyIntent(context));
        }
        ReminderNotifier.cancel(context);
    }

    static void cancelTest(Context context) {
        AlarmManager am = alarmManager(context);
        if (am != null) {
            am.cancel(pendingBroadcast(context, REQUEST_TEST, ACTION_TEST));
        }
    }

    static void rescheduleIfEnabled(Context context) {
        if (ReminderPrefs.isEnabled(context)) {
            scheduleDaily(context);
        } else {
            cancelDaily(context);
        }
    }

    private static void setWakeup(Context context, long when, PendingIntent alarmIntent) {
        AlarmManager am = alarmManager(context);
        if (am == null) return;
        // AlarmClock: fires on time through Doze, no SCHEDULE_EXACT_ALARM needed,
        // and is the most reliable path on Samsung OEMs.
        try {
            PendingIntent show = PendingIntent.getActivity(
                context.getApplicationContext(),
                REQUEST_ALARM_CLOCK_SHOW,
                ReminderIntents.openApp(context),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(when, show), alarmIntent);
            return;
        } catch (Exception ignored) {
            // Fall through.
        }
        if (canScheduleExact(am)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarmIntent);
                return;
            } catch (SecurityException ignored) {
                // Fall through to inexact if exact permission was revoked.
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarmIntent);
    }

    static boolean canScheduleExact(Context context) {
        AlarmManager am = alarmManager(context);
        return am != null && canScheduleExact(am);
    }

    private static boolean canScheduleExact(AlarmManager am) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return am.canScheduleExactAlarms();
    }

    private static PendingIntent dailyIntent(Context context) {
        return pendingBroadcast(context, REQUEST_DAILY, ACTION_DAILY);
    }

    private static PendingIntent pendingBroadcast(Context context, int requestCode, String action) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(
            context.getApplicationContext(),
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static AlarmManager alarmManager(Context context) {
        return (AlarmManager) context.getApplicationContext().getSystemService(Context.ALARM_SERVICE);
    }
}
