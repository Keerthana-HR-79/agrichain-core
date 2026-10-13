# AgriChain Core — Change Log & Interview Guide

A problem→change→why→trade-off writeup of everything built in `agrichain-core`
(the trimmed, interview-focused copy; the original live project is untouched).
Repo: https://github.com/Keerthana-HR-79/agrichain-core

Read each change as: **the problem**, **what I changed**, **how it works**, **the trade-off**.

---

## 0. What this build is
A focused copy of AgriChain with the three "set-aside" feature sets removed so the
story is tight and 100% defensible. Core kept: auth (JWT/OTP/2FA), role dashboards,
crop listings, GPS crop-stage verification, contracts, **milestone escrow**,
live-mandi settlement, notifications, reviews, watchlist, analytics, admin + disputes,
PDF contracts. Now **14 controllers / 16 routes / 24 pages / 14 DB tables**.

---

## 1. Trimmed the project (removed 3 feature sets)
- **Problem:** the full app had AI yield prediction, an AI chatbot/RAG + price negotiator,
  and an offline/PWA layer — impressive but hard to defend deeply, and not core to the pitch.
- **What I changed:** removed the Python `ai-service/`; the prediction/model-monitor/chatbot/
  negotiator controllers, routes, pages and components; and the offline/PWA layer (IndexedDB
  queue, service worker, install prompt). Rewired `Marketplace` and the stage-update page to
  call the API directly instead of the offline wrapper. Simplified `yield.js` to show the
  farmer's own expected yield only.
- **How it works:** `server.js` no longer mounts the removed routes; `App.jsx` no longer
  routes to the removed pages; `vite.config` drops the PWA plugin.
- **Trade-off:** fewer "wow" features, but everything that remains I can explain line-by-line.
- **Interview line:** *"I scoped the project to what I can defend to the metal — an escrow
  marketplace — and set aside the ML/chatbot/offline add-ons."*

**Bonus (email):** rewrote `emailService.js` to be dual-transport — **SendGrid** (HTTPS API)
when a key is set (production/Render, which blocks SMTP), otherwise **Gmail SMTP via nodemailer**
for local dev. A clean example of graceful environment-based fallback.

---

## 2. Market-price resilience fix
- **Problem:** the daily job pulls mandi prices from `data.gov.in` (Agmarknet). It's flaky.
  When a fetch failed, the code **overwrote a good government price with a "simulated" one** —
  so one bad day *downgraded* real data to a fake number.
- **What I changed:** on a failed fetch, **carry forward the last genuine `data_gov` price**
  (if ≤ 30 days old), re-label it `data_gov_cached`, and only fall back to `simulated` when no
  real price was ever recorded. Also: never downgrade a price that's already live for today.
- **How it works (`marketScraper.scrapeAndUpdatePrices`):** helpers `getLastLiveNationalPrice()`
  (reads the most recent `source='data_gov'` row, measures staleness from the *real* fetch so
  carry-forward stays bounded) and `todayNationalIsLive()`.
- **Trade-off:** a cached price can be up to 30 days stale — acceptable vs. showing a fake number.
- **Interview line:** *"A failed external fetch should degrade gracefully to the last known
  good value, never corrupt stored data. The bug was that it clobbered real prices with fakes."*

---

## 3. Removed 6 dead tables
- **Problem:** 6 tables belonged to the removed features (`prediction_history`, `prediction_log`,
  `chatbot_messages`, `rag_documents`, `crop_health_tips`, `negotiation_log`) — dead weight.
- **What I changed:** removed them from `schema.sql`, dropped them from the DB, and deleted the
  one bit of live code that still touched `prediction_history` (stage create/delete + a listing read).
- **Trade-off:** none — pure cleanup. Verified nothing else referenced them before dropping.

---

## 4. ⭐ Escrow settlement rework (the centerpiece)
This is the most important change — know it cold.

- **Problem (two bugs I found):**
  1. **Price risk was one-sided.** Old settlement paid the farmer `max(offered, market)` — a
     guaranteed price *floor*. If the market **fell**, the buyer still overpaid; the farmer never lost.
  2. **Quantity risk fell on the buyer.** Settlement used the *agreed* quantity. If the farmer
     delivered **less**, the buyer had still paid for the full amount → a loss.

