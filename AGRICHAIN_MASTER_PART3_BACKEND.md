# AgriChain — Master Guide, Part 3: The Backend, File by File

> **What's in it:** every backend file and what it does. The four **core controllers** (escrow, auth, crop-stage, market) are covered in full depth from the actual code. The **secondary controllers** are mapped at the functional level (endpoints, tables, responsibility) — accurate, but not line-by-line. Then the **full 19-table database schema**.
>
> Base path: `D:\claude\agrichain\backend`. Runtime: Node.js + Express 4. Entry: `server.js`.
>
> Legend: **✅ ON RÉSUMÉ** · **ℹ️ OFF RÉSUMÉ** · **🎒 BACK POCKET**

---

## A. The backend folder map

```
backend/
├── server.js                 # entry point: middleware, routes, boot
├── config/
│   ├── db.js                 # PostgreSQL connection pool (pg)
│   └── supabase.js           # Supabase Storage client
├── middleware/
│   ├── authMiddleware.js     # verify JWT → req.user = {id, role}
│   ├── roleMiddleware.js     # RBAC: allow only certain roles
│   └── validationMiddleware.js # in-memory rate limiter + validators
├── controllers/              # the actual logic per feature
│   ├── escrowController.js   # 🎒 the money engine (core)
│   ├── authController.js     # ✅ signup/login/OTP/JWT (core)
│   ├── cropStageController.js# ✅ GPS stage verification (core)
│   ├── listingController.js  # ✅ crop listings + ML call + uploads
│   ├── contractController.js # ✅ contract offers + accept → escrow
│   ├── marketPriceController.js # ✅ price endpoints
│   ├── notificationController.js
│   ├── reviewController.js
│   ├── adminController.js     # ℹ️ manual-admin only
│   ├── ragController.js       # ℹ️ chatbot (Groq + RAG)
│   ├── agentController.js     # ℹ️ negotiation assistant
│   ├── analyticsController.js
│   ├── profileController.js
│   ├── watchlistController.js
│   ├── updateController.js    # crop updates within a stage
│   ├── locationController.js
│   ├── modelMonitorController.js # ℹ️ model monitoring
│   └── pdfController.js
├── routes/                   # one router file per feature (maps URL → controller)
├── services/
│   ├── marketScraper.js      # ✅ data.gov.in fetch + 4-tier fallback
│   ├── cronJobs.js           # node-cron: daily price refresh + cleanup
│   ├── emailService.js       # ✅ OTP/notification email + boot verify
│   ├── aiService.js          # calls the Python ML service
│   └── locationService.js
├── utils/
│   ├── distanceHelper.js     # ✅ Haversine distance (metres)
│   ├── exifHelper.js         # ✅ EXIF GPS via exifr
│   ├── ocrHelper.js          # ✅ OCR via tesseract.js
│   └── gpsParser.js          # ✅ regex GPS parser for OCR text
└── schema.sql                # the full database definition (19 tables)
```

---

## B. `server.js` — the entry point

**Boot preamble.** `require("dotenv").config()` first (loads env vars), then debug logs that print env var **names/existence/length only** (e.g. `EMAIL_PASS exists = true`, its length) — never the value.

**Middleware chain (exact order — this is a common interview question):**
1. **CORS** — `cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true })`. One allowed origin from env; no wildcard.
2. **`express.json({ limit: "10mb" })`** — parse JSON bodies (10 MB cap for base64 image payloads).
3. **`express.urlencoded({ extended: true, limit: "10mb" })`** — parse form bodies.
4. **Global rate limiter** — `app.use("/api", apiLimiter)` — 60 requests / 60 s per IP, before any handler.
5. **Route mounts** (below).
6. **`/uploads` static** — legacy local fallback; real images go to Supabase.
7. **`/` health route** — returns `"AgriChain Backend ✅"`.

> There is **no** global error-handler and **no** 404 catch-all — worth knowing as an honest "what I'd add."

**All 20 route mounts:**

