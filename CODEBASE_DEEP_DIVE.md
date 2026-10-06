# AgriChain — Codebase Deep Dive (File-by-File Workflow Reference)

> **What this document is.** A *file-by-file* walkthrough of the entire AgriChain codebase, organized into 8 batches (backend foundation → auth → listings/GPS → escrow → market/AI → Python ML service → frontend → database). For each file you get: its **purpose**, its **key functions/exports**, the **step-by-step workflow** of how data/requests flow through it, the **DB tables / external calls / status codes** it touches, and **interview-defensible details** (including honest caveats).
>
> **How this differs from the other two docs.** `AGRICHAIN_PROJECT_KNOWLEDGE.md` and `PROJECT_EXPLAINED.md` are organized by *concept* (what the project is, the end-to-end story, the tech-stack rationale). **This** document is organized by *file* — it's the "open the repo and explain any file they point at" reference. Read the concept docs first for the story; use this one to defend the implementation.
>
> Everything here was read directly from the source (Sept 2026). Where code and older notes disagree, this follows the code.

## Batch map

| Batch | Coverage | Key files |
|---|---|---|
| **1 — Foundation & routing** | app bootstrap, DB/Storage config, middleware, full route map | `server.js`, `config/*`, `middleware/*`, all `routes/*` |
| **2 — Auth & social** | signup/OTP/login/2FA/reset, email, profile, reviews, notifications, watchlist | `authController.js`, `emailService.js`, `profileController.js`, … |
| **3 — Listings & GPS pipeline** | listing + AI call, crop stages, EXIF→OCR→Haversine verification | `listingController.js`, `cropStageController.js`, `utils/*` |
| **4 — Contracts & escrow** | contract lifecycle, escrow money-engine, PDF, math test | `contractController.js`, `escrowController.js`, `pdfController.js` |
| **5 — Market/RAG/agent/admin** | mandi scraper + fallback, cron, RAG chatbot, negotiator, analytics, admin, monitor | `marketScraper.js`, `ragController.js`, `agentController.js`, … |
| **6 — Python AI service** | FastAPI endpoints, XGBoost inference, climate, feature engineering, training | `app.py`, `inference.py`, `climate_service_v2.py`, … |
| **7 — Frontend** | bootstrap + routing, axios layer, Dexie offline/PWA, components, key pages | `main.jsx`, `App.jsx`, `lib/*`, `components/*`, `pages/*` |
| **8 — Database schema** | complete data dictionary, FK graph, migration order | `schema.sql`, `market_schema.sql`, `escrow_schema.sql` |

**Middleware legend used throughout:** `auth` = `authMiddleware` (JWT), `role(x)` = `roleMiddleware(x)` (RBAC), `upload` = Multer, `validation` = `validateIdParam` / `validateContract` / rate limiters.

---

# BATCH 1 — Backend Foundation & Routing Spine

**Root:** `backend/`. This batch is the skeleton: how the server boots, how it talks to Postgres and Supabase, the four middleware that guard every request, and the complete map of all 79 API endpoints.

## 1.1 `server.js` — application entry point

**Purpose:** Loads env, builds the Express app, wires global middleware, mounts all 20 route modules under `/api/*`, connects to PostgreSQL, then starts the HTTP server + cron jobs + a self-healing market-price refresh.

**Startup workflow (exact order):**
1. `require("dotenv").config()` **on line 1** — must precede everything, because `config/db.js` reads `process.env` at import time.
2. Debug logs dump `DB_NAME`, `DB_USER`, `EMAIL_USER`, whether `EMAIL_PASS` exists + its length.
3. Requires express, cors, the pool, the rate limiter, the cron service, and all 20 routers.
4. `cors({ origin: FRONTEND_URL || "http://localhost:3000", credentials: true })`.
5. `express.json({ limit: "10mb" })` + `express.urlencoded({ extended:true, limit:"10mb" })`.
6. `app.use("/api", apiLimiter)` — rate-limits **all** `/api` traffic (60/min/IP).
7. Mounts the 20 routers + `express.static("uploads")`.
8. `GET /` health root → `"AgriChain Backend ✅"`.
9. `pool.connect()` → on success logs `✅ PostgreSQL Connected`, then `app.listen(PORT)`. Inside the listen callback: `startAllCrons()`, then a **fire-and-forget self-heal IIFE**: `SELECT 1 FROM market_prices WHERE recorded_date = CURRENT_DATE AND source <> 'default' LIMIT 1`; if no live row exists, `await triggerMarketUpdate()`. Wrapped in try/catch so a slow/failed fetch never blocks boot.
10. On `pool.connect()` failure → logs `❌ Database connection failed` + `process.exit(1)`.

**Env/services:** `DB_NAME/USER/…` (via db.js), `EMAIL_USER/PASS`, `FRONTEND_URL`, `PORT`; touches Postgres, cron, and the market-price API.

**Interview-defensible details:**
- **Load order is deliberate** — `dotenv` before `db.js` or credentials are `undefined`.
- **DB-gated boot** — `app.listen` is nested inside `pool.connect().then()`; the server never serves traffic before the DB is reachable (fail-fast).
- **Self-heal IIFE is fire-and-forget on purpose** — fresh DBs would otherwise show only `'default'` seed prices until the 6 AM cron.
- **Honest caveats:** the `pool.connect()` client is acquired but never `release()`d (a one-off pool leak); logging `EMAIL_PASS` length is a minor info leak; static `/uploads` is legacy (uploads actually go to Supabase via memory buffers).

## 1.2 `config/db.js` — the PostgreSQL pool

Exports a **singleton** `pg.Pool` built at import time from `DB_USER/HOST/NAME/PASSWORD/PORT` (default 5432). SSL is conditional: `ssl: DB_SSL === "true" ? { rejectUnauthorized:false } : false`.

**Interview points:** one shared pool = connection reuse across all controllers. `rejectUnauthorized:false` accepts managed/self-signed certs — required for Supabase Session-pooler / Render managed Postgres, at the cost of not verifying the CA.

