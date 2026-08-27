const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
    createKingContext,
    resetKing,
    isoDaysFromNow,
    getState,
    setState,
} = require('./helpers/king-harness');

function stubNativeAndroidBilling(ctx, billingPlugin) {
    ctx.__billingPlugin = billingPlugin || {};
    vm.runInContext(`
        window = {
            Capacitor: {
                isNativePlatform: function () { return true; },
                getPlatform: function () { return 'android'; },
                Plugins: { KingBilling: __billingPlugin },
            },
        };
    `, ctx);
}

test('getPremiumOffer uses mock plans on web harness', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    const offer = ctx.getPremiumOffer();
    assert.equal(offer.source, 'mock');
    assert.ok(offer.plans.length >= 2);
    assert.match(offer.plans[0].price, /₹/);
});

test('getPremiumOffer never shows mock on native without Play prices', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    stubNativeAndroidBilling(ctx);
    const offer = ctx.getPremiumOffer();
    assert.equal(offer.source, 'loading');
    assert.equal(offer.plans.length, 0);
});

test('getPremiumOffer shows Play prices after setPremiumOfferFromStore', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    stubNativeAndroidBilling(ctx);
    ctx.setPremiumOfferFromStore({
        source: 'play',
        plans: [
            { id: 'monthly', price: '$4.99', amount: 4.99 },
            { id: 'annual', price: '$39.99', amount: 39.99 },
        ],
    });
    const offer = ctx.getPremiumOffer();
    assert.equal(offer.source, 'play');
    assert.equal(offer.plans[0].price, '$4.99');
    assert.equal(offer.plans.some((p) => String(p.price).indexOf('₹149') !== -1), false);
});

test('getPremiumOffer unavailable when Play pricing load fails on native', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    stubNativeAndroidBilling(ctx);
    vm.runInContext('premiumOfferLoadState = "unavailable"', ctx);
    const offer = ctx.getPremiumOffer();
    assert.equal(offer.source, 'unavailable');
    assert.equal(offer.plans.length, 0);
});

test('getPremiumOffer never shows mock on production web host', () => {
    const ctx = createKingContext();
    resetKing(ctx);
    vm.runInContext('location = { hostname: "fedmudit-max.github.io" };', ctx);
    const offer = ctx.getPremiumOffer();
    assert.equal(offer.source, 'web');
    assert.equal(offer.plans.length, 0);
});

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
