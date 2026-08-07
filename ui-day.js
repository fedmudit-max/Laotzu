/**
 * ui-day.js — Day logic, progress cards, onboarding, dev tools.
 * Edit here: yesterday reminder, multi-day catch-up, brain/knowledge cards, onboarding.
 */

// ════════════════════════════════════════════════════════
//  DAY REFRESH
// ════════════════════════════════════════════════════════

function showYesterdayReminder() {
    const reminder = document.getElementById('reminderOverlay');
    if (reminder && !reminder.classList.contains('active')) {
        reminder.classList.add('active');
    }
}

function checkNewDay() {
    if (!safeGet('onboardingComplete')) return;

    const today = todayKey();

    if (isAwaitingNextJourney()) {
        if (state.journeyEndedDate && today !== state.journeyEndedDate) {
            beginNextJourney();
            state.lastOpenedDate = today;
            state.lastCheckedDate = today;
            chartPage = -1;
            saveToStorage(state);
            renderAll();
        } else {
            state.lastCheckedDate = today;
            saveToStorage(state);
            renderAll();
        }
        return;
    }

    if (state.lastCheckedDate === today) return;

    if (!state.lastOpenedDate) {
        state.lastOpenedDate = today;
        state.lastCheckedDate = today;
        saveToStorage(state);
        return;
    }

    if (state.lastOpenedDate === today) {
        state.lastCheckedDate = today;
        saveToStorage(state);
        return;
    }

    const diffDays = daysBetweenKeys(state.lastOpenedDate, today);
    const yesterday = getYesterdayKey(today); // N-1

    // Gap > 1 day: auto-strong through N-2, then ask about N-1; N stays unlogged
    if (diffDays > 1) {
        applyMultiDayCatchUp(today);
        return;
    }

    // Gap = 1 day: ask about N-1 only; N stays unlogged
    if (diffDays === 1) {
        ensureTodayUnloggedIfNeeded(today);
        if (!isWallDateLogged(yesterday)) {
            showYesterdayReminder();
            return;
        }
        advanceCalendarDay();
        state.lastOpenedDate = today;
        state.lastCheckedDate = today;
        chartPage = -1;
        saveToStorage(state);
        renderAll();
        return;
    }
}

function applyMultiDayCatchUp(today) {
    today = today || todayKey();
    const yesterday = getYesterdayKey(today); // N-1
    const results = autoStrongAbsentDays(today);

    for (const { result, suppressUI } of results) {
        handleStrongDayUI(result, suppressUI);
    }

    ensureTodayUnloggedIfNeeded(today);

    chartPage = -1;

    if (results.length) {
        saveToStorage(state);
    }

    const last = results[results.length - 1];
    if (last && !last.suppressUI && last.result) {
        showToast(last.result.streak, 'Missed days counted as strong 💪');
    }

    if (!isWallDateLogged(yesterday)) {
        showYesterdayReminder();
        return;
    }

    if (state.lastOpenedDate < today) {
        advanceCalendarDay();
    }
    state.lastOpenedDate = today;
    state.lastCheckedDate = today;
    saveToStorage(state);
    renderAll();
}

function logYesterday(result) {
    document.getElementById('reminderOverlay').classList.remove('active');
    const yKey = addDaysToKey(todayKey(), -1);

    if (result === 'strong') {
        handleStrongDayUI(applyStrongDay({ logDate: yKey, suppressUI: false }), false);
    } else {
        applySlipDay({ logDate: yKey, calDay: state.calendarDay });
    }

    if (journeyIsOver(state)) { completeEndJourney(); return; }
    advanceCalendarDay();
    state.lastOpenedDate = todayKey();
    state.lastCheckedDate = todayKey();
    chartPage = -1;
    saveToStorage(state);
    renderAll();
}

// ════════════════════════════════════════════════════════
//  BRAIN RECOVERY CARD
//  Shows current neurological phase based on streak length.
// ════════════════════════════════════════════════════════


