# AgriChain — Resume-Scoped Interview Prep

> **Scope rule:** this covers **only** what's on your résumé — the full-stack app, REST APIs, JWT auth, email-OTP signup, crop listings, role-based dashboards, contract management, GPS crop-stage verification, milestone escrow, Agmarknet market settlement, and deployment. **No ML, no chatbot/RAG, no offline/PWA.** If an interviewer drags you toward those, you can say *"that's a separate service I kept out of scope for this discussion"* and steer back.

> **How to study this:** read **Part 1** to truly understand each concept (that's where the learning is). Memorise the two scripts in **Part 2**. Drill **Part 3** out loud. Keep **Part 4** (problems) ready — it's what makes you sound real. Glance at **Part 5** the morning of.

---

# PART 1 — THE CONCEPTS, END TO END

Each concept below is: **what it is → how it works in AgriChain → the one line to say.**

## 1.0 The big picture (what the app is)

**What it is:** AgriChain is a web **marketplace** where **farmers** list crops and **buyers** buy them on **forward contracts** — the deal is agreed while the crop is still growing, and the buyer's money is held safely in **escrow** and released in stages as the farmer proves progress, with the final price settled against the **real government mandi price** at harvest.

**The core idea = trust.** A buyer won't pay upfront and hope the crop arrives; a farmer won't grow it and hope they get paid. The platform sits in the middle holding the money and releasing it fairly.

**The architecture (3 moving parts you deployed):**
```
   React frontend  ──HTTPS/REST──▶  Node + Express backend  ──SQL──▶  PostgreSQL
   (Vercel)                          (Render)                          (Supabase)
                                         │
                                         └──▶ Supabase Storage (crop & stage photos)
                                         └──▶ data.gov.in Agmarknet API (mandi prices)
```

**The stack and why:**
- **React** — a marketplace is a highly interactive UI (dashboards, forms, maps); React's component model fits that.
- **Node + Express** — one language (JavaScript) across front and back; Express is a thin, well-understood REST framework.
- **PostgreSQL** — **this is a deliberate choice because the app moves money.** Money needs **transactions, row locking, and constraints** — relational-database strengths. I'll defend this hard in the escrow section.

**The one line:** *"It's a React + Node/Express + PostgreSQL marketplace for forward crop contracts, where payment is held in escrow and released in stages against GPS-verified progress, and settled at the live government market price."*

---

## 1.1 REST APIs

**What it is:** The frontend never touches the database. It only makes **HTTP requests to the backend** — `GET` to read, `POST` to create, etc. — and gets **JSON** back. Each URL (a "route") maps to one action.

**How it works in AgriChain:** Express defines routes like:
- `POST /api/auth/signup`, `POST /api/auth/login`
- `GET /api/listings` (browse crops), `POST /api/listings` (farmer posts one)
- `POST /api/contracts` (buyer offers), `PUT /api/contracts/:id/accept`
- `POST /api/escrow/:contract_id/release-advance`, `POST /api/escrow/:contract_id/settle`
- `POST /api/stages` (farmer uploads a progress photo)

Every request runs through a **chain of middleware in order**: CORS → JSON body parsing → rate limiter → **auth** (verify the token) → **role** (check farmer/buyer) → the **controller** (the actual logic) → JSON response.

**The one line:** *"The browser only ever talks to the backend over a REST/JSON API — the backend is the single thing that touches the database, storage, and the market API. That one rule keeps the whole thing secure and simple."*

---

## 1.2 JWT authentication

**What it is:** **JWT = JSON Web Token.** After you log in, the server hands you a **signed token** that says who you are. You send it with every future request; the server checks the signature instead of asking for your password again. It's **stateless** — the server doesn't store sessions.

**How it works in AgriChain** (this is real, from the code):
1. On login, after the password checks out, the server signs a token: `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })`. The token literally carries your **user id and role**.
2. The React app stores the token and attaches it to every request as a header: `Authorization: Bearer <token>`. This is done **once**, in a single axios interceptor, so no page has to remember to do it.
3. On the backend, `authMiddleware` reads the header, runs `jwt.verify(token, JWT_SECRET)`, and sets `req.user = { id, role }`. If the token is missing or bad → `401`.
4. A response interceptor on the frontend auto-logs-you-out on any `401`.

**Passwords** are never stored raw — they're hashed with **bcrypt** (cost factor 10) and compared with `bcrypt.compare` at login.

**The one line:** *"Login issues a signed JWT carrying the user's id and role; the client sends it as a Bearer token and the server verifies the signature on every request — stateless auth, no server-side sessions. Passwords are bcrypt-hashed, never stored in plain text."*

**Honest trade-off to volunteer:** *"The token lives in localStorage, which is readable by JavaScript — so XSS is the relevant risk. The hardening step would be an HttpOnly cookie plus a Content-Security-Policy. I made it a conscious, known trade-off, not an oversight."*

---

## 1.3 Email-OTP signup

**What it is:** When you sign up, the account isn't active until you **prove you own the email** by entering a **6-digit code (OTP)** sent to it.

**How it works in AgriChain** (real flow from `authController.js`):
1. **Signup:** validate inputs (role must be `farmer` or `buyer`, password ≥ 6 chars), hash the password, generate a **6-digit OTP** with a **10-minute expiry**, and store the user with `is_verified = false`. Email the OTP.
2. **Verify:** user submits email + OTP. The server checks the code matches **and** hasn't expired → sets `is_verified = true`, clears the OTP, and **auto-logs them in** by issuing the JWT right there.
3. **Login while unverified** → the server re-sends a fresh OTP and returns `403` with a "verify your email" step, so a half-finished signup can always be completed.
4. There's an **optional 2FA**: a user can turn on "OTP on every login," which adds a second email-OTP step after the password.

**The one line:** *"Signup sends a 6-digit OTP that expires in 10 minutes; the account stays unverified until the code is confirmed, then it auto-logs you in with a JWT. There's also an optional OTP-on-login as 2FA."*

---

## 1.4 Crop listings

**What it is:** The marketplace primitive. A **farmer** posts a crop they're growing/selling; **buyers browse** these to find something to contract.

**How it works in AgriChain:** A listing is a row in Postgres — crop name, quantity, price expectation, the farm's **state/district and GPS coordinates**, and a **photo uploaded to Supabase Storage** (the backend stores the image and saves the public URL on the row). Buyers hit `GET /api/listings` to browse; a farmer's own listings show on their dashboard. **The farm's registered coordinates saved here are later the reference point for GPS verification** (section 1.7).

**The one line:** *"A listing is the crop a farmer offers — crop, quantity, price, the farm's location, and a photo in object storage. The farm's coordinates on the listing become the anchor for later GPS verification."*

---

## 1.5 Role-based dashboards (RBAC)

**What it is:** **RBAC = Role-Based Access Control.** Farmers and buyers see **different dashboards** and can call **different APIs**. A buyer can't do farmer-only actions and vice-versa.

**How it works in AgriChain:**
- The role is baked into the JWT (`{ id, role }`), so the server trusts it only after verifying the token's signature.
- A tiny `roleMiddleware(...allowedRoles)` wraps protected routes: if `req.user.role` isn't allowed → `403 Access forbidden`. E.g. "create a listing" is farmer-only; "make an offer" is buyer-only.
- **Crucially, this is enforced server-side.** Hiding a button in the UI is cosmetic — the real check is that the endpoint itself rejects the wrong role.

**The one line:** *"Role lives in the verified JWT, and a role middleware re-checks it on every protected route server-side — so hiding a button isn't the security; the API refusing the wrong role is."*

---

## 1.6 Contract management

**What it is:** The **full lifecycle of a deal** between a buyer and a farmer — from offer to settlement, including disputes.

**How it works in AgriChain** (real, from `contractController.js`):
- **Buyer creates a contract request** — listing, quantity, offered price, delivery date, and a **buffer %** (default 10%, clamped 5–25%). Status starts **`pending`**; the farmer is notified.
- **Farmer accepts** → status becomes **`accepted`** and — in the **same database transaction** — the escrow is created and the money is locked (section 1.9). Or **rejects** → status `rejected`. Both notify the other party.
- **Both sides view their contracts** via role-specific endpoints (farmer sees buyers, buyer sees farmers).
- **Settlement** at harvest completes the contract (section 1.10).
- **Disputes:** either party can raise a dispute on an accepted/completed contract (e.g. quality or quantity). This **freezes all money movement** (any escrow release returns `423 Locked`) until an **admin resolves or rejects** it.

**The one line:** *"Contract management is the whole lifecycle — a buyer offers, the farmer accepts or rejects, accepting locks the escrow in the same transaction, it settles at harvest, and either side can raise a dispute that freezes the funds until an admin resolves it."*

---

## 1.7 GPS-based crop-stage verification

**What it is:** For the staged payments to mean anything, **progress has to be real**. So every progress photo the farmer uploads must come from **the farm itself** — proven by the photo's **GPS location**.

**How it works in AgriChain** (real, from `cropStageController.js` + `exifHelper.js`): the backend reads the photo's location in **three tiers, in order**:
1. **EXIF metadata** — phones embed GPS coordinates inside the photo file. I read them with the `exifr` library (`exifr.parse(buffer)` returns latitude/longitude directly). **This is the primary path and it genuinely works.**
2. **OCR fallback** — some camera apps (like "GPS Map Camera") don't write EXIF; they **stamp the coordinates onto the image as a watermark**. If EXIF is empty, I run **OCR** (`tesseract.js`) on the image and parse the coordinates out of the text.
3. **Device coordinates** — as a last resort, the location the browser/device reports.

Then I compute the **Haversine distance** (great-circle distance in metres) between the photo's location and the **farm's registered coordinates** (from the listing). If it's **within 500 m**, the stage is marked `gps_verified = true`. Both points are plotted on an **interactive Leaflet map** (farm = green, photo = red, with a line between them) so the buyer can see it.

**The one line:** *"Each progress photo carries GPS — I read it from EXIF, fall back to OCR of the stamped watermark, then device location — measure the distance to the farm's registered spot with the Haversine formula, and mark it verified within 500 metres, shown on a map."*

**Honest limit to volunteer:** *"It's a soft gate with a tolerance, not cryptographic proof — GPS can be spoofed. It makes faking progress deliberate rather than trivial; to harden it I'd add device attestation."*

---

## 1.8 (This section intentionally folded into 1.7 and 1.9 — GPS gates the escrow releases.)

**The killer connection to say out loud:** *"The GPS verification and the escrow aren't two separate features — the escrow **release is gated on the GPS-verified stage**. The buyer can only release a stage's payment once the farmer has uploaded that stage's photo and it verified against the farm location."* That sentence ties two résumé bullets together and sounds senior.

---

## 1.9 Milestone-based escrow

**What it is:** Instead of paying all at once, the buyer's money is **locked** when the contract is accepted and **released in stages (milestones)** as the crop progresses. "Escrow" = a neutral party (the platform) holding the money.

**How it works in AgriChain** (real, from `escrowController.js`):

**At acceptance:**
- `contract_value = quantity(tonnes) × price(₹/quintal) × 10` (10 quintals per tonne).
- The buyer locks **110%** of that (default 10% **buffer** on top; buffer is clamped 5–25%). The extra 10% is **head-room for the market price rising** by harvest.
- The escrow row + a **5-milestone schedule** are created **in the same transaction** as the accept.

**The 5 milestones (% of contract value):**
| # | Milestone | % | Gate |
|---|---|---|---|
| 1 | Cultivation Advance | 15% | released up-front (funds the sowing) |
| 2 | Sowing Verified | 15% | needs a GPS-verified "Sowing" photo |
| 3 | Vegetative Growth | 20% | needs a "Vegetative Growth" photo |
| 4 | Flowering Verified | 20% | needs a "Flowering" photo |
| 5 | Pre-Harvest Verified | 10% | needs a "Pre Harvest" photo |

That's **80% released progressively**; the remaining ~20% is paid at **settlement**.

**The hard part — keeping money safe under concurrency (this is your flex).** Four layers protect every money operation:
1. **SERIALIZABLE transaction** — every release runs inside `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`; on any error it rolls back entirely.
2. **`pg_advisory_xact_lock(contract_id)`** — an application-level mutex keyed on the contract, so **only one escrow operation per contract runs at a time, even across multiple server instances**.
3. **`SELECT … FOR UPDATE`** — row-locks the escrow/milestone row so two requests can't read-modify-write it at once; the second one blocks, then sees the new state and returns `409`.
4. **Idempotency keys** — each request carries an `X-Idempotency-Key`; if the server has seen it, it **replays the stored result instead of paying again** — so a double-click or a network retry can't double-pay.

Every movement is also written to an **append-only ledger** (`escrow_ledger`) — insert-only, never updated — a bank-statement-style audit trail. And I wrote a **test suite (53 assertions)** that proves the invariant **`total_locked == released_to_farmer + refunded_to_buyer`** always holds — money is never created or lost.

**The one line:** *"The buyer locks 110% at acceptance; it releases across five milestones gated on GPS-verified stages. Every money operation is a serializable transaction behind an advisory lock and a row lock, with idempotency keys so retries never double-pay, and every movement lands in an append-only ledger I test against a conservation invariant."*

**Honest imperfection to volunteer:** *"There's no real payment gateway wired in — a `mockPayment()` mints a reference the way Razorpay/UPI would. The money-movement logic, locking, and ledger are all real; swapping in a real gateway is a drop-in behind the same ledger."*

---

## 1.10 Market-linked final settlement (Agmarknet / data.gov.in)

**What it is:** At harvest the contract **settles** — the farmer is paid the **higher of** the agreed price or the **live market price**, so they're not stuck on a stale rate if the market rose. The market price comes from the **government's official mandi feed**, not a hardcoded number.

**How it works in AgriChain** (real, from `marketScraper.js` + `settleEscrow`):
- The price source is **data.gov.in's Agmarknet feed** — "Current Daily Price of Various Commodities from Various Markets (Mandi)". I use the **modal price** (the government's "most-traded" price).
- A **node-cron job at 6 AM IST** refreshes a national price per crop. On-demand lookups prefer the farmer's own state/district.
- **Settlement math:** `desired_price = MAX(offered, market)`; `payout = MIN(desired_price × quintals, total_locked)` — i.e. the farmer gets the better price **but the escrow can never pay out more than the buyer locked** (the 110% buffer is the ceiling). Any **leftover buffer is refunded to the buyer**. All movements are ledgered.
- **4-tier fallback so it never breaks and never lies:**
  1. recent **cache** (< 25 h) →
  2. **live fetch** (widens district → state → national if a scope is empty) →
  3. **last verified** government price →
  4. **simulated** price (deterministic, ±5%) — **clearly labelled** so a simulated number is never shown as if it were live. Every row records its `source` (`data_gov` / `data_gov_cached` / `simulated`).

