# AgriChain — End-to-End Project Reference
## Part E0 — Overview & Tech Stack (what it is, how it's shaped, and *why each technology*)

> **What this series is.** This is **not** the interview course (that's the `AGRICHAIN_RESUME_COURSE_*` files, organised concept-by-concept). This series explains **how the whole system actually runs as one machine** — every file's job, the complete path a request takes from a click in the browser to a row in the database and back, and the reason each technology was chosen over its alternatives.
>
> **How it's split (parts):**
> - **E0 — Overview & tech stack** *(this file)* — the shape of the system + every technology with the "why".
> - **E1 — The request→response lifecycle** — one real API call traced through every layer.
> - **E2 — Backend, file by file** — server, config, middleware, services, utils, every controller + route.
> - **E3 — Frontend, file by file** — boot, routing, auth context, the axios interceptors, pages, components.
> - **E4 — The database** — every table, column, constraint, and relationship.
> - **E5 — The complete user journey** — signup → listing → contract → escrow → GPS → settlement → payout, tying every file together.
> - **E6 — The AI service & integration points** — how the Python service and the add-ons plug into the spine.

---

## E0.1 — What AgriChain is, in one paragraph

AgriChain is a **full-stack agricultural marketplace** where **farmers** list crops (often *before* harvest, as a forward contract) and **buyers** commit to purchase them. Because the two sides don't trust each other and the crop doesn't exist yet when the deal is struck, the **platform holds the money in escrow** and **releases it in stages** as the farmer **proves real progress with GPS-tagged photos**, with the **final price settled against live government mandi rates** at harvest. Around that spine sit supporting features (notifications, reviews, watchlist, admin/dispute tools, analytics, PDF contracts) and three optional "smart" add-ons (an ML yield predictor, an AI chatbot/negotiator, and offline/PWA support).

**The core problem it solves:** a trust and timing gap. A farmer needs commitment (and ideally money) *early* to fund the season; a buyer doesn't want to pay for a crop that may never arrive. AgriChain bridges that gap by making the platform a neutral escrow agent that only releases money against **verifiable** milestones.

---

## E0.2 — The big picture: three services + two data stores

AgriChain is not one program. It is **three independently deployable services** plus **two managed data stores**:

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                      THE BROWSER                          │
                 │   React 18 SPA (built by Vite) — runs on the user's      │
                 │   device. All UI, routing, and state live here.          │
                 └───────────────┬─────────────────────────────────────────┘
                                 │  HTTPS / JSON  (axios)
                                 │  Authorization: Bearer <JWT> on every call
                                 ▼
    ┌───────────────────────────────────────────────────────────────────────┐
    │                        NODE.JS + EXPRESS BACKEND                        │
    │  The "brain". REST API. Owns all business rules: auth, listings,       │
    │  contracts, the escrow money-engine, GPS verification, cron jobs.      │
    │  THE ONLY service that may touch the database and storage secrets.     │
    └───┬───────────────────────┬──────────────────────────┬────────────────┘
        │ SQL (pg pool)         │ Storage SDK              │ HTTP (axios)
        ▼                       ▼                          ▼
 ┌──────────────┐      ┌──────────────────┐     ┌───────────────────────────┐
 │ PostgreSQL   │      │ Supabase Storage │     │  PYTHON FASTAPI AI SERVICE │
 │ (Supabase,   │      │  buckets:        │     │  XGBoost yield model.      │
 │ Mumbai)      │      │  listings,stages │     │  Stateless. Optional.      │
 │ All rows:    │      │  (crop photos)   │     │  (+ Groq LLM for chatbot) │
 │ money,users, │      └──────────────────┘     └───────────────────────────┘
 │ contracts... │
 └──────────────┘
        ▲
        │ once/day 06:00 IST (node-cron)
 ┌──────┴───────────────────┐
 │ data.gov.in Agmarknet API│  → live mandi (market) prices for settlement
 └──────────────────────────┘
```

**Why three services instead of one monolith?** Three different reasons, one per boundary:
- **Browser ↔ Backend** is the classic **client/server** split: the client is untrusted (anyone can open dev-tools), so *no* secret and *no* business rule that matters can live there. The backend is the trust boundary.
- **Backend ↔ AI service** is a **language boundary**. The whole machine-learning ecosystem (pandas, scikit-learn, XGBoost) is Python; the web backend is JavaScript. Rather than bolt a Python runtime into Node, the model lives in its own FastAPI service that Node calls over HTTP. This keeps the Node app lean, lets the model be retrained/redeployed on its own schedule, and means **if the ML service is down the marketplace still works** (graceful degradation — the prediction is an enhancement, not a dependency).
- **Backend ↔ data stores** is a **managed-infrastructure** boundary: Postgres and file storage are things you do *not* want to hand-run for a project like this, so they're delegated to Supabase.

---

## E0.3 — The tech stack at a glance

| Layer | Technology | One-line role |
|---|---|---|
| Language (both tiers) | **JavaScript (ES modules)** | One language across frontend and backend |
| Frontend framework | **React 18** | Component-based SPA UI |
| Frontend build tool | **Vite** | Dev server (HMR) + production bundler |
| Routing | **React Router** | Client-side page navigation in the SPA |
| Styling | **Plain CSS** | Hand-written styles (Tailwind was removed) |
| HTTP client | **axios** | Talks to the backend; carries the JWT |
| Maps | **Leaflet / React-Leaflet** | Plots the verified GPS point |
| Offline DB | **Dexie / IndexedDB** | Offline write-queue + read cache (PWA) |
| PWA | **vite-plugin-pwa / Workbox** | Service worker + installability |
| Backend runtime | **Node.js** | Runs the server-side JavaScript |
| Backend framework | **Express 4** | REST routing + middleware pipeline |
| DB driver | **pg** (node-postgres) | Connection pool + parameterised SQL |
| Auth tokens | **jsonwebtoken (JWT)** | Stateless login tokens |
| Password hashing | **bcrypt** | One-way salted password hashes |
| Rate limiting | **express-rate-limit** | Throttles abuse on `/api` |
| Scheduling | **node-cron** | Daily market-price refresh |
| EXIF | **exifr** | Reads GPS out of a photo's metadata |
| OCR | **tesseract.js** | Fallback: reads coordinates printed on a photo |
| Email | **@sendgrid/mail** | OTP / welcome / reset emails over HTTPS |
| Storage SDK | **@supabase/supabase-js** | Uploads crop photos to Supabase Storage |
| Database | **PostgreSQL** (via Supabase) | The single source of truth for all data |
| File storage | **Supabase Storage** | Crop/stage photo files |
| ML service | **Python + FastAPI** | Serves the yield model over HTTP |
| ML model | **XGBoost** (+ pandas, scikit-learn, joblib) | Gradient-boosted yield regression |
| LLM | **Groq-hosted LLM** | Chatbot + agentic negotiator (add-on) |
| Hosting | **Vercel / Render / Supabase** | Frontend / backend+AI / DB+storage |

The rest of this part explains **why each** — and, where it matters, **why not the obvious alternative**.

---

## E0.4 — Every technology, with the reason (and "why only that")

### Language — JavaScript on both tiers
- **What:** One programming language for the browser UI *and* the server.
- **Why this:** A solo full-stack build moves faster when there's **no context-switch** between tiers — same syntax, same JSON data shapes end to end, shared mental model. JSON is JavaScript's native object format, so data crossing the wire needs no translation layer.
- **Why not** Python/Java/Go on the backend? Those are fine servers, but they'd add a second language to an otherwise JS project for no gain here. The *one* place a different language genuinely earns its place is ML — and that's exactly where AgriChain *does* switch to Python (the AI service), for a concrete reason, not by default.

### React 18 — the frontend framework
- **What:** A library for building UIs out of reusable **components** whose rendered output is a function of **state**; when state changes, React re-renders just what's needed.
- **Why this:** The app is highly **stateful and interactive** (dashboards, live forms, maps, multi-step flows). React's component model + hooks (`useState`, `useEffect`, `useContext`) keep that manageable, and its ecosystem (Router, Leaflet bindings, chart libs) is the largest available.
- **Why not** plain HTML/JS or a server-rendered template? The UI is a **single-page application** with lots of client-side state and partial updates; hand-rolling that with DOM manipulation would be error-prone. A server-rendered (e.g. EJS) approach would round-trip to the server for every screen — wrong for an app-like, offline-tolerant experience.

### Vite — the frontend build tool
- **What:** The dev server and production bundler. In development it serves modules natively with near-instant **Hot Module Replacement**; for production it bundles/minifies via Rollup.
- **Why this:** **Speed.** Vite's dev server starts instantly and updates the browser on save without a full reload — a tight feedback loop matters when iterating on UI. It also gives a clean place to configure the `@ → ./src` import alias and the PWA plugin.
- **Why not** Create React App (CRA)? CRA is effectively deprecated and its Webpack dev server is markedly slower to start and reload. Vite is the modern default.

### React Router — routing
- **What:** Maps URL paths to React components **in the browser**, without a server round-trip per page.
- **Why this:** It's the standard for SPA routing and pairs with the PWA offline story — combined with the service worker's `index.html` fallback, deep links keep working even offline (client-side routing takes over).

### Plain CSS — styling
- **What:** Hand-written CSS files, no utility framework.
- **Why this (and why the change):** The project **started on Tailwind and deliberately moved off it** to plain CSS. For a solo developer who needs to *fully explain and defend every line*, plain CSS is the most transparent choice — there's no build-time class generation or framework behaviour to account for. It keeps the dependency surface and the "why does it look like that?" answer simple.

### axios — the HTTP client
- **What:** A promise-based HTTP library used by the frontend to call the backend REST API.
- **Why this:** axios supports **interceptors** — one central place to (a) attach the JWT to the `Authorization` header on *every* outgoing request and (b) catch a `401 Unauthorized` on *every* response and force a logout. Doing that once in an axios instance (`src/lib/api.js`) beats repeating auth-header code in every component. (Covered in detail in E1 and E3.)
- **Why not** the built-in `fetch`? `fetch` has no interceptors, no automatic JSON handling, and clunkier error semantics (it doesn't reject on HTTP error status). axios removes that boilerplate.

### Leaflet / React-Leaflet — maps
- **What:** An open-source interactive-map library; React-Leaflet is its React binding.
- **Why this:** The GPS feature needs to **plot the verified photo location** on a real map. Leaflet is free, open-source, and needs no API key or billing account.
- **Why not** Google Maps? It requires an API key, a billing account, and usage limits — unnecessary overhead for plotting a point.

### Dexie / IndexedDB + vite-plugin-pwa — offline & PWA *(add-on, see E6/Part B3)*
- **What:** IndexedDB is a browser-built-in database; Dexie is a friendly wrapper; vite-plugin-pwa (Workbox) generates the service worker and manifest.
- **Why this:** Farmers are often in **fields with poor connectivity**. The service worker caches the app shell so it *opens* offline; Dexie holds an offline **write-queue** so field notes aren't lost. This is a resilience layer, not core — documented as a touchpoint, not re-taught here.

### Node.js — the backend runtime
- **What:** Runs JavaScript on the server, event-loop based (non-blocking I/O).
- **Why this:** Keeps the backend in the same language as the frontend, and its **non-blocking I/O model** suits this workload, which is mostly waiting on I/O (database queries, external HTTP calls to data.gov.in and the AI service, sending email) rather than CPU-crunching.
- **Why not** a thread-per-request server (e.g. classic PHP/Java)? For an I/O-bound API with a solo-dev JS stack, Node's model is a natural fit and avoids a second language.

### Express 4 — the web framework
- **What:** A minimal framework that turns the raw Node HTTP server into **routes** (`GET /api/listings`) and a **middleware pipeline** (functions that run in order on each request).
- **Why this:** The entire security and request-handling model is expressed cleanly as ordered middleware: CORS → body-parse → rate-limit → (auth → role) → controller. It's the most widely used Node framework, so every pattern is well-trodden.
- **Why not** a heavier framework (NestJS) or raw Node? Raw Node means re-implementing routing/parsing by hand; Nest adds structure (and a learning/ceremony cost) that a project this size doesn't need. Express is the right weight.

### pg (node-postgres) — the database driver
- **What:** The PostgreSQL client for Node — a **connection pool** and **parameterised queries**.
- **Why this (two reasons that matter):**
  1. **Parameterised queries** (`$1, $2`) are the primary defence against **SQL injection** — values are sent separately from the SQL text, so user input can never be executed as SQL.
  2. A **connection pool** reuses a small set of DB connections across many requests instead of opening one per request (which would exhaust the database). The escrow engine also leans on raw SQL power — `SERIALIZABLE` transactions, `SELECT ... FOR UPDATE`, advisory locks — which `pg` exposes directly.
- **Why not** an ORM (Prisma/Sequelize)? An ORM hides SQL behind objects, which is convenient for CRUD but gets in the way of the **hand-tuned transactional money code** at AgriChain's core. Writing SQL directly keeps the money logic explicit and auditable.

### jsonwebtoken (JWT) — authentication tokens
- **What:** Signs a small token `{ id, role }` with a server secret; the client sends it back on every request to prove who it is.
- **Why this:** JWTs are **stateless** — the server doesn't store sessions; it just verifies the signature. That scales cleanly and survives the backend restarting or cold-starting on Render (no server-side session store to lose). The token carries the user's `role`, so authorization checks need no extra DB lookup.
- **Why not** server-side sessions/cookies? Sessions need a shared store (sticky sessions or Redis) and are more fragile across restarts/cold starts on free-tier hosting. Stateless JWT fits the deployment.

### bcrypt — password hashing
- **What:** A deliberately **slow, salted** one-way hash for passwords (cost factor 10).
- **Why this:** Passwords must **never** be stored or reversible. bcrypt is purpose-built: it's slow *on purpose* (to resist brute force) and salts every hash (so identical passwords don't collide, defeating rainbow tables).
- **Why not** SHA-256/MD5? Those are *fast* general hashes — exactly wrong for passwords, because fast means cheap to brute-force. bcrypt's tunable cost is the point.

### express-rate-limit — abuse protection
- **What:** Middleware that caps how many requests an IP can make to `/api` in a time window.
- **Why this:** A public API needs a basic brake against brute-force login attempts and scraping. It's a cheap, standard first line of defence applied globally at the `/api` mount.

### node-cron — scheduling
- **What:** Runs a function on a schedule (cron expression) inside the Node process.
- **Why this:** Market prices only need refreshing **once a day** (06:00 IST). An in-process cron is the simplest thing that works — no extra worker service or external scheduler for a once-daily job.
- **Why not** a managed scheduler? Overkill for one daily task; and the code also self-heals on boot (if today's fetch is missing it fetches on startup), covering the case where a free-tier backend was asleep at 06:00.

### exifr + tesseract.js — the GPS pipeline inputs
- **What:** `exifr` reads a photo's **EXIF metadata** (including GPS latitude/longitude the camera stamped in); `tesseract.js` is **OCR** that reads text off the image pixels.
- **Why this (two-stage):** The primary, reliable source of a photo's location is its **EXIF GPS tags** — read with exifr. But phones/apps often **strip EXIF** on share/upload. So there's a **fallback**: many field apps *print* the coordinates onto the photo (a GPS-camera overlay), and tesseract.js can **OCR those numbers** back out. Two independent ways to recover location makes verification robust to stripped metadata.

### @sendgrid/mail — transactional email
- **What:** Sends OTP, welcome, and password-reset emails via SendGrid's **HTTPS API**.
- **Why this (deployment-forced):** Render's hosting **blocks outbound SMTP ports**, so a normal SMTP email library can't connect in production. SendGrid's HTTPS API sends email over a normal web request, which Render allows. This is a concrete "the environment forced the choice" decision.

### @supabase/supabase-js — storage SDK
- **What:** Uploads crop/stage **photo files** to Supabase Storage buckets and returns public URLs.
- **Why this:** Photos are **binary blobs**, which don't belong in a relational database (bloats the DB, slows backups). The pattern is: store the **file** in object storage, store the **URL** in Postgres. Supabase bundles storage with the database, so it's one vendor and one set of credentials.

### PostgreSQL — the database
- **What:** A relational (SQL) database; the single source of truth for users, listings, contracts, escrow, stages, everything.
- **Why this (non-negotiable for this app):** AgriChain moves **money**. Money needs **ACID transactions** (all-or-nothing writes), strong consistency, and real constraints (foreign keys, `CHECK`s, `UNIQUE`s). Postgres also provides exactly the concurrency tools the escrow engine needs: `SERIALIZABLE` isolation, `SELECT ... FOR UPDATE` row locks, and advisory locks.
- **Why not** a NoSQL store (MongoDB)? Document stores favour flexibility over guarantees; cross-document transactions and referential integrity are weaker. For financial records where a half-written transfer is unacceptable, a relational database with ACID is the correct, defensible choice.

### Supabase — managed Postgres + Storage
- **What:** A hosted platform bundling a managed PostgreSQL database **and** object storage.
- **Why this:** It removes the ops burden of running a database (backups, upgrades, connection pooling) and gives storage from the same vendor. The region is **ap-south-1 (Mumbai)** — physically close to Indian users, lowering latency. Connections go through Supabase's **connection pooler** (important for serverless/cold-start-prone backends that would otherwise exhaust direct connections).

### Python + FastAPI + XGBoost — the AI service *(see E6 / Part B1)*
- **What:** A separate HTTP service that serves the **XGBoost yield-prediction** model; FastAPI is the Python web framework.
- **Why this:** ML lives in Python. **XGBoost** (gradient-boosted trees) is the go-to for **tabular regression** (predicting a number — kg/ha — from rows of features) and typically beats neural nets on structured data. **FastAPI** is the modern, fast, type-hinted Python API framework — minimal code to expose a `/predict` endpoint. It's a **separate microservice** so Node stays lean and the model deploys independently.
- **Why not** run the model inside Node? There's no mature XGBoost+pandas story in Node; fighting that would be far more work than an HTTP call to a small Python service.

### Groq-hosted LLM — chatbot & negotiator *(add-on, see E6 / Part B2)*
- **What:** A hosted large-language-model API powering the optional AgriBot chatbot and an agentic tool-calling "negotiator".
- **Why this:** Using a **hosted** LLM means no GPUs to run; Groq is chosen for fast inference. It's an **add-on**, isolated so the core marketplace never depends on it.

### Vercel / Render / Supabase — hosting *(see Part E… deployment / Course Part 9)*
- **Vercel** hosts the **static frontend** — Vercel is built for static/JAMstack front-ends with a global CDN; the React app builds to static files, so this is a perfect fit (and free-tier generous).
- **Render** hosts the **Node backend and the Python AI service** — it runs long-lived server processes (unlike Vercel's function model), which the Express server and FastAPI service need. (Free tier → **cold starts**: the service sleeps when idle and takes a few seconds to wake — a real, honestly-acknowledged limitation.)
- **Supabase** hosts the **database + storage**.
- **Why this split:** Each piece goes to the platform that fits its shape — static site to a CDN host, long-running servers to a server host, data to a managed data platform. The seam to watch is **CORS**: the browser calls the backend cross-origin, so the backend must explicitly allow the Vercel origin.

---

## E0.5 — The repository layout (what lives where)

```
agrichain/
├── backend/                    # Node + Express REST API (the brain)
│   ├── server.js               # entry point: middleware chain, route mounts, boot sequence
│   ├── config/
│   │   ├── db.js               # pg connection Pool (Supabase Postgres)
│   │   └── supabase.js         # Supabase Storage client + buckets
│   ├── middleware/             # auth, role-gating, rate-limiting, validation
│   ├── controllers/            # one file per domain: the actual request handlers + SQL
│   │   ├── authController.js        # signup/login/OTP/2FA/reset
│   │   ├── listingController.js     # crop listings + photo upload + yield call
│   │   ├── contractController.js    # offer → accept → lifecycle
│   │   ├── escrowController.js      # the money engine (transactions, ledger)
│   │   ├── cropStageController.js   # GPS stage verification
│   │   ├── updateController.js      # crop timeline updates
│   │   ├── marketPriceController.js # Agmarknet prices + settlement inputs
│   │   ├── pdfController.js         # printable contract
│   │   ├── notificationController.js, reviewController.js, watchlistController.js,
│   │   ├── adminController.js, analyticsController.js, modelMonitorController.js
│   │   └── ragController.js, agentController.js, predictionController.js  # AI add-ons
│   ├── routes/                 # one file per domain: METHOD + path → middleware → controller
│   ├── services/               # emailService, cronJobs, aiService (ML HTTP), marketScraper
│   ├── utils/                  # exifHelper, ocrHelper, distanceHelper (the GPS pipeline)
│   └── *.sql                   # schema definitions (tables, constraints, indexes)
│
├── frontend/                   # React 18 + Vite SPA (the face)
│   ├── index.html              # the single HTML page the SPA mounts into
│   ├── vite.config.js          # @→src alias, PWA plugin, dev port 3000
│   ├── public/                 # manifest.json, icons, static assets
│   └── src/
│       ├── main.jsx            # React entry — mounts <App/>
│       ├── App.jsx             # Router + route table + providers
│       ├── lib/
│       │   ├── api.js          # the axios instance (JWT request + 401 response interceptors)
│       │   └── offline*.js, db.js   # Dexie offline queue/cache (PWA)
│       ├── context/            # auth context (token + user state)
│       ├── components/         # Navbar, ProtectedRoute, SyncStatusBar, InstallPrompt, ...
│       └── pages/              # Login, Signup, Marketplace, ListingDetail, dashboards, ...
│
└── ai-service/                 # Python + FastAPI ML microservice (optional)
    ├── src/
    │   ├── app.py (or main.py) # FastAPI app + /predict endpoint
    │   ├── inference.py        # XGBoost load + predict + confidence band
    │   └── climate/weather     # climate feature source
    ├── requirements.txt        # pinned Python deps
    └── *.pkl / *.joblib        # the trained model artifact(s)
```

> Exact filenames in `middleware/`, `routes/`, `services/`, `context/`, and the AI service are confirmed file-by-file in **E2, E3, and E6**. The tree above is the map; those parts are the territory.

---

## E0.6 — The runtime in one breath (the spine E1–E5 will unpack)

> A user opens the **React app** (served from Vercel). They log in; the backend checks the **bcrypt** hash and returns a **JWT**, which the browser stores and **axios** then attaches to every call. A farmer creates a **listing** — the photo goes to **Supabase Storage**, the row to **Postgres**, and (optionally) the **Python service** returns a yield estimate. A buyer makes an offer → a **contract**; on acceptance the **escrow engine** locks money in a **SERIALIZABLE transaction** and records it in an append-only **ledger**. As the crop grows, the farmer uploads **stage photos**; the backend pulls GPS from **EXIF** (or **OCR** fallback), checks the **Haversine distance** to the registered farm, and a verified stage **lets the buyer release the next escrow milestone** (releasing is a buyer action, not automatic). At harvest, a **node-cron**-refreshed **Agmarknet** price drives **final settlement**: the farmer is paid the better of agreed vs market (capped by what's locked), the rest is refunded, and the money invariant (`locked == released + refunded`) holds. Every response flows back through axios; a `401` anywhere forces a clean logout.

That sentence is the whole system. The next parts prove every clause of it against the actual code.

---

### Next: **E1 — The request→response lifecycle** (one real API call, traced through CORS, body-parsing, rate-limiting, auth, role-gating, the controller, the pg pool, and all the way back into React state and the rendered UI).
