-- 4.2 Subscription state machine is thin
CREATE TABLE IF NOT EXISTS public.subscription_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id text NOT NULL,
    event_name text NOT NULL,
    event_ts timestamptz NOT NULL,
    raw_payload jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscription_events_dedup ON public.subscription_events(order_id, event_name, event_ts);

-- Deny all access to public/anon (Service Role only)
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Derive current subscription state from the append-only ledger
CREATE OR REPLACE VIEW public.vw_subscription_state AS
SELECT DISTINCT ON (order_id)
    order_id,
    event_name,
    event_ts,
    CASE
        WHEN event_name IN ('subscription_cancelled', 'subscription_expired') THEN 'cancelled'
        WHEN event_name = 'subscription_paused' THEN 'paused'
        WHEN event_name IN ('subscription_resumed', 'subscription_unpaused') THEN 'active'
        ELSE 'active'
    END as derived_status
FROM public.subscription_events
ORDER BY order_id, event_ts DESC;