**The one line:** *"Settlement pays the higher of the contracted or live mandi price, capped at what's locked, with the excess buffer refunded. The price is the government's Agmarknet modal price via data.gov.in, refreshed by a daily cron, with a four-tier fallback that always labels whether a price is live or simulated."*

---

## 1.11 Deployment

**What it is:** The app runs live across three managed hosts, each doing what it's best at.

**How it works in AgriChain:**
- **Frontend → Vercel** — a static React/Vite build on a CDN.
- **Backend → Render** — the Node/Express API (config in `render.yaml`).
- **Database + file storage → Supabase** — managed PostgreSQL + object storage for the photos (region `ap-south-1`, i.e. Mumbai).

**Two things that make a split deployment work (good to name):**
1. The frontend needs the backend's URL — injected at build time via a `VITE_`-prefixed environment variable.
2. The backend must **whitelist the frontend's origin in CORS**, or the browser blocks the calls.

**The one line:** *"It's deployed live — React on Vercel, the Node API on Render, Postgres and photo storage on Supabase. The two things that make the split work are the build-time backend URL on the frontend and the CORS origin on the backend."*

---

# PART 2 — THE INTERVIEW SCRIPT

## 2A. THE OVERVIEW (~45 seconds — say this first, then STOP)

> "AgriChain is a full-stack marketplace where farmers and buyers agree crop deals in advance, with the payment held safely in escrow until the crop is actually delivered.
>
> The flow is: a farmer lists a crop, a buyer makes a contract offer, and when the farmer accepts, the buyer's money is locked in escrow. Instead of paying all at once, it's released in stages as the farmer proves progress with **location-tagged photos** of the growing crop, and the final amount is settled against the **live government market price** at harvest.
>
> I built and deployed the whole thing — a React frontend, a Node and Express backend, and a PostgreSQL database — and it's live."

