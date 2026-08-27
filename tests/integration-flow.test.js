/**
 * Cross-module integration flows — exercises logic-storage → dates-log → journey → streak → logging
 * in sequences that unit tests in single domains can miss.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    seedJourney,
    getState,
    simulateColdStartInit,
    runRestorePipeline,
    simulateLogStrongToday,
    simulateLogSlipToday,
    putSavedStateInStorage,
} = require('./helpers/king-harness');

test('flow: cold start init heals stranded journey from localStorage', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-20' });
    putSavedStateInStorage(ctx, {
        attempt: 1,
        journeyStartDate: '2026-06-10',
        appStartDate: '2026-06-10',
        score: { success: 5, failures: 10 },
        pendingNextJourney: false,
        journeyEndedDate: '',
        dailyLog: {
            '2026-06-15': { status: 'slip', day: 6, date: '2026-06-15', slipCount: 10 },
        },
    });

    simulateColdStartInit(ctx);

    const s = getState(ctx);
    assert.equal(s.pendingNextJourney, true);
    assert.match(s.journeyEndedDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ctx.canLogToday(), false);
});

test('flow: yesterday gate blocks today until yesterday is logged', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });

    assert.equal(ctx.isYesterdayLogPending(), true);
    const blockedToday = ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });
    assert.equal(blockedToday.applied, false);

    const yesterday = ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    assert.equal(yesterday.applied, true);
    assert.equal(ctx.isYesterdayLogPending(), false);

    const today = ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });
    assert.equal(today.applied, true);
    assert.equal(getState(ctx).score.success, 3);
});

test('flow: log strong today aligns dailyLog, score, and streak', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-16' });
    seedJourney(ctx, { today: '2026-06-16', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });

    const result = simulateLogStrongToday(ctx);
    assert.equal(result.applied, true);

    const s = getState(ctx);
    assert.equal(s.score.success, 2);
    assert.equal(s.currentStreak, 2);
    assert.equal(ctx.getWallDateLogStatus('2026-06-16'), 'strong');
    assert.equal(s.todayStatus, 'success');
});

test('flow: slip today pushes streak segment, freeze UI, and zeroes live streak', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });

    const slip = simulateLogSlipToday(ctx);
    assert.equal(slip.applied, true);

    const s = getState(ctx);
    assert.equal(s.currentStreak, 0);
    assert.equal(s.currentJourneyStreaks.length, 1);
    assert.equal(s.currentJourneyStreaks[0], 2);
    assert.equal(ctx.isStreakFreezeDay(), true);
    assert.equal(ctx.getDisplayStreak(), 2);
    assert.equal(ctx.getWallDateLogStatus('2026-06-17'), 'slip');
});

test('flow: multi-day absence auto-strongs through N-2 then allows today', () => {
    const ctx = createKingContext();
    const start = '2026-06-10';
    const today = '2026-06-15';
    resetKing(ctx, { today });
    seedJourney(ctx, { today: start, start });
    ctx.applyStrongDay({ logDate: start, suppressUI: true });

    getState(ctx).lastOpenedDate = start;
    getState(ctx).lastCheckedDate = start;

    const results = ctx.autoStrongAbsentDays(today);
    assert.ok(results.length >= 1);

    const s = getState(ctx);
    assert.equal(ctx.getWallDateLogStatus('2026-06-11'), 'strong');
    assert.equal(ctx.getWallDateLogStatus('2026-06-13'), 'strong');
    assert.equal(ctx.getWallDateLogStatus('2026-06-14'), null);
    assert.equal(s.score.success, 4);
    assert.equal(ctx.isYesterdayLogPending(), true);
});

test('flow: journey end via slips → archive → next journey → log again', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-16' });
    seedJourney(ctx, { today: '2026-06-16', start: '2026-06-15' });

    for (let i = 0; i < 10; i++) {
        ctx.applySlipDay({ logDate: '2026-06-15' });
    }
    ctx.archiveCompletedJourney('2026-06-15');

    assert.equal(ctx.isAwaitingNextJourney(), true);
    assert.equal(ctx.canLogToday(), false);

    ctx.beginNextJourney();
    assert.equal(ctx.canLogToday(), true);
    assert.equal(getState(ctx).journeyStartDate, '2026-06-16');

    const strong = simulateLogStrongToday(ctx);
    assert.equal(strong.applied, true);
    assert.equal(getState(ctx).score.success, 1);
});

test('flow: restore backup then log strong (full user recovery path)', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });

    const backup = ctx.parseBackupJson(JSON.stringify(ctx.buildBackupPayload()));
    assert.equal(backup.ok, true);

    resetKing(ctx, { today: '2026-06-17' });
    runRestorePipeline(ctx, backup.state);
    ctx.saveToStorage(getState(ctx));

    assert.equal(ctx.canLogToday(), true);
    const result = simulateLogStrongToday(ctx);
    assert.equal(result.applied, true);
    assert.equal(getState(ctx).score.success, 3);
    assert.equal(getState(ctx).currentStreak, 3);
});

test('flow: saveToStorage syncs milestone counts from journey history', () => {
    const ctx = createKingContext();
    const start = '2026-06-01';
    const today = ctx.addDaysToKey(start, 24);
    resetKing(ctx, { today });
    seedJourney(ctx, { today, start });

    for (let i = 0; i < 25; i++) {
        ctx.applyStrongDay({
            logDate: ctx.addDaysToKey(start, i),
            suppressUI: true,
        });
    }

    getState(ctx).journeyMilestones = {};
    ctx.saveToStorage(getState(ctx));

    const s = getState(ctx);
    assert.equal(s.journeyMilestones[25], 1);
});

test('flow: readJourneyAnchorWallDate does not persist inferred anchor', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    ctx.replaceState({
        ...ctx.getDefaultState(),
        journeyStartDate: '',
        dailyLog: {
            '2026-06-15': { status: 'strong', day: 1, date: '2026-06-15' },
            '2026-06-16': { status: 'strong', day: 2, date: '2026-06-16' },
        },
    });

    assert.equal(ctx.readJourneyAnchorWallDate(), '');
    assert.equal(getState(ctx).journeyStartDate, '');

    const ensured = ctx.ensureJourneyAnchorWallDate();
    assert.equal(ensured, '2026-06-15');
    assert.equal(getState(ctx).journeyStartDate, '2026-06-15');
});

test('flow: readAppStartWallDate does not persist inferred install date', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    ctx.replaceState({
        ...ctx.getDefaultState(),
        appStartDate: '',
        journeyStartDate: '2026-06-15',
        dailyLog: {
            '2026-06-10': { status: 'strong', day: 1, date: '2026-06-10' },
            '2026-06-15': { status: 'strong', day: 1, date: '2026-06-15' },
        },
    });

    assert.equal(ctx.readAppStartWallDate(), '');
    assert.equal(ctx.inferAppStartFromLog(), '2026-06-10');
    assert.equal(getState(ctx).appStartDate, '');

    assert.equal(ctx.ensureAppStartWallDate(), '2026-06-10');
    assert.equal(getState(ctx).appStartDate, '2026-06-10');
});

test('flow: completeEndJourney path opens next journey when end day has passed', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-16' });
    seedJourney(ctx, { today: '2026-06-16', start: '2026-06-15' });

    for (let i = 0; i < 10; i++) {
        ctx.applySlipDay({ logDate: '2026-06-15' });
    }

    const comparison = ctx.archiveCompletedJourney('2026-06-15');
    assert.ok(comparison);
    assert.equal(ctx.canBeginNextJourneyToday(), true);

    ctx.beginNextJourney();
    assert.equal(getState(ctx).attempt, 2);
    assert.equal(ctx.isAwaitingNextJourney(), false);
    assert.equal(ctx.canLogToday(), true);
});
