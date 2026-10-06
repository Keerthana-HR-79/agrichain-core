# AGRICHAIN — MASTER GUIDE

> **The single, end-to-end reference for the AgriChain project.**
> Read this one file and you can explain *what it is, why every technology was chosen (and why not the alternatives), how it works as a flow, what every file/page does, how the pieces connect, how a request travels and is answered, every interview question you'll face, and the exact lines to put on your résumé.*
>
> **Source of truth:** everything here was re-read directly from the code in `D:\claude\agrichain` (Sept 2026). Where older notes or the three companion docs disagree, **this file follows the live code** — the important corrections are flagged inline with ⚠️.
>
> **Companion docs** (kept, but this guide supersedes and consolidates them): `AGRICHAIN_PROJECT_KNOWLEDGE.md` (concepts), `PROJECT_EXPLAINED.md` (rationale), `CODEBASE_DEEP_DIVE.md` (file-by-file).

---

## TABLE OF CONTENTS

1. The project at a glance
2. Tech stack — with *why this, not that*
3. Architecture — how everything connects
4. The end-to-end flow (the one story)
5. Request → response lifecycle (traced in detail)
6. File-by-file / page-by-page
   - 6A. Backend · 6B. Frontend · 6C. AI service
7. Deep dives (the impressive parts)
8. Database schema
9. Honest caveats — know these cold
10. Interview question bank (with answers)
11. Résumé — the lines to use
12. The 90-second narration script
13. Glossary
14. Cheat sheet — numbers to memorize

---

# 1. THE PROJECT AT A GLANCE

### One-line pitch
> *A farm-to-buyer contract platform with AI yield prediction, GPS-verified stage-based escrow payments, and market-linked settlement.*

### 30-second pitch
> "AgriChain is an **AI-powered crop-lifecycle marketplace for Indian agriculture**. A farmer lists a crop; an **XGBoost** model predicts the yield from the farm's real climate data; a buyer places a forward contract; the buyer's money is locked in an **ACID-safe escrow with a 110% buffer**; funds release to the farmer **stage-by-stage as each growth stage is proven with a GPS-verified photo**; and at harvest the contract is **settled against live government mandi prices**, so the farmer always gets the fairer of the contracted or market price. It's **four independent services** — a React PWA, a Node/Express API, a Python FastAPI ML service, and PostgreSQL — with a Groq-powered RAG chatbot on top."

### The problem it solves
Indian farmers face three chronic problems; AgriChain answers each one-to-one:

| Problem | AgriChain's answer |
|---|---|
| **Price exploitation** — farmers sell at whatever a middleman offers, blind to the real mandi price | **Market-linked settlement** — payouts track the official data.gov.in government price feed |
| **No trust** — advance-paying buyers risk non-delivery; farmers risk non-payment | **GPS-verified, stage-based escrow** — money is locked up front and released only as the farmer *proves* progress from the real farm location |
| **No yield visibility** — buyers can't judge if a listing is real or productive | **ML yield prediction + confidence band** on every listing |

### The three pillars (what makes it more than a marketplace)
1. **AI yield prediction** (XGBoost regressor) — a data-backed tonnage estimate per listing.
2. **Milestone escrow** — buyer's funds held and released stage-by-stage against GPS-proven crop growth.
3. **Market-linked settlement** — farmer paid the *higher* of agreed vs live mandi price, capped at locked funds.

Plus: a Groq **RAG chatbot** (AgriBot), an **agentic AI negotiation** assistant, live market prices, reviews, notifications, analytics dashboards, a model-drift monitor, an admin panel, and an **offline-capable installable PWA** for rural connectivity.

### Roles
- **Farmer** — lists crops, uploads GPS stage photos, accepts/rejects contracts, gets paid.
- **Buyer** — browses marketplace, offers contracts, funds escrow, releases milestones, settles.
- **Admin** — verifies farms, manages users/listings, resolves disputes, monitors the model, broadcasts notices (provisioned out-of-band; not creatable via signup).

---

# 2. TECH STACK — WITH *WHY THIS, NOT THAT*

### The full stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, React Router v6, Axios, **Dexie/IndexedDB** (offline), **vite-plugin-pwa/Workbox** (installable PWA), **Recharts** (charts), **Leaflet/react-leaflet** (maps), **plain per-area CSS** (Tailwind removed) |
| **Backend** | Node.js, Express 4, **pg** (Postgres driver), **jsonwebtoken**, **bcrypt**, **Multer** (uploads), **@sendgrid/mail** (OTP email over HTTPS), **node-cron** (schedules), **tesseract.js** (OCR), **exifr** (EXIF GPS), **@supabase/supabase-js**, axios, form-data |
| **Database** | PostgreSQL (Supabase-hosted) + Supabase Storage; transactions, SERIALIZABLE isolation, row locks, advisory locks, JSONB, CHECK/UNIQUE constraints, indexes |
| **AI/ML service** | Python 3.12, FastAPI, Uvicorn, **XGBoost** (XGBRegressor), scikit-learn, pandas, NumPy, **Optuna** (hyperparameter tuning), joblib, Pydantic |
| **GenAI/LLM** | Groq (OpenAI-compatible Chat Completions), **RAG** (keyword retrieval), **function/tool calling** (agentic loop) |
| **External data** | data.gov.in Agmarknet mandi price API; climate from a bundled dataset |
| **Deploy** | Vercel (frontend), Render (backend + AI service), Supabase (DB + storage) |
| **Cross-cutting** | JWT + email-OTP 2FA, RBAC, rate limiting, idempotency keys, append-only ledger, PWA offline sync |

### Per-choice justification (the *why-not* is what interviewers probe)

| Decision | Why this | Why not the alternative |
|---|---|---|
| **React + Vite** | Component model; Vite gives instant HMR + a tiny fast build | Not CRA (deprecated/slow); not Next.js — it's an authenticated SPA with no SEO/SSR need, so a pure SPA+PWA is simpler to host and reason about |
| **Plain CSS** (per-area files) | Every line is readable and defensible in a review; no build-time magic | Deliberately **migrated off Tailwind** so styling is fully explainable (see the `@layer base` story in §7.6) |
| **PWA + Dexie/IndexedDB** | Rural users have patchy connectivity; the app caches reads and queues writes offline | Plain `localStorage` can't hold structured queued mutations; Dexie wraps IndexedDB cleanly |
| **Node + Express** | Same language as the frontend (one mental model), huge ecosystem, non-blocking I/O ideal for an I/O-bound API | Not Django/Spring — heavier; no ORM/DI framework needed; JS end-to-end lowers context-switching |
| **Python + FastAPI** for ML | Python **is** the ML ecosystem (XGBoost/pandas/sklearn/joblib); FastAPI adds async, Pydantic validation, auto Swagger docs | Not ML in Node (immature libs); not Flask (FastAPI is async + typed + free `/docs`) |
| **XGBoost** | State-of-the-art on **tabular** data; captures non-linear feature interactions; fast to train; gives feature importances for explainability | Not linear regression (relationships are non-linear); not a neural net (overkill for tabular, needs far more data, harder to explain) |
| **PostgreSQL** | Data is relational (users→listings→contracts→escrow→ledger) and money movement needs **ACID transactions, row locking, SERIALIZABLE isolation, advisory locks** — all first-class in Postgres | Not MongoDB — multi-row money movements can't be made safe as cleanly; need real transactions + foreign keys |
| **Supabase** | One free platform gives **managed Postgres + object storage** for images | Not Firebase — Firestore is NoSQL, wrong fit for relational money data |
| **Groq LLM** | Free tier, very fast (LPU hardware), **OpenAI-compatible** API so client code is standard | Not paid OpenAI/Anthropic for a student demo — Groq keeps cost at ₹0 |
| **JWT + bcrypt** | Stateless tokens work naturally across separated services; bcrypt is the password-hashing standard | Not server-side sessions — would need shared session storage across services |
| **data.gov.in API** | Official Government of India open-data mandi feed — legal, structured, credible | Not web scraping — brittle and legally grey |
| **node-cron** (in-process) | Refreshes prices daily at 6 AM IST without extra infra | Not a separate cron service/Celery — unnecessary for one daily job |
| **⚠️ SendGrid HTTPS API** (not Nodemailer/SMTP) | **Render's free tier blocks outbound SMTP ports (25/465/587)**, so OTP email is sent over the SendGrid **HTTPS** API (port 443) | Not raw SMTP/Nodemailer — it silently fails on Render free tier (this is a real "problem I solved") |
| **⚠️ HTML-based PDF** (no pdfkit) | The contract "PDF" is a styled **HTML** document the browser prints/saves — avoids a heavy PDF dependency | Not pdfkit/puppeteer — unnecessary weight for a printable contract |

