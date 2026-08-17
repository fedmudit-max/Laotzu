package com.kingtracker.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.kingtracker.app.reminder.ReminderIntents;
import com.kingtracker.app.reminder.ReminderNotifier;
import com.kingtracker.app.reminder.ReminderPlugin;
import com.kingtracker.app.reminder.ReminderPrefs;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReminderPlugin.class);
        if (savedInstanceState == null) {
            captureLogAction(getIntent());
        }
        super.onCreate(savedInstanceState);
        disableForceDark();
        stripLogExtra(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        captureLogAction(intent);
        super.onNewIntent(intent);
        stripLogExtra(intent);
        setIntent(intent);
    }

    private void captureLogAction(Intent intent) {
        String kind = ReminderIntents.logKind(intent);
        if (kind == null) return;
        ReminderPrefs.setPendingLog(this, kind);
        ReminderNotifier.cancel(this);
    }

    private void stripLogExtra(Intent intent) {
        if (intent != null) {
            intent.removeExtra(ReminderIntents.EXTRA_LOG);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        disableForceDark();
    }

    private void disableForceDark() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return;
        }

        View decor = getWindow().getDecorView();
        decor.setForceDarkAllowed(false);

        if (getBridge() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        webView.setForceDarkAllowed(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            WebSettings settings = webView.getSettings();
            settings.setAlgorithmicDarkeningAllowed(false);
        }
    }
}
