const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    seedJourney,
    getState,
    runRestorePipeline,
    simulateRestoreImportBackup,
} = require('./helpers/king-harness');

/** Same sequence as init() and restoreImportBackup() — test the pipeline, not one function. */
test('buildBackupPayload round-trips through parseBackupJson', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applySlipDay({ logDate: '2026-06-17' });

    const payload = ctx.buildBackupPayload();
    const json = JSON.stringify(payload);
    const parsed = ctx.parseBackupJson(json);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.state.attempt, getState(ctx).attempt);
    assert.equal(parsed.state.score.success, 2);
    assert.equal(parsed.state.score.failures, 1);
    assert.equal(parsed.onboardingComplete, true);
});

test('parseBackupJson rejects invalid JSON', () => {
    const ctx = createKingContext();
    const bad = ctx.parseBackupJson('{not json');
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'invalid-json');
});

test('parseBackupJson rejects non-king payload', () => {
    const ctx = createKingContext();
    const bad = ctx.parseBackupJson(JSON.stringify({ foo: 'bar' }));
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'not-king-backup');
});

test('restore pipeline: current backup keeps progress and can log', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    const backup = ctx.parseBackupJson(JSON.stringify(ctx.buildBackupPayload()));
    assert.equal(backup.ok, true);

    resetKing(ctx, { today: '2026-06-17' });
    runRestorePipeline(ctx, backup.state);

    const s = getState(ctx);
    assert.equal(s.score.success, 3);
    assert.equal(s.currentStreak, 3);
    assert.equal(ctx.canLogToday(), true);
    const blocked = ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });
    assert.equal(blocked.applied, false);
});

test('restore pipeline: empty / new-user state', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    runRestorePipeline(ctx, {});

    const s = getState(ctx);
    assert.equal(s.attempt, 1);
    assert.equal(s.score.success, 0);
    assert.equal(s.currentStreak, 0);
    assert.equal(ctx.canLogToday(), true);
});

test('restore pipeline: older schema missing optional fields', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-16' });
    const legacy = {
        attempt: 1,
        score: { success: 2, failures: 0 },
        journeyStartDate: '2026-06-15',
        appStartDate: '2026-06-15',
        lastOpenedDate: '2026-06-16',
        lastCheckedDate: '2026-06-16',
        calendarDay: 2,
        dailyLog: {
            '2026-06-15': { status: 'strong', day: 1, date: '2026-06-15' },
            '2026-06-16': { status: 'strong', day: 2, date: '2026-06-16' },
        },
    };
    runRestorePipeline(ctx, legacy);

    const s = getState(ctx);
    assert.equal(s.score.success, 2);
    assert.equal(s.currentStreak, 2);
    assert.ok(s.journeyMilestones);
    assert.ok(Array.isArray(s.completedJourneys));
});

test('restore pipeline: stale currentStreak recomputed from dailyLog', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    runRestorePipeline(ctx, {
        journeyStartDate: '2026-06-15',
        appStartDate: '2026-06-15',
        lastOpenedDate: '2026-06-17',
        lastCheckedDate: '2026-06-17',
        calendarDay: 3,
        score: { success: 3, failures: 0 },
        currentStreak: 99,
        dailyLog: {
            '2026-06-15': { status: 'strong', day: 1, date: '2026-06-15' },
            '2026-06-16': { status: 'strong', day: 2, date: '2026-06-16' },
            '2026-06-17': { status: 'strong', day: 3, date: '2026-06-17' },
        },
    });

    assert.equal(getState(ctx).currentStreak, 3);
});

test('restore pipeline: stranded 10-slip journey healed', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-20' });
    runRestorePipeline(ctx, {
        attempt: 1,
        journeyStartDate: '2026-06-10',
        appStartDate: '2026-06-10',
        lastOpenedDate: '2026-06-15',
        score: { success: 5, failures: 10 },
        pendingNextJourney: false,
        journeyEndedDate: '',
        dailyLog: {
            '2026-06-15': { status: 'slip', day: 6, date: '2026-06-15', slipCount: 10 },
        },
    });

    const s = getState(ctx);
    assert.equal(s.pendingNextJourney, true);
    assert.match(s.journeyEndedDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ctx.canLogToday(), false);
});

test('restore pipeline: active journey mid-run', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    runRestorePipeline(ctx, {
        attempt: 2,
        journeyStartDate: '2026-06-15',
        appStartDate: '2026-06-01',
        lastOpenedDate: '2026-06-16',
        lastCheckedDate: '2026-06-16',
        calendarDay: 2,
        score: { success: 1, failures: 2 },
        pendingNextJourney: false,
        dailyLog: {
            '2026-06-15': { status: 'strong', day: 1, date: '2026-06-15' },
            '2026-06-16': { status: 'strong', day: 2, date: '2026-06-16' },
        },
    });

    assert.equal(ctx.canLogToday(), true);
    const slip = ctx.applySlipDay({ logDate: '2026-06-17' });
    assert.equal(slip.applied, true);
    assert.equal(getState(ctx).score.failures, 3);
});

test('restore pipeline: partial corrupt fields still recover logging', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-16' });
    runRestorePipeline(ctx, {
        journeyStartDate: 'not-a-date',
        score: { success: 1, failures: 0 },
        calendarDay: 0,
        dailyLog: {
            '2026-06-15': { status: 'strong', day: 1, date: '2026-06-15' },
        },
    });

    assert.equal(ctx.canLogToday(), true);
    const strong = ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    assert.equal(strong.applied, true);
});

test('restore import: applyStrongDay works after backup (interactive, not state-only)', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });

    const backup = ctx.parseBackupJson(JSON.stringify(ctx.buildBackupPayload()));
    assert.equal(backup.ok, true);

    resetKing(ctx, { today: '2026-06-17' });
    assert.equal(simulateRestoreImportBackup(ctx, backup), true);

    assert.equal(ctx.canLogToday(), true);
    assert.equal(ctx.isYesterdayLogPending(), false);

    const beforeSuccess = getState(ctx).score.success;
    const result = ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: false });
    assert.equal(result.applied, true);

    const after = getState(ctx);
    assert.equal(after.score.success, beforeSuccess + 1);
    assert.equal(after.currentStreak, 3);
    assert.equal(ctx.getWallDateLogStatus('2026-06-17'), 'strong');
    assert.equal(after.todayStatus, 'success');
});

test('restore import: applySlipDay works after backup (interactive, not state-only)', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });

    const backup = ctx.parseBackupJson(JSON.stringify(ctx.buildBackupPayload()));
    assert.equal(backup.ok, true);

    resetKing(ctx, { today: '2026-06-17' });
    simulateRestoreImportBackup(ctx, backup);

    assert.equal(ctx.canLogToday(), true);
    assert.equal(ctx.isYesterdayLogPending(), false);

    const beforeFailures = getState(ctx).score.failures;
    const slip = ctx.applySlipDay({ logDate: '2026-06-17' });
    assert.equal(slip.applied, true);

    const after = getState(ctx);
    assert.equal(after.score.failures, beforeFailures + 1);
    assert.equal(after.currentStreak, 0);
    assert.equal(ctx.getWallDateLogStatus('2026-06-17'), 'slip');
    assert.equal(after.todayStatus, 'failed');
    assert.equal(after.currentJourneyStreaks.length, 1);
});