### The single most important architectural decision to defend: *why four services, not a monolith*
> "The ML service has heavy Python-only dependencies (XGBoost, pandas, numpy) that have nothing to do with serving an API. Splitting it along the **language/dependency seam** keeps the Node API lightweight, lets the two **scale and deploy independently**, and lets the backend **degrade gracefully** — if the model service is slow or down, listing creation catches the error and still saves the listing. It's a clean microservice boundary along a real seam, not splitting for the sake of it."

---

# 3. ARCHITECTURE — HOW EVERYTHING CONNECTS

```
                    ┌───────────────────────────┐
                    │   Browser (React PWA)      │
                    │   Dexie offline queue      │
                    │   JWT in localStorage      │
                    └────────────┬──────────────┘
                                 │  HTTPS + JWT (Authorization: Bearer)
                                 │  calls ONLY the backend  →  VITE_API_URL + /api
                                 ▼
                    ┌───────────────────────────┐
                    │  Node/Express API          │
                    │  auth · listings ·         │
                    │  contracts · escrow ·      │
                    │  market · chatbot · agent  │
                    └───┬───────────┬────────┬───┘
        AI_SERVICE_URL  │           │        │  Groq REST (chatbot + negotiator + health)
                        ▼           │        ▼
        ┌───────────────────────┐   │   ┌──────────────────────┐
        │ Python FastAPI        │   │   │  Groq LLM API        │
        │ XGBoost yield model   │   │   │  (OpenAI-compatible) │
        │ climate lookup        │   │   └──────────────────────┘
        │ reads local CSV+.pkl  │   │
        └───────────────────────┘   │  pg pool + Supabase SDK + SendGrid + data.gov.in
                                     ▼
                    ┌───────────────────────────┐
                    │  PostgreSQL (Supabase)     │
                    │  + Supabase Storage        │
                    │    (listing/stage/profile  │
                    │     images)                │
                    └───────────────────────────┘
```

### Connection facts (exact)
- **Frontend → Backend only.** `frontend/src/lib/api.js` reads `VITE_API_URL` (origin only) and appends `/api`. It attaches the JWT from `localStorage` on every request (request interceptor) and **auto-logs-out on any 401** (response interceptor). The frontend never talks to the DB, ML service, Groq, or data.gov.in directly.
- **Backend → PostgreSQL** via a single shared `pg.Pool` (`config/db.js`); `DB_SSL=true` for hosted Postgres (`rejectUnauthorized:false` to accept the managed cert chain).
- **Backend → Supabase Storage** via the Supabase SDK using the **service-role key** (server-side only — it bypasses RLS) for image buckets `listings`, `stages`, and profile images.
- **Backend → AI service** over HTTP via `AI_SERVICE_URL`. Live path: `listingController.createListing` → `POST /predict/dynamic` (multipart) at listing creation; `agentController.getCropHealthAdvice` → `GET /climate/:state/:district`.
- **Backend → Groq** via REST (`https://api.groq.com/openai/v1/chat/completions`, model from `GROQ_MODEL`, default `openai/gpt-oss-20b`) for the chatbot, negotiator, and crop-health tips.
- **Backend → data.gov.in** Agmarknet resource `9ef84268-…` for mandi prices.
- **Backend → SendGrid** (HTTPS API) for OTP emails.
- **AI service → local files only.** Reads `agrichain_feature_matrix.csv` + the `.pkl` model/columns at startup. **No secrets, no outbound network.**

### Configuration seams (env var **names** only — never commit values)
`VITE_API_URL` (frontend) · `AI_SERVICE_URL`, `DB_*`, `DB_SSL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SENDGRID_API_KEY`, `EMAIL_USER`, `GROQ_API_KEY`, `GROQ_MODEL`, `DATA_GOV_API_KEY`, `FRONTEND_URL`, `PORT`, `NODE_ENV` (backend) · `PYTHON_VERSION` only (AI service).

---

# 4. THE END-TO-END FLOW (THE ONE STORY)

Learn these 10 steps cold — they're the spine of any demo or interview.

1. **Farmer registers** (email + 6-digit OTP, 10-min expiry) and **creates a listing**: crop, land size (acres), soil, irrigation, season, location, a crop photo, and a farm-registration document.
2. On creation, the backend **OCRs the registration image** for farm GPS and **calls the Python AI service** (`/predict/dynamic`), which returns a **predicted yield (tonnes) + confidence band**, stored on the listing.
3. A **buyer** browses the **marketplace**, opens a listing, and **sends a contract offer** (quantity in tonnes + price ₹/quintal + a buffer % 5–25, default 10).
4. The **farmer accepts** → in **one SERIALIZABLE transaction** the **escrow is created**: buyer's **110% of contract value is locked** and a 5-step **milestone schedule** is seeded. A **contract PDF** (HTML) can be generated.
5. The buyer **releases the 15% cultivation advance** immediately.
6. As the crop grows, the farmer **uploads GPS-stamped stage photos** (Sowing → Vegetative Growth → Flowering → Pre-Harvest). Each photo's GPS is checked **within 500 m** of the registered farm.
7. For each proven stage, the buyer **releases that milestone** (15% / 20% / 20% / 10%). By pre-harvest, **80%** has been paid progressively.
8. At harvest, the buyer **settles**: fetches the **live mandi price**, pays the farmer the **higher of contracted vs market**, **capped at the 110% ceiling**, and **refunds any unused buffer** to the buyer.
9. Every money movement is an **append-only ledger** row; both parties **review** each other; the farmer gets the **payout**; the deal is **complete**.
10. Throughout, **AgriBot** (Groq RAG chatbot) answers questions, and a farmer can run the **AI negotiator** before accepting.

### Money-math worked example — 10 tonnes @ ₹2000/quintal (1 tonne = 10 quintals)
- `contract_value = 10 × 2000 × 10 = ₹2,00,000`
- `total_locked (110%) = ₹2,20,000`; advance (15%) = ₹30,000; buffer (10%) = ₹20,000
- Market rises to ₹2100/q at harvest → farmer paid at ₹2100 (the higher), buyer refunded the leftover buffer.
- Market spikes past +10% (e.g. ₹2400/q) → farmer paid at the **ceiling** (₹2200/q equivalent = `total_locked`) because escrow can never release more than was locked; refund = ₹0.

