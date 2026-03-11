-- ============================================================
-- ISSUE #5: GXP Level Update — ensure add_gxp RPC updates level
-- ============================================================
-- The add_gxp RPC increments GXP but must also recalculate the
-- user's level based on CONFIG.levels thresholds:
--   Level 1 (Seedling):  0 GXP
--   Level 2 (Sprout):  100 GXP
--   Level 3 (Tree):    300 GXP
--   Level 4 (Star):    600 GXP
--   Level 5 (Fire):   1000 GXP
--   Level 6 (Diamond): 2000 GXP
--   Level 7 (Crown):  5000 GXP
-- ============================================================

CREATE OR REPLACE FUNCTION add_gxp(p_user_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
DECLARE
    new_gxp INTEGER;
    new_level INTEGER;
    caller_auth_id UUID;
BEGIN
    -- Audit fix #5: authorization check — only the user themselves can award GXP to their own account
    -- (or an admin via service_role key which bypasses RLS)
    caller_auth_id := auth.uid();
    IF caller_auth_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND auth_id = caller_auth_id) THEN
        RAISE EXCEPTION 'Unauthorized: you can only modify your own GXP';
    END IF;

    -- Increment GXP
    UPDATE users
    SET gxp = COALESCE(gxp, 0) + p_amount
    WHERE id = p_user_id
    RETURNING gxp INTO new_gxp;

    -- Calculate new level from thresholds
    new_level := CASE
        WHEN new_gxp >= 5000 THEN 7
        WHEN new_gxp >= 2000 THEN 6
        WHEN new_gxp >= 1000 THEN 5
        WHEN new_gxp >= 600  THEN 4
        WHEN new_gxp >= 300  THEN 3
        WHEN new_gxp >= 100  THEN 2
        ELSE 1
    END;

    -- Update level if changed
    UPDATE users
    SET level = new_level
    WHERE id = p_user_id AND level IS DISTINCT FROM new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
