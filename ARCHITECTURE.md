# Architecture (v1) — King / Self Mastery

**Status: Architecture Approved (v1)**

This document defines implementation boundaries. Changes require an implementation-driven reason, not speculative future needs.

**Every new feature must state which layer owns it before any code is written.**

---

## Project Principles

1. **One write path** updates entitlement state.
2. **`entitlement.js` only answers entitlement questions** (zero side effects).
3. **Journey data stays local.**
4. **Paid entitlement** comes from verified purchases (later) and is **cached locally**.
5. **Architecture changes only when implementation reveals a real need.**
6. **Local trial** is separate from remote paid entitlement; `hasPremiumAccess` is either/or.
7. **Basic logging is free forever** after trial ends: strong / slip / journey score, unlimited calendar days.
8. **Buying Premium only unlocks features** (`premiumUntil`). Journey score, streaks, and `dailyLog` are never cleared by purchase.

---

## Layer Ownership

| Concern | Owner |
|---------|--------|
| Google Play purchase / restore | **Billing** (`billing.js`) |
| Localized Premium price (store offer) | **Billing** (`getPremiumOffer`) |
| Trial calculation / access answers | **Entitlement** (`entitlement.js`) |
| Journey scoring, days, slips | **Journey / Logic** (`logic.js`) |
| Schema upgrades on load | **Migration** (`migration.js`) |
| Import / export | **Backup** (`backup.js`) |
| Daily check-in reminder | **Reminder** (`reminder.js` + native AlarmManager) |
| Local persistence | **Storage** (in `logic.js`: load/save/safeGet) |
| Auth, Cloud Functions, verified cache | **Firebase** (`firebase.js`) — Sprint 3 |
| Rendering, paywall UI, gates that *show* UI | **UI** (`ui-*.js`, parts of `billing.js`) |
| App keys / trial length | **Constants** (`constants.js`) |
| Static copy (milestones, quotes) | **Data** (`data.js`) |
| Startup / SW / event router | **Boot** (`boot.js`) |

---

## Journey state fields

Source of truth for field meaning: comment at the top of `logic.js`. Do not treat date fields as interchangeable.

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

## Daily reminders

**Native only (Android).** Not in the GitHub Pages PWA. Do not use web `Notification` or service-worker timers.

OS-scheduled check-in: **`KingReminder` plugin** wrapping **AlarmManager `setAndAllowWhileIdle()`** (inexact). No `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` / `WAKE_LOCK` (`setAndAllowWhileIdle` already wakes for the receiver). Fires with the app open, backgrounded, locked, or closed; reboot reschedules via `BOOT_COMPLETED` (`ReminderBootReceiver` is `exported="false"`; system broadcasts still arrive). Android may delay delivery under Doze / battery saver — this is a habit nudge, not an alarm clock. Notification channel `king_daily_reminder_v2` uses **`IMPORTANCE_DEFAULT`** (shade + sound, no heads-up). Persist `{enabled, hour, minute}` in `kingReminder` (JS) and matching native SharedPreferences. Native also stores the last logged wall date; if today is already logged (strong or slip), **do not notify** and move the next alarm to tomorrow. JS syncs that date from `dailyLog` via `setLoggedDate`. **At most one daily notification per calendar day** (`notifiedDate`); ignoring it does not send another until tomorrow. The in-app 2-minute test is separate.

Enable + time UI lives in the **Reminder** card (below Lifetime Stats). Time is user-chosen via hour / minute / AM-PM dropdowns (default 8:00 PM until they change it; not a fixed 8 PM reminder). The notification offers **I STAYED STRONG TODAY** and **I slipped**; those taps log today through the same Journey write path (`recordSuccess` / `recordFailure`), without the in-app confirm modal. Changing the time cancels the previous alarm, then sets the new one. Off cancels the alarm. Premium-gated (`requirePremium` / `Entitlement.hasPremiumAccess()`). If Premium expires, keep `{enabled, hour, minute}` and cancel the native alarm; UI shows **Reminder paused — Premium required.** Restoring Premium reschedules if still enabled.

---

## Boot Sequence

### Version 1 (current / acceptable)

```text
Boot
  → Load local storage
  → Initialize Firebase        (no-op until Sprint 3)
  → Restore purchases          (no-op until Sprint 2)
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
updateEntitlementSnapshot(...)   ← single write API (today in billing.js)
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
| `trialStartedAt` | ISO-8601 string or `''` | Onboarding + init (`logic.js`; start of Calendar Day 1) | **v1 live** |
| `premiumUntil` | ISO-8601 string or `''` | `updateEntitlementSnapshot` (Billing; Firebase after verify later) | **v1 live** |
| `lastVerifiedAt` | ISO-8601 string or `''` | Firebase / Billing after server verify | reserved (S3) |
| `source` | `'local-trial' \| 'play' \| 'restore' \| 'dev' \| ''` | same write path as paid fields | reserved (S2/S3) |

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

Today `plans` are a mock (`PREMIUM_PLANS_MOCK`: monthly ₹199→₹149, annual ₹1999→₹1499). Later Play/App Store calls `setPremiumOfferFromStore({ trialDays, plans })` with localized strings; the modal API does not change.

```text
Entitlement.getAccess()
        ↓
  active?  YES → unlock Premium features
           NO  → showPremiumModal({ trialDays, plans })

Google Play (later)
        ↓
  localized monthly + annual prices
        ↓
  same showPremiumModal(...)
```

---

## Version 1 Definition of Done

- [x] User gets a local trial (`PREMIUM_TRIAL_DAYS` in `constants.js`).
- [x] Trial expiry locks premium features.
- [ ] Google Play purchase unlocks premium.
- [ ] Restore purchases works.
- [x] Journey data remains local.
- [ ] App passes closed testing.

---

## Roadmap (no further architecture work planned)

| Sprint | Work |
|--------|------|
| **1** | Entitlement API + wire existing premium UI *(done)* |
| **2** | Capacitor wrapper (`npm run cap:sync`) · local daily reminders *(Android AlarmManager)* · Google Play Billing + restore · purchase unlocks UI only (score preserved) |
| **3** | Firebase anonymous auth + purchase verify + closed testing |