## 1.3 `config/supabase.js` — the Storage client

Exports `createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)`. **Uses the service key, not the anon key** — it has admin rights and **bypasses Row-Level Security**, so it must stay server-side only. Primary job: push in-memory Multer buffers to Storage.

## 1.4 Middleware (`middleware/`)

- **`authMiddleware.js`** — reads `Authorization: Bearer <token>`; missing → `401 "No token provided"`; `jwt.verify(token, JWT_SECRET)` → sets `req.user`; failure → `401 "Invalid token"`. Stateless; must run before `roleMiddleware`.
- **`roleMiddleware.js`** — a *factory*: `roleMiddleware(...allowedRoles)` returns a guard that checks `allowedRoles.includes(req.user.role)` → else `403`. A missing `req.user` throws → caught → `500`. Usage: `role("admin")`, `role("buyer","farmer")`.
- **`uploadMiddleware.js`** — Multer with **memory storage** so buffers stream straight to Supabase (no local disk). **No size/MIME limits configured** — a hardening gap.
- **`validationMiddleware.js`** — dependency-free validation + in-memory rate limiting. Provides `rateLimit({windowMs,max})` (fixed-window counter in a module `Map`, keyed by IP, `429` + `Retry-After` on exceed), `validate(schema)` (`400` with first error), `validateIdParam(...names)` (rejects non-integer/≤0 IDs with `400` before they hit Postgres), plus presets `authLimiter` (10/15min), `apiLimiter` (60/min), `uploadLimiter` (10/min), `chatLimiter` (20/min). A `setInterval` purges expired entries every 10 min.
  - **Honest caveats:** rate-limit state is **in-process memory** — resets on restart and isn't shared across instances (won't hold behind horizontal scaling; needs `trust proxy` for correct `req.ip`). `uploadLimiter` and `validateReview` are exported but never wired to their routes.

## 1.5 `package.json` — dependencies that reveal the feature set

Scripts: `dev`→`nodemon`, `start`→`node server.js`, `test`→`node tests/escrow_math.test.js`. Notable deps: `pg`, `bcrypt`, `jsonwebtoken`, `multer`, `nodemailer` (OTP), `node-cron` (schedules), **`exifr`** (photo geotag extraction), **`tesseract.js`** (OCR farm verification), `@supabase/supabase-js`, `axios`. **Express 4**, and validation/rate-limiting are **hand-rolled** (no `joi`/`zod`/`express-rate-limit`).

## 1.6 Complete route map (20 routers, 79 `/api` endpoints)

| Router | Method | Path (under `/api`) | Middleware | Controller.fn |
|---|---|---|---|---|
| auth | POST | /auth/signup | authLimiter | authController.signup |
| auth | POST | /auth/signup/verify-otp | authLimiter | verifySignupOTP |
| auth | POST | /auth/login | authLimiter | login |
| auth | POST | /auth/login/verify-otp | authLimiter | verifyLoginOTP |
| auth | POST | /auth/resend-otp | authLimiter | resendOTP |
| auth | POST | /auth/forgot-password | authLimiter | forgotPassword |
| auth | POST | /auth/reset-password | authLimiter | resetPassword |
| auth | POST | /auth/two-factor | auth | toggleTwoFactor |
| auth | GET | /auth/profile | auth | getProfile |
| prediction | POST | /ai/predict | (none) | predictionController.predictYield |
| listing | POST | /listings/create | auth, upload.fields([image, farm_registration_image]) | createListing |
| listing | GET | /listings/my-listings | auth | getMyListings |
| listing | GET | /listings/all | (none) | getAllListings |
| listing | GET | /listings/:id | validateIdParam | getListingById |
| listing | PUT | /listings/:id | validateIdParam, auth | updateListing |
| listing | DELETE | /listings/:id | validateIdParam, auth | deleteListing |
| location | GET | /location/states | (none) | → locationService.getStates |
| location | GET | /location/districts/:stateCode | (none) | → getDistricts |
| location | GET | /location/talukas/:districtCode | (none) | → getTalukas |
| upload | POST | /upload/ | upload.single("image") | inline (returns req.file) |
| cropStage | POST | /stages/create | auth, upload.single("image") | createStage |
| cropStage | GET | /stages/stage-details/:id | validateIdParam | getStageById |
| cropStage | GET | /stages/:listingId | validateIdParam | getStagesByListing |
| cropStage | DELETE | /stages/:id | validateIdParam, auth | deleteStage |
| update | POST | /updates/create | upload.single("image") | createUpdate |
| update | GET | /updates/:stageId | (none) | getUpdatesByStage |
| contract | POST | /contracts/ | auth, role("buyer"), validateContract | createContract |
| contract | GET | /contracts/farmer | auth, role("farmer") | getFarmerContracts |
| contract | GET | /contracts/buyer | auth, role("buyer") | getBuyerContracts |
| contract | PUT | /contracts/:id/accept | validateIdParam, auth, role("farmer") | acceptContract |
| contract | PUT | /contracts/:id/reject | validateIdParam, auth, role("farmer") | rejectContract |
| contract | PUT | /contracts/:id/settle | validateIdParam, auth, role("buyer") | settleContract |
| contract | PUT | /contracts/:id/dispute | validateIdParam, auth, role("buyer","farmer") | raiseDispute |
| contract | GET | /contracts/disputes | auth, role("admin") | getDisputes |
| contract | PUT | /contracts/:id/dispute/resolve | validateIdParam, auth, role("admin") | resolveDispute |
| notification | GET | /notifications/ | auth | getNotifications |
| notification | PUT | /notifications/:id/read | auth | markAsRead |
| notification | PUT | /notifications/read-all | auth | markAllRead |
| admin | GET | /admin/stats | auth, role("admin") (router.use) | getDashboardStats |
| admin | GET | /admin/users | ″ | getAllUsers |
| admin | PUT | /admin/users/:id/toggle | ″ | toggleUserStatus |
| admin | GET | /admin/listings | ″ | getAllListingsAdmin |
| admin | GET | /admin/contracts | ″ | getAllContractsAdmin |
| admin | POST | /admin/notify | ″ | broadcastNotification |
| admin | PUT | /admin/listings/:id/verify | ″ | verifyFarm |
| marketPrice | GET | /market-prices/ | (none) | getAllMarketPrices |
| marketPrice | GET | /market-prices/crop/:crop_name | (none) | getCropPrice |
| marketPrice | GET | /market-prices/history/:crop_name | (none) | getCropPriceHistory |
| marketPrice | POST | /market-prices/update | auth, role("admin") | adminUpdatePrice |
| marketPrice | POST | /market-prices/scrape | auth, role("admin") | adminTriggerScrape |
| marketPrice | GET | /market-prices/scrape-log | auth, role("admin") | getScrapeLog |
| watchlist | POST | /watchlist/ | auth | addToWatchlist |
| watchlist | DELETE | /watchlist/:listing_id | auth | removeFromWatchlist |
| watchlist | GET | /watchlist/ | auth | getWatchlist |
| watchlist | GET | /watchlist/check/:listing_id | auth | checkWatchlist |
| review | POST | /reviews/ | auth | createReview |
| review | GET | /reviews/user/:user_id | (none) | getUserReviews |
| escrow | GET | /escrow/my | auth | getMyEscrows |
| escrow | GET | /escrow/contract/:contract_id | auth | getEscrowByContract |
| escrow | PUT | /escrow/contract/:contract_id/release-advance | auth, role("buyer") | releaseAdvance |
| escrow | PUT | /escrow/contract/:contract_id/milestone/:milestone_id/release | auth, role("buyer") | releaseMilestone |
| escrow | PUT | /escrow/contract/:contract_id/settle | auth, role("buyer") | settleEscrow |
| analytics | GET | /analytics/farmer | auth, role("farmer") | getFarmerAnalytics |
| analytics | GET | /analytics/buyer | auth, role("buyer") | getBuyerAnalytics |
| analytics | GET | /analytics/platform | auth, role("admin") | getPlatformAnalytics |
| profile | GET | /profile/:user_id | (none) | getProfile |
| profile | PUT | /profile/me/update | auth, upload.single("profile_image") | updateProfile |
| profile | PUT | /profile/me/password | auth | changePassword |
| rag | POST | /chatbot/chat | auth, chatLimiter | ragController.chat |
| rag | GET | /chatbot/history | auth | getHistory |
| rag | DELETE | /chatbot/history | auth | clearHistory |
| modelMonitor | GET | /monitor/stats | auth, role("admin") | getMonitoringStats |
| modelMonitor | POST | /monitor/log | auth | logPrediction |
| modelMonitor | PUT | /monitor/actual | auth | recordActual |
| agent | POST | /agent/negotiate/:contract_id | auth, role("farmer") | runNegotiator |
| agent | GET | /agent/health/:listing_id/:stage_name | auth | getCropHealthAdvice |
| agent | GET | /agent/health/:listing_id | auth | getSavedTips |
| pdf | GET | /pdf/contract/:contract_id | auth | generateContractPDF |