---

# 5. REQUEST → RESPONSE LIFECYCLE (TRACED IN DETAIL)

### 5.1 Anatomy of every backend request (middleware order in `server.js`)
1. **CORS** — `cors({ origin: FRONTEND_URL || localhost:3000, credentials: true })`.
2. **Body parse** — `express.json({limit:"10mb"})` + `express.urlencoded({extended:true, limit:"10mb"})`.
3. **Global rate limit** — `app.use("/api", apiLimiter)` (in-memory Map, 60 req/min/IP).
4. **Route match** — one of 20 routers mounted under `/api/*`.
5. **Per-route guards (in order):** `validateIdParam` (cheap 400 for bad IDs) → `authMiddleware` (JWT → `req.user`) → `roleMiddleware(...)` (RBAC 403) → optional `upload`/`validateContract`/limiters.
6. **Controller** — try/catch body; DB via the shared pool; returns JSON.
7. **No centralized error handler** — each controller catches and returns (typically `500 "Server Error"`); unmatched routes hit Express's default 404.

### 5.2 Traced: **farmer accepts a contract** — `PUT /api/contracts/:id/accept` (the ACID centerpiece)
1. TCP → Express; CORS headers set; body parsed (≤10 mb).
2. `apiLimiter` checks this IP (60/min). Under limit → continue.
3. Route match: `/api/contracts` → `PUT /:id/accept`.
4. `validateIdParam("id")` — rejects non-positive-integer `:id` with 400.
5. `authMiddleware` — reads `Authorization: Bearer <token>`; `jwt.verify(token, JWT_SECRET)`; sets `req.user = {id, role}`. Missing/invalid → 401.
6. `roleMiddleware("farmer")` — `req.user.role` must be `farmer`, else 403.
7. `contractController.acceptContract` opens `withTransaction`: `BEGIN` → `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` on a pooled client; `pg_advisory_xact_lock(contract_id)` serializes concurrent accepts; `SELECT … FOR UPDATE` loads the contract; verifies ownership + `status='pending'` (else 400); `UPDATE status='accepted'`.
8. **Escrow creation in the same transaction** — `createEscrowOnAccept(client, …)`: `contract_value = qty×price×10`; `total_locked = contract_value×1.10`; `advance = contract_value×0.15`; INSERT `escrow` (`status='pending'`); INSERT `escrow_ledger` `"buffer_locked"`; seed 5 `escrow_milestones` (`ON CONFLICT DO NOTHING`).
9. INSERT `notifications` for the buyer ("contract accepted").
10. **COMMIT** — contract + escrow + ledger + milestones + notification all succeed or all roll back; client released to the pool.
11. `res.status(200).json({ contract, escrow })`. Any thrown error → ROLLBACK → `500`. A duplicate-escrow guard returns 409.

### 5.3 Traced: **farmer creates a listing** — `POST /api/listings/create`
`auth` + `upload.fields([image, farm_registration_image])` → `listingController.createListing`:
1. Upload both images (in-memory Multer buffers) to Supabase `listings` bucket → public URLs.
2. **OCR** the registration image (`ocrHelper` → `gpsParser`) → farm lat/long.
3. **AI call:** build `multipart/form-data` and `POST ${AI_SERVICE_URL}/predict/dynamic` (timeout 15 s; season mapped Monsoon→Kharif etc.). On any failure, fall back to `predicted_yield = 0` so the listing still saves (graceful degradation).
4. `INSERT INTO listings` (~30 cols incl. both image URLs, farm GPS, `predicted_yield` + `confidence_lower/upper`).
5. Notify + return `201`.

### 5.4 Traced: **buyer releases a milestone** — `PUT /api/escrow/contract/:cid/milestone/:mid/release`
`auth` + `role("buyer")` → `escrowController.releaseMilestone`, inside a SERIALIZABLE txn with `X-Idempotency-Key`:
- Guards: dispute open → **423**; already released → **409**; advance-kind → 400 ("use release-advance"); **ordering gate** (prior milestone must be released) → 400; **stage gate** (a matching `crop_stages` row for that `stage_name` must exist) → 400.
- Pays `amount`, bumps `released_to_farmer`, sets escrow `in_progress`, appends ledger `milestone_released` (walking `running_balance`), notifies the farmer.
- A duplicate request (double-click) blocks on the locks, then returns the **cached idempotent result** — never pays twice.

### 5.5 Traced: **UI → API** (create listing, from the browser)
1. `CreateListing.jsx` `useEffect` runs the farmer guard + browser Geolocation autocapture; dropdowns from static `indiaLocations.js` (works offline).
2. Submit builds `FormData` (text + GPS + two files) → `api.post("/listings/create", formData, {headers:{"Content-Type":"multipart/form-data"}})`.
3. The `api.js` **request interceptor** injects `Authorization: Bearer <token>`. Effective URL = `${VITE_API_URL}/api/listings/create`.
4. Response includes the AI `predicted_yield`; the page shows it and navigates onward.
5. If the token expired → **401** → response interceptor clears storage + hard-redirects `/login`.

---

# 6. FILE-BY-FILE / PAGE-BY-PAGE

## 6A. BACKEND (`backend/`)

### Bootstrap & config
- **`server.js`** — loads `dotenv` first (before `db.js` reads env); CORS → json/urlencoded → `apiLimiter` → mounts 20 routers under `/api/*` + `express.static("uploads")` (legacy) → `GET /` health. Boot: `pool.connect()` (fail-fast `process.exit(1)` on failure) → `app.listen(PORT||5000)` → `startAllCrons()` → `verifyEmailTransport()` → **fire-and-forget boot self-heal**: if no `market_prices` row for today with `source IN ('data_gov','data_gov_cached')`, call `triggerMarketUpdate()`. ⚠️ No centralized error middleware.
- **`config/db.js`** — singleton `pg.Pool` from `DB_*` env; SSL opt-in via `DB_SSL=true`.
- **`config/supabase.js`** — `createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)`; service-role key, server-side only.

### Middleware (`middleware/`)
- **`authMiddleware.js`** — Bearer extract → `jwt.verify` → `req.user={id,role}`; 401 on missing/invalid.
- **`roleMiddleware.js`** — factory `roleMiddleware(...roles)`; 403 if `req.user.role` not allowed; always chained after auth.
- **`uploadMiddleware.js`** — Multer **memory storage** (buffers stream straight to Supabase). ⚠️ No size/MIME limits.
- **`validationMiddleware.js`** — hand-rolled (no joi/zod/express-rate-limit): in-memory Map rate limiter (`authLimiter` 10/15min, `apiLimiter` 60/min, `uploadLimiter` 10/min, `chatLimiter` 20/min), `validate(schema)`, `validateIdParam(...names)`, presets `validateSignup/Login/Contract/Review`. ⚠️ State is per-process (resets on restart; not shared across instances).

