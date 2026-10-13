-- ============================================================
-- AgriChain — Complete Database Schema
-- Run this ONCE on a fresh database:
--   psql -U postgres -d agrichain-ai -f schema.sql
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password       VARCHAR(255) NOT NULL,
  role           VARCHAR(50)  NOT NULL CHECK (role IN ('farmer','buyer','admin')),
  phone_number   VARCHAR(20),
  profile_image  VARCHAR(500),
  state          VARCHAR(100),
  district       VARCHAR(100),
  bio            TEXT,
  address        TEXT,
  avg_rating     NUMERIC(3,2) DEFAULT 0,
  total_reviews  INTEGER      DEFAULT 0,
  is_active      BOOLEAN      DEFAULT true,
  created_at     TIMESTAMP    DEFAULT NOW()
);

-- LISTINGS
CREATE TABLE IF NOT EXISTS listings (
  id                       SERIAL PRIMARY KEY,
  farmer_id                INTEGER REFERENCES users(id),
  crop_name                VARCHAR(255),
  land_size                NUMERIC,
  rainfall                 NUMERIC,
  temperature              NUMERIC,
  soil_type                VARCHAR(100),
  irrigation_method        VARCHAR(100),
  season                   VARCHAR(100),
  location                 TEXT,
  state                    VARCHAR(100),
  district                 VARCHAR(100),
  taluka                   VARCHAR(100),
  village                  VARCHAR(100),
  full_address             TEXT,
  phone_number             VARCHAR(20),
  latitude                 NUMERIC,
  longitude                NUMERIC,
  predicted_yield          NUMERIC,
  confidence_lower         NUMERIC DEFAULT 0,
  confidence_upper         NUMERIC DEFAULT 0,
  farmer_expected_yield    NUMERIC,
  image_url                TEXT,
  farm_latitude            NUMERIC,
  farm_longitude           NUMERIC,
  farm_village             VARCHAR(255),
  farm_registration_image  TEXT,
  farm_registration_date   TIMESTAMP,
  farm_verified            BOOLEAN DEFAULT false,
  status                   VARCHAR(50) DEFAULT 'active',
  harvest_date             DATE,
  model_version            VARCHAR(50) DEFAULT '2.0',
  created_at               TIMESTAMP DEFAULT NOW()
);

