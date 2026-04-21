-- Migration: 0001_cardex_initial
-- Run AFTER prisma migrate deploy creates the base tables

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ── Trigram index on card name (fuzzy search) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm
  ON cards USING GIN (name gin_trgm_ops);

-- ── Partial index: only for-trade items ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ci_for_trade_active
  ON collection_items (user_id)
  WHERE for_trade > 0;

-- ── Partial index: only active trade offers ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_offers_active
  ON trade_offers (expires_at, initiator_id, counterpart_id)
  WHERE status IN ('pending', 'accepted', 'confirmed_initiator', 'confirmed_counterpart');

-- ── Auto-updated_at trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users', 'collection_items', 'trade_offers'] LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      tbl
    );
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL; -- idempotent
END $$;

-- ── Materialized view: user reputation scores ────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS user_rep_mv AS
  SELECT user_id, SUM(delta) AS score
  FROM rep_events
  GROUP BY user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_rep_mv_user
  ON user_rep_mv (user_id);

-- Refresh function (call after each rep event in high-volume scenarios)
CREATE OR REPLACE FUNCTION refresh_user_rep()
RETURNS VOID AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_rep_mv;
$$ LANGUAGE sql;

-- ── Row-level security setup ─────────────────────────────────────────────────
-- Enable RLS on sensitive tables (enforced at app layer too)
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_offers     ENABLE ROW LEVEL SECURITY;

-- Policy: API user (cardex_api role) can read/write all — policies enforce at application layer
-- Add per-row policies if using PostgREST or Supabase in future
