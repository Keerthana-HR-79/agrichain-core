# AgriChain End-to-End — Part E2: The Backend, File by File

> **What this part is.** Every file in `backend/` — what it is, how it works, what it connects to, and its honest limits. E1 followed *one* request through the layers; E2 is the reference for *each organ* that request passed through. Grounded firsthand in the code.
>
> **Layout of the backend:**
> ```
> backend/
>   server.js            ← entry point: boot + middleware stack + route mounts
>   config/              ← db.js (pg pool), supabase.js (storage client)
>   middleware/          ← authMiddleware, roleMiddleware, uploadMiddleware, validationMiddleware
>   routes/              ← ~20 routers, one per area, mounted under /api/*
>   controllers/         ← the business logic (one per area)
>   services/            ← emailService, cronJobs, aiService, marketScraper, locationService
>   utils/               ← the GPS pipeline: exifHelper, ocrHelper, gpsParser, distanceHelper
> ```
> **The pattern (hold this):** `route` (declares the URL + the gate chain) → `middleware` (auth/role/validate) → `controller` (does the work, talks to DB) → `services`/`utils` (talk to the outside world + pure helpers) → `config` (the shared pool + storage client). Dependencies point *downward*; nothing in `utils` reaches back up.

---

## E2.1 — `server.js` — the entry point

**Purpose:** build the Express app, install the global middleware stack, mount every router, connect the DB, and start background jobs.

**What it does, in order:**
1. **Builds the global middleware stack** (E1.4): `cors()` → `express.json({ limit:"10mb" })` → `express.urlencoded(...)` → `app.use("/api", apiLimiter)` *(line 49 — the 60/min/IP throttle, mounted before any route)*.
2. **Mounts ~20 routers** under `/api/...` (the table in E1.5) — `app.use("/api/auth", authRoutes)`, `app.use("/api/contracts", contractRoutes)`, etc.
3. **Connects the database first:** `pool.connect()`. **Only on success** does it `app.listen(PORT)`. On failure → `console.error` + **`process.exit(1)`** *(line 124)*. The server refuses to run without a DB — fail loud, fail fast.
4. **Inside the `listen` callback** (so these run only once the server is actually up):
   - `startAllCrons()` *(line 85)* — schedules the 06:00 IST market-price job + the Sunday cleanup job (see `cronJobs.js`).
   - `verifyEmailTransport()` *(line 89)* — checks SendGrid env vars are present and logs readiness.
   - a **fire-and-forget market self-heal** *(lines 98–119)* — on boot, checks whether today's prices exist and refreshes if stale (this is the "stuck simulated" self-heal from project memory; it only skips when a genuine live row already exists).

> **⚠️ Honest limit:** the comment at line 87 still says "Verify Gmail SMTP auth at boot," but the implementation is now **SendGrid HTTPS** (stale comment, not a bug). Crons only run while the process is alive — a missed 06:00 window on a sleeping free-tier dyno isn't retried by cron (the boot self-heal is the safety net).

---

## E2.2 — `config/` — shared clients

### `config/db.js` — the PostgreSQL pool
- **Exports** a single `pg.Pool` instance (not a factory) — imported by `server.js` and essentially every controller + `cronJobs` + `marketScraper`.
- **Config:** discrete env fields (`DB_USER/HOST/NAME/PASSWORD/PORT`), `port` defaults to 5432, `ssl` is opt-in via `DB_SSL==="true"` → `{ rejectUnauthorized:false }`.
- **Why a pool:** one set of reused TCP connections multiplexed across all requests; `pg` defaults apply (`max:10`, no idle/statement timeout).
- **⚠️ Limits:** no pool sizing/timeouts (slow queries can exhaust the 10 defaults); `rejectUnauthorized:false` disables cert validation on the DB link; discrete-field style can't consume a single `DATABASE_URL`.

### `config/supabase.js` — the Storage client
- **Exports** a `@supabase/supabase-js` client created with `SUPABASE_URL` + **`SUPABASE_SERVICE_KEY`** (the service-role key → full server-side rights, bypasses RLS).
- **Important:** this file is **only the client.** The actual `.upload()`/`.getPublicUrl()` calls live **inlined in controllers**, against two buckets:
  - **`listings`** — crop photos + farm-registration photos (`listingController`) and profile photos (`profileController`).
  - **`stages`** — crop-stage photos (`cropStageController`) and update photos (`updateController`).
- Pattern everywhere: `supabase.storage.from("<bucket>").upload(timestampedName, buffer, { contentType }).getPublicUrl()`.
- **⚠️ Limits:** service-role key used from app code = any path reaching an upload has full-bucket rights (no per-user scoping); the upload logic is duplicated across four controllers instead of being one helper here.

