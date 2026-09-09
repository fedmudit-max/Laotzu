/**
 * logic-dates-log.js — Wall dates and dailyLog (per-day historical facts).
 * Does not perform journey lifecycle transitions.
 *
 * dailyLog is source of truth for strong/slip per wall date.
 * Month grid / calendar wrong → getWallDateLogStatus, isWallDateLogged, dailyLog keys.
 * Writes: writeDailyLog (from logic-logging.js). No journey lifecycle (ARCHITECTURE.md).
 */

// ════════════════════════════════════════════════════════
//  DATES — local timezone; never parse YYYY-MM-DD as UTC
// ════════════════════════════════════════════════════════

function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function dateKeyFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function daysBetweenKeys(fromKey, toKey) {
    return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / MS_PER_DAY);
}

function addDaysToKey(key, n) {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + n);
    return dateKeyFromDate(d);
}

function dayOfYearFromKey(key) {
    const d = parseDateKey(key);
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / MS_PER_DAY);
}

function todayKey() {
    return dateKeyFromDate(new Date());
}

// ════════════════════════════════════════════════════════
//  DAILY LOG — source of truth for day-by-day events
// ════════════════════════════════════════════════════════

function logStatus(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry.status || null;
}

function dailyLogKey(calDay) {
    return `day-${calDay}`;
}

/** Stable key for dailyLog — wall date so entries survive across journeys. */
function dailyLogStorageKey(calDay, patch) {
    return (patch && patch.date) ? patch.date : dailyLogKey(calDay);
}

/** Never store wall dates after app "today". */
function clampDateKeyToRealToday(dateKey) {
    var cap = todayKey();
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return cap;
    if (dateKey > cap) return cap;
    return dateKey;
}

function writeDailyLog(calDay, patch) {
    state.dailyLog = state.dailyLog || {};
    patch = patch || {};
    if (patch.date) {
        patch = Object.assign({}, patch, { date: clampDateKeyToRealToday(patch.date) });
    }
    state.dailyLog[dailyLogStorageKey(calDay, patch)] = patch;
}

function normalizeDayState(state) {
    if (state === 'rest' || state === 'busy' || state === 'done') return state;
    return '';
}

/** Merge optional reflection fields onto an existing logged day — does not change score/streak. */
function patchDailyLogEntry(wallDate, patch) {
    var entry = getDailyLogEntry(wallDate);
    if (!entry || !logStatus(entry)) return false;
    var calDay = entry.day != null ? entry.day : getCalendarDayForWallDate(wallDate);
    var next = Object.assign({}, entry, { date: wallDate });
    if (patch && patch.dayState !== undefined) {
        next.dayState = normalizeDayState(patch.dayState);
    }
    if (patch && patch.note !== undefined) {
        next.note = String(patch.note || '').trim().slice(0, DAY_ENTRY_NOTE_MAX);
    }
    writeDailyLog(calDay, next);
    return true;
}

/** True when dailyLog already has strong or slip for this wall date (YYYY-MM-DD). */
function isWallDateLogged(dateKey) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
    const log = state.dailyLog || {};
    if (log[dateKey] && logStatus(log[dateKey])) return true;
    for (const entry of Object.values(log)) {
        if (entry && typeof entry === 'object' && entry.date === dateKey && logStatus(entry)) {
            return true;
        }
    }
    return false;
}

function ensureTodayUnloggedIfNeeded(today) {
    today = today || todayKey();
    if (!isWallDateLogged(today)) {
        state.todayStatus = 'none';
        state.todayFailCount = 0;
    }
}

/** Day N-1 — yesterday (always asked; never auto-logged). */
function getYesterdayKey(today) {
    return addDaysToKey(today || todayKey(), -1);
}

/** Day N-2 — last day that may be auto-logged as strong. */
function getDayBeforeYesterdayKey(today) {
    return addDaysToKey(today || todayKey(), -2);
}

/** Fetch dailyLog entry for a wall date (YYYY-MM-DD), optionally via cal day key. */
function getDailyLogEntry(wallDate, calDay) {
    var log = state.dailyLog || {};
    if (wallDate && log[wallDate]) return log[wallDate];
    if (calDay != null && log[dailyLogKey(calDay)]) {
        var byDay = log[dailyLogKey(calDay)];
        if (!wallDate || !byDay || !byDay.date || byDay.date === wallDate) return byDay;
    }
    if (wallDate) {
        for (var k in log) {
            if (!Object.prototype.hasOwnProperty.call(log, k)) continue;
            var entry = log[k];
            if (entry && typeof entry === 'object' && entry.date === wallDate) return entry;
        }
    }
    return null;
}

/** True when this wall date has no slip logged yet (used for first-slip streak archive). */
function isFirstSlipOnWallDate(wallDate, calDay) {
    var entry = getDailyLogEntry(wallDate, calDay);
    return !(entry && logStatus(entry) === 'slip');
}

/** 'strong' | 'slip' | null for a wall date — one outcome per day (slip allows multiples). */
function getWallDateLogStatus(wallDate) {
    var entry = getDailyLogEntry(wallDate);
    return entry ? logStatus(entry) : null;
}

function countLifetimeStrongDays() {
    var log = state.dailyLog || {};
    var seen = Object.create(null);
    var n = 0;
    Object.keys(log).forEach(function (k) {
        var entry = log[k];
        if (logStatus(entry) !== 'strong') return;
        var dateKey = (entry && typeof entry === 'object' && entry.date)
            ? entry.date
            : (/^\d{4}-\d{2}-\d{2}$/.test(k) ? k : null);
        if (!dateKey || seen[dateKey]) return;
        seen[dateKey] = true;
        n++;
    });
    return n;
}

function countLifetimeRelapses() {
    var log = state.dailyLog || {};
    var seen = Object.create(null);
    var n = 0;
    Object.keys(log).forEach(function (k) {
        var entry = log[k];
        if (logStatus(entry) !== 'slip') return;
        var dateKey = (entry && typeof entry === 'object' && entry.date)
            ? entry.date
            : (/^\d{4}-\d{2}-\d{2}$/.test(k) ? k : null);
        if (!dateKey) return;
        if (seen[dateKey]) return;
        seen[dateKey] = true;
        n += (entry && typeof entry === 'object' && entry.slipCount)
            ? Math.max(1, Number(entry.slipCount) || 1)
            : 1;
    });
    return n;
}

function countLifetimeJourneys() {
    var completed = (state.completedJourneys || []).length;
    var attempt = Math.max(1, Math.floor(Number(state.attempt) || 1));
    var archivedCurrent = false;
    var journeys = state.completedJourneys || [];
    for (var i = 0; i < journeys.length; i++) {
        if (Math.max(1, Math.floor(Number(journeys[i].attempt) || 1)) === attempt) {
            archivedCurrent = true;
            break;
        }
    }
    return completed + (archivedCurrent ? 0 : 1);
}

function nextSlipCount(logDate, calDay) {
    var prev = getDailyLogEntry(logDate, calDay);
    if (prev && logStatus(prev) === 'slip') {
        return (prev.slipCount || 1) + 1;
    }
    return 1;
}

/** todayStatus is calendar-today only — never set from historical logs. */
function markTodayStatus(dateKey, status) {
    if (dateKey === todayKey()) {
        state.todayStatus = status;
    }
}
