package com.kingtracker.app.reminder;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import java.util.Calendar;

public final class ReminderScheduler {
    static final String ACTION_DAILY = "com.kingtracker.app.REMIND_DAILY";
    static final String ACTION_TEST = "com.kingtracker.app.REMIND_TEST";
    static final int REQUEST_DAILY = 7101;
    static final int REQUEST_TEST = 7102;
    static final int REQUEST_SHOW = 7103;
    static final int REQUEST_LOG_STRONG = 7104;
    static final int REQUEST_LOG_SLIP = 7105;

    private ReminderScheduler() {}

    static long nextTriggerMillis(Context context, int hour, int minute) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, ReminderPrefs.clampHour(hour));
        next.set(Calendar.MINUTE, ReminderPrefs.clampMinute(minute));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }
        if (ReminderPrefs.skipDailyToday(context) && isSameWallDate(next, Calendar.getInstance())) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }
        return next.getTimeInMillis();
    }

    private static boolean isSameWallDate(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
            && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    static void scheduleDaily(Context context) {
        ReminderNotifier.ensureChannel(context);
        if (!ReminderPrefs.isEnabled(context)) {
            cancelDaily(context);
            return;
        }
        long when = nextTriggerMillis(
            context,
            ReminderPrefs.hour(context),
            ReminderPrefs.minute(context)
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
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarmIntent);
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
