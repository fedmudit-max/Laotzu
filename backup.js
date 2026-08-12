/**
 * backup.js — Export / import progress JSON.
 */

/** Snapshot of app state for export to a JSON file on the user's device. */
function buildBackupPayload() {
    syncJourneyMilestoneCountsFromHistory(state);
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        onboardingComplete: safeGet('onboardingComplete') === 'true',
        state: JSON.parse(JSON.stringify(state)),
    };
}

/**
 * Parse an exported backup file (or raw saved state JSON).
 * @returns {{ ok: true, state, exportedAt, onboardingComplete } | { ok: false, error: string }}
 */
function parseBackupJson(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, error: 'invalid-json' };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, error: 'invalid-json' };
    }

    let saved = parsed;
    let exportedAt = null;
    let onboardingComplete = null;

    if (parsed.format === BACKUP_FORMAT) {
        if (!parsed.state || typeof parsed.state !== 'object') {
            return { ok: false, error: 'missing-state' };
        }
        saved = parsed.state;
        exportedAt = parsed.exportedAt || null;
        onboardingComplete = parsed.onboardingComplete;
    }

    if (typeof saved.attempt !== 'number' || !saved.score || typeof saved.score !== 'object') {
        return { ok: false, error: 'not-king-backup' };
    }

    return {
        ok: true,
        state: mergeSavedState(saved),
        exportedAt,
        onboardingComplete,
    };
}

function recordLastBackupAt(iso) {
    safeSet(LAST_BACKUP_KEY, iso || new Date().toISOString());
}

function clearLastBackupAt() {
    safeRemove(LAST_BACKUP_KEY);
}

function formatLastBackupLabel() {
    const raw = safeGet(LAST_BACKUP_KEY);
    if (!raw) return 'Never';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'Never';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ════════════════════════════════════════════════════════
//  BACKUP — export / import JSON on device
// ════════════════════════════════════════════════════════

let pendingImportBackup = null;

function formatImportConfirmMessage() {
    if (!pendingImportBackup) return 'Restore this export? Current progress on this device will be replaced.';
    const when = pendingImportBackup.exportedAt
        ? new Date(pendingImportBackup.exportedAt).toLocaleString()
        : 'an earlier save';
    var journey = (pendingImportBackup.state && pendingImportBackup.state.attempt) || 1;
    return `Restore progress exported ${when}? (Journey ${journey}) This replaces your current progress on this device.`;
}

function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function downloadBackupFile(json, filename) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function finishBackupExport(iso) {
    recordLastBackupAt(iso);
    renderBackupStatus();
}

function exportProgressBackup() {
    if (!requirePremium()) return;
    if (!isMobileDevice()) {
        showToast(0, 'Export is available on your phone — open the King app there.');
        return;
    }

    const payload = buildBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const filename = `king-backup-${todayKey()}.json`;
    const file = new File([json], filename, { type: 'application/json' });
    const exportedAt = payload.exportedAt;

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'King progress export' })
            .then(function () {
                finishBackupExport(exportedAt);
                showToast(0, 'Export ready — save to Files or iCloud.');
            })
            .catch(function (e) {
                if (e && e.name === 'AbortError') return;
                downloadBackupFile(json, filename);
                finishBackupExport(exportedAt);
                showToast(0, 'Export saved to downloads.');
            });
        return;
    }

    downloadBackupFile(json, filename);
    finishBackupExport(exportedAt);
    showToast(0, 'Export saved to downloads.');
}

function openImportPicker() {
    if (!requirePremium()) return;
    if (!isMobileDevice()) {
        showToast(0, 'Import is available on your phone — open the King app there.');
        return;
    }
    var picker = document.getElementById('importFileInput');
    if (picker) picker.click();
}

function onImportFileSelected(e) {
    const input = e.target;
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const result = parseBackupJson(String(reader.result || ''));
        if (!result.ok) {
            const msg = result.error === 'invalid-json'
                ? 'That file is not valid JSON.'
                : 'That is not a valid King export file.';
            showToast(0, msg);
            return;
        }
        pendingImportBackup = result;
        showModal('import');
    };
    reader.onerror = () => showToast(0, 'Could not read that file.');
    reader.readAsText(file);
}

function restoreImportBackup(backup) {
    if (!backup || !backup.state) {
        showToast(0, 'Nothing to restore.');
        return;
    }
    replaceState(mergeSavedState(backup.state));
    if (typeof healStrandedJourneyEnd === 'function') healStrandedJourneyEnd();
    if (typeof recomputeCurrentStreak === 'function') recomputeCurrentStreak();
    if (backup.onboardingComplete === true) {
        safeSet('onboardingComplete', 'true');
    } else if (backup.onboardingComplete === false) {
        safeRemove('onboardingComplete');
    }
    chartPage = -1;
    chartMode = 'streaks';
    currentTab = 0;
    invalidateJourneyMilestonesRender();
    switchTab(0);
    switchChartMode('streaks');
    if (backup.exportedAt) recordLastBackupAt(backup.exportedAt);
    saveToStorage(state);
    if (Entitlement.hasPremiumAccess()) {
        unlockPremiumFeatures();
    } else {
        renderAll();
    }
    if (safeGet('onboardingComplete')) {
        checkNewDay();
        if (Entitlement.hasPremiumAccess()) unlockPremiumFeatures();
        else renderAll();
    }
    else checkOnboarding();
    showToast(0, 'Progress restored.');
}