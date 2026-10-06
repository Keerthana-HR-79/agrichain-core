# Part 10 — Master Q&A, problems faced, "what I'd improve," glossary & numbers cheat-sheet

> **Group A capstone.** This is your **night-before / morning-of** file. It pulls the whole project together: the 60-second pitch, a rapid-fire Q&A bank across every topic, the real problems you solved, honest improvements, a plain-English glossary, and the numbers you must recall instantly.
> **Defends:** everything — this is where scattered facts become fluent answers.

---

## 10.1 The 60-second pitch (memorize this)

> *"AgriChain is a full-stack agricultural marketplace that solves a trust problem: a buyer and farmer want a forward contract before harvest, but neither trusts the other to pay or deliver. So the platform acts as escrow — it locks the buyer's money when a contract is accepted and releases it to the farmer in five milestones, each unlocked by a progress photo that's GPS-verified against the registered farm using EXIF, an OCR fallback, and the Haversine distance. The final amount is settled against the live government mandi price from Agmarknet, so it's fair if the market moved. It's React on Vercel, Node/Express on Render, and PostgreSQL on Supabase — built and deployed live. The hardest part was making the money logic correct under concurrency: SERIALIZABLE transactions, row and advisory locks, idempotency keys, and an append-only ledger with a money-conservation invariant I test with 53 assertions."*

That single paragraph touches **every** résumé bullet. If you can say it smoothly, you're 70% there.

---

## 10.2 The one mental model (the spine)

> A buyer and farmer don't trust each other, so **the platform holds the money**. Cash is **locked in escrow** on acceptance, **released in stages** as the farmer **proves progress with location-tagged photos**, and the **final price is the live government rate** at harvest.

Map: *listings/dashboards/contracts* = making the deal · *JWT/OTP/roles* = who may do what · *GPS* = proving progress · *escrow + Agmarknet* = moving money safely and fairly.

---

## 10.3 Rapid-fire Q&A bank (across all parts)

**Architecture & stack**
- *Full-stack?* Built all three layers + deploy: React / Node-Express / PostgreSQL.
- *Why one language (JS)?* Browser forces JS on front; Node on back = one language, shared logic/skills.
- *Why PostgreSQL not MongoDB?* It's money — needs ACID transactions, row locks, constraints.
- *Why React?* Interactive dashboards/map/live status — component+state keeps UI synced to data.
- *Library vs framework?* You call a library (React); a framework calls you (Express owns the request flow).

**API layer**
- *REST?* Resource URLs + HTTP verbs + JSON, stateless.
- *401 vs 403?* 401 not authenticated; 403 authenticated but not allowed.
- *Middleware?* Ordered functions per request: CORS → JSON parse → rate-limit → auth → role → controller.
- *How does JWT ride every request?* One axios instance; request interceptor attaches token, response interceptor logs out on 401.

**Auth**
- *JWT?* Signed `{id, role}`, 7-day expiry, verified per request, stateless.
- *What stops role tampering?* The signature — edit the payload and `jwt.verify` fails.
- *Payload encrypted?* No — base64, readable; integrity is from the signature, so no secrets inside.
- *Passwords?* bcrypt cost 10 — one-way, salted, deliberately slow.
- *OTP signup?* 6-digit, 10-min expiry, unverified until confirmed, then auto-login.
- *Forgot-password enumeration?* Same response whether or not the account exists.
- *Token storage risk?* localStorage → XSS; harden with HttpOnly cookie + CSP.

**Listings & RBAC**
- *RBAC?* Permissions by role (farmer/buyer); enforced **server-side** in role middleware from the JWT role.
- *Frontend hiding buttons = security?* No — UX only; real gate is the 403.
- *Role vs ownership?* Role: "you're a farmer." Ownership: "you're the farmer on *this* contract." Need both.
- *Photos in DB?* No — object storage (Supabase), URL in Postgres.

**Contracts**
- *Contract management?* State machine: pending → accepted/active → settled, with reject & dispute(frozen→admin) branches.
- *Accepting an offer does what?* Funds escrow.
- *Value math?* `qty(tonnes) × price(₹/quintal) × 10` (1 tonne = 10 quintals).

**GPS verification**
- *Pipeline?* EXIF (exifr) → OCR fallback (tesseract.js) → Haversine vs registered farm → ≤500 m = verified → Leaflet map.
- *Why Haversine?* Great-circle distance on a sphere; flat distance is wrong on Earth.
- *Why OCR fallback?* EXIF GPS often stripped; GPS-camera apps stamp coords on the image.
- *Can EXIF be faked?* Yes — it's deterrence, not proof; hardening = server capture / signed attestation.

