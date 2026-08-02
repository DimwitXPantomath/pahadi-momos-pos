-- ============================================================
-- Migration 013: Daily Checklists + Compliance Log Sheets
-- Preset templates (cleaning / pest control / temperature /
-- handwashing) ship seeded and active. Owners can add custom
-- items on top of a preset, or create fully custom templates
-- (category = 'custom').
--
-- These are common good-practice templates, not a verbatim
-- reproduction of FSSAI Schedule 4 legal text — outlets should
-- still confirm exact regulatory wording for their license type.
-- ============================================================

CREATE TABLE IF NOT EXISTS checklist_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'custom'
              CHECK (category IN ('cleaning','pest_control','temperature','handwashing','custom')),
  frequency   TEXT NOT NULL DEFAULT 'daily'
              CHECK (frequency IN ('daily','weekly','monthly')),
  is_preset   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checklist_templates_outlet_idx ON checklist_templates(outlet_id);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  value_type   TEXT NOT NULL DEFAULT 'check' CHECK (value_type IN ('check','number','text')),
  unit         TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (template_id, label)
);

-- One row per template per calendar day it's opened/filled — this row *is* the log entry header.
CREATE TABLE IF NOT EXISTS checklist_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  log_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (template_id, log_date)
);

CREATE INDEX IF NOT EXISTS checklist_logs_template_date_idx ON checklist_logs(template_id, log_date DESC);
CREATE INDEX IF NOT EXISTS checklist_logs_outlet_idx ON checklist_logs(outlet_id);

CREATE TABLE IF NOT EXISTS checklist_log_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id           UUID NOT NULL REFERENCES checklist_logs(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES checklist_template_items(id) ON DELETE CASCADE,
  checked          BOOLEAN DEFAULT false,
  value            TEXT,          -- numeric/text reading, e.g. "4.2" for a °C item
  checked_at       TIMESTAMPTZ,
  UNIQUE (log_id, template_item_id)
);

-- ── RLS: staff-only, mirrors the auth.uid() IS NOT NULL pattern used elsewhere ──
ALTER TABLE checklist_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_log_entries    ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_all_checklist_templates      ON checklist_templates      FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY staff_all_checklist_template_items ON checklist_template_items FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY staff_all_checklist_logs           ON checklist_logs           FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY staff_all_checklist_log_entries    ON checklist_log_entries    FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── Seed: 4 preset templates ─────────────────────────────────────────────────
INSERT INTO checklist_templates (id, name, category, frequency, is_preset, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Daily Cleaning Checklist', 'cleaning',     'daily',  true, 1),
  ('c1000000-0000-0000-0000-000000000002', 'Pest Control Log',        'pest_control', 'weekly', true, 2),
  ('c1000000-0000-0000-0000-000000000003', 'Temperature Log',         'temperature',  'daily',  true, 3),
  ('c1000000-0000-0000-0000-000000000004', 'Handwashing Log',         'handwashing',  'daily',  true, 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO checklist_template_items (template_id, label, value_type, unit, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Wipe down prep surfaces',                     'check', NULL, 1),
  ('c1000000-0000-0000-0000-000000000001', 'Sanitize cutting boards',                      'check', NULL, 2),
  ('c1000000-0000-0000-0000-000000000001', 'Clean floors',                                 'check', NULL, 3),
  ('c1000000-0000-0000-0000-000000000001', 'Empty & clean bins',                           'check', NULL, 4),
  ('c1000000-0000-0000-0000-000000000001', 'Clean equipment (mixer / oven / fryer)',       'check', NULL, 5),
  ('c1000000-0000-0000-0000-000000000001', 'Restock handwash & sanitizer stations',        'check', NULL, 6),
  ('c1000000-0000-0000-0000-000000000001', 'Clean restrooms',                              'check', NULL, 7),

  ('c1000000-0000-0000-0000-000000000002', 'Check for rodent droppings / signs',           'check', NULL, 1),
  ('c1000000-0000-0000-0000-000000000002', 'Inspect bait / trap stations',                 'check', NULL, 2),
  ('c1000000-0000-0000-0000-000000000002', 'Check door seals & gaps',                      'check', NULL, 3),
  ('c1000000-0000-0000-0000-000000000002', 'Check drains for pest activity',               'check', NULL, 4),
  ('c1000000-0000-0000-0000-000000000002', 'Remarks / action taken',                       'text',  NULL, 5),

  ('c1000000-0000-0000-0000-000000000003', 'Fridge temperature',                           'number', '°C', 1),
  ('c1000000-0000-0000-0000-000000000003', 'Freezer temperature',                          'number', '°C', 2),
  ('c1000000-0000-0000-0000-000000000003', 'Hot holding temperature',                      'number', '°C', 3),
  ('c1000000-0000-0000-0000-000000000003', 'Cold holding / display temperature',           'number', '°C', 4),

  ('c1000000-0000-0000-0000-000000000004', 'Morning shift start',                          'check', NULL, 1),
  ('c1000000-0000-0000-0000-000000000004', 'After using restroom',                         'check', NULL, 2),
  ('c1000000-0000-0000-0000-000000000004', 'After handling raw food',                      'check', NULL, 3),
  ('c1000000-0000-0000-0000-000000000004', 'Before handling ready-to-eat food',             'check', NULL, 4)
ON CONFLICT (template_id, label) DO NOTHING;
