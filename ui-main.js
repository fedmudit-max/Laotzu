/**
 * ui-main.js — Shared UI state, init, save/render hub, main screen cards.
 * Edit here: day counter, chances, buttons, milestone badges, tabs.
 */

let pendingAction = null;
let currentTab = 0;
let chartPage = -1;
let chartMode = 'streaks';
let monthOffset = 0;
let monthPanelOpen = true;
let chartPanelOpen = false;
let lifetimePanelOpen = false;
let backupResetPanelOpen = false;
let reminderPanelOpen = false;
let toastTimer = null;
let confettiParticles = [];
let confettiAnimId    = null;
let celebrationQueue       = [];
let celebrationShowing     = false;
let celebrationOnClose     = null;
let celebrationAutoCloseId = null;
let urgeSecsLeft  = URGE_DURATION_SECS;
let urgeInterval   = null;
let breathTimeout  = null;
let currentSlide = 0;
let lastActionTap = { btn: null, action: '', at: 0 };
let lastJourneyMilestonesKey = '';
let deferredHeavyRendered = false;

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════

function init() {
    const saved = loadFromStorage();
    if (!saved) {
        replaceState(getDefaultState());
    } else {
        const beforeCounts = JSON.stringify(saved.journeyMilestones || {});
        replaceState(mergeSavedState(saved));
        if (beforeCounts !== JSON.stringify(state.journeyMilestones || {})) {
            saveToStorage(state);
        }
    }
    // Single load-time write for trial: stamp + persist when onboarded and missing/invalid.
    // Do not seed from render/layout — boot init owns this boundary.
    if (ensureTrialStarted(state)) {
        saveToStorage(state);
    }
}

// ════════════════════════════════════════════════════════
//  RENDER — all DOM updates go through here
// ════════════════════════════════════════════════════════

function saveAndRender() {
    const result = saveToStorage(state);
    if (!result.ok) {
        showToast(0, result.error === 'quota'
            ? 'Storage full — use Reset All Data to keep logging.'
            : 'Could not save your progress. Try again.');
    }
    try { if (typeof syncDailyReminderSchedule === 'function') syncDailyReminderSchedule(); } catch (e) { /* ignore */ }
    renderAll();
}

function renderAll(options) {
    options = options || {};
    const full = !safeGet('onboardingComplete') || Entitlement.hasPremiumAccess();
    const jobs = [
        renderTopStats,
        renderChances,
        renderButtons,
        renderPremiumStatus,
        renderDailyReminder,
        syncHistoryPanels,
    ];
    if (full) {
        jobs.splice(3, 0,
            renderStreakMilestones,
            renderWeeklyStreak,
            renderJourneyMilestones,
            syncTabPanels,
            renderBackupStatus,
        );
    }
    if (!options.deferHeavy && full) {
        jobs.push(
            renderBrainCard,
            renderKnowledgeCard,
            renderLifetimeStats,
            renderMonthGrid,
            renderChart,
        );
    }
    for (const job of jobs) {
        try {
            job();
        } catch (err) {
            console.error(`King render failed (${job.name}):`, err);
        }
    }
    if (!options.deferHeavy) deferredHeavyRendered = true;
}

/** Progress tab charts and calendar — safe to run after first paint. */
function renderDeferredHeavy() {
    if (safeGet('onboardingComplete') && !Entitlement.hasPremiumAccess()) return;
    const jobs = [
        renderBrainCard,
        renderKnowledgeCard,
        renderLifetimeStats,
        renderMonthGrid,
        renderChart,
    ];
    for (const job of jobs) {
        try {
            job();
        } catch (err) {
            console.error(`King deferred render failed (${job.name}):`, err);
        }
    }
    deferredHeavyRendered = true;
}

function ensureDeferredHeavyRendered() {
    if (!deferredHeavyRendered) renderDeferredHeavy();
}

function getScoreCounts() {
    const score = state.score && typeof state.score === 'object'
        ? state.score
        : { success: 0, failures: 0 };
    const maxFailures = typeof MAX_FAILURES === 'number' ? MAX_FAILURES : 10;
    return {
        success: Math.max(0, Number(score.success) || 0),
        failures: Math.max(0, Math.min(Number(score.failures) || 0, maxFailures)),
        maxFailures,
    };
}

