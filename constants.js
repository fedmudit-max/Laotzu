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
/** Minimum free days for trial-tier features (Monthly Grid must stay unlocked this long). */
const PREMIUM_TRIAL_DAYS = 30;
const PREMIUM_CHECKOUT_URL = '';
const PREMIUM_SUBSCRIPTION_DAYS = 365;
/** Feature bullets on paywall + premium panel. */
const PREMIUM_FEATURES = [
    'Weekly timeline — one week at a time',
    'Streak, Journey & Progress milestones',
    'Daily quotes card',
    'Monthly grid & progress graph',
    'Export & import progress',
];

/** Always shown under the feature list — trial users should know backup is Premium after trial. */
const PREMIUM_BACKUP_NOTE =
    'Export and import require Premium after the trial. Download a backup before your free days end if you want a copy of your progress.';