- **What I changed:** settle at the **live market price × the quantity actually delivered**,
  nothing more. Dropped the `max(offered, market)` floor. Capped delivered quantity at the agreed
  amount. Everything unused is refunded to the buyer. Also shrank the up-front advances
  (see schedule) so most of the money is still in escrow at harvest to settle fairly.

- **The money math (memorize this):**
  ```
  contract_value   = quantity(tonnes) × offered_price(₹/quintal) × 10      # 10 quintals/tonne
  total_locked     = contract_value × 1.10                                 # buyer locks 110%
  crop_value       = delivered_quintals × market_price                     # pure market × delivered
  gross_payment    = min(crop_value, total_locked)                         # capped at locked funds
  balance_due      = max(0, gross_payment − already_advanced)              # top farmer up to crop value
  refund_to_buyer  = max(0, total_locked − max(gross_payment, already_advanced))
  over_advance     = max(0, already_advanced − gross_payment)              # crop-failure flag
  ```

- **Milestone schedule (was 80% out before harvest → now 30%):**
  | Milestone (GPS-verified) | Release |
  |---|---|
  | Advance (on accept) | 5% |
  | Sowing | 5% |
  | Vegetative | 5% |
  | Flowering | 5% |
  | Pre-Harvest | 10% |
  | **Final settlement — market × delivered** | **~70%** |

- **The 110% buffer / cap:** the buyer locks 110% of value. The extra 10% is head-room for a price
  rise; on a spike the payout is **capped at `total_locked`** (payout can never exceed what the
  buyer locked). So both sides are bounded to ±10% — nobody wins or loses big.

- **The money invariant (what makes it provable):**
  `released_to_farmer + refunded_to_buyer == total_locked` — money is conserved, nothing created
  or destroyed. I wrote `tests/escrow_math.test.js` — **69 invariant checks pass** across price
  fall/rise/spike, quantity shortfall, and total crop failure.

- **Worked examples (5 t @ ₹2,200/Q, locked ₹1,21,000):**
  | Scenario | Farmer gets | Buyer pays | Outcome |
  |---|---|---|---|
  | Market falls to ₹1,800, full 5 t | ₹90,000 | ₹90,000 | buyer pays real worth — no loss |
  | Delivers only 3 t @ ₹2,200 | ₹66,000 | ₹66,000 | ₹55,000 refunded — no paying for undelivered |
  | Market spikes to ₹2,600, full 5 t | ₹1,21,000 (capped) | ₹1,21,000 | bounded to +10% |

- **Trade-off (state it proactively):** the farmer **loses the guaranteed price floor**. The
  contract is no longer a *price lock* — it becomes a **committed, GPS-tracked, escrow-financed
  spot purchase** (buyer commits to buy + funds cultivation; final price = real market). This is
  fair/market-neutral, but the farmer now carries price-drop risk.

