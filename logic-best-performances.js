/**
 * logic-best-performances.js — Top-3 historical streaks & journeys (read-only).
 * Reuses journey/streak state; no duplicate scoring rules.
 */

var BEST_PERFORMANCES_RANK_COUNT = 3;

var BEST_PERFORMANCES_MEDALS = ['🥇', '🥈', '🥉'];

function streakRecordId(attempt, segmentIndex) {
    return 'streak:' + attempt + ':' + segmentIndex;
}

function liveStreakRecordId(attempt) {
    return 'streak:' + attempt + ':live';
}

function completedJourneyRecordId(attempt) {
    return 'journey:' + attempt + ':completed';
}

function liveJourneyRecordId(attempt) {
    return 'journey:' + attempt + ':live';
}

/** All historical streak segments + optional live streak (days > 0 only). */
function collectStreakRecords(s) {
    s = s || state;
    var out = [];
    var past = s.pastJourneyStreaks || [];
    for (var pi = 0; pi < past.length; pi++) {
        var journey = past[pi];
        var attempt = Math.max(1, Math.floor(Number(journey.attempt) || 1));
        var streaks = journey.streaks || [];
        for (var si = 0; si < streaks.length; si++) {
            var days = Math.floor(Number(streaks[si]) || 0);
            if (days <= 0) continue;
            out.push({
                id: streakRecordId(attempt, si),
                days: days,
                attempt: attempt,
                segmentIndex: si,
                sortKey: attempt * 10000 + si,
            });
        }
    }

    if (!isAwaitingNextJourney(s)) {
        var curAttempt = Math.max(1, Math.floor(Number(s.attempt) || 1));
        var curSegments = s.currentJourneyStreaks || [];
        for (var ci = 0; ci < curSegments.length; ci++) {
            var cdays = Math.floor(Number(curSegments[ci]) || 0);
            if (cdays <= 0) continue;
            out.push({
                id: streakRecordId(curAttempt, ci),
                days: cdays,
                attempt: curAttempt,
                segmentIndex: ci,
                sortKey: curAttempt * 10000 + ci,
            });
        }
        var liveDays = Math.floor(Number(s.currentStreak) || 0);
        if (liveDays > 0) {
            out.push({
                id: liveStreakRecordId(curAttempt),
                days: liveDays,
                attempt: curAttempt,
                segmentIndex: -1,
                sortKey: curAttempt * 10000 + 9999,
            });
        }
    }

    return out;
}

function getActiveStreakRecordId(s) {
    s = s || state;
    if (isAwaitingNextJourney(s)) return null;
    var liveDays = Math.floor(Number(s.currentStreak) || 0);
    if (liveDays <= 0) return null;
    var attempt = Math.max(1, Math.floor(Number(s.attempt) || 1));
    return liveStreakRecordId(attempt);
}

function compareStreakRecords(a, b) {
    if (b.days !== a.days) return b.days - a.days;
    // Same length: earlier achievement wins (lower journey attempt, then earlier segment in journey).
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return String(a.id).localeCompare(String(b.id));
}

function hasActiveJourneySeriesForBest(s) {
    s = s || state;
    if ((s.score && s.score.success) > 0) return true;
    if ((s.score && s.score.failures) > 0) return true;
    if ((s.currentStreak || 0) > 0) return true;
    if ((s.currentJourneyStreaks || []).length > 0) return true;
    return false;
}

/** Journey rank value = strong days (score.success), same as Progress graph journeys mode. */
function collectJourneyRecords(s) {
    s = s || state;
    var out = [];
    var completed = s.completedJourneys || [];
    for (var i = 0; i < completed.length; i++) {
        var row = completed[i];
        var attempt = Math.max(1, Math.floor(Number(row.attempt) || 1));
        var score = row.score || {};
        var success = Math.floor(Number(score.success) || 0);
        var failures = Math.floor(Number(score.failures) || 0);
        out.push({
            id: completedJourneyRecordId(attempt),
            success: success,
            failures: failures,
            attempt: attempt,
            endedAt: row.date || '',
        });
    }
    if (!isAwaitingNextJourney(s) && hasActiveJourneySeriesForBest(s)) {
        var attempt = Math.max(1, Math.floor(Number(s.attempt) || 1));
        var score = s.score || {};
        out.push({
            id: liveJourneyRecordId(attempt),
            success: Math.floor(Number(score.success) || 0),
            failures: Math.floor(Number(score.failures) || 0),
            attempt: attempt,
            endedAt: '',
        });
    }
    return out;
}

