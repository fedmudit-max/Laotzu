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
            ReminderPrefs.markFiredNow(context);
            return;
        }

        if (!ReminderPrefs.isEnabled(context)) {
            ReminderScheduler.cancelDaily(context);
            return;
        }

        if (ReminderPrefs.wasNotifiedToday(context)) {
            android.util.Log.i("KingReminder", "skip daily — already reminded today");
            ReminderScheduler.scheduleDaily(context);
            return;
        }

        ReminderNotifier.show(context, false);
        ReminderPrefs.markFiredNow(context);
        ReminderPrefs.markNotifiedToday(context);
        ReminderScheduler.scheduleDaily(context);
    }
}
