# AgriChain — Master Guide, Part 1: Foundations & Every Concept From Basics

> **Read this first.** It explains *what* AgriChain is, *why* it exists, and then teaches **every concept the project is built on, from the ground up** — so that when you read the code in later parts, none of the words are unfamiliar. Each concept ends with **"in AgriChain →"** telling you exactly where it lives in your project.
>
> Résumé legend: **✅ ON RÉSUMÉ (defend hard)** · **ℹ️ OFF RÉSUMÉ (know the gist)** · **🎒 BACK POCKET (strongest if probed)**

---

## 1. What AgriChain is, in plain words

AgriChain is a **website where farmers and buyers make crop deals directly with each other**, without a middleman — and where the buyer's money is held safely and released bit by bit as the farmer proves the crop is actually growing.

Three real-world problems it solves:

1. **Price exploitation.** Indian farmers usually sell through middlemen and can't see the real market rate, so they get underpaid. → AgriChain shows **live government mandi prices** and settles the final payment against them.
2. **No trust in advance payment.** If a buyer pays up front, they fear the crop won't be delivered; if the farmer delivers first, they fear they won't be paid. → AgriChain uses an **escrow**: the buyer's money is *locked* by the system and *released in stages* as the crop progresses.
3. **No proof of progress.** How does a buyer know the farmer is really growing the crop? → At each growth stage the farmer uploads a **GPS-stamped photo**, and the system checks it was taken **at the registered farm**.

### The three pillars (memorise these)
1. **AI yield prediction** ℹ️ — a Python model estimates how much the crop will yield.
2. **GPS-verified milestone escrow** ✅🎒 — money locked and released stage-by-stage, each stage proven by a geo-verified photo.
3. **Market-linked settlement** ✅ — final payment tied to live government prices.

> **One-line pitch:** *"AgriChain is a full-stack agricultural marketplace where a buyer's payment sits in a concurrency-safe, milestone-based escrow and is released stage-by-stage as the farmer proves crop growth with GPS-verified photos, with final settlement against live government market prices."*

---

## 2. The absolute basics: how any web app works

Before any specific technology, understand the shape of *every* web application, including yours.

### 2.1 Client and server
- A **client** is the program the user interacts with. In your project the client is the **browser** running your React app.
- A **server** is a program running on a computer somewhere else that the client talks to over the internet. In your project the server is your **Node/Express backend**.
- The client **asks**, the server **answers**. That exchange is a **request** and a **response**.

**In AgriChain →** Browser (React) = client. Node/Express = server. They talk over HTTP.

### 2.2 The request / response cycle (the single most important idea)
Every action in your app is one round-trip:

```
   [ Browser ]  ---- HTTP REQUEST ---->  [ Server ]
   (React app)                            (Express)
                                             |
                                     does work: checks token,
                                     reads/writes the database,
                                     calls other services
                                             |
   [ Browser ]  <--- HTTP RESPONSE ----  [ Server ]
   (updates UI)      (usually JSON)
```

A **request** contains:
- a **method** (the verb — what you want to do),
- a **URL / path** (which resource — e.g. `/api/listings`),
- **headers** (metadata — e.g. `Authorization: Bearer <token>`, `Content-Type: application/json`),
- optionally a **body** (the data you're sending — e.g. the new listing's fields).

A **response** contains:
- a **status code** (a 3-digit number saying how it went),
- **headers**,
- usually a **body** (the answer, almost always **JSON** in your app).

**In AgriChain →** Your frontend uses **axios** to send requests to your backend; your backend replies with `res.json({...})`. Every feature — login, listing, contract, escrow release — is one of these cycles. Part 5 traces the important ones hop-by-hop.

### 2.3 HTTP methods (verbs) — ✅ (this is what "RESTful" means)
| Method | Means | Example in AgriChain |
|---|---|---|
| **GET** | "give me data" (read) | `GET /api/listings` → browse crops |
| **POST** | "create something new" | `POST /api/auth/signup` → make an account |
| **PUT** / **PATCH** | "update something" | `PUT /api/contracts/:id` → change contract status |
| **DELETE** | "remove something" | `DELETE /api/stages/:id` → delete a stage |

