# AgriChain — Master Guide, Part 7: Interview Q&A, Numbers Cheat-Sheet & Glossary

> **What's in it:** the "night before the interview" material. Anticipated **questions and tight answers** grouped by topic; a **one-page numbers cheat-sheet** (every figure in the project); an honest **"what I'd improve"** list (turns weaknesses into maturity); and a **glossary** of every term in this guide.
>
> Legend: **✅ ON RÉSUMÉ** · **ℹ️ OFF RÉSUMÉ** · **🎒 BACK POCKET**

---

# PART A — ANTICIPATED Q&A

> How to use this: read the **question**, then the **short answer** (what you say), then the **if pushed** (the depth you keep in reserve). Don't recite — answer the question asked, then stop.

## A1. Opening / "walk me through your project"

**Q: Tell me about AgriChain.**
> *"AgriChain is a full-stack platform that connects farmers and buyers with forward contracts backed by a milestone-based escrow. A farmer lists a crop — with an ML-predicted yield — a buyer offers a contract, and when the farmer accepts, the money is locked in escrow. It releases in stages as the farmer proves crop progress with GPS-verified photos, and settles at harvest against the live government market price. It's React on the front, Node/Express + PostgreSQL on the back, a separate Python/XGBoost ML service, and it's deployed live on Vercel, Render, and Supabase."*

**Q: What part are you most proud of / was hardest?**
> *"The escrow engine. Getting money to release in stages without ever double-paying or losing a rupee under concurrent requests took four layers of protection and a 53-assertion test to prove the math. That's the part I can defend the deepest."* (→ Deep dive in Part 6.)

**Q: What was your role?** *(Answer honestly for your situation — if solo:)*
> *"I built it end to end — schema, backend, frontend, the ML service, and deployment — which is why I can explain any layer."*

## A2. Architecture

**Q: Why split into separate services instead of one app?**
> *"Real seams. The ML libraries are heavy and Python-only, so the model is its own service; the frontend is a static build; the database is managed. Each deploys and scales independently, and the backend degrades gracefully if the ML service is down."*

**Q: What's the request flow for a logged-in action?**
> *"Browser → axios attaches the JWT → Node: CORS, JSON parse, rate limiter, then `authMiddleware` verifies the JWT and `roleMiddleware` checks the role, then the controller runs, talks to Postgres, and returns JSON."* (→ Part 5 Flow 0.)

**Q: Does the frontend ever touch the database directly?**
> *"Never. The browser only talks to the Node backend. The backend is the only thing that touches Postgres, storage, the ML service, email, and the price API. That's the one hard rule of the architecture."*

## A3. Database & escrow 🎒

**Q: Why PostgreSQL and not MongoDB?**
> *"Because the escrow is money. Money needs ACID transactions, row locking, and constraints — Postgres's core strengths. Moving money across contract → escrow → milestones → ledger is the relational, transactional workload a document store is worst at."*

**Q: How do you prevent a milestone being paid twice?**
> *"Four layers: every money operation is a SERIALIZABLE transaction; inside it I take a `pg_advisory_xact_lock` on the contract ID so no two operations on the same contract run at once, even across server instances; I `SELECT … FOR UPDATE` to row-lock and re-check state; and each request carries an idempotency key, so a retry or double-click replays the stored result instead of paying again. Every movement is a row in an append-only ledger with a running balance."* (→ Part 6 Deep Dive 1.)

**Q: What's the difference between the advisory lock and SELECT FOR UPDATE — isn't that redundant?**
> *"They overlap but cover different things. `SELECT FOR UPDATE` locks the specific rows I read. The advisory lock is a single explicit gate keyed on the contract ID that serialises the *whole* operation before I even read — cleaner than relying only on row locks when an operation touches several rows, and it makes the intent obvious. Belt and suspenders on money."*

**Q: How do you know the money math is correct?**
> *"A 53-assertion test around the invariant `total_locked == released_to_farmer + refunded_to_buyer`, across seven scenarios times six invariants plus eleven boundary cases, with the buffer factor at 1.10. It's how I know, not hope, that money is conserved."*

**Q: Walk me through settlement.**
> *"Settlement pays the higher of the contracted or live market price — so the farmer isn't stuck on a stale rate — but capped at the total locked, so escrow can never pay out more than the buyer put in. Any leftover buffer refunds to the buyer, and all three movements are ledgered."* (→ Part 5 Flow 8.)

## A4. Auth & security ✅

**Q: How does authentication work?**
> *"Passwords are bcrypt-hashed at cost 10. On login I compare and issue a JWT carrying the user id and role, signed with a secret, 7-day expiry. The client stores it and sends it as a Bearer token; the server verifies the signature on every request. Signup requires an email OTP before the account is active, and 2FA is an optional second OTP at login."*

