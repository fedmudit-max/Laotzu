const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    seedJourney,
    getState,
    setState,
} = require('./helpers/king-harness');

function slipOnConsecutiveDays(ctx, startDate, count) {
    for (let i = 0; i < count; i++) {
        ctx.applySlipDay({ logDate: ctx.addDaysToKey(startDate, i) });
    }
}

test('fresh journey has zero slips and can log', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });
    const s = getState(ctx);

    assert.equal(s.score.success, 0);
    assert.equal(s.score.failures, 0);
    assert.equal(ctx.canLogToday(), true);
    assert.equal(ctx.isAwaitingNextJourney(), false);
});

test('single slip increments failure count', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });

    const result = ctx.applySlipDay({ logDate: '2026-06-15' });
    assert.equal(result.applied, true);
    assert.equal(getState(ctx).score.failures, 1);
    assert.equal(ctx.journeyIsOver(getState(ctx)), false);
});

test('ten slips ends journey and blocks further logging', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });

    for (let i = 0; i < 10; i++) {
        const r = ctx.applySlipDay({ logDate: '2026-06-15' });
        assert.equal(r.applied, true, 'slip ' + (i + 1));
    }
    const s = getState(ctx);
    assert.equal(s.score.failures, 10);
    assert.equal(ctx.journeyIsOver(s), true);
    assert.equal(ctx.canLogToday(), false);

    const blocked = ctx.applySlipDay({ logDate: '2026-06-15' });
    assert.equal(blocked.applied, false);
});

test('archive after 10 slips sets awaiting next journey', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });

    for (let i = 0; i < 10; i++) {
        ctx.applySlipDay({ logDate: '2026-06-15' });
    }
    const comparison = ctx.archiveCompletedJourney('2026-06-15');
    const s = getState(ctx);
    assert.ok(comparison);
    assert.equal(ctx.isAwaitingNextJourney(), true);
    assert.equal(s.journeyEndedDate, '2026-06-15');
    assert.equal(s.completedJourneys.length, 1);
    assert.equal(s.completedJourneys[0].score.failures, 10);
    assert.equal(s.completedJourneys[0].score.success, 0);
});

test('strong days accumulate until journey ends', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    const third = ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    assert.equal(third.applied, true);
    assert.equal(getState(ctx).score.success, 3);
    assert.equal(getState(ctx).score.failures, 0);
});

test('beginNextJourney after end day resets score and bumps attempt', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-16' });
    seedJourney(ctx, { today: '2026-06-16', start: '2026-06-15' });

    for (let i = 0; i < 10; i++) {
        ctx.applySlipDay({ logDate: '2026-06-15' });
    }
    ctx.archiveCompletedJourney('2026-06-15');

    ctx.beginNextJourney();
    const s = getState(ctx);
    assert.equal(s.attempt, 2);
    assert.equal(s.score.success, 0);
    assert.equal(s.score.failures, 0);
    assert.equal(ctx.isAwaitingNextJourney(), false);
    assert.equal(s.journeyStartDate, '2026-06-16');
    assert.equal(ctx.canLogToday(), true);
});

test('permanent best journey updates when finished score beats prior', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const slipDay = ctx.addDaysToKey(start, 5);
    resetKing(ctx, { today: slipDay });
    seedJourney(ctx, { today: slipDay, start });

    for (let i = 0; i < 5; i++) {
        ctx.applyStrongDay({ logDate: ctx.addDaysToKey(start, i), suppressUI: true });
    }
    for (let i = 0; i < 10; i++) {
        ctx.applySlipDay({ logDate: slipDay });
    }

    const best = getState(ctx).bestJourney;
    assert.equal(best.success, 5);
    assert.equal(best.failures, 10);
});

test('journey milestone labels use strong days wording', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });

    assert.equal(ctx.formatJourneyMilestoneLabel(100), '100 Strong Days');
    assert.equal(ctx.formatJourneyMilestoneLabel(200), '200 Strong Days');
});

test('warrior unlock hint shows day count on first locked row only', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });

    assert.equal(ctx.formatJourneyMilestoneUnlockHint(100), '100 Strong Days to unlock');
    assert.equal(ctx.formatJourneyMilestoneUnlockHint(200), '200 Strong Days to unlock');
    assert.equal(ctx.formatJourneyMilestoneUnlockHint(400), '400 Strong Days to unlock');
});

