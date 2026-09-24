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
        var isFirstJourneyFirstDay = firstStreakOfJourney
            && Math.max(1, Math.floor(Number(state.attempt) || 1)) === 1;
        var data = {
            emoji: base.emoji,
            stage: base.stage,
            title: base.title,
            message: isFirstJourneyFirstDay ? base.message : '',
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
    if (!celebrationShowing && typeof flushJourneyEndComparisonPending === 'function') {
        flushJourneyEndComparisonPending();
    }
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

let breathAudioCtx = null;
let activeBreathSound = null;

function getBreathAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!breathAudioCtx) breathAudioCtx = new Ctx();
    if (breathAudioCtx.state === 'suspended') {
        breathAudioCtx.resume().catch(function (err) {
            if (typeof logOptionalFailure === 'function') {
                logOptionalFailure('breath-audio-resume', err);
            }
        });
    }
    return breathAudioCtx;
}

function fillBreathNoiseBuffer(buffer) {
    var data = buffer.getChannelData(0);
    var brown = 0;
    for (var i = 0; i < data.length; i++) {
        var white = Math.random() * 2 - 1;
        brown = (brown + 0.028 * white) / 1.028;
        data[i] = brown * 2.8;
    }
}

function stopBreathSound() {
    if (!activeBreathSound) return;
    activeBreathSound.forEach(function (node) {
        try {
            if (node.stop) node.stop(0);
            node.disconnect();
        } catch (e) {}
    });
    activeBreathSound = null;
}

/** Inhale/exhale breath whoosh via bandpassed brown noise (no audio files). */
function playBreathSound(kind, durationSec) {
    stopBreathSound();
    var ctx = getBreathAudioContext();
    if (!ctx) return;

    var duration = Math.max(0.5, Number(durationSec) || 4);
    var now = ctx.currentTime;
    var nodes = [];
    var peak = typeof BREATH_SOUND_GAIN === 'number' ? BREATH_SOUND_GAIN : 0.62;
    var isIn = kind === 'in';

    var bufferSize = Math.floor(ctx.sampleRate * 3);
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    fillBreathNoiseBuffer(buffer);

    var source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    nodes.push(source);

    var bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.value = isIn ? 0.55 : 0.85;

    var lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4200;
    lowpass.Q.value = 0.4;

    var gain = ctx.createGain();

    if (isIn) {
        bandpass.frequency.setValueAtTime(280, now);
        bandpass.frequency.exponentialRampToValueAtTime(2400, now + duration * 0.78);
        bandpass.frequency.exponentialRampToValueAtTime(900, now + duration);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + duration * 0.22);
        gain.gain.setValueAtTime(peak * 0.95, now + duration * 0.65);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } else {
        bandpass.frequency.setValueAtTime(2000, now);
        bandpass.frequency.exponentialRampToValueAtTime(320, now + duration * 0.92);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak * 0.92, now + duration * 0.12);
        gain.gain.setValueAtTime(peak * 0.85, now + duration * 0.45);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    }

    source.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration + 0.08);
    nodes.push(bandpass, lowpass, gain);
    activeBreathSound = nodes;
}

