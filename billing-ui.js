/**
 * billing-ui.js — Premium panel, paywall sheet, tier gating, checkout/restore UX.
 *
 * Symptom → function:
 *   Locked feature tap → requirePremium()
 *   Paywall wrong / stale → openPremiumSheet(), renderPremiumPlans()
 *   Sections locked after trial → applyPremiumTierLayout()
 *
 * Reads getPremiumOffer(); checkout/restore call billing-store-play.
 */

let premiumPanelOpen = false;
let selectedPremiumPlanId = 'annual';
let lastPremiumModalOpts = null;

function refreshPremiumOfferUiIfVisible() {
    var overlay = document.getElementById('premiumOverlay');
    if (overlay && overlay.classList.contains('active')) {
        showPremiumModal({});
    }
    if (premiumPanelOpen) renderPremiumPanelContent();
}

function setPremiumSectionVisible(id, visible) {
    var el = document.getElementById(id);
    if (el) el.hidden = !visible;
}

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
        statusEl.textContent = 'Premium is active. Billing and renewal are managed in Google Play.';
        setPremiumBackupNote(noteEl, false);
    } else if (Entitlement.isTrialActive()) {
        var left = Entitlement.daysRemaining();
        statusEl.textContent = left === 1
            ? '1 free day left on your trial.'
            : left + ' free days left on your trial.';
        setPremiumBackupNote(noteEl, true);
    } else {
        statusEl.textContent = 'Free trial ended. Daily logging stays free forever. Subscribe to unlock timeline, milestones, Monthly Mirror, Progress Graph, and export/import. Your score is not affected.';
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
        if (teaserEl) teaserEl.textContent = 'Active · Google Play';
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
    var planInput = opts.plans && opts.plans.length ? opts.plans : base.plans;
    var offer = {
        trialDays: opts.trialDays != null ? opts.trialDays : base.trialDays,
        plans: normalizePremiumPlans(planInput, allowsMockPremiumPricing()),
        source: opts.source || base.source,
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
        subEl.textContent = 'Full access is on. Google Play manages your subscription; this app only caches access for offline use.';
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
    syncPremiumCheckoutState(offer);
}

function syncPremiumCheckoutState(offer) {
    var buyBtn = document.querySelector('[data-action="premium-checkout"]');
    if (!buyBtn || Entitlement.isSubscriptionActive()) return;
    offer = offer || getPremiumOffer();
    var blocked = !offer.plans || !offer.plans.length || offer.source === 'loading';
    buyBtn.disabled = blocked || playCheckoutInFlight;
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
    if (!plans.length) {
        var statusCopy = offer.source === 'loading'
            ? PREMIUM_PRICE_LOADING
            : (!usesNativeBillingPricing() ? PREMIUM_PRICE_WEB_HINT : PREMIUM_PRICE_UNAVAILABLE);
        var note = Entitlement.isTrialActive()
            ? '<div class="premium-price-note">after ' + offer.trialDays + '-day trial</div>'
            : '';
        block.innerHTML = '<div class="premium-price-unavailable">' + statusCopy + '</div>' + note;
        syncPremiumCheckoutState(offer);
        return;
    }
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
    syncPremiumCheckoutState(offer);
}

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
        source: opts.source || offer.source,
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
    loadPlayOffers();
}

function closePremiumSheet() {
    var overlay = document.getElementById('premiumOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

function requirePremium() {
    if (safeGet('onboardingComplete') !== 'true') return false;
    if (Entitlement.getAccess().active) return true;
    openPremiumSheet();
    return false;
}

function startPremiumCheckout() {
    var plugin = getKingBillingPlugin();
    if (!plugin) {
        showToast(0, 'Subscribe uses Google Play on the Android app.');
        return;
    }
    var offer = getPremiumOffer();
    if (!offer.plans || !offer.plans.length) {
        if (offer.source === 'loading') {
            showToast(0, 'Price is still loading from Google Play.');
        } else {
            showToast(0, 'Price unavailable from Google Play. Try again later.');
        }
        return;
    }
    var spec = playOfferSpecForPlan(selectedPremiumPlanId);
    if (!spec || !spec.productId) {
        showToast(0, 'Pick a Premium plan first.');
        return;
    }
    if (playCheckoutInFlight) return;
    playCheckoutInFlight = true;
    setCheckoutBusy(true);
    callKingBilling('purchase', spec)
        .then(function (result) {
            if (result && result.canceled) return;
            if (result && result.ok && findActivePlaySubscription(result.purchases)) {
                applyPlayPurchaseQuery(result, 'play');
                onPremiumActivated();
                return;
            }
            if (result && result.responseCode === 7 /* ITEM_ALREADY_OWNED */) {
                return restoreAfterAlreadyOwned();
            }
            if (result && result.message === 'no-matching-offer') {
                showToast(0, 'No matching Play base plan for this product. Set basePlanId in PREMIUM_PLAY_PRODUCTS after creating it in Play Console.');
                return;
            }
            if (!result || !result.ok) {
                showToast(0, 'Couldn’t start Google Play checkout. Use a Play testing build and a network connection.');
            }
        })
        .catch(function () {
            showToast(0, 'Couldn’t start Google Play checkout. Use a Play testing build and a network connection.');
        })
        .then(function () {
            playCheckoutInFlight = false;
            setCheckoutBusy(false);
        });
}

function setCheckoutBusy(busy) {
    var btn = document.querySelector('[data-action="premium-checkout"]');
    if (!btn) return;
    if (!busy) {
        syncPremiumCheckoutState(lastPremiumModalOpts || getPremiumOffer());
        btn.textContent = 'Subscribe to Premium';
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Opening Google Play…';
}

function restorePremiumAccess() {
    var plugin = getKingBillingPlugin();
    if (!plugin) {
        showToast(0, 'Restore uses Google Play on the Android app.');
        return;
    }
    if (playRestoreInFlight) return;
    playRestoreInFlight = true;
    setRestoreBusy(true);
    callKingBilling('queryPurchases', {})
        .then(function (result) {
            if (!result || !result.ok) {
                showToast(0, 'Couldn’t reach Google Play. Try again with Play installed and a network connection.');
                return;
            }
            var hadPaid = Entitlement.isSubscriptionActive();
            var next = applyPlayPurchaseQuery(result, 'restore');
            if (next.active) {
                unlockPremiumFeatures();
                closePremiumSheet();
                showToast(0, hadPaid ? 'Premium is active.' : 'Premium restored 👑');
                return;
            }
            unlockPremiumFeatures();
            showToast(0, 'No active Premium subscription on this Google account.');
        })
        .catch(function () {
            showToast(0, 'Couldn’t reach Google Play. Try again with Play installed and a network connection.');
        })
        .then(function () {
            playRestoreInFlight = false;
            setRestoreBusy(false);
        });
}

function setRestoreBusy(busy) {
    var btn = document.querySelector('[data-action="premium-restore"]');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? 'Checking Google Play…' : 'Restore purchase';
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
    var panelToggle = document.getElementById('premiumPanelToggle');
    if (panelToggle) {
        panelToggle.addEventListener('click', function (e) {
            e.preventDefault();
            togglePremiumPanel();
        });
    }
    bindPlayPurchasesListener();
    loadPlayOffers();
    refreshPlayPurchasesSilent();
}
