import { useState, useCallback } from 'react'
import type {
  Ingredient,
  SubRecipeWithItems,
  RecipeWithItems,
  RecipeFormData,
  RecipeItemType,
} from '@/types/recipe'
import type { MenuItem } from '@/types/pos'
import { calcRecipeCost } from '@/lib/recipeCosting'
import { formatCurrency } from '@/lib/utils'

interface IngRow {
  ingredient_id: string
  quantity_used: string
  unit: string
}

interface SrRow {
  sub_recipe_id: string
  quantity_used: string
  unit: string
}

interface Props {
  onSave: (data: RecipeFormData) => Promise<void>
  onCancel: () => void
  ingredients: Ingredient[]
  subRecipes: SubRecipeWithItems[]
  menuItems?: MenuItem[]
  initial?: RecipeWithItems
}

export default function RecipeForm({
  onSave,
  onCancel,
  ingredients,
  subRecipes,
  menuItems = [],
  initial,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [menuItemId, setMenuItemId] = useState(initial?.menu_item_id ?? '')
  const [ingRows, setIngRows] = useState<IngRow[]>(
    initial?.items
      .filter(i => i.item_type === 'ingredient')
      .map(i => ({
        ingredient_id: i.ingredient_id ?? '',
        quantity_used: String(i.quantity_used),
        unit: i.unit,
      })) ?? [{ ingredient_id: '', quantity_used: '', unit: 'g' }]
  )
  const [srRows, setSrRows] = useState<SrRow[]>(
    initial?.items
      .filter(i => i.item_type === 'sub_recipe')
      .map(i => ({
        sub_recipe_id: i.sub_recipe_id ?? '',
        quantity_used: String(i.quantity_used),
        unit: i.unit,
      })) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // ── Live cost calc ────────────────────────────────────────────────
  const ingInputs = ingRows
    .filter(r => r.ingredient_id && Number(r.quantity_used) > 0)
    .map(r => {
      const ing = ingredients.find(i => i.id === r.ingredient_id)
      return {
        item_type: 'ingredient' as RecipeItemType,
        quantity_used: Number(r.quantity_used),
        cost_per_base_unit: ing?.cost_per_base_unit ?? 0,
      }
    })

  const srInputs = srRows
    .filter(r => r.sub_recipe_id && Number(r.quantity_used) > 0)
    .map(r => {
      const sr = subRecipes.find(s => s.id === r.sub_recipe_id)
      return {
        item_type: 'sub_recipe' as RecipeItemType,
        quantity_used: Number(r.quantity_used),
        sub_recipe_cost_per_unit: sr?.cost_per_unit ?? 0,
      }
    })

  const ingCost = calcRecipeCost(ingInputs)
  const srCost = calcRecipeCost(srInputs)
  const totalCost = ingCost + srCost

  // ── Row helpers ───────────────────────────────────────────────────
  const addIngRow = useCallback(() => {
    setIngRows(prev => [...prev, { ingredient_id: '', quantity_used: '', unit: 'g' }])
  }, [])

  const removeIngRow = useCallback((idx: number) => {
    setIngRows(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const setIngRow = useCallback(
    (idx: number, field: keyof IngRow, value: string) => {
      setIngRows(prev =>
        prev.map((r, i) => {
          if (i !== idx) return r
          const updated = { ...r, [field]: value }
          if (field === 'ingredient_id') {
            const ing = ingredients.find(ing => ing.id === value)
            if (ing) updated.unit = ing.base_unit
          }
          return updated
        })
      )
    },
    [ingredients]
  )

  const addSrRow = useCallback(() => {
    setSrRows(prev => [...prev, { sub_recipe_id: '', quantity_used: '', unit: 'g' }])
  }, [])

  const removeSrRow = useCallback((idx: number) => {
    setSrRows(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const setSrRow = useCallback(
    (idx: number, field: keyof SrRow, value: string) => {
      setSrRows(prev =>
        prev.map((r, i) => {
          if (i !== idx) return r
          const updated = { ...r, [field]: value }
          if (field === 'sub_recipe_id') {
            const sr = subRecipes.find(s => s.id === value)
            if (sr) updated.unit = sr.yield_unit
          }
          return updated
        })
      )
    },
    [subRecipes]
  )

  // ── Save ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) { setErr('Recipe name is required'); return }

    const allItems = [...ingRows, ...srRows]
    const hasItems = allItems.some(r => {
      const id = 'ingredient_id' in r ? r.ingredient_id : r.sub_recipe_id
      return id && Number(r.quantity_used) > 0
    })
    if (!hasItems) { setErr('Add at least one ingredient or sub-recipe'); return }

    for (const r of ingRows) {
      if (r.ingredient_id && Number(r.quantity_used) <= 0) {
        setErr('All ingredient quantities must be > 0')
        return
      }
    }
    for (const r of srRows) {
      if (r.sub_recipe_id && Number(r.quantity_used) <= 0) {
        setErr('All sub-recipe quantities must be > 0')
        return
      }
    }

    // Duplicate check
    const ingIds = ingRows.filter(r => r.ingredient_id).map(r => r.ingredient_id)
    if (new Set(ingIds).size !== ingIds.length) {
      setErr('Duplicate ingredients in the same recipe')
      return
    }
    const srIds = srRows.filter(r => r.sub_recipe_id).map(r => r.sub_recipe_id)
    if (new Set(srIds).size !== srIds.length) {
      setErr('Duplicate sub-recipes in the same recipe')
      return
    }

    const items: RecipeFormData['items'] = [
      ...ingRows
        .filter(r => r.ingredient_id && Number(r.quantity_used) > 0)
        .map(r => ({
          item_type: 'ingredient' as RecipeItemType,
          ingredient_id: r.ingredient_id,
          quantity_used: Number(r.quantity_used),
          unit: r.unit,
        })),
      ...srRows
        .filter(r => r.sub_recipe_id && Number(r.quantity_used) > 0)
        .map(r => ({
          item_type: 'sub_recipe' as RecipeItemType,
          sub_recipe_id: r.sub_recipe_id,
          quantity_used: Number(r.quantity_used),
          unit: r.unit,
        })),
    ]

    setSaving(true)
    setErr('')
    try {
      await onSave({ name, menu_item_id: menuItemId || undefined, items })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.wrap}>
      {/* Name + Menu Item */}
      <div style={s.grid2}>
        <div style={s.field}>
          <label style={s.label}>Recipe Name *</label>
          <input
            style={s.input}
            placeholder="e.g. Tiramisu (single serving)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>Linked Menu Item (optional)</label>
          <select
            style={s.input}
            value={menuItemId}
            onChange={e => setMenuItemId(e.target.value)}
          >
            <option value="">— None —</option>
            {menuItems.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} · ₹{m.price}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Direct Ingredients */}
      <div style={s.sectionHead}>Direct Ingredients</div>

      {ingRows.map((row, idx) => {
        const ing = ingredients.find(i => i.id === row.ingredient_id)
        const lineCost = ing ? ing.cost_per_base_unit * (Number(row.quantity_used) || 0) : 0
        return (
          <div key={idx} style={s.rowWrap}>
            <div style={{ flex: 2 }}>
              <select
                style={s.input}
                value={row.ingredient_id}
                onChange={e => setIngRow(idx, 'ingredient_id', e.target.value)}
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
                onChange={e => setIngRow(idx, 'quantity_used', e.target.value)}
              />
            </div>
            <div style={{ flex: 0.6 }}>
              <input
                style={{ ...s.input, background: '#f3f4f6', color: '#6b7280' }}
                value={ing?.base_unit ?? row.unit}
                readOnly
              />
            </div>
            {lineCost > 0 && <span style={s.lineCost}>{formatCurrency(lineCost)}</span>}
            <button style={s.removeBtn} onClick={() => removeIngRow(idx)}>✕</button>
          </div>
        )
      })}

      <button style={s.addRowBtn} onClick={addIngRow}>+ Add Ingredient</button>

      {/* Sub-Recipes */}
      <div style={{ ...s.sectionHead, marginTop: 8 }}>Sub-Recipes</div>

      {srRows.length === 0 && (
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>No sub-recipes added yet.</p>
      )}

      {srRows.map((row, idx) => {
        const sr = subRecipes.find(s => s.id === row.sub_recipe_id)
        const lineCost = sr ? sr.cost_per_unit * (Number(row.quantity_used) || 0) : 0
        return (
          <div key={idx} style={s.rowWrap}>
            <div style={{ flex: 2 }}>
              <select
                style={s.input}
                value={row.sub_recipe_id}
                onChange={e => setSrRow(idx, 'sub_recipe_id', e.target.value)}
              >
                <option value="">— Select sub-recipe —</option>
                {subRecipes.map(sr => (
                  <option key={sr.id} value={sr.id}>
                    {sr.name} ({sr.yield_unit}) · {formatCurrency(sr.cost_per_unit)}/{sr.yield_unit}
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
                onChange={e => setSrRow(idx, 'quantity_used', e.target.value)}
              />
            </div>
            <div style={{ flex: 0.6 }}>
              <input
                style={{ ...s.input, background: '#f3f4f6', color: '#6b7280' }}
                value={sr?.yield_unit ?? row.unit}
                readOnly
              />
            </div>
            {lineCost > 0 && <span style={s.lineCost}>{formatCurrency(lineCost)}</span>}
            <button style={s.removeBtn} onClick={() => removeSrRow(idx)}>✕</button>
          </div>
        )
      })}

      <button style={s.addRowBtn} onClick={addSrRow}>+ Add Sub-Recipe</button>

      {/* Cost Summary */}
      {(ingInputs.length > 0 || srInputs.length > 0) && (
        <div style={s.costBox}>
          {ingInputs.length > 0 && (
            <div style={s.costRow}>
              <span style={{ color: '#6b7280' }}>Ingredients Cost</span>
              <span>{formatCurrency(ingCost)}</span>
            </div>
          )}
          {srInputs.length > 0 && (
            <div style={s.costRow}>
              <span style={{ color: '#6b7280' }}>Sub-Recipes Cost</span>
              <span>{formatCurrency(srCost)}</span>
            </div>
          )}
          <div style={{ ...s.costRow, borderTop: '1px solid #bbf7d0', paddingTop: 8, marginTop: 4 }}>
            <strong>TOTAL COST</strong>
            <strong style={{ color: '#16a34a', fontSize: 16 }}>{formatCurrency(totalCost)}</strong>
          </div>
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
          {saving ? 'Saving…' : initial ? 'Update Recipe' : 'Create Recipe'}
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
  addRowBtn: { height: 36, padding: '0 14px', background: 'transparent', border: '1.5px dashed #d1d5db', borderRadius: 8, fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 8 },
  costBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 12, marginTop: 4 },
  costRow: { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#374151', marginBottom: 4 },
  errBanner: { background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 8 },
  btnRow: { display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 },
  saveBtn: { height: 44, padding: '0 24px', background: '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { height: 44, padding: '0 20px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}
