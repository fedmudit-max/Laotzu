/**
 * logic-streak.js — Streak computation, freeze UI, weekly timeline, brain metrics.
 * May call journey QUERIES only — never lifecycle commands.
 *
 * Wrong currentStreak → recomputeCurrentStreak (reads dailyLog, not tap order).
 * Log buttons blocked for yesterday → isYesterdayLogPending (then check ui-day popup).
 * Never call journey lifecycle commands — queries only (ARCHITECTURE.md).
 */

// ════════════════════════════════════════════════════════
//  YESTERDAY GATE (reads journey + dailyLog)
// ════════════════════════════════════════════════════════

/**
 * Yesterday (N-1) still needs a user answer — today (N) must wait.
 * Not used on Journey Day 1 (yesterday is before this journey's start).
 */
function isYesterdayLogPending() {
    if (isAwaitingNextJourney()) return false;
    if (journeyIsOver(state)) return false;
    var today = todayKey();
    var yesterday = getYesterdayKey(today);
    var anchor = readJourneyAnchorWallDate();
    if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return false;
    if (yesterday < anchor) return false;
    return !isWallDateLogged(yesterday);
}

// ════════════════════════════════════════════════════════
//  STREAK RECOMPUTE (derived from dailyLog)
// ════════════════════════════════════════════════════════

function streakCountStrongEndingBefore(wallDate) {
    var streak = 0;
    var d = addDaysToKey(wallDate, -1);
    var anchor = ensureJourneyAnchorWallDate();
    while (d >= anchor) {
        if (getWallDateLogStatus(d) === 'strong') {
            streak++;
            d = addDaysToKey(d, -1);
        } else {
            break;
        }
    }
    return streak;
}

function streakSegmentBeforeSlipOnDate(wallDate, firstSlipOfDay) {
    if (!firstSlipOfDay) return 0;
    return streakCountStrongEndingBefore(wallDate);
}

/**
 * Live streak from chronological logs — not logging order.
 * @param {object} [s] state to mutate
 */
function recomputeCurrentStreak(s) {
    s = s || state;
    var today = todayKey();
    var anchor = readJourneyAnchorWallDate(s) || inferJourneyStartFromLog(s);
    if (!anchor || anchor > today) {
        s.currentStreak = 0;
        return 0;
    }

    if (s.todayStatus === 'failed' || getWallDateLogStatus(today) === 'slip') {
        s.currentStreak = 0;
        return 0;
    }

    var streak = 0;
    var d = today;
    if (getWallDateLogStatus(today) !== 'strong') {
        d = addDaysToKey(today, -1);
    }

    while (d >= anchor) {
        if (getWallDateLogStatus(d) === 'strong') {
            streak++;
            d = addDaysToKey(d, -1);
        } else {
            break;
        }
    }

    s.currentStreak = streak;
    return streak;
}

// ════════════════════════════════════════════════════════
//  FREEZE & DISPLAY STREAK
// ════════════════════════════════════════════════════════

function getEndedStreakLength() {
    if (state.lastFreezeDate !== todayKey()) return 0;
    const n = state.lastFreezeStreak;
    return typeof n === 'number' && n > 0 ? n : 0;
}

function isStreakFreezeDay() {
    return state.todayStatus === 'failed' && state.lastFreezeDate === todayKey();
}

function getDisplayStreak() {
    if (isStreakFreezeDay()) return getEndedStreakLength();
    // Yesterday unanswered: live streak is 0 until the chain includes N-1, but UI should
    // reflect strong days already logged (auto-strong through N-2, etc.).
    if (isYesterdayLogPending()) {
        return streakCountStrongEndingBefore(getYesterdayKey());
    }
    return Math.max(0, state.currentStreak || 0);
}

function isPersonalBestStreak(streak, recordToBeat) {
    return streak > recordToBeat
        && recordToBeat > 0
        && !state.recordCelebrated;
}

// ════════════════════════════════════════════════════════
//  BRAIN / RECOVERY METRICS (display-derived)
// ════════════════════════════════════════════════════════

function getBrainCompletedStrongDays() {
    if (isStreakFreezeDay()) {
        return getDisplayStreak();
    }
    if (isJourneyEndedDisplay()) {
        return getDisplayStreak();
    }
    return getDisplayStreak();
}

function isBrainPhaseBoundaryComplete(completed) {
    if (typeof BRAIN_PHASES === 'undefined' || !completed) return false;
    for (var i = 0; i < BRAIN_PHASES.length; i++) {
        var p = BRAIN_PHASES[i];
        if (p.to !== Infinity && completed === p.to) return true;
    }
    return false;
}

function getBrainProgressStreak() {
    var completed = getBrainCompletedStrongDays();
    if (isStreakFreezeDay()) return completed;
    if (isJourneyEndedDisplay()) return completed;

    if (completed === 0) return 0;

    if (state.todayStatus === 'none' && isBrainPhaseBoundaryComplete(completed)) {
        return completed + 1;
    }
    return completed;
}

