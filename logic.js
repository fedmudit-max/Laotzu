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
        /** Local daily check-in reminder (device notifications; no server). */
        reminderEnabled: false,
        reminderHour: 20,
        reminderMinute: 0,
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
    merged.reminderEnabled = !!saved.reminderEnabled;
    merged.reminderHour = clampInt(saved.reminderHour, 0, 23, defaults.reminderHour);
    merged.reminderMinute = clampInt(saved.reminderMinute, 0, 59, defaults.reminderMinute);
    syncJourneyMilestoneCountsFromHistory(merged);
    return runStateMigrations(merged, saved);
}

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
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
 * Ensure a valid trialStartedAt exists so trial lasts PREMIUM_TRIAL_DAYS.
 * Does not restart an expired trial (keeps a valid past stamp).
 * Ownership: Storage / Journey bootstrap (not Entitlement — Entitlement is read-only).
 * @param {object} [s] state
 * @param {{ force?: boolean }} [opts] force=true skips onboarding check (post-onboarding complete)
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

    s.trialStartedAt = new Date().toISOString();
    return true;
}

/** Stamp / renew trial when onboarding finishes (always leave an active 30-day window). */
function startPremiumTrial() {
    // Active trial: keep existing start date (do not reset the clock).
    if (state.trialStartedAt) {
        var start = new Date(state.trialStartedAt);
        if (!Number.isNaN(start.getTime())) {
            var ends = start.getTime() + PREMIUM_TRIAL_DAYS * MS_PER_DAY;
            if (ends > Date.now()) return;
        }
    }
    // Missing or expired stamp — begin a fresh PREMIUM_TRIAL_DAYS window from now.
    state.trialStartedAt = new Date().toISOString();
}

// ════════════════════════════════════════════════════════
//  SCORING & JOURNEY RULES
// ════════════════════════════════════════════════════════

function formatJourneyScore(score) {
    return `${score.success}/${score.failures}`;
}

function isBetterJourneyScore(success, failures, best) {
    if (success > best.success) return true;
    if (success < best.success) return false;
    // Same strong-day count — at 9–10 failures the full score (including failures) counts.
    if (failures >= MAX_FAILURES - 1) {
        return failures >= best.failures;
    }
    return failures < best.failures;
}

function pickBetterJourneyScore(candidate, best) {
    return isBetterJourneyScore(candidate.success, candidate.failures, best)
        ? { success: candidate.success, failures: candidate.failures }
        : { success: best.success, failures: best.failures };
}

function bestScoreFromCompletedJourneys(journeys) {
    if (!journeys.length) return null;
    return journeys.reduce(
        (best, journey) => pickBetterJourneyScore(journey.score, best),
        { success: 0, failures: 0 },
    );
}

/** Best score shown in the header — includes live 9/10-failure progress. */
function getDisplayBestJourney() {
    const { success, failures } = state.score;
    if (failures >= MAX_FAILURES - 1) {
        return pickBetterJourneyScore({ success, failures }, state.bestJourney);
    }
    return state.bestJourney;
}

function updateBestJourney() {
    const { success, failures } = state.score;
    if (isBetterJourneyScore(success, failures, state.bestJourney)) {
        state.bestJourney = { success, failures };
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
    const calDay = state.calendarDay;

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

function getJourneyAnchorWallDate() {
    const log = state.dailyLog || {};
    let dayOneDate = '';
    let earliest = '';
    for (const entry of Object.values(log)) {
        if (!entry || typeof entry !== 'object') continue;
        const date = entry.date || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (entry.day === 1) dayOneDate = date;
        if (!earliest || date < earliest) earliest = date;
    }
    if (dayOneDate) return dayOneDate;
    if (earliest && state.calendarDay > 1) return earliest;
    return state.lastOpenedDate || todayKey();
}

/** Journey day N cannot exceed wall days from journey anchor through real today. */
function getMaxCalendarDayForToday() {
    return Math.max(1, daysBetweenKeys(getJourneyAnchorWallDate(), realTodayKey()) + 1);
}

/** Day counter shown in UI — never ahead of real today. */
function getDisplayCalendarDay() {
    return Math.min(state.calendarDay || 1, getMaxCalendarDayForToday());
}

function clampCalendarDayToRealToday() {
    const max = getMaxCalendarDayForToday();
    if ((state.calendarDay || 1) > max) {
        state.calendarDay = max;
        if (!isWallDateLogged(realTodayKey())) {
            state.todayStatus = 'none';
            state.todayFailCount = 0;
        }
    }
}

/** Step calendar day forward only when wall-clock allows it (never past real today). */
function advanceCalendarDay() {
    clampCalendarDayToRealToday();
    if (state.calendarDay >= getMaxCalendarDayForToday()) {
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
 * Wall dates from lastOpened through N-2 (inclusive), chronological, unlogged only.
 * N-1 (yesterday) and N (today) are never included.
 */
function collectAutoStrongDates(lastOpenedDate, today) {
    today = today || todayKey();
    const nMinus2 = getDayBeforeYesterdayKey(today);
    const dates = [];

    if (!lastOpenedDate || lastOpenedDate >= today) return dates;
    if (daysBetweenKeys(lastOpenedDate, today) <= 1) return dates;

    if (lastOpenedDate <= nMinus2 && !isWallDateLogged(lastOpenedDate)) {
        dates.push(lastOpenedDate);
    }

    buildGapDayQueue(lastOpenedDate, today).forEach(function (dateKey) {
        if (dateKey <= nMinus2 && !isWallDateLogged(dateKey) && dates.indexOf(dateKey) === -1) {
            dates.push(dateKey);
        }
    });

    return dates;
}

/**
 * Auto-strong for day N-2 and all earlier unlogged gap days.
 * N-1 is always asked; N is always left for the user to log.
 * @returns {Array<{result: object, suppressUI: boolean}>}
 */
function autoStrongAbsentDays(today) {
    today = today || todayKey();
    const results = [];

    if (!state.lastOpenedDate || state.lastOpenedDate === today) {
        return results;
    }

    if (daysBetweenKeys(state.lastOpenedDate, today) <= 1) {
        return results;
    }

    const dates = collectAutoStrongDates(state.lastOpenedDate, today);
    const lastOpened = state.lastOpenedDate;

    for (let i = 0; i < dates.length; i++) {
        const dateKey = dates[i];
        const isLast = i === dates.length - 1;
        if (i > 0 || dateKey !== lastOpened) {
            if (!advanceCalendarDay()) break;
        }
        results.push({
            result: applyStrongDay({ logDate: dateKey, suppressUI: !isLast }),
            suppressUI: !isLast,
        });
    }

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

    state.attempt++;
    state.score = { success: 0, failures: 0 };
    state.longestStreakAtStreakStart = state.longestStreak;
    state.currentStreak = 0;
    state.calendarDay = 1;
    state.currentJourneyStreaks = [];
    state.recordCelebrated = false;
    state.todayStatus = 'none';
    state.todayFailCount = 0;
    state.pendingNextJourney = false;
    state.journeyEndedDate = '';
    state.lastFreezeStreak = 0;
    state.lastFreezeDate = '';
}