**Then stop.** The pause invites "tell me more" — which is exactly the question you want.

## 2B. THE DETAILED WALKTHROUGH (when they say "go deeper")

Deliver as six short beats. Pause after each.

**Beat 1 — the problem (10s)**
> "The core problem is trust. A buyer doesn't want to pay upfront and hope the crop arrives; a farmer doesn't want to grow it and hope they get paid. So the platform is built around escrow — a neutral middle that holds the money and releases it fairly."

**Beat 2 — accounts and roles (20s)**
> "Users sign up as a farmer or a buyer, verified by a 6-digit email OTP. Login issues a signed JWT that carries the user's id and role, and that role drives everything — farmers and buyers get different dashboards and different permissions, enforced on the server, not just hidden in the UI."

**Beat 3 — the main flow (30s)**
> "A farmer posts a listing — crop, quantity, price, the farm's location, a photo. A buyer sends a contract offer. When the farmer accepts, the system locks the buyer's funds in escrow — actually 110%, with a 10% buffer — and splits it into five milestones. As the crop grows, the farmer uploads progress photos, and each milestone's money is released once that stage is verified. At harvest it settles against the live market price and any leftover buffer goes back to the buyer."

**Beat 4 — the location check (25s)**
> "For milestones to mean anything, progress has to be real. Each photo carries GPS — I read it from the photo's EXIF metadata, fall back to OCR of the coordinates some camera apps stamp onto the image, then device location as a last resort. I measure the distance from the farm's registered spot and only mark it verified within about half a kilometre, and I show both points on a map. I'm honest that it's a soft check with tolerance, not unspoofable proof."

