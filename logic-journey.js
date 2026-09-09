/**
 * logic-journey.js — Journey lifecycle, score, milestones, calendar-day mapping.
 * May read dailyLog; does not recompute streak algorithms.
 *
 * File order (read top → bottom):
 *   1. Queries — gates only; streak.js may call these, never lifecycle commands
 *   2. Anchors & calendar day — journeyStartDate / Day N (infer helpers may write state)
 *   3. Scoring & best journey
 *   4. Milestones — counters + UI celebration copy
 *   5. Lifecycle commands — onboarding, archive, heal, next journey
 *
 * Stuck after 10 slips → healStrandedJourneyEnd, pendingNextJourney, archiveCompletedJourney.
 * Streak may call QUERIES only — LIFECYCLE COMMANDS at bottom (ARCHITECTURE.md).
 */

// ════════════════════════════════════════════════════════
//  QUERIES (read-only — streak may call; no lifecycle side effects)
// ════════════════════════════════════════════════════════

function isAwaitingNextJourney(s) {
    s = s || state;
    return !!s.pendingNextJourney;
}

function isJourneyEndedDisplay(s) {
    return isAwaitingNextJourney(s);
}

function shouldCountCurrentJourneyForMilestones(s) {
    s = s || state;
    if (isAwaitingNextJourney(s)) return false;
    if (journeyIsOver(s)) return false;
    return true;
}

function journeyIsOver(s) {
    s = s || state;
    return (s.score && s.score.failures) >= MAX_FAILURES;
}

function canLogToday() {
    return !isAwaitingNextJourney() && !journeyIsOver(state);
}

function canBeginNextJourneyToday() {
    if (!isAwaitingNextJourney()) return false;
    var ended = state.journeyEndedDate;
    if (!ended || !/^\d{4}-\d{2}-\d{2}$/.test(ended)) return false;
    return todayKey() !== ended && todayKey() > ended;
}

// ════════════════════════════════════════════════════════
//  ANCHORS & CALENDAR DAY
//  read* = no writes · ensure* = infer + persist · infer* = derive only
// ════════════════════════════════════════════════════════

function inferJourneyStartFromLog(s) {
    s = s || state;
    var log = s.dailyLog || {};
    var dayOneDates = [];
    var earliest = '';
    for (var key in log) {
        if (!Object.prototype.hasOwnProperty.call(log, key)) continue;
        var entry = log[key];
        if (!entry || typeof entry !== 'object') continue;
        var date = entry.date || (/^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (entry.day === 1) dayOneDates.push(date);
        if (!earliest || date < earliest) earliest = date;
    }
    if (dayOneDates.length) {
        dayOneDates.sort();
        return dayOneDates[dayOneDates.length - 1];
    }
    if (earliest && (s.calendarDay || 1) > 1) return earliest;
    if (s.lastOpenedDate && /^\d{4}-\d{2}-\d{2}$/.test(s.lastOpenedDate)) {
        return s.lastOpenedDate;
    }
    return todayKey();
}

/** Read persisted journey Day 1 — empty string if unset (no infer, no write). */
function readJourneyAnchorWallDate(s) {
    s = s || state;
    if (s.journeyStartDate && /^\d{4}-\d{2}-\d{2}$/.test(s.journeyStartDate)) {
        return s.journeyStartDate;
    }
    return '';
}

/** Infer and persist journey Day 1 when missing (commands / logging — not streak queries). */
function ensureJourneyAnchorWallDate(s) {
    s = s || state;
    var anchor = readJourneyAnchorWallDate(s);
    if (anchor) return anchor;
    s.journeyStartDate = inferJourneyStartFromLog(s);
    return s.journeyStartDate;
}

function inferAppStartFromLog(s) {
    s = s || state;
    var log = s.dailyLog || {};
    var earliest = '';
    for (var key in log) {
        if (!Object.prototype.hasOwnProperty.call(log, key)) continue;
        var entry = log[key];
        if (!entry || typeof entry !== 'object') continue;
        var date = entry.date || (/^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (!earliest || date < earliest) earliest = date;
    }
    return earliest || '';
}

/** Read persisted install Day 1 — empty string if unset (no infer, no write). */
function readAppStartWallDate(s) {
    s = s || state;
    if (s.appStartDate && /^\d{4}-\d{2}-\d{2}$/.test(s.appStartDate)) {
        return s.appStartDate;
    }
    return '';
}

/** Infer and persist install Day 1 when missing. */
function ensureAppStartWallDate(s) {
    s = s || state;
    var start = readAppStartWallDate(s);
    if (start) return start;
    var fromLog = inferAppStartFromLog(s);
    if (fromLog) {
        s.appStartDate = fromLog;
        return s.appStartDate;
    }
    s.appStartDate = ensureJourneyAnchorWallDate(s);
    return s.appStartDate;
}

function getCalendarDayForWallDate(dateKey) {
    dateKey = clampDateKeyToRealToday(dateKey || todayKey());
    var anchor = ensureJourneyAnchorWallDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
        return Math.max(1, state.calendarDay || 1);
    }
    if (dateKey < anchor) return 1;
    var max = getMaxCalendarDayForToday();
    var day = daysBetweenKeys(anchor, dateKey) + 1;
    if (day < 1) day = 1;
    if (day > max) day = max;
    return day;
}

function getMaxCalendarDayForToday() {
    var anchor = readJourneyAnchorWallDate() || inferJourneyStartFromLog();
    if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
        return Math.max(1, state.calendarDay || 1);
    }
    return Math.max(1, daysBetweenKeys(anchor, todayKey()) + 1);
}

