-- ── Expenses table ──────────────────────────────────────────────────────────
-- Tracks every business expense for P&L calculation.

CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  category      TEXT NOT NULL,           -- Salary | Rent | Electricity | Raw Material | Other
  description   TEXT,                    -- Free-text detail
  amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by       TEXT DEFAULT 'cash',     -- cash | upi | bank
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_auth" ON expenses
  USING (auth.uid() IS NOT NULL);

-- Index for fast date-range queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (outlet_id, expense_date DESC);