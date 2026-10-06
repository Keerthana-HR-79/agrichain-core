# AGRICHAIN — COMPLETE PROJECT KNOWLEDGE

> **How to use this file**
> 1. **As a context primer:** paste this entire document into a new AI chat and it will have full, accurate knowledge of the AgriChain project — architecture, data model, every feature, and how the pieces connect.
> 2. **As your study guide:** read top to bottom. Sections 1–9 explain *what the project is and how it works*; Section 10 is a *learning roadmap* (what to study, in order); Section 11 is an *interview question bank*; Section 12 lists *honest caveats* you must know so you're never caught out.
>
> Everything here was read directly from the source code (Sept 2026), so where the code and the old docs disagree, **this file follows the code.**

---

## 1. WHAT THE PROJECT IS (plain language)

**AgriChain** is a full-stack platform that lets **farmers** sell crops directly to **buyers** through digital contracts, with three things that make it more than a marketplace:

- an **AI model** that predicts how much a farmer's crop will yield,
- a **milestone-based escrow** that holds the buyer's money and releases it to the farmer stage-by-stage as the crop is proven to be growing (verified by GPS-stamped photos), and
- a **market-linked settlement** that pays the farmer the *higher* of the agreed price or the live government mandi price at harvest.

There is also an **AI chatbot (AgriBot)** for farming questions, an **AI negotiation agent**, live market prices, reviews, notifications, an admin panel, and it works as an **offline-capable installable app (PWA)** — important for rural users with poor connectivity.

**One-line pitch:** *A farm-to-buyer contract platform with AI yield prediction, GPS-verified stage-based escrow payments, and market-linked settlement.*

---

## 2. THE END-TO-END STORY (the coherent flow)

This is the narrative that ties the whole app together — memorize this; it's the backbone of any demo or interview.

1. **Farmer registers** (email + OTP) and **creates a listing** for a crop — with land size, soil, irrigation, season, location, a crop photo, and a farm-registration document.
2. On listing creation, the backend calls the **Python AI service**, which returns a **predicted yield** (in tonnes) with a **confidence band**. This is stored on the listing.
3. A **buyer** browses the **marketplace**, opens a listing, and **sends a contract offer** (quantity + price per quintal).
4. The **farmer accepts**. At that instant the **escrow is created**: the buyer's **110% of contract value is locked**, and a **payment schedule** of milestones is generated. A **contract PDF** can be generated.
5. The buyer **releases the 15% cultivation advance** to the farmer immediately.
6. As the crop grows, the farmer **uploads GPS-stamped stage photos** (Sowing → Vegetative Growth → Flowering → Pre-Harvest). Each photo's GPS is checked to be **within 500 m** of the registered farm.
7. For each proven stage, the buyer **releases that stage's milestone payment** (15% / 20% / 20% / 10%). By pre-harvest, **80%** has been paid progressively.
8. At harvest, the buyer **settles**: the system fetches the **live market price** (data.gov.in mandi API), pays the farmer the **higher of contracted vs market price** (capped at the 110% buffer ceiling), and **refunds any unused buffer** to the buyer.
9. Every money movement is recorded in an **append-only ledger**; both parties can **review** each other; the farmer gets a **payout**, the deal is **complete**.

**Money math example** — 10 tonnes @ ₹2000/quintal (1 tonne = 10 quintals):
- contract_value = 10 × 2000 × 10 = **₹2,00,000**
- total locked (110%) = **₹2,20,000**; advance (15%) = ₹30,000; buffer (10%) = ₹20,000
- If market rises to ₹2100/q at harvest → farmer paid at ₹2100 (higher), buyer refunded the rest of the buffer. If market spikes past +10%, farmer is paid at the ceiling (₹2200/q) because escrow can't release more than was locked.

---

## 3. ARCHITECTURE — HOW EVERYTHING CONNECTS