function getRelapseScoreTier(failures) {
    if (failures <= 1) return 'relapse-0';
    if (failures <= 3) return 'relapse-2';
    if (failures <= 6) return 'relapse-4';
    if (failures <= 8) return 'relapse-7';
    if (failures === 9) return 'relapse-9';
    return 'relapse-10';
}

function renderTopStats() {
    clampCalendarDayToRealToday();
    const dayEl = document.getElementById('calendarDay');
    if (dayEl) dayEl.textContent = getDisplayCalendarDay();

    const { success, failures } = getScoreCounts();
    const tier = getRelapseScoreTier(failures);
    const currentEl = document.getElementById('currentJourney');
    if (currentEl) {
        currentEl.className = `score-value ${tier}`;
        currentEl.innerHTML =
            `<span class="score-strong">${success}</span>` +
            `<span class="score-sep">/</span>` +
            `<span class="score-failures">${failures}</span>`;
    }

    const breakdownEl = document.getElementById('currentJourneyBreakdown');
    if (breakdownEl) {
        breakdownEl.textContent =
            `${success} strong ${success === 1 ? 'day' : 'days'} · ` +
            `${failures} ${failures === 1 ? 'slip' : 'slips'}`;
    }

    const bestEl = document.getElementById('bestJourney');
    const best = getDisplayBestJourney();
    if (bestEl) bestEl.textContent = formatJourneyScore(best);

    const bestHintEl = document.getElementById('bestJourneyHint');
    if (bestHintEl) {
        var hintText = getBestJourneyHintText();
        if (hintText) {
            bestHintEl.textContent = hintText;
            bestHintEl.hidden = false;
        } else {
            bestHintEl.textContent = '';
            bestHintEl.hidden = true;
        }
    }
}

function renderBackupStatus() {
    const el = document.getElementById('lastBackupLabel');
    if (!el) return;
    el.textContent = `Last exported: ${formatLastBackupLabel()}`;
}

function renderChances() {
    const grid = document.getElementById('chancesGrid');
    if (!grid) return;

    const { failures, maxFailures } = getScoreCounts();
    grid.innerHTML = '';

    for (let i = 0; i < maxFailures; i++) {
        const div = document.createElement('div');
        div.className = 'chance' + (i < failures ? ' used' : '');
        div.textContent = '💪';
        grid.appendChild(div);
    }

    const remaining = maxFailures - failures;
    const tier = getRelapseScoreTier(failures);
    const labelEl = document.getElementById('chancesLabel');

    if (labelEl) {
        labelEl.className = `chances-label ${tier}`;
        labelEl.textContent =
            `💪 ${remaining} ${remaining === 1 ? 'chance' : 'chances'} remaining`;
    }
}

