import { useState, useCallback } from 'react'
import type { Ingredient, SubRecipeWithItems, SubRecipeFormData } from '@/types/recipe'
import { BASE_UNITS } from '@/types/recipe'
import { calcSubRecipeCost } from '@/lib/recipeCosting'
import { formatCurrency, formatQty } from '@/lib/utils'

interface RowState {
  ingredient_id: string
  quantity_used: string
  unit: string
}

interface Props {
  onSave: (data: SubRecipeFormData) => Promise<void>
  onCancel: () => void
  ingredients: Ingredient[]
  initial?: SubRecipeWithItems
}

export default function SubRecipeForm({ onSave, onCancel, ingredients, initial }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [yieldQty, setYieldQty] = useState(String(initial?.yield_quantity ?? ''))
  const [yieldUnit, setYieldUnit] = useState(initial?.yield_unit ?? 'g')
  const [rows, setRows] = useState<RowState[]>(
    initial?.items.map(i => ({
      ingredient_id: i.ingredient_id,
      quantity_used: String(i.quantity_used),
      unit: i.unit,
    })) ?? [{ ingredient_id: '', quantity_used: '', unit: 'g' }]
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // ── Live cost calc ────────────────────────────────────────────────
  const itemInputs = rows
    .filter(r => r.ingredient_id && Number(r.quantity_used) > 0)
    .map(r => {
      const ing = ingredients.find(i => i.id === r.ingredient_id)
      return {
        ingredient_id: r.ingredient_id,
        quantity_used: Number(r.quantity_used),
        unit: r.unit,
        cost_per_base_unit: ing?.cost_per_base_unit ?? 0,
      }
    })

  const yieldQtyNum = Number(yieldQty) || 0
  const { total_cost, cost_per_unit } = calcSubRecipeCost(itemInputs, yieldQtyNum)

  // ── Row helpers ───────────────────────────────────────────────────
  const addRow = useCallback(() => {
    setRows(prev => [...prev, { ingredient_id: '', quantity_used: '', unit: 'g' }])
  }, [])

  const removeRow = useCallback((idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const setRow = useCallback((idx: number, field: keyof RowState, value: string) => {
    setRows(prev =>
      prev.map((r, i) => {
        if (i !== idx) return r
        const updated = { ...r, [field]: value }
        // auto-fill unit from ingredient's base_unit when ingredient changes
        if (field === 'ingredient_id') {
          const ing = ingredients.find(ing => ing.id === value)
          if (ing) updated.unit = ing.base_unit
        }
        return updated
      })
    )
  }, [ingredients])

  // ── Validation & save ─────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) { setErr('Name is required'); return }
    if (yieldQtyNum <= 0) { setErr('Yield quantity must be > 0'); return }
    if (rows.length === 0) { setErr('Add at least one ingredient'); return }
    for (const r of rows) {
      if (!r.ingredient_id) { setErr('Select an ingredient for each row'); return }
      if (Number(r.quantity_used) <= 0) { setErr('All quantities must be > 0'); return }
    }

    // Duplicate ingredient check
    const ids = rows.map(r => r.ingredient_id)
    if (new Set(ids).size !== ids.length) {
      setErr('Duplicate ingredients — each ingredient can only appear once')
      return
    }

    setSaving(true)
    setErr('')
    try {
      await onSave({
        name,
        yield_quantity: yieldQtyNum,
        yield_unit: yieldUnit,
        items: rows.map(r => ({
          ingredient_id: r.ingredient_id,
          quantity_used: Number(r.quantity_used),
          unit: r.unit,
        })),
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.wrap}>
      {/* Name */}
      <div style={{ ...s.field, marginBottom: 12 }}>
        <label style={s.label}>Sub-Recipe Name *</label>
        <input
          style={s.input}
          placeholder="e.g. Espresso Cream"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      {/* Yield */}
      <div style={s.grid2}>
        <div style={s.field}>
          <label style={s.label}>Yield Quantity *</label>
          <input
            style={s.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 500"
            value={yieldQty}
            onChange={e => setYieldQty(e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Yield Unit</label>
          <select style={s.input} value={yieldUnit} onChange={e => setYieldUnit(e.target.value)}>
            {BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            <option value="portion">portion</option>
            <option value="litre">litre</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>

      {/* Ingredient rows */}
      <div style={s.sectionHead}>Ingredients Used</div>

      {rows.map((row, idx) => {
        const ing = ingredients.find(i => i.id === row.ingredient_id)
        const lineCost = ing ? ing.cost_per_base_unit * (Number(row.quantity_used) || 0) : 0

        return (
          <div key={idx} style={s.rowWrap}>
            <div style={{ flex: 2 }}>
              <select
                style={s.input}
                value={row.ingredient_id}
                onChange={e => setRow(idx, 'ingredient_id', e.target.value)}
              >
                <option value="">— Select ingredient —</option>
                {ingredients.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.base_unit}) · {formatCurrency(i.cost_per_base_unit)}/{i.base_unit}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty"
                value={row.quantity_used}
                onChange={e => setRow(idx, 'quantity_used', e.target.value)}
              />
            </div>

            <div style={{ flex: 0.6 }}>
              <input
                style={{ ...s.input, background: '#f3f4f6', color: '#6b7280' }}
                value={ing?.base_unit ?? row.unit}
                readOnly
              />
            </div>

            {lineCost > 0 && (
              <span style={s.lineCost}>{formatCurrency(lineCost)}</span>
            )}

            <button style={s.removeBtn} onClick={() => removeRow(idx)}>✕</button>
          </div>
        )
      })}

      <button style={s.addRowBtn} onClick={addRow}>+ Add Ingredient</button>

      {/* Cost summary */}
      {itemInputs.length > 0 && (
        <div style={s.costBox}>
          <div style={s.costRow}>
            <span>Total Cost</span>
            <strong style={{ color: '#16a34a' }}>{formatCurrency(total_cost)}</strong>
          </div>
          {yieldQtyNum > 0 && (
            <div style={s.costRow}>
              <span>Cost per {yieldUnit}</span>
              <strong style={{ color: '#16a34a' }}>
                {formatCurrency(cost_per_unit)} / {yieldUnit}
              </strong>
            </div>
          )}
        </div>
      )}

      {err && <div style={s.errBanner}>⚠️ {err}</div>}

      <div style={s.btnRow}>
        <button style={s.cancelBtn} onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          style={{ ...s.saveBtn, opacity: saving ? 0.7 : 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : initial ? 'Update Sub-Recipe' : 'Create Sub-Recipe'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 0 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111', background: '#fafafa', outline: 'none', width: '100%', boxSizing: 'border-box' },
  sectionHead: { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, marginTop: 4, borderBottom: '1px solid #f3f4f6', paddingBottom: 6 },
  rowWrap: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineCost: { fontSize: 12, fontWeight: 700, color: '#16a34a', minWidth: 64, textAlign: 'right' },
  removeBtn: { width: 30, height: 30, border: 'none', background: '#fee2e2', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#dc2626', flexShrink: 0 },
  addRowBtn: { height: 36, padding: '0 14px', background: 'transparent', border: '1.5px dashed #d1d5db', borderRadius: 8, fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 12 },
  costBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 12 },
  costRow: { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', marginBottom: 4 },
  errBanner: { background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 8 },
  btnRow: { display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 },
  saveBtn: { height: 44, padding: '0 24px', background: '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { height: 44, padding: '0 20px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}
