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
