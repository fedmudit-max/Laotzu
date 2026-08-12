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
 * @property {string} [lastVerifiedAt]  ISO-8601 reserved (S3 server verify).
 * @property {''|'local-trial'|'play'|'restore'|'dev'} [source]
 *                                      Who last set paid entitlement (reserved S2/S3).
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
 *   Entitlement.hasPremiumAccess()  — trial || subscription
 *   Entitlement.isTrialActive()     — calendar window only (not exclusive of sub)
 *   Entitlement.isSubscriptionActive()
 *   Entitlement.daysRemaining()
 *   Entitlement.shouldShowPaywall()
 *   Entitlement.isBasicTier()
 *   Entitlement.subscriptionExpiresLabel()
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

    function getTrialStartDateKey(s) {
        s = snapshot(s);
        if (!s.trialStartedAt) return '';
        var start = new Date(s.trialStartedAt);
        if (Number.isNaN(start.getTime())) return '';
        if (typeof dateKeyFromDate === 'function') return dateKeyFromDate(start);
        return '';
    }

    /** First calendar day the trial is no longer active (start + PREMIUM_TRIAL_DAYS). */
    function getTrialEndDateKey(s) {
        var startKey = getTrialStartDateKey(s);
        if (!startKey || typeof addDaysToKey !== 'function') return '';
        return addDaysToKey(startKey, PREMIUM_TRIAL_DAYS);
    }

    function appTodayKey() {
        return typeof todayKey === 'function' ? todayKey() : '';
    }

    function isSubscriptionActive(s) {
        s = snapshot(s);
        if (!s.premiumUntil) return false;
        var until = new Date(s.premiumUntil);
        return !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
    }

    /**
     * FUTURE AUDIT (known): trial lock uses app calendar (todayKey / New day),
     * not Date.now() + PREMIUM_TRIAL_DAYS. If New day is removed, revert access
     * check to wall-clock. See ARCHITECTURE.md → “FUTURE AUDIT — trial clock”.
     */
    function isTrialActive(s) {
        s = snapshot(s);
        var endKey = getTrialEndDateKey(s);
        var today = appTodayKey();
        if (!endKey || !today) return false;
        return today < endKey;
    }

    /** Single access answer: paid subscription OR open trial window. */
    function hasPremiumAccess(s) {
        return isSubscriptionActive(s) || isTrialActive(s);
    }

    function daysRemaining(s) {
        s = snapshot(s);
        if (isSubscriptionActive(s)) {
            var until = new Date(s.premiumUntil);
            if (Number.isNaN(until.getTime())) return 0;
            var subMs = until.getTime() - Date.now();
            return subMs <= 0 ? 0 : Math.ceil(subMs / MS_PER_DAY);
        }
        var endKey = getTrialEndDateKey(s);
        var today = appTodayKey();
        if (!endKey || !today || today >= endKey) return 0;
        if (typeof daysBetweenKeys !== 'function') return 0;
        return daysBetweenKeys(today, endKey);
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
        hasPremiumAccess: hasPremiumAccess,
        isTrialActive: isTrialActive,
        isSubscriptionActive: isSubscriptionActive,
        daysRemaining: daysRemaining,
        shouldShowPaywall: shouldShowPaywall,
        isBasicTier: isBasicTier,
        subscriptionExpiresLabel: subscriptionExpiresLabel,
    };
})();
