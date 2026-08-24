package com.kingtracker.app.reminder;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Calendar;

@CapacitorPlugin(
    name = "KingReminder",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class ReminderPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null) {
            call.reject("hour-and-minute-required");
            return;
        }
        int nextHour = ReminderPrefs.clampHour(hour);
        int nextMinute = ReminderPrefs.clampMinute(minute);
        int prevHour = ReminderPrefs.hour(getContext());
        int prevMinute = ReminderPrefs.minute(getContext());
        boolean wasNotifiedToday = ReminderPrefs.wasNotifiedToday(getContext());
        ReminderPrefs.save(getContext(), true, hour, minute);
        // If today's reminder already fired, and user moves the time to later today,
        // allow a second fire at the new later time (unless already logged today).
        boolean rescheduleToday = wasNotifiedToday
            && (nextHour != prevHour || nextMinute != prevMinute)
            && isLaterToday(nextHour, nextMinute);
        if (rescheduleToday) {
            ReminderPrefs.clearNotifiedDateSync(getContext());
        }
        ReminderScheduler.scheduleDaily(getContext(), rescheduleToday);
        call.resolve(statusObject());
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !ReminderScheduler.canScheduleExact(getContext())) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
            } catch (Exception e) {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(fallback);
                } catch (Exception ignored) { /* no settings activity */ }
            }
        }
        call.resolve(statusObject());
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(fallback);
            } catch (Exception ignored) { /* no settings activity */ }
        }
        call.resolve(statusObject());
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        // Premium pause / temporary stop: cancel the alarm only.
        // Keep enabled=true so BOOT / DATE_CHANGED / resume can still
        // reschedule. User turning Off passes disable=true.
        boolean disable = Boolean.TRUE.equals(call.getBoolean("disable", false));
        if (disable) {
            ReminderPrefs.setEnabled(getContext(), false);
        }
        ReminderScheduler.cancelDaily(getContext());
        call.resolve(statusObject());
    }

    @PluginMethod
    public void scheduleTest(PluginCall call) {
        int delay = call.getInt("delaySeconds", 120);
        ReminderScheduler.scheduleTest(getContext(), delay);
        JSObject result = statusObject();
        result.put("ok", true);
        result.put("delaySeconds", Math.max(1, delay));
        call.resolve(result);
    }

    @PluginMethod
    public void setLoggedDate(PluginCall call) {
        String dateKey = call.getString("dateKey", "");
        boolean changed = ReminderPrefs.setLoggedDate(getContext(), dateKey);
        if (ReminderPrefs.isLoggedToday(getContext())) {
            ReminderNotifier.cancel(getContext());
        }
        if (changed) {
            ReminderScheduler.rescheduleIfEnabled(getContext());
        }
        JSObject result = statusObject();
        result.put("loggedDate", ReminderPrefs.loggedDate(getContext()));
        result.put("loggedToday", ReminderPrefs.isLoggedToday(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingLog(PluginCall call) {
        String kind = ReminderPrefs.takePendingLog(getContext());
        JSObject result = new JSObject();
        result.put("action", kind);
        if (!kind.isEmpty()) {
            ReminderNotifier.cancel(getContext());
        }
        call.resolve(result);
    }

    @Override
    protected void handleOnResume() {
        ReminderScheduler.rescheduleIfEnabled(getContext());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        String kind = ReminderIntents.logKind(intent);
        if (kind == null) return;
        ReminderPrefs.setPendingLog(getContext(), kind);
        ReminderNotifier.cancel(getContext());
        JSObject data = new JSObject();
        data.put("action", kind);
        notifyListeners("pendingLog", data);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("notifications", "granted");
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "onNotificationsPermission");
    }

    @PermissionCallback
    private void onNotificationsPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", getPermissionState("notifications").toString().toLowerCase());
        call.resolve(result);
    }

    private JSObject statusObject() {
        boolean notificationsEnabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        boolean enabled = ReminderPrefs.isEnabled(getContext());
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("hour", ReminderPrefs.hour(getContext()));
        result.put("minute", ReminderPrefs.minute(getContext()));
        result.put("scheduled", enabled);
        result.put("nextAt", enabled
            ? ReminderScheduler.nextTriggerMillis(
                getContext(),
                ReminderPrefs.hour(getContext()),
                ReminderPrefs.minute(getContext())
            )
            : 0);
        result.put("loggedToday", ReminderPrefs.isLoggedToday(getContext()));
        result.put("notificationsAllowed", notificationsEnabled);
        result.put("exactAlarmsAllowed", ReminderScheduler.canScheduleExact(getContext()));
        String scheduleMode = ReminderScheduler.lastScheduleModeName();
        result.put("scheduleMode", scheduleMode);
        result.put("usesAlarmClock", "alarmClock".equals(scheduleMode));
        result.put("lastFiredAt", ReminderPrefs.lastFiredAt(getContext()));
        return result;
    }

    private boolean isLaterToday(int hour, int minute) {
        Calendar now = Calendar.getInstance();
        int nowMinutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        int nextMinutes = ReminderPrefs.clampHour(hour) * 60 + ReminderPrefs.clampMinute(minute);
        return nextMinutes > nowMinutes;
    }
}
