-- Strongly-consistent DB-backed rate limiter for money paths
CREATE TABLE IF NOT EXISTS public.db_rate_limits (
    id text PRIMARY KEY,
    token_count integer NOT NULL,
    reset_at timestamptz NOT NULL
);

-- Deny all access to public/anon (Service Role only)
ALTER TABLE public.db_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_db_rate_limit(p_key text, p_max_tokens integer, p_window_seconds integer)
RETURNS boolean AS $$
DECLARE
    v_now timestamptz := now();
    v_reset timestamptz;
    v_count integer;
BEGIN
    -- Atomic read-modify-write via UPSERT
    INSERT INTO public.db_rate_limits (id, token_count, reset_at)
    VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval)
    ON CONFLICT (id) DO UPDATE SET
        token_count = CASE 
            WHEN public.db_rate_limits.reset_at <= v_now THEN 1 
            ELSE public.db_rate_limits.token_count + 1 
        END,
        reset_at = CASE 
            WHEN public.db_rate_limits.reset_at <= v_now THEN v_now + (p_window_seconds || ' seconds')::interval 
            ELSE public.db_rate_limits.reset_at 
        END
    RETURNING token_count INTO v_count;

    IF v_count > p_max_tokens THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
