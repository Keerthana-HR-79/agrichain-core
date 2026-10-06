# AgriChain — Complete Project Explanation (Interview / Review Study Guide)

> A single, honest, end-to-end reference for defending this project. Everything here is drawn from the actual code, not marketing.

---

## 0. The 30-second elevator pitch

> "AgriChain is an **AI-powered crop-lifecycle marketplace for Indian agriculture**. A farmer lists a crop; a machine-learning model (XGBoost) predicts the yield using the farm's real climate data; a buyer places a forward contract; the buyer's money is locked in an **ACID-safe escrow with a 110% buffer**; funds are then released to the farmer **stage-by-stage as each crop growth stage is proven with a GPS-verified photo**; and at harvest the contract is **settled against live government mandi prices** so the farmer always gets the fairer of the contracted or market price. It's built as **four separate services** — a React PWA frontend, a Node/Express API, a Python FastAPI ML service, and PostgreSQL — with a Groq-powered RAG chatbot on top."

That single sentence contains every "wow" feature. Everything below is the detail behind it.

---

## Table of contents
1. The problem it solves
2. The complete tech stack (with *why this, not that*)
3. System architecture — the four services & how they connect
4. The end-to-end flow (the one coherent story)
5. Subsystem deep-dives
   - 5.1 Authentication (JWT + bcrypt + OTP + optional 2FA)
   - 5.2 AI yield prediction (XGBoost)
   - 5.3 Escrow — the crown jewel (ACID money movement)
   - 5.4 Market prices (data.gov.in)
   - 5.5 GPS crop-stage verification
   - 5.6 RAG chatbot (Groq)
   - 5.7 PWA / offline-first
6. Database schema & relationships
7. Problems faced & how they were solved
8. Anticipated interview questions & answers
9. The narration script — how to explain the flow out loud

---

## 1. The problem it solves

Indian farmers face three chronic problems this app targets:
- **Price uncertainty & exploitation** — farmers often sell at whatever price a middleman offers, with no visibility into the real mandi (market) price.
- **No trust between farmer and buyer** — a buyer paying in advance risks the farmer not delivering; a farmer risks the buyer not paying. Neither trusts the other online.
- **No yield visibility** — buyers can't tell if a listing is real or how much a field will actually produce.

AgriChain's answers, one-to-one:
- **Live mandi price settlement** — payouts track the official government price feed, not a middleman's number.
- **Escrow with GPS-verified, stage-based release** — money is locked up front and released only as the farmer *proves* progress from the actual farm location. Neither side can cheat.
- **ML yield prediction + confidence band** — every listing carries a data-backed yield estimate.

---

## 2. The complete tech stack (with *why this, not that*)