**Cross-cutting routing notes (good interview fodder):**
- **Layered limiters:** every `/api/*` hits `apiLimiter`; auth routes stack `authLimiter`; chat stacks `chatLimiter`.
- **Ordering conventions:** `validateIdParam` is placed *before* `auth`/`role` so bad IDs fail cheaply; `auth` always precedes `role`. Static segments are declared before param routes (`listings/all` before `listings/:id`) to avoid param-capture collisions.
- **`adminRoutes` uses `router.use(auth, role("admin"))` once** so all admin endpoints inherit the guard.
- **Honest caveats:** `POST /upload/` and `/updates/*` accept file uploads with **no auth** (access-control gap); there are two different `getProfile` functions (auth self vs public lookup).

# BATCH 2 — Auth & User/Social Subsystem

**Root:** `backend/`. Everything a user *is* and *does socially*: register/verify/login/2FA/reset, transactional email, public+private profiles, reviews, notifications, and watchlist. All money/crop features hang off the identity this batch establishes.

**Cross-cutting facts (true for the whole batch):**
- **JWT** is `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })` — HS256, 7-day. Only `id` + `role` travel in the token; every controller re-reads the DB for anything else.
- **Passwords:** `bcrypt.hash(password, 10)` (cost factor 10). Compare via `bcrypt.compare`.
- **OTP:** 6-digit, generated with `Math.floor(100000 + Math.random()*900000)` — **`crypto` is imported but unused**, so OTPs are *not* cryptographically random (interview caveat). Stored in `users.otp_code` (plaintext) with `users.otp_expires` = now + 10 min; compared with a plain `===` (non-constant-time).
- **Auth routes stack `authLimiter`** (10 requests / 15 min / IP) on top of the global `apiLimiter`.

## 2.1 `authController.js` — the identity state machine

**Purpose:** Registration with email-OTP verification, password-first login with optional OTP 2FA, resend, and forgot/reset. Nine exported handlers.

- **`signup`** — validates fields; rejects duplicate email; `bcrypt` hash; INSERTs user with `is_verified=false` + OTP; `sendOTPEmail(type:"signup")`. Returns `201` "check your email". *Caveat:* the resend branch here calls `sendOTPEmail` **unguarded** by try/catch (one place a mail failure can 500).
- **`verifySignupOTP`** — matches `otp_code` + non-expiry; sets `is_verified=true`, clears OTP; returns JWT + `safeUser`. *Caveat:* the returned `safeUser` still includes `otp_expires` (minor leak).
- **`login`** — **password-only by default**: `bcrypt.compare`; if `two_factor_enabled` → send OTP and return `{ requiresOTP:true }` (step 1 of 2). Else return JWT. *Caveat:* distinct messages for "user not found" vs "wrong password" → **user-enumeration** leak (same pattern in `signup` and `resetPassword`).
- **`verifyLoginOTP`** — step 2 of 2FA: validates OTP → JWT.
- **`resendOTP`** — regenerates OTP, re-sends.
- **`forgotPassword`** — **anti-enumeration done right here**: always returns the same "if the account exists…" message; only sends mail if the user is real (`type:"reset"`).
- **`resetPassword`** — validates OTP, `bcrypt` re-hash, clears OTP. (Enumeration leak on the "user not found" path.)
- **`toggleTwoFactor`** *(auth-guarded)* — flips `users.two_factor_enabled`.
- **`getProfile`** *(auth-guarded)* — returns the caller's own row minus secrets.

