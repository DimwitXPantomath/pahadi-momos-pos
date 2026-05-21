# CLAUDE.md — Pahadi Momos POS
> This file is read by Claude Code at the start of every session.
> It describes the project stack, conventions, module status, and rules.
> **Always read this file before touching any code.**

---

## 🏗️ Project Overview

**Name:** Pahadi Momos POS  
**Purpose:** AI-enabled POS + Inventory & Procurement Management System for a food/bakery business (tiramisu production use-case)  
**Repo:** https://github.com/DimwitXPantomath/pahadi-momos-pos  
**Live:** https://pahadi-momos-pos.vercel.app  
**Owner:** @DimwitXPantomath  

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui + Radix UI |
| Routing | React Router v6 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Backend logic | Supabase Edge Functions (no Express/Node server) |
| Charts | Recharts |
| Animation | Framer Motion |
| Excel | SheetJS (xlsx) |
| Deployment | Vercel |

**Key rule: There is NO separate Express/Node.js backend. All server-side logic goes through Supabase (DB, Edge Functions, RLS policies).**

---

## 📁 Project Structure

```
pahadi-momos-pos/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # shadcn/ui primitives (DO NOT edit these)
│   │   └── layout/        # Sidebar, TopBar, Layout wrapper
│   ├── pages/             # One file per route
│   ├── lib/
│   │   ├── supabase.ts    # Supabase client + DB types
│   │   └── utils.ts       # cn(), formatCurrency(), formatQty()
│   ├── hooks/             # Custom React hooks (useStock, useIngredients, etc.)
│   ├── types/             # Shared TypeScript interfaces
│   └── App.tsx            # Router setup
├── supabase/
│   └── migrations/        # SQL migration files (run in Supabase dashboard)
├── CLAUDE.md              # ← YOU ARE HERE
└── package.json
```

---

## 🗄️ Database Schema

### Tables (all in Supabase PostgreSQL)

**ingredients** — raw material cost tracking with yield
```sql
id, name, unit, purchase_unit, purchase_qty, purchase_cost,
processing_yield_pct,
cost_per_unit (GENERATED: purchase_cost / usable_qty),
usable_qty (GENERATED: purchase_qty × yield% / 100),
wastage_qty (GENERATED: purchase_qty - usable_qty)
```

**items** — master item registry (ingredients + finished goods + packaging)
```sql
id, name, category ('ingredient'|'finished_good'|'packaging'), unit, reorder_level
```

**stock** — current quantity per item
```sql
id, item_id → items, quantity, updated_at
```

**recipes** — production recipes
```sql
id, name, output_item_id → items, batch_size, unit
```

**recipe_ingredients** — ingredients per recipe
```sql
id, recipe_id → recipes, item_id → items, qty_per_batch
```

**production_batches** — log of production runs
```sql
id, recipe_id → recipes, batches_made, produced_qty, produced_at, notes
```

**vendors** — supplier registry
```sql
id, name, type ('online'|'offline')
```

**vendor_shops** — shop/branch per vendor
```sql
id, vendor_id → vendors, shop_name, city
```

**brands** — brand names (Amul, Local Loose, etc.)
```sql
id, name (UNIQUE)
```

**vendor_item_prices** — pricing engine (city + brand + vendor level)
```sql
id, shop_id → vendor_shops, item_id → items, brand_id → brands,
price, unit, min_qty, is_available, delivery_available,
delivery_time_hrs, product_url, last_updated
```

**procurements** — purchase orders
```sql
id, user_id → auth.users, vendor_id → vendors,
status ('Draft'|'Sent'|'Vendor Responded'|'Confirmed'|'Completed'),
total_estimated, total_confirmed, created_at, updated_at
```

**procurement_items** — line items in a procurement order
```sql
id, procurement_id → procurements, item_id → items, brand_id → brands,
requested_qty, confirmed_qty, price, is_available, final_selected
```

### RLS Policy Rule
All tables have RLS enabled. Authenticated users can read/write their own org's data. For now: `auth.uid() IS NOT NULL` grants full access. Add multi-tenancy (org_id) in Phase 3.

---

## 🧭 Routes