| Layer | Technology | Why it was chosen | Why not the alternative |
|---|---|---|---|
| **Frontend** | React 18 + Vite | Component model; Vite gives instant HMR and a tiny fast build. | **Not Create-React-App** (deprecated, slow). **Not Next.js** — no SSR/SEO need; this is an authenticated app, so a pure SPA + PWA is simpler to reason about and host. |
| **Frontend styling** | Plain hand-written CSS (per-area files) | I can read and defend every line; no build-time magic. | **Migrated off Tailwind** deliberately so the styling is defensible in a review (see §7). |
| **Offline** | PWA (vite-plugin-pwa) + Dexie (IndexedDB) | Farmers have patchy rural connectivity; the app queues actions offline and syncs later. | Plain localStorage can't hold structured queued mutations; Dexie wraps IndexedDB cleanly. |
| **Backend API** | Node.js + Express | Same language as the frontend (one mental model), huge ecosystem, non-blocking I/O ideal for an I/O-bound API (DB + HTTP calls). | **Not Django/Spring** — heavier; I didn't need an ORM/DI framework, and keeping JS end-to-end lowered context-switching. |
| **ML service** | Python + FastAPI | Python **is** the ML ecosystem (XGBoost, pandas, scikit-learn, joblib). FastAPI adds async, Pydantic request validation, and auto-generated Swagger docs. | **Not doing ML in Node** — the mature ML libraries are Python. **Not Flask** — FastAPI is async and gives typed validation + `/docs` for free. |
| **ML model** | XGBoost (gradient-boosted trees) | State-of-the-art for **tabular** data; captures non-linear feature interactions; trains fast; gives feature-importance for explainability. | **Not linear regression** — relationships are non-linear. **Not a neural net** — overkill for tabular data, needs far more data, harder to explain in a review. |
| **Database** | PostgreSQL | The data is **relational** (users→listings→contracts→escrow→ledger) and the money flow **requires ACID transactions, row locking, `SERIALIZABLE` isolation and advisory locks** — all first-class in Postgres. | **Not MongoDB** — multi-document money movements can't be made safe as cleanly; I need real transactions and foreign keys. |
| **Managed DB + file storage** | Supabase | One free platform gives **managed Postgres** *and* **object storage** (for crop/farm images). | **Not Firebase** — its Firestore is NoSQL (wrong fit for relational money data). |
| **LLM (chatbot)** | Groq (`openai/gpt-oss-20b`) | Free tier, extremely fast inference (LPU hardware), and an **OpenAI-compatible** API so the client code is standard. | **Not OpenAI/Anthropic paid APIs** for a student demo — Groq's free tier keeps cost at ₹0. |
| **Auth** | JWT + bcrypt | **Stateless** tokens work naturally across separated services; bcrypt is the standard for password hashing. | **Not server-side sessions** — would need shared session storage across services; JWT avoids that. |
| **Market data** | data.gov.in Agmarknet API | Official Government of India open-data mandi feed — legal, structured, and credible in a review. | **Not scraping websites** — brittle and legally grey; an official API is defensible. |
| **Scheduling** | node-cron (in-process) | Refreshes prices daily at 6 AM IST without any external job runner. | **Not a separate cron service / Celery** — unnecessary infrastructure for one daily job. |
| **PDF** | contract PDF generation | Buyer & farmer get a downloadable contract document. | — |

**The single most important architectural decision to be able to defend:** *why four separate services instead of one monolith.*
> "The ML service has heavy Python dependencies (XGBoost, pandas, numpy) that have nothing to do with serving an API. Keeping it separate means the Node API stays lightweight, the two can be **scaled and deployed independently**, and a crash or cold-start in the ML service degrades gracefully — the Node backend catches the failure and continues. It's a clean microservice boundary along a real language/dependency seam."

---

## 3. System architecture — the four services & how they connect

```
                    ┌───────────────────────────┐
                    │   Browser (React PWA)      │
                    │   - Dexie offline queue    │
                    └────────────┬──────────────┘
                                 │  HTTPS, JWT in Authorization header
                                 │  (calls ONLY the backend: VITE_API_URL)
                                 ▼
                    ┌───────────────────────────┐
                    │  Node/Express API  :5000   │
                    │  - auth, listings,         │
                    │    contracts, escrow,      │
                    │    market prices, chatbot  │
                    └───┬───────────┬────────┬───┘
        AI_SERVICE_URL  │           │        │
        (axios)         │           │        │ Groq REST (chatbot + agent)
                        ▼           │        ▼
        ┌───────────────────────┐   │   ┌──────────────────────┐
        │ Python FastAPI  :8000 │   │   │  Groq LLM API        │
        │ - XGBoost yield model │   │   │  (OpenAI-compatible) │
        │ - climate lookup      │   │   └──────────────────────┘
        │ - reads local CSVs    │   │
        └───────────────────────┘   │  pg driver + Supabase SDK
                                     ▼
                    ┌───────────────────────────┐
                    │  PostgreSQL (Supabase)     │
                    │  + Supabase Storage        │
                    │    (listing/stage/profile  │
                    │     images)                │
                    └───────────────────────────┘
```

