/**
 * logic.js — State, storage, dates, and business rules.
 * No DOM — UI lives in ui-main.js, ui-actions.js, ui-overlays.js, ui-history.js, ui-day.js, boot.js.
 *
 * STATE FIELD CHEAT SHEET (pick the right date — they are not interchangeable)
 *
 * App "today"         todayKey()              Real local date + optional state.devDateOffset (test "New day")
 * calendarDay         Display Journey Day N   Wall days from journeyStartDate through today (clamped)
 * journeyStartDate    Current Journey Day 1   Resets on beginNextJourney (ended + 1, not "return day")
 * appStartDate        First-ever Day 1        Never resets; month grid greys days before install
 * lastOpenedDate      Last active calendar day  Set on log / catch-up; used to detect absence
 * lastCheckedDate     Last successful day-roll  Unset while yesterday popup is waiting
 * journeyEndedDate    Wall date of 10th slip    Empty unless pendingNextJourney
 * pendingNextJourney  Between journeys          Logging blocked until canBeginNextJourneyToday
 * todayStatus         today only                none | success | failed — never for yesterday
 * todayFailCount      Slips logged today only   Historical slips must not increment this
 * currentStreak       Live consecutive strong   Always recompute from dailyLog (not tap order)
 * longestStreak       All-time streak peak
 * score.success/fail  Journey strong / slips    Permanent bestJourney writes only at 10 slips
 * dailyLog            YYYY-MM-DD → strong|slip  Source of truth for calendar + streak recompute
 * lastFreezeStreak/Date  UI grey after today's first slip only
 * See also ARCHITECTURE.md → Journey state fields.
 */

// ════════════════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════════════════

let _memStorage = {};

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveToStorage(stateObj) {
    try {
        syncJourneyMilestoneCountsFromHistory(stateObj);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateObj));
        return { ok: true };
    } catch (e) {
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        return { ok: false, error: isQuota ? 'quota' : 'unknown' };
    }
}

function safeGet(key) {
    try {
        const v = localStorage.getItem(key);
        if (v !== null) return v;
    } catch { /* file:// or private mode */ }
    try {
        const v = sessionStorage.getItem(key);
        if (v !== null) return v;
    } catch { /* same */ }
    return _memStorage[key] !== undefined ? _memStorage[key] : null;
}

function safeSet(key, val) {
    try {
        localStorage.setItem(key, val);
        return;
    } catch { /* file:// or private mode */ }
    try {
        sessionStorage.setItem(key, val);
        return;
    } catch { /* same */ }
    _memStorage[key] = val;
}

function safeRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    delete _memStorage[key];
}

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

function realTodayKey() {
    return dateKeyFromDate(new Date());
}

function todayKey() {
    var offset = (state && state.devDateOffset) || 0;
    if (!offset) return realTodayKey();
    return addDaysToKey(realTodayKey(), offset);
}

// ════════════════════════════════════════════════════════
//  DAILY LOG HELPERS
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

/** Never store wall dates after app "today" (real day + optional devDateOffset). */
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

function nextSlipCount(logDate, calDay) {
    var prev = getDailyLogEntry(logDate, calDay);
    if (prev && logStatus(prev) === 'slip') {
        return (prev.slipCount || 1) + 1;
    }
    return 1;
}

// ════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════

function getDefaultState() {
    return {
        calendarDay: 1,
        todayStatus: 'none',
        todayFailCount: 0,
        lastOpenedDate: '',
        lastCheckedDate: '',
        /** Wall date (YYYY-MM-DD) of the current journey's Day 1 — resets each new journey. */
        journeyStartDate: '',
        /** Wall date of first-ever Day 1 (install) — never resets; month grid pre-journey grey. */
        appStartDate: '',
        attempt: 1,
        score: { success: 0, failures: 0 },
        currentStreak: 0,
        longestStreak: 0,
        longestStreakAtStreakStart: 0,
        day50Count: 0,
        day100Count: 0,
        journeyMilestones: createEmptyJourneyMilestoneCounts(),
        bestJourney: { success: 0, failures: 0 },
        completedJourneys: [],
        currentJourneyStreaks: [],
        pastJourneyStreaks: [],
        urgesSurfed: 0,
        urgeLog: [],
        dailyLog: {},
        recordCelebrated: false,
        pendingNextJourney: false,
        journeyEndedDate: '',
        /** Length archived on the first slip of that calendar day (for freeze UI only). */
        lastFreezeStreak: 0,
        lastFreezeDate: '',
        devDateOffset: 0,
        trialStartedAt: '',
        premiumUntil: '',
    };
}

