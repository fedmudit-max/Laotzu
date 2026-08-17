/**
 * billing.js — Premium UI, checkout hooks, store offer, and (later) Google Play Billing.
 *
 * Ownership:
 *   - UI: paywall sheet, panel copy, section visibility
 *   - Gate helpers that ask Entitlement.getAccess() then show UI
 *   - Store offer (localized price) — never mixed into Entitlement
 *   - Future: purchase / restore / entitlement write path
 *
 * Does not decide premium access — asks Entitlement.getAccess().
 */

let premiumPanelOpen = false;
let selectedPremiumPlanId = 'annual';
let lastPremiumModalOpts = null;
let storePremiumOffer = null;

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

function normalizePremiumPlan(p) {
    p = p || {};
    var id = p.id || p.period || 'monthly';
    var listAmount = p.listAmount != null ? Number(p.listAmount) : 0;
    var amount = p.amount != null ? Number(p.amount) : 0;
    var period = p.period || (id === 'annual' ? 'year' : 'month');
    var plan = { id: id, period: period };

    if (amount > 0) {
        plan.amount = amount;
        plan.price = '₹' + amount + planPeriodSuffix(period, id);
    } else {
        plan.price = p.price ? String(p.price) : '';
    }

    if (listAmount > 0 && amount > 0 && listAmount > amount) {
        plan.listAmount = listAmount;
        plan.listPrice = '₹' + listAmount;
        plan.discountPct = planDiscountPercent(listAmount, amount);
    }

    if (id === 'annual') {
        plan.message = p.message || PREMIUM_ANNUAL_VALUE_MESSAGE;
    } else if (p.message) {
        plan.message = p.message;
    }
    return plan;
}

function normalizePremiumPlans(plans) {
    var src = plans && plans.length ? plans : PREMIUM_PLANS_MOCK;
    return src.map(normalizePremiumPlan);
}

/**
 * Billing will call this when Play/App Store returns localized products.
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
        plans: normalizePremiumPlans(plans),
        source: offer.source || 'store',
    };
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
    return {
        trialDays: PREMIUM_TRIAL_DAYS,
        plans: normalizePremiumPlans(PREMIUM_PLANS_MOCK),
        source: 'mock',
    };
}

function setPremiumSectionVisible(id, visible) {
    var el = document.getElementById(id);
    if (el) el.hidden = !visible;
}

/** Show premium sections always; lock interaction when trial/sub is inactive.
 *  Free forever: day logging, current/best journey score, chances, urge, How King Works, reset.
 *  Premium (visible but locked after trial): weekly timeline, milestones, knowledge,
 *    month/chart, export/import.
 */
function applyPremiumTierLayout() {
    var access = Entitlement.getAccess();
    var unlocked = !safeGet('onboardingComplete') || access.active;
    var gatedIds = [
        'weeklyStreakCard',
        'milestonesCard',
        'knowledgeCard',
        'monthPanelCard',
        'chartPanelCard',
        'premiumBackupGate',
        'remindPanelCard',
    ];
    for (var i = 0; i < gatedIds.length; i++) {
        setPremiumGated(gatedIds[i], !unlocked);
    }
    setPremiumSectionVisible('primaryStack', true);
    setPremiumSectionVisible('learnJourneyCard', true);
    setPremiumSectionVisible('premiumPanelCard', true);
    setPremiumSectionVisible('backupResetCard', true);
    setPremiumSectionVisible('exportBackupBtn', true);
    setPremiumSectionVisible('importBackupBtn', true);
    setPremiumSectionVisible('lastBackupLabel', true);
    if (typeof applyReminderAlarms === 'function') {
        applyReminderAlarms();
    }
}

function setPremiumGated(id, locked) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    el.classList.add('premium-gated');
    el.classList.toggle('is-locked', !!locked);
    syncPremiumLockVeil(el, locked);
}

function syncPremiumLockVeil(el, locked) {
    var veil = null;
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
        if (kids[i].classList && kids[i].classList.contains('premium-lock-veil')) {
            veil = kids[i];
            break;
        }
    }
    if (!locked) {
        if (veil) veil.hidden = true;
        return;
    }
    if (!veil) {
        veil = document.createElement('button');
        veil.type = 'button';
        veil.className = 'premium-lock-veil';
        veil.setAttribute('aria-label', 'Unlock with Premium');
        veil.innerHTML = '<span class="premium-lock-veil-label">🔒 Unlock with Premium</span>';
        veil.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            requirePremium();
        });
        el.appendChild(veil);
    }
    veil.hidden = false;
}

