/**
 * reminder.js — Daily check-in reminder (native AlarmManager on Android).
 * Owner: Reminder layer. Does not use web Notification / service-worker timers.
 */

const REMINDER_STORAGE_KEY = 'kingReminder';
const REMINDER_DEFAULT_HOUR = 21;
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
    /* Time fields are buttons + in-app picker; nothing to populate. */
}

function remindClockFieldValue(el) {
    if (!el) return '';
    if (el.dataset && el.dataset.value != null && el.dataset.value !== '') return el.dataset.value;
    return String(el.textContent || '').trim();
}

function setRemindClockField(el, value, label) {
    if (!el) return;
    el.dataset.value = String(value);
    el.textContent = label != null ? String(label) : String(value);
}

function readReminderClock() {
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    return joinReminderClock(
        remindClockFieldValue(hourEl),
        remindClockFieldValue(minuteEl),
        remindClockFieldValue(ampmEl)
    );
}

function setReminderClockDisabled(disabled) {
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    var row = document.getElementById('remindTimeRow');
    [hourEl, minuteEl, ampmEl].forEach(function (el) {
        if (el) el.disabled = !!disabled;
    });
    if (row) row.classList.toggle('is-disabled', !!disabled);
}

function closeRemindTimePicker() {
    var picker = document.getElementById('remindTimePicker');
    if (!picker) return;
    picker.classList.remove('active');
    picker.setAttribute('aria-hidden', 'true');
}

function openRemindTimePicker(field) {
    var picker = document.getElementById('remindTimePicker');
    var title = document.getElementById('remindTimePickerTitle');
    var list = document.getElementById('remindTimePickerList');
    if (!picker || !list) return;

    var items = [];
    var current = '';
    var heading = 'Time';
    if (field === 'hour') {
        heading = 'Hour';
        current = remindClockFieldValue(document.getElementById('remindHour'));
        for (var h = 1; h <= 12; h++) {
            items.push({ value: String(h), label: String(h) });
        }
    } else if (field === 'minute') {
        heading = 'Minute';
        current = remindClockFieldValue(document.getElementById('remindMinute'));
        for (var m = 0; m < 60; m++) {
            items.push({ value: String(m), label: m < 10 ? '0' + m : String(m) });
        }
    } else {
        heading = 'AM / PM';
        current = remindClockFieldValue(document.getElementById('remindAmPm'));
        items = [
            { value: 'AM', label: 'AM' },
            { value: 'PM', label: 'PM' },
        ];
    }

    if (title) title.textContent = heading;
    list.innerHTML = '';
    var selectedBtn = null;
    items.forEach(function (item) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remind-time-picker-option';
        btn.setAttribute('role', 'option');
        btn.dataset.value = item.value;
        btn.textContent = item.label;
        if (String(item.value) === String(current)) {
            btn.classList.add('is-selected');
            btn.setAttribute('aria-selected', 'true');
            selectedBtn = btn;
        } else {
            btn.setAttribute('aria-selected', 'false');
        }
        btn.addEventListener('click', function () {
            applyRemindTimePickerChoice(field, item.value, item.label);
        });
        list.appendChild(btn);
    });

    picker.classList.add('active');
    picker.setAttribute('aria-hidden', 'false');
    if (selectedBtn && typeof selectedBtn.scrollIntoView === 'function') {
        selectedBtn.scrollIntoView({ block: 'center' });
    }
}