### Routes — the complete 79-endpoint map (relative to each mount)
- **auth** (`/api/auth`): `POST /signup`, `/signup/verify-otp`, `/login`, `/login/verify-otp`, `/resend-otp`, `/forgot-password`, `/reset-password` (all `authLimiter`); `POST /two-factor` (auth); `GET /profile` (auth).
- **prediction** (`/api/ai`): `POST /predict` (public). ⚠️ Targets a non-existent `/predict` on the AI service → dead path (real flow is `/predict/dynamic` from listingController).
- **listing** (`/api/listings`): `POST /create` (auth+upload.fields), `GET /my-listings` (auth), `GET /all` (public), `GET /:id` (validateIdParam), `PUT /:id` (validateIdParam+auth), `DELETE /:id` (validateIdParam+auth).
- **location** (`/api/location`): `GET /states`, `/districts/:stateCode`, `/talukas/:districtCode` (public).
- **upload** (`/api/upload`): `POST /` (upload.single). ⚠️ No auth.
- **cropStage** (`/api/stages`): `POST /create` (auth+upload.single), `GET /stage-details/:id`, `GET /:listingId`, `DELETE /:id` (auth).
- **update** (`/api/updates`): `POST /create` (upload.single, ⚠️ no auth), `GET /:stageId`.
- **contract** (`/api/contracts`): `POST /` (buyer+validateContract), `GET /farmer` (farmer), `GET /buyer` (buyer), `PUT /:id/accept` (farmer), `/:id/reject` (farmer), `/:id/settle` (buyer), `/:id/dispute` (buyer|farmer), `GET /disputes` (admin), `PUT /:id/dispute/resolve` (admin).
- **notification** (`/api/notifications`): `GET /`, `PUT /:id/read`, `PUT /read-all` (auth).
- **admin** (`/api/admin`): `router.use(auth, role("admin"))` then `GET /stats`, `/users`, `PUT /users/:id/toggle`, `GET /listings`, `/contracts`, `POST /notify`, `PUT /listings/:id/verify`.
- **marketPrice** (`/api/market-prices`): `GET /`, `/crop/:crop_name`, `/history/:crop_name` (public); `POST /update`, `/scrape`, `GET /scrape-log` (admin).
- **watchlist** (`/api/watchlist`): `POST /`, `DELETE /:listing_id`, `GET /`, `GET /check/:listing_id` (auth).
- **review** (`/api/reviews`): `POST /` (auth), `GET /user/:user_id` (public).
- **escrow** (`/api/escrow`): `GET /my` (auth), `GET /contract/:cid` (auth), `PUT /contract/:cid/release-advance` (buyer), `/contract/:cid/milestone/:mid/release` (buyer), `/contract/:cid/settle` (buyer).
- **analytics** (`/api/analytics`): `GET /farmer` (farmer), `/buyer` (buyer), `/platform` (admin).
- **profile** (`/api/profile`): `GET /:user_id` (public), `PUT /me/update` (auth+upload.single), `PUT /me/password` (auth).
- **rag** (`/api/chatbot`): `POST /chat` (auth+chatLimiter), `GET /history`, `DELETE /history` (auth).
- **modelMonitor** (`/api/monitor`): `GET /stats` (admin), `POST /log` (auth), `PUT /actual` (auth).
- **agent** (`/api/agent`): `POST /negotiate/:contract_id` (farmer), `GET /health/:listing_id/:stage_name` (auth), `GET /health/:listing_id` (auth).
- **pdf** (`/api/pdf`): `GET /contract/:contract_id` (auth).

### Controllers (`controllers/`) — what each does
- **authController** — `signup` (dup check, bcrypt hash cost 10, INSERT unverified + OTP, SendGrid), `verifySignupOTP` (verify + auto-login JWT), `login` (bcrypt.compare; unverified→403+resend; 2FA→send OTP; else 7-day JWT `{id,role}`), `verifyLoginOTP`, `resendOTP`, `forgotPassword` (anti-enumeration — identical 200 always), `resetPassword`, `toggleTwoFactor`, `getProfile`. ⚠️ OTP uses `Math.random` (not `crypto`); login/signup/reset leak user-existence (forgot-password does not).
- **listingController** — `createListing` (see §5.3), `getAllListings` (filters), `getListingById` (+prediction_history), `getMyListings`, `updateListing` (COALESCE partial; ⚠️ catch mislabeled "CREATE LISTING ERROR"), `deleteListing`.
- **cropStageController** — `createStage` (GPS chain **EXIF → OCR → client fallback**; Haversine vs farm GPS; `gps_verified = distance ≤ 500 m`; duplicate-stage guard; notifies contracted buyers), `getStagesByListing`, `getStageById`, `deleteStage` (⚠️ no ownership check).
- **contractController** — `createContract` (buffer clamp 5–25, default 10), `acceptContract` (the ACID centerpiece — §5.2), `rejectContract`, `getFarmerContracts`/`getBuyerContracts`, `settleContract` (delegates to `settleEscrow`), `raiseDispute`/`getDisputes`/`resolveDispute`.
- **escrowController** — the engine (§7.1): `createEscrowOnAccept`, `releaseAdvance`, `releaseMilestone`, `settleEscrow`, `getEscrowByContract`, `getMyEscrows`.
- **marketPriceController** — `getAllMarketPrices` (`DISTINCT ON (crop_name)`), `getCropPrice`, `getCropPriceHistory` (trend), `adminUpdatePrice`, `adminTriggerScrape` (background), `getScrapeLog`, `sourceNote` helper.
- **pdfController** — `generateContractPDF` returns a styled **HTML** doc (`Content-Type: text/html`); `?print=true` auto-fires `window.print()`. ⚠️ Hard-codes the 10% buffer display.
- **adminController** — stats, users, toggle, listings, contracts, broadcast, verifyFarm.
- **analyticsController** — role-scoped `Promise.all` aggregates with `NULLIF` divide-by-zero guards.
- **profileController** — `getProfile` (public), `updateProfile` (avatar), `changePassword`.
- **notificationController** — `getNotifications` (limit 50 + unread count), `markAsRead`, `markAllRead`.
- **watchlistController** — add/remove/get/check; `INSERT … ON CONFLICT DO NOTHING`.
- **reviewController** — `createReview` (completed contracts only; recompute avg_rating; `23505`→409), `getUserReviews`.
- **updateController** — `createUpdate` (OCR-only GPS), `getUpdatesByStage`.
- **predictionController** — `predictYield` proxy → aiService.
- **modelMonitorController** — `logPrediction` (`model_version="2.0"`), `recordActual` (error_pct), `getMonitoringStats` (MAPE/MAE/stddev + **drift detector**: recent > all-time×1.3 → alert, ×1.5 → high).
- **agentController** — `runNegotiator` (Groq **tool-calling loop**, MAX_ITER=5, 3 tools; 503 if no key), `getCropHealthAdvice` (climate from AI service → Groq 3 JSON tips → `getDefaultTips` fallback), `getSavedTips`.
- **ragController** — 10-doc `KNOWLEDGE_BASE`, `retrieveContext` (keyword-overlap top-3), `chat` (503 if no key; last-8 memory; Groq), `getHistory`, `clearHistory`.

### Services (`services/`)
- **marketScraper.js** — data.gov.in Agmarknet; tunables `LIMIT=60`, `TIMEOUT=20000`, `ATTEMPTS=2` (1 retry, 800 ms backoff); `CROP_TO_COMMODITY` (15 crops); `fetchLivePrice` widens **district→state→national**; `summarizeRecords` uses the government **`modal_price`**; `getSimulatedPrice` (date-seeded ±5%); `getLatestPrice` **4-tier chain: 25 h cache → live → last-verified (`data_gov_cached`) → simulated**; `upsertPrice` (`ON CONFLICT` on the 5 key cols). ⚠️ Shipped fallback key is data.gov.in's **public sample key** (safe; personal key raises the rate limit).
- **emailService.js** — ⚠️ **SendGrid HTTPS API** (`@sendgrid/mail`), because Render free tier blocks SMTP. Lazy `configureSendGrid`, boot `verifyEmailTransport`, `sendOTPEmail({name,email,otp,type})` (signup/login/reset branded HTML; From = `EMAIL_USER`, a **verified Single Sender**).
- **aiService.js** — `getYieldPrediction` → `POST ${AI_SERVICE_URL}/predict` (⚠️ dead route; no timeout).
- **cronJobs.js** — node-cron **Asia/Kolkata**: `"0 6 * * *"` daily scrape, `"0 0 * * 0"` Sunday cleanup (logs >30 d, prices >90 d); `isRunning` guard; `triggerMarketUpdate()` manual trigger.
- **locationService.js** — CKAN datastore_search POSTs for states/districts/talukas. ⚠️ No timeout/error handling.

