-- ============================================================
-- AgriChain — Phase 4 Escrow upgrade (stage-based milestone releases)
-- Run AFTER schema.sql and market_schema.sql:
--   psql -U postgres -d agrichain-ai -f escrow_schema.sql
--
-- Fully idempotent — safe to run more than once.
--
-- What this adds:
--   * escrow_milestones — a per-contract payment schedule. The 110% buffer
--     is still locked at accept-time, but instead of one advance + one final
--     settlement, funds are released to the farmer in stages as each crop
--     stage is proven with a GPS-tagged photo (mock payment, no gateway).
--   * escrow_ledger.payment_ref — mock transaction id for each money movement.
-- ============================================================

-- ── Per-contract stage-based release schedule ────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_milestones_escrow   ON escrow_milestones(escrow_id);
CREATE INDEX IF NOT EXISTS idx_milestones_contract ON escrow_milestones(contract_id);

-- ── Retrofit CHECK constraints onto an already-created table ──────────────────
-- (CREATE TABLE IF NOT EXISTS above is a no-op if the table pre-dates this file,
--  so add the constraints defensively — each guard skips if the constraint
--  already exists, and Postgres itself rejects the ADD if any row violates it.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escrow_milestones_kind_check') THEN
    ALTER TABLE escrow_milestones ADD CONSTRAINT escrow_milestones_kind_check
      CHECK (kind IN ('advance','progress'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escrow_milestones_status_check') THEN
    ALTER TABLE escrow_milestones ADD CONSTRAINT escrow_milestones_status_check
      CHECK (status IN ('locked','released'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escrow_milestones_release_pct_check') THEN
    ALTER TABLE escrow_milestones ADD CONSTRAINT escrow_milestones_release_pct_check
      CHECK (release_pct >= 0 AND release_pct <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escrow_milestones_amount_check') THEN
    ALTER TABLE escrow_milestones ADD CONSTRAINT escrow_milestones_amount_check
      CHECK (amount >= 0);
  END IF;
END $$;

-- ── Mock payment reference on every ledger entry ─────────────────────────────
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(80);