function startUrgeSurf() {
    getBreathAudioContext();

    if (!state.urgeLog) state.urgeLog = [];
    state.urgeLog.push({ hour: new Date().getHours(), date: todayKey() });
    saveToStorage(state);

    launchUrgeTimer();
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
        if (urgeSecsLeft <= 0) {
            urgeSecsLeft = URGE_DURATION_SECS;
        }
        updateUrgeCountdown();
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
    const inSecs = typeof BREATH_IN_SECS === 'number' ? BREATH_IN_SECS : 4;
    const outSecs = typeof BREATH_OUT_SECS === 'number' ? BREATH_OUT_SECS : 4;

    const PHASES = [
        {
            label: 'Breathe in',
            phase: 'Inhale slowly for ' + inSecs + ' seconds…',
            offset: 0,
            duration: inSecs,
            sound: 'in',
        },
        {
            label: 'Breathe out',
            phase: 'Exhale slowly for ' + outSecs + ' seconds…',
            offset: CIRCUMFERENCE,
            duration: outSecs,
            sound: 'out',
        },
    ];

    let phaseIndex = 0;

    clearTimeout(breathTimeout);
    stopBreathSound();

    function runPhase() {
        var overlay = document.getElementById('urgeOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;

        const p = PHASES[phaseIndex];
        label.textContent = p.label;
        phase.textContent = p.phase;
        ring.style.transition = 'stroke-dashoffset ' + p.duration + 's ease-in-out';
        ring.style.strokeDashoffset = p.offset;
        playBreathSound(p.sound, p.duration);
        phaseIndex = (phaseIndex + 1) % PHASES.length;
        breathTimeout = setTimeout(runPhase, p.duration * 1000);
    }

    runPhase();
}

function closeUrge() {
    clearInterval(urgeInterval);
    clearTimeout(breathTimeout);
    breathTimeout = null;
    stopBreathSound();
    document.getElementById('urgeOverlay').classList.remove('active');
}

let compareShouldBeginNextOnClose = false;
let compareDismissMeta = null;
let journeyEndComparisonPending = null;
let journeyEndComparisonRetryTimers = [];

function isJourneyCompareOverlayActive() {
    var overlay = document.getElementById('journeyCompareOverlay');
    return !!(overlay && overlay.classList.contains('active'));
}

function clearJourneyEndComparisonPending() {
    journeyEndComparisonPending = null;
    journeyEndComparisonRetryTimers.forEach(function (id) { clearTimeout(id); });
    journeyEndComparisonRetryTimers = [];
}

function shouldPresentJourneyComparison(comparison) {
    if (!comparison || !comparison.score) return false;
    return !(typeof wasJourneyComparisonShown === 'function' && wasJourneyComparisonShown(comparison));
}

function queueJourneyEndComparison(comparison, opts) {
    opts = opts || {};
    if (!shouldPresentJourneyComparison(comparison)) {
        clearJourneyEndComparisonPending();
        return false;
    }
    journeyEndComparisonPending = {
        comparison: comparison,
        opts: opts,
    };
    return flushJourneyEndComparisonPending();
}

function scheduleJourneyEndComparisonRetries() {
    journeyEndComparisonRetryTimers.forEach(function (id) { clearTimeout(id); });
    journeyEndComparisonRetryTimers = [];
    [50, 120, 300, 600, 1200, 2500, 5000].forEach(function (ms) {
        var id = setTimeout(function () {
            if (!journeyEndComparisonPending) return;
            if (isJourneyCompareOverlayActive()) return;
            flushJourneyEndComparisonPending();
        }, ms);
        journeyEndComparisonRetryTimers.push(id);
    });
}

/** Paint queued journey-end comparison when DOM is ready. */
function flushJourneyEndComparisonPending() {
    if (!journeyEndComparisonPending) return false;
    var pending = journeyEndComparisonPending;
    if (!shouldPresentJourneyComparison(pending.comparison)) {
        clearJourneyEndComparisonPending();
        return false;
    }
    if (isJourneyCompareOverlayActive()) return true;

    var painted = paintJourneyEndComparison(pending.comparison, pending.opts);
    if (painted) {
        clearJourneyEndComparisonPending();
        return true;
    }
    scheduleJourneyEndComparisonRetries();
    return false;
}

function paintJourneyEndComparison(comparison, opts) {
    opts = opts || {};
    if (!shouldPresentJourneyComparison(comparison)) return false;
    if (isJourneyCompareOverlayActive()) return true;

    var beatPreviousBest = comparison.prevBestScore
        && (opts.beatBest != null
            ? opts.beatBest
            : isBetterJourneyScore(
                comparison.score.success,
                comparison.score.failures,
                comparison.prevBestScore,
            ));

    var payload = {
        nextJourneyOpenToday: !!opts.nextJourneyOpenToday,
        prevBestAttempt: comparison.prevBestAttempt,
        beatBest: beatPreviousBest,
        journeyEndedDate: comparison.journeyEndedDate || '',
    };
    var current = { attempt: comparison.attempt, score: comparison.score };

    var grid = document.getElementById('compareGrid');
    var overlay = document.getElementById('journeyCompareOverlay');
    if (!grid || !overlay) return false;

    showJourneyComparison(current, comparison.prevBestScore, payload);
    return isJourneyCompareOverlayActive();
}

/** Queue + paint journey-end comparison with retries until visible or dismissed. */
function presentJourneyEndComparison(comparison, opts) {
    opts = opts || {};
    if (!comparison || !comparison.score) return false;
    if (!shouldPresentJourneyComparison(comparison)) return false;

    queueJourneyEndComparison(comparison, opts);
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { flushJourneyEndComparisonPending(); });
    }
    return true;
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