**Interview-defensible summary:** clean password-first + optional-2FA design; the honest weak spots are (a) `Math.random` OTPs, (b) plaintext + non-constant-time OTP compare, (c) inconsistent enumeration protection (forgot-password is safe, login/signup/reset are not).

## 2.2 `emailService.js` — transactional mail

Nodemailer over **Gmail SMTP** (`smtp.gmail.com:465`, `secure:true`). `getTransporter()` is **lazy** and throws if `EMAIL_USER`/`EMAIL_PASS` are missing (so a mis-configured deploy fails loudly at first send, not at boot). `sendOTPEmail({ name, email, otp, type })` branches branded HTML for `signup` / `login` / `reset`; **throws on failure** (callers decide whether to surface or swallow).

## 2.3 `profileController.js` — public + private profile

- **`getProfile(:user_id)`** — **public** (no auth on the route). Returns name, role, ratings, location… **and email** (PII-in-public caveat).
- **`updateProfile`** *(auth + `upload.single("profile_image")`)* — optional avatar → Supabase `listings` bucket → `getPublicUrl`; builds a dynamic `UPDATE` of only the provided columns.
- **`changePassword`** *(auth)* — `bcrypt.compare` old, hash new. *Caveat:* no new-password length/strength validation.

## 2.4 `reviewController.js` — trust ratings

- **`createReview`** *(auth)* — only for a **completed** contract the caller was party to; INSERTs the review, then **recomputes** `users.avg_rating` + `users.total_reviews` for the reviewee. A `23505` unique-violation (one review per contract+reviewer) maps to **`409`**.
- **`getUserReviews(:user_id)`** — **public**; returns reviews + a 1–5★ distribution histogram.

## 2.5 `notificationController.js` — the in-app bell

- **`getNotifications`** *(auth)* — newest 50 (`LIMIT 50`); unread count computed in JS from the returned rows.
- **`markAsRead(:id)`** / **`markAllRead`** *(auth)* — owner-scoped `UPDATE … WHERE user_id = req.user.id` so you can't mark someone else's.

## 2.6 `watchlistController.js` — buyer bookmarks

`addToWatchlist` uses `INSERT … ON CONFLICT DO NOTHING` (idempotent — always `201`, double-add is a no-op); plus `removeFromWatchlist`, `getWatchlist` (joins listing details), `checkWatchlist(:listing_id)` (boolean for the ♥ toggle). Unique on `(buyer_id, listing_id)`.

---

# BATCH 3 — Listings & GPS Verification Pipeline

**Root:** `backend/`. The heart of the "is this a real farm?" story: create a listing (with an AI yield estimate), log GPS-verified crop stages, and the utility belt (EXIF → OCR → Haversine) that decides `gps_verified`.

## 3.1 `listingController.js` — crop listings + AI yield call

**`createListing`** *(auth, `upload.fields([image, farm_registration_image])`)* — the busiest write in the app:
1. Upload crop image + farm-registration image to Supabase `listings` bucket → public URLs.
2. **Farm GPS via OCR only** on the registration image (`ocrHelper` → `gpsParser`).
3. **AI call:** `POST {AI_SERVICE_URL || http://127.0.0.1:8000}/predict/dynamic` as multipart (land size in acres + image), **15 s timeout**; on any failure fall back to `predicted_yield = 0` so a listing still saves.
4. `INSERT INTO listings` (~30 columns: crop, quantities, location, soil/season/irrigation, both image URLs, farm lat/long, AI `predicted_yield` + `confidence_lower/upper`).
5. Notify… (self/system) and return `201`.

Other handlers: `getAllListings` (filterable feed), `getListingById` (joins farmer + `prediction_history`), `getMyListings`, `deleteListing`, `updateListing`. *Caveat:* `updateListing`'s catch block is mislabeled `"CREATE LISTING ERROR"` and leaks `error.message` to the client.

## 3.2 `cropStageController.js` — the GPS-verified stage timeline

**`createStage`** *(auth, `upload.single("image")`)* — the three-tier location proof:
1. Upload stage photo to Supabase `stages` bucket.
2. **Tier 1 — EXIF:** `exifHelper` reads embedded GPS from the photo.
3. **Tier 2 — OCR:** if no EXIF, `ocrHelper` + `gpsParser` read a GPS-stamp overlay (GPS-camera apps).
4. **Tier 3 — client coords:** if still nothing, use the browser-supplied lat/long.
5. Look up the **farm reference** coordinates from the parent `listings` row.
6. `distanceHelper` (Haversine, `R = 6371000 m`) → **`gps_verified = distance ≤ 500 m`**.
7. `stageOrderMap { Sowing:1, "Vegetative Growth":2, Flowering:3, Fruiting/…:4, "Pre Harvest":5 }`; duplicate-stage guard.
8. `INSERT INTO crop_stages` (~14 cols) + append to `prediction_history`; notify buyers ("GPS Verified ✅" / "GPS pending").

Plus `getStagesByListing`, `getStageById`, `deleteStage` (*caveat:* manual cascade, **no ownership check**).

## 3.3 `updateController.js` — lightweight progress updates

`createUpdate` — like a stage but **OCR-only** (no EXIF/client tiers), stored with an `update-` reference prefix; farm ref fetched via JOIN. Leaks `error.message` on failure. `getUpdatesByStage` lists them.

## 3.4 The utility belt (`utils/`)

