package com.kingtracker.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.kingtracker.app.reminder.ReminderIntents;
import com.kingtracker.app.reminder.ReminderNotifier;
import com.kingtracker.app.reminder.ReminderPlugin;
import com.kingtracker.app.reminder.ReminderPrefs;

public class MainActivity extends BridgeActivity {
    private static final int KING_SPLASH_GREEN = 0xFF34C759;
    private volatile boolean keepNativeSplash = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> keepNativeSplash);
        registerPlugin(ReminderPlugin.class);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                keepNativeSplash = false;
            }

            @Override
            public void onPageLoaded(WebView webView) {
                keepNativeSplash = false;
            }

            @Override
            public void onReceivedError(WebView webView) {
                keepNativeSplash = false;
            }
        });
        if (savedInstanceState == null) {
            captureLogAction(getIntent());
        }
        super.onCreate(savedInstanceState);
        paintLaunchChrome();
        disableForceDark();
        stripLogExtra(getIntent());
        new Handler(Looper.getMainLooper()).postDelayed(() -> keepNativeSplash = false, 2500);
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

    private void paintLaunchChrome() {
        getWindow().setBackgroundDrawableResource(R.color.king_splash);
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.setBackgroundColor(KING_SPLASH_GREEN);
        View parent = (View) webView.getParent();
        if (parent != null) {
            parent.setBackgroundColor(KING_SPLASH_GREEN);
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