**Q: JWT in localStorage — isn't that an XSS risk?**
> *"Yes, that's the honest trade-off. localStorage is readable by JavaScript, so XSS is the relevant risk. To harden it I'd move the token to an HttpOnly cookie and add a Content-Security-Policy. I chose localStorage for simplicity and it's a conscious, known trade-off — not an oversight."* (Showing you *know* the weakness is the win.)

**Q: How do you stop role escalation — can't a user just call the admin API?**
> *"The role check is server-side in `roleMiddleware`. Hiding a button in the UI is cosmetic; the server re-checks `req.user.role` from the verified JWT on every protected route, so calling the endpoint directly still gets a 403."*

**Q: Your forgot-password — how do you avoid leaking which emails exist?**
> *"It returns the same response whether or not the account exists — anti-enumeration — so an attacker can't harvest valid emails by probing."*

## A5. GPS verification ✅

**Q: How do you verify a crop photo is really from the farm?**
> *"Each photo carries GPS. I read it three ways in order: EXIF metadata, then OCR of a stamped 'GPS Map Camera' watermark, then the device coordinates as a last resort. I Haversine-distance it against the farm's registered coordinates and mark it verified within 500 metres — and I plot both points on a Leaflet map so it's visible."*

**Q: Isn't GPS spoofable?**
> *"Yes — it's a soft gate with a tolerance, not cryptographic proof. It makes faking progress deliberate rather than trivial. To harden it I'd add device attestation or liveness checks. I'm honest that it's verification-with-tolerance, not proof."*

**Q: Why 500 metres?**
> *"A farm has real extent and GPS has error, so a photo from anywhere on the plot should pass while a photo from town fails. 500 m is the tolerance that balances those."*

## A6. Market prices ✅

**Q: What if the government price API is down?**
> *"A four-tier fallback: recent cache under 25 hours, then a live fetch that widens district → state → national, then the last verified price, then a clearly-labelled simulated value within ±5% of a reference. The UI always shows which source it used, so a simulated price is never passed off as live."*

**Q: You had a bug where it was stuck on simulated — what happened?**
> *"Two things: the shared public sample API key was being throttled, and my boot self-heal skipped fetching if *any* row existed for today — including a simulated one — so it never upgraded to live. I fixed the trigger to only skip on a genuine live row, added an admin refresh button, and the real fix is a dedicated API key."* (→ Part 6 Problem 2.)

## A7. ML service ℹ️

**Q: Tell me about the ML.**
> *"An XGBoost regressor predicting crop yield in kg/ha from crop, state, district, season, soil, irrigation and land size, plus per-district climate averages. About 643 one-hot-plus-numeric features, trained on ~210k rows, R² 0.87 and MAPE around 30% on test. It runs as its own FastAPI service."*

**Q: Anything non-obvious in how you trained or served it?**
> *"I trained on log-transformed yield to handle the heavy skew across crops, and invert it with expm1 at inference. I serve one feature row built to match the training columns exactly, one-hot encoding categoricals and leaving unseen categories at baseline so a new district never crashes a prediction. And I attach a per-crop 5th–95th-percentile confidence band rather than a single number."*

**Q: MAPE of 30% — isn't that high?**
> *"For agricultural yield across many crops and regions, it's a useful planning estimate, not a precise forecast — which is exactly why I present a confidence range, not a hard number. The biggest lever to improve it would be live climate at prediction time instead of historical averages, and collecting fertilizer/pesticide inputs, which the current form doesn't."*

**Q: What happens if the ML service is down when a listing is created?**
> *"The call is wrapped in try/catch — the listing saves with a blank prediction. The model is an enhancement, never a gate on the core action."*

## A8. Frontend ✅

**Q: How does the JWT get onto every request?**
> *"One axios instance with a request interceptor that reads the token from localStorage and sets the Authorization header automatically, plus a response interceptor that logs the user out on a 401. No page has to remember to attach the token."*

**Q: How does the deployed frontend know the backend URL?**
> *"A `VITE_`-prefixed env var baked in at build time. Getting that and the backend's CORS origin right are the two things that make the split deployment work."*

**Q: You mentioned offline support — how?**
> *"It's a PWA. Offline writes queue in IndexedDB via Dexie with timestamps and replay in order on reconnect, up to three retries each; reads are cached too. Photo uploads are the one thing that need a live connection."*

## A9. Curveballs & behavioural

**Q: What would you do differently if you rebuilt it?** → see Part C below.

**Q: What was a bug that took you a while?**
> *"OTP emails silently failing. The Gmail App Password was stored with its display spaces, which SMTP auth rejected, and it only failed on the first send so it was invisible. I stripped the spaces and added a boot-time transport verification so a bad email config fails loudly in the logs instead of silently for users. The lesson: make external-dependency failures loud and early."* (→ Part 6 Problem 3.)

