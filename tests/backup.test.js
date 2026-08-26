const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    seedJourney,
    getState,
} = require('./helpers/king-harness');

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

test('restored state keeps journey progress after merge', () => {
    const ctx = createKingContext();
    resetKing(ctx, { today: '2026-06-17' });
    seedJourney(ctx, { today: '2026-06-17', start: '2026-06-15' });
    ctx.applyStrongDay({ logDate: '2026-06-15', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-16', suppressUI: true });
    ctx.applyStrongDay({ logDate: '2026-06-17', suppressUI: true });

    const backup = ctx.parseBackupJson(JSON.stringify(ctx.buildBackupPayload()));
    assert.equal(backup.ok, true);

    resetKing(ctx, { today: '2026-06-17' });
    ctx.replaceState(backup.state);
    ctx.healStrandedJourneyEnd();
    ctx.recomputeCurrentStreak();

    const s = getState(ctx);
    assert.equal(s.score.success, 3);
    assert.equal(s.currentStreak, 3);
});