function renderBrainCard() {
    var streak = getBrainProgressStreak();
    var list = document.getElementById('scienceList');
    if (!list || typeof BRAIN_PHASES === 'undefined') return;

    var journeyEnded = isJourneyEndedDisplay();
    var slipFreeze = isStreakFreezeDay();
    // Slip freeze and journey end both grey the progress position (same as Streak tab).
    var freezeStyle = journeyEnded || slipFreeze;
    var sciencePane = document.getElementById('tab-science');
    if (sciencePane) {
        sciencePane.classList.toggle('journey-ended-day', journeyEnded);
        sciencePane.classList.toggle('streak-freeze-day', slipFreeze);
    }

    list.innerHTML = BRAIN_PHASES.map(function (phase, idx) {
        var isCurrent = streak > 0 && streak >= phase.from && streak < phase.to;
        var phaseEnd = phase.to === Infinity ? 365 : phase.to;
        var isCompleted = streak > 0 && streak >= phaseEnd;

        // Frozen position (slip day or journey end): hold as completed/grey, no live "here"
        if (freezeStyle && isCurrent) {
            isCompleted = true;
            isCurrent = false;
        }

        var toLabel  = phase.to === Infinity ? '365+' : phase.to;
        var dayRange = 'Day ' + phase.from + '\u2013' + toLabel;

        var phaseLen = phaseEnd - phase.from;
        if (phaseLen <= 0) phaseLen = 1;
        var daysIn   = Math.max(0, streak - phase.from);
        var pct      = Math.min(100, Math.round((daysIn / phaseLen) * 100));
        var daysLeft = phase.to === Infinity ? null : phaseEnd - streak;

        var cls = 'science-item';
        if (isCurrent)   cls += ' current';
        if (isCompleted) cls += ' completed';
        if (freezeStyle && isCompleted) cls += ' journey-ended-item';
        if (!isCurrent && !isCompleted) cls += ' future';

        var badge = isCurrent
            ? '<span class="science-here-badge">You are here</span>'
            : isCompleted
                ? '<span class="science-days-range">' + (freezeStyle ? 'Ended' : '\u2713 Done') + '</span>'
                : '<span class="science-days-range">' + dayRange + '</span>';

        var progressBar = isCurrent ? (
            '<div class="science-progress-track">' +
                '<div class="science-progress-fill" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<div class="science-progress-label">' +
                (daysLeft
                    ? daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' to next phase'
                    : 'Final stage reached') +
            '</div>'
        ) : '';

        if (isCurrent) {
            return (
                '<div class="' + cls + '">' +
                    '<div class="science-item-header">' +
                        '<div class="science-item-left">' +
                            '<span class="science-emoji">' + phase.emoji + '</span>' +
                            '<span class="science-phase-name">' + phase.phase + '</span>' +
                        '</div>' +
                        badge +
                    '</div>' +
                    '<div class="science-desc">' + phase.desc + '</div>' +
                    progressBar +
                '</div>'
            );
        }

        return (
            '<div class="' + cls + ' science-collapsed" onclick="toggleSciencePhase(' + idx + ')">' +
                '<div class="science-item-header" style="margin-bottom:0">' +
                    '<div class="science-item-left">' +
                        '<span class="science-emoji">' + phase.emoji + '</span>' +
                        '<span class="science-phase-name">' + phase.phase + '</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                        badge +
                        '<span class="science-chevron" id="chevron-' + idx + '">\u203a</span>' +
                    '</div>' +
                '</div>' +
                '<div class="science-desc science-expandable" id="expand-' + idx + '" style="display:none;margin-top:8px">' + phase.desc + '</div>' +
            '</div>'
        );
    }).join('');
}

function toggleSciencePhase(idx) {
    const desc    = document.getElementById(`expand-${idx}`);
    const chevron = document.getElementById(`chevron-${idx}`);
    if (!desc) return;
    const open = desc.style.display === 'none';
    desc.style.display    = open ? 'block' : 'none';
    chevron.style.transform = open ? 'rotate(90deg)' : '';
    chevron.style.transition = 'transform 0.2s';
}

// ════════════════════════════════════════════════════════
//  DAILY KNOWLEDGE CARD
// ════════════════════════════════════════════════════════

function renderKnowledgeCard() {
    const fact = KNOWLEDGE_FACTS[dayOfYearFromKey(todayKey()) % KNOWLEDGE_FACTS.length];

    document.getElementById('knowledgeEmoji').textContent    = fact.emoji;
    document.getElementById('knowledgeHeadline').textContent = fact.headline;
    document.getElementById('knowledgeBody').textContent     = fact.body;
}

// ════════════════════════════════════════════════════════
//  ONBOARDING
// ════════════════════════════════════════════════════════


function checkOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    const btn = document.getElementById('onboardingBtn');
    if (!overlay) return;

    const done = safeGet('onboardingComplete');
    if (!done) {
        currentSlide = 0;
        if (btn) btn.textContent = 'Next →';
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto';
        overlay.classList.remove('hidden');
    } else {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
    }
}

function onboardingNext() {
    if (currentSlide < TOTAL_SLIDES - 1) {
        // Go to next slide
        document.getElementById(`slide-${currentSlide}`).classList.remove('active');
        document.getElementById(`dot-${currentSlide}`).classList.remove('active');
        currentSlide++;
        document.getElementById(`slide-${currentSlide}`).classList.add('active');
        document.getElementById(`dot-${currentSlide}`).classList.add('active');

        // Last slide — change button to "Let's Begin"
        if (currentSlide === TOTAL_SLIDES - 1) {
            document.getElementById('onboardingBtn').textContent = "Let's Begin 💪";
        }
    } else {
        completeOnboarding();
    }
}