- **Residual risk:** a catastrophic harvest where delivered value < the ~30% already advanced →
  `over_advance` (can't be clawed back) → flagged in the ledger, routed to dispute.

---

## 5. ⭐ Fraud guard — advance only to a verified farm + trust panel
- **Problem:** the buyer could release the cultivation advance to a farm whose GPS location was
  never verified (a possibly-fake seller).
- **What I changed:**
  1. `releaseAdvance` now **hard-blocks** unless `listings.farm_verified = true` (joined into the
     locked query; `FOR UPDATE OF escrow, contracts` so we don't lock the listings row).
  2. A **Seller Trust panel** on the Escrow page (buyer's view): ✅ verified-farm badge, ⭐ rating,
     🤝 completed-deal count, 📅 member-since.
  3. The **Release Advance button locks** (🔒) with the reason when the farm isn't verified.
- **How the layers stack (defense-in-depth):** email-OTP account → GPS farm verification →
  advance gated on verification → advance capped at 5% → every later rupee needs a GPS stage photo
  ≤ 500 m of the registered farm → settlement pays only for delivered quantity → reviews/ratings →
  disputes + admin freeze. So a fraudster's **maximum take is the small advance, only from a real,
  location-proven farm.**
- **Trade-off:** a legit farm whose OCR failed must wait for admin verification before an advance.

---

## 6. Deploy prep
- Fixed `render.yaml` → a **single backend web service** (removed the deleted AI/Python service and
  its env vars). Rewrote `DEPLOY.md` for the no-AI build (new Supabase + storage buckets + Vercel/Render).
- `git init` + pushed to a new private-ish GitHub repo; a secret-safety gate ensures no `.env`/
  `node_modules`/`dist` is ever committed; removed a stray nested `backend/` duplicate.
- **Pending (dashboard actions, not code):** run the dead-table `DROP` in Supabase, create public
  buckets `listings` + `stages`, Render Blueprint deploy, Vercel import, set CORS.

---

## 7. Escrow foundations you must also know (not changed, but you own the story)
The escrow engine's safety comes from standard fintech patterns — be ready to explain them:
- **SERIALIZABLE transactions** — the strictest isolation; concurrent ops behave as if run one-by-one.
- **`pg_advisory_xact_lock(contract_id)`** — an app-level mutex so only one escrow op runs per
  contract at a time, even across processes.
- **`SELECT … FOR UPDATE`** — row locks so a read-modify-write can't race.
- **Idempotency keys** (`X-Idempotency-Key`) — a repeated request returns the cached result; a
  double-click can't double-pay.
- **Append-only ledger** — every money movement is one INSERT (never an UPDATE) with a running
  balance → an immutable audit trail, like double-entry bookkeeping.
- **`NUMERIC(15,2)` for money** — never floats (floats lose fractions of a rupee).

---

## 8. Interview Q&A bank
- **Q: Why trim the project?** → To defend it to the metal; set aside ML/chatbot/offline add-ons.
- **Q: What was wrong with your original settlement?** → It gave the farmer a price floor
  (`max(offered, market)`) and paid on *agreed* quantity, so the buyer lost on a price fall or a
  short harvest. I changed it to market price × delivered quantity.
- **Q: Why keep the 110% cap?** → Payout can never exceed what the buyer locked; it bounds both
  sides to ±10% and keeps the escrow solvent.
- **Q: How do you *prove* the money logic is correct?** → A pure-arithmetic invariant test —
  conservation (`released + refunded == locked`), payout ≤ locked, non-negative — 69 checks across
  every market/quantity scenario.
- **Q: How do you stop paying a fake farmer?** → Defense-in-depth: advance only to a GPS-verified
  farm, capped at 5%, every later release needs a GPS stage photo at that farm, plus reviews/disputes.
- **Q: What's side-selling and can you stop it?** → A real farmer takes the money then sells
  elsewhere. No app fully stops it (it's a legal problem), but my market-price settlement removes
  the *incentive* (this buyer also pays market), 70% is contingent on delivery, and default is
  penalized + the signed contract backs arbitration.
- **Q: How do you prevent a double-release / race condition?** → SERIALIZABLE + advisory lock +
  `SELECT FOR UPDATE` + idempotency keys.
- **Q: Biggest trade-off you made?** → The farmer loses the price floor — the contract becomes a
  financed spot purchase. I chose fairness/market-neutrality over farmer price-protection, consciously.

---

## 9. Honest limitations / future work (say these before you're asked)
- **Payments are mocked** — the escrow *logic* (lock, staged release, ledger, invariant, refund) is
  real; there's no live gateway (`mockPayment()`).
- **No eKYC** — farmer identity isn't document-verified; next step = Aadhaar/PAN via a KYC provider.
- **No e-signature** — the contract PDF has signature boxes but no captured consent; next step =
  a click-wrap typed-name + "I agree" checkbox stamped into the PDF (valid under the IT Act, 2000).
- **No default-penalty record yet** — a defaulting farmer loses the 70% but gets no visible mark;
  next step = a "report non-delivery" flow that records a default + suspension.
- **In-memory rate limiting** — fine for one instance; use Redis across instances.
- **DB is the first scaling bottleneck** — the stateless API scales horizontally; add pooling/replicas.

---

## Commit history (this build)
```
98ca41b  Fraud guard: advance only releases to a GPS-verified farm + seller trust panel
1c2040e  Rework escrow: fair market settlement on delivered quantity
8f01175  Remove dead feature tables (chatbot/RAG + AI prediction logs)
1d3de4b  Trimmed core build: remove AI/chatbot/offline; add market resilience
```
