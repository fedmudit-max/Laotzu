package com.kingtracker.app.reminder;

import android.content.Context;
import android.content.Intent;
import com.kingtracker.app.MainActivity;

public final class ReminderIntents {
    public static final String EXTRA_LOG = "king_log";
    static final String ACTION_STRONG = "com.kingtracker.app.LOG_STRONG";
    static final String ACTION_SLIP = "com.kingtracker.app.LOG_SLIP";

    private ReminderIntents() {}

    static Intent openApp(Context context) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return launch;
    }

    static Intent logAction(Context context, String kind) {
        Intent intent = openApp(context);
        boolean strong = "strong".equals(kind);
        intent.setAction(strong ? ACTION_STRONG : ACTION_SLIP);
        intent.putExtra(EXTRA_LOG, strong ? "strong" : "slip");
        return intent;
    }

    public static String logKind(Intent intent) {
        if (intent == null) return null;
        String extra = intent.getStringExtra(EXTRA_LOG);
        if ("strong".equals(extra) || "slip".equals(extra)) return extra;
        String action = intent.getAction();
        if (ACTION_STRONG.equals(action)) return "strong";
        if (ACTION_SLIP.equals(action)) return "slip";
        return null;
    }
}
