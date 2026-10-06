# Part B4 — Extras (notifications · reviews · watchlist · admin · model-monitor · analytics · PDF) + consolidated Group-B Q&A + how to talk about Group B

> **Group B — NOT on your résumé. 🟡 SET ASIDE.** The final part. **Covers:** the supporting features that make AgriChain feel like a real product — notifications, reviews & ratings, watchlist, the admin panel, the **model-monitoring / drift-detection** loop (the standout here), analytics dashboards, and PDF contract generation — each at **"know it exists, explain it in two sentences"** depth. Then a **consolidated Group-B rapid-fire Q&A** and a closing script: **how to talk about Group B without over-claiming.**
> **Why Group B:** none of these are the three résumé bullets. They're breadth, not the headline. Know the **gist** so that if an interviewer pokes at the live app and asks *"what's this button?"* you have a crisp, honest answer — and you can say *"yes, it also does X"* **without inflating it.**

**Framing line if asked:** *"Around the core marketplace-and-escrow I built the usual product-supporting features — notifications, reviews, a watchlist, an admin panel, analytics, PDF contracts, and a little MLOps monitoring for the yield model. None of it is on my résumé because it's breadth, not the headline, but I'm happy to show any of it in the live app."*

---

## B4.0 The 30-second summary

> *"Beyond the core flow, AgriChain has the features you'd expect from a real marketplace: an **in-app notification** system that every important event writes to; **reviews and star-ratings** after a completed contract, which roll up into each user's average rating; a **watchlist** for buyers to save listings; an **admin panel** with platform stats, user activation, farm verification, and broadcast notifications; **analytics dashboards** for farmers, buyers, and admins; **PDF contract generation**; and a small **model-monitoring** page that logs every yield prediction, records the actual yield at harvest, and computes error and drift over time. They're all supporting features — I kept the résumé to the escrow-and-verification core."*

---

## B4.1 Notifications (the event backbone)

**What it is:** a single `notifications` table that many features write to, and a simple API the frontend polls to show a bell with an unread count.

**Firsthand (`notificationController.js`):** three endpoints —
- `getNotifications` → latest **50** for the logged-in user, newest first, plus a computed **`unread_count`**.
- `markAsRead` → marks **one** read (scoped by `user_id`, so you can't mark someone else's).
- `markAllRead` → marks all the user's notifications read.

**The shape of a notification:** `user_id, title, message, type, reference_id, reference_type, is_read, created_at`. The `reference_id`/`reference_type` pair (e.g. `contract` / `listing`) lets the UI **deep-link** a notification to the thing it's about.

**🔵 The pattern worth naming:** notifications are **written by other controllers as side-effects** of real events — a new review (B4.2), an admin farm-verification or broadcast (B4.4), a negotiator decision (B2.6). It's a lightweight **fan-out-on-write** model: each event inserts a row for the affected user; the client **pulls** them. There's no WebSocket/push — it's poll-based.

> **Say it:** *"Notifications are one table that every important event writes a row to — a new review, a farm verification, a broadcast. The client fetches the latest 50 with an unread count and can deep-link each one via a reference id. It's poll-based, not real-time push — that's the honest limit."*

**⚠️ Honest limit:** poll-based, not real-time (no WebSocket/service-push); fine at this scale, but I'd move to push for production.

---

## B4.2 Reviews & ratings (with integrity rules)

**What it is:** after a contract is **completed**, either party can leave the other a 1–5 star review; each user carries a rolling **average rating**.

**Firsthand (`reviewController.js`) — the integrity rules are the interesting part:**
- **Rating must be 1–5** (validated) → else `400`.
- **Only on `completed` contracts** → else `400`. (You can't review a deal that didn't finish.)
- **Reviewer must be a party** to the contract (buyer or farmer) → else `403`; the **reviewee is automatically the *other* party**.
- **One review per contract per reviewer** — enforced by a DB **unique constraint**; a duplicate throws Postgres error `23505`, which the code catches and turns into a friendly **`409` "You have already reviewed this contract."**
- On insert, it **recomputes the reviewee's `avg_rating` and `total_reviews`** with a single `AVG`/`COUNT` and stores them on the user row (denormalized for fast display).
- It **notifies** the reviewee ("New Review Received ⭐").

