/**
 * logic-storage-state.js — Persistence, schema defaults, merge/replace.
 * No journey/streak algorithms.
 *
 * Load/save corrupt or missing fields → mergeSavedState, getDefaultState.
 * Manager rules: persistence only — no journey/streak algorithms (ARCHITECTURE.md).
 * Human debug: corrupt save → mergeSavedState; persist via saveToStorage / saveAndRender.
 * STATE FIELD CHEAT SHEET (pick the right date — they are not interchangeable)
 *
 * App "today"         todayKey()              Real local calendar date
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
        if (typeof syncJourneyMilestoneCountsFromHistory === 'function') {
            syncJourneyMilestoneCountsFromHistory(stateObj);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateObj));
        if (typeof syncReminderLoggedDate === 'function') {
            try { syncReminderLoggedDate(); } catch (e) { /* reminder layer optional */ }
        }
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
//  STATE — defaults, merge, global state object
// ════════════════════════════════════════════════════════

/** Default milestone counter map — used only for schema defaults here. */
function defaultJourneyMilestoneCounts() {
    var counts = {};
    for (var i = 0; i < JOURNEY_MILESTONE_DAYS.length; i++) {
        counts[JOURNEY_MILESTONE_DAYS[i]] = 0;
    }
    return counts;
}

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
        journeyMilestones: defaultJourneyMilestoneCounts(),
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
        trialStartedAt: '',
        premiumUntil: '',
        lastVerifiedAt: '',
        source: '',
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
    merged.journeyMilestones = typeof normalizeJourneyMilestoneCounts === 'function'
        ? normalizeJourneyMilestoneCounts(saved.journeyMilestones, defaults.journeyMilestones)
        : defaults.journeyMilestones;
    merged.completedJourneys = saved.completedJourneys || saved.attemptHistory || defaults.completedJourneys;
    merged.pastJourneyStreaks = saved.pastJourneyStreaks || saved.streakHistory || defaults.pastJourneyStreaks;
    merged.currentJourneyStreaks = saved.currentJourneyStreaks || saved.currentAttemptStreaks || defaults.currentJourneyStreaks;
    merged.urgeLog = saved.urgeLog || defaults.urgeLog;
    if (typeof syncJourneyMilestoneCountsFromHistory === 'function') {
        syncJourneyMilestoneCountsFromHistory(merged);
    }
    var migrated = runStateMigrations(merged, saved);
    if (typeof bestScoreFromCompletedJourneys === 'function') {
        var fromCompleted = bestScoreFromCompletedJourneys(migrated.completedJourneys || []);
        if (fromCompleted) {
            migrated.bestJourney = pickBetterJourneyScore(
                fromCompleted,
                migrated.bestJourney,
            );
        }
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

// ════════════════════════════════════════════════════════
//  TRIAL SEED (storage-owned writes; Entitlement reads)
// ════════════════════════════════════════════════════════

/**
 * Ensure a valid trialStartedAt exists so trial lasts PREMIUM_TRIAL_DAYS from
 * journey calendar Day 1 (set on onboarding / when onboarded user loads).
 * @returns {boolean} true if trialStartedAt was written/repaired
 */
function ensureTrialStarted(s, opts) {
    s = s || state;
    opts = opts || {};
    if (!opts.force && safeGet('onboardingComplete') !== 'true') return false;

    if (s.trialStartedAt) {
        var start = new Date(s.trialStartedAt);
        if (!Number.isNaN(start.getTime())) return false;
    }

    s.trialStartedAt = trialStartIsoForCalendarDayOne(s);
    return true;
}

function trialStartIsoForCalendarDayOne(s) {
    s = s || state;
    var key = '';
    if (s.appStartDate && /^\d{4}-\d{2}-\d{2}$/.test(s.appStartDate)) {
        key = s.appStartDate;
    }
    if (!key) {
        var log = s.dailyLog || {};
        var keys = Object.keys(log);
        for (var i = 0; i < keys.length; i++) {
            var entry = log[keys[i]];
            if (entry && entry.day === 1 && entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
                key = entry.date;
                break;
            }
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

/** Stamp trial when onboarding ends — once. Never restarts an expired trial. */
function startPremiumTrial() {
    if (state.trialStartedAt) {
        var start = new Date(state.trialStartedAt);
        if (!Number.isNaN(start.getTime())) return;
    }
    state.trialStartedAt = trialStartIsoForCalendarDayOne(state);
}
