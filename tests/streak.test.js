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