`getUserReviews` returns the list **plus a stats block** — average, total, and the **5/4/3/2/1-star distribution**.

**🔵 Why this is a good answer:** it shows you think about **data integrity** — server-side validation, authorization (must be a party), and a **DB-level uniqueness guarantee** rather than trusting the client not to double-submit. Same discipline as the escrow idempotency work, just lighter.

> **Say it:** *"Reviews only apply to completed contracts, only by a party to them, one per contract — enforced by a unique constraint, so a duplicate comes back as a clean 409. Each review recomputes the other user's average rating and notifies them. The uniqueness and the 'must be a party' check are the integrity points."*

**⚠️ Honest limit:** denormalized `avg_rating` could drift from the reviews if a review were ever deleted out-of-band; there's no moderation/abuse handling.

---

## B4.3 Watchlist (buyer "save for later")

**What it is:** buyers can **bookmark** listings to a personal watchlist.

**Firsthand (`watchlistController.js`):** `addToWatchlist` (insert with **`ON CONFLICT DO NOTHING`** so saving twice is harmless — a small **idempotency** touch), `removeFromWatchlist`, `getWatchlist` (joins listings + farmer name, newest first), and `checkWatchlist` (returns a `saved` boolean so the UI can show a filled/empty bookmark).

> **Say it:** *"A simple buyer watchlist — add, remove, list, and a 'is this saved?' check. Saving twice is a no-op thanks to ON CONFLICT DO NOTHING. It's one of the smaller features."*

**⚠️ Honest limit:** it's genuinely simple — no alerts when a watched listing changes price or sells. (A natural next step: fire a notification on watched-listing events.)

---

## B4.4 Admin panel

**What it is:** an admin-only (`role("admin")`) back-office for running the platform.

**Firsthand (`adminController.js`):**
- **`getDashboardStats`** — headline counts via parallel queries: users, farmers, buyers, listings, contracts, pending/accepted contracts, verified farms, total predicted yield.
- **`getAllUsers` / `getAllListingsAdmin` / `getAllContractsAdmin`** — full-table views with joined names for oversight.
- **`toggleUserStatus`** — flips a user's **`is_active`** flag (deactivate/reactivate an account) — basic moderation.
- **`verifyFarm`** — sets a listing's **`farm_verified = true`** and notifies the farmer. **🔵 Note the distinction:** this is a *manual admin trust stamp* on a listing, **separate from** the automated per-photo **GPS stage verification** in Group A (Part 6). Two different "verifications" — be ready to distinguish them.
- **`broadcastNotification`** — insert a notification for **all active users** or a **target role** (farmers/buyers), reusing the B4.1 table.

**This is also where disputes land (firsthand, Group A `contractController.js`):** a party raises a dispute → the contract **freezes** (escrow actions return **HTTP 423 Locked**) → an **admin resolves** it (resolved/rejected). So the admin role is the human backstop for the money engine.

> **Say it:** *"There's an admin panel — platform stats, user lists, the ability to activate or deactivate accounts, manually verify a farm with a trust badge, and broadcast a notification to a role or everyone. Admin is also who resolves a disputed contract, which freezes escrow until they rule. I keep the manual farm-verify separate from the automated GPS photo verification."*

**⚠️ Honest limit:** admin role is a simple flag, not a granular permission system; actions aren't audit-logged beyond the notifications/ledger they touch.

---

## B4.5 🔵 Model monitoring / drift detection — the standout extra

This is the one Group-B extra genuinely worth understanding, because it's real, lightweight **MLOps** — and "how do you know your model stays good in production?" is a sharp interview question.

