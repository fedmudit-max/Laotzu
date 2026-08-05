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
 * Dependencies
 *
 * Reads:
 *   ✓ state (trialStartedAt, premiumUntil)
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
 *   Entitlement.hasPremiumAccess()
 *   Entitlement.isTrialActive()
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
 * Trial calc ownership: Entitlement
 * Purchase / unlock writes: Billing (write path) — not this file
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

    function isTrialActive(s) {
        s = snapshot(s);
        if (isSubscriptionActive(s)) return false;
        var ends = getTrialEndsAt(s);
        if (!ends) return false;
        return ends.getTime() > Date.now();
    }

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
        hasPremiumAccess: hasPremiumAccess,
        isTrialActive: isTrialActive,
        isSubscriptionActive: isSubscriptionActive,
        daysRemaining: daysRemaining,
        shouldShowPaywall: shouldShowPaywall,
        isBasicTier: isBasicTier,
        subscriptionExpiresLabel: subscriptionExpiresLabel,
    };
})();
