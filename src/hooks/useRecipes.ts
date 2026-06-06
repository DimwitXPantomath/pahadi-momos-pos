import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Recipe, RecipeWithItems, RecipeFormData } from '@/types/recipe'
import { calcRecipeCost } from '@/lib/recipeCosting'

export function useRecipes() {
  const [recipes, setRecipes] = useState<RecipeWithItems[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: recs, error: err } = await supabase
      .from('recipes')
      .select('*')
      .order('name', { ascending: true })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const enriched: RecipeWithItems[] = await Promise.all(
      (recs || []).map(async (rec: Recipe) => {
        const { data: itemRows } = await supabase
          .from('recipe_items')
          .select(
            '*, ingredients(id, name, base_unit, cost_per_base_unit), sub_recipes(id, name, yield_unit, cost_per_unit)'
          )
          .eq('recipe_id', rec.id)

        const items = (itemRows || []).map((row: Record<string, unknown>) => {
          const ing = row.ingredients as Record<string, unknown> | null
          const sr = row.sub_recipes as Record<string, unknown> | null
          return {
            id: row.id as string,
            recipe_id: row.recipe_id as string,
            item_type: row.item_type as 'ingredient' | 'sub_recipe',
            ingredient_id: (row.ingredient_id as string) ?? null,
            sub_recipe_id: (row.sub_recipe_id as string) ?? null,
            quantity_used: row.quantity_used as number,
            unit: row.unit as string,
            calculated_cost: row.calculated_cost as number,
            ingredient: ing
              ? {
                  id: ing.id as string,
                  name: ing.name as string,
                  base_unit: ing.base_unit as 'g' | 'ml' | 'pcs',
                  cost_per_base_unit: ing.cost_per_base_unit as number,
                }
              : undefined,
            sub_recipe: sr
              ? {
                  id: sr.id as string,
                  name: sr.name as string,
                  yield_unit: sr.yield_unit as string,
                  cost_per_unit: sr.cost_per_unit as number,
                }
              : undefined,
          }
        })

        return { ...rec, items }
      })
    )

    setRecipes(enriched)
    setLoading(false)
  }, [])

  const createRecipe = useCallback(
    async (formData: RecipeFormData): Promise<Recipe> => {
      const costMap = await fetchCostMap(formData)
      const itemInputs = buildItemInputs(formData, costMap)
      const total_cost = calcRecipeCost(itemInputs)

      const { data: rec, error: err } = await supabase
        .from('recipes')
        .insert({
          name: formData.name.trim(),
          menu_item_id: formData.menu_item_id || null,
          total_cost,
        })
        .select()
        .single()

      if (err) throw new Error(err.message)

      await insertRecipeItems((rec as Recipe).id, formData, itemInputs)
      await refreshRecipes()
      return rec as Recipe
    },
    [refreshRecipes]
  )

  const updateRecipe = useCallback(
    async (id: string, formData: RecipeFormData): Promise<Recipe> => {
      const costMap = await fetchCostMap(formData)
      const itemInputs = buildItemInputs(formData, costMap)
      const total_cost = calcRecipeCost(itemInputs)

      const { data: rec, error: err } = await supabase
        .from('recipes')
        .update({
          name: formData.name.trim(),
          menu_item_id: formData.menu_item_id || null,
          total_cost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (err) throw new Error(err.message)

      await supabase.from('recipe_items').delete().eq('recipe_id', id)
      await insertRecipeItems(id, formData, itemInputs)
      await refreshRecipes()
      return rec as Recipe
    },
    [refreshRecipes]
  )

  const deleteRecipe = useCallback(async (id: string): Promise<void> => {
    await supabase.from('recipe_items').delete().eq('recipe_id', id)
    const { error: err } = await supabase.from('recipes').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }, [])

  const getRecipeByMenuItemId = useCallback(
    (menuItemId: string): RecipeWithItems | undefined => {
      return recipes.find(r => r.menu_item_id === menuItemId)
    },
    [recipes]
  )

  return {
    recipes,
    loading,
    error,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    getRecipeByMenuItemId,
    refreshRecipes,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ItemInput = {
  item_type: 'ingredient' | 'sub_recipe'
  quantity_used: number
  cost_per_base_unit?: number
  sub_recipe_cost_per_unit?: number
}

async function fetchCostMap(formData: RecipeFormData): Promise<Record<string, number>> {
  const ingIds = formData.items
    .filter(i => i.item_type === 'ingredient' && i.ingredient_id)
    .map(i => i.ingredient_id!)

  const srIds = formData.items
    .filter(i => i.item_type === 'sub_recipe' && i.sub_recipe_id)
    .map(i => i.sub_recipe_id!)

  const costMap: Record<string, number> = {}

  if (ingIds.length > 0) {
    const { data } = await supabase
      .from('ingredients')
      .select('id, cost_per_base_unit')
      .in('id', ingIds)
    ;(data || []).forEach((i: { id: string; cost_per_base_unit: number }) => {
      costMap[i.id] = i.cost_per_base_unit
    })
  }

  if (srIds.length > 0) {
    const { data } = await supabase
      .from('sub_recipes')
      .select('id, cost_per_unit')
      .in('id', srIds)
    ;(data || []).forEach((sr: { id: string; cost_per_unit: number }) => {
      costMap[sr.id] = sr.cost_per_unit
    })
  }

  return costMap
}

function buildItemInputs(
  formData: RecipeFormData,
  costMap: Record<string, number>
): ItemInput[] {
  return formData.items.map(item => {
    if (item.item_type === 'ingredient') {
      return {
        item_type: 'ingredient' as const,
        quantity_used: Number(item.quantity_used),
        cost_per_base_unit: costMap[item.ingredient_id ?? ''] ?? 0,
      }
    }
    return {
      item_type: 'sub_recipe' as const,
      quantity_used: Number(item.quantity_used),
      sub_recipe_cost_per_unit: costMap[item.sub_recipe_id ?? ''] ?? 0,
    }
  })
}

async function insertRecipeItems(
  recipeId: string,
  formData: RecipeFormData,
  itemInputs: ItemInput[]
): Promise<void> {
  if (formData.items.length === 0) return

  const payload = formData.items.map((item, i) => {
    const inp = itemInputs[i]
    const cost =
      inp.item_type === 'ingredient'
        ? (inp.cost_per_base_unit ?? 0) * inp.quantity_used
        : (inp.sub_recipe_cost_per_unit ?? 0) * inp.quantity_used

    return {
      recipe_id: recipeId,
      item_type: item.item_type,
      ingredient_id: item.ingredient_id ?? null,
      sub_recipe_id: item.sub_recipe_id ?? null,
      quantity_used: Number(item.quantity_used),
      unit: item.unit,
      calculated_cost: cost,
    }
  })

  const { error } = await supabase.from('recipe_items').insert(payload)
  if (error) throw new Error(error.message)
}
