# Architecture (v1) — King / Self Mastery

**Status: Architecture Approved (v1)**

This document defines implementation boundaries. Changes require an implementation-driven reason, not speculative future needs.

**Every new feature must state which layer owns it before any code is written.**

---

## Project Principles

1. **One write path** updates entitlement state.
2. **`entitlement.js` only answers entitlement questions** (zero side effects).
3. **Journey data stays local.**
4. **Paid entitlement** for this phase is **Play-client-confirmed** (`queryPurchases` / purchase callback) and **cached locally**. That is not server verification. **Do not build** Firebase / Play Developer API / Firestore entitlement until a real Play purchase has been proven on a testing track. After that, production should become: Play token → Cloud Function → Play Developer API → Firestore.
5. **Architecture changes only when implementation reveals a real need.**
6. **Local trial** is separate from remote paid entitlement; `hasPremiumAccess` is either/or.
7. **Basic logging is free forever** after trial ends: strong / slip / journey score, unlimited calendar days.
8. **Buying Premium only unlocks features** (`premiumUntil`). Journey score, streaks, and `dailyLog` are never cleared by purchase.

---

## Layer Ownership

| Concern | Owner |
|---------|--------|
| Google Play purchase / restore | **Billing** (`billing-store-play.js` + `KingBilling` native plugin) |
| Localized Premium price (store offer) | **Billing** (`billing-offers.js` → `getPremiumOffer`) |
| Trial calculation / access answers | **Entitlement** (`entitlement.js`) |
| Journey scoring, days, slips | **Logic** (`logic-storage-state`, `logic-dates-log`, `logic-journey`, `logic-streak`, `logic-logging`) |
| Schema upgrades on load | **Migration** (`migration.js`) |
| Import / export orchestration | **Backup** (`backup.js`) — calls logic heal + recompute |
| Daily check-in reminder | **Reminder** (`reminder.js` + native AlarmManager) |
| Local persistence | **Logic / storage-state** (`logic-storage-state.js`) |
| Auth, Cloud Functions, purchase token verify | **Firebase** (`firebase.js`) — not wired yet |
| Rendering, paywall UI, gates that *show* UI | **UI** (`ui-*.js`, `billing-ui.js`) |
| App keys / trial length | **Constants** (`constants.js`) |
| Static copy (milestones, quotes) | **Data** (`data.js`) |
| Startup / SW / event router | **Boot** (`boot.js`) |

---

## Journey state fields

Source of truth for field meaning: comment at the top of `logic-storage-state.js`. Do not treat date fields as interchangeable.

| Field | Meaning |
|--------|---------|
| `todayKey()` | App today (real local calendar date) |
| `calendarDay` | Journey Day N from `journeyStartDate` through today |
| `journeyStartDate` | Current Journey Day 1 (resets; = previous end + 1) |
| `appStartDate` | First-ever Day 1 (never resets) |
| `lastOpenedDate` | Last day the user was active (absence detection) |
| `lastCheckedDate` | Last finished day-roll (empty while yesterday popup waits) |
| `journeyEndedDate` / `pendingNextJourney` | 10th-slip date / between-journey lock |
| `todayStatus` / `todayFailCount` | **Today only** — never bump from a historical slip |
| `currentStreak` | Recompute from `dailyLog` (not logging order) |
| `score` / `bestJourney` | Strong/slips; permanent Best only at 10 slips |
| `dailyLog` | Per wall date strong or slip |

---

## Business logic — modules, rules, and debugging

Every change to journey/streak/logging should satisfy **three constraints with equal weight**:

| Constraint | What it enforces | Where it lives |
|------------|------------------|----------------|
| **Manager rules** | Module ownership, no circular deps, queries ≠ commands, facts ≠ derived, restore pipeline, logging stays orchestration-only | Sections below + file boundaries |
| **Human debugability** | Symptom → file → function; read order inside each file; no hidden mutation | File headers in `logic-*.js`, developer guide below |
| **Implementation fit** | Matches King’s real flows (tap path, init, backup, Samsung-class corrupt state), minimal diff, tests prove sequences | `index.html` load order, `tests/*.test.js` |

If a refactor helps one constraint but hurts another, **stop and redesign** — they are not trade-offs.

