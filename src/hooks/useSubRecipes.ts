import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { SubRecipe, SubRecipeWithItems, SubRecipeFormData } from '@/types/recipe'
import { calcSubRecipeCost } from '@/lib/recipeCosting'

export function useSubRecipes() {
  const [subRecipes, setSubRecipes] = useState<SubRecipeWithItems[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshSubRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: srs, error: err } = await supabase
      .from('sub_recipes')
      .select('*')
      .order('name', { ascending: true })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const enriched: SubRecipeWithItems[] = await Promise.all(
      (srs || []).map(async (sr: SubRecipe) => {
        const { data: itemRows } = await supabase
          .from('sub_recipe_items')
          .select('*, ingredients(id, name, usage_unit, unit, cost_per_usage_unit)')
          .eq('sub_recipe_id', sr.id)

        const items = (itemRows || []).map((row: Record<string, unknown>) => {
          const ing = row.ingredients as Record<string, unknown> | null
          const costPerBase = (ing?.cost_per_usage_unit as number) ?? 0
          const qty = (row.quantity_used as number) ?? 0
          return {
            id: row.id as string,
            sub_recipe_id: row.sub_recipe_id as string,
            ingredient_id: row.ingredient_id as string,
            quantity_used: qty,
            unit: (row.unit as string) ?? '',
            ingredient_cost: costPerBase * qty,
            ingredient: ing
              ? {
                  id: ing.id as string,
                  name: ing.name as string,
                  base_unit: ((ing.usage_unit || ing.unit || 'g') as string) as 'g' | 'ml' | 'pcs',
                  cost_per_base_unit: (ing.cost_per_usage_unit as number) ?? 0,
                }
              : undefined,
          }
        })

        return { ...sr, items }
      })
    )

    setSubRecipes(enriched)
    setLoading(false)
  }, [])

  const createSubRecipe = useCallback(
    async (formData: SubRecipeFormData): Promise<SubRecipe> => {
      const yieldQty = Number(formData.yield_quantity)
      const itemCosts = await fetchIngredientCosts(formData.items.map(i => i.ingredient_id))

      const itemInputs = formData.items.map(i => ({
        ingredient_id: i.ingredient_id,
        quantity_used: Number(i.quantity_used),
        unit: i.unit,
        cost_per_base_unit: itemCosts[i.ingredient_id] ?? 0,
      }))

      const { total_cost, cost_per_unit } = calcSubRecipeCost(itemInputs, yieldQty)

      const { data: sr, error: err } = await supabase
        .from('sub_recipes')
        .insert({
          name: formData.name.trim(),
          yield_quantity: yieldQty,
          yield_unit: formData.yield_unit,
          total_cost,
          cost_per_unit,
          shelf_life_hours: Number(formData.shelf_life_hours) || 24,
        })
        .select()
        .single()

      if (err) throw new Error(err.message)

      if (itemInputs.length > 0) {
        const { error: itemErr } = await supabase.from('sub_recipe_items').insert(
          itemInputs.map(i => ({
            sub_recipe_id: (sr as SubRecipe).id,
            ingredient_id: i.ingredient_id,
            quantity_used: i.quantity_used,
            unit: i.unit,
            ingredient_cost: i.cost_per_base_unit * i.quantity_used,
          }))
        )
        if (itemErr) throw new Error(itemErr.message)
      }

      await refreshSubRecipes()
      return sr as SubRecipe
    },
    [refreshSubRecipes]
  )

  const updateSubRecipe = useCallback(
    async (id: string, formData: SubRecipeFormData): Promise<SubRecipe> => {
      const yieldQty = Number(formData.yield_quantity)
      const itemCosts = await fetchIngredientCosts(formData.items.map(i => i.ingredient_id))

      const itemInputs = formData.items.map(i => ({
        ingredient_id: i.ingredient_id,
        quantity_used: Number(i.quantity_used),
        unit: i.unit,
        cost_per_base_unit: itemCosts[i.ingredient_id] ?? 0,
      }))

      const { total_cost, cost_per_unit } = calcSubRecipeCost(itemInputs, yieldQty)

      const { data: sr, error: err } = await supabase
        .from('sub_recipes')
        .update({
          name: formData.name.trim(),
          yield_quantity: yieldQty,
          yield_unit: formData.yield_unit,
          total_cost,
          cost_per_unit,
          shelf_life_hours: Number(formData.shelf_life_hours) || 24,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (err) throw new Error(err.message)

      await supabase.from('sub_recipe_items').delete().eq('sub_recipe_id', id)

      if (itemInputs.length > 0) {
        const { error: itemErr } = await supabase.from('sub_recipe_items').insert(
          itemInputs.map(i => ({
            sub_recipe_id: id,
            ingredient_id: i.ingredient_id,
            quantity_used: i.quantity_used,
            unit: i.unit,
            ingredient_cost: i.cost_per_base_unit * i.quantity_used,
          }))
        )
        if (itemErr) throw new Error(itemErr.message)
      }

      await refreshSubRecipes()
      return sr as SubRecipe
    },
    [refreshSubRecipes]
  )

  const deleteSubRecipe = useCallback(async (id: string): Promise<void> => {
    const { data: refs } = await supabase
      .from('recipe_items')
      .select('id')
      .eq('sub_recipe_id', id)
      .limit(1)

    if (refs && refs.length > 0) {
      throw new Error(
        'Cannot delete: sub-recipe is used in a recipe. Remove it from recipes first.'
      )
    }

    await supabase.from('sub_recipe_items').delete().eq('sub_recipe_id', id)

    const { error: err } = await supabase.from('sub_recipes').delete().eq('id', id)
    if (err) throw new Error(err.message)

    setSubRecipes(prev => prev.filter(sr => sr.id !== id))
  }, [])

  return {
    subRecipes,
    loading,
    error,
    createSubRecipe,
    updateSubRecipe,
    deleteSubRecipe,
    refreshSubRecipes,
  }
}

async function fetchIngredientCosts(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {}
  const { data } = await supabase
    .from('ingredients')
    .select('id, cost_per_base_unit')
    .in('id', ids)
  return Object.fromEntries(
    (data || []).map((i: { id: string; cost_per_base_unit: number }) => [
      i.id,
      i.cost_per_base_unit,
    ])
  )
}
