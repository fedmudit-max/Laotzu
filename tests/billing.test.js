const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    isoDaysFromNow,
    getState,
    setState,
} = require('./helpers/king-harness');

test('updateEntitlementSnapshot ignores non-play sources', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    setState(ctx, { premiumUntil: '' });
    ctx.updateEntitlementSnapshot({
        source: 'dev',
        premiumUntil: isoDaysFromNow(30),
    });
    assert.equal(getState(ctx).premiumUntil, '');
});

test('updateEntitlementSnapshot writes play purchase cache', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    const until = isoDaysFromNow(3);
    const verified = isoDaysFromNow(0);

    ctx.updateEntitlementSnapshot({
        source: 'play',
        premiumUntil: until,
        lastVerifiedAt: verified,
    });

    const s = getState(ctx);
    assert.equal(s.premiumUntil, until);
    assert.equal(s.lastVerifiedAt, verified);
    assert.equal(s.source, 'play');
    assert.equal(ctx.Entitlement.hasPremiumAccess(s), true);
});

test('restore source updates entitlement like play', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    const until = isoDaysFromNow(3);

    ctx.updateEntitlementSnapshot({
        source: 'restore',
        premiumUntil: until,
        lastVerifiedAt: isoDaysFromNow(0),
    });

    const s = getState(ctx);
    assert.equal(s.source, 'restore');
    assert.equal(ctx.Entitlement.isSubscriptionActive(s), true);
});

test('expired cache after restore denies premium when trial ended', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    setState(ctx, { trialStartedAt: isoDaysFromNow(-40) });
    ctx.updateEntitlementSnapshot({
        source: 'restore',
        premiumUntil: isoDaysFromNow(-1),
        lastVerifiedAt: isoDaysFromNow(-2),
    });

    assert.equal(ctx.Entitlement.hasPremiumAccess(getState(ctx)), false);
});