**Today:** five files under `logic-*.js` (load order in `index.html`). Field meanings live in the comment at the top of `logic-storage-state.js`.

**Module split** (live in `logic-*.js`; load order in `index.html`):

| File | Owns | Must not own |
|------|------|----------------|
| `logic-storage-state.js` | Schema/defaults, `safeGet`/`safeSet`, `load`/`save`, `mergeSavedState`, `replaceState`, migration hook on merge | Journey/streak algorithms |
| `logic-dates-log.js` | Wall-date keys/arithmetic, `dailyLog` read/write/query, basic lifetime counts from log | Journey lifecycle transitions |
| `logic-journey.js` | Journey lifecycle, score, milestones, archive, `beginNextJourney`, heal/repair **commands** | Streak recompute algorithms |
| `logic-streak.js` | Streak recompute, yesterday-pending, freeze/display, weekly timeline, brain math | Journey lifecycle **commands**; `dailyLog` writes |
| `logic-logging.js` | Normal action orchestration: `applyStrongDay`, `applySlipDay`, catch-up | Duplicated business algorithms (streak math, milestone rules, merge, repair) |

**Script order** (after `migration.js`):

```text
logic-storage-state → logic-dates-log → logic-journey → logic-streak → logic-logging
```

`backup.js` stays the restore/import orchestrator. UI still calls `saveAndRender()` after logging returns.

**Billing split** (load after `entitlement.js`):

```text
billing-offers.js → billing-store-play.js → billing-ui.js
```

| File | Owns | Must not own |
|------|------|----------------|
| `billing-offers.js` | Plan normalize/enrich, `getPremiumOffer`, load state, `setPremiumOfferFromStore` | Play I/O, paywall DOM |
| `billing-store-play.js` | Play query/purchase/restore, `updateEntitlementSnapshot` | Paywall render (calls `refreshPremiumOfferUiIfVisible` only) |
| `billing-ui.js` | Panel, paywall, tier gating, checkout/restore UX | Direct entitlement rules (asks `Entitlement`) |

V2 iOS: add `billing-store-apple.js`; UI stays store-agnostic via `getPremiumOffer()`.

### Dependency rules (enforce when splitting)

```text
logging  →  journey, streak, dates-log, storage-state
streak   →  journey (read-only queries only)
journey  →  dates-log (read), journey fields on state (read/write owned fields)
storage-state → migration (on merge)

Never:
  any module → logging
  dates-log → journey lifecycle commands
  streak → journey lifecycle commands
  journey/streak → localStorage directly (go through save path)
```

**`logic-storage-state`** — persistence and state integrity; does not know journey/streak rules.

**`logic-dates-log`** — wall-date and `dailyLog` operations; does not perform journey lifecycle transitions.

**`logic-journey`** — journey lifecycle; may read `dailyLog` and streak snapshots; does not recompute streak algorithms.

**`logic-streak`** — streak computation; may use read-only journey queries; must not trigger journey lifecycle mutations.

**`logic-logging`** — normal action orchestration; may coordinate all logic domains; should not become the home of duplicated business algorithms.

**`backup.js`** — restore/import orchestration (`mergeSavedState` → heal → recompute → render).

**Who calls `saveToStorage`:** user actions via `saveAndRender()` (`ui-main.js`); startup heal paths in `init()`; import via `restoreImportBackup()`. Journey/streak helpers should not save silently except through those hubs.

### Queries vs lifecycle commands (journey)

Keep read-only gates separate from mutating lifecycle. **Streak may call queries, never commands.**

```text
// Read-only queries (streak.js may call these — never lifecycle commands)
isAwaitingNextJourney(s)
journeyIsOver(s)                    // active journey ended at 10 slips
canLogToday()                       // !awaiting && !journeyIsOver
canBeginNextJourneyToday()
readJourneyAnchorWallDate(s)          // persisted only — no infer/write
readAppStartWallDate(s)
isYesterdayLogPending()             // logic-streak.js; uses readJourneyAnchorWallDate + dailyLog

// Anchor repair (mutate journey fields — not for streak queries)
ensureJourneyAnchorWallDate(s)
ensureAppStartWallDate(s)
inferJourneyStartFromLog(s)           // derive only — no write
inferAppStartFromLog(s)
getCalendarDayForWallDate(dateKey)    // calls ensure internally (logging path)

// Lifecycle commands (mutate journey — not for streak.js)
beginJourneyAfterOnboarding()
archiveCompletedJourney(endWallDate)
beginNextJourney()
healStrandedJourneyEnd(s)           // init / restore only — not from streak
inferJourneyEndWallDate(s)
```