---

## E2.3 — `middleware/` — the gates

*(Full behavior with status codes is in E1.6; here's the file-level reference.)*

| File | Export | Does | Fails with |
|---|---|---|---|
| `authMiddleware.js` | `(req,res,next)` | reads `Authorization`, `jwt.verify(token, JWT_SECRET)`, sets `req.user={id,role,…}` | `401` missing / `401` invalid-or-expired |
| `roleMiddleware.js` | `(...roles)=>(req,res,next)` | checks `req.user.role ∈ roles` | `403` wrong role / `500` if `req.user` missing |
| `uploadMiddleware.js` | `upload` (multer) | `memoryStorage()` → files as `req.file(s).buffer` | — (no size/MIME limit ⚠️) |
| `validationMiddleware.js` | `apiLimiter, authLimiter, chatLimiter, uploadLimiter, validateIdParam, validateContract, validate*` | in-memory `req.ip` rate-limit + body/param validators | `429` throttle / `400` bad input |

**Rate-limit presets** (in-memory `Map`, swept every 10 min): `authLimiter` 10/15min (wired on all auth POSTs), `apiLimiter` 60/min (global), `chatLimiter` 20/min (on `/api/chatbot/chat`), `uploadLimiter` 10/min (**exported but never wired**).

> **⚠️ Honest limit:** `validateSignup`/`validateLogin`/`validateReview`/`uploadLimiter` exist but are **not mounted** — signup/login bodies get no schema validation (only `authLimiter`), uploads get no dedicated throttle. Rate limiting is per-process + `req.ip`-keyed with no `trust proxy` (weak behind Render's proxy / across replicas).

---

## E2.4 — `controllers/` — the business logic

### Identity — `authController.js`
The full auth engine. Endpoints under `/api/auth` (all throttled by `authLimiter`):

| Endpoint | What it does |
|---|---|
| `POST /signup` | validate → check existing → **bcrypt hash (cost 10)** → create *unverified* user → generate **6-digit OTP (10-min expiry)** → `sendOTPEmail(type:"signup")` |
| `POST /signup/verify-otp` | check OTP + expiry → mark verified → issue **JWT `{id, role}`** signed with `JWT_SECRET`, `expiresIn:"7d"` |
| `POST /login` | find user → **bcrypt compare** → if user has 2FA on, send login OTP; else issue JWT |
| `POST /login/verify-otp` | verify OTP → issue JWT |
| `POST /resend-otp` | re-send by `type` (signup/login/reset) |
| `POST /forgot-password` | send reset OTP — **anti-enumeration** (always "if that email exists…") |
| `POST /reset-password` | verify OTP → bcrypt the new password |
| `POST /two-factor` | toggle per-user 2FA |
| `GET /profile` | return the real user incl. true `two_factor_enabled` |

- **Why bcrypt + JWT:** passwords are salted-hashed (never stored/reversible); the JWT is the stateless proof carried in every later request. **Why OTP:** proves the email is real and owned, and doubles as optional login 2FA.
- **⚠️ Limit:** signup/login bodies aren't schema-validated server-side (E2.3). Anti-enumeration is applied on forgot/resend but login returns a generic "invalid credentials" too.

### Marketplace — `listingController.js`, `cropStageController.js`, `updateController.js`

**`listingController.js`** (`/api/listings`) — crop listings + the create-time AI pipeline:
- **`createListing`** (multipart `image` + `farm_registration_image`): **(1)** OCR the farm-registration photo → `parseGPSData` → register the **farm's lat/lng** (the anchor all later GPS checks compare against); **(2)** upload both images to Supabase `listings`; **(3)** `axios.post(AI_SERVICE_URL + "/predict/dynamic", form, {timeout:15s})` → `predicted_yield` + confidence band; **(4)** `INSERT` the listing. **If the AI call fails → `predicted_yield = 0` and the listing is still created** (graceful degradation in the *controller*).
- `getAllListings` (public), `getListingById` (public — **exposes `farmer_phone`** ⚠️), `getMyListings`, `updateListing` (**leaks raw `error.message`**, log mislabeled "CREATE LISTING ERROR" ⚠️), `deleteListing`.

**`cropStageController.js`** (`/api/stages`) — the GPS-verified crop timeline:
- **`createStage`** (multipart photo): GPS cascade **EXIF → OCR→`parseGPSData` → client-sent coords**; upload to Supabase `stages`; **Haversine** distance vs the registered farm; **`gps_verified = distance ≤ 500 m`** (threshold hardcoded here, line 84); `stage_order` map `{Sowing:1, Early Growth:2, Vegetative Growth:3, Flowering:4, Pre Harvest:5}`; duplicate-stage guard; writes a `prediction_history`/`crop_updates` row; notifies watching buyers.
- `getStagesByListing`, `getStageDetails`, `deleteStage`.
- **⚠️ Limit:** `createStage`/`deleteStage` have **no ownership check** — the route is authenticated but doesn't verify the caller owns the listing.
- **Correction carried from E4:** a verified stage sets the **advisory** `gps_verified` flag; it does **not** auto-release escrow. The buyer sees the flag and *separately* calls the milestone-release endpoint.

**`updateController.js`** (`/api/updates`) — free-text/photo progress notes on a stage:
- `createUpdate` (multipart): same EXIF/OCR/distance pipeline, upload to `stages`.
- **⚠️ Limit:** the `/api/updates/*` routes have **no `authMiddleware`** at all, and `createUpdate` **leaks raw `error.message`**. This is the weakest-protected corner of the API.

### Deal-making — `contractController.js` (`/api/contracts`)
- `createContract` → `INSERT` a `pending` contract (buyer-initiated; `validateContract` + `roleMiddleware("buyer")`).
- `getFarmerContracts`, `getBuyerContracts`.
- **`acceptContract`** (farmer) — **the transactional heart**: `BEGIN` → `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` → `pg_advisory_xact_lock(listingId)` → `SELECT … FOR UPDATE` → **`createEscrowOnAccept(client, …)` in the same transaction** → `COMMIT`. Two buyers can't both accept the same listing into a double-escrow.
- `rejectContract`; `settleContract` → thin alias to `escrowController.settleEscrow`; `disputeContract`, `getDisputes`, `resolveDispute` (admin).

### Money — `escrowController.js` (`/api/escrow`) — the money engine
- **`createEscrowOnAccept(client, contract)`** (called inside accept's transaction): `contract_value = quantity(tonnes) × offered_price(₹/quintal) × 10`; **buffer clamped 5–25% (default 10)**; **locks `value × (1 + buffer/100)`** (110% at default); writes the escrow row + the **milestone schedule** + the first **append-only `escrow_ledger`** entry (with `running_balance`).
- **`getMyEscrows`**, **`releaseAdvance`**, **`releaseMilestone`**, **`settleEscrow`** — all buyer-initiated, all guarded by an **`X-Idempotency-Key`** header (stored in `idempotency_keys` so a double-click can't double-pay), all run as short `SERIALIZABLE` + advisory-locked transactions, all append to the ledger.
- Final **`settleEscrow`** reprices at the live mandi price, refunds/claws-back the buffer, and asserts the **money invariant** (`total_locked == released_to_farmer + refunded_to_buyer + remainder`).
- **Why:** money must be ACID, concurrency-safe, idempotent, and auditable — `NUMERIC(15,2)` not float, append-only ledger, `mockPayment` standing in for a real PSP.

### Market data — `marketPriceController.js` (`/api/market-prices`)
- `getMarketPrices` (latest per crop), `getPriceHistory` (30-day), `getCropPrice` (on-demand **4-tier ladder** via `marketScraper.getLatestPrice`), `getScrapeLog`, `triggerScrape` (admin → `cronJobs.triggerMarketUpdate`).

### Engagement — `notificationController`, `watchlistController`, `reviewController`, `profileController`
- **notifications** (`/api/notifications`): `getNotifications`, `markRead`, `markAllRead`; an internal `createNotification` is called by other controllers (e.g. a new stage notifies buyers).
- **watchlist** (`/api/watchlist`): `getWatchlist`, `checkWatchlist`, `addWatchlist`, `removeWatchlist`.
- **reviews** (`/api/reviews`): `createReview` (post-contract rating 1–5 + comment).
- **profile** (`/api/profile`): `getProfile` (public — **exposes email/phone** ⚠️), `updateProfile` (multipart → Supabase `listings` bucket for the avatar), `updatePassword`.

### Admin / ops — `adminController`, `analyticsController`, `modelMonitorController`
- **admin** (`/api/admin`, all `roleMiddleware("admin")`): `getStats`, `getUsers`, `getListings`, `getContracts`, `toggleUser` (suspend/activate), `verifyListing`, `notify` (broadcast to a target role).
- **analytics** (`/api/analytics`): `getFarmerAnalytics` / `getBuyerAnalytics` / `getPlatformAnalytics` — the role-selected dashboards.
- **model-monitor** (`/api/monitor`): `getStats` — drift detection (recent-30-day MAPE vs all-time, monthly MAPE series, error distribution, per-crop accuracy) read from `prediction_log`.

### AI — `ragController`, `agentController`, `predictionController` *(deep-dived in E6)*
- **`ragController.js`** → mounted at **`/api/chatbot`**: `chat` (keyword-RAG over a hand-written `KNOWLEDGE_BASE` + Groq LLM), `getHistory`, `clearHistory`. Throttled by `chatLimiter` (20/min).
- **`agentController.js`** (`/api/agent`): `negotiate` (agentic tool-calling price negotiator on Groq), `getCropHealthAdvice` (`GET /agent/health/:listingId/:stageName` → pulls climate from the Python `/climate` endpoint + rule-based tips, with a fallback).
- **`predictionController.js`** (`/api/ai`): `predictYield` → `aiService.getYieldPrediction`. **⚠️ `aiService` posts to a bare `/predict` route that doesn't exist** on the FastAPI service (only `/predict/json` + `/predict/dynamic` do) — this path is **stale/unused**; the live AI path is the one inside `listingController.createListing`.

### Documents — `pdfController.js` (`/api/pdf`)
- `generateContractPdf` — builds a branded PDF with **pdfkit**: parties, the escrow breakdown, milestone schedule, and the **GPS clause (≤500 m)**. Its money math (`qty × price × 10`, buffer → 110% locked, the milestone percentages) is **identical** to `escrowController` — verified consistent firsthand.

---

## E2.5 — `services/` — the outside world

### `emailService.js` — OTP email via **SendGrid HTTPS**
- **Why SendGrid HTTP, not SMTP:** Render's free tier **blocks outbound SMTP ports** (25/465/587); SendGrid's HTTPS API on 443 is never blocked. Uses the `@sendgrid/mail` SDK.
- `configureSendGrid()` (lazy, idempotent; reads `SENDGRID_API_KEY`), `verifyEmailTransport()` (boot check — presence of `SENDGRID_API_KEY` + `EMAIL_USER` only; SendGrid has no credential round-trip), `sendOTPEmail({name,email,otp,type})` (branded HTML template; three copies: signup/login/reset; `from` = verified sender `EMAIL_USER`; deep-extracts SendGrid's nested error body and **re-throws** so `forgotPassword` can track failure).
- **⚠️ Limits:** boot verify can't detect an *invalid* key or *unverified sender* (only missing vars) — a bad key still surfaces as a 403 on first real send; OTP-only (no welcome/receipt emails); SendGrid free tier = 100/day.

### `cronJobs.js` — scheduled jobs (`node-cron`)
- **`startMarketPriceCron`** — `"0 6 * * *"` @ **Asia/Kolkata** (06:00 IST daily) → `scrapeAndUpdatePrices()`.
- **`startCleanupCron`** — `"0 0 * * 0"` @ IST (Sunday 00:00) → prune `market_scrape_log` >30d and `market_prices` >90d (fire-and-forget).
- **`triggerMarketUpdate()`** — manual/admin + boot self-heal trigger.
- A single module-level **`isRunning` flag** coordinates cron + admin + boot so **scrapes never overlap**.
- **Why IST timezone pinned:** "6 AM" must mean 6 AM for Indian farmers regardless of the server's timezone.
- **⚠️ Limits:** per-process flag (two instances could still overlap); missed windows on a sleeping dyno aren't retried by cron (boot self-heal covers it); cleanup failures are swallowed.

### `aiService.js` — HTTP client to the Python ML service
- `getYieldPrediction(data)` → `axios.post(AI_SERVICE_URL + "/predict", data)` (fallback `http://127.0.0.1:8000`).
- **⚠️ Honest limit:** **no timeout, no retry, re-throws** — it does **not** degrade gracefully, and it targets a **non-existent `/predict` route**. Any real graceful-degradation lives in `listingController` (which uses `/predict/dynamic` directly). Treat `aiService.js` as effectively dead code.

### `marketScraper.js` — data.gov.in (Agmarknet) prices + fallback ladder
- Hits the data.gov.in Mandi resource (`DATA_GOV_API_KEY`, with a hardcoded **public sample key** fallback so the demo runs out-of-box — the documented production fix is setting your own key, since the shared one is throttled).
- **`fetchLivePrice`** — location-widening fallback **district → state → national** (a real price beats an over-specific empty result); small page size (60) deliberately, to beat the gov server's slow-response timeouts; `modal_price` (the "most-traded" price) is the representative.
- **`getLatestPrice`** — the **4-tier ladder**: ① cache (<25 h) → ② live fetch → ③ last verified `data_gov_cached` → ④ deterministic `simulated`. The `source` column makes every row's provenance honest (`data_gov` / `data_gov_cached` / `simulated` / `default` / `admin`).
- **`upsertPrice`** — `ON CONFLICT (crop, state, district, market, date) DO UPDATE` (natural 5-tuple key).
- **⚠️ Limits:** shared sample key throttles; 15-crop hardcoded commodity map (unmapped crops → simulated); national average collapses regional variation; simulated prices are plausible but fictional.

### `locationService.js` — state/district/taluka dropdown data
- POSTs to the **indiadataportal.com CKAN** `datastore_search` API (three resource ids) for `getStates`/`getDistricts`/`getTalukas`. Serves `/api/location`.
- **⚠️ Limits:** **no try/catch, no timeout** (upstream failure = unhandled rejection); leftover module-load `console.log`s; points at the `ckandev` (dev) host; returns the raw CKAN envelope. *(This is why the frontend ships a static `indiaLocations.js` fallback — see E3.)*

---

## E2.6 — `utils/` — the GPS photo-verification pipeline

Four pure helpers, orchestrated by `cropStageController`/`updateController`/`listingController` in the order **EXIF → OCR+parse → Haversine → threshold**:

| File | Export | Does | Honest limit |
|---|---|---|---|
| `exifHelper.js` | `extractGPS(buffer)` | `exifr.parse` → `{latitude, longitude, timestamp}` or `null` | most watermark-camera photos have no EXIF GPS → the expected miss that triggers OCR |
| `ocrHelper.js` | `extractText(buffer)` | `tesseract.recognize(buffer,"eng")` → burned-in watermark text | re-inits the OCR engine per call → slow/CPU-heavy on 512 MB; English-only |
| `gpsParser.js` | `parseGPSData(text)` | regex lat/long/village/date/time; reconstructs a **"broken" latitude** when OCR drops the decimal (assumes 2-digit integer part — India-specific) | longitude has no broken-format recovery; village heuristic brittle; no range validation |
| `distanceHelper.js` | `calculateDistance(lat1,lon1,lat2,lon2)` | **Haversine**, `R=6371000` → metres | the **500 m verify threshold lives in the controllers**, not here |

> **The 500 m rule's blast radius:** it appears in `cropStageController` (`≤500` → `gps_verified`), the **PDF contract clause** (`pdfController`), and the **chatbot KB** (≤500 m = "GPS Verified" green). Change it in one place and the other two drift — a single-source-of-truth gap worth naming.

---

## E2.7 — Consolidated honest security findings

These are real and worth volunteering ("here's what I'd harden next"):

1. **`/api/updates/*` has no `authMiddleware`** — the least-protected routes.
2. **`cropStageController.createStage`/`deleteStage` have no ownership check** — authenticated but not "is this your listing?"
3. **Public PII:** `GET /api/listings/:id` returns `farmer_phone`; `GET /api/profile/:id` returns email/phone.
4. **Error-message leakage:** `listingController.updateListing` + `updateController.createUpdate` return raw `error.message` (the former's log is mislabeled "CREATE LISTING ERROR").
5. **Concurrency rigor is only on `acceptContract` + escrow releases** — appropriate (that's where money is), but worth stating as a deliberate scope.
6. **Multer: no size/MIME limit**; **rate-limit: in-memory + `req.ip`, no `trust proxy`**; **unwired validators** (E2.3).
7. **Supabase service-role key used from app code** — any upload path has full-bucket rights.

None are on the money path's critical section (escrow is the hardened part); all are the honest "v2 hardening" list.

---

## E2.8 — Why the backend is structured this way

| Choice | Why |
|---|---|
| **route → middleware → controller → service/util layering** | each layer has one job; you can read a route and know its gates without opening the controller |
| **one `pg.Pool`, parameterized SQL only** | connection reuse + injection-proof by construction |
| **ACID + locks + idempotency only around money** | spend the complexity budget where correctness is non-negotiable; keep reads simple |
| **services wrap every external call** (email, AI, market, location, storage) | the outside world is swappable and failures are contained to one file |
| **graceful degradation in controllers** | a down ML/price/email service never takes down core commerce |
| **SendGrid HTTP over SMTP** | the host blocks SMTP ports — this is a deployment-driven choice, not a preference |
| **crons pinned to IST + boot self-heal** | correct for the users; resilient to free-tier sleeps |

---

### Next: **E3 — the frontend, file by file** (the axios spine, the flat unguarded route table, the per-page auth gate, the offline/PWA subsystem, every page + component). Then **E5 (the complete user journey)** and **E6 (the AI service & integration)**. **E1** and **E4** are already delivered.