| Path | Page | Status |
|------|------|--------|
| `/` | Dashboard | 🔲 TODO |
| `/ingredients` | Ingredient Feed Form + Table | 🔲 TODO |
| `/inventory` | Inventory Dashboard | 🔲 TODO |
| `/recipes` | Recipe Manager | 🔲 TODO |
| `/production` | Production Batch Entry | 🔲 TODO |
| `/vendors` | Vendor & Pricing Management | 🔲 TODO |
| `/procurement` | Procurement List | 🔲 TODO |
| `/procurement/new` | Create Procurement Order | 🔲 TODO |
| `/procurement/:id/vendor` | Vendor Response View | 🔲 TODO |
| `/procurement/:id/confirm` | Buyer Confirmation | 🔲 TODO |
| `/export-import` | Export/Import Screen | 🔲 TODO |

**Update status to ✅ DONE as each page is completed.**

---

## 🎨 Design System

### Colors
```
Primary:    #2D6A4F  (forest green)
Accent:     #F4A261  (warm orange)
Background: #F8F9FA
Card:       #FFFFFF with shadow-sm
Success:    #52B788
Warning:    #E9C46A
Error:      #E76F51
```

### Typography
- Font: Inter (system fallback: sans-serif)
- Headings: font-semibold
- Numbers: font-mono, right-aligned
- Currency: always prefix ₹

### Component Rules
- Cards: `rounded-xl shadow-sm border border-gray-100`
- Buttons: min height 44px (tap-friendly)
- Tables: zebra striped, sticky header, hover highlight
- Badges (status): pill-shaped, color-coded:
  - Draft → gray
  - Sent → blue
  - Vendor Responded → yellow
  - Confirmed → green
  - Completed → teal
  - Low Stock → red
  - Best Price → green + "BEST" badge

### Utility Functions (in `src/lib/utils.ts`)
```ts
formatCurrency(n: number) → "₹1,234.50"
formatQty(n: number, unit: string) → "5 kg"
cn(...classes) → merged Tailwind classes (already exists via clsx)
calcYield(qty, yieldPct) → { usable, wastage, costPerUnit }
```

---

## 🧩 Module Status & Build Order

Build in this exact order (each module depends on previous):

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 1 | DB Schema + Supabase types | ✅ DONE | supabase/migrations/001_initial_schema.sql |
| 2 | Layout shell + routing | ✅ DONE | Sidebar, TopBar, protected routes — wired |
| 3 | Ingredient Feed Form | ✅ DONE | IngredientsView — yield calc, cost/unit, CRUD |
| 4 | Inventory Dashboard | ✅ DONE | InventoryView — stock table + low stock alerts |
| 5 | Recipe Manager | ✅ DONE | RecipesView + SubRecipesView — cost/margin calc |
| 6 | Production Batch | 🔲 TODO | Stock deduction + finished goods |
| 7 | Vendor & Pricing | 🔲 TODO | Price comparison, best vendor |
| 8 | Procurement Workflow | 🔲 TODO | 3-step: create → vendor → confirm |
| 9 | Export / Import | 🔲 TODO | SheetJS client-side |
| 10 | AI Assistant Panel | 🔲 TODO | Claude API with stock context |

---

## 🤖 AI Assistant (Module 10)

The AI panel is a slide-out drawer available on all pages.

**Implementation:** Call Anthropic API (`claude-sonnet-4-20250514`) with injected context.

**System prompt template:**
```
You are an AI procurement assistant for a bakery business.
You have real-time access to:
- Current stock levels: {stock_json}
- Ingredient costs and yield data: {ingredients_json}
- Vendor pricing across shops: {pricing_json}
- Recent procurement history: {procurement_json}

Help with: best vendor recommendations, reorder suggestions, 
cost optimization, production planning. Always cite specific 
numbers from the data. Respond concisely — this is a POS UI.
Currency is Indian Rupees (₹). Location is Bhopal, India.
```

**Suggested AI queries (quick-action buttons):**
1. "Which vendor has the best price for [item] with delivery?"
2. "What can I produce today with current stock?"
3. "What do I need to buy to make 50 tiramisus?"
4. "Show me items running low on stock"

---

## 📤 Export/Import (Module 9)

**Export (client-side, SheetJS):**
- Button: top-right, label "Export Empty Form"
- Columns: `Ingredient Name | Vendor Name | Price per Unit | Unit | Units per Case | Total Case Price | Cost per Unit | Product URL`
- Pre-fill Ingredient Name from DB; leave pricing columns blank for vendor to fill

**Import:**
- Accept `.xlsx` upload
- Parse with SheetJS
- Preview rows in table before confirming
- On confirm: upsert into `vendor_item_prices`

---

## ⚡ Business Logic Rules

### Yield Calculation
```
usable_qty   = purchase_qty × (processing_yield_pct / 100)
wastage_qty  = purchase_qty - usable_qty
cost_per_unit = purchase_cost / usable_qty
```
These are PostgreSQL GENERATED columns — never calculate in frontend, always read from DB.