### Traceable mutations (no hidden global churn)

You do not need Redux. Prefer signatures that show what is mutated:

```js
recomputeCurrentStreak(state);   // or returns patch; caller saves
applyStrongDay(state, opts);
```

Global `state` may remain; the rule is **one obvious owner per field change** and no “surprise” writes from deep helpers. If you add logging while debugging, log `dateKey`, `calendarDay`, and which command ran.

### Persisted facts vs derived / recomputable

**`dailyLog` is the source of truth for day-by-day historical events** (strong/slip per wall date). It is **not** the source of truth for active journey lifecycle, trial/onboarding, or UI-only state.

| Primary persisted facts | Derived / recomputable (heal on load or recompute) |
|-------------------------|-----------------------------------------------------|
| `dailyLog` | `currentStreak`, `longestStreak` (recompute from log) |
| Journey fields (`journeyStartDate`, `score`, `attempt`, `pendingNextJourney`, …) | Weekly timeline display |
| Trial/onboarding (`trialStartedAt`, onboarding flags) | Brain/insight metrics |
| Archived journey data (`completedJourneys`, `pastJourneyStreaks`, …) | Many display statistics |
| Entitlement snapshot fields | `todayStatus` / `todayFailCount` (today only — never from historical slip) |

`currentJourneyStreaks` / archived streak segments are written on slip for graph history; treat as persisted history once written. On corrupt restore, prefer recompute-from-log only if a dedicated backfill exists.

**`logic-logging` smell test:** if you delete `logic-logging.js`, streak and journey algorithms should still live in `logic-streak.js` and `logic-journey.js`. Logging only coordinates.

### Restore / recovery pipeline (test the whole sequence)

Unit tests on one function miss ordering bugs. The integration path must work end-to-end:

```text
mergeSavedState(saved)
  → healStrandedJourneyEnd(state)   // stranded 10-slip finish
  → recomputeCurrentStreak(state)    // stale streak cache
  → saveToStorage(state)
  → renderAll()                       // UI can log again
```

**Fixture cases to cover** (see `tests/backup.test.js`; expand as split lands):

- Current backup format
- Older backup schema (missing optional fields)
- Partially corrupted fields
- Active journey at restore
- Stranded/completed journey (`score.fail >= 10` but no archive)
- Streak needing recomputation
- Empty / new-user backup
- After restore: `canLogToday()` true and `applyStrongDay` / `applySlipDay` apply (not only JSON equality)

Same sequence runs on cold start in `init()` (`ui-main.js`) before first paint logic.

### Developer guide — where to look when something breaks

**Local state key:** `habitTracker_v3` (`constants.js` → `STORAGE_KEY`). On a device: export backup from the app, or use WebView debugging / backup file — do not assume repo JS matches installed APK without `npm run android:install`.

#### User taps “I stayed strong” / “I slipped”

```text
boot.js (data-action click)
  → ui-actions.js: recordSuccess / recordFailure
  → logic-logging.js: applyStrongDay / applySlipDay   ← orchestration
       → logic-dates-log: writeDailyLog, wall-date checks
       → logic-journey: score, milestones, archive on 10th slip
       → logic-streak: recomputeCurrentStreak
  → ui-main.js: saveAndRender → saveToStorage → renderAll
```

If buttons feel dead, check **queries before UI:** `canLogToday()`, `isYesterdayLogPending()`, `isAwaitingNextJourney()`, `pendingNextJourney`, `lastCheckedDate`. A stuck yesterday popup or between-journey lock returns `applied: false` from `applyStrongDay` without throwing.

#### Wrong streak or calendar

1. `dailyLog` for the wall dates in question (facts).
2. `recomputeCurrentStreak` (derived).
3. `journeyStartDate` / `calendarDay` (journey anchor — not interchangeable with `appStartDate`).
4. Do not “fix” by manually bumping `currentStreak` without updating `dailyLog`.

#### Journey stuck after 10 slips

