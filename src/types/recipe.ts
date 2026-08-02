// Deprecated: this file described a recipe/ingredient schema (item_type,
// calculated_cost, quantity_used, base_unit, cost_per_base_unit, total_cost,
// yield_quantity, yield_unit as a stored column) that was never actually
// created in any Supabase migration — confirmed by grepping every file in
// supabase/migrations/ for these column names with zero matches, and by
// 007_ingredient_refactor.sql explicitly dropping purchase_cost as
// "superseded." Everything that imported these types (RecipesPage.tsx,
// SubRecipesPage.tsx, RecipeForm.tsx, SubRecipeForm.tsx, IngredientForm.tsx,
// useRecipes.ts, useSubRecipes.ts, useIngredients.ts, recipeCosting.ts,
// inventoryDeduction.ts) has been deprecated the same way — none of them are
// imported by the app anymore (see src/pages/Index.tsx, which now renders
// src/components/recipes/RecipesView.tsx and
// src/components/subrecipes/SubRecipesView.tsx instead, built against the
// real schema in 001_initial_schema.sql + 011_recipe_sop_fields.sql).
//
// Left as an inert stub rather than deleted: this session's shell tool was
// unavailable, so the files couldn't be removed from disk. Safe to delete
// the next time you have shell/file-manager access.
export {}
