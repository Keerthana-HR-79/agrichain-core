# AGRICHAIN — THE COMPLETE BIBLE

> **The single, exhaustive, from-basics study document for the entire AgriChain project.**
>
> This teaches **every concept from zero** (as if you've never heard of JWT, escrow, or XGBoost), then shows **exactly how each is used in AgriChain**, documents **every source file**, traces **how a request travels and is answered**, and folds in **everything from the Master Guide, Problems-Solved, and Interview-Script** docs.
>
> **How this differs from the other docs:** the Master Guide is a *reference*; this is a *textbook*. Every section goes **Concept (from basics) → Why we chose it → Why not the alternatives → How it's implemented here → How it actually works line-by-line.**
>
> **Ground rules:** follow the code over any older note; secrets are referenced by env-var **name** only (never values); honest framing throughout (real metrics, mocked payments called out).
>
> **Source of truth:** re-verified against the live file tree in `D:\claude\agrichain` on 2026-09-30.

---

## MASTER TABLE OF CONTENTS

- **PART 0** — How to use this bible
- **PART 1** — The project from zero (what, why, who)
- **PART 2** — Every concept, from basics
  - 2A. Web fundamentals (client/server, HTTP, REST, JSON, architecture styles)
  - 2B. Authentication & authorization (hashing, bcrypt, JWT, OTP/2FA, RBAC)
  - 2C. Databases & money-safety (SQL, ACID, transactions, isolation, locks, idempotency, escrow)
  - 2D. Location & vision (GPS, EXIF, OCR, Haversine)
  - 2E. Machine learning (from basics → XGBoost → metrics)
  - 2F. Generative AI (LLM, RAG, function-calling/agents)
  - 2G. Platform (PWA, offline, cron, env vars, CORS, rate limiting, uploads)
- **PART 3** — The full tech stack: what / why this / why not that
- **PART 4** — Architecture & end-to-end connections
- **PART 5** — The request pipeline (traced in full)
- **PART 6** — Backend, file by file
- **PART 7** — Frontend, file by file
- **PART 8** — AI service, file by file
- **PART 9** — Deep dives (escrow · JWT+RBAC · GPS/OCR · ML · RAG/agent · market · PWA)
- **PART 10** — Database schema, table by table
- **PART 11** — Problems solved (root cause → fix)
- **PART 12** — Interview Q&A bank
- **PART 13** — Résumé lines
- **PART 14** — Glossary
- **PART 15** — Numbers cheat-sheet

---

# PART 0 — HOW TO USE THIS BIBLE

- **First read:** Part 1 (what the project is) → Part 2 (concepts) → Part 4 (architecture). That's the mental model.
- **Before an interview:** Part 5 (pipeline) + Part 9 (deep dives) + Part 12 (Q&A) out loud.
- **When they ask about a specific file:** Parts 6–8.
- **When they ask "explain a concept":** Part 2 has it from basics.
- **The distinction to keep straight:** a **concept** (e.g. "what is a transaction") vs **our implementation** (e.g. "how our accept-contract uses one). This doc always gives both.

---

# PART 1 — THE PROJECT FROM ZERO

### 1.1 What it is (one sentence)
AgriChain is an **AI-powered online marketplace where farmers and buyers sign digital crop contracts**, the buyer's money is held safely in **escrow** and released in stages as the farmer **proves crop growth with GPS-verified photos**, and the final payment tracks **live government market prices**.

### 1.2 The real-world problem (why it exists)
Indian agriculture has three chronic failures:
1. **Price exploitation.** A farmer sells to a middleman who names a price. The farmer has no way to see the real *mandi* (market) rate, so they routinely get underpaid.
2. **No trust for forward deals.** A "forward contract" means a buyer agrees today to buy a crop that will be ready in 4 months. Whoever pays first carries all the risk: if the buyer pays an advance, the farmer might not deliver; if the farmer plants on a promise, the buyer might not pay.
3. **No yield visibility.** A buyer looking at a listing has no idea whether this farm will actually produce 2 tonnes or 20.

### 1.3 How AgriChain answers each (the three pillars)
| Problem | Pillar | One-line mechanism |
|---|---|---|
| Price exploitation | **Market-linked settlement** | Final payout tracks the official data.gov.in mandi price; farmer gets the *higher* of agreed vs market |
| No trust | **GPS-verified milestone escrow** | Money is locked up front and released stage-by-stage only when the farmer *proves* growth from the real farm location |
| No yield visibility | **AI yield prediction** | An XGBoost model estimates tonnage + a confidence band on every listing |

### 1.4 Who uses it (the three roles)
- **Farmer** — registers a farm, lists crops, uploads GPS stage photos, accepts/rejects contract offers, receives staged payments.
- **Buyer** — browses the marketplace, offers contracts, funds the escrow, releases milestone payments, settles at harvest.
- **Admin** — verifies farms, manages users and listings, resolves disputes, monitors the ML model's health, broadcasts notices. (Admins are provisioned directly, not via public signup.)

### 1.5 What "done" looks like (the lifecycle in one breath)
List → predict yield → buyer offers → farmer accepts (money locked at 110%) → farmer proves each growth stage by GPS photo → buyer releases each milestone → harvest → settle at higher-of-price (capped at locked) → refund leftover buffer → both parties review. Every rupee movement is recorded in an append-only ledger.

### 1.6 Live deployment (it's real, not localhost-only)
Four services deployed across three platforms: **Frontend on Vercel**, **Backend + AI service on Render**, **PostgreSQL + file storage on Supabase** (region ap-south-1, Mumbai). This matters in interviews — you shipped it, you didn't just build it.

---

# PART 2 — EVERY CONCEPT, FROM BASICS

> This is the textbook section. Each concept: **plain-English basics → where AgriChain uses it.** If you can teach these, you can answer almost anything.

## 2A. WEB FUNDAMENTALS

### 2A.1 Client, server, frontend, backend, database
- **Client** = the program the user directly touches. Here, the web app running in the user's **browser**.
- **Server** = a program running on a remote computer, waiting for requests and sending back answers. Here, the Node/Express API.
- **Frontend** = everything that runs in the browser: the visual pages, buttons, forms (React).
- **Backend** = the server-side logic: checking passwords, running business rules, talking to the database.
- **Database** = the permanent store of data (users, listings, contracts) that survives even when servers restart (PostgreSQL).
- **Analogy:** frontend = the waiter (takes your order, brings your food), backend = the kitchen (cooks, enforces rules), database = the pantry (stores ingredients). The waiter never cooks; the customer never enters the kitchen.
- **In AgriChain:** the browser (client/frontend) talks **only** to the Node backend; the backend is the only thing that talks to the database, the ML service, and outside APIs. This single-hub rule is a deliberate security boundary.

### 2A.2 HTTP — how a client and server talk
- **HTTP** is the language of the web: the client sends a **request**, the server sends back a **response**. One request → one response.
- A **request** has four parts: a **method** (the verb), a **URL/path** (the address), **headers** (metadata like who you are), and an optional **body** (data you're sending).
- **Methods (verbs):**
  - `GET` = read/fetch something (no side effects). *"Give me all listings."*
  - `POST` = create something new. *"Create this contract."*
  - `PUT` = update/replace something. *"Accept this contract."*
  - `DELETE` = remove something. *"Delete this listing."*
- **Status codes (the response's headline number):**
  - `2xx` success — `200 OK`, `201 Created`
  - `4xx` **you** (client) did something wrong — `400 Bad Request`, `401 Unauthorized` (not logged in), `403 Forbidden` (logged in but not allowed), `404 Not Found`, `409 Conflict` (duplicate), `423 Locked` (temporarily frozen), `429 Too Many Requests` (rate-limited)
  - `5xx` **the server** broke — `500 Internal Server Error`
- **In AgriChain:** every feature is one or more HTTP endpoints. Accepting a contract is `PUT /api/contracts/:id/accept`. A frozen (disputed) escrow returns `423`. A double-submitted review returns `409`. Not-logged-in returns `401`; wrong-role returns `403`.

### 2A.3 REST API
- **API** = Application Programming Interface = a defined set of requests a program agrees to answer.
- **REST** = a popular *style* for HTTP APIs: you model everything as **resources** (nouns) addressed by URLs, and you act on them with the HTTP methods (verbs). `GET /listings` (read all), `GET /listings/5` (read one), `POST /listings` (create), `PUT /listings/5` (update), `DELETE /listings/5` (delete).
- **Why REST:** predictable, uses plain HTTP, easy for any client (browser, mobile, curl) to consume.
- **In AgriChain:** the backend exposes ~79 REST endpoints across 20 resource groups (`/api/auth`, `/api/listings`, `/api/contracts`, `/api/escrow`, …).

### 2A.4 JSON
- **JSON** (JavaScript Object Notation) = the standard text format for sending structured data. It's just keys and values: `{"crop": "Rice", "quantity": 10}`.
- **Why:** human-readable, native to JavaScript, understood by every language (including Python).
- **In AgriChain:** every request/response body is JSON (except file uploads, which use multipart — see 2G.6). The JWT payload, the AI service's prediction, the ledger's stored results — all JSON.

### 2A.5 Architecture styles: monolith vs microservices
- **Monolith** = one single program does everything (UI serving, business logic, ML, DB access) in one deployable unit. Simple to start; hard to scale one part independently; one heavy dependency bloats everything.
- **Microservices** = the system is split into several small programs, each owning one job, talking over the network. More moving parts; but each can be built, scaled, deployed, and fail **independently**.
- **In AgriChain:** a deliberate **partial** split into **4 services** along real seams — notably the **Python ML service is separate from the Node API** because ML libraries are Python-only and heavy. This isn't "microservices for buzzword's sake"; it's split where the language/dependency boundary is real. The frontend and DB are naturally separate tiers.

### 2A.6 CORS (why the browser blocks cross-site calls)
- Browsers enforce the **Same-Origin Policy**: by default, a page served from `agrichain.vercel.app` cannot make requests to `agrichain-backend.onrender.com` (different origin) — this stops malicious sites calling your bank's API using your cookies.
- **CORS** (Cross-Origin Resource Sharing) is the server's way of saying "these specific other origins are allowed to call me," via response headers.
- **In AgriChain:** the backend uses the `cors` middleware configured with the frontend's origin (`FRONTEND_URL`), so the deployed React app is allowed to call the deployed API. (The AI service uses `allow_origins=["*"]` since it's only ever called server-to-server.)

## 2B. AUTHENTICATION & AUTHORIZATION

### 2B.1 The two words people confuse
- **Authentication (authn)** = *"Who are you?"* Proving identity (logging in with email + password).
- **Authorization (authz)** = *"What are you allowed to do?"* Checking permissions (only a farmer can accept a contract).
- You authenticate **first**, then authorize. In AgriChain these are two separate middleware layers: `authMiddleware` (authn) runs, then `roleMiddleware` (authz).

### 2B.2 Password hashing & bcrypt (from basics)
- **Never store passwords as plain text.** If the DB leaks, every account is instantly compromised.
- A **hash** is a one-way function: `hash("mypassword")` → a fixed scrambled string, and you *cannot* reverse it back to the password. To check a login, you hash the entered password and compare hashes.
- A **salt** is random data mixed into each password before hashing, so two users with the same password get different hashes, and precomputed "rainbow table" attacks fail. bcrypt generates and embeds the salt automatically.
- **Cost factor (work factor)** = how slow the hash is on purpose. Slower = harder to brute-force. bcrypt's cost of 10 means 2¹⁰ = 1024 rounds of key expansion.
- **bcrypt** is a password-hashing algorithm designed to be deliberately slow and salted — the industry standard for passwords.
- **In AgriChain:** `authController.signup` calls `bcrypt.hash(password, 10)` before storing; `login` calls `bcrypt.compare(entered, storedHash)`. The plain password is never stored or logged.

### 2B.3 JWT — JSON Web Tokens (the big one, from basics)
**The problem it solves:** HTTP is *stateless* — the server doesn't remember you between requests. After you log in, how does the *next* request prove it's still you? Two options:
- **Sessions:** the server stores "session 123 = user Priya" in memory/DB and gives you a session ID cookie. Works, but the server must *remember* every logged-in user — and across 4 separate services that shared memory is a pain.
- **JWT (what we use):** the server gives you a **self-contained signed token**. The token itself *contains* who you are, and it's cryptographically signed so it can't be forged. The server doesn't need to remember anything — it just verifies the signature. This is **stateless auth**, ideal for separated services.

**Structure of a JWT** — three Base64 parts joined by dots: `header.payload.signature`
1. **Header** — metadata: `{"alg": "HS256", "typ": "JWT"}` (the signing algorithm).
2. **Payload** — the "claims" = the data. In AgriChain: `{"id": 42, "role": "farmer", "iat": ..., "exp": ...}`. **Important: the payload is only Base64-encoded, NOT encrypted — anyone can read it.** So you never put secrets in it. `iat` = issued-at, `exp` = expiry.
3. **Signature** — the security. Computed as `HMAC-SHA256(base64(header) + "." + base64(payload), SECRET_KEY)`. Only the server knows `SECRET_KEY` (our `JWT_SECRET` env var).

**How verification works (why it can't be forged):** when a request comes in with a token, the server recomputes the signature over the header+payload using its secret. If the attacker changed the payload (say, `role: "farmer"` → `role: "admin"`), the recomputed signature won't match the token's signature → rejected. Since the attacker doesn't know `JWT_SECRET`, they can't produce a valid signature for tampered data.

**HMAC-SHA256** = a keyed hash: it mixes the data with a secret key to produce a fingerprint that only someone with the key can produce or verify. `HS256` is the JWT name for it.

**Lifecycle in AgriChain:**
1. Login succeeds → `jwt.sign({id, role}, JWT_SECRET, {expiresIn: "7d"})` → token returned to the browser.
2. Browser stores it in **localStorage** and attaches it on every request as the header `Authorization: Bearer <token>` (an axios request interceptor does this automatically).
3. `authMiddleware` runs `jwt.verify(token, JWT_SECRET)` → on success sets `req.user = {id, role}`; on failure (bad signature or expired) → `401`.
4. After 7 days the token expires → next request 401 → the frontend's response interceptor clears storage and redirects to login.

**Honest security notes (say these if probed):** the token lives in localStorage, which is simple but readable by any JavaScript running on the page (an XSS risk); a more hardened design uses httpOnly cookies + short-lived tokens + refresh tokens. The payload is readable, so it holds only `id` and `role`, never secrets.

### 2B.4 OTP and 2FA
- **OTP** (One-Time Password) = a short code, valid once, for a short time, sent to something you control (your email). It proves you actually own that email/phone.
- **2FA / MFA** (Two/Multi-Factor Authentication) = requiring *two* kinds of proof: something you **know** (password) + something you **have** (access to your email for the OTP). Even if your password leaks, an attacker can't log in without your inbox.
- **In AgriChain:** signup requires **email-OTP verification** (a 6-digit code, 10-minute expiry) to activate the account. Login optionally requires OTP if the user turned on 2FA. The email is sent via SendGrid (see 2G).
- **Honest note:** the OTP is generated with `Math.random` (not the cryptographically-secure `crypto`) and stored in plain text — fine for a student project, but production would use `crypto.randomInt` and hash the stored OTP.

### 2B.5 Role-Based Access Control (RBAC)
- **RBAC** = permissions are attached to **roles**, and users are given roles. Instead of "can user 42 accept contracts?", you ask "is user 42 a *farmer*?" — much simpler to manage.
- **In AgriChain:** three roles — `farmer`, `buyer`, `admin` — baked into the JWT. A `roleMiddleware(...allowedRoles)` factory guards each endpoint. Example: `PUT /contracts/:id/accept` is wrapped with `roleMiddleware("farmer")`, so a buyer's valid token still gets `403 Forbidden`. Admin routes do `router.use(authMiddleware, roleMiddleware("admin"))` to guard the whole router at once.
- **Key point for interviews:** the *real* enforcement is server-side (this middleware). The frontend also hides buttons by role, but that's just UX — a determined user could call the API directly, and the server is what stops them.

## 2C. DATABASES & MONEY-SAFETY

### 2C.1 Relational databases & SQL (from basics)
- A **relational database** stores data in **tables** (like spreadsheets): each table has **columns** (fields) and **rows** (records).
- **SQL** (Structured Query Language) is how you talk to it: `SELECT` (read), `INSERT` (create), `UPDATE` (change), `DELETE` (remove).
- **Primary key** = a column that uniquely identifies each row (usually `id`). **Foreign key** = a column that points to another table's primary key, creating a **relationship** (e.g. `listings.farmer_id` → `users.id` means "this listing belongs to that user").
- **Relationships:** one-to-many (one user has many listings), one-to-one (one contract has one escrow), many-to-many (via a join table).
- **In AgriChain:** 20 tables. The spine: `users` → `listings` → `contracts` → `escrow` → `escrow_milestones` + `escrow_ledger`. See Part 10 for every table.

### 2C.2 SQL vs NoSQL (why PostgreSQL)
- **SQL databases** (PostgreSQL, MySQL): structured tables, enforced relationships, and — crucially — **transactions** (see below). Best when data is relational and correctness matters.
- **NoSQL databases** (MongoDB, Firestore): flexible document/key-value stores, easy to scale horizontally, but historically weaker at multi-record atomic operations and relationships.
- **Why AgriChain uses PostgreSQL:** the data is deeply relational (users→listings→contracts→escrow→ledger) and it moves **money**, which demands ACID transactions, row locking, and serializable isolation — all first-class in Postgres. A NoSQL store would make safe multi-row money movement much harder.

### 2C.3 ACID (from basics)
The four guarantees a good database gives a transaction:
- **A — Atomicity:** all-or-nothing. A group of changes either *all* happen or *none* do. (Accept-contract updates the contract AND creates the escrow AND writes the ledger — all together, or nothing.)
- **C — Consistency:** the DB moves from one valid state to another; constraints (foreign keys, CHECKs, UNIQUEs) are never violated.
- **I — Isolation:** concurrent transactions don't corrupt each other; each behaves as if it ran alone (tunable — see isolation levels).
- **D — Durability:** once committed, it survives crashes/power loss (it's on disk).

### 2C.4 Transactions (from basics)
- A **transaction** is a group of database operations treated as ONE atomic unit: `BEGIN` → do stuff → `COMMIT` (make it permanent) or `ROLLBACK` (undo everything).
- **Why it matters for money:** imagine transferring ₹100 = "subtract from A" + "add to B". If the server crashes between the two, money vanishes. A transaction guarantees both or neither.
- **In AgriChain:** the accept-contract flow wraps *five* operations (update contract, insert escrow, insert ledger, seed milestones, insert notification) in one transaction. If any fails, ALL roll back — you can never end up with an accepted contract that has no escrow. Implemented with a `withTransaction` helper that `BEGIN`s, runs your code, `COMMIT`s, and `ROLLBACK`s on any thrown error, then releases the DB connection back to the pool.

### 2C.5 Isolation levels & race conditions (from basics)
- When two transactions run **at the same time**, they can interfere. A **race condition** is when the outcome depends on unlucky timing. Classic example: two requests both read "balance = ₹100", both subtract ₹100, both write "₹0" — but two withdrawals happened. This is a **lost update**.
- **Isolation levels** control how much concurrent transactions can see of each other, from loosest to strictest:
  1. **Read Uncommitted** — can see others' uncommitted changes (dirty reads). Dangerous.
  2. **Read Committed** — only sees committed data (Postgres default).
  3. **Repeatable Read** — same rows read twice give the same result within a transaction.
  4. **Serializable** — the strictest: transactions behave as if they ran **one after another**, never overlapping. The DB detects conflicts and forces one to retry.
- **In AgriChain:** every money-moving transaction (accept, release, settle) runs at **SERIALIZABLE** — the strongest guarantee — so concurrent releases on the same escrow can't interleave into a wrong total.

### 2C.6 Locks: row locks and advisory locks (from basics)
- A **lock** makes other transactions *wait* until you're done with a piece of data.
- **Row lock** via `SELECT ... FOR UPDATE`: "I'm about to change this row; anyone else who wants it must queue behind me until I commit." Prevents two transactions grabbing the same escrow row simultaneously.
- **Advisory lock** via `pg_advisory_xact_lock(key)`: an *application-defined* lock — it doesn't lock a row, it locks a *number you choose* (here, the contract ID). It's a mutex (mutual-exclusion gate) you control, held until the transaction ends, and it works **across different server processes**. Useful to serialize *all logic* for one contract, not just the row write.
- **In AgriChain:** `releaseMilestone` takes `pg_advisory_xact_lock(contract_id)` (only one release per contract runs at a time, even across Render instances) AND `SELECT ... FOR UPDATE` on the escrow + milestone rows. Belt and suspenders.

### 2C.7 Idempotency (from basics)
- An operation is **idempotent** if doing it *twice* has the *same effect* as doing it *once*. `GET` is naturally idempotent (reading twice changes nothing). `POST`/"pay money" is naturally **not** — pay twice = paid twice.
- **Idempotency key:** the client generates a unique ID for an operation and sends it in a header (`X-Idempotency-Key`). The server records "I've handled this key, here's the result." If the same key arrives again (retry, double-click, flaky network), the server **returns the saved result instead of re-doing the work**.
- **In AgriChain:** every escrow money movement accepts `X-Idempotency-Key`. The key + its JSON result are stored in an `idempotency_keys` table with a UNIQUE constraint. A duplicate request replays the stored result → money is never released twice, even if the buyer clicks "Release" five times.

### 2C.8 Escrow (from basics → software)
- **Escrow in real life:** a neutral third party holds money until agreed conditions are met. When you buy a house, your payment sits with an escrow agent; the seller only gets it once the title transfers. It protects *both* sides.
- **Escrow in AgriChain (software):** when a farmer accepts a contract, the buyer's money is "locked" in the system (represented in the `escrow` and `escrow_ledger` tables — the actual payment gateway is mocked, but the accounting is real). It's released in **milestones** tied to proven crop stages, and finally **settled** at harvest. Neither party can grab the money early; the rules are enforced by code + database constraints.
- **Key mechanics** (full math in Part 9.1):
  - **110% locked** — a 10% buffer above contract value, so if the market price rises the farmer can still be paid the higher amount.
  - **Milestone schedule** — advance 15%, then 15/20/20/10% across four growth stages = 80% released progressively; the remainder settles at harvest.
  - **Settlement** — farmer paid the *higher* of contracted vs live market price, **capped** at the locked total; leftover refunded to buyer.
  - **Append-only ledger** — every movement is one immutable row; the ledger always nets to zero (`released + refund = total_locked`).
  - **Dispute freeze** — an open dispute returns `423` on every money endpoint.

## 2D. LOCATION & VISION

### 2D.1 GPS & geographic coordinates (from basics)
- **GPS** (Global Positioning System) = satellites let a device compute where it is on Earth.
- A location is a pair of numbers: **latitude** (how far north/south, −90 to +90) and **longitude** (how far east/west, −180 to +180), in decimal degrees, e.g. `12.9716, 77.5946` (Bangalore).
- The distance between two lat/long points on a *sphere* isn't a straight line — it's an arc over the curved surface (a **great-circle distance**). You need the Haversine formula (2D.4) to compute it correctly.
- **In AgriChain:** every farm has registered coordinates; every stage photo carries coordinates; we compare the two to verify the farmer is at their farm.

### 2D.2 EXIF metadata (from basics)
- **EXIF** (Exchangeable Image File Format) = hidden metadata baked into a photo file by the camera: timestamp, camera model, and — if location is on — **GPS coordinates**.
- So a photo taken by a phone with location enabled *already contains* where it was taken, invisibly, inside the file.
- **In AgriChain:** the **first** attempt to get a stage photo's location reads the EXIF GPS tags using the `exifr` library. It's the most trustworthy source because the camera wrote it at capture time.

### 2D.3 OCR — Optical Character Recognition (from basics)
- **OCR** = turning a *picture of text* into *actual text characters*. It's how you scan a receipt and get editable text, or how a photo of a page becomes searchable.
- How it works, simply: the OCR engine finds shapes that look like letters, matches them against trained character patterns, and outputs the recognized string.
- **Tesseract** is the leading open-source OCR engine; **Tesseract.js** is its JavaScript port that runs in Node without external services.
- **In AgriChain, OCR is used in two places:**
  1. **Farm registration:** at listing time, OCR reads the uploaded land-registration document to auto-extract the farm's GPS coordinates.
  2. **GPS-stamp fallback:** many farmers use "GPS camera" apps that **burn the coordinates as a visible watermark** onto the photo. If EXIF is missing (some apps strip it), OCR reads that watermark text, and a regex (`gpsParser`) pulls the lat/long numbers out.

### 2D.4 The Haversine formula (from basics, with the math)
- **The problem:** given two lat/long points, how many meters apart are they *over the Earth's curved surface*?
- **The Haversine formula** computes great-circle distance. In words: convert the latitude/longitude differences to radians, apply a specific trig formula, multiply by Earth's radius.
- The formula:
  ```
  a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlong/2)
  c = 2·atan2(√a, √(1−a))
  distance = R · c        where R = 6,371,000 meters (Earth's radius)
  ```
- You don't need to memorize the trig — just know: *"it's the standard formula for distance between two GPS points on a sphere, and I used Earth's radius of 6,371 km."*
- **In AgriChain:** `utils/distanceHelper.js` implements exactly this with `R = 6371000` (meters). If `distance ≤ 500 m`, the stage is `gps_verified = true`. 500 m tolerates GPS drift and a large field while still proving "you're really at this farm, not in another city."

## 2E. MACHINE LEARNING (from basics)

### 2E.1 What machine learning is
- **Traditional programming:** you write the rules, the computer applies them. `if rainfall > X and soil == Y then yield = Z` — but nobody can write those rules accurately for crop yield.
- **Machine learning:** you show the computer thousands of *examples* (past farms: their inputs AND their actual yields), and it **learns the pattern** itself. Then it predicts on new, unseen inputs.
- This is **supervised learning**: you train on labeled examples (inputs + known correct answers).

### 2E.2 Regression vs classification
- **Classification** predicts a *category*: spam/not-spam, cat/dog. Discrete labels.
- **Regression** predicts a *number*: house price, temperature, **crop yield in kg/ha**. Continuous values.
- **In AgriChain:** yield prediction is a **regression** problem — we predict a continuous number (kilograms per hectare).

### 2E.3 Features and labels
- **Features (X)** = the inputs the model learns from: crop type, state, season, area, rainfall, temperature, soil.
- **Label / target (y)** = the answer we want to predict: yield.
- The model learns a function `f(features) → label` from the training data.
- **In AgriChain:** features are crop, state, district, season, area, and engineered climate values; the target is yield per hectare, later multiplied by area to get total tonnage.

### 2E.4 Train/test split & overfitting (from basics)
- You **split** your data: train the model on ~85%, then **test** it on the remaining ~15% it has *never seen*. This measures whether it actually learned the pattern or just memorized.
- **Overfitting** = the model memorizes the training data (including its noise) and fails on new data — like a student who memorized the answer key but can't solve new problems. The test set catches this.
- **In AgriChain:** `test_size=0.15`, `random_state=42` (a fixed seed so the split is reproducible). ~247k rows → ~210k train / ~37k test.

### 2E.5 Decision trees → gradient boosting → XGBoost (from basics)
- **Decision tree:** a flowchart of yes/no questions on features. *"Is rainfall > 800mm? → Is crop rice? → predict 3.2 t/ha."* Simple, but a single tree is weak and overfits.
- **Ensemble:** combine many trees for a stronger, more stable prediction.
- **Gradient boosting:** build trees **one at a time**, where each new tree is trained to fix the *errors* (residuals) of the trees so far. It "boosts" accuracy step by step by chasing the remaining mistakes.
- **XGBoost** (eXtreme Gradient Boosting) = a highly optimized, regularized, fast implementation of gradient boosting. It's the go-to for tabular (spreadsheet-like) data and famously dominates ML competitions on such data.
- **Why XGBoost for AgriChain:** crop data is tabular; XGBoost gives top-tier accuracy on tabular data, handles non-linear feature interactions automatically, trains fast, and exports to a simple `.pkl` file we can load in the FastAPI service.
- **Config used:** `objective=reg:squarederror` (standard regression loss), `tree_method=hist` (fast histogram-based training), tuned by **Optuna** (20 trials of automatic hyperparameter search), seed 42.

### 2E.6 One-hot encoding (from basics)
- Models need **numbers**, but crop = "Rice" is text. **One-hot encoding** turns a category into a set of 0/1 columns: `crop_Rice=1, crop_Wheat=0, crop_Cotton=0, …`. Each possible value becomes its own yes/no column.
- This is why the model has **643 feature columns** — every crop, state, district, and season becomes its own column. The exact column list is saved as `model_columns.pkl` so prediction builds an identical row.
- **Critical implementation detail:** at prediction time, the incoming request is one-hot encoded and then **reindexed to the exact 643 training columns** (missing columns filled with 0). If you skip this, the column order/count mismatches and the model gives garbage — this was a real bug that was fixed (see Part 11).

### 2E.7 Log transform: log1p / expm1 (from basics)
- **The problem:** yield values are **skewed** — most farms have modest yields, a few have huge ones. This long tail makes the model over-focus on the big values and predict poorly.
- **The fix:** train on `log1p(yield)` = `log(1 + yield)`, which compresses the big values and spreads out the small ones into a nicer bell-ish shape the model handles better.
- At prediction time you invert it with `expm1(x)` = `exp(x) − 1` to get back a real yield number.
- The `1+` (that's the "1p") avoids `log(0)` when yield is zero.
- **In AgriChain:** the model predicts in log-space; inference applies `expm1` to return actual kg/ha.

### 2E.8 Evaluation metrics: R², MAE, MAPE (from basics)
- **R² (R-squared, coefficient of determination):** how much of the variation in yield the model explains, from 0 to 1. **1.0 = perfect**, 0 = no better than always guessing the average. **AgriChain: R² = 0.8742** → the model explains ~87% of yield variation. Solid for messy real-world agricultural data.
- **MAE (Mean Absolute Error):** on average, how far off the prediction is, in the real unit. **AgriChain: MAE = 25,061.59 kg/ha** — sounds large, but yields span a huge range across crops.
- **MAPE (Mean Absolute Percentage Error):** the average error as a percentage. **AgriChain: MAPE = 29.79%** → predictions are on average ~30% off.
- **Honest framing for interviews:** "R²≈0.87 is strong for real agricultural data, but MAPE≈30% means it's **decision-support, not a precision instrument** — which is exactly why I show a **confidence band**, not a single hard number." (These come from `model_metadata.json`, the source of truth — not the stale TRAINING_GUIDE.md which shows old numbers.)

### 2E.9 The confidence band (honest detail)
- The listing shows a **range** (e.g. "8–12 tonnes"), not just a point estimate.
- **Honest truth:** this band is **not** a statistical prediction interval from the model. It's computed from the **historical 5th–95th percentile of yields for that crop**. It communicates real-world spread, and it's more honest than a fake-precise single number — but if asked, say plainly it's a historical percentile, not a model-derived interval.

## 2F. GENERATIVE AI

### 2F.1 LLM — Large Language Model (from basics)
- An **LLM** is an AI trained on massive text to predict and generate human-like language — it can answer questions, summarize, and converse. GPT-style models are LLMs.
- You call one via an API: send a **prompt** (your text + instructions), get back generated text.
- **In AgriChain:** we use **Groq** — a provider that runs open models *very fast* on specialized hardware — with the model `openai/gpt-oss-20b`. Groq is chosen for **speed and a free tier**, not because it's a different kind of AI.

### 2F.2 RAG — Retrieval-Augmented Generation (from basics)
- **The problem:** an LLM only knows its training data. It doesn't know *your* platform's specific policies, and if asked, it may **hallucinate** (confidently make things up).
- **RAG** fixes this: before asking the LLM, you **retrieve** the relevant facts from *your own* documents and stuff them into the prompt as context. The LLM then answers **grounded in those facts** instead of guessing. "Retrieval-Augmented" = augment the generation with retrieved knowledge.
- **In AgriChain:** the chatbot has a **10-document knowledge base** of platform policies (how escrow works, how disputes work, etc.). When a user asks a question, `ragController` does **keyword-overlap retrieval** — scores each doc by how many query words it shares, picks the **top 3**, injects them into the Groq prompt, and the bot answers from *your* docs.
- **Honest note:** real production RAG uses **vector embeddings + semantic search** (meaning-based). AgriChain uses simpler **keyword overlap** — say so if asked; it's a legitimate lightweight approach for a small, fixed KB.

### 2F.3 Function calling & agentic loops (from basics)
- **Function/tool calling:** modern LLMs can be given a list of "tools" (functions) they're allowed to call. Instead of guessing a market price, the LLM can *decide* "I need the market price" and emit a structured request to call your `getMarketPrice` tool. Your code runs the real function, returns the real data, and the LLM continues with facts.
- **Agentic loop:** the LLM and your tools go back and forth — LLM asks for a tool → you run it → feed result back → LLM asks for another or answers — until it has what it needs. You cap the loops (here **MAX_ITER = 5**) so it can't spin forever.
- **In AgriChain:** the **negotiation assistant** (`agentController`) gives the LLM **3 tools** — get live market price, get AI yield prediction, get the listing details — and runs an agentic loop (max 5 iterations). So when it suggests a fair contract price, it's using **real data it fetched**, not invented numbers.

## 2G. PLATFORM

### 2G.1 PWA — Progressive Web App (from basics)
- A **PWA** is a website that behaves like a native installed app: you can **install it** to your home screen, it can **work offline**, and it loads fast. It's still just web tech (HTML/JS), but with a **service worker** and a **manifest**.
- **Why for AgriChain:** users are **rural farmers with patchy connectivity** and cheap phones. A PWA installs without an app store and keeps working when the network drops.

### 2G.2 Service worker (from basics)
- A **service worker** is a script the browser runs **in the background**, separate from the page. It sits between the app and the network and can **intercept requests** — serving cached responses when offline. It's the engine behind offline PWAs.
- **In AgriChain:** set up via `vite-plugin-pwa` (which uses Google's **Workbox** under the hood), with `autoUpdate` so users always get the latest version. It caches the app shell so the site loads with no network.

### 2G.3 IndexedDB & offline-first (from basics)
- **IndexedDB** is a real **database inside the browser** — it stores structured data on the user's device, persistently, even offline.
- **Offline-first** means the app is designed to work offline as the normal case: reads come from the local cache; writes are queued locally and synced when the network returns.
- **In AgriChain:** uses **Dexie** (a friendly wrapper over IndexedDB) with a DB named `AgriChainOfflineDB`. Listings/contracts viewed online are cached for offline reading. Text-only updates made offline go into a **sync queue** and auto-retry (up to 3 times) when back online. A `SyncStatusBar` shows pending items. (Photo uploads are *not* queued offline — they need a live connection.)

### 2G.4 Cron jobs (from basics)
- A **cron job** is a task scheduled to run automatically at set times (like a recurring alarm). "Cron" comes from Unix; the schedule is written as a cron expression.
- **In AgriChain:** `node-cron` runs a job **every day at 6:00 AM IST** to refresh market prices from the government API into the cache, so buyers see fresh prices without hitting the slow gov API live every time. There's also a **boot self-heal** that checks prices on server start.

### 2G.5 Environment variables & secrets (from basics)
- **Environment variables** are configuration values passed to a program *from outside* the code — so you don't hard-code them. They differ per environment (your laptop vs. production).
- **Secrets** are the sensitive ones: DB passwords, API keys, the JWT signing key. **Rule: secrets NEVER go in code or git** — only in the hosting platform's env settings.
- **In AgriChain:** all config is via env vars — `DB_HOST`, `DB_PASSWORD`, `JWT_SECRET`, `SENDGRID_API_KEY`, `GROQ_API_KEY`, `DATA_GOV_API_KEY`, `SUPABASE_SERVICE_KEY`, etc. Code reads `process.env.X`. `.env.example` documents the **names** with placeholder values; the real `.env` is git-ignored. **Throughout this project, secrets are referenced by name only — never printed, committed, or shown.**

### 2G.6 Multipart form data & file uploads (from basics)
- Normal request bodies are JSON (text). But a **file** (a photo) is binary. **Multipart/form-data** is the encoding that lets one request carry both text fields AND binary files together, split into "parts."
- **Multer** is the Express middleware that parses multipart requests and hands you the uploaded file.
- **In AgriChain:** `uploadMiddleware.js` uses Multer (memory storage, size/type limits) for crop photos, registration docs, and stage images. The file is then streamed to **Supabase Storage**, and only the resulting URL is saved in Postgres (databases store the *link*, not the image bytes).

### 2G.7 Rate limiting (from basics)
- **Rate limiting** caps how many requests a client can make in a time window — protecting against brute-force login attempts and abuse. Exceed it → `429 Too Many Requests`.
- **In AgriChain:** `express-rate-limit` guards sensitive endpoints (like auth) so nobody can hammer the login endpoint trying passwords.

### 2G.8 Input validation (from basics)
- **Never trust client input.** A malicious or buggy client can send anything. **Validation** checks every incoming field (types, ranges, formats) *before* it touches business logic or the DB — the first line of defense against bad data and injection.
- **In AgriChain:** `validationMiddleware.js` (with `express-validator`) checks request bodies on write endpoints; parameterized SQL queries (never string-concatenated) prevent **SQL injection**.

# PART 3 — THE FULL TECH STACK: WHAT / WHY THIS / WHY NOT THAT

> For each technology: **what it is · why we chose it · why not the alternatives · how it's used here.** This is the "why only that" the request asked for.

### 3.1 React (frontend UI library)
- **What:** a JavaScript library for building user interfaces from reusable **components** that re-render when data changes.
- **Why this:** component reuse, the largest ecosystem/job market, and a **declarative** model (you describe what the UI should look like for a given state; React updates the DOM).
- **Why not alternatives:** *Angular* — heavier, steeper learning curve, more opinionated than needed. *Vue* — great, but smaller ecosystem/hiring pool. *Vanilla JS* — no components/state management; would be unmaintainable at 26 pages.
- **How used:** 26 page components + 7 shared components, React Router for navigation, hooks (`useState`/`useEffect`) for state.

### 3.2 Vite (frontend build tool)
- **What:** a modern build tool + dev server that bundles your app and gives instant hot-reload in development.
- **Why this:** extremely fast (uses native ES modules in dev), simple config, first-class PWA plugin.
- **Why not:** *Create React App* — effectively deprecated, slow. *Webpack raw* — powerful but heavy config.
- **How used:** dev server, production build, and `vite-plugin-pwa` for the service worker/offline.

### 3.3 Node.js + Express (backend runtime + framework)
- **What:** Node.js runs JavaScript on the server; Express is a minimal web framework for defining routes and middleware.
- **Why this:** **one language (JS) across front and back** (less context-switching, shared mental model), huge package ecosystem (npm), excellent for **I/O-bound** APIs (lots of waiting on DB/network — Node's async model shines), and the standard REST stack.
- **Why not:** *Django/Flask (Python)* — we *do* use Python, but only where it's necessary (ML); a Python web layer would fragment the JS frontend synergy. *Java/Spring* — heavyweight for this scale. *Go* — fast but smaller ecosystem for this domain and a new language to add.
- **How used:** the central API hub — 20 route groups, ~79 endpoints, all middleware, all business logic.

### 3.4 PostgreSQL (database)
- **What:** a powerful open-source **relational** (SQL) database.
- **Why this — the money argument:** AgriChain moves money, so it needs **ACID transactions, row-level locking (`SELECT FOR UPDATE`), advisory locks, and SERIALIZABLE isolation** — Postgres has all of these as first-class features. The data is also deeply relational.
- **Why not:** *MongoDB/NoSQL* — weaker multi-document atomicity and relationships; you'd have to bolt on money-safety that Postgres gives natively. This is the single most defensible tech choice in the project — **say "I chose Postgres because I'm moving money and I need real transactions and locks."**
- **How used:** 20 tables; all money operations in SERIALIZABLE transactions with locks + idempotency.

### 3.5 Supabase (managed Postgres + storage)
- **What:** a hosting platform that provides managed PostgreSQL **and** file storage (plus auth/realtime, which we mostly don't use).
- **Why this:** free tier, managed Postgres (no DB ops), built-in **object storage** for images in the same platform, region ap-south-1 (Mumbai) = low latency for Indian users.
- **Why not:** *AWS RDS + S3* — more powerful but more setup/cost; overkill for a student project. *Firebase* — NoSQL (Firestore), which fails the money-safety requirement.
- **How used:** the Postgres DB and the image bucket. We connect to Postgres with the standard `pg` driver (not Supabase's client SDK), keeping DB access portable.

### 3.6 Python + FastAPI (ML microservice)
- **What:** Python is the language of ML; FastAPI is a modern, fast Python web framework with automatic validation and docs.
- **Why this:** the ML libraries (**XGBoost, pandas, scikit-learn, numpy**) are Python-only. FastAPI is async, fast, and has built-in request validation (Pydantic) + auto-generated Swagger docs. Isolating ML in its own service = independent scaling/deployment and **graceful degradation** (if it's down, the Node API still saves listings).
- **Why not:** *Flask* — synchronous by default, no built-in validation/docs; FastAPI is the modern choice. *Running ML in Node* — not viable; the mature ML stack is Python.
- **How used:** loads the trained `.pkl` model at startup, exposes `/predict/dynamic` (the live yield endpoint) + health/monitoring endpoints.

### 3.7 XGBoost (the ML model)
- Covered in 2E.5. **What:** optimized gradient-boosted trees. **Why:** best-in-class for tabular data, fast, exportable. **Why not:** *linear regression* — too weak for non-linear crop/climate interactions; *deep neural nets* — overkill and data-hungry for tabular data, harder to train/deploy; *Random Forest* — good but generally edged out by gradient boosting on accuracy. **How used:** regressor on 643 one-hot features, log-transformed target, Optuna-tuned.

### 3.8 JWT (`jsonwebtoken`) — stateless auth
- Covered in 2B.3. **Why this over sessions:** stateless suits **separated services** — no shared session store needed; any service can verify a token with the shared secret. **How used:** HS256, `{id, role}` payload, 7-day expiry.

### 3.9 bcrypt — password hashing
- Covered in 2B.2. **Why this:** purpose-built, salted, slow-on-purpose password hashing — the standard. **Why not:** *plain SHA-256* — too fast, brute-forceable, no salt by default. **How used:** cost factor 10 on signup; compare on login.

### 3.10 SendGrid (`@sendgrid/mail`) — transactional email
- **What:** an email-delivery API (OTP codes, notifications) over **HTTPS**.
- **Why this — a real war story:** Render's free tier **blocks outbound SMTP ports (25/465/587)**, so traditional SMTP email (Nodemailer/Gmail) **silently fails in production**. SendGrid sends over an **HTTPS API call**, which isn't blocked. (This corrects older docs that mention Nodemailer — the live system uses SendGrid.)
- **Why not:** *Nodemailer + Gmail SMTP* — blocked on Render; *AWS SES* — more setup. **How used:** `emailService.js` sends OTP + notification emails via the SendGrid API; `EMAIL_USER` is the from-address, `SENDGRID_API_KEY` is the secret (Render env only).

### 3.11 Groq (`groq-sdk`) — LLM inference
- Covered in 2F.1. **What:** ultra-fast LLM inference provider. **Why this:** speed + free tier; model `openai/gpt-oss-20b`. **Why not:** *OpenAI/Anthropic paid APIs* — cost; *self-hosting a model* — infra-heavy. **How used:** chatbot (RAG) + negotiation agent (function-calling).

### 3.12 data.gov.in Agmarknet — live market prices
- **What:** the Indian government's open-data API for daily mandi (market) commodity prices.
- **Why this:** it's the **authoritative, official** source — settlement tied to a real government price is the whole trust proposition. Resource id `9ef84268-d588-465a-a308-a864a43d0070`, field `modal_price`.
- **Why not:** *scraping websites* — fragile, legally murky; *made-up prices* — defeats the purpose. **How used:** `marketScraper.js` with a **4-tier fallback** (cache → live → last-verified → clearly-labeled simulated) so a gov outage never breaks the app or fakes a "live" price.

### 3.13 Tesseract.js + exifr — GPS extraction
- Covered in 2D.2–2D.3. **exifr** reads photo EXIF GPS; **Tesseract.js** OCRs the GPS watermark as fallback. **Why not cloud vision APIs** — cost + privacy; these run locally in Node.

### 3.14 Multer — file upload parsing
- Covered in 2G.6. Parses multipart uploads. **How used:** memory storage + type/size limits, then stream to Supabase Storage.

### 3.15 Dexie — offline storage
- Covered in 2G.3. Friendly IndexedDB wrapper. **Why not raw IndexedDB** — verbose, callback-heavy; Dexie is clean and promise-based.

### 3.16 node-cron — scheduling
- Covered in 2G.4. Cron scheduling inside Node. **How used:** daily 6 AM IST price refresh.

### 3.17 Deployment: Vercel + Render
- **Vercel** (frontend): purpose-built for React/static + PWA, global CDN, git-push deploys, free tier. **Render** (backend + AI): simple managed hosting for Node and Python web services, free tier, `render.yaml` blueprints. **Why not one big VM/AWS** — more ops burden; these are zero-ops for a student project. **Trade-off (honest):** free tiers **cold-start** (spin down when idle) — the first request after idle is slow (~30–60s), which caused the "login looks broken" issue solved in Part 11.

---

# PART 4 — ARCHITECTURE & END-TO-END CONNECTIONS

### 4.1 The four services (and the one rule)
```
   ┌─────────────────────────────────────────────────────────────┐
   │  BROWSER  —  React PWA (Vercel)                               │
   │  pages, components, localStorage(JWT), IndexedDB(offline)     │
   └───────────────┬─────────────────────────────────────────────┘
                   │  HTTPS + JWT (Authorization: Bearer …)
                   │  (the ONLY arrow out of the browser)
                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  BACKEND  —  Node/Express API (Render)   ★ THE HUB ★          │
   │  routes → middleware(auth,role,validate,upload) → controllers │
   │  → services → SQL. All business logic + money engine here.    │
   └───┬───────────────┬───────────────┬───────────────┬──────────┘
       │ pg driver     │ HTTP          │ HTTPS API      │ HTTPS API
       ▼               ▼               ▼                ▼
   ┌────────┐   ┌──────────────┐  ┌──────────┐   ┌──────────────┐
   │Postgres│   │Python FastAPI│  │  Groq    │   │ data.gov.in  │
   │+Storage│   │ XGBoost /pkl │  │  LLM     │   │ mandi prices │
   │Supabase│   │  (Render)    │  │          │   │ + SendGrid   │
   └────────┘   └──────────────┘  └──────────┘   └──────────────┘
```
- **The one rule:** the **browser talks only to the backend**. It never touches the DB, the ML service, Groq, or the gov API directly. This is a **security boundary** — all secrets and all trust decisions live server-side. The frontend holds no secret beyond the user's own JWT.
- **The backend is the hub/orchestrator.** Every external dependency is reached through it, so every one can be **guarded, validated, cached, and degraded gracefully** in one place.

### 4.2 How the pieces connect (the wiring)
| From | To | How | Carries |
|---|---|---|---|
| Browser | Backend | HTTPS REST + `axios` | JSON + JWT header; multipart for uploads |
| Backend | Postgres | `pg` connection pool | SQL queries, transactions |
| Backend | AI service | HTTP (axios) to `/predict/dynamic` | crop/land/climate JSON → yield JSON |
| Backend | Supabase Storage | Supabase client | image bytes → returns URL |
| Backend | Groq | `groq-sdk` HTTPS | prompt+context → generated text |
| Backend | data.gov.in | HTTPS (axios) | crop/region → price records |
| Backend | SendGrid | HTTPS API | OTP/notification emails |

### 4.3 Why this shape (the architectural thesis)
- **Split where the seam is real** (Python ML), **not everywhere.** This is "pragmatic microservices" — you can defend *both* the split (language boundary, independent scaling, graceful degradation) and the restraint (not over-splitting a student project into 12 services).
- **Single hub = single choke point for security and resilience.** Auth, validation, rate-limiting, caching, and fallback logic all live in one place.
- **Stateless auth (JWT)** means the backend can run multiple instances (Render) with no shared session store — the advisory locks in Postgres handle cross-instance coordination for money.

### 4.4 Data ownership
- **Postgres (Supabase)** owns all persistent business data (users, listings, contracts, escrow, ledger, notifications, reviews, prices).
- **Supabase Storage** owns image *bytes*; Postgres stores their *URLs*.
- **AI service** owns the model artifacts + the training feature matrix; it's **stateless per request** (loads model once at boot).
- **Browser** owns only a cache (IndexedDB) + the JWT (localStorage) — all disposable.

---

# PART 5 — THE REQUEST PIPELINE (TRACED IN FULL)

> "How and from where the request goes, and how it's responded." Here's the general path, then three concrete traces.

### 5.1 The general path of ANY request
```
1. USER acts in the browser (clicks "Accept contract").
2. React event handler calls a function in lib/api.js.
3. axios REQUEST INTERCEPTOR attaches  Authorization: Bearer <JWT>  from localStorage.
4. Request travels over HTTPS to the backend base URL (VITE_API_URL).
5. BACKEND server.js receives it. Global middleware runs: CORS check, JSON/body parse, rate-limit.
6. ROUTER matches the path+method → the route file (e.g. routes/contract.js).
7. MIDDLEWARE CHAIN for that route runs IN ORDER:
      a. authMiddleware   — verify JWT → set req.user = {id, role}  (fail → 401)
      b. roleMiddleware    — is req.user.role allowed?             (fail → 403)
      c. validationMiddleware / uploadMiddleware if present         (fail → 400)
8. CONTROLLER function runs the business logic:
      - may open a DB TRANSACTION (money ops: SERIALIZABLE + locks + idempotency)
      - may call SERVICES (aiService, marketScraper, emailService, …)
      - runs parameterized SQL against Postgres
9. CONTROLLER sends a RESPONSE: res.status(code).json(data).
10. Response travels back over HTTPS.
11. axios RESPONSE INTERCEPTOR checks it — on 401 it clears storage + redirects to login.
12. React updates state → UI re-renders. (Offline: read from IndexedDB / queue the write.)
```

### 5.2 Trace A — Farmer creates a listing (the AI path)
```
Browser: CreateListing.jsx submits multipart form (crop, area, soil, season, photo, reg-doc)
  → POST /api/listings  with JWT
Backend: server.js → routes/listing.js
  → authMiddleware (verify JWT, role=farmer present)
  → roleMiddleware("farmer")            [buyer would get 403 here]
  → uploadMiddleware (Multer parses the two files)
  → validationMiddleware (fields valid?)
  → listingController.createListing:
       1. upload crop photo + reg-doc to Supabase Storage → get URLs
       2. OCR the reg-doc (utils/ocrHelper + gpsParser) → farm GPS coords
       3. call aiService.getPrediction(crop, area, soil, season, location)
             → HTTP POST to Python /predict/dynamic
             → FastAPI builds 643-col one-hot row, runs XGBoost, expm1() → yield + band
       4. INSERT listing row (with photo URL, coords, predicted yield)
       5. res.status(201).json(listing)
  ── if step 3 throws (AI down/slow): CATCH → save listing with yield=0  [graceful degradation]
Browser: shows the new listing with its yield estimate.
```

### 5.3 Trace B — Farmer accepts a contract (the money path — the centerpiece)
```
Browser: FarmerContracts.jsx → PUT /api/contracts/:id/accept  with JWT
Backend: routes/contract.js
  → authMiddleware → roleMiddleware("farmer")
  → contractController.acceptContract  →  withTransaction(async client => {
        SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
        pg_advisory_xact_lock(contractId)                  // only one per contract, cross-instance
        SELECT ... FROM contracts WHERE id=$1 FOR UPDATE    // row-lock + re-read
        if status != 'pending'  → throw (409)               // can't double-accept
        UPDATE contracts SET status='accepted'
        // create escrow atomically:
        contract_value = qty_tonnes * price_per_quintal * 10
        total_locked   = contract_value * 1.10               // 110% buffer
        INSERT escrow (contract_id, total_locked, status='active', ...)
        INSERT escrow_ledger (type='lock', amount=total_locked, balance=total_locked)
        INSERT 5 escrow_milestones (advance + 4 stages: 15/15/20/20/10)
        INSERT notification for the buyer
     })  // COMMIT — all of it, or ROLLBACK — none of it
  → res.json({ contract, escrow })
Browser: contract now shows "accepted", escrow "active", money "locked".
```

### 5.4 Trace C — Buyer releases a milestone (locks + idempotency)
```
Browser: Escrow.jsx → POST /api/escrow/:contractId/release/:milestone
          headers: JWT + X-Idempotency-Key: <uuid generated client-side>
Backend: routes/escrow.js → authMiddleware → roleMiddleware("buyer")
  → escrowController.releaseMilestone → withTransaction(SERIALIZABLE):
        // idempotency check FIRST:
        SELECT result FROM idempotency_keys WHERE key=$1
        if found → return stored result  (replay — never pay twice)
        pg_advisory_xact_lock(contractId)
        SELECT ... FROM escrow WHERE contract_id=$1 FOR UPDATE
        if dispute open → throw → 423 Locked (frozen)
        if milestone already released → throw (409)
        amount = milestone.percent * total_locked
        UPDATE escrow SET released = released + amount
        UPDATE the milestone row → released=true
        INSERT escrow_ledger (type='release', amount, running balance)
        INSERT idempotency_keys (key, result)     // remember this op
        INSERT notification for the farmer
     // COMMIT
  → res.json(result)
Browser: payment progress bar advances; ledger shows the new row.
```

### 5.5 What "responded" means at each layer
- **DB layer** responds with rows or an error (constraint violation → caught).
- **Controller** translates outcomes into **HTTP status + JSON**: `200/201` success, `400` bad input, `401` no/expired token, `403` wrong role, `409` conflict/duplicate, `423` disputed/frozen, `429` rate-limited, `500` unexpected.
- **Frontend** translates status into UX: success toast + state update; `401` → auto-logout; `423` → "this escrow is frozen due to a dispute"; offline → read cache or queue.

# PART 6 — BACKEND, FILE BY FILE

> Path: `agrichain/backend/`. The flow within the backend is always **route → middleware → controller → service/SQL**. Here's every file and what it does.

### 6.1 Entry point & config
- **`server.js`** — the application entry point. Creates the Express app; wires **global middleware** (CORS with the frontend origin, JSON/body parsing, rate-limiting); mounts all 20 routers under `/api/...`; exposes a `/health` check; starts the cron jobs; and starts listening on `PORT`. This is the first code any request hits.
- **`config/db.js`** — creates the PostgreSQL **connection pool** (`pg.Pool`) from `DB_*` env vars. A pool reuses a set of DB connections instead of opening one per request (fast + bounded). Exports `query()` and the pool so controllers can run SQL and transactions. Also home to the `withTransaction` helper pattern (BEGIN → run → COMMIT / ROLLBACK → release).
- **`config/supabase.js`** — creates the Supabase client from `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (server-side service key, never sent to browser). Used to upload images to Storage and get back public URLs.

### 6.2 Middleware (the guards every request passes through)
- **`middleware/authMiddleware.js`** — **authentication.** Reads `Authorization: Bearer <token>`, runs `jwt.verify(token, JWT_SECRET)`. On success sets `req.user = {id, role}` and calls `next()`; on missing/invalid/expired token → `401`. Every protected route starts with this.
- **`middleware/roleMiddleware.js`** — **authorization (RBAC).** A **factory**: `roleMiddleware(...allowedRoles)` returns a middleware that checks `req.user.role` is in the allowed list, else `403`. Always chained *after* authMiddleware. E.g. `roleMiddleware("farmer")`, `roleMiddleware("buyer")`, `roleMiddleware("admin")`.
- **`middleware/uploadMiddleware.js`** — **Multer** config: memory storage, file-type whitelist (images/docs), size limit. Parses multipart uploads and puts files on `req.file`/`req.files` for the controller to stream to Supabase.
- **`middleware/validationMiddleware.js`** — **input validation** using `express-validator`: rule sets per endpoint (required fields, types, ranges) + a handler that returns `400` with the list of errors if validation fails. First line of defense against bad/malicious input.

### 6.3 Routes (the URL map — 20 files)
Each route file defines the endpoints for one resource and chains the middleware before the controller. The 20 routers:

| Route file | Base path | Purpose |
|---|---|---|
| `auth.js` | `/api/auth` | signup, login, OTP verify, forgot/reset password, 2FA |
| `listing.js` | `/api/listings` | CRUD crop listings (create triggers AI + OCR) |
| `cropStage.js` | `/api/stages` | growth-stage records + GPS-verified photo updates |
| `contract.js` | `/api/contracts` | offer/accept/reject/list contracts |
| `escrow.js` | `/api/escrow` | lock/release/settle/refund + ledger (the money engine) |
| `marketPrice.js` | `/api/market-prices` | live + cached mandi prices, admin refresh |
| `admin.js` | `/api/admin` | user/listing management, farm verification, disputes |
| `analytics.js` | `/api/analytics` | dashboard metrics for farmer/buyer/admin |
| `profile.js` | `/api/profile` | view/edit profile, farm registration data |
| `notification.js` | `/api/notifications` | in-app notifications list/read |
| `watchlist.js` | `/api/watchlist` | buyer's saved listings |
| `review.js` | `/api/reviews` | post-contract ratings/reviews |
| `update.js` | `/api/updates` | admin broadcast updates/announcements |
| `upload.js` | `/api/upload` | generic file upload to Supabase |
| `prediction.js` | `/api/predictions` | proxy to the AI yield service |
| `modelMonitor.js` | `/api/model-monitor` | ML health/metrics passthrough |
| `rag.js` | `/api/rag` | chatbot (RAG over policy KB) |
| `agent.js` | `/api/agent` | negotiation assistant (function-calling) |
| `location.js` | `/api/location` | India state/district location data |
| `pdf.js` | `/api/pdf` | contract "PDF" (emits HTML, not pdfkit) |

### 6.4 Controllers (the business logic — 18 files)
Controllers hold the actual logic each endpoint runs. The important ones:

- **`authController.js`** — signup (bcrypt hash + generate/send OTP), verifyOTP (activate account), login (bcrypt compare + issue JWT + optional 2FA), forgotPassword/resetPassword (**anti-enumeration**: always returns an identical `200` whether or not the email exists, so attackers can't discover which emails are registered). Issues `jwt.sign({id, role}, JWT_SECRET, {expiresIn:"7d"})`.
- **`listingController.js`** — createListing (upload images → OCR reg-doc for coords → call `aiService` for yield → INSERT; **catches AI failure to save with yield=0**), plus read/update/delete with ownership checks.
- **`contractController.js`** — createContract (buyer offers), **acceptContract** (the SERIALIZABLE transaction that creates the escrow — see Trace B), rejectContract, list by farmer/buyer.
- **`escrowController.js`** — **the money engine.** `getEscrow`, `releaseMilestone` (locks + idempotency + ledger — Trace C), `settle` (market-adjusted final payout, capped, refund buffer), `refund`, `raiseDispute`/`resolveDispute` (freeze → `423`). Every mutator = SERIALIZABLE + advisory lock + `FOR UPDATE` + idempotency + append-only ledger.
- **`cropStageController.js`** — add/list growth stages; the stage-photo update runs the **GPS verification chain** (EXIF → OCR → fallback → Haversine ≤500 m → `gps_verified`).
- **`marketPriceController.js`** — serves prices via `marketScraper` (4-tier fallback), exposes the admin manual-refresh, reports the data **source** so the UI never mislabels simulated as live.
- **`predictionController.js`** — thin proxy that forwards yield requests to the Python service (via `aiService`).
- **`modelMonitorController.js`** — passthrough to the AI service's monitoring endpoints (metrics/health) for the ModelMonitor page.
- **`ragController.js`** — the chatbot: keyword-overlap retrieval over the 10-doc KB → top-3 → Groq prompt → answer.
- **`agentController.js`** — the negotiation assistant: agentic loop (MAX_ITER=5) giving Groq 3 tools (market price, yield prediction, listing details) via function-calling.
- **`adminController.js`** — verify farms, manage users/listings, handle disputes, platform stats.
- **`analyticsController.js`** — aggregate SQL for dashboards (uses `NULLIF` guards to avoid divide-by-zero).
- **`profileController.js`** — profile + farm registration read/update.
- **`notificationController.js`** — list/mark-read in-app notifications (created inside the same transactions as the events that trigger them).
- **`watchlistController.js`** — add/remove/list a buyer's watched listings.
- **`reviewController.js`** — post-contract reviews (UNIQUE constraint → duplicate returns `409`).
- **`updateController.js`** — admin announcements/broadcasts.
- **`pdfController.js`** — generates a contract document as **HTML** with `Content-Type: text/html` (there is **no pdfkit** — the browser can print-to-PDF; older docs claiming pdfkit are stale).

### 6.5 Services (external integrations — 5 files)
- **`services/aiService.js`** — HTTP client to the Python ML service. Posts crop/land/climate to **`/predict/dynamic`** (the live endpoint) and returns yield+band. Wraps failures so callers can degrade gracefully. *(Note: an older `/predict` path via this service is effectively dead — `/predict/dynamic` is live.)*
- **`services/marketScraper.js`** — the market-price engine (read in full this session). Talks to **data.gov.in** resource `9ef84268-…`, uses field `modal_price`, maps 15 crops → commodity names (`CROP_TO_COMMODITY`), widens the search district→state→national, hardened fetch (2 attempts, 800 ms backoff, 20 s timeout), and implements the **4-tier `getLatestPrice`**: 25-hour cache → live fetch → last-verified (`data_gov_cached`) → date-seeded simulated (±5%). `upsertPrice` uses `ON CONFLICT` on 5 columns. Exports `scrapeAndUpdatePrices`, `getLatestPrice`, `fetchLivePrice`, `BASE_PRICES`.
- **`services/emailService.js`** — **SendGrid** HTTPS email (OTP + notifications). Uses `SENDGRID_API_KEY`; from-address `EMAIL_USER`. Chosen because Render blocks SMTP ports (Part 3.10 / Part 11).
- **`services/cronJobs.js`** — `node-cron` scheduler: daily **6 AM IST** market-price refresh + boot self-heal that checks/repairs prices on startup.
- **`services/locationService.js`** — serves India state/district data (for cascading location dropdowns) used at farm registration and price lookups.

### 6.6 Utils (small helpers — 4 files)
- **`utils/distanceHelper.js`** — the **Haversine** implementation (`R = 6371000` m) returning meters between two lat/long points. The 500 m gate uses this.
- **`utils/exifHelper.js`** — reads EXIF GPS tags from a photo (via `exifr`). Step 1 of the GPS chain.
- **`utils/ocrHelper.js`** — runs **Tesseract.js** OCR on an image → raw text. Used for reg-doc coords and GPS-watermark fallback.
- **`utils/gpsParser.js`** — regex parser that extracts lat/long numbers from OCR text (handles "GPS 12.97, 77.59", "Lat/Long", DMS-ish formats). Step 2 of the GPS chain.

### 6.7 Tests & schema
- **`tests/escrow_math.test.js`** — the **53-assertion** test suite locking down all escrow money math (lock 110%, milestone percentages, market-adjusted settlement, cap, refund, ledger-nets-to-zero). This is your proof the money engine is correct — a strong thing to mention.
- **`schema.sql`** — the core relational schema (users, listings, contracts, stages, notifications, reviews, watchlist, etc.).
- **`escrow_schema.sql`** — escrow tables (`escrow`, `escrow_milestones`, `escrow_ledger`, `idempotency_keys`, disputes).
- **`market_schema.sql`** — market-price tables (cached prices with source + timestamp).
- **`.env.example`** — documents all env-var **names** with placeholders (no real secrets). **`package.json`** — dependencies + scripts.

---

# PART 7 — FRONTEND, FILE BY FILE

> Path: `agrichain/frontend/src/`. React + Vite PWA. Structure: `main.jsx` boots → `App.jsx` routes → `pages/` (screens) use `components/` (shared UI) and `lib/` (data/auth/offline).

### 7.1 Entry & shell
- **`main.jsx`** — React entry point: mounts `<App/>` to the DOM, registers the **PWA service worker** (via vite-plugin-pwa), wraps the app in the router.
- **`App.jsx`** — defines all **routes** (URL → page component) with React Router; applies **route protection** (redirect to login if no JWT; role-appropriate landing). The frontend's navigation map.
- **`App.css` / `index.css`** — global styles and CSS reset/base. (`index.css` holds the `@layer base` rules — the transparent-button fix lives in this layering, see Part 11.)

### 7.2 `lib/` (the data & offline layer — 6 files)
- **`lib/api.js`** — the **axios instance**. Sets `baseURL` from `VITE_API_URL`; a **request interceptor** attaches the JWT from localStorage to every call; a **response interceptor** catches `401` → clears storage → redirects to login. Every API call in the app goes through here.
- **`lib/db.js`** — **Dexie/IndexedDB** setup: defines `AgriChainOfflineDB` and its object stores (cached listings/contracts, the sync queue). The offline brain.
- **`lib/offlineApi.js`** — the offline-aware wrapper: if online, call the real API and cache the result; if offline, read from IndexedDB (for reads) or enqueue (for writes).
- **`lib/offlineQueue.js`** — the **sync queue**: stores pending text-only mutations made offline and **retries up to 3 times** when connectivity returns. (Photo uploads are excluded — they need a live connection.)
- **`lib/useOnlineStatus.js`** — a React hook that tracks online/offline state (listens to browser events) so components can react (e.g. show the SyncStatusBar).
- **`lib/yield.js`** — client-side helpers for yield/price math and formatting (tonnes/quintals, currency).

### 7.3 `data/`
- **`data/indiaLocations.js`** — static India **state → district** dataset powering cascading location dropdowns (farm registration, price lookup).

### 7.4 `pages/` (the 26 screens)
Grouped by role/purpose:

**Auth (3):** `Login.jsx` · `Signup.jsx` (with OTP step) · `ForgotPassword.jsx` (anti-enumeration UX).

**Farmer (10):** `FarmerDashboard.jsx` · `CreateListing.jsx` (triggers AI+OCR) · `MyListings.jsx` · `ListingEdit.jsx` · `ListingAddStage.jsx` · `StageAddUpdate.jsx` (GPS photo upload) · `FarmerContracts.jsx` (accept/reject → escrow) · plus shared listing/stage views.

**Buyer (5):** `BuyerDashboard.jsx` · `Marketplace.jsx` (browse + AI yield shown) · `Watchlist.jsx` · `BuyerContracts.jsx` (offer + release milestones) · `Escrow.jsx` (the payment-progress + ledger screen).

**Shared/among roles (5):** `Home.jsx` · `ListingDetail.jsx` (shows yield + confidence band) · `StageDetail.jsx` (shows GPS-verified stage + map) · `ProfileView.jsx` · `ProfileEdit.jsx`.

**Market/AI/analytics (4):** `MarketPrices.jsx` (live prices + **source label**) · `Chatbot.jsx` (RAG assistant) · `Analytics.jsx` (dashboards) · `ModelMonitor.jsx` (ML health).

**Notifications & admin (2+):** `Notifications.jsx` · `AdminDashboard.jsx` (verify farms, manage users/listings, disputes).

*(Plus the negotiation assistant UI surfaced via the agent endpoints, and page-specific CSS files: auth, dashboard, listings, listing-form, contracts, escrow, home, notifications, profile, chatbot, market-prices, stage, analytics, listing-detail, admin.)*

### 7.5 `components/` (7 reusable pieces + CSS)
- **`Navbar.jsx`** — top navigation; shows role-appropriate links; logout.
- **`InstallPrompt.jsx`** — the PWA "Add to Home Screen" prompt (the install-app UX).
- **`SyncStatusBar.jsx`** — shows offline status + count of pending queued updates (drains when back online).
- **`StageMap.jsx`** — renders the stage photo's GPS point vs. the farm on a map (the visual proof).
- **`WatchlistButton.jsx`** — add/remove a listing from the buyer's watchlist.
- **`ReviewModal.jsx`** — post-contract rating/review dialog.
- **`CropHealthAdvisor.jsx`** — surfaces AI/advisory crop guidance.
- **`components.css`** — shared component styling.

### 7.6 How a page actually works (pattern)
Every page follows the same shape: `useState` for data + loading/error; `useEffect` to fetch on mount via `lib/api.js` (which auto-attaches the JWT); render loading → data → error states; on user actions, call the API and update state. Offline-aware pages route through `offlineApi.js` instead.

---

# PART 8 — AI SERVICE, FILE BY FILE

> Path: `agrichain/ai-service/`. Python + FastAPI. Loads the trained XGBoost model once at startup and answers yield-prediction requests. **Stateless per request.**

### 8.1 Live source files (`src/`)
- **`app.py`** — the **FastAPI application** (the live entry point). Loads the model artifacts at startup; defines endpoints — **`/predict/dynamic`** (the live yield prediction the backend calls), health, and model-monitoring endpoints; validates requests with Pydantic; handles CORS (`allow_origins=["*"]`, safe because only the backend calls it).
- **`inference.py`** — the **prediction logic** (live). Takes the request (crop, area, soil, season, location, climate), **one-hot encodes** it, **reindexes to the exact 643 training columns** (`model_columns.pkl`, missing → 0), runs `model.predict`, applies **`expm1`** to invert the log target, converts per-hectare → total via area (acres→ha ×0.4046856422), and attaches the **confidence band** (per-crop 5th/95th percentile).
- **`climate_service_v2.py`** — the **active** climate feature provider: supplies rainfall/temperature for a location and computes the engineered `rainfall_temp_interaction` feature the model expects.
- **`train_optimized.py`** — the **training script** that produced the live model: loads the feature matrix, log-transforms the target, one-hot encodes, splits 85/15 (seed 42), runs **Optuna** (20 trials) to tune XGBoost, trains, evaluates, and saves `xgboost_yield_model.pkl` + `model_columns.pkl` + `model_metadata.json` + `feature_importance.json`.
- **`improved_preprocess.py`** — the **active** preprocessing pipeline (cleaning, feature construction) used to build the training matrix.
- **`check_model.py`** — a utility to sanity-check/inspect the saved model (loads it, prints metadata/columns).

### 8.2 Legacy/superseded source files (present but not the live path)
- **`preprocess.py`** — older preprocessing (superseded by `improved_preprocess.py`).
- **`climate_service.py`** — older climate provider (superseded by `climate_service_v2.py`).
- **`feature_template.py`** — earlier feature-template approach.
- **`evaluate.py`** — standalone evaluation script.
- *(Knowing which files are live vs legacy is itself a good answer — it shows you understand your own codebase's history.)*

### 8.3 Model artifacts (`models/`)
- **`xgboost_yield_model.pkl`** — the trained XGBoost regressor (the brain), loaded at startup.
- **`model_columns.pkl`** — the exact **643** one-hot feature columns in order; prediction reindexes to this (prevents the column-mismatch bug).
- **`model_metadata.json`** — the **source-of-truth metrics**: **R² = 0.8742, MAE = 25,061.59 kg/ha, MAPE = 29.79%**, algorithm XGBoost, feature count, training rows. *(Cite THIS, not the stale TRAINING_GUIDE.md.)*
- **`feature_importance.json`** — which features drive predictions most (useful for the ModelMonitor page + interview color).

### 8.4 Data files (`data/`)
- **`agrichain_feature_matrix.csv`** (~37 MB) — the processed training matrix; also read at runtime for the per-crop percentile confidence band.
- **`crop_yield.csv`, `crop_production.csv`, `climate_crop_data.csv`, `India Agriculture Crop Production.csv`** — the raw source datasets combined during preprocessing (~247k rows total).

### 8.5 Config & docs
- **`requirements.txt`** — Python deps (fastapi, uvicorn, xgboost, pandas, scikit-learn, numpy, optuna, joblib).
- **`render.yaml`** — Render deployment blueprint; pins **PYTHON_VERSION = 3.12.4** (the pin was a real fix — Part 11). *(Confirm the deployed service matches this.)*
- **`TRAINING_GUIDE.md`** — **STALE** (shows old R²≈0.99/HistGBM/79-feature numbers). Do **not** cite it; `model_metadata.json` wins.
- **`DATA_FILES_GUIDE.md`** — documents the datasets.

# PART 9 — DEEP DIVES (basics → implementation)

> The six systems an interviewer will drill into. Each goes concept → math/mechanism → exact implementation.

## 9.1 THE ESCROW ENGINE (the crown jewel)

**Concept recap:** neutral party holds money, releases on proof (2C.8). AgriChain's twist: **staged** release tied to **GPS-proven growth**, **market-linked** final settlement, **concurrency-safe** and **auditable**.

**The money math (memorize this — it's the most impressive thing you can show):**
- **Units:** quantity is in **tonnes**; price is **₹ per quintal**; 1 tonne = 10 quintals.
- **Contract value** = `quantity(tonnes) × price(₹/quintal) × 10`.
  - *Example:* 10 tonnes @ ₹2,000/quintal = 10 × 2000 × 10 = **₹200,000**.
- **Total locked** = `contract_value × 1.10` (a **10% buffer** so a price rise can still be paid).
  - *Example:* ₹200,000 × 1.10 = **₹220,000** locked from the buyer.
- **Advance** = `contract_value × 0.15` (15% released on acceptance to fund inputs).
- **Milestone schedule** (of contract value): advance **15%**, then stages **15% / 20% / 20% / 10%** = **80% released progressively**; the rest resolves at settlement.
- **Settlement at harvest:**
  ```
  desired     = max(offered_price, live_market_price)     // farmer gets the upside
  gross       = min(desired × quantity_in_quintals, total_locked)   // but never exceed locked
  refund      = total_locked − gross                       // leftover buffer back to buyer
  balance_due = max(0, gross − already_paid)               // what's still owed the farmer
  ```
- **Ledger invariant:** `sum(releases) + refund = total_locked` — the ledger **always nets to zero**. This is proven by the test suite.

**The concurrency safety (why money can't be double-paid) — three layers stacked:**
1. **SERIALIZABLE transaction** — the strictest isolation; concurrent money ops behave as if run one-at-a-time; conflicts force a retry.
2. **`pg_advisory_xact_lock(contract_id)`** — an app-level mutex on the contract; only one release/settle per contract runs at a time, **even across multiple Render server instances**.
3. **`SELECT ... FOR UPDATE`** — row-locks the escrow/milestone rows so their state can't change mid-transaction.
Plus **idempotency keys** (2C.7): a retried/double-clicked release replays the stored result instead of paying again. Plus the **append-only ledger** for a full audit trail. Plus **dispute freeze**: an open dispute makes every money endpoint return `423 Locked`.

**Honest caveat (volunteer it):** the **payment gateway is mocked** — no real rupees move. But **the accounting, the state machine, the concurrency control, and the ledger are all real and tested**. "Only the gateway call is simulated; the hard parts are real."

## 9.2 JWT AUTHENTICATION + RBAC

**Concept recap:** JWT = signed, stateless identity token (2B.3); RBAC = permissions by role (2B.5).

**End-to-end implementation:**
1. **Signup:** `bcrypt.hash(password, 10)` → store hash; generate 6-digit OTP (10-min expiry) → SendGrid email → account inactive until verified.
2. **Verify OTP:** match code + not expired → activate.
3. **Login:** `bcrypt.compare` → if 2FA on, send+verify OTP → `jwt.sign({id, role}, JWT_SECRET, {expiresIn:"7d"})` → return token.
4. **Every request:** axios attaches `Authorization: Bearer <token>` → `authMiddleware` runs `jwt.verify` → sets `req.user={id,role}` (or `401`).
5. **Authorization:** `roleMiddleware("farmer"|"buyer"|"admin")` checks `req.user.role` (or `403`). Admin router guards all its routes at once with `router.use(authMiddleware, roleMiddleware("admin"))`.
6. **Expiry:** after 7 days `verify` throws → `401` → frontend interceptor logs the user out.

**Why signature can't be forged:** the server recomputes `HMAC-SHA256(header.payload, JWT_SECRET)` and compares; tampering with the payload (e.g. escalating role to admin) breaks the match, and the attacker can't recompute it without `JWT_SECRET`.

**Security posture (honest):** token in localStorage (simple, XSS-readable — production would prefer httpOnly cookies + refresh tokens); payload holds only `id`+`role` (readable but non-secret); anti-enumeration on forgot-password; rate-limiting on auth; bcrypt salted+slow. Route guards are enforced **server-side** — hiding buttons on the frontend is only UX.

## 9.3 GPS VERIFICATION + OCR

**Concept recap:** GPS coords (2D.1), EXIF (2D.2), OCR/Tesseract (2D.3), Haversine (2D.4).

**The verification chain (three sources, in order of trust):**
1. **EXIF** (`exifHelper` + `exifr`) — read GPS tags the camera embedded at capture. Most trustworthy.
2. **OCR fallback** (`ocrHelper` Tesseract.js + `gpsParser` regex) — if EXIF is stripped, many GPS-camera apps **burn coordinates as a visible watermark**; OCR reads that text and the regex extracts lat/long.
3. **Client-coords fallback** — the browser's geolocation at upload time, if both above fail.

**Then the gate:** `distanceHelper` computes **Haversine** distance (R=6,371,000 m) between the extracted point and the farm's registered coords. **≤ 500 m ⇒ `gps_verified = true`** on that stage. The `StageMap` component visualizes both points.

**Why 500 m:** tolerates GPS drift + large fields while still proving presence at the real farm (not another district). **Why it's a "soft" gate (honest):** verification is recorded and shown, and it gates milestone confidence, but the buyer still controls release — it's decision-support, not a hard block. **Also used at registration:** OCR extracts farm coords from the uploaded land-registration document.

## 9.4 THE ML YIELD MODEL

**Concept recap:** supervised regression (2E.1–2E.2), XGBoost (2E.5), one-hot (2E.6), log transform (2E.7), metrics (2E.8).

**Full pipeline:**
- **Data:** ~247k rows from 4 government/agri datasets, cleaned/merged by `improved_preprocess.py` into `agrichain_feature_matrix.csv`.
- **Features:** crop, state, district, season, area + engineered climate (`rainfall_temp_interaction`), all **one-hot encoded → 643 columns**.
- **Target:** yield, trained in **log space** (`log1p`), inverted at predict time (`expm1`).
- **Split:** 85/15 train/test, seed 42 → ~210k/37k rows.
- **Tuning:** **Optuna, 20 trials**, XGBoost (`reg:squarederror`, `tree_method=hist`).
- **Results (`model_metadata.json`):** **R²=0.8742, MAE=25,061.59 kg/ha, MAPE=29.79%**.
- **Serving:** FastAPI `/predict/dynamic` → `inference.py` builds a one-hot row, **reindexes to the 643 columns** (missing→0), predicts, `expm1`, multiplies per-ha by area (acres→ha ×0.4046856422), attaches **confidence band** = per-crop 5th–95th percentile.

**Honest framing:** "R²≈0.87 is strong for messy real agri data; MAPE≈30% means decision-support, not precision — that's why I show a **range**, and the range is an honest **historical percentile**, not a model-derived interval." Backend **degrades gracefully** if the service is down (saves listing with yield=0).

## 9.5 GENAI: RAG CHATBOT + NEGOTIATION AGENT

**Concept recap:** LLM (2F.1), RAG (2F.2), function-calling/agentic loop (2F.3).

- **RAG chatbot (`ragController`):** 10-doc policy KB → **keyword-overlap** scoring of the user query vs each doc → **top-3** docs injected into the **Groq** (`openai/gpt-oss-20b`) prompt → grounded answer. Prevents hallucination about platform rules. *(Honest: keyword overlap, not vector embeddings — legitimate for a small fixed KB.)*
- **Negotiation agent (`agentController`):** agentic loop, **MAX_ITER=5**, gives the LLM **3 tools** via function-calling — (1) live market price, (2) AI yield prediction, (3) listing details. The LLM decides which to call; the backend runs the real function and feeds results back; the LLM proposes a fair price **from real data**, not invented numbers.

## 9.6 THE MARKET-PRICE ENGINE

**Concept recap:** live official data + resilient fallback (3.12).

`marketScraper.js` → data.gov.in Agmarknet (resource `9ef84268-…`, field `modal_price`). Hardened fetch: 2 attempts, 800 ms backoff, 20 s timeout; widens search **district → state → national** to always find a price. **4-tier `getLatestPrice`:** (1) 25-hour **cache**, (2) **live** fetch, (3) **last-verified** cached (`data_gov_cached`), (4) date-seeded **simulated** (±5%, clearly labeled). The UI shows **which source** was used — simulated is never passed off as live. Refreshed daily **6 AM IST** by `cronJobs` + boot self-heal. **War story (Part 11):** the gov feed intermittently 502s and a shared sample key throttles — the fix was the hardened fetch + fallback **and** the user setting a personal `DATA_GOV_API_KEY`.

## 9.7 PWA / OFFLINE-FIRST

**Concept recap:** PWA/service worker (2G.1–2G.2), IndexedDB/Dexie (2G.3).

`vite-plugin-pwa` (Workbox, `autoUpdate`) caches the app shell so it loads offline and installs to the home screen (`InstallPrompt`). **Dexie** (`AgriChainOfflineDB`) caches viewed listings/contracts for offline **reads**. Offline **writes** (text-only) go into a **3-retry sync queue** (`offlineQueue`) that drains when `useOnlineStatus` reports back online; `SyncStatusBar` shows pending count. **Honest scope:** photo uploads need a live connection (not queued).

---

# PART 10 — DATABASE SCHEMA, TABLE BY TABLE

> ~20 tables across `schema.sql`, `escrow_schema.sql`, `market_schema.sql`. The spine is **users → listings → contracts → escrow → milestones/ledger**.

### 10.1 Core tables (`schema.sql`)
- **`users`** — `id`, `name`, `email` (UNIQUE), `password_hash` (bcrypt), `role` (farmer/buyer/admin), `is_verified`, `otp`/`otp_expiry`, `two_factor_enabled`, farm registration fields (farm name, **registered lat/long**, address), timestamps. The identity + farm-of-record table.
- **`listings`** — `id`, `farmer_id`→users, crop, `quantity`, `price`, soil, season, `area`, `photo_url`, `reg_doc_url`, **`predicted_yield`** + confidence band, `gps_lat`/`gps_lng`, status, timestamps. One farmer → many listings.
- **`contracts`** — `id`, `listing_id`→listings, `buyer_id`→users, `farmer_id`→users, `quantity`, `price_per_quintal`, `buffer_percent`, **`status`** (pending/accepted/rejected/active/completed/disputed), timestamps. The deal record.
- **`crop_stages`** — `id`, `listing_id`→listings, `stage_name` (sowing/vegetative/flowering/pre-harvest/harvest), `photo_url`, `stage_lat`/`stage_lng`, **`gps_verified`**, `distance_meters`, notes, timestamps. The growth-proof records.
- **`notifications`** — `id`, `user_id`→users, `message`, `type`, `is_read`, timestamps. Created inside the same transactions as the events that trigger them.
- **`reviews`** — `id`, `contract_id`→contracts, `reviewer_id`, `rating`, `comment`, timestamps; **UNIQUE(contract_id, reviewer_id)** → duplicate review = `409`.
- **`watchlist`** — `id`, `buyer_id`→users, `listing_id`→listings; **UNIQUE(buyer_id, listing_id)**.
- **`updates`** — admin broadcasts/announcements.

### 10.2 Escrow tables (`escrow_schema.sql`) — the money spine
- **`escrow`** — `id`, `contract_id`→contracts (one-to-one), **`total_locked`**, **`released`**, `refunded`, **`status`** (active/completed/disputed/refunded), timestamps. The escrow account per contract.
- **`escrow_milestones`** — `id`, `escrow_id`→escrow, `stage_name`, **`percent`** (15/15/20/20/10), `amount`, **`released`** (bool), `released_at`. The staged release schedule.
- **`escrow_ledger`** — `id`, `escrow_id`→escrow, **`type`** (lock/release/settle/refund), **`amount`**, **`balance`** (running), `note`, `created_at`. **Append-only** — the immutable audit trail that nets to zero.
- **`idempotency_keys`** — `id`, **`key`** (UNIQUE, the `X-Idempotency-Key`), `result` (stored JSON response), `created_at`. Makes money ops safe to retry.
- **`disputes`** (or dispute fields on escrow) — open/resolved state that freezes money ops (`423`).

### 10.3 Market tables (`market_schema.sql`)
- **`market_prices`** — `id`, crop/commodity, state, district, **`modal_price`**, **`source`** (data_gov_live / data_gov_cached / simulated), `fetched_at`, with a UNIQUE/`ON CONFLICT` key on (crop, state, district, source, date) for upserts. Powers the 4-tier fallback + source labeling.

### 10.4 Relationships at a glance
```
users(1) ──< listings(∞)
users(1) ──< contracts(∞ as buyer)     users(1) ──< contracts(∞ as farmer)
listings(1) ──< contracts(∞)
listings(1) ──< crop_stages(∞)
contracts(1) ──1 escrow(1)
escrow(1) ──< escrow_milestones(5)
escrow(1) ──< escrow_ledger(∞, append-only)
users(1) ──< notifications(∞) / reviews(∞) / watchlist(∞)
```
Foreign keys enforce referential integrity; `NULLIF` guards protect analytics aggregates from divide-by-zero.

# PART 11 — PROBLEMS SOLVED (root cause → fix)

> Condensed from the Problems-Solved doc. 🔥 = real war story (debugged in production); 🛡️ = engineered-against by design. War stories are gold — they prove you shipped and debugged something real.

### Money & concurrency (engineered)
1. 🛡️ **Double-payment on double-click / retry.** *Root:* release is not naturally idempotent. *Fix:* `X-Idempotency-Key` + UNIQUE table → replay stored result; plus advisory lock + `FOR UPDATE`. *Soundbite:* "Clicking release five times pays once."
2. 🛡️ **Concurrent releases racing to a wrong total.** *Root:* interleaved transactions (lost update). *Fix:* SERIALIZABLE + `pg_advisory_xact_lock(contract_id)` + row locks. *Soundbite:* "Money ops on one contract are serialized, even across server instances."
3. 🛡️ **Market spike over-releasing.** *Root:* if payout followed market unbounded, it could exceed what the buyer locked. *Fix:* settlement `gross = min(desired×qty, total_locked)`; leftover refunds. *Soundbite:* "Farmer gets the upside, but never more than what's locked."
4. 🛡️ **Partial writes leaving orphan state.** *Root:* accept touches 5 tables. *Fix:* one atomic transaction — all or nothing. *Soundbite:* "There's no accepted contract without an escrow."
5. 🛡️ **Proving the math is right.** *Root:* money math is easy to get subtly wrong. *Fix:* **53-assertion** test suite locking lock/milestones/settlement/cap/refund/ledger-nets-to-zero. *Soundbite:* "I don't trust the math — I test it."
6. 🛡️ **Disputed escrow still payable.** *Root:* a dispute must freeze funds. *Fix:* open dispute → every money endpoint returns `423 Locked`. *Soundbite:* "Dispute freezes the money at the HTTP layer."

### Deployment (real war stories)
7. 🔥 **Emails silently failed in production.** *Root:* **Render free tier blocks SMTP ports 25/465/587**, so Nodemailer/Gmail never sent. *Fix:* switched to **SendGrid HTTPS API**. *Soundbite:* "The platform blocked SMTP, so I moved email to an HTTPS API."
8. 🔥 **Market prices stuck on 'simulated'.** *Root:* gov feed intermittently 502s + shared sample key throttled. *Fix:* hardened fetch (retries/backoff/timeout, widen district→state→national) + 4-tier fallback + source labeling + **user sets personal `DATA_GOV_API_KEY`** + boot self-heal. *Soundbite:* "I made a flaky government API non-fatal and never faked 'live'."
9. 🔥 **Login looked broken (password flash).** *Root:* Render free-tier **cold start** (~30–60s) made the first request time out, showing a scary error. *Fix:* understood it's cold start (account was fine); guidance + warm-up. *Soundbite:* "It wasn't a bug — it was a cold start on a free tier."
10. 🔥 **Gmail App-Password spaces.** *Root:* the 16-char app password copied with spaces broke auth. *Fix:* strip spaces + boot-time verify. *Soundbite:* "A copy-paste artifact broke auth; I added a boot verification."
11. 🔥 **Python version mismatch on deploy.** *Root:* default Python broke a dependency build. *Fix:* pin **PYTHON_VERSION=3.12.4** in `render.yaml`. *Soundbite:* "I pinned the Python version so builds are reproducible."

### Fraud, frontend, ML, resilience (engineered)
12. 🛡️ **Fake stage photos from elsewhere.** *Fix:* EXIF→OCR→fallback GPS chain + Haversine ≤500 m. *Soundbite:* "You have to prove you're at your farm."
13. 🛡️ **Transparent buttons (invisible CTA).** *Root:* CSS layer/specificity. *Fix:* `@layer base` ordering fix. *Soundbite:* "A CSS layering bug made buttons invisible; fixed the cascade."
14. 🛡️ **Offline farmers losing work.** *Fix:* PWA + IndexedDB cache + 3-retry sync queue. *Soundbite:* "It works on a train and syncs when back online."
15. 🛡️ **Yield model skew.** *Fix:* `log1p`/`expm1` target transform. *Soundbite:* "Log-transformed a skewed target."
16. 🛡️ **Feature-column mismatch at predict time.** *Fix:* reindex to saved 643 columns (missing→0). *Soundbite:* "Prediction rebuilds the exact training columns."
17. 🛡️ **False precision in yield.** *Fix:* honest confidence band (historical percentile). *Soundbite:* "A range, honestly labeled, beats a fake-precise number."
18. 🛡️ **Heavy ML bloating the API.** *Fix:* separate Python service + graceful degradation. *Soundbite:* "ML is isolated; if it's down, listings still save."
19. 🛡️ **Account-enumeration on forgot-password.** *Fix:* identical `200` regardless of whether the email exists. *Soundbite:* "You can't probe which emails are registered."
20. 🛡️ **Duplicate reviews/watchlist.** *Fix:* UNIQUE constraints → `409`. *Soundbite:* "The database enforces no-duplicates."
21. 🛡️ **Divide-by-zero in analytics.** *Fix:* `NULLIF` guards. *Soundbite:* "Aggregates never crash on empty sets."

### "Which problem for which question"
| If they ask… | Lead with |
|---|---|
| "Tell me about a hard bug" | #8 market feed (real, multi-layered) or #7 SMTP |
| "How do you handle concurrency?" | #1 + #2 |
| "What are you proudest of?" | #5 (tested money math) + escrow design |
| "A time something failed in prod?" | #9 cold start or #7 SMTP |
| "Security?" | #19 enumeration + #12 GPS fraud + JWT posture |

---

# PART 12 — INTERVIEW Q&A BANK

**Q: Explain the project in one line.**
A: An AI-powered farmer↔buyer crop-contract marketplace where the buyer's money sits in a GPS-verified milestone escrow and settles against live government market prices.

**Q: Why microservices / why 4 services?**
A: I split where the seam is real — ML libraries are Python-only and heavy, so the model runs in its own FastAPI service; that gives independent scaling/deploy and graceful degradation. Frontend and DB are natural tiers. I deliberately did *not* over-split into a dozen services.

**Q: Why PostgreSQL over MongoDB?**
A: It moves money. I need ACID transactions, `SELECT FOR UPDATE`, advisory locks, and SERIALIZABLE isolation — all first-class in Postgres. NoSQL would force me to bolt on money-safety it doesn't give natively.

**Q: How does the escrow prevent double-payment?**
A: Three stacked layers — SERIALIZABLE transaction, `pg_advisory_xact_lock(contract_id)`, and `SELECT FOR UPDATE` — plus idempotency keys that replay the stored result on retry, plus an append-only ledger. Proven with a 53-assertion test.

**Q: Walk me through JWT auth.**
A: On login I sign `{id, role}` with HS256 and a 7-day expiry using `JWT_SECRET`. The browser stores it and sends it as a Bearer header; `authMiddleware` verifies the signature and sets `req.user`; `roleMiddleware` enforces RBAC. Tampering breaks the signature, and the attacker can't recompute it without the secret.

**Q: Is JWT in localStorage secure?**
A: It's simple and works, but it's XSS-readable — in production I'd prefer httpOnly cookies with short-lived access tokens + refresh tokens. The payload holds only id and role, no secrets.

**Q: How do you verify the farmer is really at their farm?**
A: A three-source chain — EXIF GPS, then OCR of the GPS watermark, then browser geolocation — then Haversine distance vs the registered farm; within 500 m marks the stage verified. It's a soft gate for decision-support.

**Q: How accurate is the model, honestly?**
A: R²≈0.87, MAPE≈30% on ~247k rows with XGBoost. Strong for messy agri data, but it's decision-support — that's why I show an honest historical-percentile confidence band, not a fake-precise number.

**Q: What happens if the ML service is down?**
A: The backend catches it and saves the listing with a zero prediction — graceful degradation; a dependency outage never blocks the core flow.

**Q: What was the hardest real bug?**
A: The market feed — data.gov.in intermittently 502'd and the shared key throttled, so prices stuck on simulated. I hardened the fetch (retries/backoff/timeout, widening the region search), added a 4-tier fallback with source labeling, a daily cron + boot self-heal, and had the user set a personal API key.

**Q: How is settlement fair to both sides?**
A: Farmer is paid the higher of contracted vs live market price (captures upside), capped at the locked total (buyer never pays more than locked), and any leftover buffer refunds to the buyer. The ledger nets to zero.

**Q: What's mocked vs real?**
A: The payment gateway is mocked — no real rupees move. But the accounting, state machine, concurrency control, and ledger are all real and tested. Only the gateway call is simulated.

**Q: How does offline work?**
A: PWA with a service worker caches the app shell; Dexie/IndexedDB caches reads; text-only writes queue and retry 3× when back online. Photo uploads need a connection.

**Q: How does the chatbot avoid making things up?**
A: RAG — I retrieve the top-3 relevant policy docs by keyword overlap and inject them into the Groq prompt, so it answers grounded in our own docs. (Production would use vector embeddings.)

**Q: What would you improve with more time?**
A: Real payment gateway; httpOnly-cookie auth + refresh tokens; vector-embedding RAG; crypto-secure hashed OTPs; a paid tier to remove cold starts; and pushing MAPE down with more feature engineering.

---

# PART 13 — RÉSUMÉ LINES (honest & strong)

Pick 2–4. All defensible against this doc.

- **Built and deployed AgriChain**, a full-stack AI crop-contract marketplace (React PWA · Node/Express · Python FastAPI · PostgreSQL) live on Vercel/Render/Supabase.
- **Designed a concurrency-safe escrow engine** using PostgreSQL SERIALIZABLE transactions, advisory + row locks, and idempotency keys to guarantee money can never be double-released — verified by a 53-assertion test suite.
- **Trained an XGBoost yield-prediction model** (R²≈0.87 on ~247k records, Optuna-tuned, 643 engineered features) served via a decoupled FastAPI microservice with graceful degradation.
- **Implemented GPS-verified milestone payments** via an EXIF→OCR→geolocation chain and Haversine distance validation against registered farm coordinates.
- **Engineered a resilient market-price pipeline** over the data.gov.in API with a 4-tier fallback (cache→live→last-verified→labeled-simulated), retries, and a daily cron refresh.
- **Delivered an offline-first PWA** (service worker + IndexedDB + retrying sync queue) for low-connectivity rural users.
- **Integrated GenAI**: a RAG chatbot and a function-calling negotiation agent (Groq) grounded in live market + yield data.

---

# PART 14 — GLOSSARY (one line each)

- **ACID** — Atomicity, Consistency, Isolation, Durability: the guarantees of a reliable DB transaction.
- **Advisory lock** — an app-chosen Postgres mutex (`pg_advisory_xact_lock`) held for a transaction, across processes.
- **Agentic loop** — LLM ↔ your tools going back and forth (capped iterations) until it can answer.
- **bcrypt** — salted, deliberately-slow password hashing.
- **Confidence band** — the shown yield range; here a historical 5th–95th percentile (not a model interval).
- **CORS** — server rule allowing specific other origins to call it.
- **Cron** — scheduled recurring task (here: 6 AM IST price refresh).
- **Dexie** — friendly wrapper over IndexedDB.
- **EXIF** — hidden metadata (incl. GPS) inside a photo file.
- **Escrow** — neutral holding of funds, released on proof.
- **Graceful degradation** — core keeps working when a dependency fails.
- **Haversine** — great-circle distance between two lat/long points.
- **HMAC-SHA256 / HS256** — keyed hash used to sign JWTs.
- **Idempotency** — doing an op twice = same effect as once (via a client key).
- **IndexedDB** — a database inside the browser (offline storage).
- **Isolation level** — how much concurrent transactions see of each other (SERIALIZABLE = strictest).
- **JWT** — signed, self-contained identity token (`header.payload.signature`).
- **Log transform (log1p/expm1)** — compress a skewed target for training, invert for prediction.
- **MAE/MAPE/R²** — error metrics (absolute / percentage / variance-explained).
- **Middleware** — functions a request passes through in order (auth, role, validate).
- **Multer** — Express multipart/file-upload parser.
- **One-hot encoding** — turning a category into 0/1 columns.
- **OCR** — turning a picture of text into real text (Tesseract).
- **OTP / 2FA** — one-time code / two-factor auth.
- **PWA** — installable, offline-capable web app.
- **RAG** — retrieve your own docs, then let the LLM answer grounded in them.
- **RBAC** — permissions attached to roles (farmer/buyer/admin).
- **REST** — resource+verb HTTP API style.
- **SELECT FOR UPDATE** — row lock so others wait until you commit.
- **SERIALIZABLE** — strictest isolation; transactions act as if run one-at-a-time.
- **Service worker** — background script enabling offline caching.
- **Transaction** — a group of DB ops that all commit or all roll back.
- **XGBoost** — optimized gradient-boosted decision trees; best-in-class for tabular data.

---

# PART 15 — NUMBERS CHEAT-SHEET (memorize)

| Thing | Number |
|---|---|
| Services | **4** (React PWA · Node/Express · Python FastAPI · PostgreSQL) |
| Backend endpoints / route groups | ~**79** / **20** |
| Backend controllers / services / utils / middleware | **18 / 5 / 4 / 4** |
| Frontend pages / components / lib modules | **26 / 7 / 6** |
| AI live source files | `app.py`, `inference.py`, `climate_service_v2.py`, `train_optimized.py`, `improved_preprocess.py` |
| DB tables | ~**20** |
| **Escrow lock** | **110%** of contract value |
| **Advance** | **15%** |
| **Milestone schedule** | **15 / 15 / 20 / 20 / 10** (= 80% progressive) |
| GPS gate | **≤ 500 m** (Haversine, R = **6,371,000 m**) |
| Contract value | qty(t) × price(₹/quintal) × **10** |
| Settlement | `min(max(offered,market)×qty, total_locked)`; refund leftover |
| bcrypt cost | **10** |
| JWT | HS256, `{id,role}`, **7-day** expiry |
| Model | **XGBoost**, **R²=0.8742**, MAE=25,061.59, MAPE=29.79% |
| Features / rows | **643** one-hot / ~**247k** (210k train / 37k test) |
| Tuning | **Optuna 20 trials**, seed **42**, test_size **0.15** |
| Acres→ha | ×**0.4046856422** |
| Escrow test | **53 assertions** |
| RAG | **10** docs, top-**3**, Groq `openai/gpt-oss-20b` |
| Agent | **3** tools, MAX_ITER **5** |
| Market | data.gov.in resource `9ef84268-…`, field `modal_price`, **4-tier** fallback, **6 AM IST** cron |
| Offline sync retries | **3** |
| Python (Render) | **3.12.4** |
| Deploy | Vercel (frontend) · Render (backend + AI) · Supabase (Postgres + Storage, ap-south-1) |

---

## FINAL WORD

You built four services, a tested money engine, a real ML model, fraud-resistant GPS verification, a resilient government-data pipeline, an offline-first PWA, and two GenAI features — and you **shipped it live**. Know the escrow cold, cite honest numbers, tell one real war story, and hand the interviewer the doors. That's a strong candidate.

*This bible consolidates and supersedes the earlier notes; where anything conflicts, trust the code and `model_metadata.json`. Secrets are referenced by name only, never by value.*