1. `healStrandedJourneyEnd` — init and import both call it.
2. `archiveCompletedJourney` / `beginNextJourney`.
3. `completedJourneys` already contains this `attempt`?

#### Import / export wrong

1. `backup.js`: `buildBackupPayload`, `restoreImportBackup`.
2. Confirm restore runs heal + recompute (not only `mergeSavedState`).
3. `migration.js`: `runStateMigrations` on load.

#### Premium / trial (not journey)

`entitlement.js` read-only; writes only via `updateEntitlementSnapshot` / trial seed in logic onboarding — never raw `state.premium` in UI.

#### Run tests locally

```bash
npm test
```

Harness loads `constants`, `data`, `migration`, `logic`, `entitlement`, `backup`, `billing-offers` / `billing-store-play` / `billing-ui` in a VM (`tests/helpers/king-harness.js`). Use `createKingContext()` and `getState(ctx)` — `state` is not a normal sandbox export.

#### After app-visible JS changes

Samsung/native app loads the installed APK, not repo files. Run `npm run android:install` before telling anyone the phone has the fix.

---

## Daily reminders

**Native only (Android).** Not in the GitHub Pages PWA. Do not use web `Notification` or service-worker timers.

OS-scheduled check-in: **`KingReminder` plugin** wrapping AlarmManager **`setAlarmClock()`** (primary). Fallback: **`setExactAndAllowWhileIdle()`** when exact-alarm permission granted, else inexact. Declares **`SCHEDULE_EXACT_ALARM`** (declare in Play Console: optional user-scheduled daily reminder). User grants **scheduled reminders** in system settings when enabling — required on Android 12+ for `setAlarmClock` on many devices. No `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, or battery Unrestricted prompts in v1. Notifications: **`IMPORTANCE_HIGH`** + **`CATEGORY_REMINDER`** (heads-up banner; not alarm category).

Enable + time UI lives in the **Reminder** card (below Lifetime Stats). Time is user-chosen via hour / minute / AM-PM dropdowns (default 8:00 PM until they change it; not a fixed 8 PM reminder). The notification offers **I STAYED STRONG TODAY** and **I slipped**; those taps log today through the same Journey write path (`recordSuccess` / `recordFailure`), without the in-app confirm modal. Changing the time cancels the previous alarm, then sets the new one. **User Off** cancels and sets native `enabled=false`. **Premium pause** cancels the alarm only — keep `enabled` so boot / next day can restore. UI shows **Reminder paused — Premium required.** Restoring Premium reschedules if still enabled.

---

## Boot Sequence

### Version 1 (current / acceptable)

```text
Boot
  → Load local storage
  → Initialize Firebase        (no-op until Sprint 3)
  → Restore purchases          (`KingBilling.queryPurchases` on Android)
  → Refresh entitlement        (reads local state)
  → Load journey
  → Render UI
```

Sprint 1 keeps this simple: sequential after local load. Painting first and refreshing entitlement in the background is an optimization for later if startup feels slow.

---

## Entitlement: One Write Path

```text
Only the entitlement update path may modify entitlement state.

Billing / Firebase
        ↓
updateEntitlementSnapshot(...)   ← single write API (`billing-store-play.js`)
        ↓
Storage (state + localStorage)
        ↓
Entitlement (read only)
        ↓