| Mount | Router | Feature |
|---|---|---|
| `/api/auth` | authRoutes | ✅ signup/login/OTP |
| `/api/ai` | predictionRoutes | ℹ️ ML yield prediction |
| `/api/listings` | listingRoutes | ✅ crop listings |
| `/api/location` | locationRoutes | state/district helpers |
| `/api/upload` | uploadRoutes | generic uploads |
| `/api/stages` | cropStageRoutes | ✅ GPS stage verification |
| `/api/updates` | updateRoutes | crop updates in a stage |
| `/api/contracts` | contractRoutes | ✅ contract management |
| `/api/notifications` | notificationRoutes | in-app notifications |
| `/api/admin` | adminRoutes | ℹ️ admin (manual only) |
| `/api/market-prices` | marketPriceRoutes | ✅ mandi prices |
| `/api/watchlist` | watchlistRoutes | buyer saved listings |
| `/api/reviews` | reviewRoutes | ratings/reviews |
| `/api/escrow` | escrowRoutes | 🎒 escrow engine |
| `/api/analytics` | analyticsRoutes | dashboard charts |
| `/api/profile` | profileRoutes | user profile |
| `/api/chatbot` | ragRoutes | ℹ️ RAG chatbot |
| `/api/monitor` | modelMonitorRoutes | ℹ️ model monitoring |
| `/api/agent` | agentRoutes | ℹ️ negotiation assistant |
| `/api/pdf` | pdfRoutes | PDF generation |

> Note two deliberate name mismatches: `predictionRoutes` mounts at `/api/ai`, and `ragRoutes` (chatbot) mounts at `/api/chatbot`.