**Escrow (dig zone)**
- *Escrow?* Platform holds money, releases on conditions.
- *Milestones?* 5 stages 15/15/20/20/10%, each gated by a verified photo.
- *Hardest problem?* Double-release under concurrency.
- *Defenses?* SERIALIZABLE isolation + `SELECT FOR UPDATE` row lock + per-contract advisory lock.
- *ACID?* Atomic/Consistent/Isolated/Durable; every money op = one transaction.
- *Idempotency vs locks?* Locks stop simultaneous dup; idempotency key stops retried dup.
- *Ledger?* Append-only immutable rows = audit trail; balance derived from events.
- *Correctness proof?* Invariant `locked == released + refunded (+ held)`, 53-assertion test.
- *Buffer?* ~110%, clamped 5–25%, because settlement uses live price that can rise.
- *Settlement?* `MIN(MAX(offered, market) × quintals, total_locked)`; rest refunded.
- *Real money?* No — `mockPayment()` simulates; accounting/locks/ledger are real.

**Market settlement**
- *Source?* Agmarknet via data.gov.in REST; `modal_price`.
- *Modal price?* Most frequent trade price that day.
- *Resilience?* 4-tier: fresh cache → live (district→state→national) → last verified → simulated ±5%, each source-labeled.
- *Refresh?* node-cron 06:00 IST; cache valid <25h.
- *API key secret?* Fallback is data.gov's public sample key; prod sets its own.

**Deployment**
- *Where?* Vercel (static React) + Render (Node API) + Supabase (Postgres + Storage, ap-south-1).
- *Frontend finds backend?* Build-time `VITE_API_URL` baked into bundle.
- *CORS?* Different origins → backend whitelists Vercel URL; else browser blocks all calls.
- *Cold start?* Render free tier sleeps when idle; first request slow, then fast.
- *Secrets?* Runtime env vars on Render, never in git.

---

## 10.4 Problems I faced & solved (STAR-ready — pick 2–3 to tell)

**1 — OTP emails silently failing.**
*Situation:* signup OTPs sometimes never arrived, no error shown. *Task:* make signup reliable. *Action:* found two causes — the Gmail App Password stored **with display spaces** (SMTP rejected it) and Render free tier **blocking outbound SMTP ports**; stripped the spaces, switched to **SendGrid's HTTPS API** (not port-blocked), and added **boot-time email-config verification** so misconfig fails loudly in logs. *Result:* reliable OTP delivery + fast feedback on bad config. *Lesson:* make external-dependency failures loud and early; don't assume a host allows raw SMTP.

**2 — Concurrency-safe money (the headline).**
*Situation:* risk of double-releasing a milestone under concurrent/retry requests. *Action:* SERIALIZABLE transactions + `SELECT FOR UPDATE` + per-contract advisory lock for simultaneity, **idempotency keys** for retries, **append-only ledger** for audit, and a **53-assertion invariant test**. *Result:* money provably conserved; duplicates impossible. *Lesson:* for money, design for concurrency first and prove it with an invariant.

**3 — "Stuck simulated" market prices.**
*Situation:* prices appeared stuck on the simulated tier. *Action:* fixed boot self-heal to only skip on a genuine live row, added an admin refresh, and identified the real fix — set a **personal `DATA_GOV_API_KEY`** because the shared sample key is throttled. *Result:* live prices flow; clear source labels. *Lesson:* shared demo credentials don't scale; label data provenance.

**4 — Login "wrong password" flash.**
*Situation:* first login after idle flashed an error. *Action:* traced to Render **cold start** (backend waking) compounding with genuine 401s; clarified messaging / guided to forgot-password. *Lesson:* account for infra latency in UX, distinguish infra errors from auth errors.

---

## 10.5 "What would you improve?" (have 3–4 ready — shows maturity)

1. **Real payment gateway** replacing `mockPayment()` (Razorpay/Stripe) with webhook reconciliation into the ledger.
2. **Token hardening:** move JWT from localStorage to an **HttpOnly cookie** + CSP; add refresh-token rotation and server-side revocation.
3. **Server-authoritative market price** fetched **inside** the settle transaction, never client-supplied.
4. **Stronger GPS proof:** server-side capture / signed device attestation / liveness instead of trusting EXIF.
5. **Distributed rate limiting** (Redis) and multiple backend instances for scale; DB read replicas + pooling.
6. **Richer dispute tooling:** evidence uploads, resolution audit trail, SLA states.

---

## 10.6 Glossary (plain English — skim the morning of)

