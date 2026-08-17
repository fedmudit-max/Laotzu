package com.kingtracker.app.reminder;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        android.util.Log.i("KingReminder", "receiver action=" + (intent != null ? intent.getAction() : "null"));
        if (intent == null) return;
        String action = intent.getAction();
        boolean test = ReminderScheduler.ACTION_TEST.equals(action);

        if (test) {
            ReminderNotifier.show(context, true);
            return;
        }

        if (!ReminderPrefs.isEnabled(context)) {
            ReminderScheduler.cancelDaily(context);
            return;
        }

        if (ReminderPrefs.skipDailyToday(context)) {
            android.util.Log.i("KingReminder", ReminderPrefs.isLoggedToday(context)
                ? "skip daily — already logged today"
                : "skip daily — already reminded today");
            if (ReminderPrefs.isLoggedToday(context)) {
                ReminderNotifier.cancel(context);
            }
            ReminderScheduler.scheduleDaily(context);
            return;
        }

        ReminderNotifier.show(context, false);
        ReminderPrefs.markNotifiedToday(context);
        ReminderScheduler.scheduleDaily(context);
    }
}
