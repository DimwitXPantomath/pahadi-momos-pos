import { useEffect, useState } from 'react'
import { useSubRecipes } from '@/hooks/useSubRecipes'
import { useIngredients } from '@/hooks/useIngredients'
import SubRecipeForm from '@/components/recipes/SubRecipeForm'
import type { SubRecipeWithItems, SubRecipeFormData } from '@/types/recipe'
import { formatCurrency, formatQty } from '@/lib/utils'

type DialogState =
  | { mode: 'add' }
  | { mode: 'edit'; subRecipe: SubRecipeWithItems }
  | null

export default function SubRecipesPage() {
  const { subRecipes, loading, error, refreshSubRecipes, createSubRecipe, updateSubRecipe, deleteSubRecipe } =
    useSubRecipes()
  const { ingredients, refreshIngredients } = useIngredients()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SubRecipeWithItems | null>(null)
  const [opError, setOpError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    refreshSubRecipes()
    refreshIngredients()
  }, [refreshSubRecipes, refreshIngredients])

  async function handleSave(data: SubRecipeFormData) {
    setOpError('')
    if (dialog?.mode === 'edit') {
      await updateSubRecipe(dialog.subRecipe.id, data)
      flash('Sub-recipe updated!')
    } else {
      await createSubRecipe(data)
      flash('Sub-recipe created!')
    }
    setDialog(null)
  }

  async function handleDelete(sr: SubRecipeWithItems) {
    setOpError('')
    try {
      await deleteSubRecipe(sr.id)
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

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🥣 Sub-Recipes</h2>
          <p style={s.subtitle}>
            Reusable prep components · add to any recipe without re-entering ingredients
          </p>
        </div>
        <button style={s.addBtn} onClick={() => setDialog({ mode: 'add' })}>
          + New Sub-Recipe
        </button>
      </div>

      {(error || opError) && (
        <div style={s.errBanner}>⚠️ {error || opError}</div>
      )}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {/* ── List ── */}
      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : subRecipes.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🥣</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No sub-recipes yet</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
            Create your first sub-recipe to use in main recipes
          </div>
        </div>
      ) : (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Name', 'Yield', 'Total Cost', 'Cost / Unit', '# Ingredients', ''].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subRecipes.map((sr, i) => (
                <>
                  <tr
                    key={sr.id}
                    style={{ background: i % 2 === 0 ? 'white' : '#f9fafb', cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === sr.id ? null : sr.id)}
                  >
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      <span style={{ marginRight: 6 }}>
                        {expanded === sr.id ? '▾' : '▸'}
                      </span>
                      {sr.name}
                    </td>
                    <td style={s.td}>
                      {formatQty(sr.yield_quantity, sr.yield_unit)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatCurrency(sr.total_cost)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace', color: '#16a34a', fontWeight: 700 }}>
                      {formatCurrency(sr.cost_per_unit)} / {sr.yield_unit}
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span style={s.countBadge}>{sr.items.length}</span>
                    </td>
                    <td style={s.td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          style={s.editBtn}
                          onClick={() => setDialog({ mode: 'edit', subRecipe: sr })}
                        >
                          ✏️
                        </button>
                        <button style={s.deleteBtn} onClick={() => setDeleteTarget(sr)}>🗑️</button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded ingredient breakdown */}
                  {expanded === sr.id && sr.items.length > 0 && (
                    <tr key={`${sr.id}-expanded`}>
                      <td colSpan={6} style={{ padding: 0, background: '#f8fafc' }}>
                        <table style={{ ...s.table, margin: '0 0 0 32px', width: 'calc(100% - 32px)' }}>
                          <thead>
                            <tr>
                              {['Ingredient', 'Qty Used', 'Cost/Unit', 'Line Cost'].map(h => (
                                <th key={h} style={{ ...s.th, fontSize: 10, background: '#eef2f7' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sr.items.map(item => (
                              <tr key={item.id}>
                                <td style={{ ...s.td, fontSize: 12 }}>
                                  {item.ingredient?.name ?? item.ingredient_id}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>
                                  {formatQty(item.quantity_used, item.unit)}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                                  {item.ingredient
                                    ? `${formatCurrency(item.ingredient.cost_per_base_unit)}/${item.ingredient.base_unit}`
                                    : '—'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                                  {formatCurrency(item.ingredient_cost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New / Edit Dialog ── */}
      {dialog && (
        <div style={s.overlay} onClick={() => setDialog(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>
              {dialog.mode === 'edit' ? `Edit: ${dialog.subRecipe.name}` : 'New Sub-Recipe'}
            </h3>
            <SubRecipeForm
              onSave={handleSave}
              onCancel={() => setDialog(null)}
              ingredients={ingredients}
              initial={dialog.mode === 'edit' ? dialog.subRecipe : undefined}
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
              This will remove the sub-recipe and all its ingredient mappings.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button style={s.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button style={s.deleteConfirmBtn} onClick={() => handleDelete(deleteTarget)}>Delete</button>
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
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, maxWidth: 480 },
  addBtn: { height: 44, padding: '0 20px', background: '#111', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  card: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 12px', background: '#f3f4f6', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#111', whiteSpace: 'nowrap' },
  countBadge: { background: '#e5e7eb', borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 700 },
  editBtn: { background: '#f3f4f6', border: 'none', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 13 },
  deleteBtn: { background: '#fee2e2', border: 'none', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 13 },
  empty: { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 },
  emptyCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '60px 20px', textAlign: 'center', color: '#9ca3af' },
  errBanner: { background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 },
  successBanner: { background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modal: { background: 'white', borderRadius: 14, padding: '24px', maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 17, fontWeight: 700, color: '#111', margin: '0 0 20px' },
  cancelBtn: { height: 40, padding: '0 20px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  deleteConfirmBtn: { height: 40, padding: '0 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
