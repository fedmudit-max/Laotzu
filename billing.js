/**
 * billing.js — Premium UI, checkout hooks, and (later) Google Play Billing.
 *
 * Ownership:
 *   - UI: paywall sheet, panel copy, section visibility
 *   - Gate helpers that ask Entitlement then show UI
 *   - Future: purchase / restore / entitlement write path
 *
 * Does not decide premium access — asks Entitlement.hasPremiumAccess().
 */

let premiumPanelOpen = false;

function setPremiumSectionVisible(id, visible) {
    var el = document.getElementById(id);
    if (el) el.hidden = !visible;
}

/** Hide premium-only sections when user has no premium access (post-onboarding).
 *  Read-only: never writes state. Trial seed lives in init / onboarding. */
function applyPremiumTierLayout() {
    var show = !safeGet('onboardingComplete') || Entitlement.hasPremiumAccess();
    setPremiumSectionVisible('weeklyStreakCard', show);
    setPremiumSectionVisible('milestonesCard', show);
    setPremiumSectionVisible('knowledgeCard', show);
    setPremiumSectionVisible('monthPanelCard', show);
    setPremiumSectionVisible('chartPanelCard', show);
    setPremiumSectionVisible('exportBackupBtn', show);
    setPremiumSectionVisible('importBackupBtn', show);
    setPremiumSectionVisible('lastBackupLabel', show);
    if (!show && typeof currentTab === 'number' && currentTab > 0) {
        currentTab = 0;
    }
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
            ? '1 day left on your free trial. Export/import still works now — Premium keeps backup after the trial.'
            : left + ' days left on your free trial. Export/import works now; Premium is required to keep backup after trial.';
        setPremiumBackupNote(noteEl, true);
    } else {
        statusEl.textContent = 'Subscribe to unlock timeline, milestones, quotes, charts, and export/import. Daily logging stays free.';
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
        var days = Entitlement.daysRemaining();
        if (titleEl) titleEl.textContent = '⭐ Premium trial';
        if (teaserEl) {
            teaserEl.textContent = days === 1
                ? '1 day left · full access'
                : days + ' days left · full access';
        }
        if (cardEl) {
            cardEl.classList.add('premium-trial-state');
            cardEl.classList.remove('premium-active-state', 'premium-expired-state');
        }
    } else {
        if (titleEl) titleEl.textContent = '⭐ Premium';
        if (teaserEl) teaserEl.textContent = 'Upgrade to unlock all features';
        if (cardEl) {
            cardEl.classList.add('premium-expired-state');
            cardEl.classList.remove('premium-active-state', 'premium-trial-state');
        }
    }

    applyPremiumTierLayout();
    if (premiumPanelOpen) renderPremiumPanelContent();
}

function renderPremiumSheet() {
    var titleEl = document.getElementById('premiumSheetTitle');
    var subEl = document.getElementById('premiumSheetSubtitle');
    var trialEl = document.getElementById('premiumTrialBadge');
    var listEl = document.getElementById('premiumFeatureList');
    var noteEl = document.getElementById('premiumBackupNote');
    var laterBtn = document.getElementById('premiumLaterBtn');
    var buyBtn = document.querySelector('[data-action="premium-checkout"]');
    var restoreBtn = document.querySelector('[data-action="premium-restore"]');

    if (!titleEl || !listEl) return;

    if (Entitlement.isSubscriptionActive()) {
        titleEl.textContent = 'You\'re Premium';
        subEl.textContent = 'Full access until ' + Entitlement.subscriptionExpiresLabel() + '. Thank you for supporting King.';
        if (trialEl) trialEl.hidden = true;
        if (laterBtn) laterBtn.textContent = 'Close';
        if (buyBtn) buyBtn.hidden = true;
        if (restoreBtn) restoreBtn.hidden = true;
        setPremiumBackupNote(noteEl, false);
    } else if (Entitlement.isTrialActive()) {
        var left = Entitlement.daysRemaining();
        titleEl.textContent = PREMIUM_TRIAL_DAYS + '-day Premium trial';
        subEl.textContent = left === 1
            ? '1 day left of full access. Subscribe to keep Premium — including export/import — after the trial.'
            : left + ' days left of full access. Subscribe to keep Premium — including export/import — after the trial.';
        if (trialEl) {
            trialEl.hidden = false;
            trialEl.textContent = 'Free trial';
        }
        if (laterBtn) laterBtn.textContent = 'Not now';
        if (buyBtn) buyBtn.hidden = false;
        if (restoreBtn) restoreBtn.hidden = false;
        setPremiumBackupNote(noteEl, true);
    } else {
        titleEl.textContent = 'Your free trial has ended';
        subEl.textContent = 'Subscribe to unlock timeline, milestones, quotes, charts, and export/import. Daily logging stays free.';
        if (trialEl) trialEl.hidden = true;
        if (laterBtn) laterBtn.textContent = 'Continue with basic logging';
        if (buyBtn) buyBtn.hidden = false;
        if (restoreBtn) restoreBtn.hidden = false;
        setPremiumBackupNote(noteEl, true);
    }

    fillPremiumFeatureList(listEl);

    var priceNote = document.getElementById('premiumPriceNote');
    if (priceNote) {
        priceNote.textContent = 'after ' + PREMIUM_TRIAL_DAYS + '-day trial';
    }
}

function openPremiumSheet() {
    var overlay = document.getElementById('premiumOverlay');
    if (!overlay) return;
    renderPremiumSheet();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
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
    if (Entitlement.hasPremiumAccess()) return true;
    openPremiumSheet();
    return false;
}

/**
 * Single write path for paid EntitlementSnapshot fields (Billing / later Firebase).
 * Partial updates only; see ARCHITECTURE.md → EntitlementSnapshot.
 *
 * @param {Partial<EntitlementSnapshot>} fields
 *   v1 accepts: premiumUntil
 *   reserved (ignored until implemented): lastVerifiedAt, source
 *   never write trialStartedAt here — local trial seed owns that field
 */
function updateEntitlementSnapshot(fields) {
    if (!fields || typeof fields !== 'object') return;
    if (fields.premiumUntil !== undefined) state.premiumUntil = fields.premiumUntil;
    // S2/S3: lastVerifiedAt, source
    saveToStorage(state);
}

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

function handlePremiumAction(action) {
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
