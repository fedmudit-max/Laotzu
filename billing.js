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

/** Show premium sections always; lock interaction when trial/sub is inactive.
 *  Free forever: day logging, current/best journey score, chances, urge, How King Works, reset.
 *  Premium (visible but locked after trial): weekly timeline, milestones, knowledge,
 *    month/chart, export/import.
 */
function applyPremiumTierLayout() {
    var unlocked = !safeGet('onboardingComplete') || Entitlement.hasPremiumAccess();
    var gatedIds = [
        'weeklyStreakCard',
        'milestonesCard',
        'knowledgeCard',
        'monthPanelCard',
        'chartPanelCard',
        'premiumBackupGate',
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

function renderPremiumSheet() {
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
        titleEl.textContent = PREMIUM_TRIAL_DAYS + '-day Premium trial';
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