function togglePremiumPanel() {
    premiumPanelOpen = !premiumPanelOpen;
    syncPremiumPanel();
}

function syncPremiumPanel() {
    var body = document.getElementById('premiumPanelBody');
    var chevron = document.getElementById('premiumPanelChevron');
    var toggle = document.getElementById('premiumPanelToggle');
    if (body) body.classList.toggle('is-open', premiumPanelOpen);
    if (chevron) chevron.classList.toggle('open', premiumPanelOpen);
    if (toggle) toggle.setAttribute('aria-expanded', premiumPanelOpen ? 'true' : 'false');
    if (premiumPanelOpen) renderPremiumPanelContent();
}

function fillPremiumFeatureList(listEl) {
    if (!listEl) return;
    listEl.innerHTML = PREMIUM_FEATURES.map(function (f) {
        return '<li>' + f + '</li>';
    }).join('');
}

function setPremiumBackupNote(el, visible) {
    if (!el) return;
    if (!visible) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = PREMIUM_BACKUP_NOTE;
}

function renderPremiumPanelContent() {
    var statusEl = document.getElementById('premiumPanelStatus');
    var listEl = document.getElementById('premiumPanelFeatures');
    var noteEl = document.getElementById('premiumPanelBackupNote');
    if (!statusEl || !listEl) return;

    if (Entitlement.isSubscriptionActive()) {
        statusEl.textContent = 'Premium active until ' + Entitlement.subscriptionExpiresLabel() + '. Thank you for supporting King.';
        setPremiumBackupNote(noteEl, false);
    } else if (Entitlement.isTrialActive()) {
        var left = Entitlement.daysRemaining();
        statusEl.textContent = left === 1
            ? '1 free day left on your trial.'
            : left + ' free days left on your trial.';
        setPremiumBackupNote(noteEl, true);
    } else {
        statusEl.textContent = 'Free trial ended. Daily logging stays free forever. Subscribe to unlock timeline, milestones, Monthly grid, Progress Graph, and export/import. Your score is not affected.';
        setPremiumBackupNote(noteEl, true);
    }

    fillPremiumFeatureList(listEl);
}

function renderPremiumStatus() {
    var titleEl = document.getElementById('premiumPanelTitle');
    var teaserEl = document.getElementById('premiumPanelTeaser');
    var cardEl = document.getElementById('premiumPanelCard');

    if (Entitlement.isSubscriptionActive()) {
        if (titleEl) titleEl.textContent = '👑 Premium';
        if (teaserEl) teaserEl.textContent = 'Active · renews ' + Entitlement.subscriptionExpiresLabel();
        if (cardEl) {
            cardEl.classList.add('premium-active-state');
            cardEl.classList.remove('premium-trial-state', 'premium-expired-state');
        }
    } else if (Entitlement.isTrialActive()) {
        if (titleEl) titleEl.textContent = '⭐ Premium trial';
        if (teaserEl) teaserEl.textContent = '';
        if (cardEl) {
            cardEl.classList.add('premium-trial-state');
            cardEl.classList.remove('premium-active-state', 'premium-expired-state');
        }
    } else {
        if (titleEl) titleEl.textContent = '⭐ Premium';
        if (teaserEl) teaserEl.textContent = 'Logging free · unlock all features';
        if (cardEl) {
            cardEl.classList.add('premium-expired-state');
            cardEl.classList.remove('premium-active-state', 'premium-trial-state');
        }
    }

    applyPremiumTierLayout();
    if (premiumPanelOpen) renderPremiumPanelContent();
}

