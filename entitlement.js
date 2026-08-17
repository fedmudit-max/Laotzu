/**
 * entitlement.js — Entitlement Layer (read-only)
 *
 * Architecture Status: Approved (v1)
 * Full project rules: see ARCHITECTURE.md
 *
 * Responsibility:
 *   Answer: "Can this user access premium features?"
 *   Nothing more.
 *
 * ---------------------------------------------------------------------------
 * EntitlementSnapshot (contract with Billing / Firebase / Storage)
 * See also ARCHITECTURE.md → "EntitlementSnapshot (contract)"
 *
 * Embedded on journey `state` (not a separate store). JSDoc shape:
 *
 * @typedef {Object} EntitlementSnapshot
 * @property {string} [trialStartedAt]  ISO-8601; '' if unset. Local trial start.
 *                                      Window = trialStartedAt + PREMIUM_TRIAL_DAYS.
 *                                      Written at onboarding / Day 1 (ensureTrialStarted / startPremiumTrial).
 * @property {string} [premiumUntil]    ISO-8601; '' if unset. Paid access end.
 *                                      Written only via updateEntitlementSnapshot.
 * @property {string} [lastVerifiedAt]  ISO-8601. Last successful Play query (client cache).
 *                                      Server verify (Firebase) still replaces this later.
 * @property {''|'local-trial'|'play'|'restore'|'dev'} [source]
 *                                      Who last set paid entitlement. `play` / `restore` required
 *                                      for premiumUntil writes.
 *
 * Entitlement never writes the snapshot. UI never reads raw fields for access.
 * ---------------------------------------------------------------------------
 *
 * Dependencies
 *
 * Reads:
 *   ✓ state EntitlementSnapshot fields (trialStartedAt, premiumUntil; later lastVerifiedAt, source)
 *   ✓ constants (PREMIUM_TRIAL_DAYS, MS_PER_DAY)
 *   ✓ safeGet('onboardingComplete') — paywall / basic tier only
 *
 * Never reads:
 *   ✗ DOM
 *   ✗ Google Play Billing
 *   ✗ Firebase
 *
 * Never writes:
 *   ✗ Storage
 *   ✗ UI
 *   ✗ State
 *
 * Public API:
 *   Entitlement.getAccess()         — { active, expiresAt }  (is this user Premium?)
 *   Entitlement.hasPremiumAccess()  — getAccess().active
 *   Entitlement.isTrialActive()     — wall-clock window only (not exclusive of sub)
 *   Entitlement.isSubscriptionActive()
 *   Entitlement.daysRemaining()
 *   Entitlement.shouldShowPaywall()
 *   Entitlement.isBasicTier()
 *   Entitlement.subscriptionExpiresLabel()
 *
 * Price is not this layer. Store offer lives in Billing (Play localized price).
 *
 * Architectural rules:
 *   - No module outside this file may decide premium access.
 *   - This file has zero side effects: no DOM, no storage writes,
 *     no billing, no Firebase.
 *
 * Product free tier (after trial or if never subscribed):
 *   Daily strong/slip logging and journey score continue without a day limit.
 *   Premium purchase only unlocks UI features via premiumUntil — never resets score.
 *
 * Product rule:
 *   Local trial lasts PREMIUM_TRIAL_DAYS from a valid trialStartedAt.
 *   Trial write/seed is Storage/Journey at onboarding / Calendar Day 1 — not this file.
 *   All trial-tier UI uses Entitlement.hasPremiumAccess() only.
 *
 * Trial calc ownership: Entitlement
 * Purchase / unlock writes: Billing updateEntitlementSnapshot — not this file
 */

var Entitlement = (function () {
    'use strict';

    function snapshot(s) {
        return s || (typeof state !== 'undefined' ? state : null) || {};
    }

    function getTrialEndsAt(s) {
        s = snapshot(s);
        if (!s.trialStartedAt) return null;
        var start = new Date(s.trialStartedAt);
        if (Number.isNaN(start.getTime())) return null;
        return new Date(start.getTime() + PREMIUM_TRIAL_DAYS * MS_PER_DAY);
    }

    function isSubscriptionActive(s) {
        s = snapshot(s);
        if (!s.premiumUntil) return false;
        var until = new Date(s.premiumUntil);
        return !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
    }

    /** True while trialStartedAt + PREMIUM_TRIAL_DAYS is still in the future (wall-clock). */
    function isTrialActive(s) {
        s = snapshot(s);
        var ends = getTrialEndsAt(s);
        if (!ends) return false;
        return ends.getTime() > Date.now();
    }

    /** Single access answer: paid subscription OR open trial window. */
    function hasPremiumAccess(s) {
        return isSubscriptionActive(s) || isTrialActive(s);
    }

    /** ISO end of the current access window, or null if not Premium. */
    function getAccessExpiresAt(s) {
        s = snapshot(s);
        if (isSubscriptionActive(s) && s.premiumUntil) return s.premiumUntil;
        var ends = getTrialEndsAt(s);
        if (ends && ends.getTime() > Date.now()) return ends.toISOString();
        return null;
    }

    /**
     * The only “is Premium?” snapshot the rest of the app should need.
     * Does not include price — Billing owns the store offer.
     */
    function getAccess(s) {
        var active = hasPremiumAccess(s);
        return {
            active: active,
            expiresAt: active ? getAccessExpiresAt(s) : null,
        };
    }

    function daysRemaining(s) {
        s = snapshot(s);
        if (isSubscriptionActive(s)) {
            var until = new Date(s.premiumUntil);
            if (Number.isNaN(until.getTime())) return 0;
            var subMs = until.getTime() - Date.now();
            return subMs <= 0 ? 0 : Math.ceil(subMs / MS_PER_DAY);
        }
        var ends = getTrialEndsAt(s);
        if (!ends) return 0;
        var ms = ends.getTime() - Date.now();
        if (ms <= 0) return 0;
        return Math.ceil(ms / MS_PER_DAY);
    }

    function isBasicTier(s) {
        return safeGet('onboardingComplete') === 'true' && !hasPremiumAccess(s);
    }

    function shouldShowPaywall(s) {
        return isBasicTier(s);
    }

    function subscriptionExpiresLabel(s) {
        s = snapshot(s);
        if (!s.premiumUntil) return '';
        var d = new Date(s.premiumUntil);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return {
        getAccess: getAccess,
        hasPremiumAccess: hasPremiumAccess,
        isTrialActive: isTrialActive,
        isSubscriptionActive: isSubscriptionActive,
        daysRemaining: daysRemaining,
        shouldShowPaywall: shouldShowPaywall,
        isBasicTier: isBasicTier,
        subscriptionExpiresLabel: subscriptionExpiresLabel,
    };
})();
