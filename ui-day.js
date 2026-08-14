/**
 * ui-day.js — Day logic, progress cards, onboarding.
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

/**
 * Day / monthly-grid rules (validated product contract):
 *  1. Journey "Day" runs in parallel with real wall days from Journey Day 1 (install).
 *  2. From install forward, past days should resolve to strong or slip (not empty holes).
 *  3. Missed days through N-2 auto-write strong (green). Yesterday (N-1) is always asked.
 *  4. Today (N) is never auto — user logs strong or slip.
 */
function checkNewDay() {
    if (!safeGet('onboardingComplete')) return;

    // Safety net before day roll / next-journey logic.
    if (typeof healStrandedJourneyEnd === 'function' && healStrandedJourneyEnd()) {
        saveToStorage(state);
    }

    const today = todayKey();

    if (isAwaitingNextJourney()) {
        if (typeof canBeginNextJourneyToday === 'function' ? canBeginNextJourneyToday()
            : (state.journeyEndedDate && today !== state.journeyEndedDate)) {
            beginNextJourney();
            chartPage = -1;
            // Day 1 is today (opened the day after end) — nothing to backfill.
            if (state.journeyStartDate === today) {
                state.lastOpenedDate = today;
                state.lastCheckedDate = today;
                clampCalendarDayToRealToday();
                saveToStorage(state);
                renderAll();
                return;
            }
            // Returned after a gap (e.g. end Mon, open Thu): Day 1 = end+1.
            // Fall through so auto-strong (through N-2) + yesterday ask fill the grid.
        } else {
            state.lastCheckedDate = today;
            saveToStorage(state);
            renderAll();
            return;
        }
    }

    if (state.lastCheckedDate === today) {
        clampCalendarDayToRealToday();
        if (typeof isYesterdayLogPending === 'function' && isYesterdayLogPending()) {
            renderAll();
            showYesterdayReminder();
        }
        return;
    }

    if (!state.lastOpenedDate) {
        state.lastOpenedDate = today;
        state.lastCheckedDate = today;
        clampCalendarDayToRealToday();
        saveToStorage(state);
        return;
    }

    const yesterday = getYesterdayKey(today);
    const fillResults = autoStrongAbsentDays(today);

    for (const { result, suppressUI } of fillResults) {
        handleStrongDayUI(result, suppressUI);
    }

    ensureTodayUnloggedIfNeeded(today);
    clampCalendarDayToRealToday();
    chartPage = -1;

    if (fillResults.length) {
        saveToStorage(state);
        const last = fillResults[fillResults.length - 1];
        if (last && !last.suppressUI && last.result && last.result.applied !== false) {
            showToast(last.result.streak, 'Missed days counted as strong 💪');
        }
    }

    const anchor = getJourneyAnchorWallDate();
    if (yesterday >= anchor && !isWallDateLogged(yesterday)) {
        // Paint auto-strong / score updates before the overlay (don't leave stale header).
        saveToStorage(state);
        renderAll();
        showYesterdayReminder();
        // Leave lastCheckedDate unset so reload re-prompts until answered.
        return;
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
        var slipResult = applySlipDay({ logDate: yKey, calDay: getCalendarDayForWallDate(yKey) });
        // End date = yesterday when the 10th slip is attributed to N-1 (not open day N).
        if (slipResult && slipResult.applied && journeyIsOver(state)) {
            completeEndJourney(yKey);
            showToast(0, '10 Powers used. Journey complete.');
            return;
        }
    }

    clampCalendarDayToRealToday();
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
    var workingDay = getBrainProgressStreak();
    var completed = typeof getBrainCompletedStrongDays === 'function'
        ? getBrainCompletedStrongDays()
        : Math.max(0, state.currentStreak || 0);
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
        // Inclusive day ranges: e.g. Withdrawal 1–3, Flatline 4–14, Early Rewiring 15–30.
        var isOpenEnded = phase.to === Infinity;
        var isCurrent = workingDay > 0 && workingDay >= phase.from && (isOpenEnded || workingDay <= phase.to);
        // Mark phase done once past its end day (not on the final day while still "here").
        var isCompleted = completed > 0 && !isOpenEnded
            && completed >= phase.to
            && workingDay > phase.to;

        // Frozen position (slip day or journey end): hold as completed/grey, no live "here"
        if (freezeStyle && isCurrent) {
            isCompleted = true;
            isCurrent = false;
        }

        var dayRange = isOpenEnded
            ? 'Day ' + phase.from + '+'
            : 'Day ' + phase.from + '\u2013' + phase.to;

        var phaseLen = isOpenEnded ? 1 : (phase.to - phase.from + 1);
        if (phaseLen <= 0) phaseLen = 1;

        var doneInPhase = 0;
        if (completed >= phase.from) {
            doneInPhase = Math.min(phaseLen, Math.max(0, completed - phase.from + 1));
        }
        var pct = Math.min(100, Math.round((doneInPhase / phaseLen) * 100));

        var daysLeftInPhase = isOpenEnded
            ? null
            : getBrainDaysLeftInPhase(phase, completed);
        // Day 3 of Withdrawal after that strong log, etc.
        var phaseFullyDone = !isOpenEnded
            && completed === phase.to
            && state.todayStatus === 'success';

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

        var leftLabel = '';
        if (phaseFullyDone || daysLeftInPhase === 0) {
            leftLabel = 'Phase completed';
        } else {
            leftLabel = daysLeftInPhase + ' day' + (daysLeftInPhase !== 1 ? 's' : '') + ' left in this phase';
        }

        var progressBar = (isCurrent && !isOpenEnded) ? (
            '<div class="science-progress-track">' +
                '<div class="science-progress-fill" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<div class="science-progress-label">' + leftLabel + '</div>'
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


/** Reset slides/dots to first screen (needed after reset — DOM keeps last active slide). */
function resetOnboardingUI() {
    currentSlide = 0;
    for (var i = 0; i < TOTAL_SLIDES; i++) {
        var slide = document.getElementById('slide-' + i);
        var dot = document.getElementById('dot-' + i);
        if (slide) slide.classList.toggle('active', i === 0);
        if (dot) dot.classList.toggle('active', i === 0);
    }
    var btn = document.getElementById('onboardingBtn');
    if (btn) btn.textContent = 'Next →';
}

function checkOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;

    const done = safeGet('onboardingComplete');
    if (!done) {
        resetOnboardingUI();
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

        // Last slide — final CTA
        if (currentSlide === TOTAL_SLIDES - 1) {
            document.getElementById('onboardingBtn').textContent = 'Start Your Journey →';
        } else {
            document.getElementById('onboardingBtn').textContent = 'Next →';
        }
    } else {
        completeOnboarding();
    }
}

/** Skip and full slide flow both end here — trial starts from Calendar Day 1 either way. */
function completeOnboarding() {
    try {
        beginJourneyAfterOnboarding();
        saveToStorage(state);
    } catch (err) {
        console.error('King onboarding save failed:', err);
    }

    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        // Keep intercepting clicks until fade-out finishes — otherwise the same
        // “Let’s Begin” / Skip tap falls through (paywall / export / panels).
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
        if (typeof unlockPremiumFeatures === 'function') {
            unlockPremiumFeatures();
        } else {
            renderAll();
        }
    } catch (err) {
        console.error('King onboarding render failed:', err);
    }
}
