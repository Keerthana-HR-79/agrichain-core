# AgriChain — Master Guide, Part 5: End-to-End Request/Response Flows

> **What's in it:** the important user journeys traced **hop by hop** — the exact HTTP request (method, path, headers, body), which middleware runs, what the controller does step by step, which tables change, the response, and what the frontend does next. This is the "walk me through it end to end" material.
>
> Convention used below:
> `➊ CLIENT →` the request · `⚙️ SERVER` the work · `🗄️ DB` tables touched · `← RESPONSE` what comes back · `🖥️ UI` what the frontend does.
>
> Legend: **✅ ON RÉSUMÉ** · **ℹ️ OFF RÉSUMÉ** · **🎒 BACK POCKET**

---

## Flow 0: what every authenticated request has in common

For all flows *after* login, the request carries the JWT and passes two gates before the controller runs:

```
➊ CLIENT →  <METHOD> /api/...            Header: Authorization: Bearer <JWT>
⚙️ SERVER  CORS → express.json → rate limiter (60/60s/IP)
           → authMiddleware:  jwt.verify(token, JWT_SECRET) → req.user = { id, role }   (else 401)
           → roleMiddleware:  req.user.role allowed?                                    (else 403)
           → controller runs
```

Keep this in mind — the flows below start *after* these gates unless auth itself is the topic.

---

## Flow 1: Signup + email-OTP verification ✅

### Step 1a — create the account
```
➊ CLIENT →  POST /api/auth/signup
            Body: { name, email, password, role: "farmer" | "buyer", ... }

⚙️ SERVER  authController.signup:
           • validate role ∈ {farmer, buyer}          ← admin is rejected here
           • bcrypt.hash(password, 10)                ← never store plaintext
           • otp = makeOTP()   (6 digits)             ← 100000–999999
           • otp_expires = now + 10 min
           • sendOTPEmail(email, otp)                 ← via emailService (SendGrid/SMTP)

🗄️ DB      INSERT users (…, password=<hash>, is_verified=false, otp_code, otp_expires)

← RESPONSE 201 { message: "OTP sent to your email" }   (NO token yet — unverified)

🖥️ UI      Redirect to the "enter OTP" screen.
```

### Step 1b — verify the OTP
```
➊ CLIENT →  POST /api/auth/verify-otp
            Body: { email, otp }

⚙️ SERVER  authController.verifySignupOTP:
           • find user; check otp_code matches AND otp_expires > now   (else 400)
           • set is_verified = true; clear otp_code/otp_expires
           • token = jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })

🗄️ DB      UPDATE users SET is_verified=true, otp_code=NULL

← RESPONSE 200 { token, user: { id, name, role } }

🖥️ UI      Store token (localStorage); now logged in → role-based dashboard.
```

> **Interview line:** *"Signup returns no token — the account is unverified. Only after they submit the correct, unexpired OTP do I flip `is_verified` and issue the 7-day JWT."*

---

## Flow 2: Login (password-only, or 2FA) ✅

```
➊ CLIENT →  POST /api/auth/login   Body: { email, password }

⚙️ SERVER  authController.login:
           • find user by email
           • bcrypt.compare(password, user.password)     (else 401 "invalid credentials")
           • if !is_verified → 403 "verify your email first"
           • if two_factor_enabled → makeOTP + email it → RESPONSE 200 { twoFactorRequired: true }
           • else token = jwt.sign({ id, role }, JWT_SECRET, 7d)

← RESPONSE 200 { token, user }                 (or { twoFactorRequired: true })

🖥️ UI      If token → dashboard. If twoFactorRequired → OTP screen →
           POST /api/auth/verify-login-otp → { token, user }.
```

**Honest note (cold start):** the very first login after the Render free-tier service has been idle can be slow or briefly fail while the service wakes — a deployment trait, not an auth bug. (See Part 6.)

---

## Flow 3: Create a listing (+ ML prediction) ✅ / ℹ️

```
➊ CLIENT →  POST /api/listings            (farmer only)
            Header: Authorization: Bearer <JWT>
            Body (multipart): crop_name, land_size, soil_type, irrigation, season,
                              state/district/…, cropImage (file), farmRegImage (file)

⚙️ SERVER  authMiddleware → roleMiddleware("farmer") → listingController.create:
           1. multer parses the files into buffers
           2. upload cropImage → Supabase bucket "listings" → getPublicUrl
           3. upload farmRegImage → "listings" → getPublicUrl
           4. OCR the farm-registration image → parse farm GPS (farm_latitude/longitude)
           5. call the Python ML service (aiService, HTTP) with the farm inputs
              → { predicted_yield, confidence_lower, confidence_upper }
              ↳ wrapped in try/catch: if ML is down, save with a 0/blank prediction  ← graceful degradation

🗄️ DB      INSERT listings (…, image_url, farm_registration_image,
                             farm_latitude, farm_longitude,
                             predicted_yield, confidence_lower, confidence_upper, status='active')

← RESPONSE 201 { listing }   (with the prediction if the ML call succeeded)

🖥️ UI      Listing appears on the marketplace with its predicted yield.
```

