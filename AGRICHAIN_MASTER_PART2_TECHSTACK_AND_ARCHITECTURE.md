# AgriChain — Master Guide, Part 2: Tech Stack & Architecture

> **What's in it:** every technology in the project — *what it is, why you chose it, and why not the obvious alternative* — every library with a one-line reason, the four-service architecture and how the services connect, the deployment topology, and the "graceful degradation" philosophy that ties it together.
>
> Legend: **✅ ON RÉSUMÉ** · **ℹ️ OFF RÉSUMÉ** · **🎒 BACK POCKET**

---

## 1. The architecture at a glance — four independent services

AgriChain is **not one program**. It's **four services**, split along real boundaries, plus a few external providers.

```
                         ┌───────────────────────────────┐
                         │        BROWSER (client)         │
                         │   React 18 + Vite  (Vercel)     │  ✅
                         │   axios · react-router · leaflet │
                         │   recharts · dexie (offline)     │
                         └───────────────┬─────────────────┘
                                         │  HTTPS + JSON
                                         │  Authorization: Bearer <JWT>
                         ┌───────────────▼─────────────────┐
                         │      NODE / EXPRESS API (hub)     │  ✅
                         │      (Render)  — server.js        │
                         │  auth · listings · contracts ·    │
                         │  escrow · stages · market · …     │
                         └──┬─────────┬─────────┬─────────┬──┘
                            │         │         │         │
              pg (SQL) ─────┘         │         │         └───── HTTPS
        ┌──────────────────┐   HTTP   │   HTTPS │        ┌──────────────────┐
        │   PostgreSQL       │  ┌──────▼─────┐   │        │  data.gov.in       │  ✅
        │   (Supabase)       │  │ Python ML  │   │        │  Agmarknet prices  │
        │   19 tables        │  │ FastAPI +  │   │        └──────────────────┘
        │   + escrow ledger  │  │ XGBoost    │ℹ️ │
        └──────────────────┘  └────────────┘   │        ┌──────────────────┐
        ┌──────────────────┐                    │        │  Email (SMTP/     │  ✅
        │ Supabase Storage   │                    └───────▶│  SendGrid)  OTPs  │
        │ buckets: listings, │                             └──────────────────┘
        │ stages (images)    │                             ┌──────────────────┐
        └──────────────────┘                                │ Groq LLM (chat)  │ℹ️
                                                             └──────────────────┘
```

**The golden rule of the architecture:** the **browser only ever talks to the Node backend**. The backend is the **hub** — it's the only thing that touches the database, the ML service, the price API, storage, and email. Nothing else talks to the database directly.

> **Defend "why four services / microservices-ish":** *"I split along real seams. The ML libraries are Python-only and heavy, so the model is its own Python service. The frontend is a separate static build. The database is managed. Each can be deployed and scaled independently, and if the ML service is down, the backend degrades gracefully instead of failing."*

---

## 2. Each technology: what, why, and why-not-the-alternative

### 2.1 Frontend — React 18 + Vite ✅
- **What:** React builds the UI from components; Vite is the build tool/dev server that bundles it.
- **Why React:** the UI is stateful and role-driven (farmer vs buyer dashboards, live lists, a map, charts). Component + state model fits perfectly and it's the most in-demand frontend skill.
- **Why Vite (not Create React App):** Vite is dramatically faster to start and rebuild (native ES modules + esbuild), and CRA is effectively deprecated. Vite also has first-class PWA support via a plugin.
- **Why not plain HTML/jQuery:** the app has too much interactive, stateful UI (real-time lists, conditional dashboards, maps) — you'd be hand-managing the DOM, which is exactly what React removes.

### 2.2 Backend — Node.js + Express 4 ✅
- **What:** Node runs JavaScript on the server; Express is the web framework on top.
- **Why Node:** same language as the frontend (one mental model), huge ecosystem, and its non-blocking I/O suits an API that's mostly waiting on the database and other services.
- **Why Express (not Nest/Fastify):** Express is minimal, ubiquitous, and its middleware model is easy to explain — perfect for a project where you want to *understand and defend* every layer. Nest would add structure you don't need; Fastify's speed edge doesn't matter at this scale.
- **Why not Python/Django for the API:** you deliberately kept the *API* in Node and isolated only the *ML* in Python, so the heavy ML dependencies don't bloat the API and each can scale separately.

### 2.3 Database — PostgreSQL (on Supabase) ✅🎒
- **What:** a relational SQL database.
- **Why Postgres:** the escrow is **money**. Money needs **ACID transactions, row-level locking, and constraints** — Postgres's core strengths. You use `SERIALIZABLE` transactions, `SELECT FOR UPDATE`, advisory locks, `CHECK` constraints, and a `UNIQUE(contract_id, milestone_order)` guard. This is the single best "why this tech" story you have.
- **Why not MongoDB/NoSQL:** money-movement across related entities (contract → escrow → milestones → ledger) is exactly the relational, transactional workload a document store is *worst* at. You'd have to bolt on guarantees Postgres gives for free.
- **Why Supabase:** managed Postgres (no server to run) **plus** object storage for images **plus** a generous free tier — three needs, one provider.

