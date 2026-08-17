/**
 * constants.js — App keys, limits, and feature flags.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const STORAGE_KEY = 'habitTracker_v3';
const LAST_BACKUP_KEY = 'kingLastBackupAt';
const URGE_DURATION_SECS = 5 * 60;
const TOTAL_SLIDES = 5;
const BACKUP_FORMAT = 'king-backup';
const BACKUP_VERSION = 1;
/** Local free trial length. Access window is trialStartedAt + this many days. */
const PREMIUM_TRIAL_DAYS = 30;
const PREMIUM_CHECKOUT_URL = '';
const PREMIUM_SUBSCRIPTION_DAYS = 365;
const PREMIUM_ANNUAL_VALUE_MESSAGE = 'Best value for the long journey';
/** Dev mock until Play/App Store supplies localized plan prices. Display-only. */
const PREMIUM_PLANS_MOCK = [
    { id: 'monthly', listAmount: 199, amount: 149, period: 'month' },
    { id: 'annual', listAmount: 1999, amount: 1499, period: 'year', message: PREMIUM_ANNUAL_VALUE_MESSAGE },
];
/** Feature bullets on paywall + premium panel. */
const PREMIUM_FEATURES = [
    'Weekly timeline — one week at a time',
    'Streak, Journey & Progress milestones',
    'Daily knowledge cards',
    'Monthly grid',
    'Progress Graph',
    'Export & import progress',
    'Daily reminder to log your day',
];

/** Shown under the feature list on the premium panel. */
const PREMIUM_BACKUP_NOTE =
    'Daily logging stays free forever. Above features need Premium after the trial. Buying Premium never resets your Journey score.';
