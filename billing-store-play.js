/**
 * billing-store-play.js — Google Play Billing: query, purchase, restore, entitlement writes.
 *
 * Symptom → function:
 *   Play prices not loading → loadPlayOffers()
 *   Purchase didn’t unlock → applyPlayPurchaseQuery(), updateEntitlementSnapshot()
 *   Restore failed → restorePremiumAccess(), refreshPlayPurchasesSilent()
 *
 * Does not paint paywall UI — calls refreshPremiumOfferUiIfVisible() after offer queries.
 * V2 iOS: add billing-store-apple.js; keep entitlement writes here or in a thin router.
 */

var playCheckoutInFlight = false;
var playRestoreInFlight = false;
var playPurchasesListenerBound = false;

/**
 * Single write path for paid EntitlementSnapshot fields (Billing / later Firebase).
 * @param {Partial<EntitlementSnapshot>} fields
 */
function updateEntitlementSnapshot(fields) {
    if (!fields || typeof fields !== 'object') return;
    if (fields.source !== 'play' && fields.source !== 'restore') return;
    if (fields.premiumUntil !== undefined) state.premiumUntil = fields.premiumUntil;
    if (fields.lastVerifiedAt !== undefined) state.lastVerifiedAt = fields.lastVerifiedAt;
    state.source = fields.source;
    saveToStorage(state);
}

function getKingBillingPlugin() {
    var Cap = typeof window !== 'undefined' ? window.Capacitor : null;
    if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return null;
    if (typeof Cap.getPlatform === 'function' && Cap.getPlatform() !== 'android') return null;
    if (Cap.Plugins && Cap.Plugins.KingBilling) return Cap.Plugins.KingBilling;
    if (typeof Cap.registerPlugin === 'function') {
        try { return Cap.registerPlugin('KingBilling'); } catch (e) { return null; }
    }
    return null;
}

function callKingBilling(method, args) {
    var plugin = getKingBillingPlugin();
    if (!plugin || typeof plugin[method] !== 'function') {
        return Promise.reject(new Error('unavailable'));
    }
    return plugin[method](args || {});
}

function playIsoBillingPeriod(period) {
    return period === 'year' ? 'P1Y' : 'P1M';
}

function playOfferSpec(row) {
    row = row || {};
    return {
        productId: row.productId || '',
        basePlanId: row.basePlanId || '',
        offerId: row.offerId || '',
        billingPeriod: playIsoBillingPeriod(row.period),
    };
}

function playOfferSpecForPlan(planId) {
    var list = typeof PREMIUM_PLAY_PRODUCTS !== 'undefined' ? PREMIUM_PLAY_PRODUCTS : [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === planId) return playOfferSpec(list[i]);
    }
    return null;
}

function playPlanForProductId(productId) {
    var list = typeof PREMIUM_PLAY_PRODUCTS !== 'undefined' ? PREMIUM_PLAY_PRODUCTS : [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].productId === productId) return list[i];
    }
    return null;
}

function plansFromPlayProducts(products) {
    var out = [];
    var list = products || [];
    for (var i = 0; i < list.length; i++) {
        var row = playPlanForProductId(list[i].productId);
        if (!row || !list[i].price || list[i].hasSelectedOffer === false) continue;
        var micros = Number(list[i].priceAmountMicros) || 0;
        var plan = {
            id: row.id,
            period: row.period,
            price: list[i].price,
            message: row.id === 'annual' ? PREMIUM_ANNUAL_VALUE_MESSAGE : '',
        };
        if (micros > 0) plan.amount = micros / 1000000;
        out.push(plan);
    }
    var order = { annual: 0, monthly: 1 };
    out.sort(function (a, b) {
        return (order[a.id] != null ? order[a.id] : 9) - (order[b.id] != null ? order[b.id] : 9);
    });
    return out;
}