### Utils (`utils/`)
- **distanceHelper.js** — Haversine, `R=6371000 m`, returns metres (feeds the ≤500 m gate).
- **exifHelper.js** — `exifr.parse` → `{latitude, longitude, timestamp}`.
- **gpsParser.js** — regex-extracts lat/long/village/date from OCR text; tolerant of GPS-camera watermark formats (incl. missing decimal points, India-specific 2-digit degrees).
- **ocrHelper.js** — `Tesseract.recognize(buffer, "eng")`.

### package.json & tests
- Scripts: `dev`=nodemon, `start`=node server.js, `test`=`node tests/escrow_math.test.js`.
- Key deps: express 4, pg, jsonwebtoken, bcrypt, cors, dotenv, multer, @supabase/supabase-js, **@sendgrid/mail**, axios, form-data, exifr, tesseract.js, node-cron. ⚠️ **No pdfkit.**
- **`tests/escrow_math.test.js`** — dependency-free, **53 assertions** across 7 market scenarios proving 6 invariants (see §7.1).

## 6B. FRONTEND (`frontend/`)

### Bootstrap
- **`main.jsx`** — React 18 root in `StrictMode`; imports `leaflet.css` + `index.css`. ⚠️ No global providers (no Redux/Context); SW registration injected by vite-plugin-pwa at build.
- **`App.jsx`** — `BrowserRouter` → `Routes`; **28 routes**, ⚠️ **no `ProtectedRoute` wrapper** (guards are per-page); `NotFound` inline on `*`.

### API + state layer (`lib/`)
- **`api.js`** — axios `baseURL = ${VITE_API_URL||localhost:5000}/api`; request interceptor attaches `Bearer` token; response interceptor **401 → clear storage + redirect `/login`**; helpers `getUser/getToken/logout`. ⚠️ No timeout.
- **State = localStorage only** — `token` (JWT) + `user` (JSON). No client store; pages use local `useState`/`useEffect`.
- **`db.js`** — Dexie `AgriChainOfflineDB` v1, stores `pendingMutations`, `cachedListings`, `cachedStages`, `cachedUser`. (Dep is **dexie ^3.2.7**, not idb.)
- **`offlineApi.js`** — raw axios + own `getAuthHeader`; `fetchListings/fetchStages` fall back to cache; `addStageUpdate/updateListingNotes` queue text-only writes offline.
- **`offlineQueue.js`** — `queueMutation`, `syncQueue` (3-retry then `failed`), cache helpers.
- **`useOnlineStatus.js`** — `{isOnline,isSyncing,pendingCount,…}`; auto-sync 1.5 s after reconnect; polls every 10 s.
- **`yield.js`** — `expectedYield` (farmer estimate authoritative, AI fallback), `formatYield`.
- **`data/indiaLocations.js`** — static `INDIA_STATES` + `getDistricts(state)` (offline-capable form).

### Pages (26) — route · calls · role
**Auth (3):** `Login` (`POST /auth/login` [+`/login/verify-otp`, `/resend-otp`]; role-redirect), `Signup` (`/auth/signup` [+verify]; farmer/buyer only), `ForgotPassword` (`/auth/forgot-password`, `/auth/reset-password`).
**Public/shared (6):** `Home` (static), `Marketplace` (offline-aware `fetchListings`→`/listings/all`), `MarketPrices` (`/market-prices` [+`/history/:crop`], 5-min refresh, **source-honesty badges**), `ListingDetail` (`/listings/:id`+`/stages/:id`; buyer `POST /contracts`), `StageDetail` (`/stages/stage-details/:id`+updates+listing), `ProfileView` (`/profile/:id`).
**Farmer (7):** `FarmerDashboard`, `CreateListing` (multipart + geolocation + AI yield), `MyListings`, `ListingEdit`, `ListingAddStage` (multipart GPS), `StageAddUpdate` (offline-queue path), `FarmerContracts` (accept/reject/dispute).
**Buyer (3):** `BuyerDashboard`, `Watchlist`, `BuyerContracts` (settle + dispute + ReviewModal + link to Escrow).
**Any auth (5):** `Notifications`, `Chatbot` (AgriBot), `Analytics` (Recharts by role), `Escrow` (sends **`X-Idempotency-Key`** on advance/milestone/settle), `ProfileEdit` (2FA toggle).
**Admin (2):** `AdminDashboard` (tabs: overview/users/listings/contracts/disputes/broadcast), `ModelMonitor` (drift detection).

### Components (7)
`Navbar` (role-aware; polls `/notifications` every 30 s; renders SyncStatusBar + InstallPrompt), `ReviewModal` (`POST /reviews`), `StageMap` (react-leaflet farm-vs-photo markers), `WatchlistButton` (heart toggle), `CropHealthAdvisor` (`/agent/health/…`), `InstallPrompt` (PWA add-to-home), `SyncStatusBar` (online/pending pill + Sync Now).

### Auth flow (UI)
JWT + user in localStorage → interceptor attaches Bearer → login stores + role-redirects (2FA switches to 6-box OTP) → **role gating per page** in `useEffect` (⚠️ a missed guard = an unprotected page; real enforcement is server-side) → any 401 → global clear + redirect.

### PWA / offline / styling / build
- `public/manifest.json` (standalone, theme `#16a34a`, 192/512 icons, shortcuts); vite-plugin-pwa `autoUpdate`, `navigateFallback:/index.html`, Workbox precache.
- Offline: Dexie queue, optimistic UI, 3-retry sync; reads fall back to cache; **only text-only mutations queue** (photos need connectivity).
- **`index.css` `@layer base`** reimplements Tailwind Preflight — **load-bearing**: putting the reset in the lowest cascade layer is what stops styled submit buttons rendering transparent (the documented post-Tailwind fix). One CSS file per area; `components.css` holds all 7 components namespaced by prefix.
- `vite.config.js` (`@`→`src`, port 3000, VitePWA), `vercel.json` (SPA rewrite → `/index.html`), `.env.example` (`VITE_API_URL` = origin only).

## 6C. AI SERVICE (`ai-service/`)