function mergeSavedState(saved) {
    const defaults = getDefaultState();
    const merged = { ...defaults, ...saved };

    merged.score = { ...defaults.score, ...(saved.score || saved.currentScore || {}) };
    merged.bestJourney = {
        ...defaults.bestJourney,
        ...(typeof saved.bestJourney === 'object' ? saved.bestJourney : {}),
        ...(typeof saved.highestScore === 'object' ? saved.highestScore : {}),
    };
    merged.journeyMilestones = normalizeJourneyMilestoneCounts(
        saved.journeyMilestones,
        defaults.journeyMilestones,
    );
    merged.completedJourneys = saved.completedJourneys || saved.attemptHistory || defaults.completedJourneys;
    merged.pastJourneyStreaks = saved.pastJourneyStreaks || saved.streakHistory || defaults.pastJourneyStreaks;
    merged.currentJourneyStreaks = saved.currentJourneyStreaks || saved.currentAttemptStreaks || defaults.currentJourneyStreaks;
    merged.urgeLog = saved.urgeLog || defaults.urgeLog;
    syncJourneyMilestoneCountsFromHistory(merged);
    var migrated = runStateMigrations(merged, saved);
    // Prefer best from completed journeys when present. Never wipe a saved
    // legacy bestJourney when archives are empty (old data / mid-migrate).
    if (typeof bestScoreFromCompletedJourneys === 'function') {
        var fromCompleted = bestScoreFromCompletedJourneys(migrated.completedJourneys || []);
        if (fromCompleted) {
            migrated.bestJourney = pickBetterJourneyScore(
                fromCompleted,
                migrated.bestJourney,
            );
        }
        // If no completed archives: keep merged bestJourney / highestScore as-is.
    }
    return migrated;
}

let state = getDefaultState();

/** Replace app state in place so every script keeps the same global state object. */
function replaceState(next) {
    for (const key of Object.keys(state)) {
        delete state[key];
    }
    Object.assign(state, next);
}

/**
 * Ensure a valid trialStartedAt exists so trial lasts PREMIUM_TRIAL_DAYS from
 * journey calendar Day 1 (set on onboarding / when onboarded user loads).
 * Does not restart an expired trial (keeps a valid past stamp).
 * Ownership: Storage / Journey bootstrap — not Entitlement (read-only).
 * @param {object} [s] state
 * @param {{ force?: boolean }} [opts] force=true skips onboarding check
 * @returns {boolean} true if trialStartedAt was written/repaired
 */
function ensureTrialStarted(s, opts) {
    s = s || state;
    opts = opts || {};
    if (!opts.force && safeGet('onboardingComplete') !== 'true') return false;

    if (s.trialStartedAt) {
        var start = new Date(s.trialStartedAt);
        if (!Number.isNaN(start.getTime())) return false; // valid stamp (active or already expired)
    }

    s.trialStartedAt = trialStartIsoForCalendarDayOne(s);
    return true;
}

/**
 * Start of the user's journey Day 1 in local time (fallback: today).
 * Trial window runs PREMIUM_TRIAL_DAYS from this midnight.
 */
function trialStartIsoForCalendarDayOne(s) {
    s = s || state;
    var key = '';
    var log = s.dailyLog || {};
    var keys = Object.keys(log);
    for (var i = 0; i < keys.length; i++) {
        var entry = log[keys[i]];
        if (entry && entry.day === 1 && entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
            key = entry.date;
            break;
        }
    }
    if (!key && s.lastOpenedDate && /^\d{4}-\d{2}-\d{2}$/.test(s.lastOpenedDate)) {
        key = s.lastOpenedDate;
    }
    if (!key) key = todayKey();
    var parts = key.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    var localMidnight = new Date(y, m, d, 0, 0, 0, 0);
    if (Number.isNaN(localMidnight.getTime())) return new Date().toISOString();
    return localMidnight.toISOString();
}

/** Stamp trial when onboarding ends (Skip or full slides) — Calendar Day 1 window. */
function startPremiumTrial() {
    // Active trial: keep existing start date (do not reset the clock).
    if (state.trialStartedAt) {
        var start = new Date(state.trialStartedAt);
        if (!Number.isNaN(start.getTime())) {
            var ends = start.getTime() + PREMIUM_TRIAL_DAYS * MS_PER_DAY;
            if (ends > Date.now()) return;
        }
    }
    // Missing or expired stamp — begin from local midnight of journey Day 1.
    state.trialStartedAt = trialStartIsoForCalendarDayOne(state);
}

/**
 * Single finish path for Skip and “Let’s Begin”.
 * Marks onboarding done, anchors journey Day 1 dates, starts Premium trial.
 */
function beginJourneyAfterOnboarding() {
    safeSet('onboardingComplete', 'true');

    // Journey Day 1 — same whether user skipped slides or opened every one.
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
    // Current journey Day 1 + permanent install anchor for the month grid.
    if (!state.journeyStartDate) {
        state.journeyStartDate = dayOne;
    }
    if (!state.appStartDate) {
        state.appStartDate = state.journeyStartDate;
    }

    startPremiumTrial();
    // Idempotent if stamp missing (never skips Day-1 seed).
    ensureTrialStarted(state, { force: true });
}