**Beat 5 — the hard part, escrow safety (30s — your flex)**
> "The part I'm most proud of is keeping the money safe under real conditions. If someone double-clicks 'release' or the network retries, you can't pay twice. So every money operation is one strict serializable transaction, I take an advisory lock on the specific contract so two operations on it can't overlap even across servers, I row-lock and re-check state, and each request carries a one-time key so a repeat just replays the first result. Every movement is written to an append-only ledger, and a test suite proves the total locked always equals what's paid out plus what's refunded."

**Beat 6 — market price and deployment (20s)**
> "The settlement price isn't hardcoded — it's the government's Agmarknet mandi price from data.gov.in, refreshed daily, with a fallback chain so if the feed is down the app still works and never shows a simulated price as if it were live. And it's all deployed — React on Vercel, the Node API on Render, Postgres and photo storage on Supabase."

**Closing line (optional):**
> "So end to end: list, offer, accept, funds locked, released stage by stage on verified progress, settled at market price — with the money provably safe the whole way through."

---

# PART 3 — POSSIBLE QUESTIONS & ANSWERS

> Answer the question asked, then stop. "If pushed" = the depth you keep in reserve.

### Architecture & REST
**Q: Walk me through what happens on one logged-in request.**
> "The browser's axios instance attaches the JWT as a Bearer token. On the backend it hits CORS, JSON parsing, a rate limiter, then auth middleware verifies the token and sets `req.user`, then role middleware checks the role, then the controller runs, talks to Postgres, and returns JSON."

