-- ── Market Price Schema (India-wide, data.gov.in) ────────────────────────────
-- Run this against your existing agrichain database (idempotent).
--
-- Prices are keyed per crop + state + district + market + date, so the same
-- commodity can hold distinct rows for a national average ('India'/'') and for
-- specific state/district mandis fetched on demand at settlement time.

-- Columns (add if missing) --------------------------------------------------
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS source      VARCHAR(50)  DEFAULT 'admin';
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP    DEFAULT NOW();
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS district    VARCHAR(100) DEFAULT '';
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS min_price   NUMERIC(10,2);
ALTER TABLE market_prices ADD COLUMN IF NOT EXISTS max_price   NUMERIC(10,2);

-- Backfill so the new key columns are never NULL (NULLs break ON CONFLICT) ---
UPDATE market_prices SET district    = ''            WHERE district    IS NULL;
UPDATE market_prices SET market_name = 'Unknown APMC' WHERE market_name IS NULL;

-- Unique constraint: one row per crop / state / district / market / day ------
ALTER TABLE market_prices DROP CONSTRAINT IF EXISTS unique_crop_state_date;
ALTER TABLE market_prices DROP CONSTRAINT IF EXISTS unique_crop_scope_date;
ALTER TABLE market_prices
  ADD CONSTRAINT unique_crop_scope_date
  UNIQUE (crop_name, state, district, market_name, recorded_date);

-- Scrape/refresh log --------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_scrape_log (
  id             SERIAL PRIMARY KEY,
  crops_updated  INTEGER DEFAULT 0,
  fallback_used  INTEGER DEFAULT 0,
  scraped_at     TIMESTAMP DEFAULT NOW()
);

-- Seed national reference prices (overwritten by the daily data.gov.in job) --
INSERT INTO market_prices
  (crop_name, price_per_quintal, state, district, market_name, recorded_date, source)
VALUES
  ('Rice',      2100, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Wheat',     2200, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Maize',     1800, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Groundnut', 5500, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Soyabean',  4200, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Cotton',    6500, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Sugarcane', 3200, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Tomato',    1200, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Onion',     2500, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Potato',    1500, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Turmeric',  8500, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Chilli',    9000, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Sunflower', 5200, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Banana',    1800, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default'),
  ('Barley',    1700, 'India', '', 'National Mandi Avg', CURRENT_DATE, 'default')
ON CONFLICT (crop_name, state, district, market_name, recorded_date) DO NOTHING;