> **Defend it:** *"RESTful means my API is organised around resources — listings, contracts, escrow — and I use the HTTP verb to say what I'm doing to them: GET to read, POST to create, PUT to update, DELETE to remove."*

### 2.4 HTTP status codes (the response's "how it went")
You use these deliberately in your code — know the common ones:

| Code | Meaning | Where you return it |
|---|---|---|
| **200 OK** | success | most successful reads |
| **201 Created** | created successfully | after signup / creating a listing |
| **400 Bad Request** | caller sent something invalid | e.g. escrow not in acceptable state |
| **401 Unauthorized** | no/invalid token | `authMiddleware` when the JWT is missing or bad |
| **403 Forbidden** | logged in but not allowed | `roleMiddleware` when a buyer hits a farmer-only route; unverified email on login |
| **409 Conflict** | clashes with current state | trying to release an advance that's already released |
| **423 Locked** | resource is frozen | releasing money while a **dispute is open** |
| **429 Too Many Requests** | rate limit hit | your in-memory limiter (60 req/60s per IP) |
| **500 Server Error** | something broke on the server | uncaught errors |

> **Defend it:** *"I don't just return 200 or 500 — I use specific codes. 409 when an action conflicts with current state like a double-release, 423 when funds are frozen by a dispute, 429 for rate limiting. The frontend reacts differently to each."*

### 2.5 JSON
**JSON** (JavaScript Object Notation) is the text format for data on the web — objects in `{ }`, arrays in `[ ]`, key–value pairs. Your request bodies and response bodies are JSON.

**In AgriChain →** `express.json()` middleware parses incoming JSON into `req.body`; `res.json({...})` sends JSON back.

---

## 3. The three layers of a full-stack app — ✅

"**Full-stack**" means you built all three layers yourself:

```
┌─────────────────────────────────────────────┐
│  FRONTEND (what the user sees)                │  React + Vite  ✅
│  - pages, buttons, forms, the map, charts     │
└───────────────┬─────────────────────────────┘
                │  HTTP (axios) — JSON over the internet
┌───────────────▼─────────────────────────────┐
│  BACKEND (the brain / rules / API)            │  Node + Express  ✅
│  - auth, listings, contracts, escrow, prices  │
└───────────────┬─────────────────────────────┘
                │  SQL queries (pg driver)
┌───────────────▼─────────────────────────────┐
│  DATABASE (permanent storage)                 │  PostgreSQL (Supabase)  ✅
│  - users, listings, contracts, escrow, ledger │
└─────────────────────────────────────────────┘
```

Plus two things off to the side:
- a **Python ML service** ℹ️ the backend calls for yield predictions, and
- **external services**: the **data.gov.in** price API ✅, **Supabase Storage** for images, and an **email** service for OTPs ✅.

> **Defend "full-stack":** *"I built all three layers — the React frontend, the Node/Express backend, and the PostgreSQL database — plus a separate Python service for the ML."*

---

## 4. The frontend concepts — ✅ (React)

### 4.1 What React is
**React** is a JavaScript **library for building user interfaces out of components**. A **component** is a reusable piece of UI (a button, a card, a whole page) written as a function that returns markup.

- **JSX** — the HTML-looking syntax inside React code (`<div>{name}</div>`). It's JavaScript under the hood.
- **Props** — inputs you pass *into* a component (like function arguments).
- **State** — data a component *remembers* and that, when changed, makes the component re-render. Managed with the **`useState`** hook.
- **Hooks** — special functions starting with `use…`: `useState` (local state), `useEffect` (run code on load / when data changes), `useContext` (read shared global state).
- **SPA (Single-Page Application)** — the browser loads one HTML page, and React swaps the visible content as you navigate, instead of loading a fresh page from the server each time. Navigation is handled by **react-router-dom** (client-side routing).

