// Deprecated — its createIngredient/updateIngredient functions insert
// columns (base_unit, quantity_per_unit, purchase_cost) that don't exist on
// the real ingredients table (007_ingredient_refactor.sql explicitly drops
// purchase_cost). See the comment at the top of src/types/recipe.ts. Not
// imported anywhere anymore — RecipesView.tsx / SubRecipesView.tsx query
// ingredients directly against the real schema, and IngredientsView.tsx
// (the actual ingredient management screen) always has. Left as a stub
// since this session's shell tool couldn't delete the file outright.
export {}