test('first journey display best mirrors current after slip-first start', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });

    ctx.applySlipDay({ logDate: '2026-06-15' });
    var displayAfterSlip = ctx.getDisplayBestJourney();
    assert.equal(displayAfterSlip.success, 0);
    assert.equal(displayAfterSlip.failures, 1);
    assert.equal(getState(ctx).score.success, 0);
    assert.equal(getState(ctx).score.failures, 1);
});

test('best journey hint hidden on first journey', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });

    assert.equal(ctx.getBestJourneyHintText(), null);

    setState(ctx, { score: { success: 25, failures: 0 } });
    assert.equal(ctx.getBestJourneyHintText(), null);

    setState(ctx, { score: { success: 50, failures: 0 } });
    assert.equal(ctx.getBestJourneyHintText(), null);
});

test('best journey hint shows beat prior best on later journeys', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15', attempt: 2 });
    setState(ctx, {
        score: { success: 10, failures: 0 },
        completedJourneys: [{
            attempt: 1,
            score: { success: 38, failures: 10 },
            endedDate: '2026-06-14',
        }],
    });

    assert.equal(ctx.getBestJourneyHintText(), 'Beat 38 Strong Days to Win!');

    setState(ctx, { score: { success: 26, failures: 0 } });
    assert.equal(ctx.getBestJourneyHintText(), 'Beat 38 Strong Days to Win!');

    setState(ctx, { score: { success: 40, failures: 0 } });
    assert.equal(ctx.getBestJourneyHintText(), 'New Best! Keep Going!');
});

test('best journey hint shows next milestone when current journey beats prior', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15', attempt: 2 });
    setState(ctx, {
        score: { success: 149, failures: 2 },
        completedJourneys: [{
            attempt: 1,
            score: { success: 145, failures: 10 },
            endedDate: '2026-06-14',
        }],
    });

    assert.equal(ctx.getBestJourneyHintText(), 'New Best! Keep Going!');
});

test('best journey hint hides while awaiting next journey', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-15' });
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });
    setState(ctx, { pendingNextJourney: true, journeyEndedDate: '2026-06-15' });

    assert.equal(ctx.getBestJourneyHintText(), null);
});

test('archive below-best uses permanent bestJourney when higher than completed rows', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const end = ctx.addDaysToKey(start, 19);
    resetKing(ctx, { today: end });
    seedJourney(ctx, { today: end, start, attempt: 2 });
    setState(ctx, {
        score: { success: 12, failures: 10 },
        bestJourney: { success: 40, failures: 10 },
        completedJourneys: [{
            attempt: 1,
            score: { success: 38, failures: 10 },
            date: '2026-06-14T00:00:00.000Z',
        }],
    });

    const comparison = ctx.archiveCompletedJourney(end);
    assert.ok(comparison);
    assert.equal(comparison.prevBestScore.success, 40);
    assert.equal(
        ctx.isBetterJourneyScore(
            comparison.score.success,
            comparison.score.failures,
            comparison.prevBestScore,
        ),
        false,
    );
});

test('archive exposes prior best when second journey ends below first', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const end = ctx.addDaysToKey(start, 19);
    resetKing(ctx, { today: end });
    seedJourney(ctx, { today: end, start, attempt: 2 });
    setState(ctx, {
        score: { success: 12, failures: 10 },
        bestJourney: { success: 38, failures: 10 },
        completedJourneys: [{
            attempt: 1,
            score: { success: 38, failures: 10 },
            date: '2026-06-14T00:00:00.000Z',
        }],
    });

    const comparison = ctx.archiveCompletedJourney(end);
    assert.ok(comparison);
    assert.equal(comparison.prevBestScore.success, 38);
    assert.equal(comparison.prevBestScore.failures, 10);
    assert.equal(comparison.prevBestAttempt, 1);
    assert.equal(
        ctx.isBetterJourneyScore(
            comparison.score.success,
            comparison.score.failures,
            comparison.prevBestScore,
        ),
        false,
    );
});

test('archive falls back to bestJourney when completed history is missing', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const end = ctx.addDaysToKey(start, 14);
    resetKing(ctx, { today: end });
    seedJourney(ctx, { today: end, start, attempt: 2 });
    setState(ctx, {
        score: { success: 5, failures: 10 },
        bestJourney: { success: 20, failures: 10 },
        completedJourneys: [],
    });

    const comparison = ctx.archiveCompletedJourney(end);
    assert.ok(comparison);
    assert.equal(comparison.prevBestScore.success, 20);
    assert.equal(comparison.prevBestAttempt, 1);
});

