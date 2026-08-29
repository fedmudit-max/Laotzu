/**
 * logic-logging.js — User taps → state changes (orchestration only).
 *
 * Called from ui-actions recordSuccess / recordFailure and ui-day catch-up.
 * Gates before write: canLogToday (journey), isYesterdayLogPending (streak),
 *   getWallDateLogStatus (dates-log).
 * Orchestration only — algorithms stay in journey/streak/dates-log (ARCHITECTURE.md).
 */

// ════════════════════════════════════════════════════════
//  STRONG DAY
// ════════════════════════════════════════════════════════

function applyStrongDay({ logDate, suppressUI = false } = {}) {
    if (!canLogToday()) {
        return strongDayNoOpResult();
    }

    const dateKey = clampDateKeyToRealToday(logDate || todayKey());

    if (dateKey === todayKey() && isYesterdayLogPending()) {
        return strongDayNoOpResult();
    }

    if (getWallDateLogStatus(dateKey)) {
        return strongDayNoOpResult();
    }

    const calDay = getCalendarDayForWallDate(dateKey);
    if ((state.calendarDay || 1) < calDay) state.calendarDay = calDay;

    state.score.success++;
    writeDailyLog(calDay, { status: 'strong', day: calDay, date: dateKey });

    markTodayStatus(logDate || todayKey(), 'success');
    recomputeCurrentStreak();

    const prevLongest = state.longestStreak;
    const recordToBeat = state.longestStreakAtStreakStart;
    const isNewRecord = isPersonalBestStreak(state.currentStreak, recordToBeat);

    if (state.currentStreak > state.longestStreak) {
        state.longestStreak = state.currentStreak;
    }

    if (!suppressUI && isNewRecord) {
        state.recordCelebrated = true;
    }

    var personalBestCrossing = isPersonalBestJourneyCrossing(state.score.success);

    updateBestJourney();

    return {
        applied: true,
        streak: state.currentStreak,
        successCount: state.score.success,
        milestoneHit: resolveJourneyMilestoneHit(state.score.success),
        personalBestCrossing: personalBestCrossing,
        isNewRecord: !suppressUI && isNewRecord,
        prevLongest,
        recordToBeat,
    };
}

function strongDayNoOpResult() {
    return {
        applied: false,
        streak: state.currentStreak,
        successCount: state.score.success,
        milestoneHit: null,
        personalBestCrossing: false,
        isNewRecord: false,
        prevLongest: state.longestStreak,
        recordToBeat: state.longestStreakAtStreakStart,
    };
}

// ════════════════════════════════════════════════════════
//  SLIP DAY
// ════════════════════════════════════════════════════════

function applySlipDay({ logDate, calDay }) {
    if (!canLogToday()) {
        return { applied: false, failures: state.score.failures };
    }

    const wallDate = clampDateKeyToRealToday(logDate);
    const dayNum = getCalendarDayForWallDate(wallDate);
    if (calDay == null || calDay < dayNum) calDay = dayNum;
    if ((state.calendarDay || 1) < dayNum) state.calendarDay = dayNum;

    if (wallDate === todayKey() && isYesterdayLogPending()) {
        return { applied: false, failures: state.score.failures };
    }

    if (getWallDateLogStatus(wallDate) === 'strong') {
        return { applied: false, failures: state.score.failures };
    }

    const isToday = wallDate === todayKey();
    const firstSlipOfDay = isFirstSlipOnWallDate(wallDate, calDay);
    const ended = streakSegmentBeforeSlipOnDate(wallDate, firstSlipOfDay);

    state.currentJourneyStreaks.push(ended);
    state.score.failures++;
    state.longestStreakAtStreakStart = state.longestStreak;
    state.recordCelebrated = false;

    if (firstSlipOfDay && isToday) {
        state.lastFreezeStreak = ended;
        state.lastFreezeDate = wallDate;
    }

    writeDailyLog(calDay, {
        status: 'slip',
        day: calDay,
        date: wallDate,
        slipCount: nextSlipCount(wallDate, calDay),
    });

    if (isToday) {
        state.todayFailCount++;
        markTodayStatus(wallDate, 'failed');
    }
    recomputeCurrentStreak();
    updateBestJourney();
    return { applied: true, failures: state.score.failures };
}

function recordSlipToday() {
    return applySlipDay({ logDate: todayKey(), calDay: state.calendarDay });
}

// ════════════════════════════════════════════════════════
//  ABSENCE / CATCH-UP
// ════════════════════════════════════════════════════════

function collectAutoStrongDates(_lastOpenedDate, today) {
    today = today || todayKey();
    const nMinus2 = getDayBeforeYesterdayKey(today);
    const anchor = ensureJourneyAnchorWallDate();
    const dates = [];

    if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return dates;
    if (nMinus2 < anchor) return dates;

    let d = anchor;
    while (d <= nMinus2) {
        if (!isWallDateLogged(d)) dates.push(d);
        d = addDaysToKey(d, 1);
    }
    return dates;
}

function autoStrongAbsentDays(today) {
    today = today || todayKey();
    const results = [];
    const dates = collectAutoStrongDates(state.lastOpenedDate, today);

    for (let i = 0; i < dates.length; i++) {
        if (journeyIsOver(state)) break;
        const dateKey = dates[i];
        const isLast = i === dates.length - 1;
        results.push({
            result: applyStrongDay({ logDate: dateKey, suppressUI: !isLast }),
            suppressUI: !isLast,
        });
    }

    clampCalendarDayToRealToday();
    return results;
}
