# AgriChain End-to-End — Part E5: The Complete User Journey (Capstone)

> **What this part is.** The whole system as a *story* — a real farmer and a real buyer walked end to end, step by step, from "I've never used this" to "the money has settled." Every step points to the part with the mechanical detail (E1 lifecycle, E2 backend, E3 frontend, E4 database, E6 AI). This is the part that makes the other five click into place.

> ## The one mental model (everything hangs off this sentence)
> **A buyer and a farmer don't trust each other, so the platform holds the money.** Cash is **locked in escrow** when the deal is accepted, **released in stages** as the farmer **proves real progress with location-tagged photos** (and the **buyer approves** each release), and the **final price is the live government mandi rate** at harvest.
>
> The cast: **Ravi** (farmer), **Anita** (buyer), **the platform** (holds money + verifies proof), **an admin** (resolves disputes). Three services run the whole time (E0): the **React SPA** (Anita/Ravi's browser), the **Node/Express API** (the referee), the **Python ML service** + **Groq** (the advisors). Data lives in **Supabase Postgres** (E4).

---

## Act 1 — Onboarding (both roles)

**Ravi signs up as a farmer.**
1. `Signup.jsx` (E3) posts `{name,email,password,role:"farmer",phone}` → `POST /api/auth/signup`.
2. Backend (E2 `authController`): bcrypt-hashes the password (cost 10), creates an **unverified** user, generates a **6-digit OTP (10-min expiry)**, and emails it via **SendGrid HTTPS** (E2 `emailService` — SendGrid because Render blocks SMTP).
3. Ravi types the OTP → `POST /api/auth/signup/verify-otp` → the account is marked verified and the backend issues a **JWT `{id, role:"farmer"}`** signed with `JWT_SECRET`, `expiresIn:"7d"`.
4. The SPA stores `token` + `user` in `localStorage` (E3) and routes Ravi to `/farmer-dashboard`.

**Anita signs up as a buyer** — identical flow, `role:"buyer"` → `/buyer-dashboard`. (Admins are *not* self-registered — provisioned out of band; E2.)

**On every later request**, the axios request interceptor stamps `Authorization: Bearer <jwt>` automatically (E1.2), and `authMiddleware` verifies it (E1.6). If Anita enables 2FA (`ProfileEdit` → `POST /api/auth/two-factor`), her next login inserts an OTP step.

> **Data written (E4):** a row in `users` (hashed password, `is_verified`, `role`, optional `two_factor_enabled`); transient OTP state.

---

## Act 2 — Ravi lists a crop (the GPS + AI moment)

Ravi opens `CreateListing.jsx` (farmer-gated, E3). The browser auto-captures his GPS; he fills crop/quantity/price/season and attaches two photos: the **crop image** and a **farm-registration photo** (a GPS-watermarked camera shot of his field). Submit builds a `FormData` → `POST /api/listings/create` (multipart).

Inside `listingController.createListing` (E2), in order:
1. **Register the farm's location** — OCR the farm-registration photo (`tesseract` → `parseGPSData`, E2 utils) to extract the field's lat/lng. **This becomes the anchor** every future stage photo is measured against.
2. **Upload** both images to the Supabase `listings` bucket (E2 `config/supabase`) → public URLs.
3. **Ask the AI for a yield estimate** — `POST {AI_SERVICE_URL}/predict/dynamic` (15 s timeout, E6). The Python XGBoost model returns `total_tonnes` + a confidence band. **If the AI is down → `predicted_yield = 0`, and the listing is still created** (graceful degradation lives in the controller, E6).
4. **INSERT** the `listings` row (crop, qty, price, farm lat/lng, image URLs, `predicted_yield`, `confidence_lower/upper`, `farm_verified`).

Ravi sees the AI-prediction result screen (predicted vs his own expected yield). Note the UI rule (E3 `yield.js`): **his own expected yield is primary; the AI is the fallback** — honest about the model's ~30% MAPE (E6).

> **Data written (E4):** one `listings` row (+ a `prediction_history`/`prediction_log` entry). The listing is now public.

---

## Act 3 — Anita discovers the listing and makes an offer

1. Anita browses `Marketplace.jsx` (public, E3) → `GET /api/listings/all` (served through the **offline wrapper**, so it's cached in IndexedDB for offline viewing, E3). She filters by crop/state/district and "verified only."
2. She opens `ListingDetail.jsx` → `Promise.all([GET /listings/:id, GET /stages/:id])`. She sees Ravi's crop, the 5-stage timeline (empty so far), and — because she's a buyer — a **contract-offer form**.
3. She sets quantity, an offered price, a delivery date, and an **escrow buffer** (5/10/15/20%, default 10 — the cushion that absorbs price swings at settlement). The form shows a **live locked-value estimate** (`qty × price × 10`).
4. Submit → `POST /api/contracts` — gated by `authMiddleware → roleMiddleware("buyer") → validateContract` (E1.6) — which `INSERT`s a **`pending`** contract. **No money moves yet.**

> **Data written (E4):** one `contracts` row, `status = 'pending'`, `buyer_id = Anita` (taken from her JWT, never from the body).

---

## Act 4 — Ravi accepts (the moment money locks) ⭐

This is the system's most carefully engineered step (E2 `contractController.acceptContract`).

Ravi opens `FarmerContracts.jsx`, sees Anita's offer, clicks **Accept** → `PUT /api/contracts/:id/accept` (farmer-gated). The controller runs a **single ACID transaction**:
```
BEGIN
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
pg_advisory_xact_lock(listing_id)        -- no two accepts race on this listing
SELECT ... FOR UPDATE                    -- lock the contract + listing rows
createEscrowOnAccept(client, contract)   -- lock the money, in the SAME transaction
COMMIT
```
`createEscrowOnAccept` (E2 `escrowController`) computes the money and writes the escrow:
- `contract_value = quantity(tonnes) × offered_price(₹/quintal) × 10`
- buffer clamped **5–25%** (Anita chose 10) → **locks `value × 1.10` (110%)**
- writes the **escrow** row, the **milestone schedule**, and the first **append-only `escrow_ledger`** entry (with `running_balance`).

Because escrow creation is *inside* the accept transaction, you can never end up with an accepted contract but no escrow (or vice-versa) — they commit together or not at all.

> **Data written (E4):** `contracts.status → 'accepted'`; one `escrow` row (`total_locked`); several `escrow_milestones` rows (the schedule); one `escrow_ledger` row (the initial lock). All `NUMERIC(15,2)` — never floats.

---

## Act 5 — Ravi proves progress; Anita releases money in stages ⭐ (the corrected mechanic)

Now the staged-release loop runs once per crop stage (Sowing → Early Growth → Vegetative → Flowering → Pre-Harvest).

**Ravi records a stage** (`ListingAddStage` / `StageAddUpdate`, E3) with a **GPS-watermarked photo** → `POST /api/stages/create` (multipart). `cropStageController.createStage` (E2) runs the **verification pipeline**:
```
EXIF GPS (exifHelper)  →  if none: OCR the watermark (ocrHelper → parseGPSData)  →  if none: client coords
Haversine distance (distanceHelper) between the photo and the REGISTERED FARM (Act 2)
gps_verified = (distance ≤ 500 m)      -- threshold hardcoded in the controller
```
The photo is stored in the Supabase `stages` bucket; the stage row is written with `gps_verified` + `distance_from_farm`; watching buyers are notified (E2 `notificationController`). Anita can see the farm-vs-photo pins on `<StageMap>` (E3).

> ### The key correction — verification does **not** auto-release money
> A verified stage sets the **advisory `gps_verified` flag**. It is **evidence**, shown to Anita. **Releasing the milestone is a separate, buyer-initiated action.** Anita goes to `Escrow.jsx` (E3), sees the verified stage, and **clicks Release** → `PUT /api/escrow/contract/:id/milestone/:mId/release`. There is a **human (the buyer) in the loop** — the platform proves location; the buyer decides to pay. *(Earlier drafts implied auto-release; the code says otherwise — E2/E4.)*

Each release (`escrowController`, E2) carries an **`X-Idempotency-Key`** header (stored in `idempotency_keys`) so a double-click can't double-pay, runs as a short `SERIALIZABLE` + advisory-locked transaction, moves money via `mockPayment`, and **appends to the ledger** with the new `running_balance`.

**The milestone schedule** (verified consistent across `escrowController` + `pdfController`, E2):

| Trigger | % of contract value |
|---|---|
| Advance (on accept) | 15% |
| Sowing verified + released | 15% |
| Vegetative Growth | 20% |
| Flowering | 20% |
| Pre-Harvest | 10% |
| **Subtotal released over stages** | **80%** |
| Final settlement (Act 6) | ~20% |

> **Data written (E4):** one `crop_stages` row per stage (+ `crop_updates` for progress notes); one `escrow_milestones` update + one `escrow_ledger` append per release; a `notifications` row to Anita per stage.

---

## Act 6 — Harvest & settlement (the live-price finale)

At harvest, the contract settles at the **live government mandi price**, not the originally-offered price — that's what the buffer was for.

1. Anita (or Ravi, per flow) triggers settlement → `PUT /api/contracts/:id/settle` (a thin alias to `escrowController.settleEscrow`, E2), optionally auto-filling the price via `GET /api/market-prices/crop/:crop`.
2. That price comes from `marketScraper.getLatestPrice` (E2) — the **4-tier ladder**: fresh cache (<25 h) → live data.gov.in (Agmarknet `modal_price`) → last verified `data_gov_cached` → deterministic `simulated`. Every price is **source-labelled** so provenance is honest (this is the fix for the "stuck simulated" issue in project memory).
3. `settleEscrow` reprices the final ~20%, **reconciles the 10% buffer** (refund leftover to Anita, or draw on it if the price rose), runs `mockPayment`, appends the final `escrow_ledger` entries, and **asserts the money invariant**:
   ```
   total_locked == released_to_farmer + refunded_to_buyer + remainder
   ```
   If that doesn't balance, the transaction fails rather than leak money.

> **Data written (E4):** `contracts.status → 'completed'`; `escrow` finalized; final `escrow_ledger` appends; optionally a `market_prices` upsert from the live fetch.

---

## Act 7 — When things go wrong (the real world)

- **Dispute.** Either party hits `PUT /api/contracts/:id/dispute {reason}` (E2/E3). An **admin** opens `AdminDashboard` → `GET /api/contracts/disputes` → `PUT /api/contracts/:id/dispute/resolve {resolution, outcome}` to adjudicate. The ledger + `gps_verified` history + stage photos are the evidence trail.
- **Ravi is offline in the field.** `StageAddUpdate` (E3) detects `!navigator.onLine`, queues the text update in **IndexedDB** (Dexie) and shows "Saved Offline." On reconnect, `useOnlineStatus` auto-replays the queue (`POST /api/updates/create`) after a 1.5 s settle, retrying up to 3×. (Photos aren't queued — a `File` can't be serialized reliably; honest limit, E3.)
- **Render cold start.** The first request after the free-tier dyno sleeps waits ~30–50 s while Node boots, `pool.connect()` runs, and crons start (E1.3/E2.1). A login that "looks" like a wrong password is often just this (project memory).
- **AI service down.** Listing creation still works — `predicted_yield = 0`, listing saves (E6). The market service down → settlement falls back down the 4-tier ladder to a labelled simulated price (E2).
- **Session expires.** Any `401` → the axios response interceptor wipes `localStorage` and hard-redirects to `/login` (E1.2).

---

## E5.8 — One worked money example (Wheat)

Anita contracts Ravi for **5 tonnes of wheat at ₹2,200/quintal, 10% buffer**:
- `contract_value = 5 × 2200 × 10 =` **₹110,000**
- `total_locked = 110,000 × 1.10 =` **₹121,000** (the extra ₹11,000 is the buffer)
- Released as stages are verified **and Anita approves**:
  - Advance 15% = ₹16,500 · Sowing 15% = ₹16,500 · Vegetative 20% = ₹22,000 · Flowering 20% = ₹22,000 · Pre-Harvest 10% = ₹11,000 → **₹88,000 (80%)**
  - Final settlement ~20% = **₹22,000**, repriced at the live mandi rate; the **₹11,000 buffer** is reconciled (refunded to Anita if the price held, drawn down if it rose).
- Invariant at the end: `121,000 == released_to_farmer + refunded_to_buyer + remainder`. ✔

---

## E5.9 — The full sequence (one diagram)

```
RAVI (farmer)        ANITA (buyer)         REACT SPA            NODE API                 DB / SERVICES
    │ signup ─────────────────────────────▶ POST /auth/signup ─▶ bcrypt+OTP ───────────▶ users + SendGrid
    │ verify OTP ─────────────────────────▶ verify-otp ───────▶ issue JWT
    │ create listing (2 photos) ──────────▶ POST /listings/create
    │                                       (multipart) ───────▶ OCR farm GPS ─────────▶ Supabase Storage
    │                                                           ├─ POST /predict/dynamic▶ Python XGBoost (E6)
    │                                                           └─ INSERT listing ──────▶ listings
    │                      browse ─────────▶ GET /listings/all ─▶ SELECT ──────────────▶ listings (+IndexedDB cache)
    │                      offer ──────────▶ POST /contracts ───▶ INSERT pending ──────▶ contracts
    │ accept ─────────────────────────────▶ PUT /contracts/:id/accept
    │                                                           └─ BEGIN SERIALIZABLE ─▶ escrow + milestones + ledger
    │ stage photo ────────────────────────▶ POST /stages/create▶ EXIF/OCR/Haversine ──▶ crop_stages (gps_verified)
    │                      sees verified ──▶ Escrow page
    │                      RELEASE ────────▶ PUT …/milestone/:m/release (idempotent) ──▶ ledger append (money moves)
    │                      settle ─────────▶ PUT /contracts/:id/settle
    │                                                           └─ live mandi price ───▶ marketScraper → data.gov.in
    │                                                              reconcile buffer ───▶ ledger (invariant holds)
```

---

## E5.10 — How every résumé claim maps onto this journey

| Résumé claim | Where it happens in the journey |
|---|---|
| "full-stack … REST APIs, JWT auth, email-OTP signup" | Act 1 (E1/E2 auth) |
| "crop listings" | Act 2 (E2 `listingController`) |
| "role-based dashboards for farmers and buyers" | Acts 1–3 (E3 per-page gates + Navbar) |
| "GPS-based crop-stage verification (EXIF + OCR fallback, distance to farm, interactive map)" | Act 5 (E2 utils + `<StageMap>`) |
| "milestone-based escrow for staged payments" | Acts 4–5 (E2 `escrowController`, the SERIALIZABLE accept + idempotent releases) |
| "final settlement linked to live mandi prices (Agmarknet / data.gov.in)" | Act 6 (E2 `marketScraper`) |
| "deployed" | the three services on Vercel/Render + Supabase (E0, cold-start in Act 7) |

Group B enhancements (AI yield, chatbot, offline) sit *around* this spine: the **AI estimate** at Act 2, the **chatbot/negotiator** as advisors any time (E6), and the **offline queue** in Act 7.

---

## E5.11 — The honest one-paragraph summary (say this out loud)

> "AgriChain is a forward-contract marketplace where the platform escrows the buyer's money so neither side has to trust the other. A farmer lists a crop — we OCR the farm's GPS off a watermarked photo and get an XGBoost yield estimate. A buyer offers a contract; when the farmer accepts, we lock 110% of the value in a SERIALIZABLE transaction so two accepts can't race. As the farmer uploads stage photos, we verify each one is within 500 m of the registered farm via EXIF-or-OCR GPS and Haversine — that sets an advisory 'verified' flag, and the *buyer* then releases that milestone's money (idempotent, append-only ledger). At harvest we settle the final slice at the live government mandi price and reconcile the buffer. It's deployed as three services — React on Vercel, Node on Render, a Python ML service on Render — over Supabase Postgres. The honest edges: the yield model is ~30% MAPE so the UI treats it as a hint not a truth; rate-limiting is in-memory; and a few non-money routes still need auth hardening."

---

### That completes the end-to-end series:
- **E0** — Overview & stack (the three services, every tech + why)
- **E1** — Request→response lifecycle (how a request is sent and a response comes back)
- **E2** — Backend, file by file
- **E3** — Frontend, file by file
- **E4** — Database (all 20 tables)
- **E5** — The complete user journey (this part)
- **E6** — AI service & integration points