function getBrainDaysLeftInPhase(phase, completed) {
    if (!phase || phase.to === Infinity) return null;
    var phaseLen = phase.to - phase.from + 1;
    if (phaseLen <= 0) phaseLen = 1;

    if (completed < phase.from) {
        return phaseLen;
    }
    if (completed >= phase.to) {
        return 0;
    }
    return phase.to - completed;
}

// ════════════════════════════════════════════════════════
//  WEEKLY TIMELINE (Streak tab UI math)
// ════════════════════════════════════════════════════════

function isWeeklySlipReflectDay() {
    return state.todayStatus === 'failed';
}

function getWeeklyInsightDay(progress) {
    if (isWeeklySlipReflectDay()) return null;
    if (!progress || progress <= 0) return 1;
    if (progress >= 7) return state.todayStatus === 'success' ? 7 : 1;
    if (state.todayStatus === 'success') return progress;
    return progress + 1;
}

function shouldRefreshWeeklyTimeline(streak) {
    if (!streak || streak <= 0 || streak % 7 !== 0) return false;
    if (state.todayStatus === 'success') return false;
    return true;
}

function getWeeklyStreakDay(streak) {
    if (!streak || streak <= 0) return 0;
    if (shouldRefreshWeeklyTimeline(streak)) return 0;
    return ((streak - 1) % 7) + 1;
}

let weeklyTrackLayout = null;

function setWeeklyTrackLayout(layout) {
    weeklyTrackLayout = layout;
}

const WEEKLY_TRACK_UNITS = 7;

function getWeeklyDotCenterPct(day) {
    if (weeklyTrackLayout && weeklyTrackLayout.dotCenters) {
        if (day === 0) {
            return weeklyTrackLayout.preDayStartPct != null
                ? weeklyTrackLayout.preDayStartPct
                : weeklyTrackLayout.lineLeftPct || 0;
        }
        return weeklyTrackLayout.dotCenters[day - 1];
    }
    if (day === 0) return 0;
    return (day / WEEKLY_TRACK_UNITS) * 100;
}

function getWeeklyClockMs() {
    return Date.now();
}

function getIntraDaySegmentProgress() {
    const hours = (getWeeklyClockMs() - parseDateKey(todayKey()).getTime()) / 3600000;
    if (hours < 8) return 0;
    if (hours < 16) return 1 / 3;
    return 2 / 3;
}

function trackPctToLinePct(trackPct) {
    if (weeklyTrackLayout && weeklyTrackLayout.lineLeftPct != null) {
        const lineWidth = weeklyTrackLayout.lineRightPct - weeklyTrackLayout.lineLeftPct;
        if (lineWidth <= 0) return 0;
        return Math.min(100, Math.max(0,
            ((trackPct - weeklyTrackLayout.lineLeftPct) / lineWidth) * 100));
    }
    const lineStart = getWeeklyDotCenterPct(0);
    const lineEnd = getWeeklyDotCenterPct(7);
    const lineWidth = lineEnd - lineStart;
    if (lineWidth <= 0) return 0;
    return Math.min(100, Math.max(0, ((trackPct - lineStart) / lineWidth) * 100));
}

function getWeeklyFreezeLayout(streak) {
    const strongWeekDay = getWeeklyStreakDay(streak);
    const slipWeekDay = Math.min(7, Math.max(1, strongWeekDay + 1));
    const t = getIntraDaySegmentProgress();

    const strongPct = getWeeklyDotCenterPct(strongWeekDay);
    const slipPct = getWeeklyDotCenterPct(slipWeekDay);
    const greenTrackPct = strongPct + (slipPct - strongPct) * t;

    return {
        strongWeekDay: strongWeekDay,
        slipWeekDay: slipWeekDay,
        greenTrackPct: greenTrackPct,
        travelerTrackPct: slipPct,
        greenLinePct: trackPctToLinePct(greenTrackPct),
        greyStartLinePct: trackPctToLinePct(greenTrackPct),
        greyEndLinePct: trackPctToLinePct(slipPct),
    };
}

function getWeeklyTravelerPct(streak) {
    if (isWeeklySlipReflectDay() && !isStreakFreezeDay()) return null;

    if (isStreakFreezeDay()) {
        const layout = getWeeklyFreezeLayout(streak);
        return layout ? layout.travelerTrackPct : null;
    }

    const progress = getWeeklyStreakDay(streak);

    if (progress >= 7) {
        return getWeeklyDotCenterPct(7);
    }

    if (state.todayStatus === 'success') {
        return getWeeklyDotCenterPct(progress);
    }

    const t = getIntraDaySegmentProgress();
    const from = getWeeklyDotCenterPct(progress);
    const to = getWeeklyDotCenterPct(progress + 1);
    return from + (to - from) * t;
}

function getWeeklyGreenPct(streak) {
    if (isStreakFreezeDay()) {
        const layout = getWeeklyFreezeLayout(streak);
        return layout ? layout.greenLinePct : 0;
    }

    const travelerPct = getWeeklyTravelerPct(streak);
    if (travelerPct == null) return 0;
    return trackPctToLinePct(travelerPct);
}

