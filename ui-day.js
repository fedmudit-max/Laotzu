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

    list.innerHTML = BRAIN_PHASES.map(function (phase, idx) {
        var isCurrent = streak > 0 && streak >= phase.from && streak < phase.to;
        var phaseEnd = phase.to === Infinity ? 365 : phase.to;
        var isCompleted = streak > 0 && streak >= phaseEnd;

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
        if (!isCurrent && !isCompleted) cls += ' future';

        var badge = isCurrent
            ? '<span class="science-here-badge">You are here</span>'
            : isCompleted
                ? '<span class="science-days-range">\u2713 Done</span>'
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
        overlay.classList.remove('hidden');
    } else {
        overlay.style.display = 'none';
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
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.style.pointerEvents = 'none';
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
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
    try {
        renderAll();
    } catch (err) {
        console.error('King onboarding render failed:', err);
    }
}

// ════════════════════════════════════════════════════════
//  DEV — simulate next calendar day (testing only)
// ════════════════════════════════════════════════════════

function devAdvanceOneDay() {
    if (!safeGet('onboardingComplete')) {
        showToast(0, 'Finish onboarding first.');
        return;
    }

    if (isAwaitingNextJourney()) {
        beginNextJourney();
        state.lastOpenedDate = todayKey();
        state.lastCheckedDate = todayKey();
        chartPage = -1;
        saveAndRender();
        showToast(state.attempt, `Journey ${state.attempt} started ⏭`);
        return;
    }

    if (canLogToday() && state.todayStatus !== 'success') {
        applyStrongDay({ logDate: todayKey(), suppressUI: true });
    }

    state.devDateOffset = (state.devDateOffset || 0) + 1;
    ensureTodayUnloggedIfNeeded(todayKey());
    clampCalendarDayToRealToday();
    state.lastOpenedDate = todayKey();
    state.lastCheckedDate = todayKey();
    chartPage = -1;
    saveAndRender();
    showToast(state.score.success, `Test: +1 strong · Day ${getDisplayCalendarDay()} ⏭`);
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
        if (!canLogToday()) break;

        if (state.todayStatus === 'success') {
            state.devDateOffset = (state.devDateOffset || 0) + 1;
            state.todayStatus = 'none';
            state.todayFailCount = 0;
        }

        lastResult = applyStrongDay({ logDate: todayKey(), suppressUI: i < 6 });
        handleStrongDayUI(lastResult, i < 6);

        if (journeyIsOver(state)) {
            completeEndJourney();
            clampCalendarDayToRealToday();
            state.lastOpenedDate = todayKey();
            state.lastCheckedDate = todayKey();
            return;
        }

        if (i < 6) {
            state.devDateOffset = (state.devDateOffset || 0) + 1;
            state.todayStatus = 'none';
            state.todayFailCount = 0;
        }
    }

    clampCalendarDayToRealToday();
    state.lastOpenedDate = todayKey();
    state.lastCheckedDate = todayKey();
    chartPage = -1;
    saveAndRender();
    showToast(state.score.success, `Test: +7 strong · Day ${getDisplayCalendarDay()} ⏭`);
}