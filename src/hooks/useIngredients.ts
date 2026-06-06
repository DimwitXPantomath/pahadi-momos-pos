import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Ingredient, IngredientFormData } from '@/types/recipe'

export function useIngredients() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshIngredients = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('ingredients')
      .select('*')
      .order('name', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setIngredients((data as Ingredient[]) || [])
    }
    setLoading(false)
  }, [])

  const createIngredient = useCallback(
    async (formData: IngredientFormData): Promise<Ingredient> => {
      const { data, error: err } = await supabase
        .from('ingredients')
        .insert({
          name: formData.name.trim(),
          base_unit: formData.base_unit,
          purchase_unit: formData.purchase_unit,
          quantity_per_unit: Number(formData.quantity_per_unit),
          purchase_cost: Number(formData.purchase_cost),
          min_stock: Number(formData.min_stock),
          current_stock: Number(formData.current_stock),
        })
        .select()
        .single()

      if (err) throw new Error(err.message)

      const created = data as Ingredient
      setIngredients(prev =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      )
      return created
    },
    []
  )

  const updateIngredient = useCallback(
    async (id: string, formData: Partial<IngredientFormData>): Promise<Ingredient> => {
      const payload: Record<string, unknown> = {}
      if (formData.name !== undefined) payload.name = formData.name.trim()
      if (formData.base_unit !== undefined) payload.base_unit = formData.base_unit
      if (formData.purchase_unit !== undefined) payload.purchase_unit = formData.purchase_unit
      if (formData.quantity_per_unit !== undefined)
        payload.quantity_per_unit = Number(formData.quantity_per_unit)
      if (formData.purchase_cost !== undefined)
        payload.purchase_cost = Number(formData.purchase_cost)
      if (formData.min_stock !== undefined) payload.min_stock = Number(formData.min_stock)
      if (formData.current_stock !== undefined)
        payload.current_stock = Number(formData.current_stock)

      const { data, error: err } = await supabase
        .from('ingredients')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (err) throw new Error(err.message)

      const updated = data as Ingredient
      setIngredients(prev => prev.map(i => (i.id === id ? updated : i)))
      return updated
    },
    []
  )

  const deleteIngredient = useCallback(async (id: string): Promise<void> => {
    const { data: subRefs } = await supabase
      .from('sub_recipe_items')
      .select('id')
      .eq('ingredient_id', id)
      .limit(1)

    if (subRefs && subRefs.length > 0) {
      throw new Error(
        'Cannot delete: ingredient is used in a sub-recipe. Remove it from sub-recipes first.'
      )
    }

    const { data: recipeRefs } = await supabase
      .from('recipe_items')
      .select('id')
      .eq('ingredient_id', id)
      .limit(1)

    if (recipeRefs && recipeRefs.length > 0) {
      throw new Error(
        'Cannot delete: ingredient is used in a recipe. Remove it from recipes first.'
      )
    }

    const { error: err } = await supabase.from('ingredients').delete().eq('id', id)
    if (err) throw new Error(err.message)

    setIngredients(prev => prev.filter(i => i.id !== id))
  }, [])

  return {
    ingredients,
    loading,
    error,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    refreshIngredients,
  }
}