function getWeeklyGreyFill(streak) {
    if (!isStreakFreezeDay()) {
        return { start: 0, end: 0, width: 0 };
    }
    const layout = getWeeklyFreezeLayout(streak);
    if (!layout) return { start: 0, end: 0, width: 0 };
    const start = layout.greyStartLinePct;
    const end = layout.greyEndLinePct;
    return {
        start: start,
        end: end,
        width: Math.max(0, end - start),
    };
}

function isWeeklyStartReached(streak) {
    if (isStreakFreezeDay()) return true;
    if (isWeeklySlipReflectDay()) return false;
    const progress = getWeeklyStreakDay(streak);
    if (progress > 0) return true;
    if (state.todayStatus === 'success') return true;
    return getIntraDaySegmentProgress() > 0;
}

/** Most recent strong wall date in the current weekly segment (before today’s slip on freeze days). */
function getWeeklyStrongEndpointWallDate() {
    var today = todayKey();
    if (isStreakFreezeDay()) {
        var d = addDaysToKey(today, -1);
        var anchor = readJourneyAnchorWallDate() || inferJourneyStartFromLog();
        while (d >= anchor) {
            if (getWallDateLogStatus(d) === 'strong') return d;
            if (getWallDateLogStatus(d) === 'slip') break;
            d = addDaysToKey(d, -1);
        }
        return null;
    }
    if (getWallDateLogStatus(today) === 'strong') return today;
    d = addDaysToKey(today, -1);
    anchor = readJourneyAnchorWallDate() || inferJourneyStartFromLog();
    while (d >= anchor) {
        if (getWallDateLogStatus(d) === 'strong') return d;
        if (getWallDateLogStatus(d) === 'slip') break;
        d = addDaysToKey(d, -1);
    }
    return null;
}

function walkBackStrongDaysFrom(endDate, strongDaysBack) {
    if (!endDate || strongDaysBack < 0) return null;
    if (strongDaysBack === 0) return endDate;
    var d = endDate;
    var remaining = strongDaysBack;
    var anchor = readJourneyAnchorWallDate() || inferJourneyStartFromLog();
    while (d >= anchor) {
        if (getWallDateLogStatus(d) === 'strong') {
            if (remaining === 0) return d;
            remaining--;
        }
        d = addDaysToKey(d, -1);
    }
    return null;
}

/** weekDay 1–7 → wall date for that strong/slip slot in the current weekly track. */
function getWeeklyDayWallDate(weekDay) {
    if (weekDay < 1 || weekDay > 7) return null;

    var streak = getDisplayStreak();
    var freeze = isStreakFreezeDay();
    var freezeLayout = freeze ? getWeeklyFreezeLayout(streak) : null;
    var strongDays = freezeLayout ? freezeLayout.strongWeekDay : getWeeklyStreakDay(streak);

    if (freeze && freezeLayout && weekDay === freezeLayout.slipWeekDay) {
        return todayKey();
    }
    if (weekDay > strongDays) return null;

    var endpoint = getWeeklyStrongEndpointWallDate();
    if (!endpoint) return null;
    return walkBackStrongDaysFrom(endpoint, strongDays - weekDay);
}

/**
 * weekSlot 0 = Start (day before Day 1, if logged), 1–7 = track days.
 * Returns null when the slot has no logged wall date.
 */
function getWeeklyTrackWallDate(weekSlot) {
    if (weekSlot == null || weekSlot < 0 || weekSlot > 7) return null;
    if (weekSlot === 0) {
        var day1 = getWeeklyDayWallDate(1);
        if (!day1) return null;
        var prev = addDaysToKey(day1, -1);
        return isWallDateLogged(prev) ? prev : null;
    }
    return getWeeklyDayWallDate(weekSlot);
}

function formatDayLogInsight(dateKey) {
    if (!dateKey) return null;
    var entry = getDailyLogEntry(dateKey);
    if (!entry || !logStatus(entry)) return null;
    var status = logStatus(entry);
    var d = parseDateKey(dateKey);
    var dateLabel = d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });
    var stateKey = normalizeDayState(entry.dayState);
    var stateInfo = stateKey && typeof DAY_LOG_STATES !== 'undefined' ? DAY_LOG_STATES[stateKey] : null;
    var outcome = status === 'strong' ? '✓ I Stayed Strong Today' : '✕ I Slipped Today';
    var note = entry.note ? String(entry.note).trim() : '';
    return {
        title: dateLabel,
        outcome: outcome,
        stateLabel: stateInfo ? stateInfo.emoji + ' ' + stateInfo.label : '',
        note: note,
        body: note || outcome,
    };
}

function formatWeeklyLoggedInsight(dateKey) {
    return formatDayLogInsight(dateKey);
}

function getWeeklyActiveTraveler(streak) {
    const leftPct = getWeeklyTravelerPct(streak);
    return leftPct == null ? null : { leftPct };
}
