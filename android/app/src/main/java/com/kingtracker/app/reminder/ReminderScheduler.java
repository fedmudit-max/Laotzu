package com.kingtracker.app.reminder;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.os.Build;
import java.util.Calendar;

public final class ReminderScheduler {
  enum ScheduleMode {
    ALARM_CLOCK,
    EXACT,
    INEXACT
  }

    static final String ACTION_DAILY = "com.kingtracker.app.REMIND_DAILY";
    static final String ACTION_TEST = "com.kingtracker.app.REMIND_TEST";
    static final int REQUEST_DAILY = 7101;
    static final int REQUEST_TEST = 7102;
    static final int REQUEST_SHOW = 7103;
    static final int REQUEST_LOG_STRONG = 7104;
    static final int REQUEST_LOG_SLIP = 7105;
    static final int REQUEST_ALARM_CLOCK_SHOW = 7106;
    private static final String TAG = "KingReminder";
    private static volatile ScheduleMode lastScheduleMode = ScheduleMode.INEXACT;
    private static volatile long lastScheduleAtMs = 0L;
    private static volatile long lastScheduledWhen = 0L;

    static final String ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_CHANGED =
        "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_CHANGED";

    private ReminderScheduler() {}

    static String lastScheduleModeName() {
        switch (lastScheduleMode) {
            case ALARM_CLOCK:
                return "alarmClock";
            case EXACT:
                return "exact";
            default:
                return "inexact";
        }
    }

    static long nextTriggerMillis(Context context, int hour, int minute) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, ReminderPrefs.clampHour(hour));
        next.set(Calendar.MINUTE, ReminderPrefs.clampMinute(minute));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);

        if (ReminderPrefs.wasNotifiedToday(context)) {
            next.add(Calendar.DAY_OF_YEAR, 1);
            return next.getTimeInMillis();
        }

        long now = System.currentTimeMillis();
        if (next.getTimeInMillis() <= now) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }
        return next.getTimeInMillis();
    }

    static void scheduleDaily(Context context) {
        scheduleDaily(context, false);
    }

    static void scheduleDaily(Context context, boolean forceSet) {
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
        long now = System.currentTimeMillis();
        if (!forceSet
            && when == lastScheduledWhen
            && now - lastScheduleAtMs < 30_000L
            && lastScheduleMode != ScheduleMode.INEXACT) {
            Log.i(TAG, "skip duplicate schedule at " + when);
            return;
        }
        lastScheduleAtMs = now;
        lastScheduledWhen = when;
        setWakeup(context, when, dailyIntent(context));
        ReminderPrefs.setScheduleMode(context, lastScheduleModeName());
        Log.i(TAG, lastScheduleModeName() + " daily at " + when);
    }

    public static void scheduleTest(Context context, int delaySeconds) {
        int wait = Math.max(1, delaySeconds);
        long when = System.currentTimeMillis() + wait * 1000L;
        PendingIntent pi = pendingBroadcast(context, REQUEST_TEST, ACTION_TEST);
        setWakeup(context, when, pi);
    }

    static void cancelDaily(Context context) {
        lastScheduledWhen = 0L;
        AlarmManager am = alarmManager(context);
        if (am != null) {
            am.cancel(dailyIntent(context));
        }
        ReminderNotifier.cancel(context);
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
        if (am == null) {
            lastScheduleMode = ScheduleMode.INEXACT;
            return;
        }
        // setAlarmClock: on-time through Doze; Play-appropriate for user-scheduled daily reminders.
        // SCHEDULE_EXACT_ALARM (user-granted) required on Android 12+; inexact fallback if denied.
        try {
            PendingIntent show = PendingIntent.getActivity(
                context.getApplicationContext(),
                REQUEST_ALARM_CLOCK_SHOW,
                ReminderIntents.openApp(context),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(when, show), alarmIntent);
            lastScheduleMode = ScheduleMode.ALARM_CLOCK;
            return;
        } catch (Exception e) {
            Log.w(TAG, "setAlarmClock failed: " + e.getMessage());
        }
        if (canScheduleExact(am)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarmIntent);
                lastScheduleMode = ScheduleMode.EXACT;
                return;
            } catch (SecurityException e) {
                Log.w(TAG, "setExact failed: " + e.getMessage());
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, alarmIntent);
        lastScheduleMode = ScheduleMode.INEXACT;
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
        intent.setPackage(context.getPackageName());
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
