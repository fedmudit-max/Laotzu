package com.kingtracker.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.kingtracker.app.billing.BillingPlugin;
import com.kingtracker.app.reminder.ReminderIntents;
import com.kingtracker.app.reminder.ReminderNotifier;
import com.kingtracker.app.reminder.ReminderPlugin;
import com.kingtracker.app.reminder.ReminderPrefs;

public class MainActivity extends BridgeActivity {
    private static final int KING_SPLASH_GREEN = 0xFF34C759;
    private static final int NATIVE_SPLASH_FAILSAFE_MS = 600;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean keepNativeSplash = true;
    private volatile boolean quotePainted = false;
    private volatile boolean splashHidden = false;
    private volatile boolean splashNotified = false;
    private long splashShownAt;


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        splashShownAt = SystemClock.elapsedRealtime();
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> keepNativeSplash);
        splashScreen.setOnExitAnimationListener(view -> {
            view.remove();
            notifySplashGone();
        });
        registerPlugin(ReminderPlugin.class);
        registerPlugin(BillingPlugin.class);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageStarted(WebView webView) {
                if (webView != null) {
                    webView.setBackgroundColor(KING_SPLASH_GREEN);
                }
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                markQuotePainted();
            }

            @Override
            public void onPageLoaded(WebView webView) {
                markQuotePainted();
            }

            @Override
            public void onReceivedError(WebView webView) {
                markQuotePainted();
                hideNativeSplash();
            }
        });
        if (savedInstanceState == null) {
            captureLogAction(getIntent());
        }
        super.onCreate(savedInstanceState);
        paintSurface();
        disableForceDark();
        stripLogExtra(getIntent());
        mainHandler.postDelayed(this::hideNativeSplash, NATIVE_SPLASH_FAILSAFE_MS);
    }

    private void markQuotePainted() {
        quotePainted = true;
        maybeHideNativeSplash();
    }

    private void maybeHideNativeSplash() {
        if (!quotePainted) return;
        hideNativeSplash();
    }

    private void hideNativeSplash() {
        if (splashHidden) return;
        splashHidden = true;
        keepNativeSplash = false;
        disableForceDark();
        notifySplashGone();
    }

    private void notifySplashGone() {
        if (splashNotified) return;
        splashNotified = true;
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        long logoMs = Math.max(0, SystemClock.elapsedRealtime() - splashShownAt);
        String js = "window.__kingSplashMs=" + logoMs + ";window.__kingSplashGone=true;";
        webView.post(() -> webView.evaluateJavascript(js, null));
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

    private void paintSurface() {
        getWindow().setBackgroundDrawableResource(R.drawable.launch_king);
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