function resolveJourneyCompareCardMeta(entry, beatBest) {
    if (entry.side === 'prior') {
        if (beatBest) {
            return {
                label: 'Previous Best · Journey ' + entry.attempt,
                theme: 'green',
            };
        }
        return {
            label: 'Best Journey · Journey ' + entry.attempt,
            theme: 'gold',
        };
    }
    if (beatBest) {
        return {
            label: 'New Personal Best · Journey ' + entry.attempt,
            theme: 'gold',
        };
    }
    return {
        label: 'Current Journey · Journey ' + entry.attempt,
        theme: 'green',
    };
}

/** Earlier journey on top, latest (just ended) on bottom. */
function buildChronologicalJourneyCompareCards(priorAttempt, priorScore, currentAttempt, currentScore, beatBest) {
    var entries = [
        {
            attempt: Math.max(1, Math.floor(Number(priorAttempt) || 1)),
            score: priorScore,
            side: 'prior',
        },
        {
            attempt: Math.max(1, Math.floor(Number(currentAttempt) || 1)),
            score: currentScore,
            side: 'current',
        },
    ].sort(function (a, b) {
        return a.attempt - b.attempt;
    });

    var html = '';
    for (var i = 0; i < entries.length; i++) {
        if (i > 0) {
            html += '<div class="onb-journey-arrow" aria-hidden="true">↓</div>';
        }
        var meta = resolveJourneyCompareCardMeta(entries[i], beatBest);
        html += buildJourneyCompareCard(meta.label, entries[i].score, meta.theme);
    }
    return html;
}

