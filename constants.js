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
const PREMIUM_TRIAL_DAYS = 30;
const PREMIUM_CHECKOUT_URL = '';
const PREMIUM_SUBSCRIPTION_DAYS = 365;
const PREMIUM_FEATURES = [
    'Weekly timeline — one week at a time',
    'Streak, Journey & Progress milestones',
    'Daily quotes card',
    'Monthly grid & progress graph',
    'Export & import backup',
];
