/**
 * ui-actions.js — User taps: strong, slip, reset, modals, journey end.
 * Edit here: what happens when the user logs or confirms an action.
 */

// ════════════════════════════════════════════════════════
//  USER ACTIONS
// ════════════════════════════════════════════════════════

function handleSuccess() {
    if (isAwaitingNextJourney()) return;
    if (typeof isYesterdayLogPending === 'function' && isYesterdayLogPending()) {
        showYesterdayReminder();
        showToast(0, 'Log yesterday first.');
        return;
    }
    if (state.todayStatus === 'failed') {
        showToast(0, 'You already slipped today. Stay strong tomorrow!');
        return;
    }
    if (state.todayStatus === 'success') return;
    showModal('success');
}

/** Log from the reminder notification — same confirm modal as in-app buttons. */
function applyNotificationLog(kind) {
    if (safeGet('onboardingComplete') !== 'true') return;
    if (kind !== 'strong' && kind !== 'slip') return;
    if (isAwaitingNextJourney()) {
        showToast(0, 'Start your next journey first.');
        return;
    }
    if (typeof isYesterdayLogPending === 'function' && isYesterdayLogPending()) {
        showYesterdayReminder();
        showToast(0, 'Log yesterday first.');
        return;
    }
    if (kind === 'strong') {
        if (state.todayStatus === 'failed') {
            showToast(0, 'You already slipped today. Stay strong tomorrow!');
            return;
        }
        if (state.todayStatus === 'success') {
            showToast(0, 'Already logged strong today.');
            return;
        }
        showModal('success');
        return;
    }
    if (state.todayStatus === 'success') {
        showToast(0, 'Already logged strong today.');
        return;
    }
    if (state.todayStatus === 'failed') {
        showToast(0, 'You already slipped today. Stay strong tomorrow!');
        return;
    }
    showModal('fail');
}

function showModal(action) {
    if ((action === 'success' || action === 'fail')
        && typeof isYesterdayLogPending === 'function' && isYesterdayLogPending()) {
        showYesterdayReminder();
        showToast(0, 'Log yesterday first.');
        return;
    }
    pendingAction = action;
    document.getElementById('modalMessage').textContent =
        action === 'success' ? 'Mark today as successful?' :
        action === 'reset'   ? 'Reset all data?' :
        action === 'import'  ? formatImportConfirmMessage() :
        'Today was hard. Log it and keep going?';
    document.getElementById('modalConfirmBtn').textContent =
        action === 'success' ? 'Confirm' :
        action === 'reset'   ? 'Yes, reset all' :
        action === 'import'  ? 'Restore progress' :
        'Yes, log it';

    // Show RESET input only for reset action
    const resetWrap  = document.getElementById('resetConfirmWrap');
    const resetInput = document.getElementById('resetConfirmInput');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    if (action === 'reset') {
        resetWrap.style.display = 'block';
        resetInput.value = '';
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.4';
    } else {
        resetWrap.style.display = 'none';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    }

    document.getElementById('confirmModal').classList.add('active');
}

function checkResetInput() {
    const val = document.getElementById('resetConfirmInput').value.trim().toUpperCase();
    const btn = document.getElementById('modalConfirmBtn');
    btn.disabled    = val !== 'RESET';
    btn.style.opacity = val !== 'RESET' ? '0.4' : '1';
}

function closeModal() {
    document.getElementById('confirmModal').classList.remove('active');
    document.getElementById('resetConfirmInput').value = '';
    document.getElementById('resetConfirmWrap').style.display = 'none';
    pendingAction = null;
    pendingImportBackup = null;
}

function confirmAction() {
    const action = pendingAction;
    if (!action) return;
    const importBackup = action === 'import' ? pendingImportBackup : null;
    pendingAction = null;
    pendingImportBackup = null;

    const confirmBtn = document.getElementById('modalConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = true;

    closeModal();

    if (action === 'success') recordSuccess();
    else if (action === 'fail') recordFailure();
    else if (action === 'reset') resetAll();
    else if (action === 'import') restoreImportBackup(importBackup);
}

function resetAll() {
    safeRemove(STORAGE_KEY);
    safeRemove('onboardingComplete');
    clearLastBackupAt();
    replaceState(getDefaultState());
    chartPage = -1;
    chartMode = 'streaks';
    currentTab = 0;
    invalidateJourneyMilestonesRender();
    switchTab(0);
    switchChartMode('streaks');
    saveToStorage(state);
    renderAll();
    checkOnboarding();
}


function recordSuccess() {
    state.lastOpenedDate = todayKey();
    const result = applyStrongDay({ logDate: todayKey(), suppressUI: false });
    if (!result || !result.applied) return;
    handleStrongDayUI(result, false);
    chartPage = -1;
    saveAndRender();
    showToast(state.currentStreak);
}

function handleStrongDayUI(result, suppressUI) {
    if (!result || suppressUI || result.applied === false) return;
    if (result.isNewRecord) {
        setTimeout(() => showCelebration({
            emoji: '🏆',
            stage: 'NEW PERSONAL BEST',
            title: `${result.streak} Days — New Record!`,
            message: `You just beat your personal best! Old record: ${result.recordToBeat} days. You are rewriting your own limits.`,
        }), 400);
    }
    triggerStreakMilestone(result.streak);
    if (result.milestoneHit) triggerJourneyMilestone(result.milestoneHit);
    if (result.personalBestCrossing) triggerPersonalBestJourneyCelebration(result.successCount);
}

let lastSlipAt = 0;

function completeEndJourney(endWallDate) {
    const comparison = archiveCompletedJourney(endWallDate);
    if (!comparison) return;

    // Defer beginNextJourney until the user dismisses the comparison popup so
    // attempt / end-date state and the shown-once key stay tied to this journey.
    var canOpenNextToday = typeof canBeginNextJourneyToday === 'function'
        && canBeginNextJourneyToday();

    chartPage = -1;
    saveAndRender();

    queueJourneyEndComparison(comparison, { nextJourneyOpenToday: canOpenNextToday });
}

function recordFailure() {
    const now = Date.now();
    if (now - lastSlipAt < 800) return;
    lastSlipAt = now;

    state.lastOpenedDate = todayKey();
    const result = recordSlipToday();
    if (!result || !result.applied) {
        if (state.todayStatus === 'failed') {
            showToast(0, 'You already slipped today. Stay strong tomorrow!');
            return;
        }
        // Stranded 10/10 (logging blocked, never archived) — recover via normal end path.
        if (typeof journeyIsOver === 'function' && journeyIsOver(state)
            && typeof isAwaitingNextJourney === 'function' && !isAwaitingNextJourney()) {
            var endDay = typeof inferJourneyEndWallDate === 'function'
                ? inferJourneyEndWallDate()
                : todayKey();
            completeEndJourney(endDay);
            showToast(0, '10 slips logged. Journey complete.');
        }
        return;
    }

    if (journeyIsOver(state)) {
        completeEndJourney(todayKey());
        showToast(0, '10 slips logged. Journey complete.');
    } else {
        chartPage = -1;
        saveAndRender();
        const failures = result.failures;
        showToast(0, `${failures} slip${failures === 1 ? '' : 's'} logged. Keep moving forward. Journey continues.`);
    }
}