**Q: Does the frontend ever talk to the database directly?**
> "Never. The browser only talks to the Node backend over REST. The backend is the only thing that touches Postgres, storage, and the market API. That's the one hard rule."

**Q: Why PostgreSQL and not MongoDB?**
> "Because it's money. Escrow needs ACID transactions, row locking, and constraints — relational strengths. Moving money across contract, escrow, milestones, and a ledger is exactly the transactional workload a document store is worst at."

### JWT & auth
**Q: How does JWT auth work here?**
> "On login, after bcrypt verifies the password, I sign a token with the user's id and role and a 7-day expiry. The client sends it as a Bearer header; the server verifies the signature on every request and populates `req.user`. It's stateless — no server-side session store."

**Q: Isn't a JWT in localStorage an XSS risk?**
> "Yes — that's the honest trade-off. localStorage is JS-readable, so XSS is the risk. The fix is an HttpOnly cookie plus a CSP. I chose localStorage for simplicity as a conscious, known trade-off."

**Q: Can't a buyer just call a farmer-only API directly?**
> "No — the role check is server-side. The role comes from the verified JWT, and role middleware returns 403 for the wrong role. Hiding the button is cosmetic; the endpoint itself refuses."

**Q: Why an email OTP at signup?**
> "To prove the user owns the email address before the account goes active. It's a 6-digit code with a 10-minute expiry; until it's confirmed the account stays unverified. There's also optional OTP-on-login as 2FA."

