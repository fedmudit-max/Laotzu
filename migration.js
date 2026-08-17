/**
 * migration.js — Upgrade saved state when schema changes.
 *
 * Trial seed (trialStartedAt) is not migrated here — onboarding / init own
 * that write (startPremiumTrial / ensureTrialStarted) from Calendar Day 1.
 */

function migrateDailyLogToDateKeys(log) {
    const out = {};
    for (const [key, entry] of Object.entries(log || {})) {
        if (typeof entry === 'object' && entry.date) {
            out[entry.date] = entry;
        } else {
            out[key] = entry;
        }
    }
    return out;
}

function migrateLongestStreakAtStart(merged, saved) {
    if (saved.longestStreakAtStreakStart !== undefined) {
        return merged.longestStreakAtStreakStart;
    }
    const streak = merged.currentStreak || 0;
    const longest = merged.longestStreak || 0;
    if (streak === 0) return longest;
    if (streak < longest) return longest;
    return 0;
}

function syncTodaySlipCountInLog(s) {
    if (s.todayStatus !== 'failed' || s.todayFailCount < 2) return;
    const dateKey = s.lastOpenedDate || todayKey();
    var entry = (s.dailyLog && s.dailyLog[dateKey]) || (s.dailyLog && s.dailyLog[dailyLogKey(s.calendarDay)]);
    if (entry && logStatus(entry) === 'slip') {
        entry.slipCount = Math.max(entry.slipCount || 1, s.todayFailCount);
    }
}

function runStateMigrations(merged, saved) {
    merged.dailyLog = migrateDailyLogToDateKeys(saved.dailyLog || merged.dailyLog);
    merged.longestStreakAtStreakStart = migrateLongestStreakAtStart(merged, saved);
    syncTodaySlipCountInLog(merged);

    // Seed journey/app start dates for saves that predate these fields.
    if (!merged.journeyStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(merged.journeyStartDate)) {
        merged.journeyStartDate = typeof inferJourneyStartFromLog === 'function'
            ? inferJourneyStartFromLog(merged)
            : (merged.lastOpenedDate || '');
    }
    delete merged.devDateOffset;

    // Paid window only from verified Play purchase/restore — not URL or local “success”.
    var paidSource = merged.source;
    if (paidSource !== 'play' && paidSource !== 'restore') {
        merged.premiumUntil = '';
        if (paidSource !== 'local-trial') merged.source = '';
    }

    if (!merged.appStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(merged.appStartDate)) {
        var earliest = '';
        var log = merged.dailyLog || {};
        for (var key in log) {
            if (!Object.prototype.hasOwnProperty.call(log, key)) continue;
            var entry = log[key];
            if (!entry || typeof entry !== 'object') continue;
            var date = entry.date || (/^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            if (!earliest || date < earliest) earliest = date;
        }
        merged.appStartDate = earliest || merged.journeyStartDate || '';
    }

    return merged;
}
