/**
 * ui-history.js — Charts and history views: streak chart, month grid, lifetime stats.
 * Edit here: graph layout, calendar colors, collapsible month/chart panels.
 */

// ── Collapsible panels (independent — both may be open) ──

function toggleMonthPanel() {
    if (!requirePremium()) return;
    monthPanelOpen = !monthPanelOpen;
    syncHistoryPanels();
}

function toggleChartPanel() {
    if (!requirePremium()) return;
    chartPanelOpen = !chartPanelOpen;
    syncHistoryPanels();
}

function toggleLifetimePanel() {
    lifetimePanelOpen = !lifetimePanelOpen;
    syncHistoryPanels();
}

function toggleBackupResetPanel() {
    backupResetPanelOpen = !backupResetPanelOpen;
    syncHistoryPanels();
}

function syncHistoryPanels() {
    var monthOpen = monthPanelOpen;
    var chartOpen = chartPanelOpen;
    var lifetimeOpen = lifetimePanelOpen;
    var backupOpen = backupResetPanelOpen;
    if (monthOpen || chartOpen || lifetimeOpen) ensureDeferredHeavyRendered();
    var el;

    el = document.getElementById('chartPanelTitle');
    if (el) el.textContent = 'Progress';

    el = document.getElementById('monthPanelBody');
    if (el) el.classList.toggle('is-open', monthOpen);
    el = document.getElementById('chartPanelBody');
    if (el) el.classList.toggle('is-open', chartOpen);
    el = document.getElementById('lifetimePanelBody');
    if (el) el.classList.toggle('is-open', lifetimeOpen);
    el = document.getElementById('backupResetBody');
    if (el) el.classList.toggle('is-open', backupOpen);
    el = document.getElementById('monthPanelChevron');
    if (el) el.classList.toggle('open', monthOpen);
    el = document.getElementById('chartPanelChevron');
    if (el) el.classList.toggle('open', chartOpen);
    el = document.getElementById('lifetimePanelChevron');
    if (el) el.classList.toggle('open', lifetimeOpen);
    el = document.getElementById('backupResetChevron');
    if (el) el.classList.toggle('open', backupOpen);
    el = document.getElementById('monthPanelToggle');
    if (el) el.setAttribute('aria-expanded', monthOpen ? 'true' : 'false');
    el = document.getElementById('chartPanelToggle');
    if (el) el.setAttribute('aria-expanded', chartOpen ? 'true' : 'false');
    el = document.getElementById('lifetimePanelToggle');
    if (el) el.setAttribute('aria-expanded', lifetimeOpen ? 'true' : 'false');
    el = document.getElementById('backupResetToggle');
    if (el) el.setAttribute('aria-expanded', backupOpen ? 'true' : 'false');

    if (chartOpen) renderChart();
}

(function initHistoryPanels() {
    var monthBtn = document.getElementById('monthPanelToggle');
    if (monthBtn) {
        monthBtn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleMonthPanel();
        });
    }
    var chartBtn = document.getElementById('chartPanelToggle');
    if (chartBtn) {
        chartBtn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleChartPanel();
        });
    }
    var lifetimeBtn = document.getElementById('lifetimePanelToggle');
    if (lifetimeBtn) {
        lifetimeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleLifetimePanel();
        });
    }
    var backupBtn = document.getElementById('backupResetToggle');
    if (backupBtn) {
        backupBtn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleBackupResetPanel();
        });
    }
})();

function switchChartMode(mode) {
    chartMode = mode;
    chartPage = -1;
    document.getElementById('toggleStreaks').classList.toggle('active', mode === 'streaks');
    document.getElementById('toggleJourneys').classList.toggle('active', mode === 'journeys');
    renderChart();
}

// ════════════════════════════════════════════════════════
//  STREAK CHART
// ════════════════════════════════════════════════════════

const STREAKS_PER_PAGE = 10;
const JOURNEYS_PER_PAGE = 6;

function getChartWindow() {
    return chartMode === 'journeys' ? JOURNEYS_PER_PAGE : STREAKS_PER_PAGE;
}

