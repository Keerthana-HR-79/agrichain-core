# AgriChain — Master Guide, Part 6: Deep Dives & Problems Solved

> **What's in it:** four deep dives into the parts an interviewer will push on — escrow concurrency, the GPS chain, the market 4-tier fallback, and auth security — each explaining *why every mechanism is there and what breaks without it*. Then the **problems you actually faced and how you solved them** (both the designed challenge and the real debugging war stories).
>
> Legend: **✅ ON RÉSUMÉ** · **ℹ️ OFF RÉSUMÉ** · **🎒 BACK POCKET**

---

# PART A — DEEP DIVES

## Deep Dive 1: Escrow concurrency — how money can never be double-spent 🎒

This is your single strongest topic. Master the *why* of each layer.

### The threat model
Money endpoints (accept, release-advance, release-milestone, settle) can be hit **twice at once** — a double-click, a network retry, two browser tabs, or two server instances. Without protection you could:
- release the same milestone twice (pay the farmer twice),
- create two escrows for one contract,
- release more in total than was locked.

### The four layers of defense (each stops a specific failure)

**1. `SERIALIZABLE` transaction (`withTransaction`)**
- *What:* wraps the whole operation in `BEGIN … COMMIT`, at the strictest isolation level, `ROLLBACK` on any error.
- *Stops:* partial writes (accepted contract but no escrow) and phantom reads between concurrent transactions.
- *Without it:* a crash mid-operation leaves inconsistent money state.

**2. `pg_advisory_xact_lock(contract_id)` (advisory lock)**
- *What:* a named lock keyed on the contract ID, auto-released when the transaction ends.
- *Stops:* two operations on the **same contract** running at once — **even across different server processes/instances** (Render can run more than one). This is stronger than relying on row locks alone because it's a single, explicit gate per contract.
- *Without it:* two simultaneous releases could interleave their read-modify-write.

**3. `SELECT … FOR UPDATE` (row lock)**
- *What:* locks the specific escrow/contract row for the transaction's duration; a second transaction touching it waits.
- *Stops:* the classic **read-modify-write race** (both read "not released", both release).
- *Without it:* lost updates.

**4. Idempotency key (`X-Idempotency-Key` + `idempotency_keys` table)**
- *What:* the client sends a unique key per action; the first request stores its result under that key; a repeat with the same key **replays the stored result** instead of re-running.
- *Stops:* double-clicks and automatic retries from paying twice.
- *Without it:* a retried request (which the client thinks failed but actually succeeded) pays again.

### The audit layer: append-only ledger
Every movement is one row in `escrow_ledger` with `entry_type`, `amount`, and a **`running_balance`**. Never updated, never deleted. So you can reconstruct every rupee's history — like a bank statement. Entry types: `buffer_locked`, `advance_released`, `milestone_released`, `balance_released`, `market_adjustment`, `refund`.

### The proof: 53-assertion test
`tests/escrow_math.test.js` checks the money-conservation invariant — **`total_locked == released_to_farmer + refunded_to_buyer`** — across 7 scenarios × 6 invariants, plus 11 boundary cases (`BUFFER_FACTOR = 1.10`). This is how you *know*, not hope, the math is right.

> **The 45-second answer to "how do you prevent double-payment?":** *"Four layers. Every money operation is a SERIALIZABLE transaction. Inside it I take an advisory lock on the contract ID so no two operations on the same contract run at once, even across server instances. I SELECT FOR UPDATE to row-lock and re-check state. And each request carries an idempotency key, so a retry or double-click replays the first result instead of paying again. Every movement is a row in an append-only ledger with a running balance, and I proved conservation with a 53-assertion test."*

---

## Deep Dive 2: The GPS verification chain ✅

### Why three tiers
A farmer's stage photo needs a location, but real-world photos are messy: some have EXIF GPS, some are from apps that *stamp* coordinates as a watermark instead, some have neither. So you degrade gracefully through three sources:

| Tier | Source | Library | `gps_source` | When it's used |
|---|---|---|---|---|
| 1 | **EXIF metadata** | `exifr` | `"exif"` | Normal phone photos with location on |
| 2 | **OCR of the stamp** | `tesseract.js` + regex | `"ocr"` | "GPS Map Camera"-style watermarked photos |
| 3 | **Client coordinates** | request body | `"client"` | Last resort — device location at upload |