function completeOnboarding() {
    safeSet('onboardingComplete', 'true');

    // Trial + dates before any UI work — after Let’s Begin, premium sections gate on trial.
    try {
        startPremiumTrial();
        if (!state.lastOpenedDate) {
            state.lastOpenedDate = todayKey();
            state.lastCheckedDate = todayKey();
        }
        saveToStorage(state);
    } catch (err) {
        console.error('King onboarding save failed:', err);
    }

    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        // Keep intercepting clicks until fade-out finishes — otherwise the same
        // “Let’s Begin” tap falls through (paywall / export / panels) and can open
        // "Your free trial has ended" while trial is still being applied.
        setTimeout(function () {
            overlay.style.display = 'none';
            overlay.style.pointerEvents = 'none';
        }, 400);
    }

    if (typeof monthPanelOpen !== 'undefined') monthPanelOpen = true;
    if (typeof deferredHeavyRendered !== 'undefined') deferredHeavyRendered = false;

    // Never show paywall immediately after first start.
    if (typeof closePremiumSheet === 'function') closePremiumSheet();

    try {
        // Show premium UI (month grid, etc.) with active trial, fill heavy widgets.
        if (typeof unlockPremiumFeatures === 'function') {
            unlockPremiumFeatures();
        } else {
            renderAll();
        }
    } catch (err) {
        console.error('King onboarding render failed:', err);
    }
}

// ════════════════════════════════════════════════════════
//  DEV — testing helpers
// ════════════════════════════════════════════════════════

/**
 * Add one strong day to the journey score without moving the calendar
 * or wall date. (+1 / +7 strong buttons)
 */
function applyDevStrongScore(suppressUI) {
    suppressUI = !!suppressUI;

    state.score.success++;
    state.currentStreak++;

    const prevLongest = state.longestStreak;
    const recordToBeat = state.longestStreakAtStreakStart;
    const isNewRecord = isPersonalBestStreak(state.currentStreak, recordToBeat);

    if (state.currentStreak > state.longestStreak) {
        state.longestStreak = state.currentStreak;
    }

    if (!suppressUI && isNewRecord) {
        state.recordCelebrated = true;
    }

    if (state.currentStreak === 50) state.day50Count++;
    if (state.currentStreak === 100) state.day100Count++;

    var personalBestCrossing = isPersonalBestJourneyCrossing(state.score.success);

    updateBestJourney();

    return {
        streak: state.currentStreak,
        successCount: state.score.success,
        milestoneHit: resolveJourneyMilestoneHit(state.score.success),
        personalBestCrossing: personalBestCrossing,
        isNewRecord: !suppressUI && isNewRecord,
        prevLongest: prevLongest,
        recordToBeat: recordToBeat,
    };
}

/** Advance simulated wall day only — does not change score or Day counter. */
function devAdvanceNextDay() {
    if (!safeGet('onboardingComplete')) {
        showToast(0, 'Finish onboarding first.');
        return;
    }

    if (isAwaitingNextJourney()) {
        beginNextJourney();
        chartPage = -1;
        saveAndRender();
        showToast(state.attempt, `Journey ${state.attempt} started ⏭`);
        return;
    }

    // Simulated wall date only. Day counter stays frozen for testing.
    state.devDateOffset = (state.devDateOffset || 0) + 1;

    // Allow logging again for the simulated "today" without adding score.
    state.todayStatus = 'none';
    state.todayFailCount = 0;

    // Quiet day-check so multi-day auto-strong / calendar advance cannot invent days or score.
    state.lastOpenedDate = todayKey();
    state.lastCheckedDate = todayKey();
    clampCalendarDayToRealToday();
    chartPage = -1;
    saveAndRender();
    showToast(0, `Test: next day (no score, Day stays ${getDisplayCalendarDay()}) · ${state.score.success}/${state.score.failures}`);
}

function devAdvanceOneStrong() {
    if (!safeGet('onboardingComplete')) {
        showToast(0, 'Finish onboarding first.');
        return;
    }

    if (isAwaitingNextJourney()) {
        showToast(0, 'Start the next journey first.');
        return;
    }

    const result = applyDevStrongScore(false);
    handleStrongDayUI(result, false);
    clampCalendarDayToRealToday();
    chartPage = -1;
    saveAndRender();
    showToast(state.score.success, `Test: +1 strong · score only · Day ${getDisplayCalendarDay()}`);
}

function devAdvanceSevenDays() {
    if (!safeGet('onboardingComplete')) {
        showToast(0, 'Finish onboarding first.');
        return;
    }

    if (isAwaitingNextJourney()) {
        showToast(0, 'Start the next journey first.');
        return;
    }

    let lastResult = null;
    for (let i = 0; i < 7; i++) {
        lastResult = applyDevStrongScore(i < 6);
        handleStrongDayUI(lastResult, i < 6);

        if (journeyIsOver(state)) {
            completeEndJourney();
            clampCalendarDayToRealToday();
            chartPage = -1;
            saveAndRender();
            return;
        }
    }

    clampCalendarDayToRealToday();
    chartPage = -1;
    saveAndRender();
    showToast(state.score.success, `Test: +7 strong · score only · Day ${getDisplayCalendarDay()}`);
}
