# AgriChain — End-to-End Project Reference
## Part E4 — The Database (every table, column, constraint, and relationship)

> This part documents the **single source of truth** for the whole system: the PostgreSQL database. Everything the app "knows" lives here. The schema is defined in **three SQL files** applied in order, and every table below is quoted from them firsthand.
>
> - `backend/schema.sql` — 19 tables + seed data + later `ALTER` columns
> - `backend/market_schema.sql` — extends `market_prices`, adds `market_scrape_log`
> - `backend/escrow_schema.sql` — (re)defines `escrow_milestones`, retrofits money `CHECK` constraints
>
> **Total: 20 tables. No triggers, no stored functions** — all logic lives in the Node controllers (deliberate: see E4.10). All scripts are **idempotent** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so they can be re-run safely on an existing database.

---

## E4.0 — Two conventions you must know before reading any table

1. **Money is `NUMERIC`, never `float`.** Every money column is `NUMERIC(15,2)` (balances) or `NUMERIC(10,2)` (prices). Floating-point can't represent `0.10` exactly and accumulates rounding error — unacceptable for money. `NUMERIC` is exact decimal. This one choice is *why* the escrow ledger can be reconciled to the paisa.
2. **`ON DELETE` is mostly the default `NO ACTION`.** Unless a relationship is explicitly called out as `CASCADE` below, a referenced row **cannot be deleted while children exist** — e.g. you can't delete a `user` who still has `contracts`. Only **six** relationships cascade (both `watchlist` FKs, `chatbot_messages`, `crop_health_tips`, `negotiation_log`, `prediction_log`) — all of them *disposable* child data where auto-cleanup is safe. The money and identity tables deliberately do **not** cascade, so financial history can never be silently deleted.

---

## E4.1 — The shape of the data (how 20 tables relate)

Two tables are **hubs**: `users` and `listings`. A `contract` is the **junction** that ties a listing to a buyer and a farmer, and the **entire money subsystem hangs off the contract**.

```
          users ──────────────────────────────────────┐
            ▲   ▲   ▲                                   │ (farmer_id)
   (farmer_id)  │   │ (buyer_id / reviewer / actor …)   ▼
            │   │   │                               listings ◄──── crop_stages ◄── crop_updates
            │   │   │                                   ▲             (GPS photos)
            │   │   │                                   │ (listing_id)
            │   │   └───────────────┐                   │
            │   │              contracts ───────────────┘
            │   │              ▲  ▲  ▲  ▲
            │   │   (contract_id) │  │  └────────── reviews
            │   │              │  │  └───────────── negotiation_log
            │   │              │  └──────────────── escrow ──► escrow_ledger   (append-only money journal)
            │   │              │                       └──────► escrow_milestones (staged release schedule)
            │   └── idempotency_keys                   
            │
         notifications, watchlist, (profile lives on users)

   standalone-ish: market_prices, market_scrape_log, rag_documents,
                   chatbot_messages, crop_health_tips, prediction_log, prediction_history
```

Read it as the business story: **a person (`users`) lists a crop (`listings`), whose growth is tracked by `crop_stages`; a buyer and farmer agree a `contract`; that contract spawns an `escrow` account, which is released in `escrow_milestones` and journalled in `escrow_ledger`.**

---

## E4.2 — Identity & auth

### `users` — every account (farmer / buyer / admin)
The hub of identity. One row per account; holds login credentials, profile, verification/OTP state, and a cached rating.

| Column | Type | Default | Constraint / note |
|---|---|---|---|
| `id` | SERIAL | — | **PK** |
| `name` | VARCHAR(255) | — | NOT NULL |
| `email` | VARCHAR(255) | — | **UNIQUE**, NOT NULL |
| `password` | VARCHAR(255) | — | NOT NULL — **bcrypt hash**, never plaintext |
| `role` | VARCHAR(50) | — | NOT NULL, **CHECK `role IN ('farmer','buyer','admin')`** |
| `phone_number` | VARCHAR(20) | — | |
| `profile_image` | VARCHAR(500) | — | Supabase URL |
| `state`, `district` | VARCHAR(100) | — | used by analytics + climate join |
| `bio`, `address` | TEXT | — | |
| `avg_rating` | NUMERIC(3,2) | 0 | **denormalised** — recomputed on each new review |
| `total_reviews` | INTEGER | 0 | denormalised counter |
| `is_active` | BOOLEAN | true | admin can soft-disable an account |
| `created_at` | TIMESTAMP | NOW() | |
| `is_verified` | BOOLEAN | false | email-OTP gate — can't log in until true |
| `verification_token`, `verification_expires` | — | — | legacy link-verify fields |
| `password_reset_token`, `password_reset_expires` | — | — | reset flow |
| `otp_code` | VARCHAR(6) | — | 6-digit OTP (signup + login-2FA + reset) |
| `otp_expires` | TIMESTAMP | — | 10-minute window |
| `two_factor_enabled` | BOOLEAN | false | opt-in OTP-on-every-login |

