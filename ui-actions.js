/**
 * ui-actions.js — User taps: strong, slip, reset, modals, journey end.
 * Edit here: what happens when the user logs or confirms an action.
 */

// ════════════════════════════════════════════════════════
//  USER ACTIONS
// ════════════════════════════════════════════════════════

function handleSuccess() {
    if (isAwaitingNextJourney()) return;
    if (state.todayStatus === 'failed') {
        showToast(0, 'You already slipped today. Stay strong tomorrow!');
        return;
    }
    if (state.todayStatus === 'success') return;
    showModal('success');
}

function showModal(action) {
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
    handleStrongDayUI(result, false);
    chartPage = -1;
    saveAndRender();
    showToast(state.currentStreak);
}

function handleStrongDayUI(result, suppressUI) {
    if (!result || suppressUI) return;
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

    // 10th slip logged for a prior day (e.g. yesterday): Journey already ended then —
    // today is Day 1 of the next Journey, not a forced rest day.
    var nextAlreadyOpen = false;
    if (typeof canBeginNextJourneyToday === 'function' && canBeginNextJourneyToday()) {
        beginNextJourney();
        nextAlreadyOpen = true;
    }

    chartPage = -1;
    saveAndRender();
    setTimeout(function () {
        showJourneyComparison(
            { attempt: comparison.attempt, score: comparison.score },
            comparison.prevBestScore,
            { nextJourneyOpenToday: nextAlreadyOpen },
        );
    }, 600);
}

function recordFailure() {
    const now = Date.now();
    if (now - lastSlipAt < 800) return;
    lastSlipAt = now;

    state.lastOpenedDate = todayKey();
    const failures = recordSlipToday();
    if (journeyIsOver(state)) {
        completeEndJourney(todayKey());
    } else {
        chartPage = -1;
        saveAndRender();
        showToast(0, `${failures} power${failures > 1 ? 's' : ''} used. Keep moving forward. Journey Continues.`);
    }
}