> **Interview line:** *"Creating a listing does three external things — uploads the images to Supabase, OCRs the registration doc for the farm's GPS, and calls the Python model for a yield estimate. The model call is wrapped so a failure there never blocks the listing."*

---

## Flow 4: Buyer sends a contract offer ✅

```
➊ CLIENT →  POST /api/contracts           (buyer only)
            Body: { listing_id, quantity, offered_price, buffer_pct, message, expected_delivery_date }

⚙️ SERVER  authMiddleware → roleMiddleware("buyer") → contractController.create:
           • validate the listing exists / is active
           • create a pending contract; record buyer's chosen buffer_pct

🗄️ DB      INSERT contracts (…, status='pending', buffer_pct)
           INSERT notifications (for the farmer: "New contract offer")

← RESPONSE 201 { contract }

🖥️ UI      Buyer sees "offer sent"; farmer sees a notification + the pending offer.
```

---

## Flow 5: Farmer ACCEPTS → escrow is created 🎒 (the centerpiece)

This is the most important flow in the system. **One SERIALIZABLE transaction** does everything.

```
➊ CLIENT →  PUT /api/contracts/:id/accept    (farmer only)
            Header: Authorization: Bearer <JWT>
            Header: X-Idempotency-Key: <unique-string>     ← replay protection

⚙️ SERVER  authMiddleware → roleMiddleware("farmer") → contractController.accept
           → withTransaction(async client => {                       // BEGIN; SERIALIZABLE
               1. check idempotency_keys for this key → if present, replay stored result (no double-run)
               2. pg_advisory_xact_lock(contract_id)                 // no concurrent op on this contract
               3. SELECT * FROM contracts WHERE id=:id FOR UPDATE     // row-lock + re-read
               4. verify status is still 'pending'                   // else 409/400
               5. UPDATE contracts SET status='accepted'
               6. createEscrowOnAccept(client, { contract_id, farmer_id }):
                    • buffer_frac = clamp(0.05, 0.25, buffer_pct/100)     // default 0.10
                    • contract_value = quantity × offered_price × 10
                    • total_locked   = contract_value × (1 + buffer_frac) // e.g. 110%
                    • INSERT escrow (total_locked, buffer_amount, advance_amount=15%, status='locked')
                    • INSERT escrow_ledger (entry_type='buffer_locked', amount, running_balance)
                    • INSERT 5 × escrow_milestones  ON CONFLICT (contract_id, milestone_order) DO NOTHING
               7. store result in idempotency_keys
             })                                                       // COMMIT (all) or ROLLBACK (none)

🗄️ DB      contracts (→accepted), escrow (new), escrow_ledger (1 row), escrow_milestones (5 rows),
           idempotency_keys (1 row), notifications (buyer: "contract accepted")

← RESPONSE 200 { contract, escrow, milestones }

🖥️ UI      Both dashboards update; buyer now sees the escrow with 5 milestones, funds locked.
```

> **Interview line (say slowly):** *"Accept is one SERIALIZABLE transaction. I take an advisory lock on the contract ID so two requests can't process the same contract even across processes, SELECT FOR UPDATE to re-check it's still pending, flip it to accepted, and in the same transaction create the escrow, lock the funds, write the first ledger row, and seed five milestones. It all commits together — there's no state where the contract is accepted but the escrow doesn't exist. And an idempotency key means a double-submit just replays the first result."*

---

## Flow 6: Farmer uploads a stage photo → GPS verification ✅

```
➊ CLIENT →  POST /api/stages              (farmer only)
            Body (multipart): listing_id, stage_name, photo (file),
                              [latitude, longitude]   ← device coords, used only as last resort

⚙️ SERVER  authMiddleware → roleMiddleware("farmer") → cropStageController.createStage:
           1. multer → req.file.buffer
           2. TIER 1 EXIF:  extractGPS(buffer) → coords?  gps_source="exif"
           3. TIER 2 OCR:   else extractText(buffer)+parseGPSData → coords?  gps_source="ocr"
           4. TIER 3 CLIENT: else use body latitude/longitude  gps_source="client"
           5. upload photo → Supabase bucket "stages" → getPublicUrl
           6. load the farm's coords from the listing
           7. distance_from_farm = calculateDistance(farm, photo)      // Haversine, metres
           8. gps_verified = distance_from_farm <= 500
           9. duplicate-stage check via stageOrderMap

🗄️ DB      INSERT crop_stages (…, image_url, image_latitude/longitude,
                                distance_from_farm, gps_verified, gps_source)
           INSERT prediction_history (snapshot)
           INSERT notifications (buyers with an active contract: "new verified stage")

← RESPONSE 201 { stage: { …, gps_verified, distance_from_farm } }

🖥️ UI      Stage timeline updates; StageMap plots the farm + photo GPS as markers on Leaflet;
           a verified badge shows if gps_verified.
```