**Why these choices:**
- The `role` **`CHECK`** makes "a user is exactly one of farmer/buyer/admin" a *database* guarantee, not just application hope — the DB will reject a bad role even if a bug tried to write one.
- `avg_rating` / `total_reviews` are **denormalised** (stored, not computed on the fly) so listing cards can show a rating without a `JOIN`+aggregate on every page load; the review controller recomputes them when a review is added. The honest trade-off: denormalised values must be kept in sync by code.
- The later `ALTER`-added columns (`otp_*`, `two_factor_enabled`, reset tokens) show the auth feature growing over time without a destructive migration — idempotent `ADD COLUMN IF NOT EXISTS`.
- A seed admin (`admin@agrichain.com`, placeholder hash, pre-verified) exists so the admin panel works on a fresh database.

---

## E4.3 — The marketplace (listings & crop growth)

### `listings` — a farmer's crop offer
A crop put up for sale, with farm location, agronomic inputs, and the **AI-predicted yield + confidence band**.

Key columns: `id` **PK**; `farmer_id` **FK→users**; `crop_name`; agronomy (`land_size`, `rainfall`, `temperature`, `soil_type`, `irrigation_method`, `season`); a rich **location set** (`location`, `state`, `district`, `taluka`, `village`, `full_address`, `latitude`, `longitude`, **`farm_latitude`**, **`farm_longitude`**, `farm_village`); the ML outputs **`predicted_yield`**, **`confidence_lower`** (default 0), **`confidence_upper`** (default 0), plus `farmer_expected_yield`; farm-verification (`farm_registration_image`, `farm_registration_date`, `farm_verified` default false); `status` default `'active'`; `harvest_date`; `model_version` default `'2.0'`; `created_at`.
**Indexes:** `idx_listings_farmer_id`, `idx_listings_status` — the two columns the marketplace filters/sorts on most.

