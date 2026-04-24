-- ═══════════════════════════════════════════════════════════════
-- Migration 031: Harden every SECURITY DEFINER function with an
-- explicit search_path = public, pg_temp.
--
-- Finding F-029 / Epic F-1:
--   A SECURITY DEFINER function runs with the privileges of the
--   function's owner (in our case the Supabase `postgres` role).
--   If the caller controls `search_path`, they can plant a shadow
--   object (e.g. a fake `public.users` in a schema that appears
--   earlier in search_path) and the SECURITY DEFINER body will
--   silently resolve unqualified references to the attacker's
--   object — escalating to the function-owner role.
--
--   Pinning `search_path = public, pg_temp` on every SECURITY
--   DEFINER function closes this class of privilege escalation.
--   `pg_temp` is appended last so that CTEs / temporary tables
--   created inside the function body still work.
--
-- Strategy:
--   1. `ALTER FUNCTION ... SET search_path = public, pg_temp` for
--      every existing SECURITY DEFINER function in `public` that
--      does not already have a `search_path` GUC pinned on it.
--      This is a metadata-only change; function bodies are not
--      rewritten and no downtime is incurred.
--   2. Assert post-condition: zero SECURITY DEFINER functions in
--      `public` may remain without a pinned `search_path`. This is
--      also a forward-guard — if a future migration introduces a
--      new SECURITY DEFINER function and forgets the SET clause,
--      re-running this migration (or the assertion) flags it.
--
-- This migration is idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Backfill search_path on existing SECURITY DEFINER functions
-- ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    fn         RECORD;
    has_sp     BOOLEAN;
    altered    INT := 0;
    skipped    INT := 0;
BEGIN
    FOR fn IN
        SELECT p.oid,
               p.proname,
               pg_get_function_identity_arguments(p.oid) AS args,
               p.proconfig
        FROM   pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public'
          AND  p.prosecdef = TRUE
    LOOP
        has_sp := fn.proconfig IS NOT NULL
              AND EXISTS (
                    SELECT 1
                    FROM   unnest(fn.proconfig) AS cfg
                    WHERE  cfg LIKE 'search_path=%'
                  );

        IF has_sp THEN
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
            fn.proname, fn.args
        );
        altered := altered + 1;
    END LOOP;

    RAISE NOTICE
        'Migration 031: pinned search_path on % SECURITY DEFINER function(s); % already pinned.',
        altered, skipped;
END
$$;

-- ───────────────────────────────────────────────────────────────
-- 2. Post-condition: every SECURITY DEFINER function in public
--    must have a pinned search_path. Fail the migration if not.
-- ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_missing TEXT;
BEGIN
    SELECT string_agg(
               format('%I.%I(%s)', n.nspname, p.proname,
                      pg_get_function_identity_arguments(p.oid)),
               E'\n  '
           )
      INTO v_missing
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = TRUE
       AND NOT (
             p.proconfig IS NOT NULL
             AND EXISTS (
                   SELECT 1
                   FROM   unnest(p.proconfig) AS cfg
                   WHERE  cfg LIKE 'search_path=%'
             )
           );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
            E'Migration 031 post-condition failed: SECURITY DEFINER function(s) without a pinned search_path remain:\n  %',
            v_missing;
    END IF;
END
$$;