function updateChartNavButtons(canGoLeft, canGoRight, hasNav) {
    const prevBtn = document.getElementById('chartNavPrev');
    const nextBtn = document.getElementById('chartNavNext');
    const row = document.getElementById('chartNavRow');
    if (!prevBtn || !nextBtn || !row) return;

    row.style.display = hasNav ? 'flex' : 'none';
    prevBtn.disabled = !canGoLeft;
    nextBtn.disabled = !canGoRight;
}

/** Completed + current journeys with their streak segments. */
function getJourneyStreakEntries() {
    const entries = state.pastJourneyStreaks.map(journey => ({
        attempt: journey.attempt,
        streaks: [...(journey.streaks || [])],
        isLive: false,
    }));

    const currentStreaks = [...(state.currentJourneyStreaks || [])];
    const hasLiveStreak = state.currentStreak > 0;
    if (!isAwaitingNextJourney() && (currentStreaks.length > 0 || hasLiveStreak)) {
        entries.push({
            attempt: state.attempt,
            streaks: currentStreaks,
            currentStreak: state.currentStreak,
            isLive: true,
        });
    }

    return entries;
}

/** Streak mode: one journey per page slice (max 10 streaks, never mixed across journeys). */
function buildStreakChartPages() {
    const pages = [];
    let streakNum = 1;

    getJourneyStreakEntries().forEach(journey => {
        const journeyPoints = [];

        journey.streaks.forEach(val => {
            journeyPoints.push({ val, label: `S${streakNum++}` });
        });
        if (journey.isLive && journey.currentStreak > 0) {
            journeyPoints.push({
                val: journey.currentStreak,
                label: `S${streakNum}…`,
                live: true,
            });
            streakNum++;
        }

        for (let i = 0; i < journeyPoints.length; i += STREAKS_PER_PAGE) {
            pages.push({
                attempt: journey.attempt,
                points: journeyPoints.slice(i, i + STREAKS_PER_PAGE),
            });
        }
    });

    return pages;
}

function getAllStreakPoints() {
    return buildStreakChartPages().flatMap(page => page.points);
}

/**
 * Returns data points for journeys chart mode (one point per journey).
 * Live journey appears once the attempt has any activity (strong *or* slip),
 * so a slip-only J1… at 0 renders instead of the empty “begins today” copy.
 */
function hasActiveJourneySeries() {
    if ((state.score && state.score.success) > 0) return true;
    if ((state.score && state.score.failures) > 0) return true;
    if ((state.currentStreak || 0) > 0) return true;
    if ((state.currentJourneyStreaks || []).length > 0) return true;
    return false;
}

function getJourneyChartPoints() {
    const points = state.completedJourneys.map(j => ({
        val: j.score.success,
        label: `J${j.attempt}`,
    }));
    // Journey is archived on end but score resets only on the next calendar day —
    // skip the live point while awaiting, or J1 and J1… appear together.
    if (!isAwaitingNextJourney() && hasActiveJourneySeries()) {
        points.push({
            val: state.score.success || 0,
            label: `J${state.attempt}…`,
            live: true,
        });
    }
    return points;
}

function getChartPagination() {
    if (chartMode === 'journeys') {
        const points = getJourneyChartPoints();
        const maxPage = Math.max(0, points.length - JOURNEYS_PER_PAGE);
        if (chartPage === -1 || chartPage > maxPage) chartPage = maxPage;
        return {
            points,
            show: points.slice(chartPage, chartPage + JOURNEYS_PER_PAGE),
            maxPage,
            hasNav: points.length > JOURNEYS_PER_PAGE,
        };
    }

    const pages = buildStreakChartPages();
    const maxPage = Math.max(0, pages.length - 1);
    if (chartPage === -1 || chartPage > maxPage) chartPage = maxPage;
    const page = pages[chartPage] || { points: [] };
    return {
        points: getAllStreakPoints(),
        show: page.points,
        maxPage,
        hasNav: pages.length > 1,
        journeyAttempt: page.attempt,
    };
}

function chartNav(dir) {
    const { maxPage } = getChartPagination();
    chartPage = clamp(chartPage + dir, 0, maxPage);
    renderChart();
}

// Math.clamp polyfill (not in all browsers yet)
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

