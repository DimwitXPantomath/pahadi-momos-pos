import { useState } from 'react'
import type { Ingredient, IngredientFormData, BaseUnit } from '@/types/recipe'
import { BASE_UNITS, PURCHASE_UNITS } from '@/types/recipe'
import { calcIngredientCost } from '@/lib/recipeCosting'
import { formatCurrency, formatQty } from '@/lib/utils'

interface Props {
  onSave: (data: IngredientFormData) => Promise<void>
  onCancel: () => void
  initial?: Ingredient
}

const EMPTY: IngredientFormData = {
  name: '',
  base_unit: 'g',
  purchase_unit: 'kg',
  quantity_per_unit: '',
  purchase_cost: '',
  min_stock: '',
  current_stock: '0',
}

export default function IngredientForm({ onSave, onCancel, initial }: Props) {
  const [form, setForm] = useState<IngredientFormData>(
    initial
      ? {
          name: initial.name,
          base_unit: initial.base_unit,
          purchase_unit: initial.purchase_unit,
          quantity_per_unit: initial.quantity_per_unit,
          purchase_cost: initial.purchase_cost,
          min_stock: initial.min_stock,
          current_stock: initial.current_stock,
        }
      : EMPTY
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const qty = Number(form.quantity_per_unit) || 0
  const cost = Number(form.purchase_cost) || 0
  const costPerBase = calcIngredientCost(cost, qty)

  function set(field: keyof IngredientFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (qty <= 0) { setErr('Qty per purchase unit must be > 0'); return }
    if (cost < 0) { setErr('Purchase cost must be ≥ 0'); return }
    if (!form.purchase_unit.trim()) { setErr('Purchase unit is required'); return }

    setSaving(true)
    setErr('')
    try {
      await onSave(form)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.grid2}>
        <div style={s.field}>
          <label style={s.label}>Ingredient Name *</label>
          <input
            style={s.input}
            placeholder="e.g. Mascarpone Cheese"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Base Unit *</label>
          <select
            style={s.input}
            value={form.base_unit}
            onChange={e => set('base_unit', e.target.value as BaseUnit)}
          >
            {BASE_UNITS.map(u => (
              <option key={u} value={u}>
                {u === 'g' ? 'Grams (g)' : u === 'ml' ? 'Millilitres (ml)' : 'Pieces (pcs)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={s.grid3}>
        <div style={s.field}>
          <label style={s.label}>Purchase Unit *</label>
          <select
            style={s.input}
            value={form.purchase_unit}
            onChange={e => set('purchase_unit', e.target.value)}
          >
            {PURCHASE_UNITS.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div style={s.field}>
          <label style={s.label}>Qty per Purchase Unit *</label>
          <input
            style={s.input}
            type="number"
            min="0"
            step="0.001"
            placeholder="e.g. 1000 (for 1 kg = 1000 g)"
            value={String(form.quantity_per_unit)}
            onChange={e => set('quantity_per_unit', e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Purchase Cost ₹ *</label>
          <input
            style={s.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 450"
            value={String(form.purchase_cost)}
            onChange={e => set('purchase_cost', e.target.value)}
          />
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.field}>
          <label style={s.label}>Min Stock ({form.base_unit})</label>
          <input
            style={s.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="Reorder threshold"
            value={String(form.min_stock)}
            onChange={e => set('min_stock', e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Current Stock ({form.base_unit})</label>
          <input
            style={s.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={String(form.current_stock)}
            onChange={e => set('current_stock', e.target.value)}
          />
        </div>
      </div>

      {qty > 0 && cost >= 0 && (
        <div style={s.calcStrip}>
          <div style={s.calcItem}>
            <span style={s.calcLabel}>Cost per {form.base_unit}</span>
            <span style={{ ...s.calcValue, color: '#16a34a' }}>
              {formatCurrency(costPerBase)} / {form.base_unit}
            </span>
          </div>
          <div style={s.calcDiv} />
          <div style={s.calcItem}>
            <span style={s.calcLabel}>Purchase</span>
            <span style={s.calcValue}>
              {formatQty(qty, form.base_unit)} for {formatCurrency(cost)}
            </span>
          </div>
        </div>
      )}

      {err && <div style={s.errBanner}>⚠️ {err}</div>}

      <div style={s.btnRow}>
        <button style={s.cancelBtn} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          style={{ ...s.saveBtn, opacity: saving ? 0.7 : 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : initial ? 'Update Ingredient' : 'Add Ingredient'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 0 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111', background: '#fafafa', outline: 'none', width: '100%', boxSizing: 'border-box' },
  calcStrip: { display: 'flex', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 12 },
  calcItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  calcLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' },
  calcValue: { fontSize: 15, fontWeight: 800, color: '#111' },
  calcDiv: { width: 1, height: 32, background: '#bbf7d0', margin: '0 12px' },
  errBanner: { background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 },
  btnRow: { display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 },
  saveBtn: { height: 44, padding: '0 24px', background: '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { height: 44, padding: '0 20px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}