**The problem:** a yield model is trained once on a snapshot. In the real world, conditions change and a model silently gets **worse** — that's **drift**. You only catch it if you **measure predictions against reality** over time.

**What AgriChain does (firsthand, `modelMonitorController.js`), a 3-step loop:**
1. **`logPrediction`** — every time a yield is predicted (at listing creation), a row goes into a **`prediction_log`** table: crop, district, state, inputs, the predicted yield, and the **`model_version`** ("2.0"). So every prediction is recorded with the version that made it.
2. **`recordActual`** — at harvest/settlement, the **actual** yield is written back to the most recent prediction for that listing, and the code computes **`error_pct = |actual − predicted| / predicted × 100`** (per-prediction percentage error).
3. **`getMonitoringStats`** — the dashboard: overall **MAPE / MAE / stddev** over all predictions that now have actuals, **per-crop** accuracy, a **monthly trend**, an **error-distribution histogram** (`<5% / 5–10% / 10–20% / 20–30% / >30%` buckets), and a recent-predictions list.

**🔵 The clever bit — drift detection:** it compares the **last-30-days MAPE** against the **all-time MAPE**. If recent error is **more than 1.3× worse**, it raises a **`drift_detected`** alert; **>1.5×** is flagged **"high"** severity. That's a concrete, defensible definition of drift — *"recent accuracy is materially worse than historical."*

> **Say it (interview gold):** *"I added a small monitoring loop: every prediction is logged with its model version, the actual yield is recorded at harvest, and I compute per-prediction error. A dashboard shows overall MAPE, per-crop accuracy, an error histogram, and — the useful part — drift detection: if the last 30 days' error is more than 1.3× the all-time error, it flags drift, 1.5× is high severity. It's the closed loop that tells you when to retrain."*

**🔵 Why it impresses:** most student projects train a model and stop. Closing the loop — *predicted vs actual vs time, with a drift threshold* — shows you understand that **a model in production is a system to be monitored, not a one-off artifact.** This pairs with B1's honest MAPE discussion.

**⚠️ Honest limit:** it needs **actuals** to be entered to compute error, so the signal is only as good as the harvest data captured; the 1.3×/1.5× thresholds are heuristic, not statistically derived; and it monitors **outcome drift** (error getting worse), not **input/feature drift** directly.

---

## B4.6 Analytics dashboards

**What it is:** role-specific dashboards that aggregate each user's own data (and the whole platform's, for admin).

**Firsthand (`analyticsController.js`):**
- **Farmer** — listing counts (total/verified/active), contract funnel (pending/accepted/completed), stage counts (and how many GPS-verified), total/avg predicted yield, revenue from completed contracts, a 12-month trend, crop distribution, and a prediction-accuracy deviation.
- **Buyer** — contract funnel, total committed vs spent vs active value (`quantity × offered_price × 10` — **same unit math as Group A's escrow**, consistent), crop portfolio, monthly trend, and **top farmers** by contract count.
- **Platform (admin)** — users (with new-this-month), listings, contracts and completed volume, **regional** breakdown by district, crop breakdown, and **user-growth** over 12 months.

**🔵 Worth noticing:** it's all **SQL aggregation** — `COUNT(CASE WHEN …)`, `SUM`, `AVG`, `GROUP BY TO_CHAR(created_at,'Mon YYYY')` for monthly trends. No analytics library; the database does the work. That the buyer's committed-value math (`× 10`) matches the escrow engine is a good sign of a consistent domain model.

> **Say it:** *"Three analytics views — farmer, buyer, and platform — built with plain SQL aggregation: counts, sums, conditional counts, and month-bucketed trends. The buyer's committed-value math reuses the same tonnes-to-quintals conversion as the escrow engine, so the numbers are consistent across the app."*

**⚠️ Honest limit:** computed on-the-fly per request (no materialized views/caching) — fine now, would need caching at scale.

---

## B4.7 PDF contract generation

**What it is:** a **"download/print contract"** that produces a formatted, legal-looking agricultural purchase contract.

**Firsthand (`pdfController.js`), and the design choice is the interview point:**
- It does **not** use a heavy PDF library. Instead the server **builds a styled HTML document** and returns it; the **browser's own print-to-PDF** turns it into a PDF (there's even an auto-`window.print()` when opened with `?print=true`). The code's own comment says this *"avoids heavy PDF libraries while giving full styling control."*
- The document pulls everything in **one query** (contract + farmer + buyer + listing + escrow + a sub-select for the live market price) and renders: parties, crop & farm details, a **financial summary**, the **stage-based payment schedule**, a **settlement record** (only if the contract is settled), seven **terms & conditions**, and signature blocks.
- **🔵 Consistency check (I verified this firsthand):** the PDF's money math — `totalValue × 0.15` advance, 15/20/20/10% stages, ≈20% final, **10% buffer, 110% locked** — **exactly matches `escrowController.js`.** The generated contract and the actual money engine agree. (This is the firsthand proof that Group A's escrow numbers are internally consistent; only the *chatbot's* hand-written KB text had drifted, not this.)