function renderButtons() {
    const successBtn = document.getElementById('successBtn');
    const failBtn    = document.getElementById('failBtn');

    if (isAwaitingNextJourney()) {
        successBtn.disabled = true;
        successBtn.classList.remove('logged');
        successBtn.textContent = '✓ I STAYED STRONG TODAY';
        failBtn.disabled = true;
        failBtn.textContent = 'New journey starts tomorrow';
        return;
    }

    if (state.todayStatus === 'success') {
        successBtn.disabled = true;
        successBtn.classList.add('logged');
        successBtn.textContent = 'Strong 💪';
        failBtn.disabled = true;
        failBtn.textContent = '✕ Blocked';

    } else if (state.todayStatus === 'failed') {
        successBtn.disabled = true;
        successBtn.classList.remove('logged');
        successBtn.textContent = 'Plan to avoid it next time';

        const ORDINALS = ['', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
        const count    = state.todayFailCount;
        failBtn.disabled    = false;
        failBtn.textContent = count === 0
            ? '✕ I Slipped'
            : `✕ I Slipped ${ORDINALS[count] || `${count}th`} time`;

    } else {
        successBtn.disabled = false;
        successBtn.classList.remove('logged');
        successBtn.textContent = '✓ I STAYED STRONG TODAY';
        failBtn.disabled    = false;
        failBtn.textContent = '✕ I Slipped';
    }
}

function renderStreakMilestones() {
    const streak = getDisplayStreak();
    const freeze = isStreakFreezeDay();
    const tabRoot = document.getElementById('tab-streak');
    if (tabRoot) tabRoot.classList.toggle('streak-freeze-day', freeze);

    const STREAK_MILESTONES_LIST = [
        { id: 'cs-day1',  day: 1,  baseName: 'Day 1',  label: 'Started'      },
        { id: 'cs-day3',  day: 3,  baseName: 'Day 3',  label: 'Early Battle' },
        { id: 'cs-week1', day: 7,  baseName: 'Week 1', label: 'First Week'   },
        { id: 'cs-day10', day: 10, baseName: 'Day 10', label: 'Ten Days'     },
        { id: 'cs-week2', day: 14, baseName: 'Week 2', label: 'Foundation'   },
        { id: 'cs-week3', day: 21, baseName: 'Week 3', label: 'Building'     },
        { id: 'cs-day30', day: 30, baseName: 'Day 30', label: 'One Month'    },
    ];

    STREAK_MILESTONES_LIST.forEach(({ id, day, baseName, label }) => {
        const item   = document.getElementById(id);
        const nameEl = item.querySelector('.milestone-name');
        const statEl = item.querySelector('.milestone-status');

        if (streak === 0) {
            setMilestoneState(item, null);
            nameEl.textContent = baseName;
            statEl.textContent = '—';
        } else if (streak >= day) {
            setMilestoneState(item, freeze ? 'achieved streak-ended' : 'achieved-glow');
            nameEl.textContent = `${baseName} — ${label}`;
            statEl.textContent = freeze ? 'Ended' : '✓';
        } else {
            setMilestoneState(item, null);
            nameEl.textContent = baseName;
            statEl.textContent = '—';
        }
    });

    // Count badges (lifetime — still show counts; highlight only if live/frozen streak qualifies)
    renderCountMilestone('cs-day50',  streak >= 50,  state.day50Count);
    renderCountMilestone('cs-day100', streak >= 100, state.day100Count);

    // Best streak (gold when live record; frozen ends use longest only)
    const best = document.getElementById('bestStreakItem');
    const disp = document.getElementById('longestStreakDisplay');
    if (!freeze && state.currentStreak > 0 && state.currentStreak >= state.longestStreak) {
        setMilestoneState(best, 'golden');
        disp.textContent = state.currentStreak;
    } else {
        setMilestoneState(best, null);
        disp.textContent = state.longestStreak;
    }
}

/** Sets achieved/achieved-glow/golden/null on a milestone item */
function setMilestoneState(item, className) {
    item.classList.remove('achieved', 'achieved-glow', 'golden', 'streak-ended');
    if (!className) return;
    className.split(/\s+/).forEach(function (c) {
        if (c) item.classList.add(c);
    });
}

/** Renders a count-based milestone (50-day, 100-day) */
function renderCountMilestone(id, isActive, count) {
    const item   = document.getElementById(id);
    const statEl = item.querySelector('.milestone-status');
    if (isActive) {
        setMilestoneState(item, 'achieved-glow');
        statEl.textContent = count > 0 ? count : '✓';
    } else {
        setMilestoneState(item, null);
        statEl.textContent = count > 0 ? count : '0';
    }
}

function syncWeeklyTrackWidth(track) {
    track.style.width = '100%';
    track.style.maxWidth = '100%';
    track.style.marginLeft = '0';
    track.style.marginRight = '0';
}

/** Visual half-width of each dot marker (must match CSS). */
function getWeeklyMarkerRadius(step) {
    if (step.classList.contains('target')) return 7;
    if (step.classList.contains('done')) return 6;
    return 4;
}

function layoutWeeklyTrack(track) {
    const rail = track.querySelector('.weekly-streak-rail');
    const labelsRow = track.querySelector('.weekly-streak-labels');
    if (!rail || !labelsRow) return;

    syncWeeklyTrackWidth(track);

    const steps = [...rail.querySelectorAll('.weekly-step')];
    const labels = [...labelsRow.querySelectorAll('.weekly-step-label-col')];
    if (steps.length !== 8 || labels.length !== 8) return;

    const trackWidth = track.getBoundingClientRect().width;
    if (trackWidth <= 0) return;

    const startStep = steps[0];
    const daySteps = steps.slice(1);
    const rStart = getWeeklyMarkerRadius(startStep);
    const rEnd = getWeeklyMarkerRadius(daySteps[6]);
    const lineStart = rStart;
    const lineEnd = trackWidth - rEnd;
    const innerSpan = lineEnd - lineStart;
    if (innerSpan <= 0) return;

    startStep.style.left = `${lineStart}px`;
    startStep.style.top = '50%';
    startStep.style.transform = 'translate(-50%, -50%)';

    const startLabel = labels[0];
    const dayLabels = labels.slice(1);
    startLabel.style.left = `${Math.max(0, lineStart - rStart)}px`;
    startLabel.style.top = '0';
    startLabel.style.transform = 'none';
    startLabel.style.textAlign = 'left';

    daySteps.forEach((step, i) => {
        const day = i + 1;
        const cx = lineStart + (day / WEEKLY_TRACK_UNITS) * innerSpan;
        step.style.left = `${cx}px`;
        step.style.top = '50%';
        step.style.transform = 'translate(-50%, -50%)';
    });

    dayLabels.forEach((col, i) => {
        const cx = lineStart + ((i + 1) / WEEKLY_TRACK_UNITS) * innerSpan;
        const r = getWeeklyMarkerRadius(daySteps[i]);
        if (i === 0) {
            col.style.left = `${cx - r}px`;
            col.style.transform = 'none';
            col.style.textAlign = 'left';
        } else if (i === 6) {
            col.style.left = `${cx + r}px`;
            col.style.transform = 'translateX(-100%)';
            col.style.textAlign = 'right';
        } else {
            col.style.left = `${cx}px`;
            col.style.transform = 'translateX(-50%)';
            col.style.textAlign = 'center';
        }
    });

    rail.style.setProperty('--weekly-line-left', `${lineStart}px`);
    rail.style.setProperty('--weekly-line-width', `${innerSpan}px`);

    const dotCenters = daySteps.map((_, i) =>
        ((lineStart + ((i + 1) / WEEKLY_TRACK_UNITS) * innerSpan) / trackWidth) * 100);

    setWeeklyTrackLayout({
        dotCenters,
        preDayStartPct: (lineStart / trackWidth) * 100,
        lineLeftPct: (lineStart / trackWidth) * 100,
        lineRightPct: (lineEnd / trackWidth) * 100,
    });

    const streak = getDisplayStreak();
    rail.style.setProperty('--weekly-green', String(getWeeklyGreenPct(streak)));
    const grey = getWeeklyGreyFill(streak);
    rail.style.setProperty('--weekly-grey-start', String(grey.start));
    rail.style.setProperty('--weekly-grey-width', String(grey.width));

    const traveler = rail.querySelector('.weekly-active-traveler');
    if (traveler) {
        const pos = getWeeklyActiveTraveler(streak);
        if (pos) traveler.style.left = `${pos.leftPct}%`;
    }
}

function renderWeeklyStreakInsight(progress) {
    const titleEl = document.getElementById('weeklyStreakDayTitle');
    const textEl  = document.getElementById('weeklyStreakDayText');

    if (isWeeklySlipReflectDay()) {
        if (titleEl) titleEl.textContent = WEEKLY_SLIP_REFLECT.title;
        if (textEl)  textEl.textContent  = WEEKLY_SLIP_REFLECT.body;
        return;
    }

    const day     = getWeeklyInsightDay(progress);
    const insight = WEEKLY_DAY_INSIGHTS[day] || WEEKLY_DAY_INSIGHTS[1];
    if (titleEl) titleEl.textContent = `Day ${day} — ${insight.title}`;
    if (textEl)  textEl.textContent  = insight.body;
}

function renderWeeklyStreak() {
    const track = document.getElementById('weeklyStreakTrack');
    if (!track) return;

    const streak   = getDisplayStreak();
    const freeze   = isStreakFreezeDay();
    const progress = getWeeklyStreakDay(streak);
    const freezeLayout = freeze ? getWeeklyFreezeLayout(streak) : null;
    const slipDay = freezeLayout ? freezeLayout.slipWeekDay : 0;
    const strongDays = freezeLayout ? freezeLayout.strongWeekDay : progress;

    renderWeeklyStreakInsight(progress);
    const traveler = getWeeklyActiveTraveler(streak);

    const card = document.getElementById('weeklyStreakCard');
    if (card) card.classList.toggle('streak-freeze-day', freeze);

    const startDone = isWeeklyStartReached(streak);
    const startCls = 'weekly-step weekly-step-start' + (startDone ? ' done' : '');
    let railHtml   = '<div class="' + startCls + '">' +
        '<div class="weekly-step-marker"><div class="weekly-step-dot weekly-step-origin" aria-hidden="true"></div></div>' +
        '</div>';
    let labelHtml  = '<div class="weekly-step-label-col' + (startDone ? ' done' : '') + '">' +
        '<div class="weekly-step-label">Start</div></div>';
    for (let day = 1; day <= 7; day++) {
        const strongDone = strongDays > 0 && day <= strongDays;
        const isSlipDot = freeze && day === slipDay;
        const done    = strongDone || isSlipDot;
        const current = (!freeze && done && day === progress) || isSlipDot;
        const isTarget = day === 7 && !done;
        const stepCls  = [
            'weekly-step',
            isTarget ? 'target' : '',
            strongDone ? 'done' : '',
            isSlipDot ? 'slip-day' : '',
            current ? 'current' : '',
            freeze && strongDone ? 'frozen' : '',
        ].filter(Boolean).join(' ');
        const labelCls = [
            'weekly-step-label-col',
            strongDone ? 'done' : '',
            isSlipDot ? 'slip-day' : '',
            current ? 'current' : '',
            freeze && strongDone ? 'frozen' : '',
        ].filter(Boolean).join(' ');
        const marker  = isTarget
            ? `<div class="weekly-step-marker"><svg class="weekly-step-bullseye-svg" viewBox="0 0 18 18" aria-hidden="true">
                <line class="dart-shaft" x1="3.3" y1="2.5" x2="8.55" y2="8.35" stroke="#9a7b4f" stroke-width="1.1" stroke-linecap="round"/>
                <path class="dart-feather dart-feather-a" d="M3.3 2.5 L2.15 1.15 L3.45 3.15 Z"/>
                <path class="dart-feather dart-feather-b" d="M3.3 2.5 L4.35 1.25 L3.85 3.35 Z"/>
                <circle class="ring-outer" cx="9" cy="9" r="6.5" fill="rgba(255,69,58,0.12)" stroke="#ff453a" stroke-width="1.8"/>
                <circle class="ring-mid" cx="9" cy="9" r="3.25" fill="#fff" stroke="#ff453a" stroke-width="1.15"/>
                <circle class="ring-core" cx="9" cy="9" r="1.05" fill="#ff3b30"/>
                <path class="dart-tip" d="M8.15 7.95 L9.45 9.3 L7.9 9.05 Z"/>
            </svg></div>`
            : '<div class="weekly-step-marker"><div class="weekly-step-dot" aria-hidden="true"></div></div>';
        railHtml += `<div class="${stepCls}">${marker}</div>`;
        labelHtml += `<div class="${labelCls}"><div class="weekly-step-label">Day ${day}</div></div>`;
    }

    const travelerHtml = traveler
        ? '<div class="weekly-active-traveler' + (freeze ? ' frozen slip' : '') + '" aria-hidden="true"></div>'
        : '';

    track.innerHTML = `
        <div class="weekly-streak-rail${freeze ? ' freeze' : ''}">
            <div class="weekly-grey-fill" aria-hidden="true"></div>
            ${railHtml}
            ${travelerHtml}
        </div>
        <div class="weekly-streak-labels">${labelHtml}</div>`;
    requestAnimationFrame(() => layoutWeeklyTrack(track));

    if (!track._weeklyResizeObs && typeof ResizeObserver !== 'undefined') {
        track._weeklyResizeObs = new ResizeObserver(() => layoutWeeklyTrack(track));
        track._weeklyResizeObs.observe(track);
    }
}

/** Lightweight refresh — move traveler and green fill without rebuilding the track DOM. */
function updateWeeklyTravelerPosition() {
    const track = document.getElementById('weeklyStreakTrack');
    if (!track) return;

    const rail = track.querySelector('.weekly-streak-rail');
    if (!rail || !weeklyTrackLayout) {
        renderWeeklyStreak();
        return;
    }

    // Freeze day is static — full re-render only on status change
    if (isStreakFreezeDay()) return;

    const streak = getDisplayStreak();
    const pos = getWeeklyActiveTraveler(streak);
    const traveler = rail.querySelector('.weekly-active-traveler');

    if (!pos && traveler) {
        renderWeeklyStreak();
        return;
    }
    if (pos && !traveler) {
        renderWeeklyStreak();
        return;
    }

    rail.style.setProperty('--weekly-green', String(getWeeklyGreenPct(streak)));
    if (traveler && pos) traveler.style.left = `${pos.leftPct}%`;

    const startDone = isWeeklyStartReached(streak);
    const startStep = rail.querySelector('.weekly-step-start');
    if (startStep) startStep.classList.toggle('done', startDone);
    const startLabel = track.querySelector('.weekly-step-label-start');
    if (startLabel) startLabel.classList.toggle('done', startDone);
}

function buildMilestoneSectionHtml(milestones, options) {
    options = options || {};
    var alwaysShow = !!options.alwaysShow;
    var mysteryLock = !!options.mysteryLock;
    var journeyEnded = isJourneyEndedDisplay();

    if (mysteryLock && !isJourneyMilestoneRevealed(options.mysteryUnlock || 0)) {
        return '<div class="mystery-lock"><span class="mystery-lock-icon">🔒</span></div>';
    }

    var html = '';
    var teaserShown = false;
    for (var i = 0; i < milestones.length; i++) {
        var m = milestones[i];
        if (alwaysShow || isJourneyMilestoneRevealed(m.unlockAt)) {
            var glow = shouldJourneyMilestoneGlow(m.day);
            var reached = journeyScoreSuccess() >= m.day;
            var cls = 'milestone-item';
            if (glow && !journeyEnded) cls += ' achieved-glow';
            else if (reached || glow) cls += ' achieved journey-ended-item';
            var status = formatJourneyMilestoneStatus(m.day);
            html +=
                '<div class="' + cls + '">' +
                    '<div class="milestone-info">' +
                        '<div class="milestone-icon">' + m.emoji + '</div>' +
                        '<div class="milestone-name">' + m.label + '</div>' +
                    '</div>' +
                    '<div class="milestone-status">' + status + '</div>' +
                '</div>';
        } else if (!teaserShown) {
            html +=
                '<div class="next-unlock">' +
                    '<span class="next-unlock-icon">🔒</span>' +
                    'Keep going to unlock' +
                '</div>';
            teaserShown = true;
        }
    }
    return html;
}

function renderMilestoneSection(containerEl, milestones, options) {
    if (!containerEl) return;
    var html = buildMilestoneSectionHtml(milestones, options);
    if (containerEl.innerHTML === html) return;
    containerEl.innerHTML = html;
}

function invalidateJourneyMilestonesRender() {
    lastJourneyMilestonesKey = '';
}

function renderJourneyMilestones() {
    var key = getJourneyMilestonesRenderKey();
    if (key === lastJourneyMilestonesKey) return;
    lastJourneyMilestonesKey = key;

    var journeyPane = document.getElementById('tab-journey');
    if (journeyPane) {
        journeyPane.classList.toggle('journey-ended-day', isJourneyEndedDisplay());
    }

    renderMilestoneSection(
        document.getElementById('strongSection'),
        expandSectionMilestones([75, 100, 150]),
        { alwaysShow: true },
    );

    renderMilestoneSection(
        document.getElementById('enduranceSection'),
        expandSectionMilestones([200, 300, 400]),
    );

    renderMilestoneSection(
        document.getElementById('legendarySection'),
        expandSectionMilestones([500, 750, 1000]),
        { mysteryLock: true, mysteryUnlock: 400 },
    );
}

const TAB_PANE_IDS = ['tab-streak', 'tab-journey', 'tab-science'];

function syncTabPanels() {
    var tabBar = document.querySelector('.tabs');
    if (tabBar) {
        var tabs = tabBar.querySelectorAll('.tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', i === currentTab);
        }
    }
    for (var j = 0; j < TAB_PANE_IDS.length; j++) {
        var pane = document.getElementById(TAB_PANE_IDS[j]);
        if (pane) pane.classList.toggle('active', j === currentTab);
    }
}

function switchTab(index) {
    if (!requirePremium()) return;
    currentTab = index;
    syncTabPanels();
    if (index === 2) {
        ensureDeferredHeavyRendered();
        renderBrainCard();
    }
}