- **`src/app.py`** — FastAPI v2.0.0; adds `src/` to `sys.path`; CORS fully open (⚠️ `allow_origins=["*"]` + `allow_credentials=True` is a spec contradiction); startup `_load_model()` is **fail-hard**. Endpoints: `GET /`, `/model/info`, `/predict/crop-list`, `/climate/{state}/{district}`, `POST /predict/json`, **`POST /predict/dynamic`** (multipart — the live backend path; `image` accepted but unused; ⚠️ returns errors as HTTP-200 bodies, so the backend treats a 0 yield as failure). ⚠️ `/` reads `model_name` but the key is `model_type` → shows "unknown"; `/model/info` references a non-existent `per_crop_metrics.json`.
- **`src/inference.py`** (live path) — `_load_model` (joblib `.pkl` + columns); `_build_feature_row` builds a row matching `model_columns.pkl` exactly: numeric `area (acres→ha ×0.4046856), annual_rainfall, t2m_max, t2m_min, rh2m, ws2m` + engineered `rainfall_temp_interaction = rainfall/(t2m_max+1)`; categoricals one-hot, unseen → all-zero baseline. Predicts **log target**, inverts with `np.expm1`, floors at 0; `total_tonnes = kg/ha × area_ha / 1000`; **confidence band = per-crop 5th/95th percentile** (fallback ±15%). `market_estimate` always null (backend owns pricing).
- **`src/climate_service_v2.py`** (active) — climate from `agrichain_feature_matrix.csv`: exact district mean → state mean → `DEFAULT_CLIMATE`; caches df; **never raises**.
- **`src/train_optimized.py`** — `XGBRegressor` (`reg:squarederror`, `tree_method="hist"`, seed 42); target `log1p(yield_kg_ha)`; `improved_preprocess.load_and_preprocess_data()` → `get_dummies` → **643 columns** (saves `model_columns.pkl`); `test_size=0.15`; **Optuna** 20 trials maximizing R² (or `--quick` fixed params); reports MAE/R²/MAPE.
- **Artifacts:** `model_metadata.json` → **R²=0.8742, MAE=25061.59 kg/ha, MAPE=29.79%**, 643 features, 210 085 train / 37 074 test (~247 k), trained 2026-07-28, sklearn 1.4.2 / xgboost 2.0.3. `feature_importance.json` → `crop_coconut` 0.373 dominates (crop identity carries the model). `xgboost_yield_model.pkl` (~2.6 MB), `model_columns.pkl` (~13 KB).
- **Data:** `agrichain_feature_matrix.csv` (~37 MB, ~247 k rows) is **runtime + training** (also backs climate + yield bands). ⚠️ `crop_yield.csv`, `climate_crop_data.csv` are legacy-pipeline; `crop_production.csv`, `India Agriculture Crop Production.csv` are unused raw sources.
- **⚠️ Legacy/stale (do NOT cite as live):** `feature_template.py` (38 Title_Case cols), `preprocess.py` (Yield_Ratio target), `climate_service.py` (v1), `evaluate.py` (wrong paths), `TRAINING_GUIDE.md` (claims HistGBM/79-feat/R²≈0.99 — **wrong**; cite `model_metadata.json`).
- **Deploy:** `render.yaml` → `uvicorn src.app:app --host 0.0.0.0 --port $PORT`; **⚠️ `PYTHON_VERSION=3.12.4`** (repo is source of truth; a memory note said 3.12.1 — trust the repo). **Zero secrets** — no envVars beyond the Python pin.

---

# 7. DEEP DIVES (THE IMPRESSIVE PARTS)

### 7.1 Concurrency-safe milestone escrow — the crown jewel
**Problem:** money must never be double-released or over-released, even under concurrent or duplicate requests.

**Five mechanisms (all real, in `escrowController.js`), layered inside one SERIALIZABLE transaction:**
1. **SERIALIZABLE isolation** — strictest level; conflicting concurrent txns serialize (one retries) instead of interleaving.
2. **`SELECT … FOR UPDATE`** — row locks so a second request queues until the first commits (`FOR UPDATE OF m,e` in `releaseMilestone`).
3. **`pg_advisory_xact_lock(contract_id)`** — an app-level mutex per contract, held to txn end, works **across Node processes**.
4. **Idempotency keys** — `X-Idempotency-Key` header; first call reserves + caches its JSON result; a retry replays it instead of paying again.
5. **Append-only ledger** — every movement is one `INSERT` into `escrow_ledger` with a walking `running_balance`; nothing is ever updated → immutable, auditable.

**Money model:**
- `contract_value = quantity(tonnes) × offered_price(₹/quintal) × 10`
- `buffer_frac = clamp(buffer_pct/100, 0.05, 0.25)` (default 0.10)
- `total_locked = contract_value × (1 + buffer_frac)` (e.g. 110%)
- Schedule (% of contract value): advance **15** → Sowing **15** → Vegetative **20** → Flowering **20** → Pre-Harvest **10** = **80% progressive**; remaining ~20% + buffer at settlement.
- **Settlement:** `desired = max(offered, market)`; `gross = min(desired × qty_quintals, total_locked)` (**capped at the ceiling**); `refund = total_locked − gross`; `balance_due = max(0, gross − already_paid)`. Because payout lands exactly on `gross` and refund is the remainder, the ledger **nets to zero**.
- **Why the cap matters:** without it, a market spike >10% above contract would pay more than was locked and the ledger would go negative.

**Dispute freeze:** `releaseAdvance`, `releaseMilestone`, `settleEscrow` each throw **423 Locked** while `dispute_status='open'`. Reads and accept aren't frozen.

**The 53-assertion test (`npm test`)** proves 6 invariants across 7 market scenarios: (1) conservation `released+refund≈total_locked`; (2) `gross ≤ total_locked`; (3) farmer paid == gross; (4) higher-of, capped; (5) non-negativity; (6) farmer ≥ contract value. Includes a **path-independence** pair (same settlement whether 1 or 5 milestones were pre-released).