**Q: How did you test it?**
> *"The critical path — escrow money math — has a 53-assertion suite around the conservation invariant. That's where correctness matters most, so that's where I invested the tests."*

**Q: How does it scale?**
> *"The stateless pieces scale horizontally — the API and ML service are stateless behind the JWT, so you add instances. The escrow is safe across instances because of the advisory lock. The two things I'd change for real scale: move the rate limiter from in-memory to Redis, and remove the free-tier cold start with a warm instance."*

---

# PART B — NUMBERS CHEAT-SHEET (one page, memorise the bold)

**Escrow / money 🎒**
- Milestone schedule: **5 stages — 15% / 15% / 20% / 20% / 10%** (= 80%; remainder at settlement)
- Buffer: `clamp(0.05, 0.25)`, **default 0.10 → 110% locked**; `BUFFER_FACTOR = 1.10`
- Settlement price = **MAX(offered, market)**; payout **capped at total_locked**; remainder refunds
- Test suite: **53 assertions** (7 scenarios × 6 invariants + 11 boundary cases)
- Invariant: **`total_locked == released_to_farmer + refunded_to_buyer`**
- Ledger entry types: buffer_locked, advance_released, milestone_released, balance_released, market_adjustment, refund

**Auth ✅**
- bcrypt **cost 10** · JWT **`{id, role}`, 7-day** expiry · OTP **6-digit, 10-min** · rate limit **60 requests / 60 s / IP** (→ 429)

**GPS ✅**
- Tiers: **EXIF → OCR → client** · verified within **500 m** · Haversine Earth radius **6,371,000 m** · latitude decimal-drop fallback assumes a **2-digit degree** (no longitude fallback)

**Market prices ✅**
- **4 tiers:** cache <**25 h** → live (district→state→national) → last-verified → simulated **±5%**
- Refresh: **node-cron 06:00 IST** + boot self-heal · fetch: page size **60**, **20 s** timeout, **2** attempts

**ML service ℹ️ (firsthand from `model_metadata.json`)**
- XGBoost · **643 features** · **R² 0.8742** · **MAPE 29.79%** · MAE 25,061 kg/ha
- Train / test: **210,085 / 37,074** rows · trained 2026-07-28 · XGBoost 2.0.3, sklearn 1.4.2
- Key params: n_estimators **713**, max_depth **7**, lr ≈0.148 · target = **log-yield, inverted with expm1**
- acres → hectares = **× 0.4046856422** · confidence band = crop **5th–95th percentile** (fallback ±15%)

**Middleware / infra**
- Body limit **10 MB** (JSON + urlencoded) · DB connect gate → **`process.exit(1)`** on failure
- Deploy: **Vercel** (frontend) + **Render** (Node API + Python ML, Python **3.12.1**) + **Supabase** (Postgres + Storage, `ap-south-1`)
- DB: **19 tables** · storage buckets: **listings**, **stages**

**Key library versions (headline)**
- express ^4.18.2 · pg ^8.11.3 · jsonwebtoken ^9.0.2 · bcrypt ^5.1.1 · exifr ^7.1.3 · tesseract.js ^5.0.4 · node-cron ^3.0.3
- react ^18.3.1 · react-router-dom ^6.24.0 · leaflet ^1.9.4 / react-leaflet ^4.2.1 · recharts ^2.12.7 · dexie ^3.2.7 · vite ^5.3.1 · vite-plugin-pwa ^0.20.0

---

# PART C — HONEST "WHAT I'D IMPROVE" LIST

> Volunteering these makes you look **senior**, not weak. Each is a real limitation + the fix. Pick 3–4 to mention; keep the rest in reserve.

| Area | Current limitation | What I'd do |
|---|---|---|
| **JWT storage** | Token in `localStorage` → XSS-readable | HttpOnly cookie + CSP |
| **Rate limiter** | In-memory, per-instance | Move to Redis so it's shared across instances |
| **Settle price** | Market price passed from client on settle | Fetch it **server-side inside the settle transaction** so it can't be tampered with |
| **GPS gate** | Soft (spoofable, 500 m tolerance) | Device attestation / liveness; same lat-reconstruction for longitude |
| **Cold start** | Render free tier sleeps → slow first request | Warm-up ping or paid always-on instance |
| **ML climate** | Historical averages, not live | Pull live/seasonal climate at prediction time |
| **ML inputs** | Fertilizer/pesticide left at 0 at serving | Collect them at listing time or drop from schema |
| **Payments** | `mockPayment()` — no real gateway | Integrate a real PSP (Razorpay/Stripe) behind the same ledger |
| **Testing** | Deep tests on escrow only | Extend to auth, GPS, and API integration tests |
| **Observability** | Console logging | Structured logs + error tracking (Sentry) + metrics |

> **The framing line:** *"None of these break the core guarantees — the money math and the auth are solid. They're the difference between a strong portfolio project and a production system, and I know exactly which is which."*