- **Full-stack** — built frontend + backend + database (+ deploy).
- **SPA** — single-page app; JS swaps content instead of full page reloads.
- **REST** — API style: resource URLs + HTTP verbs + JSON.
- **Stateless** — server remembers nothing between requests; each carries its own proof (JWT).
- **Middleware** — ordered per-request functions (auth, roles, parsing…).
- **JWT** — signed token `{id, role}`; verified by signature; tamper-proof, not secret.
- **bcrypt** — slow, salted one-way password hash; cost 10.
- **Salt** — random per-password value so equal passwords hash differently.
- **OTP** — one-time emailed code proving email ownership.
- **2FA** — second login factor (email code) beyond password.
- **RBAC** — role-based access control; permissions by role, enforced server-side.
- **EXIF** — metadata inside a photo (incl. GPS).
- **OCR** — reading text out of an image (Tesseract).
- **Haversine** — great-circle distance between two lat/lng points.
- **Leaflet** — JS interactive map library.
- **Escrow** — trusted third party holds money until conditions met.
- **Milestone** — a staged release (15/15/20/20/10%).
- **ACID** — Atomicity, Consistency, Isolation, Durability.
- **Transaction** — group of DB ops that all commit or all roll back.
- **Race condition** — wrong result from concurrent operations interleaving.
- **SERIALIZABLE** — strictest isolation; behaves as if transactions ran one-by-one.
- **SELECT FOR UPDATE** — locks the read rows until commit.
- **Advisory lock** — app-defined lock (per contract) via `pg_advisory_xact_lock`.
- **Idempotency** — doing it twice = same effect as once (via `X-Idempotency-Key`).
- **Ledger (append-only)** — immutable log of money events; balance derived from it.
- **Invariant** — a condition always true: `locked == released + refunded (+ held)`.
- **Modal price** — most frequent mandi trade price that day.
- **Agmarknet / data.gov.in** — govt source/API for mandi prices.
- **node-cron** — scheduler; refresh prices 06:00 IST.
- **CORS** — server opt-in allowing cross-origin browser calls.
- **Env var** — config/secret injected per environment, not in code.
- **Cold start** — slow first request after an idle free-tier service wakes.

---

## 10.7 Numbers cheat-sheet (recall instantly)

| Thing | Value |
|---|---|
| Stack | React + Vite · Node + Express 4 · PostgreSQL (Supabase) |
| Hosts | Vercel (frontend) · Render (backend) · Supabase ap-south-1 |
| bcrypt cost | **10** |
| JWT payload / expiry | `{id, role}` / **7 days** |
| OTP | **6 digits**, **10-min** expiry |
| Password min length | **6 chars** |
| Roles | **farmer**, **buyer** (+ admin for disputes) |
| Unit conversion | **1 tonne = 10 quintals** (×10) |
| Contract value | `qty(tonnes) × price(₹/quintal) × 10` |
| Milestones | **5** → **15 / 15 / 20 / 20 / 10 %** |
| Escrow buffer | ~**110%** (clamped **5–25%**) |
| Settlement | `MIN(MAX(offered, market) × quintals, total_locked)` |
| GPS tolerance | **≤ 500 m** = verified |
| GPS sources | EXIF (exifr) → OCR (tesseract.js) → device coords |
| Distance formula | **Haversine** |
| Map | **Leaflet** |
| Escrow concurrency | **SERIALIZABLE** + `SELECT FOR UPDATE` + `pg_advisory_xact_lock` |
| Idempotency header | `X-Idempotency-Key` |
| Money invariant | `locked == released + refunded (+ held)` |
| Escrow test | **53 assertions** |
| Market source | Agmarknet via data.gov.in, resource `9ef84268-…-a864a43d0070`, `modal_price` |
| Price refresh | **node-cron 06:00 IST**, cache **< 25h** |
| Price fallback | cache → live (district→state→national) → last verified → simulated ±5% |
| HTTP codes used | 401 / 403 / 409 / 423 / 429 |
| Mocked | `mockPayment()` (no real gateway) |

---

## 10.8 Final exam — can you answer these without notes?

1. Why PostgreSQL and not MongoDB? *(it's money → ACID)*
2. What stops a double milestone release? *(SERIALIZABLE + FOR UPDATE + advisory lock)*
3. Locks vs idempotency keys? *(simultaneous vs retried duplicates)*
4. Full GPS pipeline in order? *(EXIF → OCR → Haversine vs farm → 500 m → Leaflet)*
5. Settlement formula and why the buffer? *(MIN(MAX…), live price can rise)*
6. 401 vs 403? *(auth vs role)*
7. What's real vs mocked in the money flow? *(accounting real, gateway mocked)*
8. What's your money invariant and how is it proven? *(locked == released+refunded, 53 assertions)*
9. How does the deployed frontend reach the backend, and what breaks it? *(VITE_API_URL build-time; CORS)*
10. Your best "what I'd improve"? *(pick one from 10.5 and say why)*

If all ten flow, Group A is interview-ready.

---

### End of Group A. → Group B begins at Part B1 (ML yield prediction) — know the gist, study after Group A.