// ════════════════════════════════════════════════════════
//  SCORING & JOURNEY RULES
// ════════════════════════════════════════════════════════

/**
 * Display form for a journey score object.
 * @param {{ success?: number, failures?: number }|null|undefined} score
 * @returns {string} e.g. "103/10"
 */
function formatJourneyScore(score) {
    score = score || {};
    return (Number(score.success) || 0) + '/' + (Number(score.failures) || 0);
}

/**
 * % improvement on strong days vs prior Best (e.g. 20 → 28 = 40%).
 * @returns {number|null} rounded percent, or null if not computable
 */
function getJourneyStrongDayImprovementPct(currentSuccess, prevSuccess) {
    var cur = Number(currentSuccess) || 0;
    var prev = Number(prevSuccess) || 0;
    if (prev <= 0 || cur <= prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Journey score ranking (success/failures = strong days / slips used).
 *
 * Product model:
 *  - A finished Journey always ends after 10 slips → permanent "Best Journey"
 *    values are those full scores (e.g. 30/10 after Journey 1).
 *  - That N/10 score is the benchmark from Journey 2 onward.
 *  - Live current Journey displays as Best when it is ahead:
 *      (1) more strong days than prior Best, or
 *      (2) same strong days with fewer slips (e.g. 30/7 beats 30/10).
 *  - Permanent bestJourney is only written when a Journey completes (10 slips).
 */
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
    // Completed journeys always carry the full score (ends at MAX_FAILURES slips).
    var first = journeys[0].score || { success: 0, failures: 0 };
    var best = { success: first.success || 0, failures: first.failures || 0 };
    for (var i = 1; i < journeys.length; i++) {
        best = pickBetterJourneyScore(journeys[i].score || { success: 0, failures: 0 }, best);
    }
    return best;
}

/**
 * Header Best: permanent N/10 Best, or live current if it is strictly better
 * (more strong days, or same strong with fewer slips).
 */
function getDisplayBestJourney() {
    // Between Journeys the live score still holds the finished N/10 until next Day 1.
    return pickBetterJourneyScore(state.score, state.bestJourney);
}

/**
 * Lock permanent Best only when this Journey has used all 10 Powers.
 * Mid-journey peaks are shown via getDisplayBestJourney, not written as Best.
 */
function updateBestJourney() {
    const { success, failures } = state.score;
    var s = success || 0;
    var f = failures || 0;

    // Permanent Best Journey = full Journey score (ends at 10 slips).
    if (f < MAX_FAILURES) return;

    if (isBetterJourneyScore(s, f, state.bestJourney)) {
        state.bestJourney = { success: s, failures: f };
    }
}

// ════════════════════════════════════════════════════════
//  JOURNEY MILESTONE COUNTERS
// ════════════════════════════════════════════════════════

function journeyScoreSuccess(s) {
    s = s || state;
    return (s.score && s.score.success) || 0;
}

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

/** Journeys (completed + current) whose peak strong-day count reached at least `day`. */
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

/**
 * Derive milestone counts from journey history — single source of truth.
 * Count = how many journeys (including the current one) reached at least this day.
 * Guarantees lower milestones never show a smaller count than higher ones.
 */
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

function getJourneyMilestoneDisplayCount(day) {
    return countJourneysPeakingAtLeast(day);
}

function formatJourneyMilestoneStatus(day) {
    return String(getJourneyMilestoneDisplayCount(day));
}

/** Stable fingerprint — skip Journey tab DOM rebuild when counts and reveal state are unchanged. */
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
        parts.push(getJourneyMilestoneDisplayCount(JOURNEY_MILESTONE_DAYS[i], s));
    }
    return parts.join('|');
}

/** Best strong-day count from completed journeys only (target to beat this journey). */
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

/**
 * Prior best (completed journeys) on a non-standard day — e.g. 254 between 200 and 300.
 * Used for milestone popup copy and personal-best crossing celebrations.
 */
function getPersonalBestMilestoneDay(s) {
    var best = getCompletedJourneysBestSuccess(s);
    return best > 0 && !JOURNEY_MILESTONES[best] ? best : null;
}

/** Next target after hitting a fixed milestone (prior best between milestones, else next standard). */
function getNextTargetAfterMilestoneHit(fixedDay, s) {
    s = s || state;
    var prior = getCompletedJourneysBestSuccess(s);
    var nextFixed = getNextStandardMilestoneDay(fixedDay);
    if (prior > fixedDay && prior < nextFixed) return prior;
    return nextFixed;
}