function getDisplayCalendarDay() {
    return getMaxCalendarDayForToday();
}

function clampCalendarDayToRealToday() {
    const max = getMaxCalendarDayForToday();
    if ((state.calendarDay || 1) < max) {
        state.calendarDay = max;
    } else if ((state.calendarDay || 1) > max) {
        state.calendarDay = max;
        if (!isWallDateLogged(todayKey())) {
            state.todayStatus = 'none';
            state.todayFailCount = 0;
        }
    }
}

// ════════════════════════════════════════════════════════
//  SCORING & BEST JOURNEY
// ════════════════════════════════════════════════════════

function formatJourneyScore(score) {
    score = score || {};
    return (Number(score.success) || 0) + '/' + (Number(score.failures) || 0);
}

function getJourneyStrongDayImprovementPct(currentSuccess, prevSuccess) {
    var cur = Number(currentSuccess) || 0;
    var prev = Number(prevSuccess) || 0;
    if (prev <= 0 || cur <= prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
}

function isBetterJourneyScore(success, failures, best) {
    if (!best) return true;
    var bestSuccess = Number(best.success);
    var bestFailures = Number(best.failures);
    if (Number.isNaN(bestSuccess)) bestSuccess = 0;
    if (Number.isNaN(bestFailures)) bestFailures = 0;
    success = Number(success) || 0;
    failures = Number(failures) || 0;
    if (success > bestSuccess) return true;
    if (success < bestSuccess) return false;
    return failures < bestFailures;
}

function pickBetterJourneyScore(candidate, best) {
    if (!best) {
        return { success: candidate.success || 0, failures: candidate.failures || 0 };
    }
    return isBetterJourneyScore(candidate.success, candidate.failures, best)
        ? { success: candidate.success || 0, failures: candidate.failures || 0 }
        : { success: best.success || 0, failures: best.failures || 0 };
}

function bestScoreFromCompletedJourneys(journeys) {
    if (!journeys || !journeys.length) return null;
    var first = journeys[0].score || { success: 0, failures: 0 };
    var best = { success: first.success || 0, failures: first.failures || 0 };
    for (var i = 1; i < journeys.length; i++) {
        best = pickBetterJourneyScore(journeys[i].score || { success: 0, failures: 0 }, best);
    }
    return best;
}

function findCompletedJourneyForScore(journeys, score) {
    if (!journeys || !journeys.length || !score) return null;
    var targetSuccess = Number(score.success) || 0;
    var targetFailures = Number(score.failures) || 0;
    for (var i = 0; i < journeys.length; i++) {
        var sc = journeys[i].score || {};
        if ((Number(sc.success) || 0) === targetSuccess
            && (Number(sc.failures) || 0) === targetFailures) {
            return journeys[i];
        }
    }
    return null;
}

function getDisplayBestJourney() {
    return pickBetterJourneyScore(state.score, state.bestJourney);
}

function updateBestJourney() {
    const { success, failures } = state.score;
    var s = success || 0;
    var f = failures || 0;

    if (f < MAX_FAILURES) return;

    if (isBetterJourneyScore(s, f, state.bestJourney)) {
        state.bestJourney = { success: s, failures: f };
    }
}

function journeyScoreSuccess(s) {
    s = s || state;
    return (s.score && s.score.success) || 0;
}

// ════════════════════════════════════════════════════════
//  MILESTONE COUNTERS (derived from journey history)
// ════════════════════════════════════════════════════════

function createEmptyJourneyMilestoneCounts() {
    var counts = {};
    for (var i = 0; i < JOURNEY_MILESTONE_DAYS.length; i++) {
        counts[JOURNEY_MILESTONE_DAYS[i]] = 0;
    }
    return counts;
}

function normalizeJourneyMilestoneCounts(raw, defaults) {
    var counts = Object.assign({}, defaults);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return counts;
    for (var day in counts) {
        if (!Object.prototype.hasOwnProperty.call(counts, day)) continue;
        var n = Math.floor(Number(raw[day]));
        if (n > 0) counts[day] = n;
    }
    return counts;
}

function ensureJourneyMilestoneCounts(s) {
    s = s || state;
    if (!s.journeyMilestones || typeof s.journeyMilestones !== 'object' || Array.isArray(s.journeyMilestones)) {
        s.journeyMilestones = createEmptyJourneyMilestoneCounts();
    }
}

function countJourneysPeakingAtLeast(day, s) {
    s = s || state;
    var n = 0;
    var journeys = s.completedJourneys || [];
    for (var i = 0; i < journeys.length; i++) {
        var jScore = journeys[i].score;
        if (((jScore && jScore.success) || 0) >= day) n++;
    }
    if (shouldCountCurrentJourneyForMilestones(s) && journeyScoreSuccess(s) >= day) n++;
    return n;
}

function syncJourneyMilestoneCountsFromHistory(s) {
    s = s || state;
    ensureJourneyMilestoneCounts(s);
    for (var i = 0; i < JOURNEY_MILESTONE_DAYS.length; i++) {
        var day = JOURNEY_MILESTONE_DAYS[i];
        s.journeyMilestones[day] = countJourneysPeakingAtLeast(day, s);
    }
}

function maxJourneyStrongDaysEver() {
    var max = journeyScoreSuccess();
    var journeys = state.completedJourneys || [];
    for (var i = 0; i < journeys.length; i++) {
        var jScore = journeys[i].score;
        max = Math.max(max, (jScore && jScore.success) || 0);
    }
    return max;
}

function isJourneyMilestoneRevealed(unlockAt) {
    return journeyScoreSuccess() >= unlockAt || maxJourneyStrongDaysEver() >= unlockAt;
}

function shouldJourneyMilestoneGlow(day) {
    return journeyScoreSuccess() >= day;
}

function isJourneyMilestonePreviouslyAchieved(day, s) {
    s = s || state;
    if (journeyScoreSuccess(s) >= day) return false;
    return getJourneyMilestoneDisplayCount(day) > 0;
}

function getJourneyMilestoneDisplayCount(day) {
    return countJourneysPeakingAtLeast(day);
}

function formatJourneyMilestoneStatus(day) {
    return String(getJourneyMilestoneDisplayCount(day));
}

function getJourneyMilestonesRenderKey(s) {
    s = s || state;
    var parts = [
        journeyScoreSuccess(s),
        maxJourneyStrongDaysEver(),
        isAwaitingNextJourney(s) ? 1 : 0,
        isJourneyEndedDisplay(s) ? 1 : 0,
        s.attempt || 1,
    ];
    for (var i = 0; i < JOURNEY_MILESTONE_DAYS.length; i++) {
        parts.push(getJourneyMilestoneDisplayCount(JOURNEY_MILESTONE_DAYS[i]));
    }
    return parts.join('|');
}

function getCompletedJourneysBestSuccess(s) {
    s = s || state;
    var best = bestScoreFromCompletedJourneys(s.completedJourneys || []);
    return best ? Math.max(0, best.success || 0) : 0;
}

function getNextStandardMilestoneDay(afterDay) {
    for (var i = 0; i < JOURNEY_MILESTONE_DAYS.length; i++) {
        if (JOURNEY_MILESTONE_DAYS[i] > afterDay) return JOURNEY_MILESTONE_DAYS[i];
    }
    return null;
}

function getMilestoneUnlockDay(day) {
    var idx = JOURNEY_MILESTONE_DAYS.indexOf(day);
    if (idx <= 0) return 0;
    return JOURNEY_MILESTONE_DAYS[idx - 1];
}

function getPersonalBestMilestoneDay(s) {
    var best = getCompletedJourneysBestSuccess(s);
    return best > 0 && !JOURNEY_MILESTONES[best] ? best : null;
}

function getNextTargetAfterMilestoneHit(fixedDay, s) {
    s = s || state;
    var prior = getCompletedJourneysBestSuccess(s);
    var nextFixed = getNextStandardMilestoneDay(fixedDay);
    if (prior > fixedDay && prior < nextFixed) return prior;
    return nextFixed;
}

function getActiveJourneyTargetDay(curS, s) {
    s = s || state;
    curS = Math.max(0, Math.floor(Number(curS) || 0));
    var priorBest = getCompletedJourneysBestSuccess(s);
    var nextFixed = getNextStandardMilestoneDay(curS);
    if (!priorBest) return nextFixed;

    var candidates = [];
    if (nextFixed != null) candidates.push(nextFixed);
    if (priorBest > curS) candidates.push(priorBest);
    if (!candidates.length) return null;
    return Math.min.apply(null, candidates);
}

function isOnNewBestJourney(s) {
    s = s || state;
    var prior = bestScoreFromCompletedJourneys(s.completedJourneys || []);
    if (!prior) return false;
    var curS = journeyScoreSuccess(s);
    var curF = (s.score && s.score.failures) || 0;
    return isBetterJourneyScore(curS, curF, prior);
}

function getBestJourneyHintParts(s) {
    s = s || state;
    if (isAwaitingNextJourney(s)) return null;
    if (!shouldCountCurrentJourneyForMilestones(s)) return null;

    var curS = journeyScoreSuccess(s);
    var targetDay = getActiveJourneyTargetDay(curS, s);
    if (!targetDay) return null;

    var onNewBest = isOnNewBestJourney(s);
    var parts = {
        targetLine: onNewBest
            ? 'New Best! Target ' + targetDay + ' Days'
            : 'Target ' + targetDay + ' strong days',
        bestLine: null,
    };
    var priorBest = getCompletedJourneysBestSuccess(s);
    if (priorBest > 0) {
        parts.bestLine = 'Best - ' + priorBest + ' strong days';
    }
    return parts;
}

function getBestJourneyHintText(s) {
    var parts = getBestJourneyHintParts(s);
    if (!parts) return null;
    if (parts.bestLine) return parts.targetLine + '\n' + parts.bestLine;
    return parts.targetLine;
}

function resolveJourneyMilestoneHit(successCount) {
    return JOURNEY_MILESTONES[successCount] ? successCount : null;
}

function isPersonalBestJourneyCrossing(successCount, s) {
    s = s || state;
    var personal = getPersonalBestMilestoneDay(s);
    return personal != null && successCount === personal;
}

// ════════════════════════════════════════════════════════
//  MILESTONE UI (celebration copy — no score math here)
// ════════════════════════════════════════════════════════

function buildPersonalBestJourneyCelebration(successCount, s) {
    s = s || state;
    if (!isPersonalBestJourneyCrossing(successCount, s)) return null;
    var next = getNextStandardMilestoneDay(successCount);
    var message = 'You matched your all-time best journey score — you are on your best journey!';
    if (next) {
        message += ' Next milestone — ' + next + ' strong days.';
    }
    return {
        emoji: '🏆',
        stage: 'BEST JOURNEY',
        title: successCount + ' Days — On Your Best Journey!',
        message: message,
    };
}

function buildJourneyMilestoneCelebration(hitDay, s) {
    s = s || state;
    var base = JOURNEY_MILESTONES[hitDay];
    if (!base) return null;
    var data = {
        emoji: base.emoji,
        stage: base.stage,
        title: base.title,
        message: base.message,
    };
    var next = getNextTargetAfterMilestoneHit(hitDay, s);
    if (next === getCompletedJourneysBestSuccess(s)) {
        data.message = data.message.replace(/\s*Next target — \d+ strong days\.?\s*$/, '');
        data.message += ` Next target — beat ${next} strong days to win your best journey.`;
    }
    return data;
}

function expandSectionMilestones(sectionDays, options) {
    options = options || {};
    var out = [];
    for (var i = 0; i < sectionDays.length; i++) {
        var day = sectionDays[i];
        var meta = JOURNEY_MILESTONES[day];
        out.push({
            day: day,
            emoji: meta.emoji,
            label: day + ' Days',
            unlockAt: options.alwaysVisible ? 0 : getMilestoneUnlockDay(day),
        });
    }
    return out;
}

// ════════════════════════════════════════════════════════
//  LIFECYCLE COMMANDS (mutate journey fields — not for streak.js)
// ════════════════════════════════════════════════════════

function beginJourneyAfterOnboarding() {
    safeSet('onboardingComplete', 'true');

    if (!state.calendarDay || state.calendarDay < 1) {
        state.calendarDay = 1;
    }
    var dayOne = todayKey();
    if (!state.lastOpenedDate) {
        state.lastOpenedDate = dayOne;
    }
    if (!state.lastCheckedDate) {
        state.lastCheckedDate = state.lastOpenedDate;
    }
    if (!state.journeyStartDate) {
        state.journeyStartDate = dayOne;
    }
    ensureAppStartWallDate(state);

    startPremiumTrial();
    ensureTrialStarted(state, { force: true });
}

function beginNextJourney() {
    if (!isAwaitingNextJourney()) return;

    var ended = state.journeyEndedDate;
    var dayOne = todayKey();
    if (ended && /^\d{4}-\d{2}-\d{2}$/.test(ended)) {
        dayOne = addDaysToKey(ended, 1);
        if (dayOne > todayKey()) dayOne = todayKey();
    }

    state.attempt++;
    state.score = { success: 0, failures: 0 };
    state.longestStreakAtStreakStart = state.longestStreak;
    state.currentStreak = 0;
    state.calendarDay = Math.max(1, daysBetweenKeys(dayOne, todayKey()) + 1);
    state.journeyStartDate = dayOne;
    state.lastOpenedDate = dayOne;
    state.lastCheckedDate = dayOne;
    state.currentJourneyStreaks = [];
    state.recordCelebrated = false;
    state.todayStatus = 'none';
    state.todayFailCount = 0;
    state.pendingNextJourney = false;
    state.journeyEndedDate = '';
    state.lastFreezeStreak = 0;
    state.lastFreezeDate = '';
}

function inferJourneyEndWallDate(s) {
    s = s || state;
    if (s.journeyEndedDate && /^\d{4}-\d{2}-\d{2}$/.test(s.journeyEndedDate)) {
        return clampDateKeyToRealToday(s.journeyEndedDate);
    }
    if (s.lastFreezeDate && /^\d{4}-\d{2}-\d{2}$/.test(s.lastFreezeDate)) {
        return clampDateKeyToRealToday(s.lastFreezeDate);
    }
    var log = s.dailyLog || {};
    var latest = '';
    for (var k in log) {
        if (!Object.prototype.hasOwnProperty.call(log, k)) continue;
        var entry = log[k];
        if (!entry || logStatus(entry) !== 'slip') continue;
        var d = (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
            ? entry.date
            : (/^\d{4}-\d{2}-\d{2}$/.test(k) ? k : '');
        if (d && d > latest) latest = d;
    }
    if (latest) return clampDateKeyToRealToday(latest);
    return todayKey();
}

function healStrandedJourneyEnd(s) {
    s = s || state;
    if (!journeyIsOver(s)) return false;
    if (isAwaitingNextJourney(s)) return false;

    var attempt = Math.max(1, Math.floor(Number(s.attempt) || 1));
    var journeys = s.completedJourneys || [];
    var alreadyArchived = false;
    for (var i = 0; i < journeys.length; i++) {
        if (Math.max(1, Math.floor(Number(journeys[i].attempt) || 1)) === attempt) {
            alreadyArchived = true;
            break;
        }
    }

    if (alreadyArchived) {
        s.pendingNextJourney = true;
        if (!s.journeyEndedDate || !/^\d{4}-\d{2}-\d{2}$/.test(s.journeyEndedDate)) {
            s.journeyEndedDate = inferJourneyEndWallDate(s);
        }
        updateBestJourney();
        return true;
    }

    return !!archiveCompletedJourney(inferJourneyEndWallDate(s));
}

function archiveCompletedJourney(endWallDate) {
    if (isAwaitingNextJourney()) return null;

    const prevBestScore = bestScoreFromCompletedJourneys(state.completedJourneys);
    var prevBestJourney = prevBestScore
        ? findCompletedJourneyForScore(state.completedJourneys, prevBestScore)
        : null;
    const comparison = {
        attempt: state.attempt,
        score: { ...state.score },
        prevBestScore,
        prevBestAttempt: prevBestJourney ? prevBestJourney.attempt : null,
    };

    state.completedJourneys.push({
        attempt: state.attempt,
        score: { ...state.score },
        date: new Date().toISOString(),
    });

    state.pastJourneyStreaks.push({
        attempt: state.attempt,
        streaks: [...state.currentJourneyStreaks],
        date: new Date().toISOString(),
    });

    var ended = clampDateKeyToRealToday(endWallDate || todayKey());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ended)) ended = todayKey();

    state.pendingNextJourney = true;
    state.journeyEndedDate = ended;

    updateBestJourney();

    return comparison;
}