### Crop listings & roles
**Q: What's a listing?**
> "The crop a farmer offers — name, quantity, price, the farm's state/district and coordinates, and a photo in Supabase storage. Those farm coordinates become the reference for GPS verification later."

**Q: How do farmer and buyer dashboards differ?**
> "Role-based. The role is in the JWT; each role gets different pages and different allowed APIs, enforced by role middleware on the server."

### Contract management
**Q: Walk me through a contract's lifecycle.**
> "Buyer offers — quantity, price, delivery date, buffer %. Status pending. Farmer accepts, which locks the escrow in the same transaction, or rejects. It settles at harvest. And either party can raise a dispute that freezes the funds until an admin resolves it."

**Q: What happens to money when a dispute is open?**
> "It's frozen. Any release or settlement returns a 423 Locked until an admin resolves or rejects the dispute. Money shouldn't move while there's an unresolved disagreement."

### GPS verification
**Q: How do you verify a crop photo is really from the farm?**
> "Each photo carries GPS, read three ways in order: EXIF metadata, then OCR of a stamped watermark, then device coordinates. I Haversine-distance it against the farm's registered coordinates and mark it verified within 500 metres, and plot both on a map."

**Q: Is the EXIF read real?**
> "Yes — `exifr.parse()` on the uploaded buffer returns latitude and longitude directly. It's the primary path; OCR only kicks in when a photo has no EXIF GPS."

**Q: GPS is spoofable though?**
> "Correct — it's a soft gate with tolerance, not proof. It makes faking progress deliberate instead of trivial. Hardening would be device attestation or liveness."

**Q: Why 500 metres?**
> "A farm has real extent and GPS has error, so a photo from anywhere on the plot should pass while one from town fails. 500 m balances those."