**Connection facts (exact):**
- **Frontend → Backend only.** The React app's API layer (`frontend/src/lib/api.js`) reads `VITE_API_URL` and appends `/api`. It attaches the JWT from `localStorage` on every request and auto-logs-out on a `401`. The frontend never talks to the ML service or DB directly.
- **Backend → ML service** over HTTP via `AI_SERVICE_URL`, in three places: `services/aiService.js` (`/predict`), `controllers/listingController.js` (`/predict/dynamic`, used at listing creation), `controllers/agentController.js` (`/climate/...`).
- **Backend → PostgreSQL** via the `pg` connection pool (`config/db.js`), with `DB_SSL` toggled on for hosted Postgres.
- **Backend → Supabase Storage** via the Supabase SDK (`config/supabase.js`) for image uploads (listings, crop-stage photos, profile pictures).
- **Backend → Groq** via REST for the chatbot and the negotiation agent.
- **ML service → local CSVs + model files only.** It needs **no secrets and no network** — it reads `agrichain_feature_matrix.csv` and the `.pkl` model at startup.

---

## 4. The end-to-end flow (the one coherent story)

This is the spine of the whole project. Learn these 10 steps cold.

**① Sign up & verify** — A user registers as *farmer* or *buyer*. Password is bcrypt-hashed; a 6-digit OTP is emailed. On OTP verification the account is marked verified and a JWT (7-day) is issued (auto-login). *(Auth: `authController.js`)*

**② Farmer creates a listing** — Farmer enters crop, land size (acres), state/district, soil type, irrigation method, season, and uploads a farm photo (stored in Supabase Storage). *(`listingController.js`)*

**③ AI predicts the yield** — At listing creation the backend POSTs the farm details to the Python service's `/predict/dynamic`. The service pulls the district's **climate data**, builds a feature row that matches the trained model's columns exactly, runs **XGBoost**, and returns predicted yield in **tonnes with a confidence band**. This is saved on the listing. *(`inference.py`, `app.py`)*

**④ Buyer browses & offers a contract** — Buyer finds a listing and submits a contract request: quantity (tonnes), offered price (₹/quintal), delivery date, message, and **chooses a buffer %** (5–25%, default 10%). *(`contractController.js`)*

**⑤ Farmer accepts → escrow is created** — On acceptance, `createEscrowOnAccept` runs inside a transaction: it computes `contract_value = quantity × price × 10`, locks **`contract_value × (1 + buffer)`** (e.g. 110%), writes the escrow row, seeds the **stage-based milestone schedule**, and writes the first **ledger** entry (`buffer_locked`). *(`escrowController.js`)*

**⑥ Buyer releases the 15% cultivation advance** — From the Escrow page the buyer releases the advance so the farmer can fund seeds/labour. This is idempotent, row-locked, and appends an `advance_released` ledger entry + notifies the farmer.

**⑦ Farmer proves growth stages with GPS photos** — As the crop grows, the farmer uploads a photo per stage (Sowing → Vegetative Growth → Flowering → Pre Harvest). OCR extracts the photo's GPS coordinates; the **Haversine distance** from the registered farm is computed; within **500 m → "GPS Verified" (green)**, else "GPS Mismatch". *(`cropStageController.js`, GPS policy)*

