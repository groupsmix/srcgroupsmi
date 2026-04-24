-- B-4 Dead letter queue for webhook exceptions
CREATE TABLE IF NOT EXISTS public.webhook_dead_letters (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payload jsonb NOT NULL,
    error_text text,
    created_at timestamptz DEFAULT now()
);

-- Deny all access to public/anon (Service Role only)
ALTER TABLE public.webhook_dead_letters ENABLE ROW LEVEL SECURITY;