- **`gpsParser.js`** — regex-extracts `Lat/Long` from OCR text; reconstructs broken digit-runs assuming a **2-digit degree** (India-specific; no longitude fallback). Village heuristic keys off `"India"` + comma.
- **`exifHelper.js`** — `exifr.parse` → `{ latitude, longitude, timestamp: DateTimeOriginal }`; `null` on failure.
- **`ocrHelper.js`** — `Tesseract.recognize(buffer, "eng")`; `null` on failure.
- **`distanceHelper.js`** — Haversine great-circle distance, `R = 6371000` metres, `atan2` form.
- **`locationService.js`** — CKAN (`ckandev.indiadataportal.com`) `datastore_search` POSTs for states/districts/talukas cascades. *Caveat:* no timeout/error handling.

**Pipeline in one line (interview gold):** *photo → try EXIF GPS, else OCR the on-image GPS stamp, else trust the browser → compare to the farm's registered coordinates with Haversine → within 500 m ⇒ `gps_verified=true`, which is exactly what the escrow milestone gate later checks.*

---

# BATCH 4 — Contracts, Escrow Money-Engine & PDF

**Root:** `backend/`. The financial core. Mount prefixes: `/api/contracts` → contracts, `/api/escrow` → escrow, `/api/pdf` → PDF. Everything below runs behind `authMiddleware`; role gates and `validateContract`/`validateIdParam` can 400 before the controller.

## 4.1 `contractController.js` — the contract lifecycle

Couples to escrow via `import { createEscrowOnAccept, settleEscrow }`.

- **`createContract`** *(POST, buyer, `validateContract`)* — buyer offers on a listing. **Buffer clamp:** `buffer_pct` parsed, default `10`, then `Math.min(25, Math.max(5, buffer))` → **[5, 25]%**. Looks up listing farmer + buyer name; `INSERT INTO contracts (… status='pending')`; notifies farmer (`contract_request`). `201`.
- **`acceptContract`** *(PUT `/:id/accept`, farmer)* — **the ACID centerpiece.** On a manually-managed `pool.connect()` client: `BEGIN` → `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` → `pg_advisory_xact_lock(id)` → `SELECT … FOR UPDATE`. Rejects if not `pending` (`400` "already {status} — duplicate request blocked"). Sets `status='accepted'`, then **calls `createEscrowOnAccept(client, …)` on the same client** so escrow creation shares the transaction — if it throws, the accept rolls back too. Notifies buyer with the localized `total_locked`. Returns `200 { contract, escrow{…} }`; a `409` "Escrow already exists" from the escrow fn propagates with its status.
- **`rejectContract`** *(PUT `/:id/reject`, farmer)* — non-transactional; `pending`→`rejected`; notify buyer.
- **`getFarmerContracts` / `getBuyerContracts`** — role-scoped list joins (buyer/farmer/listing details).
- **`settleContract`** *(PUT `/:id/settle`, buyer)* — thin delegate: sets `req.params.contract_id` and `return settleEscrow(req,res)`. The comment explains why — an earlier duplicate non-transactional settle skipped ACID/idempotency/ledger/refund math; now both the contracts page and the escrow page funnel into the single correct `settleEscrow`.
- **Dispute trio:** `raiseDispute` *(buyer OR farmer)* — only `accepted`/`completed`; second open dispute → **`409`**; sets `dispute_status='open'` + reason/raiser, notifies the other party **and all admins**. `getDisputes` *(admin)* lists by status. `resolveDispute` *(admin)* — `outcome ∈ {resolved,rejected}`, writes resolution note, notifies both parties.

## 4.2 `escrowController.js` — the ACID financial engine

**The concurrency stack** — every mutating op layers four mechanisms inside one **SERIALIZABLE** transaction (`withTransaction` helper: `BEGIN` → set isolation → run → `COMMIT`/`ROLLBACK` → always `release()`):
1. **`pg_advisory_xact_lock(contract_id)`** — per-contract app mutex, held to transaction end, works across Node processes.
2. **`SELECT … FOR UPDATE`** — row locks so concurrent requests queue (milestone uses `FOR UPDATE OF m, e`).
3. **Idempotency keys** — `X-Idempotency-Key` header (with deterministic fallbacks like `advance-{contract}-{buyer}`); `idempotency_keys` table caches the JSON result and **replays** it on retry.
4. **Append-only `escrow_ledger`** — every movement is one `INSERT` with a walking `running_balance` (never an UPDATE).

**`MILESTONE_SCHEDULE`** (percentages of *contract value*):

| order | kind | stage_name | label | pct |
|---|---|---|---|---|
| 1 | advance | — | Cultivation Advance | **15** |
| 2 | progress | Sowing | Sowing Verified | **15** |
| 3 | progress | Vegetative Growth | Vegetative Growth | **20** |
| 4 | progress | Flowering | Flowering Verified | **20** |
| 5 | progress | Pre Harvest | Pre-Harvest Verified | **10** |

Sum = **80%** released progressively; the remaining ~20% settles at harvest. `mockPayment()` mints refs like `MOCK-LX9F2A-K3QZ` (`MOCK-<base36 epoch>-<4 rand>`).

**`createEscrowOnAccept(client, {contract_id, farmer_id})`** — runs on the caller's transaction. Duplicate guard → **`409`**. Exact formulas:
```js
buffer_frac    = clamp((buffer_pct||10)/100, 0.05, 0.25);   // 5–25%
locked_pct     = 100 * (1 + buffer_frac);                    // 110 for default
contract_value = quantity * offered_price * 10;              // ×10 = tonnes→quintals
total_locked   = contract_value * (1 + buffer_frac);         // contract + buffer
advance_amount = contract_value * 0.15;
buffer_amount  = contract_value * buffer_frac;
pending_amount = contract_value - advance_amount;            // 85%
```
Writes the `escrow` row (note: `escrow.buffer_pct` stores **`locked_pct`** e.g. 110, not the 10 margin), ledger entry `buffer_locked` (rb=`total_locked`), and seeds all 5 milestones `ON CONFLICT (contract_id, milestone_order) DO NOTHING` with `amount = contract_value * pct/100`.

