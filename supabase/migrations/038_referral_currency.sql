-- 4.3 Referral commission calculation fixes
-- We replaced 'commission' with 'commission_amount' (integer) and 'commission_currency' (text)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'referral_events' AND column_name = 'commission'
    ) THEN
        ALTER TABLE public.referral_events RENAME COLUMN commission TO old_commission_float;
    END IF;
END $$;

ALTER TABLE public.referral_events 
ADD COLUMN IF NOT EXISTS commission_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS commission_currency text DEFAULT 'USD';