-- CROP STAGES
CREATE TABLE IF NOT EXISTS crop_stages (
  id                  SERIAL PRIMARY KEY,
  listing_id          INTEGER REFERENCES listings(id),
  stage_name          VARCHAR(100),
  stage_order         INTEGER,
  image_url           TEXT,
  latitude            NUMERIC,
  longitude           NUMERIC,
  image_latitude      NUMERIC,
  image_longitude     NUMERIC,
  image_timestamp     TIMESTAMP,
  gps_verified        BOOLEAN DEFAULT false,
  distance_from_farm  NUMERIC,
  notes               TEXT,
  updated_yield       NUMERIC,
  yield_update_reason TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- CROP UPDATES
CREATE TABLE IF NOT EXISTS crop_updates (
  id                  SERIAL PRIMARY KEY,
  stage_id            INTEGER REFERENCES crop_stages(id),
  image_url           TEXT,
  image_latitude      NUMERIC,
  image_longitude     NUMERIC,
  gps_verified        BOOLEAN DEFAULT false,
  distance_from_farm  NUMERIC,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- CONTRACTS
CREATE TABLE IF NOT EXISTS contracts (
  id                        SERIAL PRIMARY KEY,
  listing_id                INTEGER REFERENCES listings(id),
  buyer_id                  INTEGER REFERENCES users(id),
  farmer_id                 INTEGER REFERENCES users(id),
  quantity                  NUMERIC,
  offered_price             NUMERIC,
  message                   TEXT,
  expected_delivery_date    DATE,
  status                    VARCHAR(50) DEFAULT 'pending',
  advance_paid              NUMERIC DEFAULT 0,
  final_amount              NUMERIC DEFAULT 0,
  market_price_at_settlement NUMERIC,
  farmer_response_message   TEXT,
  harvest_actual_yield      NUMERIC,
  idempotency_key           VARCHAR(255),
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);

-- ESCROW
CREATE TABLE IF NOT EXISTS escrow (
  id                   SERIAL PRIMARY KEY,
  contract_id          INTEGER REFERENCES contracts(id),
  buyer_id             INTEGER REFERENCES users(id),
  farmer_id            INTEGER REFERENCES users(id),
  advance_amount       NUMERIC(15,2) DEFAULT 0,
  pending_amount       NUMERIC(15,2) DEFAULT 0,
  final_amount         NUMERIC(15,2) DEFAULT 0,
  buffer_amount        NUMERIC(15,2) DEFAULT 0,
  buffer_pct           NUMERIC(5,2)  DEFAULT 110,
  total_locked         NUMERIC(15,2) DEFAULT 0,
  released_to_farmer   NUMERIC(15,2) DEFAULT 0,
  refunded_to_buyer    NUMERIC(15,2) DEFAULT 0,
  status               VARCHAR(50)   DEFAULT 'pending',
  advance_released     BOOLEAN       DEFAULT false,
  settlement_funded    BOOLEAN       DEFAULT false,
  advance_released_at  TIMESTAMP,
  locked_at            TIMESTAMP,
  settled_at           TIMESTAMP,
  market_price_used    NUMERIC(10,2),
  created_at           TIMESTAMP     DEFAULT NOW(),
  updated_at           TIMESTAMP     DEFAULT NOW()
);

-- ESCROW LEDGER (append-only audit log)
CREATE TABLE IF NOT EXISTS escrow_ledger (
  id              SERIAL PRIMARY KEY,
  escrow_id       INTEGER REFERENCES escrow(id),
  contract_id     INTEGER REFERENCES contracts(id),
  entry_type      VARCHAR(50) NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  running_balance NUMERIC(15,2) NOT NULL,
  actor_id        INTEGER REFERENCES users(id),
  actor_role      VARCHAR(20),
  reference_note  TEXT,
  payment_ref     VARCHAR(80),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ESCROW MILESTONES (stage-based release schedule — see escrow_schema.sql)
CREATE TABLE IF NOT EXISTS escrow_milestones (
  id              SERIAL PRIMARY KEY,
  escrow_id       INTEGER REFERENCES escrow(id),
  contract_id     INTEGER REFERENCES contracts(id),
  milestone_order INTEGER      NOT NULL,
  kind            VARCHAR(20)  NOT NULL DEFAULT 'progress'
                    CHECK (kind IN ('advance','progress')), -- 'advance' | 'progress'
  stage_name      VARCHAR(100),                             -- NULL for advance; else matches crop_stages.stage_name
  label           VARCHAR(120),
  release_pct     NUMERIC(5,2) NOT NULL CHECK (release_pct >= 0 AND release_pct <= 100),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  status          VARCHAR(20)  NOT NULL DEFAULT 'locked'
                    CHECK (status IN ('locked','released')), -- 'locked' | 'released'
  payment_ref     VARCHAR(80),
  released_at     TIMESTAMP,
  released_by     INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (contract_id, milestone_order)
);

-- IDEMPOTENCY KEYS
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id         SERIAL PRIMARY KEY,
  key        VARCHAR(255) UNIQUE NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  operation  VARCHAR(100),
  result     JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),
  title           VARCHAR(255),
  message         TEXT,
  type            VARCHAR(50),
  reference_id    INTEGER,
  reference_type  VARCHAR(50),
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- MARKET PRICES
CREATE TABLE IF NOT EXISTS market_prices (
  id                SERIAL PRIMARY KEY,
  crop_name         VARCHAR(255),
  price_per_quintal NUMERIC,
  state             VARCHAR(100),
  market_name       VARCHAR(255),
  recorded_date     DATE DEFAULT CURRENT_DATE,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- WATCHLIST
CREATE TABLE IF NOT EXISTS watchlist (
  id         SERIAL PRIMARY KEY,
  buyer_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(buyer_id, listing_id)
);

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  contract_id  INTEGER REFERENCES contracts(id),
  reviewer_id  INTEGER REFERENCES users(id),
  reviewee_id  INTEGER REFERENCES users(id),
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(contract_id, reviewer_id)
);

-- ── Indexes for performance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listings_farmer_id   ON listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_listings_status       ON listings(status);
CREATE INDEX IF NOT EXISTS idx_contracts_farmer_id   ON contracts(farmer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_buyer_id    ON contracts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status      ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_escrow_contract_id    ON escrow(contract_id);
CREATE INDEX IF NOT EXISTS idx_ledger_contract_id    ON escrow_ledger(contract_id);
CREATE INDEX IF NOT EXISTS idx_milestones_escrow     ON escrow_milestones(escrow_id);
CREATE INDEX IF NOT EXISTS idx_milestones_contract   ON escrow_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_stages_listing_id     ON crop_stages(listing_id);

-- ── Seed data ─────────────────────────────────────────────────────────────────

-- Market prices (national reference — refreshed daily from data.gov.in)
INSERT INTO market_prices (crop_name, price_per_quintal, state, market_name) VALUES
  ('Wheat',      2200, 'India', 'National Mandi Avg'),
  ('Rice',       2100, 'India', 'National Mandi Avg'),
  ('Maize',      1800, 'India', 'National Mandi Avg'),
  ('Groundnut',  5500, 'India', 'National Mandi Avg'),
  ('Soyabean',   4200, 'India', 'National Mandi Avg'),
  ('Cotton',     6500, 'India', 'National Mandi Avg'),
  ('Sugarcane',  3200, 'India', 'National Mandi Avg'),
  ('Tomato',     1200, 'India', 'National Mandi Avg'),
  ('Onion',      2500, 'India', 'National Mandi Avg'),
  ('Potato',     1500, 'India', 'National Mandi Avg'),
  ('Turmeric',   8500, 'India', 'National Mandi Avg'),
  ('Chilli',     9000, 'India', 'National Mandi Avg'),
  ('Sunflower',  5200, 'India', 'National Mandi Avg'),
  ('Banana',     1800, 'India', 'National Mandi Avg'),
  ('Barley',     1700, 'India', 'National Mandi Avg')
ON CONFLICT DO NOTHING;

-- Default admin account  (password: Admin@123)
INSERT INTO users (name, email, password, role)
VALUES (
  'Admin',
  'admin@agrichain.com',
  '$2b$10$YmJhYzE4ZTYtNzM2Ny00.jRvUFBhc3N3b3Jk.hashed.placeholder',
  'admin'
) ON CONFLICT (email) DO NOTHING;


-- ── Email Verification (added for Phase 1 email verification) ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified        BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token  VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token  VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Admin is pre-verified
UPDATE users SET is_verified = true WHERE role = 'admin';

-- ── OTP columns for email verification ──────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN   DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code     VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires  TIMESTAMP;

-- Admin is pre-verified
UPDATE users SET is_verified = true WHERE role = 'admin';

-- ── Phase 4: mock payment reference on ledger (self-healing for existing DBs) ─
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(80);

-- ── Auth: optional two-factor (OTP-on-login) toggle ──────────────────────────
-- Login is password-only by default. Users can opt into an email OTP as a
-- second factor; forgot-password re-uses the same otp_code/otp_expires columns.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- ── Phase 2 polish: configurable buffer % + dispute path ─────────────────────
-- Buffer % is set by the buyer per contract at request time (default 10% on top
-- of contract value → 110% locked). escrow.buffer_pct already exists; contracts
-- carries the buyer's chosen value forward to createEscrowOnAccept.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS buffer_pct NUMERIC(5,2) DEFAULT 10;

-- Dispute path: either party can raise a dispute on an accepted/completed
-- contract; an admin resolves it. Kept as lightweight columns rather than a new
-- table — one open dispute per contract at a time is enough for the demo.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dispute_status  VARCHAR(20) DEFAULT 'none'
  CHECK (dispute_status IN ('none','open','resolved','rejected'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dispute_reason      TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dispute_raised_by   INTEGER REFERENCES users(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dispute_raised_at   TIMESTAMP;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dispute_resolution  TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMP;
