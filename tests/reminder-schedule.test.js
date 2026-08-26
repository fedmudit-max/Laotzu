/**
 * Pure-date rules mirrored from ReminderScheduler.nextTriggerMillis().
 * Keeps reminder scheduling regressions in npm test without Robolectric.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function dateKeyFromDate(d) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKeyFromDate(d);
}

/** Test helper — same rules as ReminderScheduler.nextTriggerMillis. */
function nextTriggerAt(now, hour, minute, options) {
    options = options || {};
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (options.wasNotifiedToday) {
        base.setDate(base.getDate() + 1);
        return base.getTime();
    }
    if (base.getTime() <= now.getTime()) {
        base.setDate(base.getDate() + 1);
    }
    return base.getTime();
}

test('future time today schedules today', () => {
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const when = nextTriggerAt(now, 21, 0);
    const expected = new Date(2026, 5, 15, 21, 0, 0).getTime();
    assert.equal(when, expected);
});

test('past time today schedules tomorrow', () => {
    const now = new Date(2026, 5, 15, 22, 0, 0);
    const when = nextTriggerAt(now, 20, 0);
    const expected = new Date(2026, 5, 16, 20, 0, 0).getTime();
    assert.equal(when, expected);
});

test('already notified today schedules tomorrow at selected time', () => {
    const now = new Date(2026, 5, 15, 21, 30, 0);
    const when = nextTriggerAt(now, 21, 0, { wasNotifiedToday: true });
    const expected = new Date(2026, 5, 16, 21, 0, 0).getTime();
    assert.equal(when, expected);
});

test('logged-today semantics: past wall time still means tomorrow', () => {
    const today = '2026-06-15';
    const now = parseKey(today);
    now.setHours(23, 0, 0, 0);
    const when = nextTriggerAt(now, 8, 0);
    const expected = parseKey(addDays(today, 1));
    expected.setHours(8, 0, 0, 0);
    assert.equal(when, expected.getTime());
});
