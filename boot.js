/**
 * boot.js — Service worker, button router, app startup. Load last.
 */

function registerServiceWorkerDeferred() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    var isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocalDev) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            regs.forEach(function (reg) { reg.unregister(); });
        }).catch(function () {});
        if (typeof caches !== 'undefined') {
            caches.keys().then(function (keys) {
                keys.forEach(function (key) { caches.delete(key); });
            }).catch(function () {});
        }
        return;
    }

    function register() {
        navigator.serviceWorker.register('./sw.js').then(function (reg) {
            reg.update().catch(function () {});
        }).catch(function () {});
    }

    if (document.readyState === 'complete') {
        setTimeout(register, 1500);
    } else {
        window.addEventListener('load', function onLoad() {
            window.removeEventListener('load', onLoad);
            setTimeout(register, 1500);
        });
    }
}

registerServiceWorkerDeferred();

function dismissLoadScreen() {
    var ls = document.getElementById('loadScreen');
    if (!ls) return;
    ls.style.pointerEvents = 'none';
    ls.style.opacity = '0';
    setTimeout(function () { ls.style.display = 'none'; }, 300);
}

function showFileProtocolBanner() {
    if (location.protocol !== 'file:') return;
    var bar = document.createElement('div');
    bar.id = 'fileProtocolBanner';
    bar.textContent = 'Running from a local file — your progress saves in this browser on this device.';
    bar.style.cssText = [
        'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:5000',
        'padding:10px 12px', 'border-radius:12px', 'background:#1d1d1f', 'color:#fff',
        'font:600 12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif', 'text-align:center',
        'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
    ].join(';');
    document.body.appendChild(bar);
}

(function () {
    'use strict';
    if (window.__KING_NOFAP_BOOTED__) return;
    window.__KING_NOFAP_BOOTED__ = true;

    function handleDataAction(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;

        var action = btn.dataset.action;
        var now = Date.now();
        if (btn === lastActionTap.btn && action === lastActionTap.action && now - lastActionTap.at < 600) return;
        lastActionTap = { btn: btn, action: action, at: now };

        if (handlePremiumAction(action)) return;

        var actions = {
            success: handleSuccess,
            'modal-fail': function () { showModal('fail'); },
            'modal-reset': function () { showModal('reset'); },
            urge: startUrgeSurf,
            'tab-0': function () { switchTab(0); },
            'tab-1': function () { switchTab(1); },
            'tab-2': function () { switchTab(2); },
            'month-prev': function () { monthNav(-1); },
            'month-next': function () { monthNav(1); },
            'chart-prev': function () { chartNav(-1); },
            'chart-next': function () { chartNav(1); },
            'chart-streaks': function () { switchChartMode('streaks'); },
            'chart-journeys': function () { switchChartMode('journeys'); },
            onboardingNext: onboardingNext,
            onboardingSkip: completeOnboarding,
            'yesterday-strong': function () { logYesterday('strong'); },
            'yesterday-slip': function () { logYesterday('slip'); },
            closeCelebration: closeCelebration,
            modalCancel: closeModal,
            modalConfirm: confirmAction,
            urgeSurvived: urgeSurvived,
            closeUrge: closeUrge,
            closeCompare: closeCompare,
            'dev-next-day': devAdvanceOneDay,
            'dev-seven-days': devAdvanceSevenDays,
            'export-backup': exportProgressBackup,
            'import-backup': openImportPicker,
        };
        if (actions[action]) actions[action]();
    }

    document.addEventListener('click', handleDataAction, true);

    var celebOverlay = document.getElementById('celebrationOverlay');
    if (celebOverlay) {
        celebOverlay.addEventListener('click', function (e) {
            if (e.target.id === 'celebrationOverlay') closeCelebration();
        });
    }

    var resetInput = document.getElementById('resetConfirmInput');
    if (resetInput) resetInput.addEventListener('input', checkResetInput);

    var importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', onImportFileSelected);

    window.chartNav = chartNav;
    window.toggleSciencePhase = toggleSciencePhase;

    var refreshTimer = null;

    function paintApp(deferHeavy) {
        try { renderAll({ deferHeavy: !!deferHeavy }); } catch (err) { console.error('King render failed:', err); }
    }

    function runDayCheckAndRepaint() {
        try {
            if (safeGet('onboardingComplete')) checkNewDay();
        } catch (err) {
            console.error('King day check failed:', err);
        }
        paintApp(false);
    }

    function refreshOnAppOpen() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () {
            refreshTimer = null;
            runDayCheckAndRepaint();
        }, 50);
    }

    function deferStartupHeavyWork() {
        var run = function () {
            try {
                if (safeGet('onboardingComplete')) checkNewDay();
            } catch (err) {
                console.error('King day check failed:', err);
            }
            try { renderDeferredHeavy(); } catch (err) { console.error('King deferred render failed:', err); }
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 1200 });
        } else {
            setTimeout(run, 50);
        }
    }

    function startApp() {
        try { initFirebase(); } catch (err) { console.error('King firebase init failed:', err); }
        try { init(); } catch (err) { console.error('King init failed:', err); }
        initPremiumStartup();
        paintApp(true);
        try { checkOnboarding(); } catch (err) { console.error('King onboarding failed:', err); }
        dismissLoadScreen();
        deferStartupHeavyWork();
    }

    showFileProtocolBanner();
    startApp();

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            refreshOnAppOpen();
            if (safeGet('onboardingComplete')) {
                try { updateWeeklyTravelerPosition(); } catch (err) { console.error('King weekly render failed:', err); }
            }
        }
    });

    setInterval(function () {
        if (document.visibilityState === 'visible' && safeGet('onboardingComplete')) {
            try { updateWeeklyTravelerPosition(); } catch (err) { console.error('King weekly render failed:', err); }
        }
    }, 60 * 1000);

    window.addEventListener('pageshow', function (e) {
        if (e.persisted) refreshOnAppOpen();
    });

})();

    