> **Interview line:** *"I try three ways to get the photo's location — EXIF, then OCR of a stamped watermark, then the device — then Haversine-distance it against the registered farm and verify within 500 metres. Buyers on that listing get notified, and the point is plotted on a map."*

---

## Flow 7: Buyer releases a milestone ✅🎒

```
➊ CLIENT →  POST /api/escrow/:contractId/release-milestone    (buyer only)
            Header: X-Idempotency-Key: <unique-string>
            Body: { milestone_order }

⚙️ SERVER  authMiddleware → roleMiddleware("buyer") → escrowController.releaseMilestone
           → withTransaction:                                        // SERIALIZABLE
               • idempotency check → replay if seen
               • pg_advisory_xact_lock(contract_id)
               • SELECT escrow / milestone FOR UPDATE
               • guard: dispute open?      → 423 (funds frozen)
               • guard: earlier milestones released?  (order enforced)  → else 400
               • STAGE GATE: is crop_stages.gps_verified = true for this milestone's stage_name?  → else 400
               • mockPayment() → payment_ref "MOCK-…"
               • UPDATE milestone status='released'; escrow.released_to_farmer += amount
               • INSERT escrow_ledger (entry_type='milestone_released', running_balance)

🗄️ DB      escrow_milestones (→released), escrow (running totals), escrow_ledger (1 row),
           notifications (farmer: "milestone released"), idempotency_keys

← RESPONSE 200 { milestone, escrow }

🖥️ UI      Milestone flips to released; progress bar advances; farmer notified.
```

> **The connection to nail:** *"A milestone can't be released unless its crop stage is GPS-verified — proof-of-progress literally gates the money. And a double-click can't double-pay, because the second request carries the same idempotency key and just replays."*

---

## Flow 8: Settlement at harvest ✅

```
➊ CLIENT →  POST /api/escrow/:contractId/settle      (buyer only)
            Body: { market_price_per_quintal }        ← frontend fetched the live mandi price

⚙️ SERVER  escrowController.settleEscrow → withTransaction:
             • advisory lock + SELECT FOR UPDATE
             • desired_price = MAX(offered_price, market_price)          // farmer captures upside
             • gross_payment = MIN(desired_price × quantity, total_locked) // capped at what's locked
             • buffer_capped = (gross_payment hit the cap?)
             • balance_due     = gross_payment − released_to_farmer
             • refund_to_buyer = total_locked − gross_payment
             • ledger: 'balance_released', 'market_adjustment', 'refund'
             • escrow.status='settled'; contract.status='completed'

🗄️ DB      escrow (settled totals), escrow_ledger (up to 3 rows),
           contracts (→completed), notifications (farmer payout + buyer refund)

← RESPONSE 200 { escrow: { released_to_farmer, refunded_to_buyer, market_price_used, buffer_capped } }

🖥️ UI      Contract shows completed; final payout + refund displayed; both parties notified.
```

> **Interview line:** *"Settlement pays the higher of the contracted or live market price, so the farmer isn't stuck on a stale rate — but capped at the total locked, so the escrow can never pay out more than the buyer put in. Any leftover buffer refunds to the buyer, and all three movements are ledgered."*
>
> **Honest caveat to keep ready:** *"The market price on settle is currently passed from the client; I fetch it server-side elsewhere, and in production I'd fetch it inside the settle transaction so it can't be tampered with."*

---

## The money-conservation invariant (ties Flows 5–8 together) 🎒

Across the whole lifecycle, this must always hold:

```
total_locked  ==  released_to_farmer  +  refunded_to_buyer          (once settled)
buffer_locked (ledger)  ==  Σ (all release + refund + adjustment entries)
```

Your **53-assertion test suite** (`tests/escrow_math.test.js`, `BUFFER_FACTOR = 1.10`) checks exactly this across 7 scenarios × 6 invariants + 11 boundary cases. That's the proof behind *"money can never be created or destroyed in my escrow."*

---

## One-screen summary of all flows

```
signup ──OTP──► verified+JWT
login ──(2FA?)──► JWT
listing ──ML+OCR+upload──► listing w/ prediction
offer ──► pending contract ──accept(TXN)──► escrow locked (110%) + 5 milestones
stage photo ──EXIF/OCR/client──► Haversine ≤500m ──► gps_verified ──► map
release milestone ──(stage-gated, idempotent, ledgered)──► funds move
settle ──MAX(offered, market), capped──► payout + refund ──► completed
```

---

### End of Part 5

**Next:** Part 6 — the deep dives (escrow concurrency, the GPS chain, the market 4-tier fallback, auth security) and the **problems you actually faced and how you solved them** (the war stories interviewers love).