### The OCR parsing quirks (know these — they show depth)
`gpsParser.js` uses regex on the OCR text:
- **Latitude** has a fallback for when OCR drops the decimal point: `Lat13677329` → `13.677329` (assumes a **2-digit degree**, correct for southern India ~8–37°).
- **Longitude** has **no** such fallback — an asymmetry worth admitting if asked ("I'd add the same reconstruction for longitude").
- It also scrapes date, time, and a village guess (first line containing "India" + a comma).

### The distance check (Haversine)
`distanceHelper.calculateDistance` computes the **great-circle distance** with Earth radius **6,371,000 m** → result in **metres**. Then:
```js
distance_from_farm = calculateDistance(farm_lat, farm_lon, photo_lat, photo_lon)
gps_verified       = distance_from_farm <= 500     // metres
```

### Honest framing (keep ready)
- The gate is **soft**: you record and display `gps_verified` and the milestone-release path checks it, but it's "verification with a 500 m tolerance," not cryptographic proof. A determined faker could spoof GPS — you'd mention liveness/attestation as a future hardening.
- The farm's own coordinates come from **OCR of the registration document** at listing time (or provided coords), so the whole thing is only as good as that anchor.

> **The answer to "how do you know the photo is really the farm?":** *"Each photo carries GPS — I read it from EXIF, or OCR the stamped watermark, or fall back to the device. I Haversine-distance it against the farm's registered coordinates and verify within 500 metres. It's a soft gate with a tolerance — good enough to make faking progress deliberate rather than trivial — and I plot both points on a map so it's visible."*

---

## Deep Dive 3: The market price 4-tier fallback ✅

### The problem
The government data.gov.in feed is **genuinely unreliable** — it throttles, times out, and has gaps. But settlement needs *a* price, and the app must never silently show a fake price as if it were live.

### The 4-tier `getLatestPrice` ladder
For a crop/region, it returns the first that succeeds, tagging the **source**:

1. **Recent cache (< 25 h)** — today's already-fetched price. Avoids hammering the API. `source = data_gov` / `data_gov_cached`.
2. **Live fetch** — call data.gov.in now; widen the search **district → state → national** until records are found; summarise by **modal price**.
3. **Last-verified cached** — the most recent real price we ever stored, even if older than 25 h.
4. **Deterministic simulated** — a date-seeded value within **±5%** of a national reference, **clearly labelled `simulated`** so the UI never misrepresents it.

### Supporting machinery
- `CROP_TO_COMMODITY` maps your 15 crops to Agmarknet commodity names.
- `fetchMandiRecords` uses a small page size (60), a 20 s timeout, and 2 attempts.
- `upsertPrice` writes results to `market_prices`.
- **Refresh cadence:** `node-cron` at **06:00 IST daily**, plus a **boot self-heal** that fetches on startup unless a genuine live row for today already exists.

> **The answer to "what if the government API is down?":** *"A four-tier fallback: recent cache, then a live fetch that widens district→state→national, then the last verified price, then a clearly-labelled simulated value. The UI always shows which source it used, so a simulated price is never passed off as live."*

---

## Deep Dive 4: Auth & security ✅

The layers, and what each defends:

| Mechanism | Defends against | Detail |
|---|---|---|
| **bcrypt (cost 10)** | password DB leak | one-way hash, deliberately slow; `bcrypt.compare` at login |
| **Email OTP (6-digit, 10 min)** | fake/typo'd emails | account unverified until OTP entered; login blocked if unverified |
| **JWT `{id, role}`, 7-day, signed** | forged identity | stateless; signature verified per request; tamper-evident |
| **RBAC (`roleMiddleware`)** | privilege escalation | role checked **server-side**; UI hiding is cosmetic only |
| **Anti-enumeration forgot-password** | email harvesting | identical response whether or not the account exists |
| **Optional 2FA** | stolen password | opt-in email OTP as a second factor at login |
| **Rate limiter (60/60s/IP)** | brute force / abuse | in-memory; returns 429 + `Retry-After` |
| **Env-var secrets** | secret leakage in code | never hard-coded; `process.env.*`; never logged as values |

> **Honest caveats to keep ready:** the JWT is stored client-side (localStorage), so you'd note XSS as the relevant risk and CSP/HttpOnly-cookie as hardening; the rate limiter is per-instance (in-memory), so you'd move to Redis to scale; the GPS gate is soft.

---

# PART B — PROBLEMS FACED & HOW YOU SOLVED THEM

> These are the "tell me about a hard bug" / "what went wrong" answers. Two kinds: **the designed challenge** (escrow) and **real debugging war stories**. War stories are gold — they prove you shipped something real, not a tutorial.

