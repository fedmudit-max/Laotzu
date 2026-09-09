const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    seedJourney,
    getState,
} = require('./helpers/king-harness');

test('consecutive strong days build current streak', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    const s = getState(ctx);
    assert.equal(s.currentStreak, 3);
    assert.equal(s.longestStreak, 3);
});

test('slip today resets live streak to zero', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applySlipDay({ logDate: '2026-06-17' });

    const s = getState(ctx);
    assert.equal(s.currentStreak, 0);
    assert.equal(s.longestStreak, 2);
});

test('logging strong after slip does not revive today streak', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applySlipDay({ logDate: '2026-06-16' });
    const blocked = ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });

    assert.equal(blocked.applied, false);
    assert.equal(getState(ctx).currentStreak, 0);
});

test('streak surpassing prior longest updates longestStreak', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    ctx.replaceState(ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        journeyStartDate: '2026-06-15',
        appStartDate: '2026-06-15',
        lastOpenedDate: '2026-06-15',
        lastCheckedDate: '2026-06-15',
        calendarDay: 3,
        longestStreak: 2,
        longestStreakAtStreakStart: 2,
    }));

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    assert.equal(getState(ctx).longestStreak, 3);
    assert.equal(getState(ctx).currentStreak, 3);
});

test('weekly track maps logged day slots to wall dates', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    assert.equal(ctx.getWeeklyTrackWallDate(1), '2026-06-15');
    assert.equal(ctx.getWeeklyTrackWallDate(2), '2026-06-16');
    assert.equal(ctx.getWeeklyTrackWallDate(3), '2026-06-17');
    assert.equal(ctx.getWeeklyTrackWallDate(0), null);
});

test('weekly track maps slip day to today on freeze', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applySlipDay({ logDate: '2026-06-17' });

    const layout = ctx.getWeeklyFreezeLayout(ctx.getDisplayStreak());
    assert.equal(ctx.getWeeklyTrackWallDate(layout.slipWeekDay), '2026-06-17');
    assert.equal(ctx.getWeeklyTrackWallDate(1), '2026-06-15');
    assert.equal(ctx.getWeeklyTrackWallDate(2), '2026-06-16');

    const insight = ctx.formatDayLogInsight('2026-06-17');
    assert.match(insight.title, /Jun/i);
    assert.match(insight.outcome, /Slipped/i);
});

test('day reflection patches dailyLog without changing status', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    assert.equal(ctx.patchDailyLogEntry('2026-06-17', {
        dayState: 'busy',
        note: 'Long day at work',
    }), true);

    const insight = ctx.formatDayLogInsight('2026-06-17');
    assert.match(insight.stateLabel, /Busy/i);
    assert.equal(insight.note, 'Long day at work');
    assert.equal(ctx.getWallDateLogStatus('2026-06-17'), 'strong');
    assert.equal(getState(ctx).score.success, 3);
});