const CHART_H       = 180;
const CHART_PAD_T   = 24;
const CHART_PAD_B   = 18;
const CHART_Y_GUT   = 36;
const CHART_PLOT_W  = 400;
const CHART_VW      = CHART_Y_GUT + CHART_PLOT_W;
const CHART_PAD_X   = CHART_PLOT_W * 0.04;

function chartYForValue(value, yMax) {
    const cH = CHART_H - CHART_PAD_T - CHART_PAD_B;
    return CHART_PAD_T + cH - (value / yMax) * cH;
}

function chartYForFrac(frac) {
    const cH = CHART_H - CHART_PAD_T - CHART_PAD_B;
    return CHART_PAD_T + cH - frac * cH;
}

function chartPlotX(index, slotCount) {
    const plotLeft = CHART_Y_GUT + CHART_PAD_X;
    const plotSpan = CHART_PLOT_W - CHART_PAD_X * 2;
    if (slotCount <= 1) return plotLeft;
    return plotLeft + (index / (slotCount - 1)) * plotSpan;
}

function buildChartYLabels(yFracs, yMax, muted) {
    const fill = muted ? 'rgba(134,134,139,0.5)' : 'rgba(134,134,139,0.85)';
    return yFracs.map(f => {
        const y = chartYForFrac(f);
        return `<text x="32" y="${y}" text-anchor="end" dominant-baseline="middle"
            font-size="9" font-weight="500" fill="${fill}"
            font-family="-apple-system,sans-serif">${Math.round(f * yMax)}</text>`;
    }).join('');
}