function renderPremiumSheet(opts) {
    opts = opts || {};
    var base = getPremiumOffer();
    var offer = {
        trialDays: opts.trialDays != null ? opts.trialDays : base.trialDays,
        plans: normalizePremiumPlans(opts.plans && opts.plans.length ? opts.plans : base.plans),
    };
    lastPremiumModalOpts = offer;

    var titleEl = document.getElementById('premiumSheetTitle');
    var subEl = document.getElementById('premiumSheetSubtitle');
    var trialEl = document.getElementById('premiumTrialBadge');
    var laterBtn = document.getElementById('premiumLaterBtn');
    var buyBtn = document.querySelector('[data-action="premium-checkout"]');
    var restoreBtn = document.querySelector('[data-action="premium-restore"]');

    if (!titleEl) return;

    if (Entitlement.isSubscriptionActive()) {
        titleEl.textContent = 'You\'re Premium';
        subEl.textContent = 'Full access until ' + Entitlement.subscriptionExpiresLabel() + '. Thank you for supporting King.';
        if (trialEl) trialEl.hidden = true;
        if (laterBtn) laterBtn.textContent = 'Close';
        if (buyBtn) buyBtn.hidden = true;
        if (restoreBtn) restoreBtn.hidden = true;
    } else if (Entitlement.isTrialActive()) {
        titleEl.textContent = offer.trialDays + '-day Premium trial';
        if (subEl) subEl.textContent = '';
        if (trialEl) {
            trialEl.hidden = false;
            trialEl.textContent = 'Free trial';
        }
        if (laterBtn) laterBtn.textContent = 'Not now';
        if (buyBtn) buyBtn.hidden = false;
        if (restoreBtn) restoreBtn.hidden = false;
    } else {
        titleEl.textContent = 'Your free trial has ended';
        subEl.textContent = 'Keep logging strong days and slips for free — your Journey score is saved. Subscribe whenever you want full features; buying Premium does not reset your progress.';
        if (trialEl) trialEl.hidden = true;
        if (laterBtn) laterBtn.textContent = 'Continue with basic logging';
        if (buyBtn) buyBtn.hidden = false;
        if (restoreBtn) restoreBtn.hidden = false;
    }

    renderPremiumPlans(offer);
}

function planLabel(id) {
    return id === 'annual' ? 'Annual' : 'Monthly';
}

function selectPremiumPlan(planId) {
    selectedPremiumPlanId = planId || 'annual';
    renderPremiumPlans(lastPremiumModalOpts || getPremiumOffer());
}

function renderPremiumPlans(offer) {
    offer = offer || getPremiumOffer();
    var block = document.getElementById('premiumPriceBlock');
    var subscribed = Entitlement.isSubscriptionActive();
    if (!block) return;

    if (subscribed) {
        block.hidden = true;
        block.innerHTML = '';
        return;
    }

    block.hidden = false;
    var plans = offer.plans || [];
    var selected = selectedPremiumPlanId;
    var hasSelected = plans.some(function (p) { return p.id === selected; });
    if (!hasSelected) {
        selectedPremiumPlanId = (plans.some(function (p) { return p.id === 'annual'; }) ? 'annual' : (plans[0] && plans[0].id) || 'monthly');
        selected = selectedPremiumPlanId;
    }

    var note = Entitlement.isTrialActive()
        ? '<div class="premium-price-note">after ' + offer.trialDays + '-day trial</div>'
        : '';

    block.innerHTML = plans.map(function (p) {
        var cls = 'premium-plan' + (p.id === 'annual' ? ' is-featured' : '') + (p.id === selected ? ' is-selected' : '');
        var msg = p.message ? '<div class="premium-plan-message">' + p.message + '</div>' : '';
        var list = p.listPrice
            ? '<span class="premium-plan-list">' + p.listPrice + '</span>'
            : '';
        var off = p.discountPct
            ? '<span class="premium-plan-off">' + p.discountPct + '% off</span>'
            : '';
        return '<button type="button" class="' + cls + '" data-action="premium-plan-' + p.id + '">' +
            '<div class="premium-plan-label">' + planLabel(p.id) + '</div>' +
            '<div class="premium-plan-price">' +
                list +
                '<span class="premium-plan-sale">' + (p.price || '') + '</span>' +
                off +
            '</div>' +
            msg +
            '</button>';
    }).join('') + note;
}

/**
 * Premium modal UI. Receives localized plans; does not decide access or fetch the store.
 * @param {{ trialDays?: number, plans?: Array, price?: string }} opts
 */
function showPremiumModal(opts) {
    var overlay = document.getElementById('premiumOverlay');
    if (!overlay) return;
    var offer = getPremiumOffer();
    opts = opts || {};
    var plans = opts.plans;
    if ((!plans || !plans.length) && opts.price) {
        plans = [{ id: 'monthly', price: opts.price }];
    }
    renderPremiumSheet({
        trialDays: opts.trialDays != null ? opts.trialDays : offer.trialDays,
        plans: plans && plans.length ? plans : offer.plans,
    });
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
}

