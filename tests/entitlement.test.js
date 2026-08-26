const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createKingContext,
    resetKing,
    isoDaysFromNow,
    getState,
    setState,
} = require('./helpers/king-harness');

test('active local trial grants premium access', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    setState(ctx, { trialStartedAt: isoDaysFromNow(-5) });
    const s = getState(ctx);

    assert.equal(ctx.Entitlement.isTrialActive(s), true);
    assert.equal(ctx.Entitlement.hasPremiumAccess(s), true);
    assert.equal(ctx.Entitlement.getAccess(s).active, true);
});

test('expired trial denies premium without subscription', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    setState(ctx, { trialStartedAt: isoDaysFromNow(-40), premiumUntil: '' });
    const s = getState(ctx);

    assert.equal(ctx.Entitlement.isTrialActive(s), false);
    assert.equal(ctx.Entitlement.isSubscriptionActive(s), false);
    assert.equal(ctx.Entitlement.hasPremiumAccess(s), false);
    assert.equal(ctx.Entitlement.shouldShowPaywall(s), true);
});

test('active premiumUntil cache grants access', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    setState(ctx, {
        trialStartedAt: isoDaysFromNow(-40),
        premiumUntil: isoDaysFromNow(2),
        source: 'play',
    });
    const s = getState(ctx);

    assert.equal(ctx.Entitlement.isSubscriptionActive(s), true);
    assert.equal(ctx.Entitlement.hasPremiumAccess(s), true);
    assert.equal(ctx.Entitlement.daysRemaining(s) >= 1, true);
});

test('expired premiumUntil cache denies subscription access', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    setState(ctx, { premiumUntil: isoDaysFromNow(-1), source: 'play' });
    const s = getState(ctx);

    assert.equal(ctx.Entitlement.isSubscriptionActive(s), false);
});
