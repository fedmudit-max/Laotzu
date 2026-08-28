/**
 * logic-streak-records.js — Streak tab Records panel (reveal + row display).
 *
 * Rules (single source of truth):
 *   - Records label + 50 Days Streak: revealed at Day 30 streak, then permanent.
 *   - 100 Days Streak row: revealed on first 50-day streak, then permanent.
 *   - Best Streak: always visible from Day 1 (outside Records block).
 *
 * ui-main.js only calls getStreakRecordsPanelState() and applies it to the DOM.
 */

var STREAK_RECORDS_UNLOCK_STREAK = 30;
var STREAK_COUNT_ROW_50 = 50;
var STREAK_COUNT_ROW_100 = 100;

// ════════════════════════════════════════════════════════
//  UNLOCK FLAGS (persisted on state)
// ════════════════════════════════════════════════════════

function unlockStreakRecordsSection(s) {
    s = s || state;
    s.streak50CountUnlocked = true;
}

function unlockStreak100CountRow(s) {
    s = s || state;
    s.streak100CountUnlocked = true;
}

/** Back-compat aliases — same flags, clearer call sites in older code. */
function unlockStreak50CountMilestone(s) {
    unlockStreakRecordsSection(s);
}

function unlockStreak100CountMilestone(s) {
    unlockStreak100CountRow(s);
}

/**
 * Reconcile unlock flags from lifetime stats (load, merge, render).
 * Does not increment day50/day100 counts — only visibility flags.
 */
function syncStreakRecordsUnlockFlags(s) {
    s = s || state;
    if (!s.streak50CountUnlocked) {
        if ((s.day50Count || 0) > 0 || (s.day100Count || 0) > 0) {
            unlockStreakRecordsSection(s);
        } else if ((s.longestStreak || 0) >= STREAK_RECORDS_UNLOCK_STREAK) {
            unlockStreakRecordsSection(s);
        }
    }
    if (!s.streak100CountUnlocked) {
        if ((s.day50Count || 0) > 0 || (s.day100Count || 0) > 0) {
            unlockStreak100CountRow(s);
        }
    }
}

function isStreakRecordsSectionRevealed(s) {
    s = s || state;
    syncStreakRecordsUnlockFlags(s);
    return !!s.streak50CountUnlocked;
}

function isStreak50CountMilestoneRevealed(s) {
    return isStreakRecordsSectionRevealed(s);
}

function isStreak100CountRowRevealed(s) {
    s = s || state;
    syncStreakRecordsUnlockFlags(s);
    return !!s.streak100CountUnlocked;
}

function isStreak100CountMilestoneRevealed(s) {
    return isStreak100CountRowRevealed(s);
}

/** Called from logic-logging after streak is updated on a strong day. */
function applyStreakRecordsMilestonesOnStrongDay(s) {
    s = s || state;
    var streak = s.currentStreak || 0;
    if (streak === STREAK_RECORDS_UNLOCK_STREAK) {
        unlockStreakRecordsSection(s);
    }
    if (streak === STREAK_COUNT_ROW_50) {
        s.day50Count = (s.day50Count || 0) + 1;
        unlockStreak100CountRow(s);
    }
    if (streak === STREAK_COUNT_ROW_100) {
        s.day100Count = (s.day100Count || 0) + 1;
    }
}

// ════════════════════════════════════════════════════════
//  ROW DISPLAY (mirrors journey milestone visual states)
// ════════════════════════════════════════════════════════

/**
 * @returns {{ status: string, className: string | null }}
 *   className null = default grey; achieved-glow = live + green bg;
 *   achieved-earned = prior count green labels only.
 */
function getStreakCountRowDisplay(isActive, count, freeze) {
    var n = count > 0 ? count : 0;
    var previouslyAchieved = n > 0 && !isActive;
    if (isActive) {
        if (freeze) {
            return {
                className: 'achieved streak-ended',
                status: n > 0 ? String(n) : 'Ended',
            };
        }
        return {
            className: 'achieved-glow',
            status: n > 0 ? String(n) : '✓',
        };
    }
    if (previouslyAchieved) {
        return { className: 'achieved-earned', status: String(n) };
    }
    return { className: null, status: '0' };
}

/** Back-compat alias for tests. */
function getStreakCountMilestoneRenderState(isActive, count, freeze) {
    return getStreakCountRowDisplay(isActive, count, freeze);
}

function buildStreakCountRowState(visible, thresholdStreak, count, freeze, displayStreak) {
    var display = getStreakCountRowDisplay(
        displayStreak >= thresholdStreak,
        count,
        freeze,
    );
    return {
        visible: visible,
        status: display.status,
        className: display.className,
    };
}

/**
 * Full Records panel snapshot for DOM apply + tests.
 * @returns {{
 *   recordsBlockLocked: boolean,
 *   recordsLabelVisible: boolean,
 *   day50: { visible, status, className },
 *   day100: { visible, status, className },
 *   bestStreak: { visible, status, className },
 * }}
 */
function getStreakRecordsPanelState(s, displayStreak, freeze) {
    s = s || state;
    var streak = displayStreak != null ? displayStreak : getDisplayStreak();
    freeze = !!freeze;
    syncStreakRecordsUnlockFlags(s);

    var sectionRevealed = !!s.streak50CountUnlocked;
    var day100Revealed = !!s.streak100CountUnlocked;
    var liveBest = !freeze
        && (s.currentStreak || 0) > 0
        && (s.currentStreak || 0) >= (s.longestStreak || 0);

    return {
        recordsBlockLocked: !sectionRevealed,
        recordsLabelVisible: sectionRevealed,
        day50: buildStreakCountRowState(
            sectionRevealed,
            STREAK_COUNT_ROW_50,
            s.day50Count || 0,
            freeze,
            streak,
        ),
        day100: buildStreakCountRowState(
            day100Revealed,
            STREAK_COUNT_ROW_100,
            s.day100Count || 0,
            freeze,
            streak,
        ),
        bestStreak: {
            visible: true,
            status: String(liveBest ? s.currentStreak : s.longestStreak || 0),
            className: liveBest ? 'golden' : null,
        },
    };
}

/** Back-compat shape for existing tests. */
function getStreakRecordsUiState(s, displayStreak, freeze) {
    var panel = getStreakRecordsPanelState(s, displayStreak, freeze);
    return {
        showRecordsLabel: panel.recordsLabelVisible,
        showDay50: panel.day50.visible,
        showDay100: panel.day100.visible,
        day50: {
            status: panel.day50.status,
            className: panel.day50.className,
        },
        day100: {
            status: panel.day100.status,
            className: panel.day100.className,
        },
    };
}