UI
```

- **No module outside `entitlement.js` decides premium access.**  
  Use `Entitlement.hasPremiumAccess()` — never raw `trialDays`, `premium`, or `subscriptionActive` checks in UI or elsewhere.
- **Who initiates the write does not matter; the path does.** Filename may change later; the rule does not.

---

## EntitlementSnapshot (contract)

Shared shape of premium entitlement fields on journey `state`.  
**Readers:** `entitlement.js` only answers access.  
**Writers:** local trial seed (`startPremiumTrial` / `ensureTrialStarted` at onboarding / Day 1) and paid path (`updateEntitlementSnapshot` → Billing / Firebase later).

| Field | Type | Owner of writes | Status |
|-------|------|-----------------|--------|
| `trialStartedAt` | ISO-8601 string or `''` | Onboarding + init (`logic-storage-state.js`; start of Calendar Day 1) | **v1 live** |
| `premiumUntil` | ISO-8601 string or `''` | Local **offline cache** expiry after last Play client `PURCHASED`. Not the Play subscription term. Firebase later becomes authority | **cache, not proof of 3 extra paid days** |
| `lastVerifiedAt` | ISO-8601 string or `''` | Sprint 3A: last Play client confirmation. Production: Firebase / Play Developer API | **not server-verified yet** |
| `source` | `'local-trial' \| 'play' \| 'restore' \| 'dev' \| ''` | same write path as paid fields; `play`/`restore` required to set `premiumUntil` | **live** |

Rules:
- UI never reads these fields raw for access decisions — only `Entitlement.*`.
- Partial updates OK: writers pass only fields they own; unknown keys ignored by the write API until declared here.
- Trial length is **not** stored; it is derived as `trialStartedAt + PREMIUM_TRIAL_DAYS`.

Trial access is wall-clock: `trialStartedAt + PREMIUM_TRIAL_DAYS` vs `Date.now()`. Never restart an expired `trialStartedAt`; seed from `appStartDate` only. Each install has its own `localStorage`.

---

## Entitlement Public API

```text
Entitlement.getAccess()            // { active, expiresAt } — is Premium?
Entitlement.hasPremiumAccess()     // getAccess().active  (trial || subscription)
Entitlement.isTrialActive()        // trial window only (independent of sub)
Entitlement.isSubscriptionActive()
Entitlement.daysRemaining()
Entitlement.shouldShowPaywall()
Entitlement.isBasicTier()
Entitlement.subscriptionExpiresLabel()
```

### Access vs price (keep separate)

Unlocking King **never** reads a price. The Premium modal is a display shell:

```text
showPremiumModal({ trialDays, plans })
```

Today `PREMIUM_PLANS_MOCK` is for web / harness dev only — Android with Play Billing shows Play `formattedPrice` when `queryProducts` succeeds, **Loading price…** while loading, or **Price unavailable** if Play returns nothing. Do not show mock INR on native. Store strings are used as-is (`₹…`, `$…`, `€…`). Do not wrap store strings in a rupee formatter.

```text
Entitlement.getAccess()
        ↓
  active?  YES → unlock Premium features
           NO  → showPremiumModal({ trialDays, plans })

Google Play (KingBilling)
        ↓
  localized monthly + annual formattedPrice
  (annual strikethrough = PREMIUM_ANNUAL_COMPARE_AMOUNT; “% off” vs annual sale)
        ↓
  same showPremiumModal(...)
```

---

## Version 1 Definition of Done

- [x] User gets a local trial (`PREMIUM_TRIAL_DAYS` in `constants.js`).
- [x] Trial expiry locks premium features.
- [ ] Google Play purchase unlocks premium (native flow lives; Play Console products + a Play-signed test build still required).
- [x] Restore queries Play (`KingBilling.queryPurchases`) — empty until those products exist.
- [x] Journey data remains local (purchase writes entitlement fields only).
- [ ] App passes closed testing.

---

## Android release builds (minify / ProGuard)

**Today:** `android/app/build.gradle` → `release { minifyEnabled false }`. Debug and release both run without R8 shrinking.

**Keep rules live in** `android/app/proguard-rules.pro` (Capacitor, `com.kingtracker.app` plugins, Play Billing). Rules are loaded even while minify is off — ready when you flip the switch.

**Before `minifyEnabled true` (production Play release):**

1. Re-read `proguard-rules.pro` if you add new native plugins or receivers.
2. Build release: `cd android && ./gradlew :app:assembleRelease` (or Play App Signing flow).
3. Install release APK on a **physical device** — not debug.
4. Smoke-test:
   - `KingBilling` — `queryProducts`, `queryPurchases` (restore)
   - `KingReminder` — schedule alarm, notification tap logs strong/slip
5. Only then ship a minified build to Play.

Skipping step 3–4 is how billing and reminders **silently break** on store builds while debug still works.

---

## Roadmap (no further architecture work planned)

| Sprint | Work |
|--------|------|
| **1** | Entitlement API + wire existing premium UI *(done)* |
| **2** | Capacitor wrapper · local daily reminders *(Android AlarmManager)* *(done)* |
| **3A** | Play Console products + prove buy/restore on a Play testing build *(client-confirmed cache only)* |
| **3B** | Firebase purchase-token verify → Play Developer API → Firestore *(after 3A works)* · closed testing |
