const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    getState,
} = require('./helpers/king-harness');

function loadBestPerformances(ctx) {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'logic-best-performances.js'),
        'utf8',
    );
    vm.runInContext(code, ctx, { filename: 'logic-best-performances.js' });
}

function withBestPerf(ctx) {
    loadBestPerformances(ctx);
    return ctx;
}

function assertSlotValues(slots, expected) {
    assert.equal(slots.length, expected.length);
    for (var i = 0; i < expected.length; i++) {
        if (expected[i] === null) {
            assert.equal(slots[i].empty, true);
        } else {
            assert.equal(slots[i].empty, false);
            assert.equal(Number(slots[i].value), expected[i]);
        }
    }
}

test('zero streaks yields three empty ranks', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assert.equal(board.slots.length, 3);
    assertSlotValues(board.slots, [null, null, null]);
    assert.equal(board.slots[0].ariaLabel, 'Rank 1, no streak yet');
});

test('first-ever active streak is rank 1 with gold active slot', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        journeyStartDate: '2026-06-03',
        currentStreak: 8,
        score: { success: 8, failures: 0 },
    }));
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assertSlotValues(board.slots, [8, null, null]);
    assert.equal(board.slots[0].isActive, true);
    assert.equal(board.slots[0].rank, 1);
    assert.match(board.slots[0].ariaLabel, /currently active/);
    assert.equal(board.slots[1].empty, true);
});

test('two streaks rank descending with silver glow when live is rank 2', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        attempt: 1,
        journeyStartDate: '2026-06-01',
        currentJourneyStreaks: [12],
        currentStreak: 8,
        score: { success: 20, failures: 1 },
    }));
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assertSlotValues(board.slots, [12, 8, null]);
    assert.equal(board.slots[0].isActive, false);
    assert.equal(board.slots[1].isActive, true);
    assert.equal(board.slots[1].rank, 2);
});

test('three streaks fill podium and proportional bar widths', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        pastJourneyStreaks: [{
            attempt: 1,
            streaks: [21, 10],
        }],
        currentJourneyStreaks: [15],
        currentStreak: 0,
        attempt: 2,
        pendingNextJourney: false,
    }));
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assertSlotValues(board.slots, [21, 15, 10]);
    assert.equal(board.slots[0].barPercent, 100);
    assert.equal(board.slots[1].barPercent, Math.round((15 / 21) * 100));
    assert.equal(board.slots[2].barPercent, Math.round((10 / 21) * 100));
});

test('current streak outside top 3 gets no glow', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        attempt: 2,
        pastJourneyStreaks: [{ attempt: 1, streaks: [30, 21, 15] }],
        currentStreak: 8,
        score: { success: 8, failures: 0 },
    }));
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assertSlotValues(board.slots, [30, 21, 15]);
    assert.ok(board.slots.every(function (s) { return !s.isActive; }));
});

test('equal-duration streaks tie-break by attempt then id deterministically', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        pastJourneyStreaks: [
            { attempt: 1, streaks: [10] },
            { attempt: 2, streaks: [10] },
        ],
        currentStreak: 0,
    }));
    const a = ctx.buildBestStreaksBoard(getState(ctx));
    const b = ctx.buildBestStreaksBoard(getState(ctx));
    assertSlotValues(a.slots, [10, 10, null]);
    assertSlotValues(b.slots, [10, 10, null]);
});

test('active streak matches live id not equal historical segment', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        attempt: 2,
        pastJourneyStreaks: [{ attempt: 1, streaks: [10] }],
        currentJourneyStreaks: [10],
        currentStreak: 0,
    }));
    const activeId = ctx.getActiveStreakRecordId(getState(ctx));
    assert.equal(activeId, null);
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assert.ok(board.slots.every(function (s) { return !s.isActive; }));
});

test('current streak rank 1 gets active on gold slot only', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        attempt: 1,
        currentStreak: 25,
        pastJourneyStreaks: [],
        currentJourneyStreaks: [],
    }));
    const board = ctx.buildBestStreaksBoard(getState(ctx));
    assert.equal(board.slots[0].isActive, true);
    assert.equal(board.slots[0].rank, 1);
});

test('zero journeys yields empty journey ranks', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        completedJourneys: [],
        pendingNextJourney: true,
    }));
    const board = ctx.buildBestJourneysBoard(getState(ctx));
    assertSlotValues(board.slots, [null, null, null]);
});

test('journey ranking uses score.success like progress graph', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        completedJourneys: [
            { attempt: 1, score: { success: 41, failures: 10 } },
            { attempt: 2, score: { success: 90, failures: 10 } },
            { attempt: 3, score: { success: 62, failures: 8 } },
        ],
        attempt: 4,
        pendingNextJourney: true,
    }));
    const board = ctx.buildBestJourneysBoard(getState(ctx));
    assertSlotValues(board.slots, [90, 62, 41]);
    assert.equal(board.slots[0].barPercent, 100);
});

test('active journey in rank 3 gets bronze active state', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        completedJourneys: [
            { attempt: 1, score: { success: 90, failures: 10 } },
            { attempt: 2, score: { success: 62, failures: 10 } },
        ],
        attempt: 3,
        score: { success: 41, failures: 2 },
        currentStreak: 1,
    }));
    const board = ctx.buildBestJourneysBoard(getState(ctx));
    assertSlotValues(board.slots, [90, 62, 41]);
    assert.equal(board.slots[2].isActive, true);
    assert.equal(board.slots[2].rank, 3);
});

test('active journey outside top 3 has no glow', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        completedJourneys: [
            { attempt: 1, score: { success: 90, failures: 10 } },
            { attempt: 2, score: { success: 62, failures: 10 } },
            { attempt: 3, score: { success: 41, failures: 10 } },
        ],
        attempt: 4,
        score: { success: 8, failures: 1 },
        currentStreak: 1,
    }));
    const board = ctx.buildBestJourneysBoard(getState(ctx));
    assert.ok(board.slots.every(function (s) { return !s.isActive; }));
});

test('journey tie uses fewer failures then attempt', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        completedJourneys: [
            { attempt: 1, score: { success: 50, failures: 10 } },
            { attempt: 2, score: { success: 50, failures: 5 } },
        ],
        pendingNextJourney: true,
    }));
    const board = ctx.buildBestJourneysBoard(getState(ctx));
    assert.equal(board.slots[0].value, 50);
    assert.equal(board.slots[1].value, 50);
});

test('buildBestPerformancesViewModel returns both boards', () => {
    const ctx = withBestPerf(createKingContext());
    resetKing(ctx, { today: '2026-06-10' });
    const vm = ctx.buildBestPerformancesViewModel(getState(ctx));
    assert.ok(vm.streaks.slots.length === 3);
    assert.ok(vm.journeys.slots.length === 3);
});
