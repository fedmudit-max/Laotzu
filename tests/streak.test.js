const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    seedJourney,
    getState,
    simulateColdStartInit,
    putSavedStateInStorage,
    setToday,
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

test('streak milestone counters increment at 50 days', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const today = ctx.addDaysToKey(start, 49);
    resetKing(ctx, { today });
    seedJourney(ctx, { today, start });

    let d = start;
    for (let i = 0; i < 50; i++) {
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
        d = ctx.addDaysToKey(d, 1);
    }

    const s = getState(ctx);
    assert.equal(s.day50Count, 1);
    assert.equal(s.currentStreak, 50);
    assert.equal(s.streak100CountUnlocked, true);
    assert.equal(ctx.isStreak100CountRowRevealed(), true);
});

test('50-day count milestone hidden until Day 30 streak', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const today = ctx.addDaysToKey(start, 29);
    resetKing(ctx, { today });
    seedJourney(ctx, { today, start });

    assert.equal(ctx.isStreakRecordsSectionRevealed(), false);

    let d = start;
    for (let i = 0; i < 30; i++) {
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
        d = ctx.addDaysToKey(d, 1);
    }

    const s = getState(ctx);
    assert.equal(s.currentStreak, 30);
    assert.equal(s.streak50CountUnlocked, true);
    assert.equal(ctx.isStreakRecordsSectionRevealed(), true);
    assert.equal(ctx.isStreak100CountRowRevealed(), false);
});

test('100-day count milestone hidden until first 50-day count', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });

    assert.equal(ctx.isStreak100CountRowRevealed(), false);

    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    assert.equal(getState(ctx).day50Count, 0);
    assert.equal(ctx.isStreakRecordsSectionRevealed(), false);
    assert.equal(ctx.isStreak100CountRowRevealed(), false);
});

test('streak milestone counters increment at 100 days', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const today = ctx.addDaysToKey(start, 99);
    resetKing(ctx, { today });
    seedJourney(ctx, { today, start });

    let d = start;
    for (let i = 0; i < 100; i++) {
        setToday(ctx, d);
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
        d = ctx.addDaysToKey(d, 1);
    }

    const s = getState(ctx);
    assert.equal(s.currentStreak, 100);
    assert.equal(s.day50Count, 1);
    assert.equal(s.day100Count, 1);
    assert.equal(s.streak50CountUnlocked, true);
    assert.equal(s.streak100CountUnlocked, true);
});

test('mergeSavedState unlocks Records when longestStreak >= 30', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    const merged = ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        longestStreak: 35,
        currentStreak: 5,
    });
    assert.equal(merged.streak50CountUnlocked, true);
    assert.equal(ctx.isStreakRecordsSectionRevealed(merged), true);
    assert.equal(ctx.isStreak100CountRowRevealed(merged), false);
});

test('cold start unlocks Records from saved longestStreak without new logs', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-08-01' });
    putSavedStateInStorage(ctx, {
        ...ctx.getDefaultState(),
        journeyStartDate: '2026-06-01',
        appStartDate: '2026-06-01',
        lastOpenedDate: '2026-08-01',
        longestStreak: 42,
        currentStreak: 3,
    });
    simulateColdStartInit(ctx);
    const s = getState(ctx);
    assert.equal(s.streak50CountUnlocked, true);
    assert.equal(ctx.isStreakRecordsSectionRevealed(), true);
    assert.equal(ctx.isStreak100CountRowRevealed(), false);
});

test('count milestone render state: default shows 0 without green class', () => {
    const ctx = createKingContext();
    const r = ctx.getStreakCountRowDisplay(false, 0, false);
    assert.equal(r.status, '0');
    assert.equal(r.className, null);
});

test('count milestone render state: active streak uses achieved-glow', () => {
    const ctx = createKingContext();
    const live = ctx.getStreakCountRowDisplay(true, 0, false);
    assert.equal(live.status, '✓');
    assert.equal(live.className, 'achieved-glow');
    const liveCount = ctx.getStreakCountRowDisplay(true, 2, false);
    assert.equal(liveCount.status, '2');
    assert.equal(liveCount.className, 'achieved-glow');
});

test('count milestone render state: prior count uses achieved-earned green labels', () => {
    const ctx = createKingContext();
    const earned = ctx.getStreakCountRowDisplay(false, 3, false);
    assert.equal(earned.status, '3');
    assert.equal(earned.className, 'achieved-earned');
});

