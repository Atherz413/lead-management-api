-- ================================================================
-- Migration 001: Initial Schema
-- Tables: users, leads, lead_transfers
-- ================================================================

-- Table: users
-- พนักงานขาย + admin
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'sales')),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Table: leads
-- Source of truth ของทุก lead (แทน Check SPL Main sheet)
CREATE TABLE leads (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(20),
  email       VARCHAR(255),
  source      VARCHAR(50)  NOT NULL CHECK (source IN ('web', 'referral', 'admin')),
  status      VARCHAR(30)  NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'qualified', 'closed_won', 'closed_lost')),
  owner_id    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Table: lead_transfers
-- Audit log ทุกครั้งที่ lead เปลี่ยนมือ (แทน Lead_Transfer_Log sheet)
CREATE TABLE lead_transfers (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER      NOT NULL REFERENCES leads(id),
  from_owner_id   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  to_owner_id     INTEGER      NOT NULL REFERENCES users(id),
  transferred_by  INTEGER      NOT NULL REFERENCES users(id),
  reason          TEXT,
  transferred_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_leads_owner_id  ON leads(owner_id);
CREATE INDEX idx_leads_status    ON leads(status);
CREATE INDEX idx_transfers_lead  ON lead_transfers(lead_id);