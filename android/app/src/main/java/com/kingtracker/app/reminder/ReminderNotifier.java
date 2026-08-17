package com.kingtracker.app.reminder;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.kingtracker.app.R;

public final class ReminderNotifier {
    static final String CHANNEL_ID = "king_daily_reminder_v2";
    static final String LEGACY_CHANNEL_ID = "king_daily_reminder";
    static final int NOTIFICATION_ID = 7101;

    private ReminderNotifier() {}

    static void show(Context context, boolean test) {
        ensureChannel(context);
        Context app = context.getApplicationContext();

        PendingIntent content = activityIntent(app, ReminderIntents.openApp(app), ReminderScheduler.REQUEST_SHOW);
        PendingIntent strong = activityIntent(app, ReminderIntents.logAction(app, "strong"), ReminderScheduler.REQUEST_LOG_STRONG);
        PendingIntent slip = activityIntent(app, ReminderIntents.logAction(app, "slip"), ReminderScheduler.REQUEST_LOG_SLIP);

        String title = test
            ? context.getString(R.string.reminder_test_title)
            : context.getString(R.string.reminder_title);
        String body = context.getString(R.string.reminder_body);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(!test)
            .setDefaults(NotificationCompat.DEFAULT_SOUND)
            .setColor(0xFF34C759)
            .setContentIntent(content)
            .addAction(0, context.getString(R.string.reminder_action_strong), strong)
            .addAction(0, context.getString(R.string.reminder_action_slip), slip);

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        android.util.Log.i("KingReminder", test ? "show test notification" : "show daily notification");
    }

    public static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.deleteNotificationChannel(LEGACY_CHANNEL_ID);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.reminder_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(context.getString(R.string.reminder_channel_desc));
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static PendingIntent activityIntent(Context context, Intent intent, int requestCode) {
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
