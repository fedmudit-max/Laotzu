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
        'logic.js',
        'entitlement.js',
        'backup.js',
        'billing.js',
    ];
    for (const file of files) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        vm.runInContext(code, sandbox, { filename: file });
    }
    return sandbox;
}

/** `let state` in logic.js is not a sandbox property — read through the VM. */
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
};
