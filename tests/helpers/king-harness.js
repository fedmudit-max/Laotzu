/**
 * Load King business-logic scripts in an isolated VM for node --test.
 * No DOM; in-memory localStorage; injectable todayKey().
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function createMockStorage() {
    const data = new Map();
    return {
        getItem(k) {
            return data.has(k) ? data.get(k) : null;
        },
        setItem(k, v) {
            data.set(k, String(v));
        },
        removeItem(k) {
            data.delete(k);
        },
        clear() {
            data.clear();
        },
    };
}

function createKingContext() {
    const storage = createMockStorage();
    const sandbox = {
        console,
        Date,
        Math,
        Number,
        Object,
        Array,
        String,
        Boolean,
        parseInt,
        parseFloat,
        isFinite,
        JSON,
        localStorage: storage,
        sessionStorage: storage,
        navigator: { userAgent: 'node' },
        Set,
        Map,
        Error,
        RegExp,
        Infinity,
    };
    vm.createContext(sandbox);

    const files = [
        'constants.js',
        'data.js',
        'migration.js',
        'logic-storage-state.js',
        'logic-dates-log.js',
        'logic-journey.js',
        'logic-streak.js',
        'logic-logging.js',
        'entitlement.js',
        'backup.js',
        'billing-offers.js',
        'billing-store-play.js',
        'billing-ui.js',
    ];
    for (const file of files) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        vm.runInContext(code, sandbox, { filename: file });
    }
    return sandbox;
}

/** `let state` in logic-storage-state.js is not a sandbox property — read through the VM. */
function getState(ctx) {
    return vm.runInContext('state', ctx);
}

function setState(ctx, partial) {
    const keys = Object.keys(partial);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        vm.runInContext('state.' + key + ' = ' + JSON.stringify(partial[key]), ctx);
    }
}

function resetKing(ctx, options) {
    options = options || {};
    const today = options.today || '2026-06-15';
    ctx.localStorage.clear();
    ctx.sessionStorage.clear();
    ctx.todayKey = function todayKey() {
        return today;
    };
    ctx.replaceState(ctx.getDefaultState());
    ctx.safeSet('onboardingComplete', 'true');
}

function seedJourney(ctx, options) {
    const today = options.today;
    const start = options.start || today;
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        journeyStartDate: start,
        appStartDate: start,
        lastOpenedDate: start,
        lastCheckedDate: start,
        calendarDay: ctx.daysBetweenKeys(start, today) + 1,
        attempt: options.attempt || 1,
    }));
}

/** Mirrors ui-main init() after scripts load — load, merge, heal, recompute. */
function simulateColdStartInit(ctx) {
    vm.runInContext(`
(function () {
    var saved = loadFromStorage();
    if (!saved) {
        replaceState(getDefaultState());
    } else {
        var beforeCounts = JSON.stringify(saved.journeyMilestones || {});
        replaceState(mergeSavedState(saved));
        if (beforeCounts !== JSON.stringify(state.journeyMilestones || {})) {
            saveToStorage(state);
        }
    }
    if (ensureTrialStarted(state)) saveToStorage(state);
    if (healStrandedJourneyEnd()) saveToStorage(state);
    var beforeStreak = state.currentStreak;
    recomputeCurrentStreak();
    if (beforeStreak !== state.currentStreak) saveToStorage(state);
})();
`, ctx);
}

/** merge → heal → recompute (no save). */
function runRestorePipeline(ctx, saved) {
    ctx.replaceState(ctx.mergeSavedState(saved));
    ctx.healStrandedJourneyEnd();
    ctx.recomputeCurrentStreak();
}

/**
 * Mirrors restoreImportBackup logic (no DOM/render):
 * merge → replace → heal → recompute → save (+ onboarding flag).
 */
function simulateRestoreImportBackup(ctx, backup) {
    if (!backup || !backup.state) return false;
    ctx.replaceState(ctx.mergeSavedState(backup.state));
    ctx.healStrandedJourneyEnd();
    ctx.recomputeCurrentStreak();
    if (backup.onboardingComplete === true) {
        ctx.safeSet('onboardingComplete', 'true');
    } else if (backup.onboardingComplete === false) {
        ctx.safeRemove('onboardingComplete');
    }
    ctx.saveToStorage(getState(ctx));
    return true;
}

/** Mirrors recordSuccess write path (no UI). */
function simulateLogStrongToday(ctx) {
    vm.runInContext(`
state.lastOpenedDate = todayKey();
`, ctx);
    const result = ctx.applyStrongDay({ logDate: vm.runInContext('todayKey()', ctx), suppressUI: false });
    if (result && result.applied) {
        ctx.saveToStorage(getState(ctx));
    }
    return result;
}

/** Mirrors recordFailure / recordSlipToday write path (no UI). */
function simulateLogSlipToday(ctx) {
    return ctx.recordSlipToday();
}

function putSavedStateInStorage(ctx, saved) {
    ctx.localStorage.setItem('habitTracker_v3', JSON.stringify(saved));
}

function isoDaysFromNow(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = {
    createKingContext,
    resetKing,
    seedJourney,
    isoDaysFromNow,
    getState,
    setState,
    simulateColdStartInit,
    runRestorePipeline,
    simulateRestoreImportBackup,
    simulateLogStrongToday,
    simulateLogSlipToday,
    putSavedStateInStorage,
};