## Problem 1 (designed): making the escrow concurrency-safe 🎒
- **The challenge:** money that releases in stages must never double-pay or lose a rupee, even under concurrent requests.
- **How you reasoned:** identified the races (double-click, retry, multi-instance), then layered defenses — SERIALIZABLE transaction + advisory lock + `SELECT FOR UPDATE` + idempotency key — and made the ledger append-only for auditability.
- **How you proved it:** wrote a 53-assertion test around the money-conservation invariant.
- **Why it's a great answer:** it shows you think about correctness and concurrency, not just happy-path features.

## Problem 2 (real war story): market prices "stuck on simulated" ✅
- **The symptom:** the app kept showing **simulated** prices even though a live feed existed.
- **Root causes (two):** (1) the shared **public sample** data.gov.in API key gets **throttled**, so live fetches failed and the fallback kicked in; (2) the **boot logic skipped** the fetch too eagerly — it treated *any* row for today (including a simulated one) as "already have today's price," so it never tried to upgrade to live.
- **The fix (commit `de9d42c`):** the boot self-heal now **only skips when there's a genuine LIVE row** (`source IN ('data_gov','data_gov_cached')`) for today — otherwise it fetches — plus an **admin "refresh prices" button** for on-demand updates. **The operative fix, though, is the user setting a personal `DATA_GOV_API_KEY`** in Render, because the shared sample key throttles.
- **The lesson you can articulate:** "a fallback that's too eager to trigger, plus a shared throttled key, made the system look broken when the data was actually reachable — I fixed both the trigger condition and gave a path to a dedicated key."

## Problem 3 (real war story): OTP emails not sending ✅
- **The symptom:** signup OTP emails silently failed.
- **Root cause:** the Gmail **App Password** was stored with its display **spaces** (Google shows it as `abcd efgh ijkl mnop`), which the SMTP auth rejected; and failures were **silent** because auth was only attempted on the first send.
- **The fix:** normalize/strip the App-Password spaces, and add **`verifyEmailTransport()` at boot** so a bad `EMAIL_PASS` **fails loudly in the logs** instead of silently at first send. Later moved to **SendGrid over HTTPS** (commit `063a202`) to avoid SMTP-port issues on the host.
- **The lesson:** "make external-dependency failures loud and early — verify the email transport at startup, not on the first user action."

## Problem 4 (real war story): "incorrect password" flash on the deployed login ✅
- **The symptom:** users saw a brief "incorrect password" on the live site even with correct credentials.
- **Root cause:** two things compounding — **Render free-tier cold start** (the first request after idle is slow/times out, surfacing as an error) and a **genuine 401** path. The account itself was fine.
- **The fix / guidance:** recognise it as cold-start latency (retry after wake), and use **Forgot Password** if it's a real credential issue. The honest talking point: *"On a free tier the first request wakes the service — I'd add a warm-up ping or a paid instance to remove the cold start."*

## Problem 5 (real war story): Python ML service deploy version mismatch ℹ️
- **The symptom:** the Python ML service failed to build/run on the host.
- **Root cause:** dependency wheels (XGBoost/pandas/scikit-learn) needed a specific Python version.
- **The fix:** **pin Python to 3.12.1** in the deploy config so the environment matches what the ML wheels expect.
- **The lesson:** "ML dependencies are version-sensitive — pinning the runtime version made deploys reproducible."

## Problem 6 (real, small): transparent-button CSS regression ℹ️
- **The symptom:** buttons rendered transparent/unstyled after a change.
- **Root cause:** a CSS **`@layer base`** rule was load-bearing; reordering/removing it broke button styling.
- **The fix (commit `09d198d`):** restore the `@layer base` ordering. Minor, but a real "CSS cascade/layers bit me" story.

## The cross-cutting theme: graceful degradation
Tie several of these together: *"A pattern across the project is failing soft on non-critical services — the ML model, the price feed, email — so the user's core action still works and failures are visible in logs rather than silent. Most of my debugging war stories ended in making a failure louder or a fallback smarter."*

---

## How to use Part B in an interview
- "**What was the hardest part?**" → **Problem 1** (escrow concurrency) if they want depth/design; **Problem 2** (market feed) if they want a real debugging story.
- "**Tell me about a bug you fixed.**" → **Problem 3** (silent email failure → verify at boot) or **Problem 2**.
- "**What would you do differently / improve?**" → server-side price on settle, Redis rate limiter, harder GPS attestation, remove cold start, HttpOnly-cookie JWT. (Full list in Part 7.)

---

### End of Part 6

**Next:** Part 7 — anticipated interview Q&A across every topic, a numbers cheat-sheet, an honest "what I'd improve" list, and a glossary of every term used in this guide.