### 7.2 XGBoost yield prediction
- **Model:** `XGBRegressor`, `reg:squarederror`, `tree_method="hist"`; **643 one-hot features**; target `log1p(yield_kg_ha)`, inverted with `expm1` (yield is right-skewed → log stabilizes variance).
- **Features:** 7 numeric (area, rainfall, t2m_max/min, humidity rh2m, wind ws2m, rainfall_temp_interaction) + ~636 one-hots (state/district/crop/season/soil/irrigation). Districts drive the column count.
- **Training:** `train_optimized.py` on ~247 k rows, 85/15 split, Optuna (20 trials).
- **Real metrics:** **R²=0.87, MAE≈25 k kg/ha, MAPE≈30%** — decision-support quality, honest (⚠️ the training guide's 0.99 is stale).
- **Confidence band:** per-crop historical 5th–95th percentile — **not** a model prediction interval (be honest).

### 7.3 OCR-based GPS verification (anti-fraud)
GPS-camera apps burn lat/long onto the photo. Backend chain: **EXIF (`exifr`) → OCR (`tesseract.js`) + regex parse → client-supplied fallback**, then **Haversine** distance to the farm's registered coords (itself from OCR of the registration doc); **≤ 500 m ⇒ `gps_verified`**. ⚠️ The milestone gate is "soft": a stage row must *exist* to release, but `gps_verified=false` is recorded/shown, not hard-blocked.

### 7.4 RAG chatbot + agentic negotiator
- **RAG:** 10-doc policy KB; keyword-overlap scoring → top-3 into the system prompt → answers grounded in platform policy (English/Kannada; last-8 memory). Honest trade-off: production would use pgvector + embeddings.
- **Agentic negotiator:** Groq **function/tool calling** loop (MAX_ITER=5) with 3 tools (`get_market_price`, `get_ai_predicted_yield`, `suggest_counter_offer`); backend executes tools against Postgres and feeds results back until the model recommends accept-or-counter.

### 7.5 Live market data + resilience
Official data.gov.in Agmarknet feed; government **modal price**; widen district→state→national; **4-tier fallback** (cache→live→last-verified→simulated) with honest `source` labels shown in the UI; node-cron 6 AM IST refresh + boot self-heal. ⚠️ Real-world note: the feed intermittently returns 502s/timeouts; hardening (small page, 1 retry, longer per-attempt timeout) maximizes live capture, and recovery is automatic — a strong "diagnosing a flaky external dependency" story.

### 7.6 PWA / offline-first
vite-plugin-pwa service worker + installability; Dexie/IndexedDB caches reads and queues text-only writes (optimistic UI, 3-retry sync ~1.5 s after reconnect); SyncStatusBar + InstallPrompt. The `@layer base` reset is the load-bearing detail that keeps buttons opaque after the Tailwind removal.

---

# 8. DATABASE SCHEMA

**20 tables**, three hand-run idempotent migrations **in order**: `schema.sql` → `market_schema.sql` → `escrow_schema.sql` (escrow last because it retrofits constraints).

Core spine:
```
users (farmer|buyer|admin)
 ├──< listings         (AI predicted_yield + confidence; farm lat/long)
 │      ├──< crop_stages   (gps_verified, distance_from_farm)
 │      └──< crop_updates
 │      └──< prediction_history
 └──< contracts        (buffer_pct default 10; dispute_status)
        └──1:1 escrow   (buffer_pct default 110; total_locked; released/refunded)
              ├──< escrow_milestones  (UNIQUE(contract_id, milestone_order))
              └──< escrow_ledger      (append-only, running_balance, payment_ref)
market_prices (UNIQUE crop+state+district+market+date) · market_scrape_log
notifications · reviews (1–5 CHECK, UNIQUE contract+reviewer) · watchlist
idempotency_keys (key UNIQUE, result JSONB) · chatbot_messages · rag_documents
crop_health_tips · negotiation_log · prediction_log
```
Key integrity: escrow is **1:1 with contracts** (duplicate-checked under lock); `escrow_milestones` UNIQUE makes seeding idempotent; `contracts.buffer_pct=10` is the *margin* while `escrow.buffer_pct=110` is the *locked %* (deliberate difference). ⚠️ The `market_prices` seed in `schema.sql` has no conflict target — "run once on a fresh DB."

---

# 9. HONEST CAVEATS — KNOW THESE COLD

Knowing your system's limits is a strength; inflated claims that unravel are the real risk.

1. **Payments are mocked** (`MOCK-…` refs). Say: *"the escrow state machine, accounting, and concurrency safety are fully real; only the gateway call is simulated."*
2. **Model R²≈0.87, MAPE≈30%** (not 0.99) — decision-support, not precision. Quote `model_metadata.json`.
3. **Confidence band = historical percentile**, not a model interval.
4. **GPS verification is OCR-based** (reads stamped text), not EXIF-primary; the milestone GPS gate is "soft."
5. **Route guards are client-side + some endpoints are public** (`/upload`, `/updates/*` have no auth) — real enforcement is the server JWT check; a missed page guard = an unprotected page.
6. **OTP uses `Math.random`** (not `crypto`), stored plaintext, compared non-constant-time; **enumeration** protected only on forgot-password.
7. **Two AI-call paths + a dead route**: live is `/predict/dynamic`; `aiService.js`→`/predict` 404s.
8. **In-memory rate limiting** (per-process; won't hold behind horizontal scaling).
9. **No DB migration framework** (hand-run SQL); **no centralized error handler**.
10. **Stale files to not cite as live:** `TRAINING_GUIDE.md`, `feature_template.py`, `preprocess.py`, `climate_service.py`, `evaluate.py`.

**Great "what would you improve" answers:** real payment gateway; pgvector embeddings for RAG; per-crop models + real prediction intervals; server-side route guards everywhere + input validation; `crypto` OTP + constant-time compare + consistent anti-enumeration; a migration framework; Redis-backed shared rate limiting; consolidate the two AI-call paths; E2E tests around contract→settlement.

---

# 10. INTERVIEW QUESTION BANK (WITH ANSWERS)

### Overview / system design
- **What is AgriChain / what problem does it solve?** → §1.
- **Walk the end-to-end flow.** → §4 (10 steps).
- **Draw the architecture; why four services?** → §2 (language/dependency seam; independent scale/deploy; graceful degradation).
- **Hardest part / proudest of?** → the escrow concurrency engine (§7.1).

### Frontend
- **How do you protect routes / handle auth client-side?** → localStorage JWT + per-page `useEffect` guards; the hard gate is the axios 401 interceptor; real enforcement is server-side.
- **How does offline mode work? What can't you do offline?** → Dexie cache for reads + a 3-retry mutation queue for **text-only** writes; photo uploads need connectivity.
- **Where do charts/maps appear?** → Recharts on Analytics/ModelMonitor/MarketPrices; Leaflet StageMap for GPS verification.
- **Why no state library?** → small app; localStorage session + local component state is sufficient; would add Context/Zustand if shared state grew.

### Backend / API
- **How is auth implemented? Why OTP + JWT + bcrypt?** → 7-day HS256 JWT `{id,role}`; bcrypt cost 10; email OTP proves address ownership without SMS cost; optional 2FA.
- **What is middleware? Examples?** → auth, role, validation, rate limiters; ordering (validateIdParam→auth→role).
- **File uploads / where stored?** → Multer memory buffers → Supabase Storage (service-role key, server-side).
- **Why SendGrid over SMTP?** → Render free tier blocks SMTP ports; SendGrid HTTPS API works on 443.

### Database & concurrency (expect deep probing)
- **Why PostgreSQL over NoSQL?** → relational money data + ACID + row/advisory locks.
- **What happens if a buyer double-clicks "release payment"?** → SERIALIZABLE + FOR UPDATE + advisory lock + idempotency key → the second request blocks then replays the cached result; a 409 guards already-released state. **Exactly-once.**
- **What is an isolation level; why SERIALIZABLE here?** → strictest; prevents interleaving anomalies in multi-row money moves.
- **Explain idempotency and your implementation.** → header key reserved via INSERT…ON CONFLICT, result cached, replayed on retry.
- **Explain the append-only ledger; why does it net to zero?** → immutable INSERTs with running_balance; `released + refund = total_locked`.
- **Why 110% and why cap the payout at it?** → buffer is market-upside headroom; the `min(…)` cap keeps payout ≤ locked so the ledger can't go negative.

### ML
- **What does the model predict, and what algorithm?** → yield kg/ha; XGBoost regressor.
- **Features? Why one-hot? Why 643 columns?** → farm inputs + district climate + interaction term; districts/crops one-hot dominate the column count.
- **Accuracy?** → R²≈0.87, MAE≈25 k kg/ha, MAPE≈30% — honest, from metadata.
- **Why log-transform the target?** → yield is right-skewed; log stabilizes variance; invert with expm1.
- **How is the confidence band computed?** → per-crop 5th/95th percentile (not a model interval).
- **How would you improve it?** → per-crop models, better features, real prediction intervals, tackle the ~30% MAPE.

### GenAI
- **What is RAG; how did you implement it?** → keyword retrieval over 10 policy docs → top-3 grounding.
- **Keyword vs vector retrieval trade-offs?** → keyword needs no embedding model and nails a small fixed KB; pgvector + embeddings for semantic recall at scale.
- **What is function calling; walk the negotiator loop.** → LLM returns a structured tool request; backend executes against Postgres; loop (≤5) until it recommends accept/counter.

### Security & scaling
- **How do you protect secrets?** → env vars only, gitignored, placeholders in `.env.example`, rotate leaked keys via dashboards.
- **Security weak spots + fixes?** → client-side guards + public endpoints → enforce server-side; `crypto` OTP + constant-time compare; consistent anti-enumeration.
- **Scale to 100 k users?** → stateless API + horizontal scale; DB read replicas + pooling; cache market prices; queue heavy jobs (OCR/AI); CDN for images; Redis-backed rate limiting.

### Behavioral / project
- **What would you do differently?** → §9 improvements.
- **A bug you debugged?** → the "Market Prices stuck on simulated" investigation: proved across three networks the data.gov.in feed itself was returning 502s/timeouts (not our key/code), then hardened the fetch and confirmed the fix live in Render logs.

---

# 11. RÉSUMÉ — THE LINES TO USE

*(Honest & strong: every bullet is backed by real code and survives follow-up questions. Pick 4–6 that fit your space; lead with escrow + ML.)*

### Project title line
> **AgriChain — AI-powered agri-commerce platform** · React (PWA) · Node/Express · Python (FastAPI) · PostgreSQL · *(deployed on Vercel + Render + Supabase)*

### Bullets (strongest first)
- Built a **full-stack agri-commerce platform** (React PWA + Node/Express + Python FastAPI + PostgreSQL) deployed across Vercel, Render, and Supabase, connecting farmers and buyers through AI-backed contracts and milestone escrow.
- Engineered a **concurrency-safe escrow payment engine** using PostgreSQL **SERIALIZABLE transactions, row-level + advisory locks, and idempotency keys** to guarantee exactly-once, never-over-released fund movements; proved correctness with a **53-assertion money-math test suite**.
- Trained and served an **XGBoost crop-yield regressor** (**643 features, R²=0.87** on ~247k records) as an **independent FastAPI microservice**, integrated with the Node backend over HTTP for real-time yield estimates at listing creation.
- Implemented **GPS-verified milestone payouts**: OCR (Tesseract.js) extracts coordinates stamped on crop-stage photos, validated within **500 m** of the registered farm via the **Haversine formula**, gating stage-wise fund release.
- Integrated the **Government of India (data.gov.in) mandi price API** for **market-linked settlement** (higher of contracted vs live price, buffer-capped), with a resilient 4-tier fallback and a node-cron daily refresh.
- Built a **Groq-LLM RAG chatbot** (keyword retrieval over a policy knowledge base) and an **agentic negotiation assistant** using **function/tool-calling** (multi-step tool loop over live DB data).
- Designed an **offline-first PWA** (Dexie/IndexedDB queue + service worker) so rural users can browse and record updates without connectivity and **auto-sync on reconnect**.
- Secured the platform with **JWT auth, bcrypt hashing, email-OTP verification + optional 2FA, role-based access control, and per-route rate limiting**.

### Tight 3-bullet version (space-constrained)
- Full-stack AI agri-marketplace (React PWA · Node/Express · Python FastAPI · PostgreSQL) deployed on Vercel/Render/Supabase.
- Concurrency-safe milestone **escrow engine** (SERIALIZABLE + advisory locks + idempotency keys), verified by a 53-assertion test suite; **market-linked settlement** via the data.gov.in mandi API.
- **XGBoost yield model** (R²=0.87, ~247k records) served as a FastAPI microservice; **GPS-verified** stage payouts (Tesseract OCR + Haversine).

### Skills keywords (harvest for your Skills section)
React · Vite · PWA/Service Workers · IndexedDB · Node.js · Express · REST APIs · JWT · bcrypt · PostgreSQL · ACID/transactions · concurrency control · idempotency · Python · FastAPI · XGBoost · scikit-learn · pandas · Optuna · LLM/RAG · function calling · Tesseract OCR · geospatial/Haversine · microservices · Supabase · Vercel · Render · CI-of-one (unit tests).

### How to talk about metrics (honesty guardrails)
- Say **R²=0.87** (not 0.99); frame MAPE≈30% as "decision-support estimate."
- Say payments are a **realistic mock** — the accounting/concurrency is real.
- Say GPS is **OCR-based** and the milestone gate is "soft."
- Say RAG is **keyword retrieval** (pgvector is the scale-up).

---

# 12. THE 90-SECOND NARRATION SCRIPT

> "AgriChain connects farmers and buyers with three trust mechanisms: AI yield prediction, GPS-verified progress, and market-priced escrow.
>
> A farmer signs up — bcrypt-hashed password, email-OTP verified, JWT issued — and lists a crop. That triggers my Node backend to call a separate **Python FastAPI service** running an **XGBoost** model on the farm's inputs plus its district climate, returning a yield estimate in tonnes with a confidence band.
>
> A buyer browses and sends a forward contract — quantity, price, and a buffer percentage. When the farmer accepts, the backend creates an **escrow inside a SERIALIZABLE transaction**: it locks 110% of the value and seeds a five-step release schedule. Every rupee is an append-only ledger entry, and every operation is guarded by advisory locks and idempotency keys, so money can never be double-paid.
>
> The buyer releases a 15% advance. As the crop grows, the farmer uploads a **GPS-tagged photo per stage** — OCR reads the coordinates, Haversine checks they're within 500 m of the farm — and the buyer releases each milestone in order, only once that stage is proven.
>
> At harvest it **settles against the live government mandi price** from data.gov.in: the farmer gets the higher of contracted or market, capped at the locked funds, and any leftover buffer refunds to the buyer. Both sides review each other.
>
> It's a **React PWA** that works offline, with a **Groq-powered RAG chatbot** grounded in the platform's own policies. Four services — React, Node, Python, Postgres — split along real boundaries so each can scale and fail independently."

Then stop and let them ask — §10 covers every follow-up.

---

# 13. GLOSSARY

**Escrow** neutral fund hold released on conditions · **Idempotency** same request twice = same effect as once · **ACID / SERIALIZABLE** transaction guarantees; strictest isolation · **Row lock (`FOR UPDATE`) / advisory lock** DB concurrency controls · **RAG** retrieve relevant text, feed to the LLM as grounding · **Function/tool calling** LLM returns a structured call you execute and return · **One-hot encoding** category → 0/1 columns · **R²/MAE/MAPE** variance explained / avg absolute error / avg % error · **Haversine** great-circle distance between two lat/longs · **PWA / service worker / IndexedDB** installable app / offline background script / in-browser DB · **Modal price** the government's most-traded price.

---

# 14. CHEAT SHEET — NUMBERS TO MEMORIZE

| Thing | Value |
|---|---|
| Services | **4** (React · Node · Python · Postgres) |
| Backend endpoints | **79** across **20** routers |
| Frontend routes / pages | **28 routes / 26 pages / 7 components** |
| DB tables | **20** |
| JWT expiry | **7 days**, payload `{id, role}` |
| bcrypt cost | **10** · OTP **6-digit / 10-min** |
| Buffer | **110%** locked (margin clamp **5–25%**, default **10**) |
| Milestone schedule | 15 / 15 / 20 / 20 / 10 = **80%** progressive |
| GPS gate | **≤ 500 m** (Haversine, R=6 371 000 m) |
| Model | **XGBoost**, **643 features**, **R²=0.8742**, MAE≈**25 061 kg/ha**, MAPE≈**29.79%**, ~**247k** rows |
| Market feed | data.gov.in Agmarknet, **modal_price**, 4-tier fallback, cron **6 AM IST** |
| Escrow test | **53 assertions**, 6 invariants, 7 scenarios |
| Rate limits | api 60/min · auth 10/15min · chat 20/min |
| Python pin | **3.12.4** (render.yaml) |

---

*End of AgriChain Master Guide. Follow the code over any older doc. Never commit real secret values — reference env vars by name only.*