function buildFirstJourneyEndHtml(current) {
    var attempt = Math.max(1, Math.floor(Number(current.attempt) || 1));
    var nextAttempt = attempt + 1;
    var nextTarget = typeof getNextJourneyTargetGoal === 'function'
        ? getNextJourneyTargetGoal()
        : 'Target 25 strong days';

    return (
        buildJourneyCompareCard('Journey ' + attempt, current.score, 'gold') +
        '<p class="onb-journey-verdict journey-compare-verdict">' +
            'Your target for Journey ' + nextAttempt + ' — ' + nextTarget +
        '</p>'
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
    if (!current || !current.score) return;

    var compareGrid = document.getElementById('compareGrid');
    var compareOverlay = document.getElementById('journeyCompareOverlay');
    if (!compareGrid || !compareOverlay) return;

    var nextAttempt = Math.max(1, Math.floor(Number(current.attempt) || 1)) + 1;
    var compareBtn = document.querySelector('.btn-compare-close');
    if (compareBtn) {
        compareBtn.innerHTML = opts.nextJourneyOpenToday
            ? 'Start Journey <span id="compareNextNum">' + nextAttempt + '</span> 💪'
            : 'Journey <span id="compareNextNum">' + nextAttempt + '</span> starts tomorrow';
    }

    var cardsHtml = '';
    var verdict = '';
    var verdictCls = 'onb-journey-verdict journey-compare-verdict';

    if (Math.max(1, Math.floor(Number(current.attempt) || 1)) === 1) {
        cardsHtml = buildFirstJourneyEndHtml(current);
    } else if (!prevBestScore) {
        cardsHtml = buildJourneyCompareCard(
            'Journey ' + current.attempt + ' Complete',
            current.score,
            'gold',
        );
    } else {
    var beatBest = opts.beatBest != null
        ? opts.beatBest
        : isBetterJourneyScore(
            current.score.success,
            current.score.failures,
            prevBestScore,
        );

    var prevAttempt = opts.prevBestAttempt || '—';

    const prevStrong = Number(prevBestScore.success) || 0;
    const curStrong = Number(current.score.success) || 0;
    const dayGain = curStrong - prevStrong;

    cardsHtml = buildChronologicalJourneyCompareCards(
        prevAttempt,
        prevBestScore,
        current.attempt,
        current.score,
        beatBest,
    );

    if (beatBest) {
        if (dayGain > 0) {
            verdict = 'Your journey improved by ' + dayGain + ' day' + (dayGain !== 1 ? 's' : '');
        } else if (curStrong === prevStrong
            && (Number(current.score.failures) || 0) < (Number(prevBestScore.failures) || 0)) {
            verdict = 'Same strong days — fewer slips';
        } else {
            verdict = 'New personal best';
        }
    }
    }

    var verdictHtml = verdict
        ? '<p class="' + verdictCls + '">' + verdict + '</p>'
        : '';

    compareGrid.innerHTML =
        '<div class="onboarding-journey-compare journey-compare-popup" aria-label="Journey comparison">' +
            cardsHtml +
            verdictHtml +
        '</div>';

    compareOverlay.classList.add('active');
    compareShouldBeginNextOnClose = !!opts.nextJourneyOpenToday;
    compareDismissMeta = {
        attempt: current.attempt,
        journeyEndedDate: opts.journeyEndedDate || '',
    };
}

function closeCompare() {
    document.getElementById('journeyCompareOverlay').classList.remove('active');
    clearJourneyEndComparisonPending();
    if (compareDismissMeta && typeof markJourneyComparisonShown === 'function') {
        markJourneyComparisonShown(compareDismissMeta);
        compareDismissMeta = null;
    }
    if (compareShouldBeginNextOnClose) {
        compareShouldBeginNextOnClose = false;
        if (typeof isAwaitingNextJourney === 'function' && isAwaitingNextJourney()
            && typeof canBeginNextJourneyToday === 'function' && canBeginNextJourneyToday()) {
            beginNextJourney();
            chartPage = -1;
            if (typeof saveAndRender === 'function') saveAndRender();
        }
    }
}

function canAdvancePastAwaitingJourneyComparison(comparison) {
    if (!comparison || !comparison.score) return true;
    return typeof wasJourneyComparisonShown === 'function' && wasJourneyComparisonShown(comparison);
}

/** @returns {boolean} true when comparison overlay is visible and user must dismiss it */
function tryShowAwaitingJourneyComparison(canOpenNextToday) {
    if (typeof isAwaitingNextJourney !== 'function' || !isAwaitingNextJourney()) return false;
    if (typeof buildComparisonForAwaitingJourney !== 'function') return false;

    var comparison = buildComparisonForAwaitingJourney();
    if (!canAdvancePastAwaitingJourneyComparison(comparison)) {
        queueJourneyEndComparison(comparison, { nextJourneyOpenToday: !!canOpenNextToday });
    }
    return isJourneyCompareOverlayActive();
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

function openAppSettings() {
    var overlay = document.getElementById('appSettingsOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    var scroll = overlay.querySelector('.settings-sheet-scroll');
    if (scroll) scroll.scrollTop = 0;
}

function closeAppSettings() {
    var overlay = document.getElementById('appSettingsOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

function openPrivacy() {
    var overlay = document.getElementById('privacyOverlay');
    var body = document.getElementById('privacyOverlayBody');
    if (!overlay || !body) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    body.scrollTop = 0;

    if (body.dataset.loaded === '1') return;

    var embedded = window.KING_PRIVACY_POLICY_BODY;
    if (typeof embedded === 'string' && embedded.length) {
        body.innerHTML = embedded;
        body.dataset.loaded = '1';
        return;
    }

    var privacyUrl = new URL('privacy.html', window.location.href).href;
    fetch(privacyUrl)
        .then(function (res) {
            if (!res.ok) throw new Error('privacy fetch failed');
            return res.text();
        })
        .then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var wrap = doc.querySelector('main.wrap') || doc.querySelector('.wrap');
            if (!wrap) throw new Error('privacy parse failed');
            var h1 = wrap.querySelector('h1');
            if (h1) h1.remove();
            var back = wrap.querySelector('.back-app');
            if (back) back.remove();
            body.innerHTML = wrap.innerHTML;
            body.dataset.loaded = '1';
        })
        .catch(function () {
            body.innerHTML =
                '<p class="privacy-error">Could not load the privacy policy here. ' +
                '<a href="./privacy.html" target="_blank" rel="noopener noreferrer">Open privacy policy</a></p>';
        });
}

function closePrivacy() {
    var overlay = document.getElementById('privacyOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}