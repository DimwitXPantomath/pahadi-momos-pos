-- ============================================================
-- taste_profiles is reachable only through these two RPCs (see
-- 022's header comment for why: Firebase-authenticated customers,
-- not Supabase Auth, so auth.uid() can't scope rows to "theirs").
-- Both take customer_uid as an explicit parameter — same bearer-by-
-- opaque-id pattern already used for order tracking and stamp cards.
-- ============================================================

CREATE OR REPLACE FUNCTION get_taste_profile(p_customer_uid TEXT) RETURNS taste_profiles AS $$
  SELECT * FROM taste_profiles WHERE customer_uid = p_customer_uid;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_taste_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_taste_profile(TEXT) TO anon, authenticated;


CREATE OR REPLACE FUNCTION upsert_taste_profile(
  p_customer_uid              TEXT,
  p_phone                     TEXT DEFAULT NULL,
  p_dietary_type              TEXT DEFAULT NULL,
  p_allergens                 TEXT[] DEFAULT NULL,
  p_spice_tolerance           SMALLINT DEFAULT NULL,
  p_calorie_awareness         TEXT DEFAULT NULL,
  p_budget_sensitivity        TEXT DEFAULT NULL,
  p_cuisine_preferences       TEXT[] DEFAULT NULL,
  p_cooking_type_preferences  TEXT[] DEFAULT NULL,
  p_meal_course_preferences   TEXT[] DEFAULT NULL,
  p_flavor_preferences        TEXT[] DEFAULT NULL,
  p_texture_preference        TEXT DEFAULT NULL,
  p_portion_preference        TEXT DEFAULT NULL,
  p_health_goal               TEXT DEFAULT NULL,
  p_mark_completed            BOOLEAN DEFAULT false
) RETURNS taste_profiles AS $$
DECLARE
  v_result taste_profiles;
BEGIN
  IF p_customer_uid IS NULL OR length(trim(p_customer_uid)) = 0 THEN
    RAISE EXCEPTION 'customer_uid is required';
  END IF;

  INSERT INTO taste_profiles (
    customer_uid, phone, dietary_type, allergens, spice_tolerance,
    calorie_awareness, budget_sensitivity, cuisine_preferences,
    cooking_type_preferences, meal_course_preferences, flavor_preferences,
    texture_preference, portion_preference, health_goal, completed_at
  ) VALUES (
    p_customer_uid, p_phone, p_dietary_type, p_allergens, p_spice_tolerance,
    p_calorie_awareness, p_budget_sensitivity, p_cuisine_preferences,
    p_cooking_type_preferences, p_meal_course_preferences, p_flavor_preferences,
    p_texture_preference, p_portion_preference, p_health_goal,
    CASE WHEN p_mark_completed THEN NOW() ELSE NULL END
  )
  ON CONFLICT (customer_uid) DO UPDATE SET
    phone                    = COALESCE(EXCLUDED.phone, taste_profiles.phone),
    dietary_type             = COALESCE(EXCLUDED.dietary_type, taste_profiles.dietary_type),
    allergens                = COALESCE(EXCLUDED.allergens, taste_profiles.allergens),
    spice_tolerance          = COALESCE(EXCLUDED.spice_tolerance, taste_profiles.spice_tolerance),
    calorie_awareness        = COALESCE(EXCLUDED.calorie_awareness, taste_profiles.calorie_awareness),
    budget_sensitivity       = COALESCE(EXCLUDED.budget_sensitivity, taste_profiles.budget_sensitivity),
    cuisine_preferences      = COALESCE(EXCLUDED.cuisine_preferences, taste_profiles.cuisine_preferences),
    cooking_type_preferences = COALESCE(EXCLUDED.cooking_type_preferences, taste_profiles.cooking_type_preferences),
    meal_course_preferences  = COALESCE(EXCLUDED.meal_course_preferences, taste_profiles.meal_course_preferences),
    flavor_preferences       = COALESCE(EXCLUDED.flavor_preferences, taste_profiles.flavor_preferences),
    texture_preference       = COALESCE(EXCLUDED.texture_preference, taste_profiles.texture_preference),
    portion_preference       = COALESCE(EXCLUDED.portion_preference, taste_profiles.portion_preference),
    health_goal              = COALESCE(EXCLUDED.health_goal, taste_profiles.health_goal),
    completed_at             = CASE WHEN p_mark_completed THEN NOW() ELSE taste_profiles.completed_at END,
    updated_at                = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION upsert_taste_profile(TEXT, TEXT, TEXT, TEXT[], SMALLINT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_taste_profile(TEXT, TEXT, TEXT, TEXT[], SMALLINT, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