### Escrow (expect the most depth here)
**Q: How do you prevent paying a milestone twice?**
> "Four layers: every money op is a SERIALIZABLE transaction; an advisory lock on the contract id serialises the whole operation even across instances; SELECT FOR UPDATE row-locks and re-checks state; and an idempotency key makes a retry replay the stored result instead of paying again. A double-click just gets a 409."

**Q: Advisory lock *and* SELECT FOR UPDATE — isn't that redundant?**
> "They overlap but differ. FOR UPDATE locks the specific rows I read. The advisory lock is one explicit gate keyed on the contract that serialises the whole operation before I even read — cleaner when an op touches several rows. Belt and suspenders on money."

**Q: How do you know the math is correct?**
> "A 53-assertion test around the invariant total_locked == released_to_farmer + refunded_to_buyer. That's how I know money is conserved, rather than hoping."

**Q: Why lock 110%?**
> "The extra 10% is head-room so if the market price at harvest exceeds the contracted price, the farmer can still get the market rate out of escrow. Whatever buffer isn't needed is refunded to the buyer at settlement."

**Q: Walk me through settlement.**
> "Farmer gets the higher of contracted or live market price, but the payout is capped at what's locked, so escrow never pays more than the buyer put in. Subtract whatever was already released, pay the balance, refund the leftover buffer — and ledger all three."

**Q: Is there a real payment gateway?**
> "No — a mockPayment() stands in for Razorpay/UPI and mints a traceable reference. The locking, state machine, and ledger are all real; a real gateway drops in behind the same ledger."

### Market price
**Q: Where does the market price come from?**
> "data.gov.in's Agmarknet feed — the government's daily mandi prices. I use the modal (most-traded) price, refreshed by a 6 AM cron, preferring the farmer's state/district."

**Q: What if that API is down?**
> "A four-tier fallback: a cache under 25 hours, then a live fetch that widens district→state→national, then the last verified government price, then a clearly-labelled simulated price. Every row records its source, so a simulated price is never passed off as live."

### Deployment
**Q: How is it deployed?**
> "React on Vercel, Node API on Render, Postgres and photo storage on Supabase. The frontend gets the backend URL from a build-time env var, and the backend whitelists the frontend origin in CORS."

### Behavioural
**Q: What was the hardest part?**
> "The escrow — making staged payments safe under concurrent requests without ever double-paying or losing a rupee. Four layers of protection and a 53-assertion test to prove it."

**Q: What's your role / did you build it alone?**
> *(answer honestly — if solo:)* "End to end — schema, backend, frontend, and deployment — which is why I can explain any layer."

---

# PART 4 — PROBLEMS I FACED & HOW I SOLVED THEM

> Each maps to a résumé concept. Format: what broke → why → how I fixed it → the lesson.

### P1 — OTP emails were silently failing (→ email-OTP signup)
- **Problem:** Signup OTP emails sometimes never arrived, with no error shown.
- **Why:** Two causes. (1) The Gmail App Password was stored with its display spaces, which SMTP auth rejected. (2) Render's free tier **blocks outbound SMTP ports**, so Gmail SMTP couldn't connect at all.
- **Fix:** Stripped the spaces, then switched OTP delivery to **SendGrid's HTTPS API** (which isn't port-blocked), and added a **boot-time check** so a bad email config fails **loudly in the logs** instead of silently for users.
- **Lesson:** make external-dependency failures loud and early, and don't assume a host allows raw SMTP.

### P2 — Double-payment risk in escrow (→ milestone escrow)
- **Problem:** A buyer double-clicking "release", or a network retry, could pay the same milestone twice.
- **Why:** Naive read-modify-write on the escrow row races under concurrent requests.
- **Fix:** Wrapped every money op in a **SERIALIZABLE transaction**, added a **`pg_advisory_xact_lock`** on the contract, **`SELECT … FOR UPDATE`** on the rows, and **idempotency keys** so a repeat replays the first result. Guarded with a `409` on an already-released milestone, and proved conservation with a **53-assertion test**.
- **Lesson:** anything touching money must be designed for concurrency from the start, and verified with tests, not assumed correct.

