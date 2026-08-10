/**
 * logic.js — State, storage, dates, and business rules.
 * No DOM — UI lives in ui-main.js, ui-actions.js, ui-overlays.js, ui-history.js, ui-day.js, boot.js.
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

/** Never store wall dates after real today (dev offset must not advance monthly grid). */
function clampDateKeyToRealToday(dateKey) {
    var real = realTodayKey();
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return real;
    if (dateKey > real) return real;
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

/** Day N — today (always user-logged; never auto). */
function getTodayWallKey() {
    return todayKey();
}

/** Day N-1 — yesterday (always asked; never auto-logged). */
function getYesterdayKey(today) {
    return addDaysToKey(today || todayKey(), -1);
}

/** Day N-2 — last day that may be auto-logged as strong. */
function getDayBeforeYesterdayKey(today) {
    return addDaysToKey(today || todayKey(), -2);
}

function getAutoStrongCutoffKey(today) {
    return getDayBeforeYesterdayKey(today);
}

function nextSlipCount(logDate, calDay) {
    const key = logDate || dailyLogKey(calDay);
    var prev = state.dailyLog && state.dailyLog[key];
    if (prev && logStatus(prev) === 'slip') {
        return (prev.slipCount || 1) + 1;
    }
    return 1;
}

/** Re-key legacy day-N entries to YYYY-MM-DD when a date is stored on the entry. */

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

/** Infer personal-best baseline for saves that predate longestStreakAtStreakStart. */

/** Backfill slipCount on today's log entry from todayFailCount (legacy saves). */

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
    return runStateMigrations(merged, saved);
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

function formatJourneyScore(score) {
    return `${score.success}/${score.failures}`;
}

/**
 * Journey score ranking (success/failures = strongDays/slips used).
 *
 * 1. Higher strong days always wins.
 *    e.g. 35/10 beats 34/9 — reaching farther is what the Journey is for (all 10 powers used to go further).
 * 2. Same strong days → fewer slips is better (more efficiency / powers remaining).
 *    e.g. 30/9 beats 30/10, and 0/0 beats 0/5 or 0/10.
 *
 * 0/0 is a real score (clean Journey peak), not a placeholder: it is better than any
 * 0/N with N > 0 because the same strong-day total was reached with fewer slips.
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
    if (!journeys.length) return null;
    // Start from the first real archived score (do not invent an unbeatable empty 0/0 seed).
    var first = journeys[0].score || { success: 0, failures: 0 };
    var best = { success: first.success || 0, failures: first.failures || 0 };
    for (var i = 1; i < journeys.length; i++) {
        best = pickBetterJourneyScore(journeys[i].score || { success: 0, failures: 0 }, best);
    }
    return best;
}

/** Best score shown in the header — live current can outrank stored best when truly better. */
function getDisplayBestJourney() {
    return pickBetterJourneyScore(state.score, state.bestJourney);
}

function updateBestJourney() {
    const { success, failures } = state.score;
    // Only promote when strictly better — 0/5 must not overwrite best 0/0.
    if (isBetterJourneyScore(success, failures, state.bestJourney)) {
        state.bestJourney = { success: success || 0, failures: failures || 0 };
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

function journeyMilestoneCount(day, s) {
    s = s || state;
    ensureJourneyMilestoneCounts(s);
    return Math.max(0, Math.floor(Number(s.journeyMilestones[day]) || 0));
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

function getJourneyMilestoneDisplaySuccess() {
    return journeyScoreSuccess();
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

function getPrevStandardMilestoneDay(beforeDay) {
    var prev = null;
    for (var i = 0; i < JOURNEY_MILESTONE_DAYS.length; i++) {
        var d = JOURNEY_MILESTONE_DAYS[i];
        if (d >= beforeDay) break;
        prev = d;
    }
    return prev;
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

/** Subtle Best Journey card — journey 2+: beat prior best, then celebrate crossing it. */
function getBestJourneyHintText(s) {
    s = s || state;
    if (Math.max(1, Math.floor(Number(s.attempt) || 1)) <= 1) return null;

    var prior = getCompletedJourneysBestSuccess(s);
    var current = shouldCountCurrentJourneyForMilestones(s) ? journeyScoreSuccess(s) : 0;

    if (prior > 0) {
        return current < prior ? 'Beat ' + prior + ' to win' : 'New Best! Keep Going!';
    }

    var next = getNextStandardMilestoneDay(current);
    return next ? 'Beat ' + next + ' to win' : null;
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

/** Brain recovery Progress tab — frozen streak on multi-day slip day, else live streak. */
function getBrainProgressStreak() {
    return getDisplayStreak();
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

function streakSegmentBeforeSlip() {
    // First slip of the calendar day archives the streak built so far.
    return state.todayStatus === 'none' ? state.currentStreak : 0;
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

function isPersonalBestStreak(streak, recordToBeat) {
    return streak > recordToBeat
        && recordToBeat > 0
        && !state.recordCelebrated
        && !STREAK_MILESTONES[streak];
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

/** Latest wall-date (YYYY-MM-DD) with a strong-day log entry. */
function getLastStrongLogDate() {
    const log = state.dailyLog || {};
    let latest = '';
    for (const entry of Object.values(log)) {
        if (logStatus(entry) !== 'strong') continue;
        const date = typeof entry === 'object' && entry.date ? entry.date : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > latest) latest = date;
    }
    return latest;
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

/** Which 7-day week of the current streak (1-based). */
function getWeeklyStreakWeek(streak) {
    if (!streak || streak <= 0) return 0;
    return Math.floor((streak - 1) / 7) + 1;
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
 * @returns {{ streak, successCount, milestoneHit, isNewRecord, prevLongest, recordToBeat }}
 */
function applyStrongDay({ logDate, suppressUI = false } = {}) {
    if (!canLogToday()) {
        return {
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

    // Already strong that wall day — never double-count Journey score.
    if (isWallDateLogged(dateKey)) {
        var existing = null;
        var log = state.dailyLog || {};
        if (log[dateKey]) existing = log[dateKey];
        else {
            for (var k in log) {
                if (log[k] && log[k].date === dateKey) { existing = log[k]; break; }
            }
        }
        if (existing && logStatus(existing) === 'strong') {
            return {
                streak: state.currentStreak,
                successCount: state.score.success,
                milestoneHit: null,
                personalBestCrossing: false,
                isNewRecord: false,
                prevLongest: state.longestStreak,
                recordToBeat: state.longestStreakAtStreakStart,
            };
        }
    }

    // Journey day number follows wall timeline from Day 1, not a fragile counter.
    const calDay = getCalendarDayForWallDate(dateKey);
    if ((state.calendarDay || 1) < calDay) state.calendarDay = calDay;

    state.score.success++;
    state.currentStreak++;

    writeDailyLog(calDay, { status: 'strong', day: calDay, date: dateKey });

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
    // Status follows simulated "today" so Next Day can re-open the log buttons;
    // wall log stays ≤ real today for the monthly grid.
    markTodayStatus(logDate || todayKey(), 'success');

    return {
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

/** Journey day N cannot exceed wall days from this journey's Day 1 through real today. */
function getMaxCalendarDayForToday() {
    return Math.max(1, daysBetweenKeys(getJourneyAnchorWallDate(), realTodayKey()) + 1);
}

/**
 * Day counter in the UI = wall days since this journey's Day 1 through real today.
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
        if (!isWallDateLogged(realTodayKey())) {
            state.todayStatus = 'none';
            state.todayFailCount = 0;
        }
    }
}

/** Step calendar day forward only when wall-clock allows it (never past real today). */
function advanceCalendarDay() {
    // Do not pre-clamp up to max — mid catch-up needs to step 2 → 3 → 4.
    const max = getMaxCalendarDayForToday();
    if ((state.calendarDay || 1) > max) {
        state.calendarDay = max;
        return false;
    }
    if ((state.calendarDay || 1) >= max) {
        return false;
    }
    state.calendarDay++;
    state.todayStatus = 'none';
    state.todayFailCount = 0;
    return true;
}

/** Log a slip for a given calendar day. Each slip uses one journey chance; slipCount tracks multiples same day. */
function applySlipDay({ logDate, calDay }) {
    const firstSlipOfDay = state.todayStatus === 'none';
    const ended = streakSegmentBeforeSlip();
    state.currentJourneyStreaks.push(ended);
    state.score.failures++;
    state.longestStreakAtStreakStart = state.longestStreak;
    state.currentStreak = 0;
    state.recordCelebrated = false;

    const wallDate = clampDateKeyToRealToday(logDate);
    const dayNum = getCalendarDayForWallDate(wallDate);
    if (calDay == null || calDay < dayNum) calDay = dayNum;
    if ((state.calendarDay || 1) < dayNum) state.calendarDay = dayNum;

    // Freeze UI only from this days first slip (0 or more strong) — never reuse older segments.
    if (firstSlipOfDay) {
        state.lastFreezeStreak = ended;
        state.lastFreezeDate = todayKey();
    }

    writeDailyLog(calDay, {
        status: 'slip',
        day: calDay,
        date: wallDate,
        slipCount: nextSlipCount(wallDate, calDay),
    });

    state.todayFailCount++;
    updateBestJourney();
    markTodayStatus(logDate, 'failed');
}

/** Slip for today — single path used by manual fail button. */
function recordSlipToday() {
    applySlipDay({ logDate: todayKey(), calDay: state.calendarDay });
    return state.score.failures;
}

// ════════════════════════════════════════════════════════
//  ABSENCE / CATCH-UP
// ════════════════════════════════════════════════════════

function buildGapDayQueue(lastOpenedDate, today) {
    const diffDays = daysBetweenKeys(lastOpenedDate, today);
    const queue = [];
    for (let i = 1; i <= diffDays; i++) {
        queue.push(addDaysToKey(lastOpenedDate, i));
    }
    return queue;
}

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
 * Archive the completed journey and wait until the next calendar day to begin the next one.
 * @returns comparison data for the UI popup, or null if already archived
 */
function archiveCompletedJourney() {
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

    state.pendingNextJourney = true;
    state.journeyEndedDate = todayKey();

    return comparison;
}

/** Start the next journey after the ended journey's calendar day has passed. */
function beginNextJourney() {
    if (!isAwaitingNextJourney()) return;

    var dayOne = todayKey();

    state.attempt++;
    state.score = { success: 0, failures: 0 };
    state.longestStreakAtStreakStart = state.longestStreak;
    state.currentStreak = 0;
    state.calendarDay = 1;
    // New journey Day 1 = this wall day (install-wide appStartDate stays unchanged).
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