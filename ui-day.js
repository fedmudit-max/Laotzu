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

    const today = todayKey();

    if (isAwaitingNextJourney()) {
        if (typeof canBeginNextJourneyToday === 'function' ? canBeginNextJourneyToday()
            : (state.journeyEndedDate && today !== state.journeyEndedDate)) {
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

    if (state.lastCheckedDate === today) {
        clampCalendarDayToRealToday();
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
        if (last && !last.suppressUI && last.result) {
            showToast(last.result.streak, 'Missed days counted as strong 💪');
        }
    }

    const anchor = getJourneyAnchorWallDate();
    if (yesterday >= anchor && !isWallDateLogged(yesterday)) {
        showYesterdayReminder();
        // Leave lastCheckedDate unset so reload re-prompts until answered.
        return;
    }

    state.lastOpenedDate = today;
    state.lastCheckedDate = today;
    saveToStorage(state);
    renderAll();
}

/** Same fill + yesterday ask as checkNewDay. */
function applyMultiDayCatchUp(today) {
    void today;
    state.lastCheckedDate = '';
    checkNewDay();
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

        // Display inclusive day range (from..to-1); data uses half-open [from, to).
        // Withdrawal uses from:0 so label starts at Day 1; Mastery shows 366+.
        var labelFrom = phase.from < 1 ? 1 : phase.from;
        var toLabel   = phase.to === Infinity
            ? (labelFrom >= 366 ? '366+' : String(labelFrom) + '+')
            : String(Math.max(labelFrom, phase.to - 1));
        var dayRange  = 'Day ' + labelFrom + '\u2013' + toLabel;
        if (phase.to === Infinity) {
            dayRange = 'Day ' + toLabel;
        }

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

        // Mastery (open-ended) has no progress bar or countdown label.
        var progressBar = (isCurrent && phase.to !== Infinity) ? (
            '<div class="science-progress-track">' +
                '<div class="science-progress-fill" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<div class="science-progress-label">' +
                daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' to next phase' +
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