> **Say it:** *"The contract 'PDF' is actually server-rendered HTML that the browser prints to PDF — deliberately, to avoid a heavy PDF dependency while keeping full CSS control. It shows the parties, the stage payment schedule, and a settlement record once closed, and its numbers mirror the escrow engine exactly."*

**⚠️ Honest limit:** it's print-to-PDF, not a signed/stamped legal document; "legally binding once signed" is aspirational framing, not e-signature infrastructure.

---

## B4.8 Crop-health advisor (cross-reference)

Covered in **[B2.7]** — an LLM asks for 3 care tips from the crop's climate + stage, with a **rule-based fallback** (`getDefaultTips`) so it always returns something. Mentioned here only so the feature-map is complete; it lives with the AI layer in B2.

---

## B4.9 Consolidated Group-B rapid-fire Q&A (B1–B4)

**ML / yield (B1)**
- *Model?* XGBoost — gradient-boosted trees, best for tabular regression.
- *Target trick?* Train on log-yield, invert with `expm1` (yields are skewed).
- *How good?* R² ≈ 0.87 (strong), MAPE ≈ 30% (moderate) → decision support, not a guarantee.
- *Uncertainty?* Empirical per-crop 5th–95th-percentile band (±15% fallback) — a range, not a calibrated interval.
- *If it's down?* Graceful degradation — core app unaffected.
- *Why separate service?* ML is Python; microservice keeps Node lean, deploys independently (Python pinned 3.12.1).

**AI chatbot / negotiator (B2)**
- *RAG?* Retrieve my own docs first, feed as context, so the LLM answers from my policies.
- *Embeddings?* **No — keyword-overlap over 10 curated docs, top 3.** Upgrade path is pgvector; limit is synonyms. *(Say this honestly.)*
- *Provider/model?* Groq (OpenAI-compatible API), free open-weights ~20B; key in env; missing key → clean 503.
- *Memory?* LLM is stateless; I resend the last 8 messages.
- *"Agentic"?* Real tool-calling loop (≤5 iters): 3 tools (market price, predicted yield, suggest-counter-offer); model picks tools, my code runs them, loops until it decides.
- *Does the agent move money?* No — advisory only; money moves only through escrow.

**Offline / PWA (B3)**
- *PWA?* Manifest + service worker + HTTPS → installable, opens offline.
- *Offline loading?* Service worker (vite-plugin-pwa/Workbox) precaches the shell, `navigateFallback` → index.html for SPA routes.
- *Offline writes?* Check `navigator.onLine`; offline → queue the request in IndexedDB (Dexie) + optimistic success; on reconnect a hook replays oldest-first with a fresh JWT, 3 retries then "failed."
- *Photos offline?* **No** — `File` can't serialize to IndexedDB; text mutations only. *(Honest headline.)*
- *Conflicts?* Last-write-wins, no merge.