function loadPlayOffers() {
    if (!getKingBillingPlugin()) return;
    if (!storePremiumOffer) {
        premiumOfferLoadState = 'loading';
        refreshPremiumOfferUiIfVisible();
    }
    callKingBilling('queryProducts', {
        products: PREMIUM_PLAY_PRODUCTS.map(playOfferSpec),
    }).then(function (result) {
        if (!result || !result.ok) {
            if (!storePremiumOffer) premiumOfferLoadState = 'unavailable';
            refreshPremiumOfferUiIfVisible();
            return;
        }
        var plans = plansFromPlayProducts(result.products);
        if (!plans.length) {
            if (!storePremiumOffer) premiumOfferLoadState = 'unavailable';
            refreshPremiumOfferUiIfVisible();
            return;
        }
        setPremiumOfferFromStore({
            trialDays: PREMIUM_TRIAL_DAYS,
            plans: plans,
            source: 'play',
        });
        var overlay = document.getElementById('premiumOverlay');
        if (overlay && overlay.classList.contains('active')) {
            showPremiumModal({ plans: plans, source: 'play' });
        }
        if (premiumPanelOpen) renderPremiumPanelContent();
    }).catch(function () {
        if (!storePremiumOffer) premiumOfferLoadState = 'unavailable';
        refreshPremiumOfferUiIfVisible();
    });
}

function restoreAfterAlreadyOwned() {
    return callKingBilling('queryPurchases', {}).then(function (result) {
        var next = applyPlayPurchaseQuery(result, 'play');
        if (next.active) {
            onPremiumActivated();
            return;
        }
        showToast(0, 'Google Play says this account already has a purchase, but it isn’t an active King Premium subscription.');
    });
}

function isAllowedPlayProduct(id) {
    if (!id) return false;
    var allowed = typeof PREMIUM_PLAY_PRODUCT_IDS !== 'undefined' ? PREMIUM_PLAY_PRODUCT_IDS : [];
    for (var i = 0; i < allowed.length; i++) {
        if (allowed[i] === id) return true;
    }
    return false;
}

function purchaseProductIds(purchase) {
    if (!purchase) return [];
    if (purchase.productIds && purchase.productIds.length) return purchase.productIds;
    return purchase.productId ? [purchase.productId] : [];
}

function isActivePlaySubscription(purchase) {
    if (!purchase || purchase.purchaseState !== 'purchased' || purchase.suspended) return false;
    var ids = purchaseProductIds(purchase);
    for (var i = 0; i < ids.length; i++) {
        if (isAllowedPlayProduct(ids[i])) return true;
    }
    return false;
}

function findActivePlaySubscription(purchases) {
    var list = purchases || [];
    for (var i = 0; i < list.length; i++) {
        if (isActivePlaySubscription(list[i])) return list[i];
    }
    return null;
}

function playAccessCacheUntilIso() {
    var days = typeof PREMIUM_PLAY_CACHE_DAYS === 'number' ? PREMIUM_PLAY_CACHE_DAYS : 3;
    return new Date(Date.now() + days * MS_PER_DAY).toISOString();
}

function applyPlayPurchaseQuery(result, source) {
    if (!result || !result.ok) return { applied: false, active: false, unavailable: true };
    var purchase = findActivePlaySubscription(result.purchases);
    var nowIso = new Date().toISOString();
    if (purchase) {
        updateEntitlementSnapshot({
            premiumUntil: playAccessCacheUntilIso(),
            lastVerifiedAt: nowIso,
            source: source === 'restore' ? 'restore' : 'play',
        });
        return { applied: true, active: true, unavailable: false };
    }
    if (state.source === 'play' || state.source === 'restore') {
        updateEntitlementSnapshot({
            premiumUntil: '',
            lastVerifiedAt: nowIso,
            source: state.source,
        });
    }
    return { applied: true, active: false, unavailable: false };
}

function refreshPlayPurchasesSilent() {
    if (!getKingBillingPlugin()) return;
    callKingBilling('queryPurchases', {}).then(function (result) {
        if (!result || !result.ok) return;
        applyPlayPurchaseQuery(result, 'play');
        unlockPremiumFeatures();
    }).catch(function () {});
}

function bindPlayPurchasesListener() {
    var plugin = getKingBillingPlugin();
    if (!plugin || playPurchasesListenerBound || typeof plugin.addListener !== 'function') return;
    playPurchasesListenerBound = true;
    plugin.addListener('purchasesUpdated', function (result) {
        if (!result || !result.ok) return;
        if (playCheckoutInFlight && !findActivePlaySubscription(result.purchases)) return;
        applyPlayPurchaseQuery(result, state.source === 'restore' ? 'restore' : 'play');
        unlockPremiumFeatures();
    });
}