**Why `farm_latitude`/`farm_longitude` matter:** these are the *registered* farm coordinates. They are the **anchor** the GPS pipeline (E4 `crop_stages` + Part E2's `cropStageController`) measures every stage photo against — "is this photo actually taken at the farm?"

### `crop_stages` — GPS-verified growth milestones
One row per lifecycle stage of a listing (Sowing, Vegetative, Flowering, …), each with a progress photo and its verification result.
`id` **PK**; `listing_id` **FK→listings**; `stage_name`, `stage_order`; `image_url`; **GPS fields** (`latitude`, `longitude`, `image_latitude`, `image_longitude`, `image_timestamp`, **`gps_verified`** default false, **`distance_from_farm`**); `notes`; `updated_yield`, `yield_update_reason`; `created_at`. Index: `idx_stages_listing_id`.

> `gps_verified` + `distance_from_farm` are the **output of the EXIF/OCR/Haversine pipeline** — a stage is `gps_verified = true` only when the photo's location is within **500 m** of the registered farm. **This flag is the buyer's *evidence* to release the next escrow milestone — but the release is a separate, buyer-initiated action, not automatic** (confirmed in E2: `cropStageController.createStage` only *writes* the flag; the buyer then calls the escrow release endpoint). So `gps_verified` is the hinge between "proof of work" and "release of money," with the buyer kept in the loop.

### `crop_updates` — extra photos on a stage
`id` **PK**; `stage_id` **FK→crop_stages**; `image_url`, `image_latitude`, `image_longitude`, `gps_verified`, `distance_from_farm`, `notes`, `created_at`. Same GPS verification, attached to a stage rather than defining one.

### `prediction_history` — yield re-estimates over time
`id` **PK**; `listing_id` **FK→listings**; `stage_id` **FK→crop_stages**; `predicted_yield`; `created_at`. A time-series so the yield estimate can be refined as the crop progresses.

---

## E4.4 — Deal-making

### `contracts` — the central business object
A buyer's purchase offer against a listing; links buyer + farmer + listing, and anchors escrow, reviews, negotiation, and disputes.

| Column | Type | Default | Note |
|---|---|---|---|
| `id` | SERIAL | — | **PK** |
| `listing_id` | INTEGER | — | **FK→listings** |
| `buyer_id` | INTEGER | — | **FK→users** |
| `farmer_id` | INTEGER | — | **FK→users** (denormalised from the listing for convenience) |
| `quantity` | NUMERIC | — | tonnes |
| `offered_price` | NUMERIC | — | ₹/quintal |
| `message`, `farmer_response_message` | TEXT | — | negotiation notes |
| `expected_delivery_date` | DATE | — | |
| `status` | VARCHAR(50) | `'pending'` | lifecycle: pending → accepted → … → settled |
| `advance_paid` | NUMERIC | 0 | money |
| `final_amount` | NUMERIC | 0 | money |
| `market_price_at_settlement` | NUMERIC | — | the mandi price used at settlement |
| `harvest_actual_yield` | NUMERIC | — | |
| **`idempotency_key`** | VARCHAR(255) | — | guards against double-accept/double-charge |
| `buffer_pct` | NUMERIC(5,2) | **10** | buyer-chosen **markup %** (≠ the escrow one — see E4.5) |
| `dispute_status` | VARCHAR(20) | `'none'` | **CHECK `IN ('none','open','resolved','rejected')`** |
| `dispute_reason`, `dispute_resolution` | TEXT | — | |
| `dispute_raised_by` | INTEGER | — | **FK→users** |
| `dispute_raised_at`, `dispute_resolved_at` | TIMESTAMP | — | |
| `created_at`, `updated_at` | TIMESTAMP | NOW() | |

**Indexes:** `idx_contracts_farmer_id`, `idx_contracts_buyer_id`, `idx_contracts_status` — dashboards filter contracts by party and status constantly.

**Why `farmer_id` is stored here even though it's derivable via `listing_id → listings.farmer_id`:** a tiny denormalisation so "my contracts" queries for a farmer are a single indexed lookup, not a join. **Why a per-contract `idempotency_key`:** accepting a contract triggers a money lock; if the request is retried (flaky mobile network, double-tap), the key ensures the lock happens **once**.

---

## E4.5 — The money subsystem (the heart)

Four tables cooperate to make money movement **safe, auditable, and un-double-spendable**.

### `escrow` — one account per contract
Holds the locked buffer and tracks what's been released vs refunded. All amounts `NUMERIC(15,2)`.

Key columns: `id` **PK**; `contract_id` **FK→contracts**; `buyer_id`, `farmer_id` **FK→users**; `advance_amount`, `pending_amount`, `final_amount`, `buffer_amount`; **`buffer_pct` default 110**; **`total_locked`**; **`released_to_farmer`**; **`refunded_to_buyer`**; `status` default `'pending'`; `advance_released` bool; timestamps (`advance_released_at`, `locked_at`, `settled_at`); `market_price_used` NUMERIC(10,2); `created_at`, `updated_at`. Index: `idx_escrow_contract_id`.

> **⚠️ The `buffer_pct` dual-convention gotcha (do not conflate):**
> - `contracts.buffer_pct` defaults to **10** → it's a **markup**: "lock 10% extra on top".
> - `escrow.buffer_pct` defaults to **110** → it's a **percent of contract value**: "lock 110% of the deal".
> They describe the *same* 10% buffer from two layers. A reader who thinks they're the same number will be confused — they're intentionally different framings.

**The money invariant lives on this table:** `total_locked == released_to_farmer + refunded_to_buyer + (still-locked remainder)`. Nothing appears or vanishes; money only moves between those buckets.

### `escrow_ledger` — append-only money journal
The immutable proof of every movement. `id` **PK**; `escrow_id` **FK→escrow**; `contract_id` **FK→contracts**; `entry_type` **NOT NULL**; **`amount` NUMERIC(15,2) NOT NULL**; **`running_balance` NUMERIC(15,2) NOT NULL**; `actor_id` **FK→users**; `actor_role`; `reference_note`; `payment_ref` (mock txn id); `created_at`. Index: `idx_ledger_contract_id`.

> **Why append-only + `running_balance`:** this is double-entry-style accounting. You never *edit* a balance; you *append* a movement that carries the new running balance. That means the entire financial history can be **replayed and reconciled** against `escrow.total_locked` — if they ever disagree, you have a bug and a full audit trail to find it. The `NOT NULL` on both `amount` and `running_balance` is the integrity guarantee that makes reconciliation possible.

### `escrow_milestones` — the staged release schedule
Partitions the locked total into tranches, each released as its stage is GPS-proven **and the buyer approves that tranche** (release is buyer-initiated, not automatic — see E2). (Defined identically in `schema.sql` **and** `escrow_schema.sql` — idempotent; the second file also retrofits the `CHECK`s onto older databases via a `DO $$` guard block.)

Key columns: `id` **PK**; `escrow_id`, `contract_id` **FKs**; `milestone_order` NOT NULL; `kind` default `'progress'` **CHECK `IN ('advance','progress')`**; `stage_name` (NULL for the advance, else matches a `crop_stages.stage_name`); `label`; **`release_pct` NUMERIC(5,2) CHECK `0 ≤ release_pct ≤ 100`**; **`amount` NUMERIC(15,2) CHECK `amount ≥ 0`**; `status` default `'locked'` **CHECK `IN ('locked','released')`**; `payment_ref`; `released_at`; `released_by` **FK→users**; `created_at`.
**UNIQUE `(contract_id, milestone_order)`.** Indexes: `idx_milestones_escrow`, `idx_milestones_contract`.

> **Why the `CHECK`s and the `UNIQUE`:** these push money rules *into the database*. `release_pct` can't exceed 100, `amount` can't go negative, `status` can only be the two legal values, and **a milestone order can't be duplicated for a contract** — so you can't accidentally create two "milestone #3"s and release twice. The sum of all tranche `amount`s ties back to `total_locked`.

### `idempotency_keys` — the double-spend guard
`id` **PK**; **`key` VARCHAR(255) UNIQUE NOT NULL**; `user_id` **FK→users**; `operation`; **`result` JSONB** (the cached response); `created_at`.

> **Why:** money endpoints carry an `X-Idempotency-Key`. On first call, the operation runs and its response is cached in `result`. If the **same key** arrives again (retry), the **UNIQUE** constraint catches it and the cached JSON is replayed instead of running the money move a second time. This is the standard fintech pattern for "exactly once" over an unreliable network.

---

## E4.6 — Market data (drives settlement)

### `market_prices` — crop reference / mandi prices
`id` **PK**; `crop_name`; `price_per_quintal`; `state`; `market_name`; `recorded_date` default `CURRENT_DATE`; `created_at`. Extended by `market_schema.sql` with `source` (default `'admin'` — later holds `data_gov` / `data_gov_cached` / `simulated` / `default`), `updated_at`, `district`, `min_price`, `max_price` (both NUMERIC(10,2)).
**UNIQUE `(crop_name, state, district, market_name, recorded_date)`** — so one authoritative price per crop/place/day; re-running the daily scrape `UPSERT`s rather than duplicating. Seeded with 15 national-average crops so settlement works before any live fetch.

### `market_scrape_log` — audit of each price refresh
`id` **PK**; `crops_updated` default 0; `fallback_used` default 0; `scraped_at` default NOW(). Lets you see whether the 06:00 IST cron got live data or fell back to simulated.

---

## E4.7 — Engagement & operations

- **`notifications`** — `id` **PK**; `user_id` **FK→users**; `title`, `message`, `type`; **`reference_id` (plain INTEGER, no FK)** + `reference_type` — a **polymorphic** pointer (can reference a contract, a listing, a review…); `is_read` default false; `created_at`. Indexes on `user_id` and `is_read`. *Why no FK on `reference_id`:* it points at different tables depending on `reference_type`, and SQL can't express a FK to "one of several tables" — so integrity is managed in code. Honest trade-off noted.
- **`watchlist`** — `id` **PK**; `buyer_id` **FK→users `ON DELETE CASCADE`**; `listing_id` **FK→listings `ON DELETE CASCADE`**; `created_at`; **UNIQUE `(buyer_id, listing_id)`** (can't save the same listing twice; delete a listing/user and its saves vanish — safe to cascade).
- **`reviews`** — `id` **PK**; `contract_id` **FK→contracts**; `reviewer_id`, `reviewee_id` **FK→users**; **`rating` INTEGER CHECK `BETWEEN 1 AND 5`**; `comment`; `created_at`; **UNIQUE `(contract_id, reviewer_id)`** (one review per party per contract). Feeds the denormalised `users.avg_rating`.

---

## E4.8 — AI / add-on tables *(touchpoints — see E6 / Course B1–B2)*

These exist for the optional smart features; the core marketplace doesn't depend on them.
- **`chatbot_messages`** — per-user chat history; `role` **CHECK `IN ('user','assistant')`**, `content` NOT NULL; **`ON DELETE CASCADE`** with the user.
- **`rag_documents`** — the chatbot's knowledge base (`title`, `content`, `category`). No FKs. (This is the curated-doc corpus the keyword-RAG retrieves from — see Course B2.)
- **`crop_health_tips`** — stage-specific agronomic tips per listing; **`ON DELETE CASCADE`** with the listing.
- **`negotiation_log`** — AI price-negotiation messages per contract (`suggested_price`, `reasoning`); **`ON DELETE CASCADE`** with the contract.
- **`prediction_log`** — the **model-monitoring** log: predicted vs actual yield + full input context + `error_pct`, `model_version`; **`ON DELETE CASCADE`** with the listing. This is what the drift-detection analytics read.

---

## E4.9 — The complete foreign-key map

```
listings.farmer_id            → users.id
crop_stages.listing_id        → listings.id
crop_updates.stage_id         → crop_stages.id
prediction_history.listing_id → listings.id
prediction_history.stage_id   → crop_stages.id
contracts.listing_id          → listings.id
contracts.buyer_id            → users.id
contracts.farmer_id           → users.id
contracts.dispute_raised_by   → users.id
escrow.contract_id            → contracts.id
escrow.buyer_id               → users.id
escrow.farmer_id              → users.id
escrow_ledger.escrow_id       → escrow.id
escrow_ledger.contract_id     → contracts.id
escrow_ledger.actor_id        → users.id
escrow_milestones.escrow_id   → escrow.id
escrow_milestones.contract_id → contracts.id
escrow_milestones.released_by → users.id
idempotency_keys.user_id      → users.id
notifications.user_id         → users.id
watchlist.buyer_id            → users.id         [CASCADE]
watchlist.listing_id          → listings.id      [CASCADE]
reviews.contract_id           → contracts.id
reviews.reviewer_id           → users.id
reviews.reviewee_id           → users.id
chatbot_messages.user_id      → users.id         [CASCADE]
crop_health_tips.listing_id   → listings.id      [CASCADE]
negotiation_log.contract_id   → contracts.id     [CASCADE]
prediction_log.listing_id     → listings.id      [CASCADE]
```
No outgoing FKs: `users`, `market_prices`, `market_scrape_log`, `rag_documents`. Polymorphic (no FK): `notifications.reference_id`.

---

## E4.10 — Design decisions & why (the "y only that" for the DB)

1. **Relational (Postgres), not NoSQL** — because money needs ACID transactions, foreign keys, and `CHECK`s. (Full argument in E0.4.)
2. **`NUMERIC` for all money** — exact decimal; floats would drift.
3. **All business logic in code, zero triggers/stored procedures** — a deliberate choice. Triggers hide behaviour *inside* the database where it's invisible to the app developer and hard to test. Keeping every rule in the Node controllers means the logic is in one language, version-controlled, unit-testable, and greppable. The only PL/pgSQL is a one-off idempotent `DO` block that adds `CHECK` constraints — structural, not behavioural.
4. **Append-only `escrow_ledger` with `running_balance`** — auditable, reconcilable money history; you can prove where every rupee went.
5. **`idempotency_keys` (UNIQUE key + cached JSONB result)** — "exactly once" money operations over an unreliable mobile network.
6. **`CHECK` constraints on money/role/status** — the database refuses illegal states even if application code has a bug (defence in depth). `release_pct 0–100`, `amount ≥ 0`, `rating 1–5`, `role`/`dispute_status`/`milestone.status`/`kind` enumerations.
7. **`UNIQUE` constraints encode business rules** — one price per crop/place/day, one review per party per contract, one save per buyer/listing, one milestone per order-per-contract (no double-release).
8. **Targeted indexes** on the exact foreign keys and status columns the dashboards filter on (`farmer_id`, `buyer_id`, `status`, `listing_id`, `is_read`) — fast reads where it counts, without over-indexing.
9. **Selective `CASCADE`** — only on disposable child data (watchlist, chat, tips, negotiation, prediction logs). Money and identity never auto-delete.
10. **Idempotent migrations** (`IF NOT EXISTS`) — the schema grew feature-by-feature (OTP, 2FA, disputes, market columns, milestones) without destructive rewrites; scripts are safe to re-run on the live Supabase DB.

### ⚠️ Honest notes / small discrepancies (good to know, harmless)
- **`escrow_milestones` is defined twice** (schema.sql + escrow_schema.sql) — identical and idempotent, so re-running is safe; the second copy exists to retrofit the `CHECK`s onto databases created before they were added.
- **`buffer_pct` means two different things** on `contracts` (10 = markup) vs `escrow` (110 = percent-of-total). Intentional, but a classic "wait, which one?" moment.
- **Denormalised `users.avg_rating`/`total_reviews`** must be kept in sync by the review controller — a stored aggregate is a cache, and caches can drift if a write path forgets to update them.

---

### Next: **E6** will show the Python AI service that fills `listings.predicted_yield`/`confidence_*`, and **E1/E2/E3/E5** will show the code paths that write and read every table above. The money tables here are brought to life by `escrowController.js` in **E2**, and the whole lifecycle is stitched together in **E5**.