**Startup logic:** `PORT = process.env.PORT || 5000`. **Connect to Postgres first** — on success, `app.listen`; on failure, log and **`process.exit(1)`**. After listening: `startAllCrons()`, `verifyEmailTransport()`, and the **market-price boot self-heal** (fetch today's prices unless a genuine live row already exists; never fatal).

---

## C. `config/` — connections

### `config/db.js` — PostgreSQL pool
Creates a shared **`pg` connection Pool** from discrete env vars (not a connection string):
```js
new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST,
  database: process.env.DB_NAME, password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});
```
- A **pool** reuses a set of DB connections instead of opening one per request (fast, bounded).
- SSL is on only when `DB_SSL === "true"` (needed for managed Postgres like Supabase).
- Exported once and imported everywhere (`server.js`, controllers, crons).

> **Defend "connection pool":** *"I use a pg pool so connections are reused across requests instead of reconnecting every time — and every money operation checks out a client from that pool for its transaction."*

### `config/supabase.js` — storage client
`createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)`. The **service_role** key is server-side only (full admin) — never shipped to the browser. Used only for **Storage** (image buckets `listings` and `stages`).

---

## D. `middleware/` — the request gates

### `authMiddleware.js` — prove who you are ✅
- Reads `Authorization` header → takes the token after the space → `jwt.verify(token, JWT_SECRET)`.
- On success: **`req.user = { id, role }`** (+ `iat`/`exp`). On missing header → **401 "No token provided"**; on bad/expired token → **401 "Invalid token"**.

### `roleMiddleware.js` — prove you're allowed ✅ (RBAC)
- A **factory**: `roleMiddleware(...allowedRoles)` returns a middleware that checks `allowedRoles.includes(req.user.role)`.
- Mismatch → **403 "Access forbidden"**. Used as e.g. `roleMiddleware("farmer")` or `roleMiddleware("farmer","buyer")`.

> Together these two are your **entire authorization story**: auth proves identity, role enforces permission — **server-side**, so hiding a button in the UI is cosmetic; the real gate is here.

### `validationMiddleware.js` — rate limiting + input checks
- **`apiLimiter`** (the one wired globally): pure **in-memory** limiter, a `Map` keyed by IP, **60 req / 60 s**, returns **429** with a `Retry-After` header when exceeded; a timer prunes stale entries every 10 min.
- Other presets exist but aren't globally wired: `authLimiter` (10/15 min), `uploadLimiter` (10/min), `chatLimiter` (20/min).
- Also exports validators: `validateSignup`, `validateLogin`, `validateContract`, `validateReview`, `validateIdParam`.
- **Honest caveat:** in-memory means counts aren't shared across multiple instances — fine for a single Render instance, but you'd move to Redis to scale horizontally.

---

## E. `utils/` — the GPS pipeline ✅ (4 files, one function each)

These four form the **geo-verification chain** used by `cropStageController`:

### `exifHelper.js` — `extractGPS(buffer)`
Uses **`exifr`**: `await exifr.parse(buffer)` → `{ latitude, longitude, timestamp: DateTimeOriginal }`. Returns `null` on error. This is **tier 1** (`gps_source = "exif"`).

### `ocrHelper.js` — `extractText(buffer)`
Uses **`tesseract.js`**: `Tesseract.recognize(buffer, "eng")` → raw text string (the repo ships `eng.traineddata`). Returns `null` on error. Feeds **tier 2**.

### `gpsParser.js` — `parseGPSData(text)`
Regex-extracts `{ latitude, longitude, village, date, time }` from OCR text:
- **Latitude:** `Lat 13.677329` → `13.677329`; plus a fallback for OCR that drops the decimal (`Lat13677329` → `13.677329`, assuming a 2-digit degree — correct for southern India).
- **Longitude:** `Long … 77.xxxxx`. (Asymmetry to know: **no** decimal-dropped fallback for longitude.)
- Also pulls date, time, and a village guess (first line containing "India" + a comma). This is **tier 2** (`gps_source = "ocr"`).

### `distanceHelper.js` — `calculateDistance(lat1,lon1,lat2,lon2)` ✅
The **Haversine great-circle** distance. Earth radius `R = 6,371,000` **metres**, so the result is in **metres**. Used as `distance_from_farm = calculateDistance(farm, photo)`, then `gps_verified = distance_from_farm <= 500`.

> **Defend it:** *"Haversine gives the great-circle distance between two lat/long points accounting for Earth's curvature. My radius constant is in metres, so I compare directly against a 500-metre threshold."*

---

## F. `services/` — background & external work

### `cronJobs.js` — scheduled jobs (node-cron, in-process)
- **Daily price refresh** — `"0 6 * * *"` = **06:00 IST** (`timezone: "Asia/Kolkata"`), calls `scrapeAndUpdatePrices()`; an `isRunning` flag prevents overlaps.
- **Weekly cleanup** — `"0 0 * * 0"` = **Sunday midnight IST**: prunes scrape logs > 30 days and prices > 90 days.
- Exports `startAllCrons()` (called at boot) and `triggerMarketUpdate()` (used by the boot self-heal / admin).

### `marketScraper.js` — the price engine ✅ (full deep-dive in Part 6)
Fetches from **data.gov.in Agmarknet** (resource `9ef84268-…`), maps 15 crops to commodities, summarises by **modal price**, widens the search **district → state → national**, and exposes **`getLatestPrice`** with a **4-tier fallback**: recent cache (< 25 h) → live → last-verified cached → deterministic **simulated** (±5%, clearly labelled). `upsertPrice` writes results into `market_prices`.

### `emailService.js` — OTP & notifications ✅
Sends the 6-digit OTP and notification emails; **`verifyEmailTransport()`** runs at boot so a bad `EMAIL_PASS` fails loudly in the logs. (Real bug fixed here — Gmail App-Password spaces — in Part 6.)

### `aiService.js` — the ML bridge ℹ️
Wraps the HTTP call from Node → Python ML service (axios). Returns the predicted yield + confidence, and is wrapped in try/catch by the listing controller so a failure never breaks listing creation (graceful degradation).

### `locationService.js`
Helper data/logic for Indian state/district/taluka/village selection used by listings and location routes.

---

## G. Core controller #1 — `escrowController.js` 🎒 (the crown jewel, ~870 lines)

This is your strongest material. Here's the whole thing, precisely.

### G.1 The milestone schedule (a constant)
```js
MILESTONE_SCHEDULE = [
  { order:1, kind:"advance",  stage_name:null,               label:"Cultivation Advance", pct:15 },
  { order:2, kind:"progress", stage_name:"Sowing",           pct:15 },
  { order:3, kind:"progress", stage_name:"Vegetative Growth",pct:20 },
  { order:4, kind:"progress", stage_name:"Flowering",        pct:20 },
  { order:5, kind:"progress", stage_name:"Pre Harvest",      pct:10 },
]
```
So **15 + 15 + 20 + 20 + 10 = 80%** is released progressively across the five milestones; the remaining ~20% (plus/minus the buffer) is handled at **settlement**.

### G.2 `withTransaction(fn)` — the safety wrapper
```js
BEGIN → SET TRANSACTION ISOLATION LEVEL SERIALIZABLE → run fn(client)
      → COMMIT   (on success)
      → ROLLBACK (on any error)   → always client.release()
```
Every money operation runs inside this. **SERIALIZABLE** = the strictest isolation; concurrent transactions behave as if run one-at-a-time.

### G.3 `mockPayment()` — honest framing
Mints a fake payment reference like `MOCK-…`. **There is no real payment gateway** — the *accounting and concurrency are real*, only the gateway call is simulated. **Volunteer this** if payments come up; it builds credibility.

### G.4 `createEscrowOnAccept(client, { contract_id, farmer_id })`
Called **inside the same transaction** as contract-accept. Steps:
1. `pg_advisory_xact_lock(contract_id)` — no two ops on this contract at once (even across processes).
2. `SELECT … FOR UPDATE` — row-lock and re-read the contract.
3. `buffer_frac = clamp(0.05, 0.25, buffer_pct/100)` — buyer's chosen buffer, clamped **5–25%** (default 10%).
4. `contract_value = quantity × offered_price × 10` (the ×10 converts quintal pricing to the contract's unit basis).
5. `total_locked = contract_value × (1 + buffer_frac)` — e.g. **110%** at the default.
6. Insert the `escrow` row; write the **first ledger entry** `buffer_locked`.
7. Seed the 5 `escrow_milestones` rows with `ON CONFLICT (contract_id, milestone_order) DO NOTHING` (idempotent seeding).

### G.5 `releaseAdvance` / `releaseMilestone`
Both: check **idempotency key** → advisory lock → validate state → `mockPayment()` → update escrow/contract/milestone → append ledger row → notify.
- **`releaseAdvance`**: 409 if already released, 400 if contract not accepted, **423 if a dispute is open**. Ledger `advance_released`.
- **`releaseMilestone`**: enforces **order** (earlier milestones must be released first) and a **stage gate** — it checks `crop_stages.gps_verified` for that milestone's `stage_name` before releasing. Ledger `milestone_released`.

> This is why GPS verification and escrow connect: **a milestone can't be released unless its crop stage is GPS-verified.** Proof-of-progress literally gates the money.

### G.6 `settleEscrow` — market-linked final payout ✅
```js
desired_price = Math.max(offered_price, market_price)            // farmer captures upside
gross_payment = Math.min(desired_price × quantity, total_locked) // never exceed what's locked
```
- `buffer_capped` flag set if the cap bound the payout.
- Computes `balance_due`, `refund_to_buyer`, `market_adjustment`.
- Ledger entries: `balance_released`, `market_adjustment`, `refund`. Notifies farmer (payout) and buyer (refund).
- **Honest caveat:** the `market_price_per_quintal` used here is passed in on the settle request (the frontend fetches it), so in production you'd fetch it server-side inside the transaction.

### G.7 Read endpoints
`getEscrowByContract` and `getMyEscrows` (uses `json_agg` to return milestones inline, each with a `stage_ready` flag showing whether its stage is GPS-verified yet).

> **The 53-assertion test** (`tests/escrow_math.test.js`): 7 scenarios × 6 money-conservation invariants + 11 boundary checks, `BUFFER_FACTOR = 1.10`, proving **locked = released + refunded** always. This is your "I proved it" line.

---

## H. Core controller #2 — `authController.js` ✅ (~496 lines)

Functions and exact behavior:

- **`makeOTP()`** → `Math.floor(100000 + Math.random()*900000).toString()` (always 6 digits).
- **`signup`** — validates `["farmer","buyer"].includes(role)` (**admin blocked here** — that's why admin is manual-only), `bcrypt.hash(password, 10)`, generates OTP (10-min expiry), `sendOTPEmail`. Account starts **unverified**.
- **`verifySignupOTP`** — checks code + expiry, sets `is_verified = true`, issues **`jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })`**.
- **`login`** — `bcrypt.compare`; **403 if not verified**; if `two_factor_enabled`, send a login OTP (2FA branch); else issue the JWT.
- **`verifyLoginOTP`** — completes the 2FA login, issues JWT.
- **`resendOTP`** — regenerates + re-emails the code.
- **`forgotPassword`** — **anti-enumeration**: identical response whether or not the email exists; if it exists, emails a reset code.
- **`resetPassword`** — verifies the reset code, `bcrypt.hash` the new password.
- **`toggleTwoFactor`** — user opts in/out of login OTP.
- **`getProfile`** — returns the current user (`req.user.id`).

> **Defend the full auth story:** *"Signup hashes with bcrypt and emails a 6-digit OTP that expires in 10 minutes; you can't log in until verified. Login compares the hash, blocks unverified accounts, and issues a 7-day JWT holding id and role — with an optional email-OTP second factor. Forgot-password is anti-enumeration."*

---

## I. Core controller #3 — `cropStageController.js` ✅ (~226 lines)

**`createStage`** — the GPS verification pipeline:
1. `multer` gives `req.file.buffer` (the photo).
2. **Tier 1 — EXIF:** `extractGPS(buffer)` → if coords, `gps_source = "exif"`.
3. **Tier 2 — OCR:** else `extractText(buffer)` + `parseGPSData(text)` → `gps_source = "ocr"`.
4. **Tier 3 — client:** else use `latitude/longitude` from `req.body` → `gps_source = "client"`.
5. Upload the photo to Supabase bucket **`stages`** → store the public URL.
6. `distance_from_farm = calculateDistance(farm coords, photo coords)`; **`gps_verified = distance_from_farm <= 500`** (metres).
7. `stageOrderMap = { Sowing:1, "Early Growth":2, "Vegetative Growth":3, Flowering:4, "Pre Harvest":5 }`; duplicate-stage check.
8. Insert into `crop_stages` (+ a `prediction_history` row); **notify buyers** who have an active contract on this listing.

Other functions: `getStagesByListing`, `getStageById`, `deleteStage`.

> **Defend it:** *"When a farmer uploads a stage photo, I try to get GPS three ways — EXIF, then OCR of a stamped watermark, then the device's coordinates — upload the image to storage, compute the distance from the registered farm, and mark it verified within 500 metres. Then buyers with a contract on that listing get notified."*

---

## J. Core controller #4 — market prices ✅

`marketPriceController.js` exposes the price endpoints (list/lookup by crop/region, and an admin refresh). The heavy lifting is in **`services/marketScraper.js`** (see Part 6 for the full 4-tier fallback). The daily refresh is driven by **cron** (06:00 IST) and the **boot self-heal**.

---

## K. Secondary controllers — functional map

> These are the files the quota-halted agents were going to detail line-by-line. This is an accurate **functional** description from their verified routes, the schema, and the app's behavior — not a line-level read. Where you want exact code for one, say so and I'll read that single file.

| Controller | Route base | Responsibility | Tables | Résumé |
|---|---|---|---|---|
| **listingController** | `/api/listings` | Create/list/get/update crop listings; upload crop image + farm-registration image to Supabase `listings` bucket; **OCR the registration doc for farm GPS**; **call the ML service** for yield (wrapped in try/catch → graceful). | `listings` | ✅ crop listings |
| **contractController** | `/api/contracts` | Buyer creates an offer (quantity, price, buffer%); farmer **accept/reject**; status `pending → accepted → completed`; **on accept, calls `createEscrowOnAccept` inside the escrow transaction**; dispute raise/resolve. | `contracts` (+ triggers escrow) | ✅ contract mgmt |
| **updateController** | `/api/updates` | Additional photo updates *within* a stage; same GPS verify + Supabase `stages` bucket. | `crop_updates` | (part of lifecycle) |
| **notificationController** | `/api/notifications` | List/mark-read in-app notifications (created by other flows: stage upload, releases, refunds). | `notifications` | — |
| **reviewController** | `/api/reviews` | Post/list reviews after a contract; updates the user's `avg_rating`; `UNIQUE(contract_id, reviewer_id)` prevents double reviews. | `reviews`, `users` | — |
| **watchlistController** | `/api/watchlist` | Buyer saves/removes listings; `UNIQUE(buyer_id, listing_id)`. | `watchlist` | — |
| **profileController** | `/api/profile` | View/update profile; profile image upload (into `listings` bucket). | `users` | — |
| **analyticsController** | `/api/analytics` | Aggregate stats for dashboard charts (recharts). | multiple (read) | (dashboards) |
| **adminController** | `/api/admin` | ℹ️ Dashboard stats, user list, toggle user active, all listings/contracts, broadcast notification, verify farm — all gated by `roleMiddleware("admin")`. **Manual-admin only** (signup blocks admin). | many | ℹ️ off |
| **ragController** | `/api/chatbot` | ℹ️ RAG chatbot: retrieve from `rag_documents`, answer via Groq LLM; stores chat history. | `rag_documents`, `chatbot_messages` | ℹ️ off |
| **agentController** | `/api/agent` | ℹ️ Negotiation assistant: suggests a price using market + yield data (function-calling). | `negotiation_log` | ℹ️ off |
| **modelMonitorController** | `/api/monitor` | ℹ️ Logs predicted vs actual yield + error % for model monitoring. | `prediction_log` | ℹ️ off |
| **locationController** | `/api/location` | State/district/taluka/village dropdown data. | (static/service) | — |
| **pdfController** | `/api/pdf` | Generate a contract/summary PDF. | (read) | — |
| **predictionRoutes** | `/api/ai` | ℹ️ Proxy/trigger for the ML yield prediction. | `prediction_history` | ℹ️ off |

---

## L. The database schema — all 19 tables

Defined in `schema.sql`. Grouped by purpose:

### L.1 People & catalog
- **`users`** — `id, name, email (UNIQUE), password (bcrypt hash), role CHECK ('farmer','buyer','admin'), phone, state, district, avg_rating, total_reviews, is_active, created_at`. Migrated in: `is_verified, otp_code, otp_expires, password_reset_token/expires, two_factor_enabled`.
- **`listings`** — the crop for sale: crop_name, land_size, rainfall, temperature, soil_type, irrigation_method, season, location + state/district/taluka/village, `latitude/longitude`, **`predicted_yield` + `confidence_lower/upper`** (from ML), `farmer_expected_yield`, image_url, **`farm_latitude/longitude`**, `farm_registration_image`, `farm_verified`, `status`, `harvest_date`, `model_version`.

### L.2 Crop lifecycle ✅
- **`crop_stages`** — `listing_id, stage_name, stage_order, image_url, latitude/longitude, image_latitude/longitude, image_timestamp, gps_verified, distance_from_farm, notes, updated_yield`.
- **`crop_updates`** — extra photo updates within a stage (same GPS fields).
- **`prediction_history`** / **`prediction_log`** — yield prediction snapshots + model-monitoring (predicted vs actual, error %).

### L.3 Deals & money ✅🎒
- **`contracts`** — `listing_id, buyer_id, farmer_id, quantity, offered_price, message, expected_delivery_date, status ('pending' default), advance_paid, final_amount, market_price_at_settlement, idempotency_key`. Migrated in: `buffer_pct` (default 10) and the **dispute path** (`dispute_status CHECK ('none','open','resolved','rejected'), dispute_reason, dispute_raised_by, dispute_raised_at, dispute_resolution, dispute_resolved_at`).
- **`escrow`** — `contract_id, buyer_id, farmer_id, advance_amount, pending_amount, final_amount, buffer_amount, buffer_pct (default 110), total_locked, released_to_farmer, refunded_to_buyer, status, advance_released, advance_released_at, locked_at, settled_at, market_price_used`.
- **`escrow_milestones`** — `escrow_id, contract_id, milestone_order, kind CHECK('advance','progress'), stage_name, label, release_pct (0–100), amount, status CHECK('locked','released'), payment_ref, released_at, released_by`, **`UNIQUE(contract_id, milestone_order)`**.
- **`escrow_ledger`** — append-only: `escrow_id, contract_id, entry_type, amount, running_balance, actor_id, actor_role, reference_note, payment_ref, created_at`.
- **`idempotency_keys`** — `key (UNIQUE), user_id, operation, result (JSONB)`.

### L.4 Engagement & market
- **`notifications`** — `user_id, title, message, type, reference_id/type, is_read`.
- **`market_prices`** — `crop_name, price_per_quintal, state, market_name, recorded_date`.
- **`watchlist`** — `UNIQUE(buyer_id, listing_id)`.
- **`reviews`** — `contract_id, reviewer_id, reviewee_id, rating (1–5), comment`, `UNIQUE(contract_id, reviewer_id)`.

### L.5 AI extras ℹ️
- **`chatbot_messages`**, **`rag_documents`**, **`crop_health_tips`**, **`negotiation_log`**.

### L.6 Indexes & seeds
Indexes on the hot foreign keys (`listings.farmer_id/status`, `contracts.farmer_id/buyer_id/status`, `escrow.contract_id`, `escrow_ledger.contract_id`, `escrow_milestones.escrow_id/contract_id`, `crop_stages.listing_id`, `notifications.user_id/is_read`). Seed data: 15 national reference prices + a pre-verified admin row.

> **Defend the schema design:** *"The money tables mirror the real flow: a contract has one escrow; the escrow has five milestones and an append-only ledger. Constraints do the enforcing — a CHECK on milestone status, a UNIQUE on (contract, milestone_order) so a milestone can't be duplicated, and an idempotency table so a retried release can't double-pay."*

---

### End of Part 3

**Next:** Part 4 — the frontend (pages, components, routing, the Leaflet map, offline/Dexie, PWA) and the Python ML service (FastAPI app, feature pipeline, XGBoost). *Note: the frontend/ML reader agents were halted by the quota limit, so Part 4 will be written from the verified package manifests, the files already confirmed, and the integration contracts — with anything I couldn't read first-hand clearly flagged for you to confirm.*
