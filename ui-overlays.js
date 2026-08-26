/**
 * ui-overlays.js — Popups and timers: toast, celebrations, urge surf, journey compare.
 * Edit here: popup text wiring, confetti, urge timer.
 */

// ════════════════════════════════════════════════════════
//  TOAST  — brief motivational message after a success
// ════════════════════════════════════════════════════════


function showToast(streak, customMsg) {
    const toast = document.getElementById('toast');
    const msg   = customMsg || TOAST_MESSAGES[Math.floor(Math.random() * TOAST_MESSAGES.length)];
    const sub   = streak > 1 ? `<div style="font-size:12px;opacity:0.65;margin-top:4px">Day ${streak} streak 🔥</div>` : '';
    toast.innerHTML = msg + sub;

    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.remove('show');
    void toast.offsetWidth; // force reflow so animation restarts
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ════════════════════════════════════════════════════════
//  CELEBRATIONS  — popup + confetti
// ════════════════════════════════════════════════════════

function triggerStreakMilestone(streak) {
    if (!STREAK_MILESTONES[streak]) return;

    // Day 1 long copy only once: first streak of this Journey (no slips yet in the archive list).
    // From the 2nd streak onward: stage + title only ("FIRST STEP" / "Day 1 Done.").
    if (streak === 1) {
        var base = STREAK_MILESTONES[1];
        var firstStreakOfJourney = !(state.currentJourneyStreaks
            && state.currentJourneyStreaks.length);
        var data = {
            emoji: base.emoji,
            stage: base.stage,
            title: base.title,
            message: firstStreakOfJourney ? base.message : '',
        };
        setTimeout(function () { showCelebration(data); }, 400);
        return;
    }

    setTimeout(function () { showCelebration(STREAK_MILESTONES[streak]); }, 400);
}

function triggerPersonalBestJourneyCelebration(successCount) {
    var data = buildPersonalBestJourneyCelebration(successCount);
    if (!data) return;
    setTimeout(function () { showCelebration(data); }, 600);
}

function triggerJourneyMilestone(days) {
    var data = buildJourneyMilestoneCelebration(days);
    if (!data) return;
    setTimeout(function () { showCelebration(data); }, 400);
}

function showCelebration(data, opts = {}) {
    celebrationQueue.push({
        data,
        autoCloseMs: opts.autoCloseMs || null,
        onClose: opts.onClose || null,
    });
    if (!celebrationShowing) {
        showNextCelebration();
    }
}

function showNextCelebration() {
    if (celebrationQueue.length === 0) {
        celebrationShowing = false;
        return;
    }

    celebrationShowing = true;
    const item = celebrationQueue.shift();
    celebrationOnClose = item.onClose || null;

    const { emoji, stage, title, message } = item.data;
    document.getElementById('celebEmoji').textContent   = emoji;
    document.getElementById('celebStage').textContent   = stage;
    document.getElementById('celebTitle').textContent   = title;
    document.getElementById('celebMessage').textContent = message;
    document.getElementById('celebrationOverlay').classList.add('active');
    launchConfetti();

    if (celebrationAutoCloseId) {
        clearTimeout(celebrationAutoCloseId);
        celebrationAutoCloseId = null;
    }
    if (item.autoCloseMs) {
        celebrationAutoCloseId = setTimeout(() => {
            celebrationAutoCloseId = null;
            closeCelebration();
        }, item.autoCloseMs);
    }
}

function closeCelebration() {
    document.getElementById('celebrationOverlay').classList.remove('active');
    stopConfetti();

    if (celebrationAutoCloseId) {
        clearTimeout(celebrationAutoCloseId);
        celebrationAutoCloseId = null;
    }

    const onClose = celebrationOnClose;
    celebrationOnClose = null;
    if (onClose) onClose();

    showNextCelebration();
}

// ════════════════════════════════════════════════════════
//  CONFETTI
// ════════════════════════════════════════════════════════



function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx     = canvas.getContext('2d');
    const COLORS  = ['#34c759','#ff9f0a','#007aff','#ff453a','#bf5af2','#ffd60a','#30d158'];

    // Cancel any running animation BEFORE resetting particles
    if (confettiAnimId) {
        cancelAnimationFrame(confettiAnimId);
        confettiAnimId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    confettiParticles = Array.from({ length: 120 }, () => ({
        x:            Math.random() * canvas.width,
        y:            Math.random() * canvas.height * -1,
        r:            Math.random() * 8 + 4,
        color:        COLORS[Math.floor(Math.random() * COLORS.length)],
        tiltAngle:    0,
        tiltAngleInc: (Math.random() * 0.07 + 0.05) * (Math.random() < 0.5 ? 1 : -1),
        vx:           Math.random() * 2 - 1,
        vy:           Math.random() * 3 + 2,
        alpha:        1,
    }));

    let frame = 0;

    function drawFrame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frame++;

        confettiParticles.forEach(p => {
            p.tiltAngle += p.tiltAngleInc;
            p.y += p.vy;
            p.x += p.vx;
            if (frame > 120) p.alpha -= 0.012;

            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.beginPath();
            ctx.lineWidth   = p.r;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + Math.sin(p.tiltAngle) * 12 + p.r / 4, p.y);
            ctx.lineTo(p.x + Math.sin(p.tiltAngle) * 12, p.y + Math.sin(p.tiltAngle) * 12 + p.r / 4);
            ctx.stroke();
            ctx.restore();
        });

        if (frame < 240 && confettiParticles.some(p => p.alpha > 0)) {
            confettiAnimId = requestAnimationFrame(drawFrame);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    drawFrame();
}

function stopConfetti() {
    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    const canvas = document.getElementById('confettiCanvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ════════════════════════════════════════════════════════
//  FEATURE 1: URGE SURFING TIMER
//  Optional coping timer with a breathing cue — not a cure claim.
//  Frame: ride the urge without acting on it.
// ════════════════════════════════════════════════════════



function startUrgeSurf() {
    // Log this urge with current hour for pattern analysis
    if (!state.urgeLog) state.urgeLog = [];
    state.urgeLog.push({ hour: new Date().getHours(), date: todayKey() });
    saveToStorage(state);

    const count = state.urgesSurfed || 0;
    if (count > 0) {
        showCelebration({
            emoji:   '🌊',
            stage:   'COPING TOOL',
            title:   'Ride the urge',
            message: `You've used this pause ${count} time${count !== 1 ? 's' : ''}. Optional support — no guarantees. Just stay with it without acting.`,
        }, {
            autoCloseMs: 2200,
            onClose: () => launchUrgeTimer(),
        });
    } else {
        launchUrgeTimer();
    }
}

function launchUrgeTimer() {
    // Clear any existing intervals before starting fresh
    clearInterval(urgeInterval);
    clearTimeout(breathTimeout);
    breathTimeout = null;

    urgeSecsLeft = URGE_DURATION_SECS;
    updateUrgeCountdown();
    document.getElementById('urgeOverlay').classList.add('active');
    startBreathing();

    urgeInterval = setInterval(() => {
        urgeSecsLeft--;
        updateUrgeCountdown();
        if (urgeSecsLeft <= 0) {
            clearInterval(urgeInterval);
            document.getElementById('urgePhase').textContent =
                "Time's up. If the urge is still here, you can stay with it — or close and keep choosing.";
        }
    }, 1000);
}

function updateUrgeCountdown() {
    const m = Math.floor(urgeSecsLeft / 60);
    const s = urgeSecsLeft % 60;
    document.getElementById('urgeCountdown').textContent =
        `${m}:${String(s).padStart(2, '0')}`;
}

function startBreathing() {
    const ring    = document.getElementById('breathRing');
    const label   = document.getElementById('breathLabel');
    const phase   = document.getElementById('urgePhase');
    const CIRCUMFERENCE = 339; // 2 * π * 54

    const PHASES = [
        { label: 'Breathe in',  phase: 'Inhale slowly for 4 seconds…',  offset: 0,            duration: 4 },
        { label: 'Hold',        phase: 'Hold… notice the urge without acting…', offset: 0,    duration: 4 },
        { label: 'Breathe out', phase: 'Exhale slowly for 4 seconds…',   offset: CIRCUMFERENCE, duration: 4 },
        { label: 'Rest',        phase: 'Rest. Optional pause — not a cure.', offset: CIRCUMFERENCE, duration: 2 },
    ];

    let phaseIndex = 0;

    clearTimeout(breathTimeout);

    function runPhase() {
        const p = PHASES[phaseIndex];
        label.textContent = p.label;
        phase.textContent = p.phase;
        ring.style.transition = `stroke-dashoffset ${p.duration}s ease-in-out`;
        ring.style.strokeDashoffset = p.offset;
        phaseIndex = (phaseIndex + 1) % PHASES.length;
        breathTimeout = setTimeout(runPhase, p.duration * 1000);
    }

    runPhase();
}

function urgeSurvived() {
    closeUrge();
    state.urgesSurfed = (state.urgesSurfed || 0) + 1;
    saveToStorage(state);
    showToast(state.currentStreak, `🌊 Pause used — ${state.urgesSurfed} time${state.urgesSurfed !== 1 ? 's' : ''}. Ride it without acting.`);
}

function closeUrge() {
    clearInterval(urgeInterval);
    clearTimeout(breathTimeout);
    breathTimeout = null;
    document.getElementById('urgeOverlay').classList.remove('active');
}

// ════════════════════════════════════════════════════════
//  FEATURE 3: JOURNEY COMPARISON CARD
//  Full-screen summary shown at the end of each journey.
//  Compares strong days against the previous all-time best score.
// ════════════════════════════════════════════════════════

function buildJourneyCompareRow(label, value) {
    return (
        '<div class="onb-journey-row">' +
            '<span>' + label + '</span>' +
            '<strong>' + value + '</strong>' +
        '</div>'
    );
}

function buildJourneyCompareCard(label, score, theme) {
    var success = Number(score.success) || 0;
    var failures = Number(score.failures) || 0;
    var themeCls = theme === 'gold' ? ' journey-compare-card-gold' : ' journey-compare-card-green';
    return (
        '<div class="onb-journey-card' + themeCls + '">' +
            '<div class="onb-journey-row onb-journey-label">' + label + '</div>' +
            buildJourneyCompareRow('Strong Days', success) +
            buildJourneyCompareRow('Relapses', failures) +
            buildJourneyCompareRow('Score', formatJourneyScore(score)) +
        '</div>'
    );
}

/**
 * Journey end comparison popup (beats prior best, or finished below it).
 * @param {object} current - { attempt, score: { success, failures } }
 * @param {{ success: number, failures: number }} prevBestScore - prior all-time best
 * @param {{ nextJourneyOpenToday?: boolean, prevBestAttempt?: number, beatBest?: boolean }} [opts]
 */
/**
 * Journey end comparison popup (beats prior best, or finished below it).
 */
function showJourneyComparison(current, prevBestScore, opts) {
    opts = opts || {};
    if (!prevBestScore) return;

    var beatBest = opts.beatBest != null
        ? opts.beatBest
        : isBetterJourneyScore(
            current.score.success,
            current.score.failures,
            prevBestScore,
        );

    var prevAttempt = opts.prevBestAttempt || '—';

    document.getElementById('compareNextNum').textContent = current.attempt + 1;

    const compareBtn = document.querySelector('.btn-compare-close');
    if (compareBtn) {
        compareBtn.innerHTML = opts.nextJourneyOpenToday
            ? 'Start Journey ' + (current.attempt + 1) + ' 💪'
            : 'Journey ' + (current.attempt + 1) + ' starts tomorrow';
    }

    const prevStrong = Number(prevBestScore.success) || 0;
    const curStrong = Number(current.score.success) || 0;
    const dayGain = curStrong - prevStrong;

    const improvePct = typeof getJourneyStrongDayImprovementPct === 'function'
        ? getJourneyStrongDayImprovementPct(curStrong, prevStrong)
        : null;

    var cardsHtml = '';
    var verdict = '';
    var verdictCls = 'onb-journey-verdict journey-compare-verdict';

    if (beatBest) {
        var prevLabel = 'Previous Best · Journey ' + prevAttempt;
        var newLabel = 'New Personal Best · Journey ' + current.attempt;
        cardsHtml =
            buildJourneyCompareCard(prevLabel, prevBestScore, 'green') +
            '<div class="onb-journey-arrow" aria-hidden="true">↓</div>' +
            buildJourneyCompareCard(newLabel, current.score, 'gold');

        if (dayGain > 0) {
            verdict = 'Your journey improved by ' + dayGain + ' day' + (dayGain !== 1 ? 's' : '');
            if (improvePct != null && improvePct > 0) {
                verdict += ' (' + improvePct + '%)';
            }
        } else if (curStrong === prevStrong
            && (Number(current.score.failures) || 0) < (Number(prevBestScore.failures) || 0)) {
            verdict = 'Same strong days — fewer slips';
        } else {
            verdict = 'New personal best';
        }
    } else {
        var currentLabel = 'Current Journey · Journey ' + current.attempt;
        var bestLabel = 'Best Journey · Journey ' + prevAttempt;
        cardsHtml =
            buildJourneyCompareCard(currentLabel, current.score, 'green') +
            '<div class="onb-journey-arrow" aria-hidden="true">↓</div>' +
            buildJourneyCompareCard(bestLabel, prevBestScore, 'gold');
    }

    var verdictHtml = verdict
        ? '<p class="' + verdictCls + '">' + verdict + '</p>'
        : '';

    document.getElementById('compareGrid').innerHTML =
        '<div class="onboarding-journey-compare journey-compare-popup" aria-label="Journey comparison">' +
            cardsHtml +
            verdictHtml +
        '</div>';

    document.getElementById('journeyCompareOverlay').classList.add('active');
}

function closeCompare() {
    document.getElementById('journeyCompareOverlay').classList.remove('active');
}

// ════════════════════════════════════════════════════════
//  LEARN THE JOURNEY
// ════════════════════════════════════════════════════════

function openLearnJourney() {
    var overlay = document.getElementById('learnJourneyOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    var panel = overlay.querySelector('.learn-journey-card-panel');
    if (panel) {
        var scroll = panel.querySelector('.learn-journey-scroll');
        if (scroll) scroll.scrollTop = 0;
    }
}

function closeLearnJourney() {
    var overlay = document.getElementById('learnJourneyOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}