**`releaseAdvance`** *(PUT, buyer)* — guards: escrow missing→`404`; already released→`409`; contract not `accepted`→`400`; **open dispute→`423`**. Pays `advance_amount`, sets `advance_released=true`, bumps `released_to_farmer`, marks the advance milestone `released`, ledger `advance_released` (rb=`total_locked − advance`), notifies farmer.

**`releaseMilestone`** *(PUT, buyer)* — the stage-gated release. Guards include **open dispute→`423`**, already-released→`409`, "use Release Advance for the advance"→`400`, and two ordering/stage gates:
- **Ordering gate:** the immediately-preceding milestone must be `released` first (else `400 Release "{prev}" first`).
- **Stage gate:** for a milestone with a `stage_name`, there must be a matching `crop_stages` row for the listing (else `400 Farmer hasn't uploaded the "{stage}" stage yet`). The `gps_verified` flag is recorded into the ledger note; **presence of the stage row is what gates the payout.**
Pays `amount`, bumps `released_to_farmer`, sets escrow `in_progress`, keeps `contracts.advance_paid` = cumulative released, ledger `milestone_released` (rb=`total_locked − cumulative`).

**`settleEscrow`** *(PUT, buyer)* — market-adjusted final settlement. Requires `market_price_per_quintal`. Guards: not `accepted`→`400`; already `completed`→`409`; **open dispute→`423`**. Exact math:
```js
quantity_quintals = quantity * 10;
contract_value    = offered_price * quantity_quintals;
desired_price     = max(offered_price, market_price);                    // farmer gets the higher
gross_payment     = min(desired_price * quantity_quintals, total_locked); // capped at locked funds
already_paid      = released_to_farmer;               // cumulative — path-independent
balance_due       = max(0, gross_payment - already_paid);
refund_to_buyer   = max(0, total_locked - gross_payment);
market_adjustment = max(0, gross_payment - contract_value);
```
The **"payout never exceeds `total_locked`" invariant** is structural (the `min(...)`), so the buffer is the market-upside ceiling and any unused buffer refunds to the buyer. Writes: contract `completed`; escrow `completed` with incremented `released_to_farmer`, `refunded_to_buyer`, `market_price_used`, `settled_at`; mops up any un-released milestones; ledger entries `balance_released` → optional `market_adjustment` (actor_role `system`) → optional `refund` (rb walks to **0**). Returns `settlement_type: "market_rate" | "contracted_rate"` + `buffer_capped`.

**Read endpoints:** `getEscrowByContract` (ownership-scoped; returns escrow + `json_agg` milestones with a computed **`stage_ready`** flag + full ledger ASC) and `getMyEscrows` (role-scoped list).

**Dispute freeze (interview one-liner):** exactly three ops throw **`423 Locked`** when `contracts.dispute_status='open'` — `releaseAdvance`, `releaseMilestone`, `settleEscrow`. Reads and accept are not frozen.

## 4.3 `pdfController.js` — the printable contract

`generateContractPDF` *(GET `/:contract_id`, any auth party — ownership-checked)* returns a **fully-styled standalone HTML document** (not a binary PDF — the browser prints/saves it; `?print=true` auto-fires `window.print()`). One big JOIN pulls contract+farmer+buyer+listing+escrow plus a correlated subquery for the **live market price** from `market_prices`. Display math mirrors escrow but **hard-codes the 10% buffer** and a `0.65 + 0.20` stage/final split (cosmetic divergence from the configurable engine). Renders parties, crop/farm table, financial summary (110% locked), the 5-milestone schedule, a conditional **Settlement Record** block when completed, 7 Terms clauses, signatures. `Content-Type: text/html`, `res.send(html)`. Read-only.

## 4.4 `tests/escrow_math.test.js` — 53-assertion money proof