function openPremiumSheet() {
    var offer = getPremiumOffer();
    showPremiumModal({
        trialDays: offer.trialDays,
        plans: offer.plans,
    });
}

function closePremiumSheet() {
    var overlay = document.getElementById('premiumOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

/** Gate: ask Entitlement, show paywall if denied. Never during / right before onboarding is done without access. */
function requirePremium() {
    if (safeGet('onboardingComplete') !== 'true') return false;
    if (Entitlement.getAccess().active) return true;
    openPremiumSheet();
    return false;
}

/**
 * Single write path for paid EntitlementSnapshot fields (Billing / later Firebase).
 * Partial updates only; see ARCHITECTURE.md → EntitlementSnapshot.
 *
 * Journey score is never touched here:
 *   score, streaks, dailyLog, calendarDay, attempt, etc. stay as-is when buying Premium.
 *
 * @param {Partial<EntitlementSnapshot>} fields
 *   v1 accepts: premiumUntil
 *   reserved (ignored until implemented): lastVerifiedAt, source
 *   never write trialStartedAt here — local trial seed owns that field
 *   never write journey/logging fields — journey layer owns those
 */
function updateEntitlementSnapshot(fields) {
    if (!fields || typeof fields !== 'object') return;
    if (fields.premiumUntil !== undefined) state.premiumUntil = fields.premiumUntil;
    // S2/S3: lastVerifiedAt, source — still only entitlement keys, not score
    saveToStorage(state);
}

/** Unlock paid features by writing premiumUntil only (score / log unchanged). */
function activatePremiumSubscription(days) {
    days = days || PREMIUM_SUBSCRIPTION_DAYS;
    updateEntitlementSnapshot({
        premiumUntil: new Date(Date.now() + days * MS_PER_DAY).toISOString(),
    });
}

function handlePremiumReturnFromUrl() {
    try {
        var params = new URLSearchParams(window.location.search);
        if (params.get('premium') !== 'success') return false;
        activatePremiumSubscription(PREMIUM_SUBSCRIPTION_DAYS);
        var clean = window.location.pathname + (window.location.hash || '');
        window.history.replaceState(null, '', clean);
        return true;
    } catch {
        return false;
    }
}

function startPremiumCheckout() {
    if (!PREMIUM_CHECKOUT_URL) {
        showToast(0, 'Checkout comes with Google Play Billing (Sprint 2). Use Restore after a test unlock if needed.');
        return;
    }
    window.open(PREMIUM_CHECKOUT_URL, '_blank', 'noopener,noreferrer');
}

function handlePremiumAction(action) {
    if (action.indexOf('premium-plan-') === 0) {
        selectPremiumPlan(action.slice('premium-plan-'.length));
        return true;
    }
    var actions = {
        'open-premium': openPremiumSheet,
        'close-premium': closePremiumSheet,
        'premium-checkout': startPremiumCheckout,
        'premium-restore': restorePremiumAccess,
        'premium-later': closePremiumSheet,
    };
    if (!actions[action]) return false;
    actions[action]();
    return true;
}

function restorePremiumAccess() {
    if (Entitlement.isSubscriptionActive()) {
        unlockPremiumFeatures();
        showToast(0, 'Premium is already active.');
        closePremiumSheet();
        return;
    }
    showToast(0, 'No active subscription found. Restore will use Google Play in a future release.');
}

function unlockPremiumFeatures() {
    if (typeof deferredHeavyRendered !== 'undefined') deferredHeavyRendered = false;
    applyPremiumTierLayout();
    renderPremiumStatus();
    renderAll();
    if (typeof renderDeferredHeavy === 'function') renderDeferredHeavy();
}

function onPremiumActivated() {
    closePremiumSheet();
    unlockPremiumFeatures();
    showToast(0, 'Welcome to Premium 👑');
}

function initPremiumStartup() {
    if (handlePremiumReturnFromUrl()) onPremiumActivated();

    var panelToggle = document.getElementById('premiumPanelToggle');
    if (panelToggle) {
        panelToggle.addEventListener('click', function (e) {
            e.preventDefault();
            togglePremiumPanel();
        });
    }
}
