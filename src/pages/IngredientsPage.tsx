import { useEffect, useState } from 'react'
import { useIngredients } from '@/hooks/useIngredients'
import IngredientForm from '@/components/recipes/IngredientForm'
import type { Ingredient, IngredientFormData } from '@/types/recipe'
import { formatCurrency, formatQty } from '@/lib/utils'

type DialogState =
  | { mode: 'add' }
  | { mode: 'edit'; ingredient: Ingredient }
  | null

export default function IngredientsPage() {
  const { ingredients, loading, error, refreshIngredients, createIngredient, updateIngredient, deleteIngredient } =
    useIngredients()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null)
  const [search, setSearch] = useState('')
  const [opError, setOpError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { refreshIngredients() }, [refreshIngredients])

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockCount = ingredients.filter(
    i => i.current_stock > 0 && i.current_stock < i.min_stock
  ).length
  const outOfStockCount = ingredients.filter(i => i.current_stock === 0).length

  async function handleSave(data: IngredientFormData) {
    setOpError('')
    if (dialog?.mode === 'edit') {
      await updateIngredient(dialog.ingredient.id, data)
      flash('Ingredient updated!')
    } else {
      await createIngredient(data)
      flash('Ingredient added!')
    }
    setDialog(null)
  }

  async function handleDelete(ing: Ingredient) {
    setOpError('')
    try {
      await deleteIngredient(ing.id)
      setDeleteTarget(null)
      flash('Deleted!')
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Delete failed')
      setDeleteTarget(null)
    }
  }

  function flash(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 2500)
  }

  function stockStatus(i: Ingredient): 'ok' | 'low' | 'out' {
    if (i.current_stock === 0) return 'out'
    if (i.min_stock > 0 && i.current_stock < i.min_stock) return 'low'
    return 'ok'
  }

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🥕 Ingredients</h2>
          <p style={s.subtitle}>Raw material cost tracking with yield and stock levels</p>
        </div>
        <button style={s.addBtn} onClick={() => setDialog({ mode: 'add' })}>
          + Add Ingredient
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={s.statsRow}>
        {[
          { label: 'Total', value: ingredients.length, color: '#111' },
          { label: 'Low Stock', value: lowStockCount, color: '#d97706' },
          { label: 'Out of Stock', value: outOfStockCount, color: '#dc2626' },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {(error || opError) && (
        <div style={s.errBanner}>⚠️ {error || opError}</div>
      )}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {/* ── Table ── */}
      <div style={s.card}>
        <div style={s.tableHeader}>
          <h3 style={s.cardTitle}>All Ingredients</h3>
          <input
            style={{ ...s.input, width: 220, margin: 0 }}
            placeholder="🔍 Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            {search ? 'No ingredients match your search' : 'No ingredients yet. Add your first one!'}
          </div>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Name', 'Base Unit', 'Purchase Unit', 'Cost / Unit', 'Current Stock', 'Min Stock', 'Status', ''].map(
                    h => <th key={h} style={s.th}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ing, i) => {
                  const status = stockStatus(ing)
                  return (
                    <tr key={ing.id} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{ing.name}</td>
                      <td style={s.td}>{ing.base_unit}</td>
                      <td style={s.td}>{ing.purchase_unit}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatCurrency(ing.cost_per_base_unit)} / {ing.base_unit}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatQty(ing.current_stock, ing.base_unit)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>
                        {formatQty(ing.min_stock, ing.base_unit)}
                      </td>
                      <td style={s.td}>
                        {status === 'out' ? (
                          <span style={{ ...s.badge, background: '#fee2e2', color: '#991b1b' }}>Out of Stock</span>
                        ) : status === 'low' ? (
                          <span style={{ ...s.badge, background: '#fef3c7', color: '#92400e' }}>Low Stock</span>
                        ) : (
                          <span style={{ ...s.badge, background: '#dcfce7', color: '#166534' }}>OK</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={s.editBtn} onClick={() => setDialog({ mode: 'edit', ingredient: ing })}>✏️</button>
                          <button style={s.deleteBtn} onClick={() => setDeleteTarget(ing)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Dialog ── */}
      {dialog && (
        <div style={s.overlay} onClick={() => setDialog(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>
              {dialog.mode === 'edit' ? `Edit: ${dialog.ingredient.name}` : 'Add Ingredient'}
            </h3>
            <IngredientForm
              onSave={handleSave}
              onCancel={() => setDialog(null)}
              initial={dialog.mode === 'edit' ? dialog.ingredient : undefined}
            />
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div style={s.overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...s.modal, maxWidth: 360, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              Delete "{deleteTarget.name}"?
            </h3>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
              This will permanently remove the ingredient and its cost data.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button style={s.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                style={{ ...s.deleteConfirmBtn }}
                onClick={() => handleDelete(deleteTarget)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '16px 16px 80px', maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 800, color: '#111', margin: 0 },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  addBtn: { height: 44, padding: '0 20px', background: '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  statsRow: { display: 'flex', gap: 12, marginBottom: 16 },
  statCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', minWidth: 100 },
  card: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#111', margin: 0 },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 12px', background: '#f3f4f6', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#111', whiteSpace: 'nowrap' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 },
  editBtn: { background: '#f3f4f6', border: 'none', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 13 },
  deleteBtn: { background: '#fee2e2', border: 'none', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 13 },
  empty: { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 },
  errBanner: { background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 },
  successBanner: { background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modal: { background: 'white', borderRadius: 14, padding: '24px', maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 17, fontWeight: 700, color: '#111', margin: '0 0 20px' },
  input: { height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111', background: '#fafafa', outline: 'none', boxSizing: 'border-box' },
  cancelBtn: { height: 40, padding: '0 20px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  deleteConfirmBtn: { height: 40, padding: '0 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
