/**
 * reminder.js — Daily check-in reminder (native inexact AlarmManager on Android).
 * Owner: Reminder layer. Does not use web Notification / service-worker timers.
 */

const REMINDER_STORAGE_KEY = 'kingReminder';
const REMINDER_DEFAULT_HOUR = 20;
const REMINDER_DEFAULT_MINUTE = 0;

function reminderDefaultSettings() {
    return { enabled: false, hour: REMINDER_DEFAULT_HOUR, minute: REMINDER_DEFAULT_MINUTE };
}

function loadReminderSettings() {
    var raw = safeGet(REMINDER_STORAGE_KEY);
    var fallback = reminderDefaultSettings();
    if (!raw) return fallback;
    try {
        var parsed = JSON.parse(raw);
        var hour = parseInt(parsed && parsed.hour, 10);
        var minute = parseInt(parsed && parsed.minute, 10);
        return {
            enabled: !!(parsed && parsed.enabled),
            hour: isFinite(hour) ? Math.min(23, Math.max(0, hour)) : fallback.hour,
            minute: isFinite(minute) ? Math.min(59, Math.max(0, minute)) : fallback.minute,
        };
    } catch (e) {
        return fallback;
    }
}

function saveReminderSettings(settings) {
    safeSet(REMINDER_STORAGE_KEY, JSON.stringify({
        enabled: !!settings.enabled,
        hour: settings.hour,
        minute: settings.minute,
    }));
}

function formatReminderTime(hour, minute) {
    var parts = splitReminderClock(hour, minute);
    var mm = minute < 10 ? '0' + minute : String(minute);
    return parts.hour12 + ':' + mm + ' ' + parts.ampm;
}

function splitReminderClock(hour, minute) {
    var h = hour % 12;
    if (h === 0) h = 12;
    return {
        hour12: h,
        minute: minute,
        ampm: hour >= 12 ? 'PM' : 'AM',
    };
}

function joinReminderClock(hour12, minute, ampm) {
    var h = parseInt(hour12, 10);
    var m = parseInt(minute, 10);
    if (!isFinite(h) || !isFinite(m)) return null;
    h = Math.min(12, Math.max(1, h));
    m = Math.min(59, Math.max(0, m));
    if (ampm === 'AM') {
        h = h === 12 ? 0 : h;
    } else {
        h = h === 12 ? 12 : h + 12;
    }
    return { hour: h, minute: m };
}

function fillReminderTimeOptions() {
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    if (hourEl && hourEl.options.length === 0) {
        for (var h = 1; h <= 12; h++) {
            var ho = document.createElement('option');
            ho.value = String(h);
            ho.textContent = String(h);
            hourEl.appendChild(ho);
        }
    }
    if (minuteEl && minuteEl.options.length === 0) {
        for (var m = 0; m < 60; m++) {
            var mo = document.createElement('option');
            mo.value = String(m);
            mo.textContent = m < 10 ? '0' + m : String(m);
            minuteEl.appendChild(mo);
        }
    }
}

function readReminderClock() {
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    return joinReminderClock(
        hourEl && hourEl.value,
        minuteEl && minuteEl.value,
        ampmEl && ampmEl.value
    );
}

function setReminderClockDisabled(disabled) {
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    var row = document.getElementById('remindTimeRow');
    if (hourEl) hourEl.disabled = !!disabled;
    if (minuteEl) minuteEl.disabled = !!disabled;
    if (ampmEl) ampmEl.disabled = !!disabled;
    if (row) row.classList.toggle('is-disabled', !!disabled);
}

function getKingReminderPlugin() {
    var Cap = window.Capacitor;
    if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return null;
    if (typeof Cap.getPlatform === 'function' && Cap.getPlatform() !== 'android') return null;
    if (Cap.Plugins && Cap.Plugins.KingReminder) return Cap.Plugins.KingReminder;
    if (typeof Cap.registerPlugin === 'function') {
        try { return Cap.registerPlugin('KingReminder'); } catch (e) { return null; }
    }
    return null;
}