> **Defend "React":** *"React lets me build the UI from reusable components. Each dashboard, the marketplace, the map — they're components. State drives what's shown, so when data changes the UI updates automatically."*

### 4.2 Why component + state matters here
Your farmer and buyer dashboards show different data and actions. With React, that's the *same* app rendering *different components* based on the logged-in user's **role** — which is exactly your **role-based dashboards** ✅.

**In AgriChain →** React 18 + Vite; pages and components in `frontend/src/`; routing via `react-router-dom`; the map via `react-leaflet`; charts via `recharts`; global login state via React Context. (Full file-by-file in Part 4.)

---

## 5. The backend concepts — ✅ (Node & Express)

### 5.1 Node.js — the runtime
Normally JavaScript only runs *inside a browser*. **Node.js** is a **runtime** that lets JavaScript run *on a server* (outside the browser). So you can write your whole backend in the same language as your frontend.

- Node is **single-threaded** but **non-blocking**: instead of waiting for slow things (database, network, disk), it starts them and moves on, handling other requests, then comes back when the result is ready. This is the **event loop**.
- That's why Node code is full of **`async`/`await`** (see §9) — you're constantly waiting on I/O without blocking.

> **Defend "Node.js":** *"Node is the runtime that lets me run JavaScript on the server. It's non-blocking, so it handles many requests efficiently while waiting on the database or network."*

### 5.2 Express — the framework
**Express** is a **framework that runs on top of Node** to make building an HTTP API easy. It gives you:
- **Routing** — "when a `POST` comes to `/api/auth/login`, run this function."
- **Middleware** — functions that run *in order* on every (or some) requests, before the final handler.

> **Defend the Node-vs-Express distinction (you were asked this):** *"Node.js is the runtime — it lets JavaScript run on the server. Express is a framework built on top of Node that gives me routing and middleware so I can define my API cleanly. Node is the engine; Express is the framework around it."*

### 5.3 Middleware — the "assembly line"
A **middleware** is a function `(req, res, next)` that runs on a request and either responds or calls `next()` to pass control along. Requests flow through a chain of them.

