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

---

## Layer Ownership

| Concern | Owner |
|---------|--------|
| Google Play purchase / restore | **Billing** (`billing.js`) |
| Trial calculation / access answers | **Entitlement** (`entitlement.js`) |
| Journey scoring, days, slips | **Journey / Logic** (`logic.js`) |
| Schema upgrades on load | **Migration** (`migration.js`) |
| Import / export | **Backup** (`backup.js`) |
| Local persistence | **Storage** (in `logic.js`: load/save/safeGet) |
| Auth, Cloud Functions, verified cache | **Firebase** (`firebase.js`) — Sprint 3 |
| Rendering, paywall UI, gates that *show* UI | **UI** (`ui-*.js`, parts of `billing.js`) |
| App keys / trial length | **Constants** (`constants.js`) |
| Static copy (milestones, quotes) | **Data** (`data.js`) |
| Startup / SW / event router | **Boot** (`boot.js`) |

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
**Writers:** local trial seed (`ensureTrialStarted` / onboarding) and paid path (`updateEntitlementSnapshot` → Billing / Firebase later).

| Field | Type | Owner of writes | Status |
|-------|------|-----------------|--------|
| `trialStartedAt` | ISO-8601 string or `''` | Boot / init / onboarding (`logic.js`) | **v1 live** |
| `premiumUntil` | ISO-8601 string or `''` | `updateEntitlementSnapshot` (Billing; Firebase after verify later) | **v1 live** |
| `lastVerifiedAt` | ISO-8601 string or `''` | Firebase / Billing after server verify | reserved (S3) |
| `source` | `'local-trial' \| 'play' \| 'restore' \| 'dev' \| ''` | same write path as paid fields | reserved (S2/S3) |

Rules:
- UI never reads these fields raw for access decisions — only `Entitlement.*`.
- Partial updates OK: writers pass only fields they own; unknown keys ignored by the write API until declared here.
- Trial length is **not** stored; it is derived as `trialStartedAt + PREMIUM_TRIAL_DAYS`.

---

## Entitlement Public API

```text
Entitlement.hasPremiumAccess()     // trialActive || subscriptionActive
Entitlement.isTrialActive()        // trial window only (independent of sub)
Entitlement.isSubscriptionActive()
Entitlement.daysRemaining()
Entitlement.shouldShowPaywall()
Entitlement.isBasicTier()
Entitlement.subscriptionExpiresLabel()
```

---

## Version 1 Definition of Done

- [x] User gets a local trial (`PREMIUM_TRIAL_DAYS = 30`).
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
| **2** | Capacitor + Google Play Billing + restore |
| **3** | Firebase anonymous auth + purchase verify + closed testing |