/** Subtle Best Journey card — journey 2+: chase vs prior completed peak. */
function getBestJourneyHintText(s) {
    s = s || state;
    if (Math.max(1, Math.floor(Number(s.attempt) || 1)) <= 1) return null;

    var journeys = s.completedJourneys || [];
    var curS = journeyScoreSuccess(s);
    var curF = (s.score && s.score.failures) || 0;
    var finished = (typeof journeyIsOver === 'function' && journeyIsOver(s))
        || curF >= MAX_FAILURES;

    // Between Journeys (after 10th slip archived): "New Best!" only if this finish beat prior.
    if (isAwaitingNextJourney(s)) {
        if (!journeys.length) return null;
        var finishedScore = journeys[journeys.length - 1].score || s.score || {};
        var prevBest = bestScoreFromCompletedJourneys(journeys.slice(0, -1));
        if (!prevBest || isBetterJourneyScore(
            finishedScore.success || 0,
            finishedScore.failures || 0,
            prevBest,
        )) {
            return 'New Best!';
        }
        return null;
    }

    if (!shouldCountCurrentJourneyForMilestones(s) && !finished) return null;

    var prior = bestScoreFromCompletedJourneys(journeys);

    // No prior completed best — offer next standard Journey day target.
    if (!prior) {
        if (finished) return 'New Best!';
        var next = getNextStandardMilestoneDay(curS);
        return next ? 'Beat ' + next + ' to win' : null;
    }

    // Current leads on strong days or same strong with fewer slips.
    if (isBetterJourneyScore(curS, curF, prior)) {
        // 10th slip / journey over: drop "Keep Going"
        return finished ? 'New Best!' : 'New Best! Keep Going!';
    }

    if (finished) return null;

    if (curS < (prior.success || 0)) {
        return 'Beat ' + prior.success + ' to win';
    }

    return null;
}

function resolveJourneyMilestoneHit(successCount) {
    return JOURNEY_MILESTONES[successCount] ? successCount : null;
}

/** True when this strong day matches the prior best between standard milestones (e.g. 254). */
function isPersonalBestJourneyCrossing(successCount, s) {
    s = s || state;
    var personal = getPersonalBestMilestoneDay(s);
    return personal != null && successCount === personal;
}

/** Popup when user reaches their all-time best journey day count this run. */
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

/** Celebration copy — at e.g. 200, next target may be beat 254 instead of 300. */
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

/** Standard milestone rows for a Journey tab section. */
function expandSectionMilestones(sectionDays) {
    var out = [];
    for (var i = 0; i < sectionDays.length; i++) {
        var day = sectionDays[i];
        var meta = JOURNEY_MILESTONES[day];
        out.push({
            day: day,
            emoji: meta.emoji,
            label: day + ' Days',
            unlockAt: getMilestoneUnlockDay(day),
        });
    }
    return out;
}

/**
 * Strong days completed in this recovery run (resets on slip).
 * Freeze day uses frozen ended length for grey phase display.
 */
function getBrainCompletedStrongDays() {
    if (typeof isStreakFreezeDay === 'function' && isStreakFreezeDay()) {
        return getDisplayStreak();
    }
    if (typeof isJourneyEndedDisplay === 'function' && isJourneyEndedDisplay()) {
        return getDisplayStreak();
    }
    return Math.max(0, state.currentStreak || 0);
}

/** True when completed strong days exactly close a phase (3, 14, 30, …). */
function isBrainPhaseBoundaryComplete(completed) {
    if (typeof BRAIN_PHASES === 'undefined' || !completed) return false;
    for (var i = 0; i < BRAIN_PHASES.length; i++) {
        var p = BRAIN_PHASES[i];
        if (p.to !== Infinity && completed === p.to) return true;
    }
    return false;
}

/**
 * Progress “you are here” day on the recovery continuum:
 *  - After slip (0 strong): day 1 of Withdrawal (3 days left), next calendar day only
 *    (slip day stays freeze/grey via UI — not this function’s job)
 *  - After completing a phase end day (e.g. day 3 logged): next wall day = first day of next phase
 *  - Otherwise: equals completed strong days after each log
 */
function getBrainProgressStreak() {
    var completed = getBrainCompletedStrongDays();
    if (typeof isStreakFreezeDay === 'function' && isStreakFreezeDay()) return completed;
    if (typeof isJourneyEndedDisplay === 'function' && isJourneyEndedDisplay()) return completed;

    // Fresh run / after slip: place on Withdrawal day 1 until first strong is logged.
    if (completed === 0) return 1;

    // Phase end fully logged; new calendar day not logged yet → enter next phase day.
    if (state.todayStatus === 'none' && isBrainPhaseBoundaryComplete(completed)) {
        return completed + 1;
    }
    return completed;
}

/**
 * Days left in a phase from completed-strong rule:
 *  slip next day (0 done / working day 1): 3 left
 *  after day-1 log: 2 left … day-3 log: 0 → Phase completed
 *  next day in Flatline before day-4 log: 11 left; after day-4 log: 10 left
 */