function reminderNativeAvailable() {
    return !!getKingReminderPlugin();
}

function todayIsLoggedForReminder() {
    if (typeof todayKey !== 'function') return false;
    if (typeof isWallDateLogged === 'function' && isWallDateLogged(todayKey())) return true;
    return !!(state && (state.todayStatus === 'success' || state.todayStatus === 'failed'));
}

function syncReminderLoggedDate() {
    if (!reminderNativeAvailable()) return;
    var dateKey = todayIsLoggedForReminder() ? todayKey() : '';
    callReminderPlugin('setLoggedDate', { dateKey: dateKey }).catch(function () {});
}

function callReminderPlugin(method, args) {
    var plugin = getKingReminderPlugin();
    if (!plugin || typeof plugin[method] !== 'function') {
        return Promise.reject(new Error('unavailable'));
    }
    return plugin[method](args || {});
}

let reminderNativeStatus = null;

function rememberReminderStatus(status) {
    if (status) reminderNativeStatus = status;
}

function reminderStatusCopy(settings) {
    if (!reminderNativeAvailable()) {
        return 'Reminders work in the King Android app — even if it is closed.';
    }
    if (!settings.enabled) return 'Off — pick a time that fits, then turn it on.';
    if (safeGet('onboardingComplete') === 'true' && !Entitlement.hasPremiumAccess()) {
        return 'Reminder paused — Premium required.';
    }
    if (reminderNativeStatus && reminderNativeStatus.notificationsAllowed === false) {
        return 'Allow notifications for King in system settings.';
    }
    return 'Around ' + formatReminderTime(settings.hour, settings.minute) + ' every day.';
}

function renderReminderTab() {
    fillReminderTimeOptions();
    var settings = loadReminderSettings();
    var toggle = document.getElementById('remindToggle');
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    var status = document.getElementById('remindStatus');
    var testBtn = document.getElementById('remindTestBtn');
    var clock = splitReminderClock(settings.hour, settings.minute);
    if (toggle) toggle.checked = !!settings.enabled;
    if (hourEl) hourEl.value = String(clock.hour12);
    if (minuteEl) minuteEl.value = String(clock.minute);
    if (ampmEl) ampmEl.value = clock.ampm;
    setReminderClockDisabled(false);
    if (status) status.textContent = reminderStatusCopy(settings);
    if (testBtn) testBtn.hidden = !reminderNativeAvailable();
}

function applyReminderAlarms() {
    var settings = loadReminderSettings();
    var plugin = getKingReminderPlugin();
    var premiumOk = Entitlement.hasPremiumAccess();
    var shouldSchedule = !!(settings.enabled && premiumOk);

    if (!plugin) {
        renderReminderTab();
        return Promise.resolve({ scheduled: false });
    }

    if (!shouldSchedule) {
        return callReminderPlugin('cancel').then(function (status) {
            rememberReminderStatus(status);
            renderReminderTab();
            return { scheduled: false };
        }).catch(function () {
            renderReminderTab();
            return { scheduled: false };
        });
    }

    return ensureNotificationPermission().then(function (ok) {
        if (!ok) {
            settings.enabled = false;
            saveReminderSettings(settings);
            renderReminderTab();
            return callReminderPlugin('cancel').then(function (status) {
                rememberReminderStatus(status);
                renderReminderTab();
                return { scheduled: false };
            }).catch(function () {
                return { scheduled: false };
            });
        }
        return callReminderPlugin('schedule', { hour: settings.hour, minute: settings.minute }).then(function (status) {
            rememberReminderStatus(status);
            renderReminderTab();
            return { scheduled: true };
        });
    });
}

function ensureNotificationPermission() {
    return callReminderPlugin('getStatus').then(function (status) {
        rememberReminderStatus(status);
        if (status && status.notificationsAllowed !== false) return true;
        return callReminderPlugin('requestPermissions').then(function (perm) {
            var granted = perm && String(perm.notifications).toLowerCase() === 'granted';
            if (!granted) {
                showToast(0, 'Allow notifications for King in system settings.');
                return false;
            }
            return true;
        });
    }).catch(function () {
        return false;
    });
}

