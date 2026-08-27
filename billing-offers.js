/**
 * billing-offers.js — Premium offer model: normalize plans, load state, getPremiumOffer().
 *
 * Symptom → function:
 *   Wrong/mock price on paywall → getPremiumOffer(), setPremiumOfferFromStore()
 *   Annual % badge wrong → enrichAnnualSavings()
 *
 * Does not call Play or paint UI. Store modules feed setPremiumOfferFromStore;
 * billing-ui reads getPremiumOffer() only.
 */

let storePremiumOffer = null;
/** Native store path: idle | loading | loaded | unavailable */
let premiumOfferLoadState = 'idle';

function planDiscountPercent(listAmount, amount) {
    var list = Number(listAmount);
    var sale = Number(amount);
    if (!(list > 0) || !(sale >= 0) || sale >= list) return 0;
    return Math.round(((list - sale) / list) * 100);
}

function planPeriodSuffix(period, id) {
    if (period === 'year' || id === 'annual') return '/year';
    return '/month';
}

function planAmountNumber(plan) {
    if (!plan) return 0;
    if (plan.amount != null && Number(plan.amount) > 0) return Number(plan.amount);
    var raw = String(plan.price || '');
    if (!raw) return 0;
    var cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,/g, '');
    var n = parseFloat(cleaned);
    return n > 0 ? n : 0;
}

/** Keep currency framing from a store price string; swap in a new number. */
function formatAmountLike(referencePrice, amount) {
    var ref = String(referencePrice || '');
    var useDecimals = /\.\d{2}\b/.test(ref);
    var value = useDecimals ? Number(amount).toFixed(2) : String(Math.round(Number(amount)));
    var match = ref.match(/^([^\d-]*)([\d,]+(?:\.\d+)?)(.*)$/);
    if (match) return match[1] + value + match[3];
    if (ref.indexOf('₹') !== -1) return '₹' + value;
    return value;
}

/**
 * Annual compare: strikethrough = PREMIUM_ANNUAL_COMPARE_AMOUNT (2299),
 * badge = % off vs the annual sale price.
 */
function enrichAnnualSavings(plans) {
    var list = plans || [];
    var annual = null;
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === 'annual') annual = list[i];
    }
    if (!annual) return list;

    var annualAmt = planAmountNumber(annual);
    var compareAmt = typeof PREMIUM_ANNUAL_COMPARE_AMOUNT === 'number'
        ? PREMIUM_ANNUAL_COMPARE_AMOUNT
        : 0;
    if (!(compareAmt > 0) || !(annualAmt > 0)) return list;

    var pct = planDiscountPercent(compareAmt, annualAmt);
    if (!(pct > 0)) {
        delete annual.listPrice;
        delete annual.listAmount;
        delete annual.discountPct;
        return list;
    }

    annual.listAmount = compareAmt;
    annual.listPrice = formatAmountLike(annual.price, compareAmt);
    annual.discountPct = pct;
    return list;
}

function normalizePremiumPlan(p) {
    p = p || {};
    var id = p.id || p.period || 'monthly';
    var listAmount = p.listAmount != null ? Number(p.listAmount) : 0;
    var amount = p.amount != null ? Number(p.amount) : 0;
    var period = p.period || (id === 'annual' ? 'year' : 'month');
    var plan = { id: id, period: period };

    if (p.price) {
        plan.price = String(p.price);
    } else if (amount > 0) {
        plan.price = '₹' + amount + planPeriodSuffix(period, id);
    }
    if (amount > 0) plan.amount = amount;

    if (id !== 'annual') {
        if (p.listPrice) {
            plan.listPrice = String(p.listPrice);
            if (p.discountPct) plan.discountPct = p.discountPct;
        } else if (listAmount > 0 && amount > 0 && listAmount > amount) {
            plan.listAmount = listAmount;
            plan.listPrice = '₹' + listAmount;
            plan.discountPct = planDiscountPercent(listAmount, amount);
        }
    }

    if (id === 'annual') {
        plan.message = p.message || PREMIUM_ANNUAL_VALUE_MESSAGE;
    } else if (p.message) {
        plan.message = p.message;
    }
    return plan;
}

function normalizePremiumPlans(plans, allowMockFallback) {
    var src = plans && plans.length ? plans : (allowMockFallback ? PREMIUM_PLANS_MOCK : []);
    if (!src.length) return [];
    return enrichAnnualSavings(src.map(normalizePremiumPlan));
}

function usesNativeBillingPricing() {
    return !!getKingBillingPlugin();
}

/** Dev mock INR plans: local web only (localhost / node tests). Never on GitHub Pages or Android. */
function allowsMockPremiumPricing() {
    if (usesNativeBillingPricing()) return false;
    if (typeof location === 'undefined') return true;
    var host = String(location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Store modules call when Play/App Store returns localized products.
 * @param {{ price?: string, trialDays?: number, plans?: Array, source?: string }|null} offer
 */
function setPremiumOfferFromStore(offer) {
    if (!offer || typeof offer !== 'object') {
        storePremiumOffer = null;
        return;
    }
    var plans = offer.plans;
    if ((!plans || !plans.length) && offer.price) {
        plans = [{ id: 'monthly', price: offer.price }];
    }
    if (!plans || !plans.length) {
        storePremiumOffer = null;
        return;
    }
    storePremiumOffer = {
        trialDays: offer.trialDays != null ? Number(offer.trialDays) : PREMIUM_TRIAL_DAYS,
        plans: normalizePremiumPlans(plans, false),
        source: offer.source || 'store',
    };
    premiumOfferLoadState = 'loaded';
}

/**
 * Offer for the Premium modal only.
 * Access must not read this — Entitlement.getAccess() owns “is Premium?”.
 */
function getPremiumOffer() {
    if (storePremiumOffer && storePremiumOffer.plans && storePremiumOffer.plans.length) {
        return {
            trialDays: storePremiumOffer.trialDays || PREMIUM_TRIAL_DAYS,
            plans: storePremiumOffer.plans,
            source: storePremiumOffer.source || 'store',
        };
    }
    if (usesNativeBillingPricing()) {
        if (premiumOfferLoadState === 'unavailable') {
            return {
                trialDays: PREMIUM_TRIAL_DAYS,
                plans: [],
                source: 'unavailable',
            };
        }
        return {
            trialDays: PREMIUM_TRIAL_DAYS,
            plans: [],
            source: 'loading',
        };
    }
    if (allowsMockPremiumPricing()) {
        return {
            trialDays: PREMIUM_TRIAL_DAYS,
            plans: normalizePremiumPlans(PREMIUM_PLANS_MOCK, true),
            source: 'mock',
        };
    }
    return {
        trialDays: PREMIUM_TRIAL_DAYS,
        plans: [],
        source: 'web',
    };
}
