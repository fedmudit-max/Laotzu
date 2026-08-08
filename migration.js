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
    return merged;
}