**Extras (B4)**
- *Notifications?* One table every event writes to; poll-based, unread count, deep-link via reference id.
- *Reviews integrity?* Completed contracts only, by a party only, one per contract (unique constraint → 409); recomputes avg rating.
- *Watchlist?* Buyer bookmarks; `ON CONFLICT DO NOTHING` idempotent save.
- *Admin?* Stats, activate/deactivate users, manual farm-verify (≠ GPS verify), broadcast, resolve disputes (which freeze escrow → 423).
- *Model monitoring?* Log prediction (with version) → record actual at harvest → compute error → **drift alert if last-30-day MAPE > 1.3× all-time.**
- *Analytics?* Plain SQL aggregation (counts, sums, monthly buckets) for farmer/buyer/platform.
- *PDF?* Server-rendered HTML → browser print-to-PDF; numbers mirror the escrow engine.

---

## B4.10 🟡 How to talk about Group B without over-claiming (read this before any interview)

This is the **close-out of the whole course.** Group B exists so that breadth **helps** you instead of tripping you.

**The three rules:**

1. **Lead with Group A; let Group B be "and also."** Your résumé is the escrow-and-verification core — that's your story. Group B is the answer to *"did you do anything else?"*, not your opening. Never volunteer a half-remembered Group-B detail where a confident Group-A answer belongs.

2. **Under-claim, then over-deliver.** The honest framings are *stronger* than inflated ones:
   - *"It's keyword retrieval, not embeddings — here's why, and here's the upgrade path."* ← senior-sounding.
   - *"The yield model is ~30% MAPE, so I treat it as decision support."* ← shows judgment.
   - *"The negotiator is advisory; it never moves money."* ← shows you know where the risk is.
   An interviewer trusts the candidate who names their own limits far more than the one who oversells.

3. **Know the one-line gist of each, and the one honest limit.** You don't need to defend Group B to the depth of Group A. For each feature you need exactly two things: **what it is in a sentence**, and **the single honest caveat**. That's enough to say *"yes, it does X"* truthfully and move on — or to go deeper only if they ask.

**The umbrella line (use when asked "what else does it do?"):**
> *"On top of the core, it has the product-supporting features — notifications, reviews and ratings, a watchlist, an admin panel with dispute resolution, analytics dashboards, PDF contracts — plus an optional AI layer (a RAG chatbot and a tool-calling price negotiator) and a yield-prediction model with a little drift-monitoring. All of it degrades gracefully and none of it is load-bearing for the escrow flow, which is why I kept the résumé focused there."*

**If they zoom in on one Group-B item:** give the 30-second summary from that part (B1.0-style / B2.0 / B3.0 / B4.0), then **stop and let them steer.** Don't pre-emptively dump the whole part.

**The two traps to avoid:**
- ❌ **Claiming embeddings / a vector DB.** You used keyword retrieval. The code proves it. The honest version is the better answer (B2.3).
- ❌ **Claiming the yield model is accurate.** It's R² 0.87 / MAPE ~30%. Call it decision support. Overstating a model is the fastest way to lose credibility with anyone who's shipped ML.

> **The one mantra:** *"Group A is what I built and will defend to the metal. Group B is what I also built, know honestly, and won't oversell."*

---

### ⚠️ HONEST LIMITS recap (Group B as a whole)
- **ML:** MAPE ~30% (planning aid); band is empirical, not calibrated; a snapshot that needs the monitoring loop + retraining.
- **AI:** keyword RAG not embeddings; LLM can hallucinate; curated KB can drift from code; Groq free-tier limits; negotiator is advisory.
- **Offline:** photos need internet; last-write-wins, no conflict merge; 3-retries-then-failed.
- **Extras:** notifications poll-based not push; admin is a flag not granular RBAC; analytics uncached; "PDF" is print-to-PDF, not signed e-docs.

---

### End of Group B. ← You now have the full map: **Group A (Parts 0–10)** to defend to the metal, **Group B (Parts B1–B4)** to know honestly and never oversell. Study Group A first; skim Group B the night before.
