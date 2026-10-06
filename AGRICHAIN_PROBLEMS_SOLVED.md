# AGRICHAIN — PROBLEMS SOLVED (and exactly how)

> Every real problem this project solved, with the root cause and the fix. Built for the interview question *"Tell me about a hard problem you faced and how you solved it."*
>
> **Two honesty labels on every entry** — answer this correctly when probed:
> - 🔥 **WAR STORY** = a bug/limitation you actually hit in production and debugged. These are your strongest answers.
> - 🛡️ **ENGINEERED-AGAINST** = a failure mode you anticipated in design and built defenses for before it bit you. Also legitimate — just don't claim it "happened" if it didn't.
>
> Reference secrets by env-var **name** only. Follow the code over any older note.

---

## HOW TO USE THIS
- Interviewers ask this in two flavors: *"a hard bug you debugged"* (pick a 🔥) and *"a hard thing you designed"* (pick a 🛡️).
- Your top 3 to lead with: **Escrow double-payment (🛡️, #1)**, **Market prices stuck simulated (🔥, #7)**, **SMTP blocked on Render (🔥, #6)**.
- Each entry gives you: Problem → Root cause → Solution → one-line soundbite.

---

# A. MONEY-SAFETY & CONCURRENCY (the crown jewels)

## 1. 🛡️ Buyer double-clicks "release payment" → money paid twice
**Problem:** Fund release is a multi-row money movement (update milestone, bump escrow totals, insert ledger). Two concurrent or duplicate requests (double-click, retry, two tabs) could interleave and pay the farmer twice or corrupt the running balance.

**Root cause (the risk):** Read-modify-write on shared rows without isolation → classic lost-update / race condition.

**Solution — five layers, all inside one transaction (`escrowController.js`):**
1. **`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`** — strictest level; conflicting concurrent transactions serialize (one retries) instead of interleaving.
2. **`SELECT … FOR UPDATE`** — row-locks the escrow + milestone so a second request *queues* until the first commits.
3. **`pg_advisory_xact_lock(contract_id)`** — an app-level mutex keyed on the contract, held to transaction end; works **across separate Node processes** (row locks alone don't coordinate app logic before the write).
4. **Idempotency keys** — client sends `X-Idempotency-Key`; first call reserves it (`INSERT … ON CONFLICT`) and caches its JSON result; a retry **replays the cached result** instead of paying again.
5. **Append-only ledger** — every movement is one immutable `INSERT` with a walking `running_balance`; nothing is ever `UPDATE`d, so the history is auditable.

**Soundbite:** *"Exactly-once fund release under concurrency — SERIALIZABLE isolation, row + advisory locks, and idempotency keys, all in one transaction, with an append-only ledger for audit."*

## 2. 🛡️ Market price spikes above the buffer → escrow pays out more than was locked
**Problem:** Settlement pays the farmer the *higher* of contracted vs live market price. If the market spiked past the 110% buffer, a naive `market × quantity` would try to release more money than the buyer ever locked → the ledger goes negative / the platform is insolvent.

**Root cause:** Unbounded payout formula against a bounded escrow balance.

**Solution — a hard cap in the settlement math:**
```
desired      = max(offered_price, market_price)
gross        = min(desired × quantity_quintals, total_locked)   ← the cap
refund       = total_locked − gross                              ← back to buyer
balance_due  = max(0, gross − already_paid)
```
Payout lands exactly on `gross`, refund is the remainder, so the ledger always **nets to zero** (`released + refund = total_locked`). Proven by the test suite (invariant #1 and #2).

**Soundbite:** *"The payout is `min(higher-of-price × qty, total_locked)` — the farmer gets market upside, but never more than the buyer actually escrowed, so the ledger can't go negative."*

## 3. 🛡️ How do I *prove* the money math is correct?
**Problem:** Money logic that's "probably right" isn't good enough; I needed evidence it's right across edge cases (market up, market down, market flat, spike beyond buffer, partial pre-releases).

**Solution — a dependency-free test suite (`tests/escrow_math.test.js`, `npm test`):** **53 assertions** across **7 market scenarios** proving **6 invariants**: (1) conservation `released + refund ≈ total_locked`; (2) `gross ≤ total_locked`; (3) farmer paid == gross; (4) higher-of, capped; (5) non-negativity; (6) farmer ≥ contract value. Includes a **path-independence** test: settlement lands on the same result whether 1 or 5 milestones were pre-released.

**Soundbite:** *"I don't just claim the accounting is safe — a 53-assertion suite proves six invariants, including that settlement is path-independent."*

## 4. 🛡️ A dispute mid-contract could let funds keep flowing
**Problem:** If either party raises a dispute, further releases should freeze until an admin resolves it — otherwise money moves while the deal is contested.

**Solution:** `releaseAdvance`, `releaseMilestone`, and `settleEscrow` each check `dispute_status='open'` and throw **HTTP 423 Locked**. Reads and the accept flow stay available; only money movement freezes.

**Soundbite:** *"An open dispute returns 423 on every money-moving endpoint — funds freeze until an admin resolves it."*

---

# B. DEPLOYMENT & INFRASTRUCTURE (the real war stories)

## 5. 🔥 OTP emails silently failed in production (Render free tier blocks SMTP)
**Problem:** Signup/login OTP emails worked locally but **never arrived** once deployed to Render.

**Root cause:** **Render's free tier blocks outbound SMTP ports (25 / 465 / 587).** The original Nodemailer/Gmail-SMTP transport connects on those ports, so it hung/failed on Render with no obvious error.

**Solution:** Switched the email path to the **SendGrid HTTPS API** (`@sendgrid/mail`), which sends over **port 443** — not blocked. Added a boot-time `verifyEmailTransport()` so a misconfigured key is caught at startup, not on the first signup. `EMAIL_USER` is a verified Single Sender; the API key lives only in Render env as `SENDGRID_API_KEY`.

**Soundbite:** *"OTP email died on Render because the free tier blocks SMTP ports. I moved from SMTP to SendGrid's HTTPS API — same emails, over 443 — and added a boot-time transport check so it fails loud, not silent."*

## 6. 🔥 "Market Prices stuck on simulated" — the multi-day investigation
**Problem:** The public Market Prices page kept showing `simulated` prices instead of live government data. Looked like a bug in our fetch or a bad API key.

**Root cause (found by disciplined debugging):** The **data.gov.in Agmarknet feed itself was down** — returning **502s and 20s+ timeouts** for a day at a time. Reproduced across **three different networks** to rule out a local/ISP issue. Our code was correct; the upstream dependency was genuinely unavailable.

**Solution — hardened the fetch to maximize live capture + fail gracefully (`marketScraper.js`):**
- **Smaller page (`limit` 500 → 60):** a 500-row response is far slower for the gov server to assemble/transmit, which is what tripped the timeout; ~60 modal prices is still a robust national average.
- **One retry (`ATTEMPTS=2`, 800 ms backoff):** a single transient blip no longer dooms a crop for the whole day.
- **Longer per-attempt timeout (15s → 20s):** captures a slow-but-up feed instead of abandoning it.
- **Widen scope on empty:** district → state → national, so an over-specific filter doesn't return nothing.
- **4-tier fallback with honest labels:** `data_gov` (live) → `data_gov_cached` (last verified) → `simulated` (clearly labelled) — the UI shows the source badge so nothing is misrepresented.
- **Boot self-heal + 6 AM IST cron:** recovers automatically when the feed comes back, no manual action.
- **Operative user-side fix:** set a **personal `DATA_GOV_API_KEY`** in Render (the shipped public sample key is rate-throttled).

**Soundbite:** *"The prices weren't a code bug — I proved the government feed itself was returning 502s across three networks. I hardened the fetch (smaller page, one retry, longer timeout, scope-widening) and added honest source labels plus auto-recovery, so we capture live data when it's up and degrade transparently when it's not."*

## 7. 🔥 Login flashed "incorrect password" on a correct password
**Problem:** Users occasionally saw an "incorrect password" flash on the first login attempt even with correct credentials.

**Root cause:** **Render free-tier cold start** — the backend spins down when idle; the first request after idle times out/fails while the service wakes, surfacing as a generic auth error. (A genuine 401 on a real wrong password looks identical, which muddied diagnosis.)

**Solution / guidance:** Identified it as cold-start latency, not an auth-logic bug — the account is fine; a retry after wake succeeds, and Forgot-password is the path if it's a real mismatch. (Structural fix would be a warm/paid tier or a keep-alive ping.)

**Soundbite:** *"The 'wrong password' flash was Render cold-start latency on the first request after idle, not an auth bug — I traced it by correlating it with idle spin-down."*

## 8. 🔥 OTP email formatting broke on a Gmail App Password
**Problem:** Email auth failed when the Gmail **App Password** was pasted with its display spaces (Google shows it in `xxxx xxxx xxxx xxxx` groups).

**Root cause:** The spaces are for readability only; the actual credential has none — the transport rejected the spaced value.

**Solution:** Trim/normalize the app-password spaces, plus the boot-time transport verify (#5) so a bad credential is caught immediately. (This predates the full SendGrid switch and informed it.)

**Soundbite:** *"An App Password copied with Google's display spaces silently broke email auth — normalizing it and verifying the transport at boot fixed and surfaced it."*

## 9. 🔥 Python service failed to build on Render until the version was pinned
**Problem:** The FastAPI/XGBoost service needs a specific Python for its compiled ML wheels (xgboost/sklearn); Render's default could mismatch and break the build or model load.

**Solution:** Pinned **`PYTHON_VERSION=3.12.4`** in `render.yaml` alongside `uvicorn src.app:app --host 0.0.0.0 --port $PORT`. Model load is **fail-hard** at startup, so a bad environment fails the deploy immediately instead of 500-ing on the first prediction.

**Soundbite:** *"I pinned the Python version in render.yaml so the compiled ML wheels resolve deterministically, and made model load fail-hard so a bad env breaks the deploy, not the first user request."*

---

# C. TRUST & FRAUD PREVENTION

## 10. 🛡️ How do you stop a farmer claiming a growth stage from someone else's field?
**Problem:** Milestone payments release on "proof" of a growth stage. A photo alone proves nothing about *where* it was taken — a farmer could upload any crop photo.

**Solution — location-verified stage photos (`cropStageController.js` + `utils/`):** a chain that extracts GPS from the photo and checks it against the registered farm:
1. **EXIF** (`exifr`) — read embedded photo coordinates.
2. **OCR fallback** (`tesseract.js` + regex `gpsParser`) — GPS-camera apps burn lat/long onto the image; read it from the pixels, tolerant of watermark formats.
3. **Client-coords fallback** — browser geolocation if the first two fail.
4. **Haversine distance** (`R = 6 371 000 m`) between the photo and the farm's registered coords (itself OCR'd from the registration doc). **≤ 500 m ⇒ `gps_verified = true`.**

**Honest caveat to volunteer:** the gate is "soft" — a stage row must exist to release a milestone, and `gps_verified=false` is recorded and shown rather than hard-blocking payout. That's a deliberate demo trade-off with a clear production hardening path.

**Soundbite:** *"Stage photos are location-verified — EXIF, then OCR of the GPS watermark, then client coords, checked within 500 m of the registered farm by Haversine — so 'proof of progress' is tied to the real field."*

---

# D. FRONTEND & UX

## 11. 🔥 Submit buttons rendered transparent after removing Tailwind
**Problem:** After migrating off Tailwind to plain CSS (so every style is explainable), styled submit buttons rendered **transparent/unstyled** — a visible regression.

**Root cause:** Tailwind's **Preflight** base reset was gone, and the hand-written reset was landing at the wrong cascade priority, so element defaults won over the button styles.

**Solution:** Reintroduced the base reset inside **`@layer base`** in `index.css` — putting the reset in the **lowest cascade layer** means component styles (unlayered / higher layers) reliably win. This `@layer base` block is **load-bearing**: it's specifically what keeps buttons opaque.

**Soundbite:** *"Dropping Tailwind lost its Preflight reset and buttons went transparent. I put the reset in `@layer base` — the lowest cascade layer — so component styles reliably override element defaults."*

## 12. 🛡️ Rural users lose connectivity mid-task
**Problem:** The target users (farmers) have patchy rural connectivity; a dropped connection shouldn't lose their work or block browsing.

**Solution — offline-first PWA:**
- **vite-plugin-pwa / Workbox** service worker → installable app, precached shell, `navigateFallback` to `/index.html`.
- **Dexie/IndexedDB** (`AgriChainOfflineDB`) caches reads (listings/stages) and **queues text-only mutations** offline.
- **Optimistic UI + 3-retry sync** (`offlineQueue.js`) that auto-fires ~1.5 s after reconnect (`useOnlineStatus.js`), with a `SyncStatusBar` pill and an `InstallPrompt`.
- **Honest boundary:** photo uploads need connectivity (binaries aren't queued) — only text updates queue.

**Soundbite:** *"It's an offline-first PWA — reads come from an IndexedDB cache and text updates queue in Dexie with a 3-retry auto-sync on reconnect, so a farmer in a dead zone doesn't lose work."*

---

# E. ML ENGINEERING

## 13. 🛡️ Yield data is heavily right-skewed → the model over-weights giant outliers
**Problem:** Crop yield (kg/ha) is right-skewed (a few huge values); training directly on it lets outliers dominate the loss and hurts typical-case accuracy.

**Solution:** Train on **`log1p(yield)`** to compress the tail and stabilize variance, then invert predictions with **`expm1`** and floor at 0. Standard, defensible target-transform.

**Soundbite:** *"Yield is right-skewed, so I model `log1p` of it and invert with `expm1` — it stabilizes variance and stops a few huge farms from dominating the fit."*

## 14. 🛡️ Feature-column mismatch between training and serving
**Problem:** One-hot encoding produces **643 columns**; at inference a single request has only a few categories set. If the served feature row doesn't match the trained column order/set *exactly*, predictions are silently wrong.

**Solution:** Persist **`model_columns.pkl`** at train time; at inference, `_build_feature_row` constructs a row that matches those columns exactly, one-hots the request, and maps **unseen categories to an all-zero baseline** (no crash, graceful degrade). Numeric features include an engineered `rainfall_temp_interaction`.

**Soundbite:** *"I persist the exact training column list and rebuild each inference row against it, mapping unseen categories to a zero baseline — so training and serving can't silently drift apart."*

## 15. 🛡️ A single yield number implies false precision
**Problem:** Handing a buyer one tonnage figure implies the model is more certain than it is (real metrics: R²≈0.87, MAPE≈30%).

**Solution:** Show a **confidence band** = the crop's historical **5th–95th percentile** yield (fallback ±15%). **Honest framing to volunteer:** this is a *historical* band, **not** a model prediction interval — a known limitation with a clear upgrade path (quantile regression / conformal intervals).

**Soundbite:** *"Every prediction ships with a confidence band from the crop's historical 5th–95th percentile — and I'm upfront that it's a historical band, not a model interval."*

## 16. 🛡️ Heavy Python ML deps would bloat and destabilize the API
**Problem:** XGBoost/pandas/numpy are large, Python-only, and slow to cold-start; bundling them into request-serving would bloat the API and couple unrelated release cycles.

**Solution:** Split the model into an **independent FastAPI microservice** along the **language/dependency seam**. The Node backend calls it over HTTP at listing creation and **degrades gracefully** — if the model service is slow/down, `createListing` catches the error and saves the listing with `predicted_yield = 0` rather than failing the whole request.

**Soundbite:** *"The model is its own FastAPI service split along the dependency seam, and listing creation degrades gracefully if it's down — you still get your listing, just without a yield estimate."*

---

# F. SECURITY & DATA INTEGRITY

## 17. 🛡️ Forgot-password could leak which emails are registered
**Problem:** A password-reset endpoint that says "no such user" for unknown emails lets an attacker enumerate valid accounts.

**Solution:** `forgotPassword` returns an **identical 200** whether or not the email exists (anti-enumeration). **Honest caveat:** login/signup still leak existence via their errors — a known gap with an obvious fix (make all three consistent).

**Soundbite:** *"Forgot-password returns the same response regardless of whether the email exists, to prevent account enumeration."*

## 18. 🛡️ Duplicate records from retries/races (escrow, stages, reviews, watchlist)
**Problem:** Retries and double-submits could create duplicate escrows, stages, reviews, or watchlist rows.

**Solution — DB-level idempotency, not just app checks:**
- Escrow is **1:1 with contract**, duplicate-checked **under the advisory lock**, returning **409** on a second attempt.
- `escrow_milestones` has **`UNIQUE(contract_id, milestone_order)`** so seeding is idempotent (`ON CONFLICT DO NOTHING`).
- Reviews use `UNIQUE(contract, reviewer)` → duplicate returns 409; watchlist uses `INSERT … ON CONFLICT DO NOTHING`.

**Soundbite:** *"Uniqueness is enforced in the database, not just checked in code — so retries and races can't create duplicate escrows, milestones, or reviews."*

## 19. 🛡️ Divide-by-zero crashes in analytics aggregates
**Problem:** Rate/average calculations (e.g. acceptance %, avg rating) divide by counts that can be zero for a new user → NaN/crash.

**Solution:** `NULLIF(denominator, 0)` guards throughout `analyticsController` so an empty dataset yields null/0, not a crash.

**Soundbite:** *"All analytics ratios use `NULLIF` guards so a brand-new user with zero contracts doesn't divide-by-zero the dashboard."*

## 20. 🛡️ Real secret values were exposed during debugging
**Problem:** During earlier debugging, real secret **values** (DB password, Supabase service key, email creds, JWT secret, Groq/data.gov keys) were seen — a leak risk if they reach GitHub, screenshots, or docs.

**Solution / standing policy:** Secrets live **only** as environment variables in the host dashboards (Render/Vercel/Supabase); repo has **placeholders** in `.env.example`; `.env` and `.claude/` are gitignored; every doc references secrets by **name only**. Rotation is a **user action** in the dashboards. This very guide contains no values.

**Soundbite:** *"Secrets are env-vars in the host dashboards only — placeholders in the repo, names-only in every doc, and rotation done in the dashboard, never in code."*

---

# G. EXTERNAL-API RESILIENCE (cross-cutting)

## 21. 🛡️ Every external dependency can fail — none should take the app down
**Problem:** The app depends on four external things that can each fail independently: data.gov.in (prices), the AI service (yield), Groq (chatbot/negotiator), SendGrid (email).

**Solution — a graceful-degradation policy per dependency:**
| Dependency | If it fails |
|---|---|
| data.gov.in | 4-tier fallback → last-verified → clearly-labelled simulated (#6) |
| AI service | listing saves with `predicted_yield = 0` (#16) |
| Groq | chatbot/negotiator/health-tips return **503** or fall back to `getDefaultTips`; core marketplace unaffected |
| SendGrid | boot-time verify catches misconfig; OTP is the only affected path (#5) |
| climate lookup | `climate_service_v2` **never raises** — district → state → `DEFAULT_CLIMATE` |

**Soundbite:** *"Every external call has a defined failure mode — the app degrades feature-by-feature instead of going down when the government feed, the LLM, or the model service has a bad day."*

---

# QUICK-REFERENCE: which problem to tell for which question

| If they ask… | Tell them (#) | Type |
|---|---|---|
| "Hardest bug you debugged?" | Market prices stuck simulated (7) | 🔥 |
| "A production issue and how you fixed it?" | SMTP blocked on Render (6) | 🔥 |
| "Hardest thing you designed?" | Escrow double-payment (1) | 🛡️ |
| "Concurrency experience?" | Escrow locks + idempotency (1) | 🛡️ |
| "A tricky front-end bug?" | Transparent buttons / `@layer base` (11) | 🔥 |
| "How do you handle unreliable dependencies?" | Degradation policy (21) + prices (6) | 🛡️/🔥 |
| "An ML engineering challenge?" | Column mismatch (14) or log-skew (13) | 🛡️ |
| "How do you prevent fraud/abuse?" | GPS verification (10) | 🛡️ |
| "How do you keep the system honest about accuracy?" | Confidence band caveat (15) | 🛡️ |
| "Security you're proud of / would improve?" | Enumeration (17) + secrets (20) | 🛡️ |

---

*Follow the code over any older note. Every secret is referenced by name only.*