function getBrainDaysLeftInPhase(phase, completed) {
    if (!phase || phase.to === Infinity) return null;
    var phaseLen = phase.to - phase.from + 1;
    if (phaseLen <= 0) phaseLen = 1;

    // Not yet logged any day of this phase (e.g. Flatline morning after Withdrawal done)
    if (completed < phase.from) {
        return phaseLen;
    }
    // Last day of phase fully completed
    if (completed >= phase.to) {
        return 0;
    }
    // Inside phase: remaining after this many strong days in the continuum
    return phase.to - completed;
}

function isAwaitingNextJourney(s) {
    s = s || state;
    return !!s.pendingNextJourney;
}

/**
 * Journey finished (10 slips) — waiting for next journey day.
 * Journey / Progress tabs show frozen grey styling until next journey starts.
 */
function isJourneyEndedDisplay(s) {
    return isAwaitingNextJourney(s);
}

/** Live score counts only while the journey is still active (not archived / ended). */
function shouldCountCurrentJourneyForMilestones(s) {
    s = s || state;
    if (isAwaitingNextJourney(s)) return false;
    if (journeyIsOver(s)) return false;
    return true;
}

function journeyIsOver(s) {
    return s.score.failures >= MAX_FAILURES;
}

function canLogToday() {
    // Always available free (trial, paid, or basic after trial). Not gated by Entitlement.
    return !isAwaitingNextJourney() && !journeyIsOver(state);
}

/**
 * Yesterday (N-1) still needs a user answer — today (N) must wait.
 * Not used on Journey Day 1 (yesterday is before this journey's start).
 */
function isYesterdayLogPending() {
    if (typeof isAwaitingNextJourney === 'function' && isAwaitingNextJourney()) return false;
    if (typeof journeyIsOver === 'function' && journeyIsOver(state)) return false;
    var today = todayKey();
    var yesterday = getYesterdayKey(today);
    var anchor = typeof getJourneyAnchorWallDate === 'function'
        ? getJourneyAnchorWallDate()
        : '';
    if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return false;
    if (yesterday < anchor) return false;
    return !isWallDateLogged(yesterday);
}

/**
 * Consecutive strong days ending the day before wallDate (from dailyLog).
 */
