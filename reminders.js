/**
 * reminders.js — Daily local check-in notifications.
 *
 * Layer: UI + device APIs (reads/writes reminder prefs on journey state via save).
 * Reliability: best-effort. Browsers may suspend timers when the app is fully closed;
 * re-opening King re-arms the next fire. Server push (later) would be more reliable.
 */

var __reminderPageTimer = null;
var __reminderUiBound = false;

function remindersSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
}

function getReminderHour() {
    return clampInt(state.reminderHour, 0, 23, 20);
}

function getReminderMinute() {
    return clampInt(state.reminderMinute, 0, 59, 0);
}

function formatReminderTimeLabel(hour, minute) {
    var d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Next fire time (ms). Skips today if clock already passed or user already logged today.
 */
function getNextReminderAt(hour, minute) {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    var alreadyLogged = state.todayStatus === 'success' || state.todayStatus === 'failed';
    if (next.getTime() <= now.getTime() + 20000 || alreadyLogged) {
        next.setDate(next.getDate() + 1);
    }
    return next.getTime();
}

function buildReminderPayload() {
    var hour = getReminderHour();
    var minute = getReminderMinute();
    return {
        type: 'SCHEDULE_REMINDER',
        enabled: !!state.reminderEnabled,
        hour: hour,
        minute: minute,
        nextAt: getNextReminderAt(hour, minute),
        title: 'King check-in',
        body: 'Log today — one honest day keeps the journey moving.',
    };
}

function cancelPageReminderTimer() {
    if (__reminderPageTimer) {
        clearTimeout(__reminderPageTimer);
        __reminderPageTimer = null;
    }
}

function armPageReminderTimer(payload) {
    cancelPageReminderTimer();
    if (!payload || !payload.enabled || !remindersSupported()) return;
    if (Notification.permission !== 'granted') return;

    var delay = Math.max(0, payload.nextAt - Date.now());
    // setTimeout max ~24.8 days; daily is always fine
    __reminderPageTimer = setTimeout(function () {
        __reminderPageTimer = null;
        try {
            if (Notification.permission === 'granted') {
                new Notification(payload.title, {
                    body: payload.body,
                    icon: './assets/icon-192.png',
                    tag: 'king-daily-reminder',
                });
            }
        } catch (err) {
            console.error('King reminder notification failed:', err);
        }
        // Re-arm for the following day
        syncDailyReminderSchedule();
    }, delay);
}

function postReminderToServiceWorker(payload) {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) {
        if (!reg || !reg.active) return false;
        reg.active.postMessage(payload);
        return true;
    }).catch(function () { return false; });
}

/** Request notification permission if needed. Returns 'granted' | 'denied' | 'default' | 'unsupported'. */
function ensureReminderPermission() {
    if (!remindersSupported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission().then(function (p) {
        return p || 'denied';
    }).catch(function () {
        return 'denied';
    });
}

/** Sync SW + in-page timers from current state prefs. */
function syncDailyReminderSchedule() {
    var payload = buildReminderPayload();
    if (!state.reminderEnabled) {
        cancelPageReminderTimer();
        postReminderToServiceWorker({ type: 'CANCEL_REMINDER' });
        return;
    }
    armPageReminderTimer(payload);
    postReminderToServiceWorker(payload);
}

function persistReminderPrefs() {
    saveToStorage(state);
    syncDailyReminderSchedule();
    renderDailyReminder();
}

/**
 * Toggle reminder on/off from the UI switch.
 * @param {boolean} enabled
 */
function setDailyReminderEnabled(enabled) {
    if (!enabled) {
        state.reminderEnabled = false;
        persistReminderPrefs();
        if (typeof showToast === 'function') {
            showToast(null, 'Daily reminder off');
        }
        return Promise.resolve();
    }

    return ensureReminderPermission().then(function (perm) {
        if (perm !== 'granted') {
            state.reminderEnabled = false;
            persistReminderPrefs();
            var msg = perm === 'unsupported'
                ? 'Notifications are not available in this browser.'
                : 'Notification permission is required for reminders. Enable it in browser settings.';
            if (typeof showToast === 'function') showToast(null, msg);
            return;
        }
        state.reminderEnabled = true;
        persistReminderPrefs();
        var label = formatReminderTimeLabel(getReminderHour(), getReminderMinute());
        if (typeof showToast === 'function') {
            showToast(null, 'Reminder set for ' + label + ' daily');
        }
    });
}

function setDailyReminderTime(hour, minute) {
    state.reminderHour = clampInt(hour, 0, 23, 20);
    state.reminderMinute = clampInt(minute, 0, 59, 0);
    if (state.reminderEnabled) {
        persistReminderPrefs();
        if (typeof showToast === 'function') {
            showToast(null, 'Reminder updated to ' + formatReminderTimeLabel(state.reminderHour, state.reminderMinute));
        }
    } else {
        saveToStorage(state);
        renderDailyReminder();
    }
}

function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

function renderDailyReminder() {
    var toggle = document.getElementById('reminderEnabledToggle');
    var timeInput = document.getElementById('reminderTimeInput');
    var statusEl = document.getElementById('reminderStatus');
    var teaser = document.getElementById('reminderPanelTeaser');
    if (!toggle || !timeInput) return;

    var hour = getReminderHour();
    var minute = getReminderMinute();
    timeInput.value = pad2(hour) + ':' + pad2(minute);
    toggle.checked = !!state.reminderEnabled;
    toggle.disabled = !remindersSupported() || (remindersSupported() && Notification.permission === 'denied');

    var status = '';
    if (!remindersSupported()) {
        status = 'This browser does not support notifications.';
    } else if (Notification.permission === 'denied') {
        status = 'Notifications blocked. Enable them in your browser settings for this site.';
    } else if (state.reminderEnabled) {
        status = 'Next: ' + formatReminderTimeLabel(hour, minute) +
            ' · Keep King installed for the best chance of delivery.';
    } else {
        status = 'Pick a time and turn on — we\'ll nudge you to check in once a day.';
    }
    if (statusEl) statusEl.textContent = status;

    if (teaser) {
        teaser.textContent = state.reminderEnabled
            ? formatReminderTimeLabel(hour, minute) + ' daily'
            : 'Set a daily check-in time';
    }
}

function bindDailyReminderUi() {
    if (__reminderUiBound) return;
    __reminderUiBound = true;

    var toggle = document.getElementById('reminderEnabledToggle');
    if (toggle) {
        toggle.addEventListener('change', function () {
            setDailyReminderEnabled(!!toggle.checked);
        });
    }

    var timeInput = document.getElementById('reminderTimeInput');
    if (timeInput) {
        timeInput.addEventListener('change', function () {
            var parts = (timeInput.value || '20:00').split(':');
            var h = parseInt(parts[0], 10);
            var m = parseInt(parts[1], 10);
            if (!Number.isFinite(h)) h = 20;
            if (!Number.isFinite(m)) m = 0;
            setDailyReminderTime(h, m);
        });
    }
}

function initDailyReminders() {
    bindDailyReminderUi();
    renderDailyReminder();
    syncDailyReminderSchedule();
}
