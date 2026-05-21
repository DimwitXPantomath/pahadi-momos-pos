import { useEffect, useState } from 'react'
import { useRecipes } from '@/hooks/useRecipes'
import { useSubRecipes } from '@/hooks/useSubRecipes'
import { useIngredients } from '@/hooks/useIngredients'
import RecipeForm from '@/components/recipes/RecipeForm'
import type { RecipeWithItems, RecipeFormData } from '@/types/recipe'
import { formatCurrency } from '@/lib/utils'
import { useMenu } from '@/hooks/useMenu'

type DialogState =
  | { mode: 'add' }
  | { mode: 'edit'; recipe: RecipeWithItems }
  | null

export default function RecipesPage() {
  const { recipes, loading, error, refreshRecipes, createRecipe, updateRecipe, deleteRecipe } =
    useRecipes()
  const { subRecipes, refreshSubRecipes } = useSubRecipes()
  const { ingredients, refreshIngredients } = useIngredients()
  const { menuItems, fetchMenu } = useMenu()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecipeWithItems | null>(null)
  const [opError, setOpError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    refreshRecipes()
    refreshSubRecipes()
    refreshIngredients()
    fetchMenu()
  }, [refreshRecipes, refreshSubRecipes, refreshIngredients, fetchMenu])

  async function handleSave(data: RecipeFormData) {
    setOpError('')
    if (dialog?.mode === 'edit') {
      await updateRecipe(dialog.recipe.id, data)
      flash('Recipe updated!')
    } else {
      await createRecipe(data)
      flash('Recipe created!')
    }
    setDialog(null)
  }

  async function handleDelete(rec: RecipeWithItems) {
    setOpError('')
    try {
      await deleteRecipe(rec.id)
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

  function menuItemName(id?: string | null) {
    if (!id) return '—'
    return menuItems.find(m => m.id === id)?.name ?? '—'
  }

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>📖 Recipes</h2>
          <p style={s.subtitle}>
            Link menu items to ingredients & sub-recipes · auto-calculates cost
          </p>
        </div>
        <button style={s.addBtn} onClick={() => setDialog({ mode: 'add' })}>
          + New Recipe
        </button>
      </div>

      {(error || opError) && (
        <div style={s.errBanner}>⚠️ {error || opError}</div>
      )}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {/* ── List ── */}
      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : recipes.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No recipes yet</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
            Create your first recipe to track costs against menu items
          </div>
        </div>
      ) : (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Name', 'Linked Menu Item', 'Total Cost', '# Components', ''].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recipes.map((rec, i) => {
                const ingItems = rec.items.filter(it => it.item_type === 'ingredient')
                const srItems = rec.items.filter(it => it.item_type === 'sub_recipe')
                const ingCost = ingItems.reduce((s, it) => s + it.calculated_cost, 0)
                const srCost = srItems.reduce((s, it) => s + it.calculated_cost, 0)
                const menuItem = menuItems.find(m => m.id === rec.menu_item_id)

                return (
                  <>
                    <tr
                      key={rec.id}
                      style={{ background: i % 2 === 0 ? 'white' : '#f9fafb', cursor: 'pointer' }}
                      onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                    >
                      <td style={{ ...s.td, fontWeight: 600 }}>
                        <span style={{ marginRight: 6 }}>
                          {expanded === rec.id ? '▾' : '▸'}
                        </span>
                        {rec.name}
                      </td>
                      <td style={s.td}>
                        {menuItem ? (
                          <span>
                            {menuItem.name}
                            <span style={{ color: '#6b7280', marginLeft: 6 }}>
                              · ₹{menuItem.price}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>Not linked</span>
                        )}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>
                        {formatCurrency(rec.total_cost)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <span style={s.countBadge}>{rec.items.length}</span>
                      </td>
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            style={s.editBtn}
                            onClick={() => setDialog({ mode: 'edit', recipe: rec })}
                          >
                            ✏️
                          </button>
                          <button style={s.deleteBtn} onClick={() => setDeleteTarget(rec)}>🗑️</button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded breakdown */}
                    {expanded === rec.id && (
                      <tr key={`${rec.id}-expanded`}>
                        <td colSpan={5} style={{ padding: 0, background: '#f8fafc' }}>
                          <div style={{ padding: '12px 16px 12px 48px' }}>

                            {ingItems.length > 0 && (
                              <>
                                <div style={s.breakdownSection}>Direct Ingredients</div>
                                <table style={{ ...s.table, marginBottom: 8 }}>
                                  <tbody>
                                    {ingItems.map(item => (
                                      <tr key={item.id}>
                                        <td style={{ ...s.td, fontSize: 12 }}>
                                          {item.ingredient?.name ?? item.ingredient_id}
                                          <span style={{ color: '#9ca3af', marginLeft: 6 }}>
                                            ({item.ingredient?.base_unit ?? item.unit})
                                          </span>
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>
                                          {item.quantity_used} {item.unit}
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right', fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                                          {formatCurrency(item.calculated_cost)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}

                            {srItems.length > 0 && (
                              <>
                                <div style={s.breakdownSection}>Sub-Recipes</div>
                                <table style={{ ...s.table, marginBottom: 8 }}>
                                  <tbody>
                                    {srItems.map(item => (
                                      <tr key={item.id}>
                                        <td style={{ ...s.td, fontSize: 12 }}>
                                          {item.sub_recipe?.name ?? item.sub_recipe_id}
                                          <span style={{ color: '#9ca3af', marginLeft: 6 }}>
                                            ({item.sub_recipe?.yield_unit ?? item.unit})
                                          </span>
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>
                                          {item.quantity_used} {item.unit}
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right', fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                                          {formatCurrency(item.calculated_cost)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}

                            <div style={s.costSummary}>
                              {ingItems.length > 0 && (
                                <span>Ingredients: {formatCurrency(ingCost)}</span>
                              )}
                              {srItems.length > 0 && (
                                <span style={{ marginLeft: 16 }}>Sub-Recipes: {formatCurrency(srCost)}</span>
                              )}
                              <span style={{ marginLeft: 16, fontWeight: 700, color: '#16a34a' }}>
                                Total: {formatCurrency(ingCost + srCost)}
                              </span>
                              {menuItem && (
                                <span style={{ marginLeft: 16, color: '#6b7280' }}>
                                  Margin: {menuItem.price > 0
                                    ? `${(((menuItem.price - ingCost - srCost) / menuItem.price) * 100).toFixed(1)}%`
                                    : '—'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New / Edit Dialog ── */}
      {dialog && (
        <div style={s.overlay} onClick={() => setDialog(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>
              {dialog.mode === 'edit' ? `Edit: ${dialog.recipe.name}` : 'New Recipe'}
            </h3>
            <RecipeForm
              onSave={handleSave}
              onCancel={() => setDialog(null)}
              ingredients={ingredients}
              subRecipes={subRecipes}
              menuItems={menuItems}
              initial={dialog.mode === 'edit' ? dialog.recipe : undefined}
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
              This will remove the recipe and all its components.
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
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, maxWidth: 500 },
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
  breakdownSection: { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, marginTop: 8 },
  costSummary: { fontSize: 12, color: '#374151', paddingTop: 8, borderTop: '1px solid #e5e7eb', marginTop: 4 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modal: { background: 'white', borderRadius: 14, padding: '24px', maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 17, fontWeight: 700, color: '#111', margin: '0 0 20px' },
  cancelBtn: { height: 40, padding: '0 20px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  deleteConfirmBtn: { height: 40, padding: '0 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