### P3 — GPS verification failed on photos with no EXIF (→ GPS verification)
- **Problem:** Many farmer photos came from camera apps that **don't write EXIF GPS** — so the verification found no coordinates and failed.
- **Why:** Apps like "GPS Map Camera" **stamp the coordinates onto the image as a visible watermark** instead of embedding EXIF.
- **Fix:** Added a **second tier — OCR** (`tesseract.js`) that reads the stamped coordinates off the image when EXIF is empty, and a **third tier** using the device's reported location as a last resort.
- **Lesson:** real-world input is messier than the happy path; layer fallbacks for how users actually behave.

### P4 — Market prices stuck on "simulated" (→ market settlement)
- **Problem:** The market page kept showing simulated prices even when the live feed was reachable.
- **Why:** Two causes. (1) The boot self-heal skipped fetching if **any** row for today existed — **including a simulated one** — so it never upgraded to live. (2) The shared **public sample API key was being rate-limited**.
- **Fix:** Changed the trigger to only skip when a **genuine live row** exists, added an **admin refresh button**, and the real fix is **setting a personal data.gov.in API key** so the feed isn't throttled.
- **Lesson:** "has data" and "has *good* data" are different conditions — be precise about self-heal triggers.

### P5 — "Incorrect password" flash right after deploy (→ deployment + auth)
- **Problem:** The first login after the app sat idle sometimes flashed an error.
- **Why:** Render's free tier **sleeps** idle instances; the first request wakes it (a **cold start**) and can be slow enough to look like a failure.
- **Fix:** Explained/handled the cold-start latency; the real-world fix is a warm-up ping or a paid always-on instance. (The account/password logic itself was fine.)
- **Lesson:** free-tier cold starts are a real UX issue; know the difference between a genuine error and infrastructure latency.

---

# PART 5 — ONE-PAGE NUMBERS CHEAT-SHEET (résumé scope only)

**Stack / deploy**
- React (Vercel) · Node + Express (Render) · PostgreSQL + photo storage (Supabase, `ap-south-1`)

**Auth**
- bcrypt **cost 10** · JWT **`{id, role}`, 7-day** expiry · OTP **6-digit, 10-minute**

**Escrow / money**
- Lock **110%** (buffer default **10%**, clamped **5–25%**)
- `contract_value = quantity(tonnes) × price(₹/quintal) × 10`
- Milestones: **5 stages — 15 / 15 / 20 / 20 / 10%** (= 80%; ~20% at settlement)
- Settlement = **MAX(offered, market) × quintals**, **capped at total_locked**; excess buffer refunded
- Safety: **SERIALIZABLE + advisory lock + SELECT FOR UPDATE + idempotency key** → append-only **ledger**
- Invariant tested: **total_locked == released_to_farmer + refunded_to_buyer** (**53 assertions**)

**GPS verification**
- Tiers: **EXIF → OCR → device** · verified within **500 m** · **Haversine** distance · Leaflet map

**Market price**
- **data.gov.in Agmarknet**, **modal** price · **6 AM IST** daily cron
- **4-tier fallback:** cache < **25 h** → live (district→state→national) → last-verified → simulated **±5%** (always source-labelled)

---

### Final delivery reminders
- **Overview first, then silence.** The pause invites the deep-dive question.
- **Lead the deep-dive with escrow** if they ask "what was hard."
- **Say the GPS-gates-the-escrow connection** — it ties two bullets together.
- **Volunteer one honest limit** per topic (localStorage/XSS, GPS soft-gate, mock payment) — it reads as senior, not weak.
- **Say "deployed / live" out loud** — it separates you from local-only projects.