test('second journey archive keeps prior best after 10th slip', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const end = ctx.addDaysToKey(start, 24);
    resetKing(ctx, { today: end });
    seedJourney(ctx, { today: end, start, attempt: 2 });
    setState(ctx, {
        completedJourneys: [{
            attempt: 1,
            score: { success: 12, failures: 10 },
            date: '2026-06-14T00:00:00.000Z',
        }],
        bestJourney: { success: 12, failures: 10 },
    });

    for (let i = 0; i < 15; i++) {
        ctx.applyStrongDay({ logDate: ctx.addDaysToKey(start, i), suppressUI: true });
    }
    slipOnConsecutiveDays(ctx, ctx.addDaysToKey(start, 15), 10);

    const comparison = ctx.archiveCompletedJourney(end);
    assert.ok(comparison);
    assert.equal(comparison.prevBestScore.success, 12);
    assert.equal(comparison.score.success, 15);
    assert.equal(
        ctx.isBetterJourneyScore(
            comparison.score.success,
            comparison.score.failures,
            comparison.prevBestScore,
        ),
        true,
    );
});

test('third journey archive below best keeps journey 1 as prior best', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const end = ctx.addDaysToKey(start, 34);
    resetKing(ctx, { today: end });
    seedJourney(ctx, { today: end, start: ctx.addDaysToKey(start, 20), attempt: 3 });
    setState(ctx, {
        score: { success: 8, failures: 10 },
        bestJourney: { success: 25, failures: 10 },
        completedJourneys: [
            { attempt: 1, score: { success: 25, failures: 10 }, date: '2026-06-14T00:00:00.000Z' },
            { attempt: 2, score: { success: 12, failures: 10 }, date: '2026-06-19T00:00:00.000Z' },
        ],
    });

    const comparison = ctx.archiveCompletedJourney(end);
    assert.ok(comparison);
    assert.equal(comparison.attempt, 3);
    assert.equal(comparison.prevBestScore.success, 25);
    assert.equal(comparison.prevBestAttempt, 1);
    assert.equal(
        ctx.isBetterJourneyScore(
            comparison.score.success,
            comparison.score.failures,
            comparison.prevBestScore,
        ),
        false,
    );
});

test('buildComparisonForAwaitingJourney rebuilds journey 2 comparison on reopen', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-20' });
    seedJourney(ctx, { today: '2026-06-20', start: '2026-06-15', attempt: 2 });
    setState(ctx, {
        pendingNextJourney: true,
        journeyEndedDate: '2026-06-19',
        completedJourneys: [
            { attempt: 1, score: { success: 12, failures: 10 } },
            { attempt: 2, score: { success: 7, failures: 10 } },
        ],
        score: { success: 7, failures: 10 },
    });

    const comparison = ctx.buildComparisonForAwaitingJourney();
    assert.ok(comparison);
    assert.equal(comparison.attempt, 2);
    assert.equal(comparison.prevBestScore.success, 12);
    assert.equal(comparison.score.success, 7);
});

test('wasJourneyComparisonShown keys by archived attempt and end date', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-20' });

    const comparison = {
        attempt: 2,
        score: { success: 15, failures: 10 },
        prevBestScore: { success: 12, failures: 10 },
        journeyEndedDate: '2026-06-19',
    };

    assert.equal(ctx.wasJourneyComparisonShown(comparison), false);
    ctx.markJourneyComparisonShown(comparison);
    assert.equal(ctx.wasJourneyComparisonShown(comparison), true);
    assert.ok(
        ctx.safeGet('kingCompareShown:v2:2:2026-06-19') === '1',
        'shown key uses v2 prefix with attempt and end date',
    );

    setState(ctx, { attempt: 3, journeyEndedDate: '' });
    assert.equal(ctx.wasJourneyComparisonShown(comparison), true);
});

test('healStrandedJourneyEnd returns comparison when it archives a stranded finish', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const end = ctx.addDaysToKey(start, 14);
    resetKing(ctx, { today: end });
    seedJourney(ctx, { today: end, start, attempt: 2 });
    setState(ctx, {
        score: { success: 8, failures: 10 },
        bestJourney: { success: 25, failures: 10 },
        completedJourneys: [{
            attempt: 1,
            score: { success: 25, failures: 10 },
            date: '2026-06-14T00:00:00.000Z',
        }],
    });

    const healResult = ctx.healStrandedJourneyEnd();
    assert.ok(healResult);
    assert.equal(healResult.prevBestScore.success, 25);
    assert.equal(ctx.isAwaitingNextJourney(), true);
});