test('mergeSavedState unlocks 100-day row when day50Count already set', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    const merged = ctx.mergeSavedState({
        ...ctx.getDefaultState(),
        day50Count: 2,
        longestStreak: 60,
        currentStreak: 10,
    });
    assert.equal(merged.streak50CountUnlocked, true);
    assert.equal(merged.streak100CountUnlocked, true);
    assert.equal(ctx.isStreak100CountRowRevealed(merged), true);
});

test('count milestone render state: prior count after slip uses achieved-earned', () => {
    const ctx = createKingContext();
    const earned = ctx.getStreakCountRowDisplay(false, 1, false);
    assert.equal(earned.className, 'achieved-earned');
});

test('count milestone render state: freeze day uses streak-ended styling', () => {
    const ctx = createKingContext();
    const frozen = ctx.getStreakCountRowDisplay(true, 1, true);
    assert.equal(frozen.status, '1');
    assert.equal(frozen.className, 'achieved streak-ended');
    const frozenNoCount = ctx.getStreakCountRowDisplay(true, 0, true);
    assert.equal(frozenNoCount.status, 'Ended');
});

test('applyStreakRecordsMilestonesOnStrongDay unlocks rows at thresholds', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    seedJourney(ctx, { today: '2026-06-15', start: '2026-06-15' });

    setToday(ctx, '2026-06-15');
    for (let i = 0; i < 29; i++) {
        const d = ctx.addDaysToKey('2026-06-15', i);
        setToday(ctx, d);
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
    }
    assert.equal(getState(ctx).streak50CountUnlocked, false);

    const day30 = ctx.addDaysToKey('2026-06-15', 29);
    setToday(ctx, day30);
    ctx.applyStrongDay({ logDate: day30, suppressUI: true });
    assert.equal(getState(ctx).streak50CountUnlocked, true);
    assert.equal(getState(ctx).streak100CountUnlocked, false);

    const panel30 = ctx.getStreakRecordsPanelState(getState(ctx), 30, false);
    assert.equal(panel30.recordsLabelVisible, true);
    assert.equal(panel30.day100.visible, false);
});

test('records UI: hidden before day 30, label on at 30, 100 row only after 50-day count', () => {
    const ctx = createKingContext();
    const start = '2026-06-15';
    const today30 = ctx.addDaysToKey(start, 29);
    resetKing(ctx, { today: today30 });
    seedJourney(ctx, { today: today30, start });

    let panel = ctx.getStreakRecordsPanelState(getState(ctx), 5, false);
    assert.equal(panel.recordsLabelVisible, false);
    assert.equal(panel.day50.visible, false);
    assert.equal(panel.day100.visible, false);
    assert.equal(panel.bestStreak.visible, true);
    assert.equal(panel.day50.status, '0');
    assert.equal(panel.day50.className, null);

    let d = start;
    for (let i = 0; i < 30; i++) {
        setToday(ctx, d);
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
        d = ctx.addDaysToKey(d, 1);
    }
    const at30 = getState(ctx);
    panel = ctx.getStreakRecordsPanelState(at30, 30, false);
    assert.equal(panel.recordsLabelVisible, true);
    assert.equal(panel.day50.visible, true);
    assert.equal(panel.day100.visible, false);
    assert.equal(panel.bestStreak.visible, true);
    assert.equal(panel.day50.status, '0');
    assert.equal(panel.day50.className, null);

    for (let i = 0; i < 20; i++) {
        setToday(ctx, d);
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
        d = ctx.addDaysToKey(d, 1);
    }
    const at50 = getState(ctx);
    panel = ctx.getStreakRecordsPanelState(at50, 50, false);
    assert.equal(panel.recordsLabelVisible, true);
    assert.equal(panel.day100.visible, true);
    assert.equal(panel.day50.status, '1');
    assert.equal(panel.day50.className, 'achieved-glow');
    assert.equal(panel.day100.status, '0');
    assert.equal(panel.day100.className, null);

    for (let i = 0; i < 50; i++) {
        setToday(ctx, d);
        ctx.applyStrongDay({ logDate: d, suppressUI: true });
        d = ctx.addDaysToKey(d, 1);
    }
    const at100 = getState(ctx);
    panel = ctx.getStreakRecordsPanelState(at100, 100, false);
    assert.equal(panel.day100.status, '1');
    assert.equal(panel.day100.className, 'achieved-glow');
});