function getActiveJourneyRecordId(s) {
    s = s || state;
    if (isAwaitingNextJourney(s)) return null;
    if (!hasActiveJourneySeriesForBest(s)) return null;
    var attempt = Math.max(1, Math.floor(Number(s.attempt) || 1));
    return liveJourneyRecordId(attempt);
}

function compareJourneyRecords(a, b) {
    if (b.success !== a.success) return b.success - a.success;
    if (a.failures !== b.failures) return a.failures - b.failures;
    if (b.attempt !== a.attempt) return b.attempt - a.attempt;
    return String(a.id).localeCompare(String(b.id));
}

function sortStreakRecords(records) {
    return records.slice().sort(compareStreakRecords);
}

function sortJourneyRecords(records) {
    return records.slice().sort(compareJourneyRecords);
}

/**
 * @param {Array} records sorted or unsorted
 * @param {string|null} activeId
 * @param {'streak'|'journey'} kind
 * @returns {{ slots: Array<{ rank: number, medal: string, empty: boolean, value: number, barPercent: number, isActive: boolean, ariaLabel: string }> }}
 */
function buildBestPerformanceSlots(records, activeId, kind) {
    var sorted = kind === 'journey' ? sortJourneyRecords(records) : sortStreakRecords(records);
    var top = sorted.slice(0, BEST_PERFORMANCES_RANK_COUNT);
    var maxVal = 0;
    for (var i = 0; i < top.length; i++) {
        var v = kind === 'journey' ? top[i].success : top[i].days;
        if (v > maxVal) maxVal = v;
    }

    var slots = [];
    for (var rank = 1; rank <= BEST_PERFORMANCES_RANK_COUNT; rank++) {
        var medal = BEST_PERFORMANCES_MEDALS[rank - 1];
        var rec = top[rank - 1];
        if (!rec) {
            slots.push({
                rank: rank,
                medal: medal,
                empty: true,
                value: 0,
                barPercent: 0,
                isActive: false,
                ariaLabel: 'Rank ' + rank + ', no ' + (kind === 'journey' ? 'journey' : 'streak') + ' yet',
                id: '',
            });
            continue;
        }
        var value = kind === 'journey' ? rec.success : rec.days;
        var barPercent = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
        if (barPercent < 4 && value > 0) barPercent = 4;
        var isActive = !!(activeId && rec.id === activeId);
        var label = kind === 'journey'
            ? ('Rank ' + rank + ', best journey, ' + value + ' days')
            : ('Rank ' + rank + ', best streak, ' + value + ' days');
        if (isActive) label += ', currently active';
        slots.push({
            rank: rank,
            medal: medal,
            empty: false,
            value: value,
            barPercent: barPercent,
            isActive: isActive,
            ariaLabel: label,
            id: rec.id,
        });
    }
    return { slots: slots };
}

function buildBestStreaksBoard(s) {
    var records = collectStreakRecords(s);
    var activeId = getActiveStreakRecordId(s);
    return buildBestPerformanceSlots(records, activeId, 'streak');
}

function buildBestJourneysBoard(s) {
    var records = collectJourneyRecords(s);
    var activeId = getActiveJourneyRecordId(s);
    return buildBestPerformanceSlots(records, activeId, 'journey');
}

function buildBestPerformancesViewModel(s) {
    return {
        streaks: buildBestStreaksBoard(s),
        journeys: buildBestJourneysBoard(s),
    };
}