function streakCountStrongEndingBefore(wallDate) {
    var streak = 0;
    var d = addDaysToKey(wallDate, -1);
    var anchor = getJourneyAnchorWallDate();
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

/**
 * Streak length archived by a slip on wallDate (first slip of that day only).
 */
function streakSegmentBeforeSlipOnDate(wallDate, firstSlipOfDay) {
    if (!firstSlipOfDay) return 0;
    return streakCountStrongEndingBefore(wallDate);
}

/**
 * Live streak from chronological logs — not logging order.
 * Slip today → 0 even if yesterday is logged strong afterward.
 */
function recomputeCurrentStreak(s) {
    s = s || state;
    var today = todayKey();
    var anchor = getJourneyAnchorWallDate(s);
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

/**
 * Streak length frozen for display after today's first slip.
 * Only the segment archived today — never reuses older journey segments
 * (that wrongly put grey on day 2 after a fresh 0-streak slip).
 */
function getEndedStreakLength() {
    if (state.lastFreezeDate !== todayKey()) return 0;
    const n = state.lastFreezeStreak;
    return typeof n === 'number' && n > 0 ? n : 0;
}

/**
 * Slip day freeze until calendar day rolls over.
 * - Ended 1+ strong: green through completed days, grey on the fail day (strong+1)
 * - Ended 0 (fresh week / start): grey on day 1 only
 * Live data: currentStreak is already 0.
 */
function isStreakFreezeDay() {
    return state.todayStatus === 'failed' && state.lastFreezeDate === todayKey();
}

/** Streak length used for weekly timeline and Streak-tab display only. */
function getDisplayStreak() {
    if (isStreakFreezeDay()) return getEndedStreakLength();
    return Math.max(0, state.currentStreak || 0);
}

/**
 * First day this streak strictly passes the best recorded at streak start.
 * (e.g. previous best 2 → celebrate on day 3, not day 4.)
 * May land on a named milestone day (3, 7, …); both can show (celebration queue).
 */
function isPersonalBestStreak(streak, recordToBeat) {
    return streak > recordToBeat
        && recordToBeat > 0
        && !state.recordCelebrated;
}

/** True on the calendar day the user slipped — show reflect copy, not Day 1 yet. */
function isWeeklySlipReflectDay() {
    return state.todayStatus === 'failed';
}

/** Which Day 1–7 insight to show — working day before log; completed day after log today. */
function getWeeklyInsightDay(progress) {
    if (isWeeklySlipReflectDay()) return null;
    if (!progress || progress <= 0) return 1;
    if (progress >= 7) return state.todayStatus === 'success' ? 7 : 1;
    if (state.todayStatus === 'success') return progress;
    return progress + 1;
}

/**
 * After a full 7-day week, show a fresh timeline from the next calendar day.
 * While Day 7 is still logged strong today, freeze the week on Day 7 —
 * do not jump to the next week until midnight / the next day starts.
 */
function shouldRefreshWeeklyTimeline(streak) {
    if (isStreakFreezeDay()) return false;
    if (!streak || streak <= 0 || streak % 7 !== 0) return false;
    // Completed week sealed today — hold Day 7 until the calendar day rolls over.
    if (state.todayStatus === 'success') return false;
    return true;
}

/** Day 1–7 within the current weekly streak cycle (0 when no streak). Resets after every 7 days. */
function getWeeklyStreakDay(streak) {
    if (!streak || streak <= 0) return 0;
    if (shouldRefreshWeeklyTimeline(streak)) return 0;
    return ((streak - 1) % 7) + 1;
}

/** Measured layout: pre-day span + day dot centers (% of track width). */
let weeklyTrackLayout = null;

function setWeeklyTrackLayout(layout) {
    weeklyTrackLayout = layout;
}

/** Total day-width units on the track — 1 unlabeled pre–Day 1 span + Days 1–7. */
const WEEKLY_TRACK_UNITS = 7;

/** Center of day N (0 = pre–Day 1 start, 1–7 = day dots) on the weekly track. */
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

/** Wall-clock ms for intra-day math (follows dev day offset when testing). */
function getWeeklyClockMs() {
    const offset = (state && state.devDateOffset) || 0;
    return Date.now() + offset * MS_PER_DAY;
}

/**
 * Intra-day progress along each 24h segment — tied to the calendar day (midnight).
 * Assumed success until the user logs a slip; strong days are confirmed when logged.
 */
function getIntraDaySegmentProgress() {
    const hours = (getWeeklyClockMs() - parseDateKey(todayKey()).getTime()) / 3600000;
    if (hours < 8) return 0;
    if (hours < 16) return 1 / 3;
    return 2 / 3;
}

/** Convert a track-width % into 0–100 along the green connector line. */
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

/**
 * Freeze-day layout after a slip:
 *  - 1+ strong then slip aiming at next day: green through strong days, grey on strong+1
 *  - 0 strong (timeline at start): grey on day 1 only
 *  - Green + 8h partial into the fail segment; traveler on slip-day (grey)
 */
function getWeeklyFreezeLayout(streak) {
    const strongWeekDay = getWeeklyStreakDay(streak);
    // Slip day is the next working week day, or day 1 when nothing was completed.
    const slipWeekDay = Math.min(7, Math.max(1, strongWeekDay + 1));
    const t = getIntraDaySegmentProgress();

    const strongPct = getWeeklyDotCenterPct(strongWeekDay);
    const slipPct = getWeeklyDotCenterPct(slipWeekDay);
    // Green keeps 8h progress into the (strong → slip) segment; grey completes to slip day.
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
    // Slip with no archived strong days — empty track, no traveler.
    if (isWeeklySlipReflectDay() && !isStreakFreezeDay()) return null;

    if (isStreakFreezeDay()) {
        const layout = getWeeklyFreezeLayout(streak);
        return layout ? layout.travelerTrackPct : null;
    }

    const progress = getWeeklyStreakDay(streak);

    if (progress >= 7) {
        return getWeeklyDotCenterPct(7);
    }

    // Logged today — rest on the completed day dot until the next calendar day.
    if (state.todayStatus === 'success') {
        return getWeeklyDotCenterPct(progress);
    }

    const t = getIntraDaySegmentProgress();
    const from = getWeeklyDotCenterPct(progress);
    const to = getWeeklyDotCenterPct(progress + 1);
    return from + (to - from) * t;
}

/** Green connector fill % along the stretched line to match traveler (or freeze green end). */
function getWeeklyGreenPct(streak) {
    if (isStreakFreezeDay()) {
        const layout = getWeeklyFreezeLayout(streak);
        return layout ? layout.greenLinePct : 0;
    }

    const travelerPct = getWeeklyTravelerPct(streak);
    if (travelerPct == null) return 0;
    return trackPctToLinePct(travelerPct);
}

/** Grey slip segment as % of line (freeze only). */
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

/** Start origin is passed once the day segment has begun (8h+ or any day completed). */
function isWeeklyStartReached(streak) {
    // Freeze (including 0-strong → grey Day 1): Start is already past — solid green.
    if (isStreakFreezeDay()) return true;
    if (isWeeklySlipReflectDay()) return false;
    const progress = getWeeklyStreakDay(streak);
    if (progress > 0) return true;
    if (state.todayStatus === 'success') return true;
    return getIntraDaySegmentProgress() > 0;
}

/** Active dot position (% from left) sliding toward the next day dot through the day. */
function getWeeklyActiveTraveler(streak) {
    const leftPct = getWeeklyTravelerPct(streak);
    return leftPct == null ? null : { leftPct };
}

function markTodayStatus(dateKey, status) {
    if (dateKey === todayKey()) {
        state.todayStatus = status;
    }
}

// ════════════════════════════════════════════════════════
//  DAY LOGGING
// ════════════════════════════════════════════════════════

/**
 * Log a strong day. Updates state only — UI layer handles celebrations.
 * One wall date can only contribute once to Journey strong-day count.
 * @returns {{ applied: boolean, streak, successCount, milestoneHit, isNewRecord, prevLongest, recordToBeat }}
 */
function applyStrongDay({ logDate, suppressUI = false } = {}) {
    if (!canLogToday()) {
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

    const dateKey = clampDateKeyToRealToday(logDate || todayKey());

    // Today cannot be logged until yesterday (N-1) is answered.
    if (dateKey === todayKey() && typeof isYesterdayLogPending === 'function' && isYesterdayLogPending()) {
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

    // One outcome per wall date — never overwrite slip with strong (UI + catch-up safe).
    if (getWallDateLogStatus(dateKey)) {
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

    // Journey day number follows wall timeline from Day 1, not a fragile counter.
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

    if (state.currentStreak === 50) state.day50Count++;
    if (state.currentStreak === 100) state.day100Count++;

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

/**
 * Infer current journey Day 1 from logs (legacy saves without journeyStartDate).
 * Prefer entry.day === 1 whose date is latest among "day 1" markers — not oldest.
 */
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

/**
 * Wall date of the current journey's Day 1.
 * Resets on every new journey so Day always starts at 1 again.
 */
function getJourneyAnchorWallDate() {
    if (state.journeyStartDate && /^\d{4}-\d{2}-\d{2}$/.test(state.journeyStartDate)) {
        return state.journeyStartDate;
    }
    var inferred = inferJourneyStartFromLog(state);
    state.journeyStartDate = inferred;
    return inferred;
}

/**
 * First-ever journey / install wall date — month grid greys days before this.
 * Does not reset when a new journey begins.
 */
function getAppStartWallDate() {
    if (state.appStartDate && /^\d{4}-\d{2}-\d{2}$/.test(state.appStartDate)) {
        return state.appStartDate;
    }
    var log = state.dailyLog || {};
    var earliest = '';
    for (var key in log) {
        if (!Object.prototype.hasOwnProperty.call(log, key)) continue;
        var entry = log[key];
        if (!entry || typeof entry !== 'object') continue;
        var date = entry.date || (/^\d{4}-\d{2}-\d{2}$/.test(key) ? key : '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (!earliest || date < earliest) earliest = date;
    }
    if (earliest) {
        state.appStartDate = earliest;
        return earliest;
    }
    var start = getJourneyAnchorWallDate();
    state.appStartDate = start;
    return start;
}

/**
 * Journey Day number for a wall date (Day 1 = this journey's start).
 * Keeps Day aligned with real calendar progression across gaps.
 */
function getCalendarDayForWallDate(dateKey) {
    dateKey = clampDateKeyToRealToday(dateKey || todayKey());
    var anchor = getJourneyAnchorWallDate();
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

/** Journey day N cannot exceed wall days from this journey's Day 1 through app today. */
function getMaxCalendarDayForToday() {
    return Math.max(1, daysBetweenKeys(getJourneyAnchorWallDate(), todayKey()) + 1);
}

/**
 * Day counter in the UI = wall days since this journey's Day 1 through app today.
 * Resets to 1 when a new journey begins.
 */
function getDisplayCalendarDay() {
    return getMaxCalendarDayForToday();
}

function clampCalendarDayToRealToday() {
    const max = getMaxCalendarDayForToday();
    // Catch up after multi-day gaps where calendarDay lagged behind wall time.
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

/**
 * Log a slip for a given calendar day. Each slip uses one journey chance; slipCount tracks multiples same day.
 * No-ops when the Journey is already over or awaiting the next one (same gate as applyStrongDay).
 * @returns {{ applied: boolean, failures: number }}
 */
function applySlipDay({ logDate, calDay }) {
    if (!canLogToday()) {
        return { applied: false, failures: state.score.failures };
    }

    const wallDate = clampDateKeyToRealToday(logDate);
    const dayNum = getCalendarDayForWallDate(wallDate);
    if (calDay == null || calDay < dayNum) calDay = dayNum;
    if ((state.calendarDay || 1) < dayNum) state.calendarDay = dayNum;

    // Today cannot be logged until yesterday (N-1) is answered.
    if (wallDate === todayKey() && typeof isYesterdayLogPending === 'function' && isYesterdayLogPending()) {
        return { applied: false, failures: state.score.failures };
    }

    // Never overwrite a strong day with slip — keeps log and score aligned.
    if (getWallDateLogStatus(wallDate) === 'strong') {
        return { applied: false, failures: state.score.failures };
    }

    const isToday = wallDate === todayKey();
    // Historical slips must not use todayStatus — that flag is for today only.
    const firstSlipOfDay = isFirstSlipOnWallDate(wallDate, calDay);
    const ended = streakSegmentBeforeSlipOnDate(wallDate, firstSlipOfDay);

    state.currentJourneyStreaks.push(ended);
    state.score.failures++;
    state.longestStreakAtStreakStart = state.longestStreak;
    state.recordCelebrated = false;

    // Freeze UI only from *today's* first slip — never for backdated logs.
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

    // todayFailCount / todayStatus are calendar-today only.
    if (isToday) {
        state.todayFailCount++;
        markTodayStatus(wallDate, 'failed');
    }
    recomputeCurrentStreak();
    updateBestJourney();
    return { applied: true, failures: state.score.failures };
}

/** Slip for today — single path used by manual fail button. */
function recordSlipToday() {
    return applySlipDay({ logDate: todayKey(), calDay: state.calendarDay });
}

// ════════════════════════════════════════════════════════
//  ABSENCE / CATCH-UP
// ════════════════════════════════════════════════════════

/**
 * Wall dates that must auto-log as strong (green missed days):
 * Journey Day 1 (install / start) through N-2 inclusive.
 * Never includes yesterday (N-1 — always asked) or today (N — always user-logged).
 */
function collectAutoStrongDates(_lastOpenedDate, today) {
    today = today || todayKey();
    const nMinus2 = getDayBeforeYesterdayKey(today);
    const anchor = getJourneyAnchorWallDate();
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

/**
 * Auto-strong every unlogged wall day from Journey Day 1 through N-2.
 * Score + dailyLog write actual "strong" (monthly grid / Journey stay aligned).
 * N-1 is always asked; N is always left for the user.
 * @returns {Array<{result: object, suppressUI: boolean}>}
 */
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

    // Journey Day counter tracks real wall days from Day 1.
    clampCalendarDayToRealToday();
    return results;
}

// ════════════════════════════════════════════════════════
//  JOURNEY END
// ════════════════════════════════════════════════════════

/**
 * Best-effort wall date for a stranded 10-slip finish (no journeyEndedDate yet).
 */
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

/**
 * Safety net: failures >= 10 but archive never ran (corrupt save / interrupted finish).
 * Restores pendingNextJourney (+ journeyEndedDate). Idempotent.
 * @returns {boolean} true if state was repaired
 */
function healStrandedJourneyEnd(s) {
    s = s || state;
    if (typeof journeyIsOver !== 'function' || !journeyIsOver(s)) return false;
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
        if (typeof updateBestJourney === 'function') updateBestJourney();
        return true;
    }

    // Full archive path (sets pending + ended date + permanent Best).
    return !!archiveCompletedJourney(inferJourneyEndWallDate(s));
}

/**
 * Archive the completed journey.
 * Next Journey starts on the first wall day *after* the day the Journey ended
 * (the day of the 10th slip) — not necessarily the day the user opened the app.
 *
 * @param {string} [endWallDate] YYYY-MM-DD of the 10th slip (defaults to today)
 * @returns comparison data for the UI popup, or null if already archived
 */
function archiveCompletedJourney(endWallDate) {
    if (isAwaitingNextJourney()) return null;

    const prevBestScore = bestScoreFromCompletedJourneys(state.completedJourneys);
    const comparison = {
        attempt: state.attempt,
        score: { ...state.score },
        prevBestScore,
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
    // End on the slip's wall day (e.g. yesterday for 10th slip via "did you slip yesterday?").
    state.journeyEndedDate = ended;

    // Permanent Best only from full 10-slip scores (also covers race if slip ran update already).
    updateBestJourney();

    return comparison;
}

/**
 * Start the next journey after the ended journey's wall day has passed.
 * Call when today > journeyEndedDate (same calendar day as end keeps the ended Journey active
 * only when the 10th slip was today).
 *
 * New Journey Day 1 is always the calendar day after journeyEndedDate (not "return day"),
 * so Mon end → Tue Day 1 even if the user first opens on Thu (no month-grid gaps).
 */
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
    // Day index from new Day 1 → today (catch-up / clamp may still advance).
    state.calendarDay = Math.max(1, daysBetweenKeys(dayOne, todayKey()) + 1);
    // install-wide appStartDate stays unchanged.
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

/** True when next Journey may start now (ended on a prior wall day). */
function canBeginNextJourneyToday() {
    if (!isAwaitingNextJourney()) return false;
    var ended = state.journeyEndedDate;
    if (!ended || !/^\d{4}-\d{2}-\d{2}$/.test(ended)) return false;
    return todayKey() !== ended && todayKey() > ended;
}