**⑧ Buyer releases stage milestones** — For each proven stage the buyer releases that milestone (15% + 20% + 20% + 10%). Releases are **ordered** (can't skip) and **stage-gated** (the matching stage photo must exist). Each is a ledger entry + farmer notification.

**⑨ Harvest → market-based settlement** — At harvest the buyer enters (or auto-fills from the mandi API) the live market price. The engine pays the farmer **the higher of contracted vs market price**, capped at the locked funds; any leftover buffer is **refunded to the buyer**. Contract → `completed`. *(`settleEscrow`)*

**⑩ Reviews** — Both parties leave a star rating/review; ratings roll up onto user profiles.

Throughout, a **Groq-powered RAG chatbot ("AgriBot")** answers questions about the platform and Indian farming, grounded in an internal knowledge base.

---

## 5. Subsystem deep-dives

### 5.1 Authentication — `authController.js`
- **Hashing:** `bcrypt.hash(password, 10)` (10 salt rounds). Passwords are never stored or returned in plaintext (stripped from every response).
- **Token:** `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })`. Middleware (`authMiddleware.js`) verifies it; `roleMiddleware.js` enforces role (e.g. only `buyer` can release funds).
- **Signup flow:** create user (unverified) → email 6-digit OTP (10-min expiry) → `verifySignupOTP` marks verified, clears OTP, auto-logs-in.
- **Login flow:** password-only by default. If `two_factor_enabled`, it emails a login OTP and requires `verifyLoginOTP`. If the email was never verified, it re-sends the signup OTP.
- **Forgot password:** OTP-based reset. **Security detail worth mentioning:** the endpoint returns the *same* 200 response whether or not the email exists — this prevents **email enumeration**.
- **Why OTP by email, not SMS:** free, no SMS gateway/cost, and proves address ownership.

### 5.2 AI yield prediction — `ai-service/src/inference.py`, `app.py`
- **Model:** an **XGBoost regressor**, trained offline (`train_optimized.py`) on Indian crop production data joined with NASA climate data. Loaded once at API startup; the service **fails hard** if the model file is missing (loud, obvious error).
- **The model predicts log-yield.** Training used a log transform on `yield_kg_ha` (yield is right-skewed), so at inference the raw output is inverted with `np.expm1(...)` and floored at 0. *(Good talking point: log transform stabilises variance for skewed targets.)*
- **Feature engineering (the important part):** `_build_feature_row` reconstructs a row that matches `model_columns.pkl` **exactly** the way training did:
  - **Numeric:** `area` (acres → hectares × 0.4046856), `annual_rainfall`, `t2m_max`, `t2m_min`, `rh2m` (humidity), `ws2m` (wind), `year`, and a derived `rainfall_temp_interaction = rainfall / (t2m_max + 1)`.
  - **Categorical (one-hot):** state, district, crop, season, soil_type, irrigation_method — matched case-insensitively to the training columns; an **unseen category is left all-zero** (treated as baseline) instead of crashing.
- **Climate data** comes from `climate_service_v2.get_climate_data(state, district)`, read from the feature-matrix CSV.
- **Output:** `predicted_yield_kg_ha`, `total_tonnes = yield_kg_ha × area_ha / 1000`, and a **confidence band** = the per-crop **5th/95th percentile** of yield from the training data (falls back to ±15% if a crop is unseen).
- **Metrics exposed** at `/` and `/model/info`: **R²**, **MAE (kg/ha)**, **MAPE (%)** from `model_metadata.json`, plus top feature importances.

### 5.3 Escrow — the crown jewel — `escrowController.js`
This is where the strongest engineering is. Five safety mechanisms work together:

1. **`SERIALIZABLE` transactions** — every money operation runs in the strictest isolation level (`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`), wrapped by a `withTransaction` helper that auto-commits/rolls-back and releases the connection.
2. **`SELECT … FOR UPDATE`** — the escrow/contract rows are row-locked so concurrent requests **queue** instead of racing.
3. **`pg_advisory_xact_lock(contract_id)`** — an application-level mutex keyed on the contract, so only **one** escrow operation runs per contract at a time **even across multiple Node processes** hitting the same DB.
4. **Idempotency keys** — the client sends an `X-Idempotency-Key` header; the first call reserves it, and a **retry returns the cached result** instead of paying twice.
5. **Append-only ledger** — every money movement is a single `INSERT` into `escrow_ledger` (never an `UPDATE`), giving an immutable, double-entry-style audit trail.

**The money math (know these formulas):**
- `contract_value = quantity(tonnes) × offered_price(₹/quintal) × 10`  *(10 quintals = 1 tonne)*
- `buffer_frac = clamp(buffer_pct/100, 0.05, 0.25)` — default 0.10
- `total_locked = contract_value × (1 + buffer_frac)` — e.g. 110%
- `advance_amount = contract_value × 0.15` (15%)
- **Milestone schedule** (% of contract value): Advance 15 → Sowing 15 → Vegetative 20 → Flowering 20 → Pre-Harvest 10 = **80% released progressively**; the remaining ~20% + buffer resolves at settlement.

**Market settlement soundness (the subtle bit):**
- Farmer is paid `max(offered, market) × quantity`, **but capped at `total_locked`** (`Math.min`). The buffer *is* the market-upside headroom — so a payout can never exceed what the buyer actually locked. This keeps the escrow provably sound (**payout ≤ locked**) and the ledger nets to zero.
- Leftover (`total_locked − gross_payment`) is refunded to the buyer with a `refund` ledger entry.
- **A 53-assertion money-math test** (`backend/tests/escrow_math.test.js`, `npm test`) proves these invariants.

**Dispute freeze:** if `contracts.dispute_status = 'open'`, every fund-moving operation (advance / milestone / settle) throws **HTTP 423 (Locked)** until an admin resolves it.

**HTTP status codes used as guards:** 404 (escrow/contract not found), 409 (already released — duplicate blocked), 400 (contract not accepted / wrong milestone order / stage not uploaded), 423 (dispute open).

### 5.4 Market prices — `services/marketScraper.js`, `services/cronJobs.js`
- **Source:** data.gov.in Agmarknet resource `9ef84268-…`. Uses **`modal_price`** (the government's "most-traded" price — the correct one to use).
- **Resilient fallback chain** (`getLatestPrice`): fresh cache (< 25 h) → live API scoped to farmer's district → widen to state → widen to national → last verified price → **deterministic simulated price** (±5% seeded by the date, so it's stable for a given day).
- **Honest labelling** — every row carries a `source`: `data_gov` (live), `data_gov_cached` (last verified), `simulated`, or `default`/`admin`. The UI shows this, so nothing is passed off as live when it isn't.
- **Refresh triggers:** node-cron **daily at 6 AM IST**; a **startup self-heal** fetch if today's prices are still only seed rows; and an **admin manual trigger** (`POST /api/market-prices/scrape`).
- **The shared key** shipped as a fallback is data.gov.in's *public documented sample key* (safe to commit, but rate-limited). A personal `DATA_GOV_API_KEY` in env raises the limit.

### 5.5 GPS crop-stage verification
- Farmers photograph each stage with a GPS-camera app that stamps coordinates into the image.
- **OCR** (tesseract.js) reads the lat/long text from the photo; the **Haversine formula** computes distance to the registered farm; **< 500 m ⇒ verified**.
- **Why this matters:** it cryptographically-cheaply proves an update came from the real field, which is exactly what a remote buyer needs before releasing a stage payment. It's the trust anchor that makes stage-based release meaningful.

### 5.6 RAG chatbot ("AgriBot") — `ragController.js`
- **LLM:** Groq, `openai/gpt-oss-20b`, via the OpenAI-compatible `/chat/completions` endpoint.
- **RAG without a vector DB:** a 10-document internal **knowledge base** (GPS policy, contract/escrow policy, seasons, soils, irrigation, FAQs, crop diseases…). Retrieval is **keyword-overlap scoring**, returning the top-3 relevant docs, which are injected into the system prompt.
  - *Why keyword, not embeddings:* it needs no GPU/embedding model, runs anywhere, and for a fixed small policy KB it reliably retrieves the exact policy text. (Honest about the trade-off: I'd move to pgvector + embeddings at scale.)
- **Grounding:** the system prompt instructs the model to answer *from the retrieved context first*, fall back to general Indian-agriculture knowledge, never invent policy, route payment disputes to support, and reply in the user's language (English/Kannada).
- **Memory:** last 8 messages of the user's history are included; every turn is persisted to `chatbot_messages`.

### 5.7 PWA / offline-first
- **vite-plugin-pwa** provides the service worker + installability (there's an `InstallPrompt` component and a `SyncStatusBar`).
- **Dexie (IndexedDB)** backs an offline queue (`lib/offlineQueue.js`, `lib/offlineApi.js`): actions taken offline are queued and synced when connectivity returns — important for rural users.

---

## 6. Database schema & relationships

Core relational spine (all in `schema.sql`, hand-run migrations: `schema.sql` → `market_schema.sql` → `escrow_schema.sql`):

```
users (farmer | buyer | admin)
  │
  ├──< listings            (a farmer's crop listings; carries AI predicted_yield + confidence)
  │       │
  │       ├──< crop_stages   (GPS-verified stage photos; Haversine distance_from_farm)
  │       └──< crop_updates  (extra photos/notes within a stage)
  │
  └──< contracts           (buyer↔farmer forward contract; buffer_pct, dispute_status)
          │
          └──1:1─ escrow    (advance/pending/buffer/total_locked; status)
                    │
                    ├──< escrow_milestones  (the 5-step release schedule)
                    └──< escrow_ledger      (append-only money audit trail)

market_prices        (daily national + on-demand per-state prices; source label)
notifications        (per-user events)
reviews              (post-settlement ratings → users.avg_rating)
chatbot_messages     (AgriBot history)   rag_documents (KB)
idempotency_keys     (dedupe money ops)  prediction_log (model monitoring)
```

Key integrity choices: `escrow` is **1:1 with `contracts`** (enforced by a duplicate-check under lock); `escrow_milestones` has `UNIQUE(contract_id, milestone_order)` so seeding is idempotent; `idempotency_keys.key` is `UNIQUE`.

---

## 7. Problems faced & how they were solved

Interviewers love this section — it shows real engineering judgment.

1. **Race conditions on money release (double-click / retry pays twice).**
   *Solution:* the five-layer defence — `SERIALIZABLE` + `SELECT FOR UPDATE` + `pg_advisory_xact_lock` + idempotency keys + a `409` "already released" guard. A double-click now makes the second request block, observe `advance_released = true`, and return 409.

2. **Settlement could pay the farmer more than the buyer had locked** (if market price spiked).
   *Solution:* cap the payout at `total_locked` with `Math.min`, treat the buffer as the upside headroom, and refund any excess. Locked in with a **53-assertion money-math test** so the invariant `payout ≤ locked` can't regress.

3. **Market Prices page showed "Simulated" for every crop.**
   *Root cause:* the shared public data.gov.in sample key is globally rate-limited. *Solution:* register a personal `DATA_GOV_API_KEY`; plus the resilient fallback chain and honest `source` labels so the UI never lies about where a price came from.

4. **A fresh database showed only seed prices until the 6 AM cron ran.**
   *Solution:* a **startup self-heal** — on boot, if today's prices are still only seed rows, fire a background refresh (fire-and-forget, never blocks the server).

5. **Styling was in Tailwind, which I couldn't fully defend in a review.**
   *Solution:* converted ~28 pages/components to **plain, hand-written CSS**, batch-by-area with a build check after each batch, verified pixel-identical in the browser, then removed Tailwind entirely.

6. **The ML feature row must match the training columns exactly or predictions are garbage.**
   *Solution:* `_build_feature_row` rebuilds the row from the saved `model_columns.pkl`, one-hot-matching categories case-insensitively and leaving unseen categories at zero (baseline) rather than crashing.

7. **ML service URL was hardcoded to `127.0.0.1:8000` — fine locally, broken in the cloud.**
   *Solution:* made all three backend→ML call sites read `AI_SERVICE_URL` (with a localhost fallback), so the same code runs locally and deployed. *(This also fixed a latent bug where the env var was being used without its URL path.)*

8. **Graceful degradation when the ML service is down.**
   *Solution:* listing creation wraps the AI call in try/catch and continues with a 0/estimate rather than failing the whole listing — the microservice boundary degrades gracefully.

---

## 8. Anticipated interview questions & answers

**Q: Why microservices and not one app?**
A: The ML service has heavy Python-only dependencies and a different scaling profile. Splitting it along the language/dependency seam keeps the Node API lightweight, lets each scale/deploy independently, and lets the backend degrade gracefully if the model service is slow or down.

**Q: How do you guarantee money is never double-paid?**
A: Five layers — SERIALIZABLE isolation, `SELECT FOR UPDATE` row locks, a `pg_advisory_xact_lock` per contract (works across processes), idempotency keys that cache the first result, and explicit `409` guards on already-released state. Plus an append-only ledger so every rupee is auditable.

**Q: Why PostgreSQL over MongoDB here?**
A: The domain is relational and the money flow needs real ACID transactions across multiple rows/tables, row locking, and advisory locks. Postgres does all of that natively; a document store would make correctness much harder.

**Q: How does the yield model actually work?**
A: XGBoost regressor on tabular features — farm inputs (crop, land, soil, irrigation, season) plus the district's climate (rainfall, temperature, humidity, wind) and a rainfall/temperature interaction term. It predicts log-yield (target is skewed), which I invert with expm1, then scale by area to tonnes and attach a confidence band from the per-crop 5th/95th percentiles.

**Q: Is the market price real?**
A: Yes — it's the official data.gov.in Agmarknet mandi feed, using the government's modal (most-traded) price. If the API is unreachable I fall back to the last verified price and only then to a clearly-labelled simulated value; the UI always shows the source.

**Q: Is your RAG "real" RAG without a vector database?**
A: It's retrieval-augmented — I retrieve the top relevant policy documents by keyword overlap and ground the LLM in them. For a small fixed policy KB that's reliable and needs no embedding model. At scale I'd swap the retriever for pgvector + embeddings; the grounding architecture stays the same.

**Q: What about the 110% buffer — where does the extra 10% go?**
A: It's locked upfront as headroom so the farmer can be paid the *higher* of contracted or market price at settlement without the buyer having to top up. Whatever isn't needed is refunded to the buyer. It's capped so the escrow can never pay out more than was locked.

**Q: How do you stop fake crop updates?**
A: GPS verification — the stage photo carries embedded coordinates, OCR reads them, and Haversine distance to the registered farm must be under 500 m to count as verified. Stage payments are gated on this.

**Q: What would you improve / what are the limits?**
A: Real payment gateway (currently a mock reference), pgvector embeddings for the chatbot, moving migrations to a framework (currently hand-run SQL), rate-limiting the model service, and adding automated E2E tests around the full contract→settlement path (the money math is already unit-tested).

---

## 9. The narration script — how to explain the flow out loud

Practice saying this in ~90 seconds:

> "AgriChain connects farmers and buyers with three trust mechanisms: AI yield prediction, GPS-verified progress, and market-priced escrow.
>
> A farmer signs up — bcrypt-hashed password, email-OTP verified, JWT issued — and lists a crop. When they do, my Node backend calls a separate **Python FastAPI service** that runs an **XGBoost** model on the farm's inputs plus its district climate data, and returns a yield estimate in tonnes with a confidence band.
>
> A buyer browses, and sends a forward contract — quantity, price, and a buffer percentage. When the farmer accepts, the backend creates an **escrow inside a SERIALIZABLE transaction**: it locks 110% of the contract value and seeds a five-step release schedule. Every rupee movement is an append-only ledger entry, and every operation is guarded by advisory locks and idempotency keys so money can never be double-paid.
>
> The buyer releases a 15% cultivation advance. Then, as the crop grows, the farmer uploads a **GPS-tagged photo per stage** — OCR reads the coordinates, Haversine checks they're within 500 m of the registered farm — and the buyer releases each stage's milestone, in order, only once that stage is proven.
>
> At harvest, the contract **settles against the live government mandi price** from data.gov.in: the farmer gets the higher of the contracted or market price, capped at the locked funds, and any leftover buffer is refunded to the buyer. Both sides then review each other.
>
> The whole thing is a **React PWA** that works offline, and there's a **Groq-powered RAG chatbot** grounded in the platform's own policy docs. It's four services — React, Node, Python, Postgres — split along real boundaries so each can scale and fail independently."

Then stop and let them ask. Every follow-up they can throw at you is answered in §8.

---

*Prepared as an interview/review study reference. All mechanisms described are implemented in the codebase; the payment gateway is a deterministic mock (`MOCK-…` references) by design.*