### Four independent services

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  FRONTEND (React + Vite) │  HTTPS  │  BACKEND (Node.js + Express)  │
│  PWA, offline-capable    │◄───────►│  REST API at /api/*           │
│  localStorage JWT        │  JSON   │  JWT auth, business logic      │
└─────────────────────────┘         └───────────┬──────────────────┘
                                                 │
              ┌──────────────────────────────────┼───────────────────────────┐
              │                                   │                           │
      ┌───────▼────────┐              ┌───────────▼─────────┐      ┌──────────▼──────────┐
      │ PostgreSQL      │              │ Python AI service    │      │ External APIs        │
      │ (Supabase)      │              │ (FastAPI + XGBoost)  │      │ • Groq LLM           │
      │ 20+ tables      │              │ yield prediction     │      │ • data.gov.in mandi  │
      │ + Storage bucket│              │ port 8000            │      │ • SMTP email (OTP)   │
      └─────────────────┘              └──────────────────────┘      └─────────────────────┘
```

- **Frontend** never talks to the DB, the AI service, or external APIs directly — everything goes through the backend. It stores the JWT in `localStorage` and attaches it as a `Bearer` token on every request (axios interceptor).
- **Backend** is the hub: it owns the database, calls the Python AI service for predictions, calls Groq for the chatbot/negotiator, calls data.gov.in for prices, and sends OTP emails.
- **Python AI service** is a standalone ML microservice — it only predicts yield and serves climate data. Keeping it separate means the ML lifecycle (retraining, Python deps) is decoupled from the web app.
- **PostgreSQL** (hosted on Supabase) is the single source of truth; **Supabase Storage** holds uploaded images.

### A request, end to end (example: "release a milestone")

1. Buyer clicks "Release" on the Escrow page → React calls `PUT /api/escrow/contract/:id/milestone/:mid/release` with the `Bearer` JWT and an `X-Idempotency-Key` header.
2. `authMiddleware` verifies the JWT → sets `req.user`. `roleMiddleware("buyer")` checks the role.
3. `escrowController.releaseMilestone` opens a DB transaction at **SERIALIZABLE** isolation, takes a **`pg_advisory_xact_lock`**, does **`SELECT … FOR UPDATE`**, checks the **idempotency key**, verifies the previous milestone is released and the crop stage exists, mints a **mock payment**, updates the milestone + escrow, writes an **append-only ledger** row, and notifies the farmer — all atomically.
4. Response returns to React, which refreshes the escrow view.

### How the services are configured to talk

- Frontend → Backend: `VITE_API_URL` (origin only) + `/api`.
- Backend → AI service: `AI_SERVICE_URL` (env var).
- Backend → Groq: `https://api.groq.com/openai/v1/chat/completions`, model from `GROQ_MODEL`, key `GROQ_API_KEY`.
- Backend → mandi prices: `https://api.data.gov.in/resource/<id>`, key `DATA_GOV_API_KEY`.

---

## 4. TECH STACK (accurate keyword list)

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite 5, React Router v6, Tailwind CSS, Axios, **Leaflet / react-leaflet** (maps), **Recharts** (charts), **Dexie / IndexedDB** (offline), **vite-plugin-pwa** (service worker / installable PWA) |
| **Backend** | Node.js, Express.js, **pg** (PostgreSQL driver), **jsonwebtoken** (JWT), **bcrypt**, **Multer** (uploads), **Nodemailer** (SMTP OTP), **node-cron** (scheduled jobs), **Tesseract.js** (OCR), **@supabase/supabase-js**, axios |
| **Database** | PostgreSQL (Supabase-hosted), Supabase Storage; JSONB, transactions, SERIALIZABLE isolation, row locking, advisory locks, indexes, CHECK/UNIQUE constraints |
| **AI / ML service** | Python 3.12, FastAPI, Uvicorn, **XGBoost** (XGBRegressor), scikit-learn, pandas, NumPy, **Optuna** (hyperparameter tuning), joblib (model persistence), Pydantic |
| **GenAI / LLM** | Groq (OpenAI-compatible Chat Completions API), **RAG** (keyword retrieval), **function/tool calling** (agentic negotiation loop) |
| **External data** | data.gov.in Agmarknet mandi price API; NASA-POWER-style climate lookup |
| **Cross-cutting** | JWT auth + email-OTP 2FA, role-based access control, rate limiting, idempotency keys, double-entry ledger, PWA offline sync |

---

## 5. DATA MODEL (the database)

PostgreSQL, ~22 tables. The important ones:

- **users** — id, name, email, bcrypt password, `role` (farmer/buyer/admin), location, `avg_rating`, `is_verified`, OTP columns (`otp_code`, `otp_expires`), password-reset columns.
- **listings** — the crop for sale: crop, land_size, soil/climate, location (state/district/taluka/village + lat/long), `predicted_yield` + `confidence_lower/upper` (from AI), `farm_latitude/longitude` + `farm_verified` (from OCR of the registration doc), image URLs.
- **crop_stages** — growth stages per listing: `stage_name`, `stage_order`, image + `image_latitude/longitude`, `gps_verified`, `distance_from_farm`. This is what escrow milestones are gated on.
- **crop_updates** — extra photo updates within a stage.
- **contracts** — buyer↔farmer deal: quantity, `offered_price`, `status` (pending/accepted/rejected/completed), `advance_paid`, `final_amount`, `market_price_at_settlement`, `idempotency_key`.
- **escrow** — one per accepted contract: `advance_amount`, `buffer_amount`, `buffer_pct` (110), `total_locked`, `released_to_farmer`, `refunded_to_buyer`, `status`, `market_price_used`.
- **escrow_ledger** — **append-only** audit log: `entry_type`, `amount`, `running_balance`, `payment_ref`. Never updated.
- **escrow_milestones** — the payment schedule: `milestone_order`, `kind` (advance/progress), `stage_name`, `release_pct`, `amount`, `status` (locked/released), with CHECK + UNIQUE(contract_id, milestone_order) constraints.
- **idempotency_keys** — dedupes money operations; caches the result JSON.
- **market_prices** + **market_scrape_log** — cached mandi prices and scrape audit.
- **notifications**, **reviews**, **watchlist**, **chatbot_messages**, **rag_documents**, **crop_health_tips**, **negotiation_log**, **prediction_history**, **prediction_log** (model monitoring).

---

## 6. EVERY FUNCTIONALITY (feature by feature)

### Authentication (`/api/auth`)
- Signup and login are **both two-step with email OTP** (6-digit, 10-min expiry). Passwords are **bcrypt**-hashed (cost 10). On success a **7-day JWT** (`{id, role}`) is issued. Admin accounts can't be created via signup (provisioned out of band). Rate-limited (`authLimiter`: 10 req / 15 min).

### Listings (`/api/listings`)
- Farmer creates a listing (multipart: crop photo + farm-registration image). The backend **OCRs the registration image** to extract farm GPS, and **calls the AI service** to predict yield. Public marketplace feed with filters (crop, state, district, yield range).

### AI Yield Prediction (`/api/ai` + Python service)
- Predicts crop yield in tonnes with a confidence band. Details in Section 7.

### Crop Stages + GPS verification (`/api/stages`)
- Farmer uploads a photo per growth stage. Backend runs **Tesseract OCR** → regex-parses the GPS text stamped on the photo → **Haversine distance** to the farm → `gps_verified = distance ≤ 500 m`. Uploading a stage is what lets the buyer release that stage's escrow milestone.

### Contracts (`/api/contracts`)
- Buyer creates offer → farmer accepts (**this creates the escrow in one atomic transaction**) or rejects. Settlement delegates to the escrow controller so the logic is identical everywhere.

### Escrow & Payments (`/api/escrow`) — the flagship
- 110% buffer, 15% advance, stage-milestone releases, market-adjusted settlement, append-only ledger, concurrency-safe. Full detail in Section 7.

### Market Prices (`/api/market-prices`)
- Live mandi prices from **data.gov.in**, cached in the DB (fresh if < 25 h old), refreshed daily by a **node-cron** job at 6 AM IST; falls back to a deterministic simulated price if the API is unavailable. Per-crop price history + trend.

### AgriBot Chatbot (`/api/chatbot`)
- **RAG** chatbot over a 10-document knowledge base (keyword retrieval, top-3 docs), answers via **Groq LLM**, supports English + Kannada, keeps per-user history.

### AI Negotiation Agent (`/api/agent/negotiate`)
- An **agentic loop** (max 5 iterations) using Groq **function calling** with 3 tools (`get_market_price`, `get_ai_predicted_yield`, `suggest_counter_offer`) to recommend accept-or-counter with reasoning.

### Crop Health Advisor (`/api/agent/health`)
- Pulls climate for the district, asks Groq for 3 stage-specific health tips (JSON), falls back to rule-based tips if the LLM is unavailable.

### Reviews, Watchlist, Notifications, Analytics, Model Monitor, Admin
- Post-contract 1–5★ reviews (recompute avg rating); buyer watchlist; in-app notifications; role-specific **Recharts** analytics dashboards; an admin **model-monitoring** dashboard (prediction error trends); admin panel (users, listings verify, broadcast).

### Contract PDF (`/api/pdf`)
- Server-rendered HTML contract (printed to PDF client-side) with parties, the full stage-based payment schedule, terms (including the market-settlement + buffer-ceiling clause), and a settlement record once completed.

### Offline / PWA (frontend)
- Installable PWA (service worker via vite-plugin-pwa). **Dexie/IndexedDB** caches marketplace listings and stages for offline reads, and **queues offline writes** (text stage-updates / listing notes) that **auto-sync on reconnect**. A status bar shows online/offline/pending-sync state.

---

## 7. THE HARD / IMPRESSIVE PARTS (deep dives)

### 7A. Concurrency-safe milestone escrow (your strongest topic)

**The problem it solves:** money must never be double-released or over-released, even under concurrent/duplicate requests.

**The five techniques (all real, in `escrowController.js`):**
1. **SERIALIZABLE transactions** — the strictest isolation level; concurrent conflicting transactions are forced to serialize (one retries) instead of interleaving.
2. **`SELECT … FOR UPDATE`** — row-level lock on the escrow/contract row so a second request blocks until the first commits.
3. **`pg_advisory_xact_lock(contract_id)`** — an application-level lock keyed on the contract, held until the transaction ends — a second layer against races on the same contract.
4. **Idempotency keys** — each money operation carries an `X-Idempotency-Key`; the first call reserves it (`INSERT … ON CONFLICT DO NOTHING`) and caches its result; a duplicate returns the cached result instead of paying again.
5. **Append-only double-entry ledger** — every movement is an immutable `escrow_ledger` row with a `running_balance`; nothing is ever updated, so the full money history is auditable.

**The money model:**
- `contract_value = quantity(tonnes) × offered_price(₹/quintal) × 10` (1 tonne = 10 quintals)
- `total_locked = contract_value × 1.10` (buyer locks 110% at acceptance)
- Schedule (% of contract value): advance **15%**, Sowing **15%**, Vegetative Growth **20%**, Flowering **20%**, Pre-Harvest **10%** → **80% progressive**; remaining ~20% + buffer resolved at settlement.
- **Settlement:** `desired = max(offered, market)`; `gross = min(desired × qty_quintals, total_locked)` → **capped at the 110% ceiling** so escrow never releases more than was locked; `refund_to_buyer = total_locked − gross`. Because `released_to_farmer` lands exactly on `gross` and refund is the remainder, the ledger **balances to zero**.
- **Why the cap matters:** without it, if the market rose >10% above the contract price, the payout would exceed locked funds and the ledger would go negative. This invariant is proven by a **53-assertion offline test** (`npm test`).

### 7B. XGBoost yield prediction (the ML)

- **Model:** `XGBRegressor` (gradient-boosted trees), objective `reg:squarederror`, `tree_method="hist"`.
- **Target:** `yield_kg_ha` (kg per hectare), trained on a **log-transformed** target (`log1p`), inverted at inference (`expm1`). Then converted to tonnes via land area (acres → hectares × yield).
- **Features (643 total, one-hot encoded):** 7 numeric (`area`, `t2m_max`, `t2m_min`, `rh2m` humidity, `ws2m` windspeed, `annual_rainfall`, and an engineered `rainfall_temp_interaction`), plus one-hots for state (18), district (552), crop (55), season (6), soil_type (3), irrigation (2). Encoding is `pd.get_dummies`; the saved **column list (`model_columns.pkl`) IS the "encoder"** — unseen categories map to all-zeros.
- **Training:** `train_optimized.py` on `agrichain_feature_matrix.csv` (~247k rows), 85/15 train/test split, **Optuna** hyperparameter search (20 trials maximizing R²).
- **Real metrics (from `model_metadata.json`):** **R² = 0.87**, MAE ≈ 25,000 kg/ha, MAPE ≈ 30%. *(The old TRAINING_GUIDE claims 0.99 — that's stale; quote 0.87.)*
- **Confidence band:** the returned band is the crop's **historical 5th–95th percentile** yield (fallback ±15%), **not** a statistical model prediction interval. Be honest about this if asked.
- **Serving:** FastAPI endpoints `/predict/json`, `/predict/dynamic` (multipart, used by the Node backend), `/climate/{state}/{district}`, `/model/info`, `/predict/crop-list`. Model loaded once at startup via joblib.

### 7C. OCR-based GPS verification (anti-fraud)

- Farmers use a **GPS-stamp camera app** that burns lat/long/time text onto the photo. The backend runs **Tesseract.js OCR** on the image, **regex-extracts** the coordinates, then computes the **Haversine distance** (Earth radius 6,371,000 m) to the farm's registered coordinates. Within **500 m** → `gps_verified = true`.
- Note: the farm's own coordinates also come from OCR of the registration document. (`exifr` is installed but unused — the live path is OCR, not EXIF metadata.)

### 7D. RAG chatbot + function-calling agent (GenAI)

- **RAG:** retrieval-augmented generation. A user question is tokenized, scored against a 10-doc knowledge base by keyword overlap, and the **top-3 docs** are injected into the LLM system prompt so answers are **grounded** in platform policy, not hallucinated. (Production would use vector embeddings + pgvector; this uses keyword retrieval — a deliberate, honest simplification.)
- **Function calling / agentic loop:** the negotiation agent gives the LLM 3 tools with JSON schemas. The model decides which to call; the backend executes them against Postgres and feeds results back as `role:"tool"` messages; the loop repeats (up to 5×) until the model calls `suggest_counter_offer` with a final decision.

### 7E. Live market data + scheduled jobs

- Integrates the official **data.gov.in Agmarknet** "daily mandi prices" resource; uses the government **`modal_price`** as the representative price; widens district→state→national if a narrow query is empty; caches in the DB and refreshes via **node-cron** (6 AM IST daily), with a Sunday cleanup job.

---

## 8. WHY THESE CHOICES (talking points)

- **Why a separate Python ML microservice?** Decouples the ML stack (Python, XGBoost, retraining) from the Node web app; each can scale/deploy independently; the model can be retrained without touching the API.
- **Why PostgreSQL (not MongoDB)?** Money and contracts need **ACID transactions, foreign keys, and constraints**; relational integrity matters more than schema flexibility here.
- **Why SERIALIZABLE + locks + idempotency for escrow?** Payments must be exactly-once and never over-release; concurrency bugs in money are unacceptable.
- **Why XGBoost?** Strong on tabular/structured data with mixed numeric + categorical features, handles non-linearities, fast to train, well-suited to ~250k-row agricultural datasets.
- **Why Groq?** Free, no card, and it's OpenAI-API-compatible, so the same code shape works; low latency for a chat UX.
- **Why a PWA with offline sync?** Target users are rural farmers with intermittent connectivity — they can browse and record updates offline and sync later.
- **Why email OTP?** Adds a verification/2FA layer without SMS costs.

---

## 9. GLOSSARY (say these terms correctly)

- **Escrow** — a neutral hold of funds released on conditions.
- **Idempotency** — the same request applied twice has the same effect as once.
- **ACID / isolation level / SERIALIZABLE** — transaction guarantees; SERIALIZABLE is the strictest, preventing interleaving anomalies.
- **Row lock (`FOR UPDATE`) / advisory lock** — DB mechanisms to prevent concurrent modification.
- **RAG** — Retrieval-Augmented Generation: fetch relevant text, feed it to the LLM as context.
- **Function/tool calling** — the LLM returns a structured request to run a named function; you execute it and return the result.
- **One-hot encoding** — turning a category into 0/1 columns.
- **R² / MAE / MAPE** — regression metrics: variance explained / average absolute error / average % error.
- **Haversine** — great-circle distance between two lat/long points.
- **PWA / service worker / IndexedDB** — installable web app / background script enabling offline / in-browser database.

---

## 10. LEARNING ROADMAP (what to study, in order)

Study in this order. ⭐ = must know cold for this project.

**Phase 1 — Web foundations**
1. ⭐ How the web works: client/server, HTTP methods, status codes, JSON, REST APIs.
2. ⭐ JavaScript essentials: async/await, promises, array methods, ES modules.

**Phase 2 — Your frontend**
3. ⭐ React: components, props, state, `useEffect`, `useState`, conditional rendering.
4. ⭐ React Router (v6): routes, `useNavigate`, params.
5. Axios + interceptors; how the JWT is attached; `localStorage`.
6. Tailwind basics; Recharts (charts); Leaflet (maps). PWA: service workers, IndexedDB/Dexie, offline sync (understand conceptually).

**Phase 3 — Your backend**
7. ⭐ Node.js + Express: routing, middleware, controllers.
8. ⭐ Auth: JWT (sign/verify), bcrypt hashing, why OTP, role-based access control.
9. Multer uploads, Nodemailer, node-cron, rate limiting.

**Phase 4 — Database (spend real time here)**
10. ⭐ SQL: SELECT/JOIN/INSERT/UPDATE, indexes, foreign keys, constraints.
11. ⭐ PostgreSQL specifics: transactions, **ACID**, **isolation levels (SERIALIZABLE)**, **`SELECT … FOR UPDATE`**, **advisory locks**, JSONB.
12. ⭐ **Idempotency** and **concurrency control** — the heart of your escrow. Understand a race condition and how each of your 5 techniques prevents it.

**Phase 5 — The ML service**
13. ⭐ ML basics: supervised learning, regression, features/target, train/test split, overfitting.
14. ⭐ Feature encoding (one-hot), and **why 643 columns**; log-transforming a skewed target.
15. ⭐ **XGBoost / gradient boosting** — intuition (ensembles of trees correcting each other).
16. ⭐ Metrics: **R², MAE, MAPE** — what each means and your real numbers (0.87 / ~25k / ~30%).
17. FastAPI + Pydantic; joblib model persistence; Optuna (hyperparameter tuning idea).

**Phase 6 — GenAI**
18. ⭐ LLM basics: prompts, tokens, system vs user messages.
19. ⭐ **RAG** — why grounding reduces hallucination; keyword vs vector retrieval.
20. **Function/tool calling** and the agentic loop pattern.

**Phase 7 — Glue & extras**
21. Geospatial: lat/long, Haversine. OCR: what Tesseract does.
22. Env/secrets management; .env vs .env.example; why rotate keys.
23. Microservice architecture; how your 4 services communicate.

---

## 11. INTERVIEW QUESTION BANK

Grouped easy → hard. For each, know a crisp answer.

**Warm-up / overview**
- What is AgriChain and what problem does it solve?
- Walk me through the end-to-end flow (farmer → buyer → payout). *(Section 2.)*
- Draw the architecture. Why four separate services? *(Section 3, 8.)*
- What was the hardest part and what are you proudest of? *(→ the escrow engine.)*

**Frontend**
- How do you protect routes / handle auth on the client? *(In-page `useEffect` guards + JWT; real enforcement is server-side; 401 interceptor logs out.)*
- How does offline mode work? What can/can't you do offline? *(Dexie/IndexedDB cache + queued text writes; photo uploads need internet.)*
- Where do you use charts and maps? *(Recharts on Analytics/ModelMonitor/MarketPrices; Leaflet StageMap for GPS verification.)*

**Backend / API**
- How is authentication implemented? Why OTP + JWT + bcrypt? *(Section 6.)*
- What is middleware? Give examples from your app. *(auth, role, validation, rate limiters.)*
- How do you handle file uploads and where are images stored? *(Multer memory → Supabase Storage.)*

**Database & concurrency (expect deep probing here)**
- Why PostgreSQL over a NoSQL DB? *(ACID, constraints, relational money data.)*
- **What happens if a buyer double-clicks "release payment"?** *(SERIALIZABLE + FOR UPDATE + advisory lock + idempotency key → exactly-once.)*
- What is an isolation level? Why SERIALIZABLE here?
- What is idempotency and how did you implement it?
- Explain your escrow ledger. Why append-only? How does it balance to zero?
- Why the 110% buffer, and why cap the payout at it? *(Market upside headroom; without the cap the ledger goes negative.)*

**ML**
- What does the model predict and what algorithm? *(Yield kg/ha; XGBoost regressor.)*
- What features does it use? Why one-hot encoding? Why so many columns? *(643; districts/crops/states one-hot.)*
- What accuracy did you get? *(R² ≈ 0.87, MAE ≈ 25k kg/ha, MAPE ≈ 30% — and know these are honest, not inflated.)*
- Why log-transform the target?
- How is the confidence band computed? *(Historical 5th–95th percentile per crop — be honest it's not a model interval.)*
- How would you improve the model? *(Better features, per-crop models, real prediction intervals, address the ~30% MAPE.)*

**GenAI**
- What is RAG and how did you implement it? *(Keyword retrieval over 10 docs → top-3 into the prompt.)*
- What is function calling? Walk through your negotiation agent's loop.
- Keyword vs vector retrieval — trade-offs? *(Honest: you'd add embeddings/pgvector for semantic recall.)*

**Security & scaling**
- How do you protect secrets? *(.env, gitignored, placeholders in .env.example, rotate leaked keys.)*
- What are the security weak spots and how would you fix them? *(Some public endpoints, client-side-only route guards; enforce server-side, add validation everywhere.)*
- How would you scale this to 100k users? *(Stateless API + horizontal scaling, DB read replicas/connection pooling, cache market prices, queue for heavy jobs, CDN for images.)*

**Behavioral / project**
- What would you do differently? *(Real payment gateway, vector RAG, per-crop ML models, migration framework, consolidate the two AI-call paths.)*
- What did you learn?

---

## 12. HONEST CAVEATS (know these so you're never caught out)

These are *truths about your own system.* Knowing them is a strength — inflated claims that unravel under questioning are the real risk.

1. **Payments are mocked, not a real gateway.** You mint `MOCK-…` references. Say: *"The escrow state machine, accounting, and concurrency safety are fully real; the gateway call is simulated."*
2. **Model accuracy is R² ≈ 0.87 (not 0.99).** The old training guide is stale; quote the real number from `model_metadata.json`. MAPE ≈ 30% means it's a reasonable estimator, not a precise one — frame it as decision-support.
3. **The confidence band is a historical percentile, not a model prediction interval.** Don't claim the model outputs uncertainty.
4. **GPS verification is OCR-based** (Tesseract reads GPS text stamped on the photo), **not EXIF.** Correct your earlier resume wording to "OCR-based GPS extraction."
5. **The milestone GPS gate is "soft":** a stage must *exist* to release its milestone, but a `gps_verified = false` doesn't hard-block the release (it's recorded/shown, not enforced). Know this if asked "what stops a fake photo?"
6. **Some endpoints are public / route guards are client-side.** Real enforcement is the server checking the JWT; a few GET endpoints are intentionally public. Good "what would you harden?" material.
7. **Known rough edges (great "what would you improve" answers):** two different AI-service call paths (multipart `/predict/dynamic` vs JSON `/predict`); an env mismatch where `.env.example`'s `AI_SERVICE_URL` is the base origin while the code path needs the full URL; example inputs `soil_type="loamy"`/`irrigation="drip"` aren't trained categories so they map to zeros; no DB migration framework (hand-run SQL).
8. **🔑 Security action:** rotate the **Groq API key** currently in `backend/.env` (it looks like a live `gsk_…` key), keep only placeholders in `.env.example`, and never put real keys in the repo, screenshots, resume, or slides.

---

*End of AgriChain project knowledge. Follow the code over any older doc; keep this file updated as the project evolves.*