**In AgriChain →** your exact middleware chain (verified in `server.js`) is:
1. **CORS** (allow the frontend's origin to call the API),
2. **JSON body parser** (`express.json`, 10 MB limit),
3. **URL-encoded parser**,
4. a **global rate limiter** on `/api` (60 requests per 60 seconds per IP),
5. then the **route handlers**.

Two more middleware run on protected routes:
- **`authMiddleware`** — reads the `Authorization: Bearer <token>` header, verifies the JWT, and attaches `req.user = { id, role }`. No/invalid token → **401**.
- **`roleMiddleware("farmer", "buyer", …)`** — checks `req.user.role` is allowed; if not → **403**. This is how **role-based access** is enforced *on the server* (the real security boundary — the frontend just hides buttons).

> **Defend "middleware / RBAC":** *"Auth is a middleware: it verifies the JWT and attaches the user's id and role to the request. Then a role middleware checks that role against what the route allows. So a buyer literally cannot call a farmer-only endpoint, even if they craft the request by hand — it's enforced server-side, not just hidden in the UI."*

---

## 6. The database concepts — ✅ (SQL & PostgreSQL)

### 6.1 Relational database basics
A **relational database** stores data in **tables** (like spreadsheets). Each table has **columns** (fields) and **rows** (records).

- **Primary key** — a column that uniquely identifies each row (your tables use `id SERIAL PRIMARY KEY` — auto-incrementing integer).
- **Foreign key** — a column that points to another table's primary key (e.g. `contracts.buyer_id` → `users.id`). This is how tables *relate*.
- **SQL** (Structured Query Language) — the language to talk to the database: `SELECT` (read), `INSERT` (create), `UPDATE` (change), `DELETE` (remove).
- **JOIN** — combine rows from related tables in one query (e.g. a contract *with* its buyer's name).
- **Index** — a lookup structure that makes searches on a column fast (you have indexes on `listings.farmer_id`, `contracts.status`, `escrow.contract_id`, etc.).

> **Defend "PostgreSQL / relational":** *"My data is highly relational — a contract belongs to a listing, a buyer, and a farmer; an escrow belongs to a contract; milestones and ledger entries belong to an escrow. Foreign keys enforce those relationships, and SQL joins let me query across them."*

### 6.2 Why Postgres specifically (not MongoDB) — ✅ the killer answer
The single most important reason: **your escrow moves money, and money needs transactions and locks.** (Full explanation in §7.) A relational database like PostgreSQL gives you **ACID transactions**, **row locking**, and **strict schemas with constraints** — exactly what financial data demands. A document store like MongoDB is great for flexible, loosely-related data, but you deliberately wanted the guarantees Postgres provides.

> **Defend "why Postgres not Mongo":** *"This is money-movement data that needs ACID transactions and row-level locking so I can never double-release funds. That's a relational database's core strength, so I chose PostgreSQL rather than a NoSQL store."*

**In AgriChain →** PostgreSQL hosted on **Supabase**; accessed via the **`pg`** Node driver through a shared **connection pool** (`config/db.js`). 19 tables (full schema in Part 3).

---

## 7. Transactions, ACID, and locks — ✅🎒 (the heart of the escrow)

This is your **strongest technical material**. Understand it deeply.

### 7.1 What a transaction is
A **transaction** is a group of database operations that must **all succeed or all fail together** — never halfway. You wrap them in `BEGIN … COMMIT` (or `ROLLBACK` to undo).

**Why it matters here:** when a farmer accepts a contract, your code must (a) flip the contract to *accepted*, (b) create the escrow row, (c) write a ledger entry, and (d) create 5 milestone rows. If the server crashed after (a) but before (b), you'd have an *accepted contract with no escrow* — a broken, money-losing state. A transaction makes all four happen atomically: **either the contract is accepted AND the escrow exists, or nothing changed.**

### 7.2 ACID (what transactions guarantee)
- **A — Atomicity:** all-or-nothing (the example above).
- **C — Consistency:** the database moves from one valid state to another (constraints hold).
- **I — Isolation:** concurrent transactions don't step on each other. **You use the strictest level, `SERIALIZABLE`** — transactions behave as if they ran one after another, even when simultaneous.
- **D — Durability:** once committed, it survives a crash.

### 7.3 Locks — stopping two people at once
Even with transactions, two simultaneous requests can race. You defend against that with **locks**:

- **`SELECT … FOR UPDATE`** (row lock) — "lock this contract's row until I'm done." A second transaction touching the same row *waits*.
- **`pg_advisory_xact_lock(key)`** (advisory lock) — a named lock keyed on the contract ID, held until the transaction ends. It stops two operations on the *same contract* from running at once, **even across different server processes** — stronger and clearer than relying on row locks alone.

### 7.4 Idempotency — clicking "release" twice
**Idempotent** means *doing it twice has the same effect as doing it once.* Money endpoints must be idempotent so a double-click (or a network retry) never pays twice.

**How you do it:** the client sends an **`X-Idempotency-Key`** header (a unique string per action). The first request does the work and stores the result keyed by that string. A second request with the **same key** finds the stored result and **replays it** instead of paying again.

### 7.5 The append-only ledger — auditability
Every rupee movement is written as **one row** in `escrow_ledger` with an `entry_type` (`buffer_locked`, `advance_released`, `milestone_released`, `balance_released`, `market_adjustment`, `refund`), an `amount`, and a **`running_balance`**. It's **append-only** — you never edit or delete a row — so the full money history is auditable, like a bank statement.

> **Defend the whole thing (your single best paragraph):** *"When a farmer accepts, I open one SERIALIZABLE transaction. Inside it I take an advisory lock keyed on the contract ID so no two operations on the same contract run at once, even across processes; I do a SELECT FOR UPDATE to re-check the contract is still pending; I flip it to accepted; and in the same transaction I create the escrow, lock the funds, write the first ledger entry, and seed five milestone rows. It all commits together or not at all. Every later money release is protected the same way, plus an idempotency key so a double-click just replays the first result instead of paying twice. And every movement is one row in an append-only ledger with a running balance, so it's fully auditable. I proved the money-conservation invariants with a 53-assertion test suite."*

---

## 8. Authentication & security concepts — ✅

### 8.1 Password hashing (bcrypt)
You never store real passwords. You store a **hash** — a one-way scrambled version. **bcrypt** is the hashing algorithm; the **cost factor** (you use **10**) makes it deliberately slow, so brute-forcing is expensive. At login you **compare** the entered password against the stored hash (`bcrypt.compare`) — you never "unhash."

> **Defend it:** *"Passwords are hashed with bcrypt at cost 10 — I never store the plaintext. On login I compare against the hash."*

### 8.2 JWT — JSON Web Token ✅
After a successful login/verification, the server creates a **signed token** that proves who you are, so you don't send your password on every request.

- A JWT has three parts: **header.payload.signature**.
- Your **payload** is `{ id, role }` — the user's ID and role.
- The server **signs** it with a secret (`JWT_SECRET`) so it can't be forged or tampered with; it expires in **7 days**.
- The browser stores it and sends it as `Authorization: Bearer <token>` on every request; `authMiddleware` verifies the signature and reads `{ id, role }`.

> **Defend it:** *"On login the server signs a JWT holding the user's id and role, valid 7 days. The browser sends it on every request, and my auth middleware verifies the signature and attaches the user to the request. It's stateless — I don't keep sessions server-side."*

**Stateless vs sessions:** a JWT is **stateless** — the server doesn't store it; it just verifies the signature. (A session, by contrast, is stored server-side and referenced by a cookie.)

### 8.3 OTP — one-time password (email verification) ✅
When someone signs up, you email a **6-digit code** that **expires in 10 minutes**. They must enter it to **verify their email** before they can log in. This proves they own the email address and blocks fake signups.

- You generate it as `Math.floor(100000 + Math.random()*900000)` (always 6 digits).
- It's stored in `users.otp_code` / `otp_expires` and cleared once used.

> **Defend it:** *"On signup I email a 6-digit OTP that expires in 10 minutes; the account stays unverified until they enter it, and login is blocked until verified — so I know the email is real."*

### 8.4 RBAC — role-based access control ✅
Each user has a **role** (`farmer` or `buyer` at signup; `admin` exists but is created manually). The role lives in the JWT and is checked by `roleMiddleware` on protected routes. This is how farmer-only and buyer-only actions are enforced.

### 8.5 Optional 2FA + safe forgot-password ℹ️
- **Two-factor login** — users can opt in (`two_factor_enabled`); then login also requires an emailed OTP.
- **Anti-enumeration forgot-password** — the "forgot password" endpoint returns the **same response whether or not the email exists**, so an attacker can't discover which emails are registered.

> **Defend it:** *"Login is password-only by default, but users can enable email-OTP as a second factor. And forgot-password gives an identical response whether or not the account exists, so it can't be used to enumerate valid emails."*

---

## 9. JavaScript & runtime concepts you'll be asked about

### 9.1 Asynchronous code: promises & async/await
Slow operations (database, network, file) are **asynchronous** — they don't finish instantly. Instead of freezing, JavaScript returns a **Promise** (a placeholder for a future result). **`async/await`** is the clean syntax to wait for a promise's result without blocking the whole server.

```js
const result = await pool.query("SELECT ...");   // waits for the DB, frees Node to do other work meanwhile
```

> **Defend it:** *"Almost every backend function is async because it waits on the database or another service. `await` lets me write it linearly while Node stays non-blocking under the hood."*

### 9.2 Environment variables & secrets — ✅ (and your security rule)
**Environment variables** are configuration values kept *outside* the code (in a `.env` file locally, or in the host's dashboard in production) — things like database passwords and API keys. Code reads them via `process.env.NAME`.

- **Why:** so secrets aren't hard-coded in the source (which would leak them to GitHub), and so the same code works in dev and production with different values.
- **In AgriChain →** `DB_PASSWORD`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `EMAIL_PASS`, etc. are all env vars.

> **🔒 Your standing security rule:** real secret *values* (DB password, Supabase service key, email password, JWT secret, API keys) must **never** appear in GitHub, screenshots, reports, or slides. Refer to them **by name only**. Rotating a leaked key is a manual dashboard action. *(One exception: `marketScraper.js` has a hard-coded data.gov.in **public sample key**, which is documented in the code as explicitly not secret.)*

### 9.3 CORS — Cross-Origin Resource Sharing
Browsers block a page on one origin (e.g. your Vercel frontend) from calling an API on a different origin (your Render backend) **unless the server explicitly allows it**. **CORS** is that permission. Your backend enables it for the frontend's origin (`FRONTEND_URL`).

> **Defend it:** *"My frontend and backend are on different domains, so the browser enforces CORS. I configure the backend to allow the frontend's origin — otherwise the browser blocks the calls."*

---

## 10. Geospatial concepts — ✅ (the GPS verification)

### 10.1 GPS coordinates
A location on Earth is a **latitude** (north–south) and **longitude** (east–west), in decimal degrees. Your farms and crop-stage photos each have a lat/long.

### 10.2 EXIF metadata ✅
When a phone takes a photo, it stores hidden **metadata** inside the image file — including **GPS coordinates** and a timestamp. That's **EXIF**. You read it with the **`exifr`** library (`exifr.parse(buffer)` → `{ latitude, longitude, timestamp }`).

### 10.3 OCR — optical character recognition ✅ (the fallback)
Some GPS-camera apps *stamp* the coordinates as visible text **onto** the photo (a watermark). If the EXIF metadata is missing, you read that stamped text with **OCR** — the **`tesseract.js`** library turns the image's text into a string — and then a **regex parser** (`gpsParser`) pulls the latitude/longitude numbers out.

### 10.4 The three-tier location chain (know all three) ✅
Your `createStage` handler tries, in order:
1. **EXIF** (`gps_source = "exif"`) — read metadata from the file.
2. **OCR** (`gps_source = "ocr"`) — if EXIF is missing, read the stamped watermark text and parse it.
3. **Client coordinates** (`gps_source = "client"`) — as a **last resort**, use the coordinates the browser/device sent with the upload.

> **Note:** your résumé says "EXIF metadata (with OCR fallback)" — 100% accurate. If asked *"what if both fail?"* your honest answer is: *"as a last resort I use the coordinates the browser reports at upload time."*

### 10.5 Haversine distance ✅
To check the photo was taken at the farm, you compute the **great-circle distance** between the photo's point and the registered farm's point — the **Haversine formula** (accounts for the Earth's curvature). Your `distanceHelper` uses Earth radius **6,371,000 m**, so the result is in **metres**. If it's **≤ 500 m**, the stage is marked **`gps_verified = true`**.

> **Defend it:** *"Each stage photo carries GPS — from EXIF, or OCR of the stamp, or the device as a fallback. I compute the Haversine distance from the registered farm; within 500 metres, I mark the stage GPS-verified. Then I plot both points on a Leaflet map so the verification is visible."*

**Honesty note (keep ready):** the GPS gate is *soft* — it records `gps_verified` and shows it, and the milestone-release path checks it, but you'd call it "verification with a tolerance," not a hard cryptographic proof.

---

## 11. External integrations — ✅ / ℹ️

- **data.gov.in Agmarknet API** ✅ — the Indian government's open **mandi (market) price** data. You call it for the current price of a crop, used in settlement. (4-tier fallback when it's down — Part 6.)
- **Supabase Storage** — an object store (like a file bucket) where uploaded **images** live (buckets `listings` and `stages`); the database stores the public URL, not the image bytes.
- **Email (SMTP / SendGrid)** ✅ — sends the OTP and notification emails.
- **Groq LLM + RAG** ℹ️ — powers the chatbot (off résumé).

---

## 12. Deployment concepts — ✅

- **Localhost vs deployed:** on your laptop everything runs on `localhost`. **Deployed** means it runs on servers on the internet, reachable by a public URL.
- **Static hosting (Vercel)** — the frontend is just built HTML/CSS/JS files, served fast from a CDN. **Vercel** hosts your React build.
- **PaaS / web service (Render)** — the backend is a running program that needs a live server. **Render** runs your Node process.
- **Managed database (Supabase)** — **Supabase** hosts your PostgreSQL database (and the image storage).
- **Cold starts** — on Render's free tier, an idle backend "sleeps"; the first request after idle is slow (it "wakes up"). Good to mention proactively as a known trade-off.
- **CORS + env wiring** — the deployed frontend must know the backend's URL (an env var), and the backend must allow the frontend's origin (CORS). Getting those two to match is the classic deployment gotcha.

> **Defend "deployed live":** *"It's genuinely live: Vercel serves the React frontend, Render runs the Node backend, and Supabase hosts the PostgreSQL database and image storage. Not just on my laptop."*

---

## 13. Machine-learning basics — ℹ️ (off résumé, but know the gist)

You dropped ML from the résumé, but the interview script uses it, so know the shape:

- **Regression** — predicting a **number** (here, crop **yield in tonnes**), as opposed to classification (predicting a category).
- **Features** — the inputs the model learns from: crop, land size, soil type, irrigation, season, rainfall, temperature, location.
- **One-hot encoding** — turning a category like soil type into many 0/1 columns (one per possible value). This is why the model has *hundreds* of feature columns.
- **XGBoost** — the algorithm: gradient-boosted decision trees, strong for tabular data.
- **Training vs prediction** — you *train* the model once on historical data (offline), then the live service just *predicts* from the trained model.
- **R² (≈0.87)** — "how much of the variation the model explains," 1.0 is perfect. **MAPE (≈30%)** — average percentage error. Frame it honestly: **"decision-support, not precision."**
- **Graceful degradation** — if the ML service is slow/down, the backend still saves the listing (just without a yield number). Never let a non-critical service break the core flow.

> **Defend it (if asked):** *"A separate Python FastAPI service runs an XGBoost regressor to predict yield from the farm's inputs and climate. R² is about 0.87 — I treat it as decision-support, not a precise guarantee. It's isolated so that if it's down, listings still work."*

---

## 14. How it all connects (the 60-second mental model)

```
Farmer signs up (bcrypt + email OTP) ──► gets JWT
   │
   ├─► creates a listing ──► backend calls Python ML ──► yield prediction saved
   │
Buyer browses marketplace ──► sends contract offer (quantity, price, buffer%)
   │
Farmer ACCEPTS ──► [ONE SERIALIZABLE TRANSACTION]
   │                 advisory lock + SELECT FOR UPDATE
   │                 → contract = accepted
   │                 → escrow created, funds LOCKED (default 110%)
   │                 → ledger entry "buffer_locked"
   │                 → 5 milestone rows seeded (15/15/20/20/10 style)
   │
Crop grows ──► farmer uploads stage photo
   │           → GPS from EXIF → OCR → client
   │           → Haversine distance to farm ≤ 500 m ? → gps_verified
   │           → plotted on Leaflet map
   │
Buyer releases each milestone (idempotent, locked, ledgered)
   │
Harvest ──► SETTLE:
             pay MAX(offered, live mandi price) × qty,
             CAPPED at total_locked,
             refund leftover buffer to buyer,
             ledger it all.
```

That diagram *is* your project. Everything in Parts 3–6 is the detail behind one of those arrows.

---

### End of Part 1

**Next:** Part 2 — the tech stack (what each technology is, **why you chose it, and why not the alternative**) and the full architecture: the four services, how they connect, the deployment topology, and graceful degradation.