### 2.4 ML service — Python + FastAPI + XGBoost ℹ️
- **What:** a separate Python web service that predicts crop yield.
- **Why Python:** the ML libraries (XGBoost, pandas, scikit-learn) are Python-only and mature.
- **Why FastAPI (not Flask):** async, fast, and gives automatic request validation and API docs with almost no code.
- **Why XGBoost:** gradient-boosted trees are the go-to for **tabular** data like yours (crop, soil, season, climate) — strong accuracy without deep-learning overhead.
- **Why separate from Node:** keeps heavy Python deps out of the API, lets each service scale/deploy independently, and enables **graceful degradation** — if it's down, listings still save.

### 2.5 The key libraries (know the one-liner for each)

**Backend** (exact versions from `package.json`):
| Library | Version | What it does for you |
|---|---|---|
| `express` | ^4.18.2 | HTTP routing + middleware ✅ |
| `pg` | ^8.11.3 | PostgreSQL driver + connection pool ✅ |
| `@supabase/supabase-js` | ^2.108.2 | Uploads images to Supabase Storage |
| `jsonwebtoken` | ^9.0.2 | Sign/verify JWTs ✅ |
| `bcrypt` | ^5.1.1 | Hash/compare passwords ✅ |
| `cors` | ^2.8.5 | Allow the frontend's origin ✅ |
| `multer` | ^1.4.5-lts.1 | Parse uploaded files into `req.file.buffer` |
| `exifr` | ^7.1.3 | Read GPS from photo EXIF metadata ✅ |
| `tesseract.js` | ^5.0.4 | OCR — read GPS stamped on the photo ✅ |
| `node-cron` | ^3.0.3 | Schedule the daily price refresh |
| `axios` | ^1.6.0 | Call the ML service + data.gov.in |
| `@sendgrid/mail` | ^8.1.6 | Send OTP / notification emails ✅ |

**Frontend** (from `frontend/package.json`):
| Library | Version | What it does for you |
|---|---|---|
| `react` / `react-dom` | ^18.3.1 | The UI library ✅ |
| `react-router-dom` | ^6.24.0 | Client-side routing between pages ✅ |
| `axios` | latest | Call the backend API ✅ |
| `leaflet` + `react-leaflet` | ^1.9.4 / ^4.2.1 | The interactive map (plot farm + photo GPS) ✅ |
| `recharts` | ^2.12.7 | Dashboard charts/analytics |
| `dexie` | ^3.2.7 | IndexedDB wrapper for offline cache ℹ️ |
| `vite` | ^5.3.1 | Build tool / dev server |
| `vite-plugin-pwa` | ^0.20.0 | Makes it an installable, offline-capable PWA ℹ️ |

> **Defend any library:** name it, say the one job it does, and (bonus) why you didn't hand-roll it. Example: *"exifr reads the GPS out of the photo's EXIF metadata — I didn't want to parse the binary EXIF format myself."*

---

## 3. Data stores — where everything lives

### 3.1 PostgreSQL — the source of truth
19 tables. The important ones (full schema in Part 3):
- **`users`** — accounts, role, hashed password, OTP columns, 2FA flag.
- **`listings`** — crops for sale + ML prediction + farm GPS.
- **`crop_stages`** — growth-stage photos + GPS verification.
- **`contracts`** — offers between buyer & farmer + dispute columns.
- **`escrow`**, **`escrow_milestones`**, **`escrow_ledger`** — the money engine.
- **`idempotency_keys`** — replay-protection for money endpoints.
- **`market_prices`** — cached mandi prices.
- **`notifications`**, **`reviews`**, **`watchlist`**, plus ML/chatbot tables.

### 3.2 Supabase Storage — the images
Photos are **not** stored in the database (databases are bad at big binary blobs). They're uploaded to **Supabase Storage buckets** and the database stores the **public URL**:
- bucket **`listings`** — crop images, farm-registration images, profile images.
- bucket **`stages`** — crop-stage and crop-update photos.

Pattern: `supabase.storage.from(bucket).upload(name, buffer) → getPublicUrl(name)` → save URL in Postgres.

---

## 4. External integrations

| Provider | Purpose | On résumé? |
|---|---|---|
| **data.gov.in (Agmarknet)** | Live government mandi prices for settlement | ✅ |
| **Supabase Storage** | Image hosting (buckets above) | (implied by Supabase) |
| **Email — SMTP / SendGrid** | OTP + notification emails | ✅ (email-OTP) |
| **Groq LLM** | The RAG chatbot | ℹ️ off résumé |