function buildChartGridLines(yFracs, muted) {
    const x1 = CHART_Y_GUT + CHART_PAD_X;
    const x2 = CHART_Y_GUT + CHART_PLOT_W - CHART_PAD_X;
    return yFracs.map(f => {
        const y = chartYForFrac(f);
        return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
            stroke="rgba(0,0,0,${f === 0 ? (muted ? '0.10' : '0.10') : (muted ? '0.04' : '0.05')})"
            stroke-width="${f === 0 ? 1.5 : 1}"/>`;
    }).join('');
}

function setHistoryEmptyVisible(id, visible) {
    var el = document.getElementById(id);
    if (el) el.hidden = !visible;
}

function hasAnyDailyLogEntries() {
    var log = state.dailyLog || {};
    var keys = Object.keys(log);
    for (var i = 0; i < keys.length; i++) {
        if (logStatus(log[keys[i]])) return true;
    }
    return false;
}

function renderChart() {
    const outer = document.getElementById('chartOuter');
    const cH = CHART_H - CHART_PAD_T - CHART_PAD_B;
    const xLabelY = CHART_PAD_T + cH + 10;
    const yFracs = [0, 0.25, 0.5, 0.75, 1];
    const emptyEl = document.getElementById('chartEmptyState');
    const titleEl = document.getElementById('chartEmptyTitle');
    const subEl = document.getElementById('chartEmptySub');
    const svgEl = document.getElementById('chartInner');

    const pagination = getChartPagination();
    const { points, show, maxPage, hasNav } = pagination;

    if (points.length === 0 || show.length === 0) {
        outer.style.display = 'flex';
        updateChartNavButtons(false, false, false);

        const yMax = 30;
        if (svgEl) {
            svgEl.setAttribute('viewBox', `0 0 ${CHART_VW} ${CHART_H}`);
            svgEl.classList.add('is-empty');
            svgEl.innerHTML = `
                ${buildChartYLabels(yFracs, yMax, true)}
                ${buildChartGridLines(yFracs, true)}
                <line x1="${CHART_Y_GUT}" y1="${CHART_PAD_T}" x2="${CHART_Y_GUT}" y2="${CHART_PAD_T + cH}"
                    stroke="rgba(0,0,0,0.08)" stroke-width="1.5"/>`;
        }

        if (titleEl) {
            titleEl.textContent = 'Your first Journey begins today.';
        }
        if (subEl) {
            subEl.textContent = chartMode === 'journeys'
                ? 'Check in daily — each Journey will show here as you grow.'
                : 'Check in daily to see your streak progress here.';
        }
        setHistoryEmptyVisible('chartEmptyState', true);
        return;
    }

    setHistoryEmptyVisible('chartEmptyState', false);
    if (svgEl) svgEl.classList.remove('is-empty');

    outer.style.display = 'flex';

    const allTimeMax = Math.max(...points.map(p => p.val), 1);
    const yMax       = Math.max(Math.ceil(allTimeMax * 1.25 / 5) * 5, 5);

    // Journeys: same live-or-permanent pick as the header Best box (realtime at 21/9).
    const displayBest = chartMode === 'journeys' && typeof getDisplayBestJourney === 'function'
        ? getDisplayBestJourney()
        : null;
    const bestVal = chartMode === 'journeys'
        ? ((displayBest && displayBest.success) || 0)
        : state.longestStreak;

    const gridLines = buildChartGridLines(yFracs, false) +
        `<line x1="${CHART_Y_GUT}" y1="${CHART_PAD_T}" x2="${CHART_Y_GUT}" y2="${CHART_PAD_T + cH}"
            stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>`;

    const isCurrentBest = chartMode === 'journeys'
        ? !!(displayBest
            && typeof isAwaitingNextJourney === 'function' && !isAwaitingNextJourney()
            && (state.score.success || 0) > 0
            && (state.score.success || 0) === (displayBest.success || 0)
            && (state.score.failures || 0) === (displayBest.failures || 0))
        : state.currentStreak > 0 && state.currentStreak === state.longestStreak;
    const slotCount = getChartWindow();

    // When live is the display best, only the live node is gold (not an older bar at a lower val).
    const pts = show.map((p, i) => ({
        x:          chartPlotX(i, slotCount),
        y:          chartYForValue(p.val, yMax),
        val:        p.val,
        label:      p.label,
        isBest:     !p.live && !isCurrentBest && p.val === bestVal && bestVal > 0,
        isLive:     !!p.live,
        isLiveBest: !!p.live && isCurrentBest,
    }));

    const polyPoints = pts.length > 1
        ? `${pts.map(p => `${p.x},${p.y}`).join(' ')} ${pts.at(-1).x},${CHART_PAD_T + cH} ${pts[0].x},${CHART_PAD_T + cH}`
        : '';

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    const nodes = pts.map(p => {
        const color = p.isLiveBest ? '#ff9f0a' : p.isLive ? '#34c759' : p.isBest ? '#ff9f0a' : '#34c759';
        const r     = p.isBest || p.isLiveBest ? 6 : 5;

        if (p.isLive) {
            const glowClass = p.isLiveBest ? 'chart-dot-live-glow--orange' : 'chart-dot-live-glow--green';
            return `
            <g class="chart-dot-live" transform="translate(${p.x}, ${p.y})">
                <circle class="chart-dot-live-glow ${glowClass}" cx="0" cy="0" r="${r + 4}"/>
                <circle cx="0" cy="0" r="${r}" fill="white" stroke="${color}" stroke-width="2.5"/>
            </g>
            <text x="${p.x}" y="${p.y - 11}" text-anchor="middle"
                font-size="11" font-weight="700" fill="${color}"
                font-family="-apple-system,sans-serif">${p.val}</text>
            <text x="${p.x}" y="${xLabelY}" text-anchor="middle"
                font-size="10" fill="rgba(134,134,139,0.9)"
                font-family="-apple-system,sans-serif">${p.label}</text>`;
        }

        const halo = p.isBest
            ? `<circle cx="${p.x}" cy="${p.y}" r="${r + 5}" fill="rgba(255,159,10,0.12)"/>`
            : `<circle cx="${p.x}" cy="${p.y}" r="${r + 5}" fill="rgba(52,199,89,0.08)"/>`;
        return `
            ${halo}
            <circle cx="${p.x}" cy="${p.y}" r="${r}"
                fill="white" stroke="${color}" stroke-width="2.5"/>
            <text x="${p.x}" y="${p.y - 11}" text-anchor="middle"
                font-size="11" font-weight="700" fill="${color}"
                font-family="-apple-system,sans-serif">${p.val}</text>
            <text x="${p.x}" y="${xLabelY}" text-anchor="middle"
                font-size="10" fill="rgba(134,134,139,0.9)"
                font-family="-apple-system,sans-serif">${p.label}</text>`;
    }).join('');

    const canGoLeft = chartPage > 0;
    const canGoRight = chartPage < maxPage;
    updateChartNavButtons(canGoLeft, canGoRight, hasNav);

    if (svgEl) {
        svgEl.setAttribute('viewBox', `0 0 ${CHART_VW} ${CHART_H}`);
        svgEl.innerHTML = `
        <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="#34c759" stop-opacity="0.15"/>
                <stop offset="100%" stop-color="#34c759" stop-opacity="0"/>
            </linearGradient>
        </defs>
        ${buildChartYLabels(yFracs, yMax, false)}
        ${gridLines}
        ${pts.length > 1 ? `<polygon points="${polyPoints}" fill="url(#areaGrad)"/>` : ''}
        ${pts.length > 1 ? `<path d="${linePath}" fill="none" stroke="#34c759"
            stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${nodes}`;
    }
}

// ════════════════════════════════════════════════════════
//  MONTHLY GRID
// ════════════════════════════════════════════════════════

function monthNav(dir) {
    monthOffset += dir;
    if (monthOffset > 0) monthOffset = 0;

    // Don't go before the month the journey started
    // Find earliest date in dailyLog
    const log   = state.dailyLog || {};
    const appToday = todayKey();
    const dates = Object.values(log)
        .map(e => (typeof e === 'object') ? e.date : null)
        .filter(function (d) { return d && d <= appToday; })
        .sort();

    if (dates.length > 0) {
        const earliest   = parseDateKey(dates[0]);
        const today      = parseDateKey(appToday);
        const minOffset  = (earliest.getFullYear() - today.getFullYear()) * 12
                         + (earliest.getMonth() - today.getMonth());
        if (monthOffset < minOffset) monthOffset = minOffset;
    }

    renderMonthGrid();
}

function renderMonthGrid() {
    const grid    = document.getElementById('monthGrid');
    const log     = state.dailyLog || {};
    const appToday = todayKey();
    const todayDate = parseDateKey(appToday);

    // Apply monthOffset to get the target month (anchored to app "today", including dev offset)
    const ref   = parseDateKey(appToday);
    ref.setDate(1);
    ref.setMonth(ref.getMonth() + monthOffset);

    const year           = ref.getFullYear();
    const month          = ref.getMonth();
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();

    // Month + year label (inside expanded panel nav)
    const monthName = ref.toLocaleString('default', { month: 'long', year: 'numeric' });
    const navTitle = document.getElementById('monthGridNavTitle');
    if (navTitle) navTitle.textContent = monthName;

    // Disable next arrow if on current month
    const nextBtn = document.getElementById('monthNavNext');
    if (nextBtn) nextBtn.disabled = monthOffset >= 0;

    // Disable prev arrow if at journey start month
    const prevBtn = document.getElementById('monthNavPrev');
    if (prevBtn) {
        const dates = Object.values(log)
            .map(e => (typeof e === 'object') ? e.date : null)
            .filter(function (d) { return d && d <= appToday; })
            .sort();
        if (dates.length > 0) {
            const earliest  = parseDateKey(dates[0]);
            const minOffset = (earliest.getFullYear() - todayDate.getFullYear()) * 12
                            + (earliest.getMonth() - todayDate.getMonth());
            prevBtn.disabled = monthOffset <= minOffset;
        } else {
            prevBtn.disabled = monthOffset <= 0;
        }
    }

    // Build date → { status, slipCount } lookup (never paint past app today)
    const dateInfo = {};
    Object.values(log).forEach(entry => {
        let dateKey = (typeof entry === 'object') ? entry.date : null;
        const status  = logStatus(entry);
        if (!dateKey || !status) return;
        if (dateKey > appToday) return;
        const slipCount = status === 'slip' ? (entry.slipCount || 1) : 0;
        dateInfo[dateKey] = { status, slipCount };
    });

    // Counts for the month being viewed (strong days + total slips, multi-slip days add up).
    var monthPrefix = year + '-' + String(month + 1).padStart(2, '0') + '-';
    var monthStrong = 0;
    var monthSlips = 0;
    Object.keys(dateInfo).forEach(function (dateKey) {
        if (dateKey.indexOf(monthPrefix) !== 0) return;
        var info = dateInfo[dateKey];
        if (info.status === 'strong') monthStrong++;
        else if (info.status === 'slip') monthSlips += (info.slipCount || 1);
    });
    var strongEl = document.getElementById('monthStrongStat');
    var slipEl = document.getElementById('monthSlipStat');
    if (strongEl) {
        strongEl.textContent = monthStrong + ' strong day' + (monthStrong === 1 ? '' : 's');
    }
    if (slipEl) {
        slipEl.textContent = monthSlips + ' slip' + (monthSlips === 1 ? '' : 's');
    }

    // Journey start wall date for current journey Day index.
    // App install / first Day 1 — grey month cells only before this (does not reset on new journey).
    const journeyStart = (typeof getAppStartWallDate === 'function')
        ? getAppStartWallDate()
        : ((typeof getJourneyAnchorWallDate === 'function')
            ? getJourneyAnchorWallDate()
            : (state.lastOpenedDate || appToday));

    // Day labels
    const DAY_LABELS = ['S','M','T','W','T','F','S'];
    let html = DAY_LABELS.map(d => `<div class="month-day-label">${d}</div>`).join('');

    // Empty cells before first day of week
    for (let i = 0; i < firstDayOfWeek; i++) {
        html += `<div class="month-cell future"></div>`;
    }

    // Day cells after install / Journey Day 1:
    //   slip → red · strong log only if logged strong · unlogged (incl. after test New day) → neutral
    //   Today waits for user; no optimistic green without a log entry.
    for (let d = 1; d <= daysInMonth; d++) {
        const key      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday  = key === appToday;
        const isFuture = key > appToday;
        const beforeStart = key < journeyStart;
        const info     = dateInfo[key];
        const isSlip   = !!(info && info.status === 'slip');
        const isStrong = !!(info && info.status === 'strong');
        const daySlips = (info && info.slipCount) || 0;

        let cls = 'month-cell';
        if (isFuture) {
            cls += ' future';
        } else if (beforeStart) {
            cls += ' pre-journey';
        } else if (isSlip) {
            cls += ' slip' + (daySlips > 1 ? ' slip-multi' : '');
        } else if (isStrong) {
            cls += ' strong';
        } else {
            cls += ' unlogged';
        }
        if (isToday && !beforeStart) cls += ' today';

        const slipBadge = isSlip && daySlips > 1
            ? `<span class="month-slip-count">×${daySlips}</span>`
            : '';

        html += `<div class="${cls}"><span class="month-cell-day">${d}</span>${slipBadge}</div>`;
    }

    grid.innerHTML = html;

    // Whole-journey empty: no logs yet — show guidance over the sparse calendar.
    var monthEmpty = !hasAnyDailyLogEntries();
    setHistoryEmptyVisible('monthEmptyState', monthEmpty);
    if (grid) grid.classList.toggle('is-empty', monthEmpty);
}

// ════════════════════════════════════════════════════════
//  LIFETIME STATS
// ════════════════════════════════════════════════════════

function renderLifetimeStats() {
    const journeys = state.attempt;
    const pastStrong = state.completedJourneys.reduce((sum, j) => sum + (j.score.success || 0), 0);
    const totalStrong = pastStrong + state.score.success;
    const pastRelapses = state.completedJourneys.reduce((sum, j) => sum + (j.score.failures || 0), 0);
    const totalRelapses = pastRelapses + state.score.failures;

    document.getElementById('lifetimeJourneys').textContent = journeys;
    document.getElementById('lifetimeStrong').textContent   = totalStrong;
    document.getElementById('lifetimeRelapses').textContent = totalRelapses;

    // Hint while nothing is logged yet (journey 1, zeros at zero).
    const empty = totalStrong === 0 && totalRelapses === 0 && journeys <= 1;
    setHistoryEmptyVisible('lifetimeEmptyHint', empty);
}