function onRemindToggleChange() {
    if (!requirePremium()) {
        renderReminderTab();
        return;
    }
    var toggle = document.getElementById('remindToggle');
    var settings = loadReminderSettings();
    var turningOn = !!(toggle && toggle.checked);

    if (turningOn && !reminderNativeAvailable()) {
        if (toggle) toggle.checked = false;
        showToast(0, 'Daily reminder is available in the King Android app.');
        return;
    }

    settings.enabled = turningOn;
    saveReminderSettings(settings);
    renderReminderTab();

    applyReminderAlarms().then(function (res) {
        if (!turningOn) {
            showToast(0, 'Daily reminder is off.');
            return;
        }
        if (res && res.scheduled) {
            showToast(0, 'Reminder set for around ' + formatReminderTime(settings.hour, settings.minute) + '.');
        }
    }).catch(function () {
        settings.enabled = false;
        saveReminderSettings(settings);
        renderReminderTab();
        showToast(0, 'Could not set the reminder.');
    });
}

function onRemindTimeChange() {
    if (!requirePremium()) {
        renderReminderTab();
        return;
    }
    var parsed = readReminderClock();
    if (!parsed) {
        renderReminderTab();
        return;
    }
    var settings = loadReminderSettings();
    settings.hour = parsed.hour;
    settings.minute = parsed.minute;
    saveReminderSettings(settings);
    renderReminderTab();
    applyReminderAlarms().then(function (res) {
        if (res && res.scheduled) {
            showToast(0, 'Reminder moved to around ' + formatReminderTime(settings.hour, settings.minute) + '.');
        } else {
            showToast(0, 'Time saved — ' + formatReminderTime(settings.hour, settings.minute) + '.');
        }
    }).catch(function () {
        showToast(0, 'Could not update the reminder time.');
    });
}

function onRemindTest() {
    if (!requirePremium()) return;
    if (!reminderNativeAvailable()) {
        showToast(0, 'Daily reminder is available in the King Android app.');
        return;
    }
    ensureNotificationPermission().then(function (ok) {
        if (!ok) return;
        return callReminderPlugin('scheduleTest', { delaySeconds: 120 }).then(function () {
            showToast(0, 'Test reminder in 2 minutes — lock, leave, or close the app to check.');
        });
    }).catch(function () {
        showToast(0, 'Could not send a test reminder.');
    });
}

function bindReminderTab() {
    fillReminderTimeOptions();
    var toggle = document.getElementById('remindToggle');
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    var testBtn = document.getElementById('remindTestBtn');
    if (toggle) {
        toggle.addEventListener('change', onRemindToggleChange);
    }
    if (hourEl) hourEl.addEventListener('change', onRemindTimeChange);
    if (minuteEl) minuteEl.addEventListener('change', onRemindTimeChange);
    if (ampmEl) ampmEl.addEventListener('change', onRemindTimeChange);
    if (testBtn) {
        testBtn.addEventListener('click', onRemindTest);
    }
}

function initReminders() {
    bindReminderTab();
    renderReminderTab();
    syncReminderLoggedDate();
    applyReminderAlarms();
    listenForReminderLogActions();
    consumeReminderLogAction();
}

function listenForReminderLogActions() {
    var plugin = getKingReminderPlugin();
    if (!plugin || typeof plugin.addListener !== 'function') return;
    try {
        plugin.addListener('pendingLog', function () {
            consumeReminderLogAction();
        });
    } catch (e) {}
}

function consumeReminderLogAction() {
    if (!reminderNativeAvailable()) return;
    callReminderPlugin('consumePendingLog').then(function (res) {
        var action = res && res.action;
        if (action === 'strong' || action === 'slip') {
            applyNotificationLog(action);
        }
    }).catch(function () {});
}