**data.gov.in note:** the resource id is `9ef84268-…`; the API key is read from an env var but falls back to data.gov.in's **public sample key**, which the code documents as *not secret* — safe to mention. (Full 4-tier fallback in Part 6.)

**Email note:** verified at boot (`verifyEmailTransport`) "so a bad `EMAIL_PASS` fails loudly in the logs." A real problem you solved here (Gmail App-Password spaces) is in Part 6.

---

## 5. Deployment topology — "deployed live" ✅

```
   Vercel                Render                    Supabase
   ┌──────────┐          ┌───────────────┐         ┌──────────────────┐
   │ React     │  HTTPS   │ Node/Express   │  pg/SSL │ PostgreSQL        │
   │ static    │─────────▶│ web service    │────────▶│ + Storage buckets │
   │ build     │  (API)   │ (server.js)    │         └──────────────────┘
   └──────────┘          │  + node-cron   │         ┌──────────────────┐
                          │  + ML calls    │────────▶│ Python ML service │ (Render)
                          └───────────────┘  HTTP    └──────────────────┘
```

- **Vercel** hosts the **frontend** — it's a static build (HTML/CSS/JS), served from a CDN. Config in `frontend/vercel.json`.
- **Render** hosts the **Node backend** as a always-on web service. Config in `render.yaml`. The ML service also deploys on Render (Python), pinned to **Python 3.12.1**.
- **Supabase** hosts the **PostgreSQL database and image storage** (region `ap-south-1`).

### 5.1 The two wiring facts that make deployment work (and commonly break it)
1. **Frontend must know the backend URL.** The React app reads the API base from an env var at build time; if it's wrong, every call 404s.
2. **Backend must allow the frontend origin (CORS).** `server.js` sets `cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true })`. If `FRONTEND_URL` doesn't match the deployed Vercel URL, the browser blocks every call.

### 5.2 Cold starts (mention proactively)
On Render's free tier, an idle service sleeps; the **first request after idle is slow** while it wakes. This is the honest reason a first login can be sluggish or briefly fail — a known free-tier trade-off, not a bug.

> **Defend "deployed live":** *"Vercel serves the React build, Render runs the Node API and the Python ML service, and Supabase hosts Postgres and image storage. The two things I had to get right were the frontend's API-base env var and the backend's CORS origin — and on the free tier there's a cold-start delay on the first request after idle."*

---

## 6. Boot sequence — what happens when the backend starts

From `server.js` (verified), in order:
1. `dotenv` loads env vars.
2. Middleware chain wired: **CORS → JSON parser (10 MB) → URL-encoded parser → rate limiter on `/api` → routes → `/uploads` static → `/` health route**.
3. **Connect to Postgres first.** On success → log "✅ PostgreSQL Connected" and `app.listen(PORT)`. On failure → `process.exit(1)` (**the server refuses to start without a database** — a deliberate safety choice).
4. After listening: **start cron jobs**, **verify the email transport**, and run a **market-price self-heal** (if there's no genuine live price row for today, fetch fresh prices — but never fatal).

> **Defend the DB gate:** *"The backend won't even start if it can't reach the database — it exits with an error. I'd rather fail loudly at boot than serve requests against a missing database."*

---

## 7. Cross-cutting concern: graceful degradation ℹ️→✅ (great to volunteer)

A recurring design principle you can point to in several places:
- **ML service down?** Listing still saves (with a zero/blank prediction). Core flow unaffected.
- **Price API down?** A **4-tier fallback** (cache → live → last-verified → clearly-labelled simulated) keeps prices flowing, and the UI shows the source so nothing fake is passed off as live.
- **Bad email config?** Verified at boot so it fails *in the logs*, not silently for users.
- **Missing optional data file (e.g. `phishtank`/price seed)?** Handlers catch and continue.

> **Defend it:** *"I designed non-critical services to fail soft. If the ML model or the price feed is down, the user's core action still succeeds — the app never breaks just because an auxiliary service does."*

---

## 8. Why this stack is coherent (the summary you can say in one breath)

> *"React + Node share one language, so the whole web tier is JavaScript. Postgres is there specifically because escrow is money and needs ACID transactions and locks. Python is isolated to just the ML, because that's where the heavy, Python-only libraries live — and isolating it means the API degrades gracefully if the model is down. It's deployed across Vercel, Render, and Supabase, each doing the one thing it's best at: static hosting, running services, and managed Postgres-plus-storage."*

---

### End of Part 2

**Next:** Part 3 — the backend, file by file: `server.js`, config, middleware, cron, the GPS utils, the four core controllers in depth, a structural map of the secondary controllers, and the full 19-table database schema.
