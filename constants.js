/**
 * constants.js — App keys, limits, and feature flags.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const STORAGE_KEY = 'habitTracker_v3';
const LAST_BACKUP_KEY = 'kingLastBackupAt';
const URGE_DURATION_SECS = 30;
const BREATH_IN_SECS = 4;
const BREATH_OUT_SECS = 4;
/** Peak gain for urge-surf inhale/exhale breath cue (Web Audio). */
const BREATH_SOUND_GAIN = 0.75;
const BACKUP_FORMAT = 'king-backup';
const BACKUP_VERSION = 1;
/** When false, every feature stays unlocked — no trial countdown or paywall. */
const PREMIUM_GATING_ENABLED = false;

/** Local free trial length. Access window is trialStartedAt + this many days. */
const PREMIUM_TRIAL_DAYS = 30;
/** Last N trial days: full Premium feature list + stronger subscribe CTA in the panel. */
const PREMIUM_TRIAL_COUNTDOWN_DAYS = 7;
/**
 * Play Console subscriptions for com.kingtracker.app.
 *
 * Create in Console first, then copy IDs here if a product has more than one base plan.
 * Intended:
 *   Monthly → product ID king_premium_monthly, base plan ID monthly
 *   Annual  → product ID king_premium_annual,  base plan ID annual
 *
 * Do not put invented basePlanId / offerId values in the app until those
 * objects exist in Play Console. Empty basePlanId + empty offerId = base plan
 * only, disambiguated by billing period (P1M / P1Y).
 */
const PREMIUM_PLAY_PRODUCTS = [
    {
        id: 'monthly',
        productId: 'king_premium_monthly',
        period: 'month',
        basePlanId: '',
        offerId: '',
    },
    {
        id: 'annual',
        productId: 'king_premium_annual',
        period: 'year',
        basePlanId: '',
        offerId: '',
    },
];
const PREMIUM_PLAY_PRODUCT_IDS = PREMIUM_PLAY_PRODUCTS.map(function (p) { return p.productId; });
/**
 * Local offline cache only: after Play *on this device* last confirmed PURCHASED,
 * keep Premium unlocked this many days without another query.
 * Not the subscription term, not extra paid days, not server-verified validity.
 * Firebase / Play Developer API later becomes the authority.
 */
const PREMIUM_PLAY_CACHE_DAYS = 3;
const PREMIUM_ANNUAL_VALUE_MESSAGE = 'Best value for the long journey';
/** Display-only annual strikethrough / “was” price for % off vs annual sale. */
const PREMIUM_ANNUAL_COMPARE_AMOUNT = 2299;
/** Dev mock until Play/App Store supplies localized plan prices. Web / harness only — not shown on Android billing builds. */
const PREMIUM_PLANS_MOCK = [
    { id: 'monthly', listAmount: 199, amount: 149, period: 'month' },
    { id: 'annual', amount: 1499, period: 'year', message: PREMIUM_ANNUAL_VALUE_MESSAGE },
];
/** Paywall copy when Play pricing cannot be loaded on Android. */
const PREMIUM_PRICE_UNAVAILABLE = 'Price unavailable';
const PREMIUM_PRICE_LOADING = 'Loading price…';
/** Web / PWA — no store billing; avoid showing dev mock INR prices. */
const PREMIUM_PRICE_WEB_HINT = 'Subscribe in the King Android app — Google Play shows your local price.';
/** Feature bullets on paywall + premium panel. */
const PREMIUM_FEATURES = [
    'Weekly timeline — one week at a time',
    'Streak, Journey & Progress milestones',
    'Daily knowledge cards',
    'Monthly Mirror',
    'Best Performances',
    'Progress Graph',
    'Daily reminder to log your day',
    'Features in future',
];

/** Shown under the feature list on the premium panel (countdown + expired). */
const PREMIUM_BACKUP_NOTE =
    'Daily logging stays free forever. Above features need Premium after the trial. Buying Premium never resets your Journey score.';

/** Optional daily reflection state saved on each logged wall date. */
const DAY_LOG_STATES = {
    rest: { label: 'Rest', emoji: '😴' },
    busy: { label: 'Busy', emoji: '⚡' },
    done: { label: 'Done', emoji: '✓' },
};
const DAY_ENTRY_NOTE_MAX = 280;
/** Premium panel — trial phase 1 (early days, no feature list). */
const PREMIUM_TRIAL_EARLY_NOTE =
    'Strong and slip logging stay free forever. Timeline, milestones, mirror, graph, backup, and reminders are included during your trial.';