---

# PART D — GLOSSARY (every term in this guide)

**ACID** — Atomicity, Consistency, Isolation, Durability; the guarantees a transactional DB gives. Why Postgres for money.
**Advisory lock** (`pg_advisory_xact_lock`) — an application-defined lock keyed on a value (here the contract ID), auto-released at transaction end; serialises operations even across server instances.
**Append-only ledger** — a table you only ever insert into (never update/delete), so history is auditable. `escrow_ledger`.
**bcrypt** — a deliberately-slow one-way password hash; "cost 10" sets the work factor.
**Buffer** — extra amount locked above contract value (default 10% → 110%) to absorb an upward price move at settlement; leftover refunds to the buyer.
**CORS** — Cross-Origin Resource Sharing; the server whitelists which frontend origin may call it.
**Cron / node-cron** — a scheduler; here it refreshes market prices at 06:00 IST.
**Dexie** — a wrapper over the browser's IndexedDB; used for the offline cache + write queue.
**EXIF** — metadata embedded in a photo, including GPS; read by `exifr`.
**Escrow** — funds held by a neutral party (here the platform) and released as conditions are met.
**Graceful degradation** — non-critical services fail *soft* so the core action still works (ML down → listing still saves).
**Haversine** — a formula for great-circle distance between two lat/long points; here in metres with Earth radius 6,371,000 m.
**HttpOnly cookie** — a cookie JavaScript can't read; the XSS-safe place to store a token (a proposed improvement).
**Idempotency key** — a unique per-action key so a retried/duplicated request replays the first result instead of re-running (no double-pay).
**IndexedDB** — the browser's built-in database; Dexie sits on top of it.
**Isolation level / SERIALIZABLE** — how strictly concurrent transactions are kept from interfering; SERIALIZABLE is the strictest.
**JWT** — JSON Web Token; a signed, tamper-evident token carrying `{id, role}`; verified on every request; stateless.
**Leaflet / react-leaflet** — an open-source interactive-map library (+ its React bindings); tiles from OpenStreetMap.
**MAE / MAPE / R²** — model error metrics: mean absolute error (kg/ha), mean absolute *percentage* error (~30%), and variance explained (0.87).
**Middleware** — functions that run in order on every request (CORS → parse → rate-limit → auth → role → controller).
**Milestone** — a stage of the contract at which a slice of escrow releases (5 milestones: 15/15/20/20/10%).
**Multer** — Express middleware that parses uploaded files into `req.file.buffer`.
**OCR** (`tesseract.js`) — reads text (here GPS coordinates stamped on a photo) out of an image.
**One-hot encoding** — turning a category (e.g. `state`) into many 0/1 columns (`State_karnataka`, …); how the model consumes categoricals.
**Optimistic UI** — show the user their change immediately, then sync to the server (the offline queue pattern).
**PWA** — Progressive Web App; installable, works offline via a service worker (`vite-plugin-pwa`).
**RBAC** — Role-Based Access Control; permissions by role (farmer/buyer/admin), enforced server-side in `roleMiddleware`.
**Rate limiter** — caps requests per IP per window (60/60s) → HTTP 429 when exceeded.
**SELECT … FOR UPDATE** — locks the rows you read for the transaction's duration; stops the read-modify-write race.
**SPA** — Single-Page Application; one HTML page, client-side routing, no full reloads.
**SSL/TLS** — encryption in transit; the DB connection uses it (`DB_SSL`).
**Supabase** — managed Postgres + object storage (image buckets) + a free tier.
**XGBoost** — gradient-boosted decision trees; the go-to model for tabular data; used for yield prediction.
**expm1 / log1p** — `log1p(x)=log(1+x)` and its inverse `expm1`; used to train on log-yield and invert at inference.
**423 / 429 / 409** — HTTP status codes used here: 423 Locked (dispute freeze), 429 Too Many Requests (rate limit), 409 Conflict (state already changed).

---

### End of Part 7 — and the end of the Master Guide

You now have, across seven parts:
1. **Part 1** — every concept from first principles.
2. **Part 2** — the tech stack & architecture, with "why this, not that."
3. **Part 3** — the backend, file by file.
4. **Part 4** — the frontend & the ML service, file by file.
5. **Part 5** — every request/response flow, hop by hop.
6. **Part 6** — the deep dives & the real problems you solved.
7. **Part 7** — interview Q&A, the numbers cheat-sheet, improvements & glossary.

**The night before:** re-read **Part 7** (this file) + the **interview lines** boxed throughout Parts 5–6. **The morning of:** skim the **numbers cheat-sheet** (Part B above). **In the room:** answer the question asked, lead with the escrow story if they want depth, and be honest about the trade-offs — that honesty is what separates you from someone reciting a tutorial.