function applyRemindTimePickerChoice(field, value, label) {
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    if (field === 'hour') setRemindClockField(hourEl, value, label);
    else if (field === 'minute') setRemindClockField(minuteEl, value, label);
    else setRemindClockField(ampmEl, value, label);
    closeRemindTimePicker();
    onRemindTimeChange();
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

function openNotificationSettingsIfDenied() {
    if (!reminderNativeStatus || reminderNativeStatus.notificationsAllowed !== false) return;
    callReminderPlugin('openNotificationSettings').then(function (status) {
        rememberReminderStatus(status);
        renderReminderTab();
    }).catch(function () {});
}

function reminderStatusCopy(settings) {
    if (!reminderNativeAvailable()) {
        return 'Reminders work in the King Android app — even if it is closed.';
    }
    if (!settings.enabled) return '';
    if (safeGet('onboardingComplete') === 'true' && !Entitlement.hasPremiumAccess()) {
        return 'Reminder paused — Premium required.';
    }
    if (reminderNativeStatus && reminderNativeStatus.notificationsAllowed === false) {
        return 'Allow notifications for King in system settings — otherwise the alarm fires with no banner.';
    }
    var timeLine = formatReminderTime(settings.hour, settings.minute) + ' every day.';
    if (reminderNativeStatus && reminderNativeStatus.scheduleMode === 'inexact') {
        return timeLine + ' Exact time not guaranteed — the reminder may arrive a few minutes late.';
    }
    return timeLine;
}

function reminderUsesInexactSchedule(status) {
    return status && status.scheduleMode === 'inexact';
}

function renderReminderTab() {
    fillReminderTimeOptions();
    var settings = loadReminderSettings();
    var toggle = document.getElementById('remindToggle');
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    var status = document.getElementById('remindStatus');
    var clock = splitReminderClock(settings.hour, settings.minute);
    if (toggle) toggle.checked = !!settings.enabled;
    setRemindClockField(hourEl, clock.hour12, String(clock.hour12));
    setRemindClockField(minuteEl, clock.minute, clock.minute < 10 ? '0' + clock.minute : String(clock.minute));
    setRemindClockField(ampmEl, clock.ampm, clock.ampm);
    setReminderClockDisabled(false);
    if (status) {
        var copy = reminderStatusCopy(settings);
        status.textContent = copy;
        status.hidden = !copy;
    }
}

function scheduleReminderOnNative(settings) {
    return callReminderPlugin('schedule', { hour: settings.hour, minute: settings.minute }).then(function (status) {
        rememberReminderStatus(status);
        return status;
    });
}

function maybePromptExactAlarmAfterSchedule(status, options) {
    if (!options || !options.promptExactAlarm) return Promise.resolve(status);
    if (!reminderUsesInexactSchedule(status) || status.exactAlarmsAllowed) {
        return Promise.resolve(status);
    }
    return callReminderPlugin('openExactAlarmSettings').then(function (afterSettings) {
        rememberReminderStatus(afterSettings);
        if (afterSettings && afterSettings.exactAlarmsAllowed) {
            var settings = loadReminderSettings();
            return scheduleReminderOnNative(settings);
        }
        return afterSettings || status;
    }).catch(function () {
        return status;
    });
}

function applyReminderAlarms(options) {
    options = options || {};
    var settings = loadReminderSettings();
    var plugin = getKingReminderPlugin();
    var premiumOk = Entitlement.hasPremiumAccess();
    var shouldSchedule = !!(settings.enabled && premiumOk);

    if (!plugin) {
        renderReminderTab();
        return Promise.resolve({ scheduled: false });
    }

    if (!shouldSchedule) {
        // User Off → disable native enabled. Premium pause → keep enabled so
        // the next-day / boot alarm can return when Premium is back.
        var cancelArgs = settings.enabled ? {} : { disable: true };
        return callReminderPlugin('cancel', cancelArgs).then(function (status) {
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
            // Keep the user's On preference — only pause the alarm.
            renderReminderTab();
            callReminderPlugin('openNotificationSettings').catch(function () {});
            return callReminderPlugin('cancel').then(function (status) {
                rememberReminderStatus(status);
                renderReminderTab();
                return { scheduled: false };
            }).catch(function () {
                return { scheduled: false };
            });
        }
        return scheduleReminderOnNative(settings).then(function (status) {
            return maybePromptExactAlarmAfterSchedule(status, options).then(function (finalStatus) {
                rememberReminderStatus(finalStatus);
                renderReminderTab();
                return { scheduled: true };
            });
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

    applyReminderAlarms({ promptExactAlarm: turningOn }).then(function (res) {
        if (!turningOn) {
            showToast(0, 'Daily reminder is off.');
            return;
        }
        if (res && res.scheduled) {
            if (reminderUsesInexactSchedule(reminderNativeStatus)) {
                showToast(0, 'Reminder set — exact time not guaranteed.');
            } else {
                showToast(0, 'Reminder set for ' + formatReminderTime(settings.hour, settings.minute) + '.');
            }
        } else if (turningOn) {
            openNotificationSettingsIfDenied();
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
            showToast(0, 'Reminder moved to ' + formatReminderTime(settings.hour, settings.minute) + '.');
        } else {
            showToast(0, 'Time saved — ' + formatReminderTime(settings.hour, settings.minute) + '.');
        }
    }).catch(function () {
        showToast(0, 'Could not update the reminder time.');
    });
}

function bindReminderTab() {
    fillReminderTimeOptions();
    var toggle = document.getElementById('remindToggle');
    var hourEl = document.getElementById('remindHour');
    var minuteEl = document.getElementById('remindMinute');
    var ampmEl = document.getElementById('remindAmPm');
    var picker = document.getElementById('remindTimePicker');
    var closeBtn = document.getElementById('remindTimePickerClose');
    if (toggle) {
        toggle.addEventListener('change', onRemindToggleChange);
    }
    if (hourEl) {
        hourEl.addEventListener('click', function () { openRemindTimePicker('hour'); });
    }
    if (minuteEl) {
        minuteEl.addEventListener('click', function () { openRemindTimePicker('minute'); });
    }
    if (ampmEl) {
        ampmEl.addEventListener('click', function () { openRemindTimePicker('ampm'); });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeRemindTimePicker);
    }
    if (picker) {
        picker.addEventListener('click', function (e) {
            if (e.target === picker) closeRemindTimePicker();
        });
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