Dependency-free pure-arithmetic replica of the full flow (accept → advance → milestones → settle), run with `node tests/escrow_math.test.js` (exit 0 iff all pass). `runContract({quantity, offeredPrice, marketPrice, releaseUpTo})` mirrors `settleEscrow` line-for-line. **Six invariants** are asserted across **7 market scenarios** (below/equal/within-buffer/at-ceiling/over-ceiling × different release depths) = 42, plus 11 targeted boundary checks = **53 total**:
1. **Money conservation:** `released_to_farmer + refund_to_buyer ≈ total_locked`.
2. **Soundness:** `gross_payment ≤ total_locked`.
3. **Farmer paid == gross_payment.**
4. **Higher-of, capped:** `gross ≈ min(desired, total_locked)`.
5. **Non-negativity** of balance/refund/adjustment.
6. **Farmer ≥ contract value** — never worse off than contracted.
Boundary highlights: full-buffer refund when market < offered; `buffer_capped` + farmer==`total_locked` + refund==0 when market is way over; and a **path-independence** pair proving settlement is the same whether 1 or 5 milestones were pre-released (validates the `already_paid = released_to_farmer` fix). **Honest gap:** hard-codes `BUFFER_FACTOR=1.10` (doesn't sweep the 5–25% clamp) and doesn't exercise dispute-`423`/idempotency/locking (DB/HTTP concerns).

---

# BATCH 5 — Market Data, RAG Chatbot, Negotiation Agent, Analytics, Admin, Monitoring

**Root:** `backend/`. The "intelligence + operations" layer: live mandi prices with layered fallbacks, the cron that refreshes them, the Groq-backed chatbot and agentic negotiator, dashboards, admin tools, and the model-drift monitor.

## 5.1 `marketScraper.js` — live mandi prices with graceful degradation

- **Source:** data.gov.in Agmarknet resource `9ef84268-…`; ships a **public sample `DATA_GOV_API_KEY`** fallback (rate-limited — user should set their own).
- **Maps:** `CROP_TO_COMMODITY` (15 crops; e.g. Chilli→"Green Chilli") and `BASE_PRICES` (15 sane defaults).
- **`fetchLivePrice`** — widening search: **district → state → national**; `summarizeRecords` uses modal (most-common) price as the representative value.
- **`scrapeAndUpdatePrices`** — loops 15 crops with a 400 ms sleep (politeness), logs to `market_scrape_log`.
- **`getLatestPrice`** — the resolver chain: **25 h cache → live fetch → last verified → simulated**, tagging each with `source ∈ {data_gov, data_gov_cached, simulated, admin, default}`. Uniqueness on `(crop_name, state, district, market_name, recorded_date)`.

## 5.2 `cronJobs.js` — scheduled refresh

`node-cron`: **`"0 6 * * *"`** daily scrape + **`"0 0 * * 0"`** Sunday cleanup, both `timezone: "Asia/Kolkata"`. An `isRunning` flag prevents overlapping re-entrancy; `triggerMarketUpdate` exposes a manual trigger (used by the `server.js` self-heal and the admin endpoint).

## 5.3 `marketPriceController.js` — price API

`getAllMarketPrices` (`DISTINCT ON` latest per crop, `BASE_PRICES` fallback tagged `from_default`), `getCropPrice`, `getCropPriceHistory` (trend classifier rising/falling/stable), `adminUpdatePrice`, `adminTriggerScrape` (fire-and-forget), `getScrapeLog`, and a `sourceNote` helper that turns a `source` tag into human copy for the badges.

## 5.4 `ragController.js` — the knowledge chatbot

`GROQ_MODEL` defaults to **`openai/gpt-oss-20b`**. A 10-doc `KNOWLEDGE_BASE`; `retrieveContext` does keyword-overlap scoring and takes top-3; `seedKnowledgeBase` populates `rag_documents`. **`chat`** returns **`503`** if `GROQ_API_KEY` is missing, keeps a **last-8-message** window, and calls Groq (`https://api.groq.com/openai/v1/chat/completions`, 30 s). Plus `getHistory` / `clearHistory` on `chatbot_messages`.

## 5.5 `agentController.js` — agentic negotiator + crop-health advisor

- **`runNegotiator`** *(farmer)* — a real **tool-use loop** (`MAX_ITER=5`) with `NEGOTIATION_TOOLS` (3 functions the LLM can call); writes `negotiation_log` and notifies. This is the standout "agentic AI" feature.
- **`getCropHealthAdvice`** — fetches climate from `GET {AI_SERVICE_URL}/climate/:state/:district` (5 s), asks Groq for 3 JSON tips, falls back to `getDefaultTips`, caches in `crop_health_tips`. `getSavedTips` reads them back.

## 5.6 Prediction proxies & analytics & admin & monitor

- **`aiService.js`** — `getYieldPrediction` → `POST {AI_SERVICE_URL}/predict` (**no timeout**, rethrows). **`predictionController.js`** — thin `predictYield` proxy.
- **`analyticsController.js`** — `getFarmerAnalytics` / `getBuyerAnalytics` / `getPlatformAnalytics` — `Promise.all` aggregate queries with `NULLIF` guards against divide-by-zero.
- **`adminController.js`** — `getDashboardStats`, `getAllUsers`, `toggleUserStatus`, `getAllListingsAdmin`, `getAllContractsAdmin`, `broadcastNotification`, `verifyFarm`.
- **`modelMonitorController.js`** — `logPrediction` (`model_version` hardcoded `"2.0"`), `recordActual` (computes `error_pct`), `getMonitoringStats` (MAPE/MAE/stddev + a **drift detector**: recent error > all-time×1.3 → alert, ×1.5 → high, plus error buckets).

---

# BATCH 6 — Python AI Microservice (`ai-service/`)

FastAPI + XGBoost yield predictor. Started with `uvicorn src.app:app` (app.py inserts `src/` into `sys.path` itself).

## 6.1 `app.py` — FastAPI surface (v2.0.0)

CORS `["*"]` **with** `allow_credentials=True` (a spec contradiction — caveat). Startup `_load_model()` is **fail-hard** (`raise RuntimeError` if artifacts missing → the service won't boot half-broken). Six endpoints: `GET /`, `/model/info`, `/predict/crop-list`, `/climate/{state}/{district}`, `POST /predict/json` (raw dict), and **`POST /predict/dynamic`** (multipart `land`=acres, `image` accepted-but-unused; returns `status:"Success"` + a renamed `climate` block; notably returns **errors as HTTP 200 bodies**, which is why the backend treats a 0 yield as the failure signal).

## 6.2 `inference.py` — the actual model math

`ACRE_TO_HECTARE = 0.4046856422`. `_load_model` reads `xgboost_yield_model.pkl` + `model_columns.pkl`. `_build_crop_yield_bands` computes per-crop 5th/95th percentiles from the CSV. `_build_feature_row` sets lowercase one-hot categoricals and the engineered `rainfall_temp_interaction = annual_rainfall/(t2m_max+1)` (fertilizer/pesticide columns exist but are **never populated** — caveat). `predict` runs the model on `log1p` target space and inverts with **`np.expm1`**, floors at 0, computes `total_tonnes = kg/1000`, and attaches a ±15% fallback band; `market_estimate` is always null.

## 6.3 Support & training files

- **`climate_service_v2.py`** — `DEFAULT_CLIMATE` + CSV averages, 3-tier fallback (exact district → state → default); **never raises**.
- **`model_metadata.json`** — **R²=0.8742, MAE=25061.59 kg/ha, MAPE=29.79%**, 643 features, 210,085 train / 37,074 test, full Optuna best-params, trained 2026-07-28.
- **`feature_importance.json`** — `crop_coconut` 0.373 dominates; crop identity is the dominant signal (honest: district dummies + crop identity carry the model).
- **`train_optimized.py`** — Optuna (maximize R²), `log1p` target, `test_size=0.15`, seed 42.
- **`improved_preprocess.py`** — `get_dummies` → **643 columns**, drops `crop_year`, saves the authoritative **`model_columns.pkl`**.
- **STALE/unused (don't cite as live):** `feature_template.py` (41 Title_Case cols — inconsistent with the live 643 lowercase) and `evaluate.py` (imports artifacts that don't exist).

---

# BATCH 7 — React + Vite Frontend (`frontend/`)

## 7.1 Bootstrap & build

`main.jsx` (React root, imports `leaflet.css`, `StrictMode`), `vite.config.js` (**VitePWA** `autoUpdate`, `navigateFallback:/index.html`, `@`→`src` alias, dev port 3000), `package.json` (React 18.3, axios, **dexie**, leaflet + react-leaflet, recharts, react-router-dom v6).

## 7.2 `App.jsx` + `lib/api.js` — routing & the auth spine

`App.jsx` declares **26 routes** with **no `ProtectedRoute` wrapper** — instead each page does an imperative auth check in `useEffect`, and the real hard gate is the **axios 401 response interceptor**. `lib/api.js`: axios instance `baseURL = ${VITE_API_URL||localhost:5000}/api`; request interceptor attaches `Bearer` token; response interceptor on **401 → clear localStorage + redirect `/login`**; helpers `getUser`/`getToken`/`logout`.

## 7.3 The offline/PWA stack (the "works in the field" story)

- **`db.js`** — Dexie DB `"AgriChainOfflineDB"`, 4 stores.
- **`offlineQueue.js`** — `queueMutation`, `syncQueue` (3-retry replay), cache helpers.
- **`offlineApi.js`** — `fetchListings`/`fetchStages` fall back to cache; `addStageUpdate`/`updateListingNotes` **queue when offline** (text-only; photos are online-only).
- **`useOnlineStatus.js`** — auto-sync 1.5 s after the `online` event fires, polls every 10 s.

## 7.4 Components & key pages

Components: Navbar (role-aware links, 30 s notification polling), InstallPrompt, SyncStatusBar, WatchlistButton, ReviewModal, CropHealthAdvisor, StageMap (Leaflet farm-vs-photo markers). Key pages: **Login** (2-step OTP state machine), **CreateListing** (browser geolocation, FormData multipart), **ListingDetail** (5-stage `STAGE_ORDER`, contract form `qty×price×10`, buffer selector), **Escrow** (sends `X-Idempotency-Key` on advance/milestone/settle), **Chatbot**, **MarketPrices** (Recharts, 5-min refresh, source badges), **FarmerDashboard**. `lib/yield.js`: `expectedYield` treats the farmer's estimate as authoritative with AI as fallback; `formatYield`.

---

# BATCH 8 — Database Schema (`backend/*.sql`)

**20 tables**, created by three hand-run idempotent migrations in order: **`schema.sql`** (19 tables + admin seed `ON CONFLICT` + tail `ALTER`s) → **`market_schema.sql`** (`market_prices` ALTERs + `market_scrape_log`) → **`escrow_schema.sql`** (retrofits `escrow_milestones`, `DO $$` guards for CHECK constraints).

**Core tables & the details that matter:**
- **`users`** — identity + OTP/2FA/verification tail columns + `avg_rating`/`total_reviews`.
- **`listings`** (32 cols) — crop, quantities, location, soil/season/irrigation, image URLs, farm lat/long, AI `predicted_yield` + `confidence_lower/upper`.
- **`crop_stages`** / **`crop_updates`** — the GPS-verified timeline (`gps_verified` bool).
- **`prediction_history`** — every AI call logged.
- **`contracts`** — lifecycle + dispute columns; **`buffer_pct` default 10** (the *margin*).
- **`escrow`** — **`buffer_pct` default 110** (the *locked %* — note the deliberate difference from `contracts.buffer_pct`).
- **`escrow_ledger`** — append-only, `running_balance`, `payment_ref`.
- **`escrow_milestones`** — `kind` CHECK (advance/progress), `release_pct` CHECK, **`UNIQUE(contract_id, milestone_order)`** (the idempotent-seed key).
- **`idempotency_keys`** — `key` UNIQUE, `result` JSONB.
- **`notifications`** — polymorphic `reference_type`/`reference_id` (not a FK).
- **`market_prices`** — **`UNIQUE unique_crop_scope_date`** (crop+state+district+market+date).
- **`watchlist`** (UNIQUE buyer+listing, CASCADE), **`reviews`** (rating CHECK 1–5, UNIQUE contract+reviewer), **`chatbot_messages`** (role CHECK, CASCADE), **`rag_documents`**, **`crop_health_tips`**, **`negotiation_log`**, **`prediction_log`**, **`market_scrape_log`**.

**Migration-order rationale:** `escrow_schema.sql` runs last because it retrofits constraints onto tables the first file creates. **⚠️ Honest caveat:** the `market_prices` seed in `schema.sql` (lines ~319–335) has **no conflict target**, so re-running that file duplicates seed rows — it's a "run once on a fresh DB" file.

---

# How it all connects (one-paragraph synthesis for the interview)

A **farmer** registers (Batch 2 auth), lists a crop and gets an **AI yield estimate** (Batch 3 → Batch 6 `/predict/dynamic`). A **buyer** finds it, offers a contract with a configurable 5–25% buffer (Batch 4 `createContract`). The farmer **accepts**, which in one SERIALIZABLE transaction creates a **110%-funded escrow** and seeds five milestones (Batch 4 `acceptContract`→`createEscrowOnAccept`). As the crop grows, the farmer uploads **GPS-verified stage photos** (Batch 3 EXIF→OCR→Haversine≤500 m ⇒ `gps_verified`), and the buyer releases each milestone — but only if the preceding one is paid *and* the matching stage row exists (Batch 4 `releaseMilestone`). At harvest, **`settleEscrow`** pays the farmer the *higher* of the contracted or live **mandi price** (Batch 5 market data), **capped at the locked funds**, refunding the unused buffer — every rupee written to an **append-only ledger**, every action **idempotent** and **dispute-freezable (423)**. Dashboards, a Groq **RAG chatbot**, an **agentic negotiator**, and a **model-drift monitor** (Batch 5) sit on top; the whole React front end (Batch 7) even queues writes **offline** and syncs when back online. The 53-assertion money-math test (Batch 4) is the proof the financial core is sound.

*Read the two concept docs (`AGRICHAIN_PROJECT_KNOWLEDGE.md`, `PROJECT_EXPLAINED.md`) for the story and tech-stack rationale; use this file when someone points at a specific file and says "explain this."*