### Production Deduction
When a production batch is created:
1. For each recipe_ingredient: `deduct = qty_per_batch × batches_made`
2. `UPDATE stock SET quantity = quantity - deduct WHERE item_id = ?`
3. `UPDATE stock SET quantity = quantity + produced_qty WHERE item_id = output_item_id`
4. Both updates must be atomic — use a Supabase Edge Function or RPC.

### Procurement Total
```
total_estimated = SUM(requested_qty × price)   -- from vendor_item_prices
total_confirmed = SUM(confirmed_qty × price)    -- after vendor responds
```

### Best Vendor Logic
For a given item + city:
```sql
SELECT v.name, vs.shop_name, vip.price, vip.delivery_available
FROM vendor_item_prices vip
JOIN vendor_shops vs ON vip.shop_id = vs.id
JOIN vendors v ON vs.vendor_id = v.id
WHERE vip.item_id = ? AND vs.city = ? AND vip.is_available = true
ORDER BY vip.price ASC;
```
First result = BEST (highlight in green).

---

## 🚫 Rules for Claude Code

1. **Never edit files in `src/components/ui/`** — these are shadcn/ui auto-generated primitives.
2. **Never add Express, Fastify, or any Node server** — Supabase handles all backend.
3. **Always use TypeScript** — no `.js` files in `src/`.
4. **Always use the existing shadcn components** before creating new ones (Button, Card, Table, Dialog, Select, Tabs, Badge, etc.).
5. **Currency is always ₹ (Indian Rupees)** — never $ or €.
6. **Location context is Bhopal, Madhya Pradesh, India.**
7. **After each module, update the status table in this file** from 🔲 TODO to ✅ DONE.
8. **Run `npm run build` after each module** to catch TypeScript errors before moving on.
9. **All Supabase queries go in custom hooks** (`src/hooks/`) — never inline in components.
10. **SQL migrations go in `supabase/migrations/`** as numbered files (e.g., `001_initial_schema.sql`).
11. **`public/` must always be lowercase** — macOS is case-insensitive and will silently accept `Public/`, but Vercel deploys on Linux where `Public/ ≠ public/` and Vite won't serve the files. Always verify with `git ls-tree HEAD -- public/` that entries are lowercase.

---

## ⚠️ Known Gotchas

### `public/` case sensitivity (fixed 2026-05-21)
The `public/` directory was originally committed as `Public/` (capital P). macOS's case-insensitive filesystem hid this — `git status` always said "nothing to commit." On Vercel's Linux build, `Public/ ≠ public/`, so all static assets (firebase-messaging-sw.js, sw.js, etc.) returned 404. Fixed by removing `Public/` entries from the git index and re-adding as `public/`.

If you ever see static assets 404 on Vercel but working locally, run:
```bash
git ls-tree HEAD -- public/
git ls-tree HEAD -- Public/
```
If entries appear under `Public/`, fix with:
```bash
git rm -r --cached 'Public/'
git add public/
git commit -m "fix: rename Public/ to public/ for case-sensitive deployment"
```

### Stale `index.lock` (fixed 2026-05-21)
A stale `.git/index.lock` file caused every `git add` to silently do nothing. If `git add -v` produces no output and files are confirmed untracked via `git ls-files --others`, check for a stale lock:
```bash
ls .git/index.lock   # if exists, delete it
rm .git/index.lock
```

---

## 🔐 Environment Variables

Create a `.env.local` file (never commit this):
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ANTHROPIC_API_KEY=your_anthropic_key   # for AI assistant
```

Get Supabase values from: supabase.com → your project → Settings → API

---

## 📋 Session Startup Checklist

When starting a new Claude Code session, always:
1. Read this `CLAUDE.md` file
2. Check module status table above — find first 🔲 TODO
3. Run `npm run dev` to confirm app starts cleanly
4. Ask user which module to work on if unclear
5. Never assume previous session's work is complete — verify by checking the actual files

---

## 📝 Changelog

| Date | Change |
|------|--------|
| 2026-05-07 | CLAUDE.md created, full spec documented |
| 2026-05-20 | Modules 1–5 completed: full DB migration, IngredientsView (yield+cost), SubRecipesView (builder+cost), RecipesView (margin calc), all wired into Index.tsx |
| 2026-05-21 | Fixed `Public/` → `public/` case bug (Vercel 404 on all static assets); deleted stale `index.lock`; confirmed `placeOrder` has `opts?` in main branch |

