-- 3.3 Audit logging inconsistent: Cover every destructive admin RPC in audit_events

-- 1. Audit trigger for marketplace disputes
CREATE OR REPLACE FUNCTION log_marketplace_dispute_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('resolved_buyer', 'resolved_seller') THEN
        INSERT INTO audit_events (
            event_type,
            table_name,
            record_id,
            actor_auth_id,
            actor_user_id,
            source,
            old_values,
            new_values
        )
        VALUES (
            'marketplace_disputes.resolved',
            'marketplace_disputes',
            NEW.id,
            auth.uid(),
            (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1),
            'trigger:log_marketplace_dispute_resolution',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'resolution_notes', NEW.resolution_notes)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_marketplace_dispute_resolution ON marketplace_disputes;
CREATE TRIGGER trigger_log_marketplace_dispute_resolution
    AFTER UPDATE OF status ON marketplace_disputes
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_marketplace_dispute_resolution();

-- 2. Audit trigger for withdrawals
CREATE OR REPLACE FUNCTION log_withdrawal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO audit_events (
            event_type,
            table_name,
            record_id,
            actor_auth_id,
            actor_user_id,
            source,
            old_values,
            new_values
        )
        VALUES (
            'withdrawals.status_updated',
            'withdrawals',
            NEW.id,
            auth.uid(),
            (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1),
            'trigger:log_withdrawal_status_change',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'admin_notes', NEW.admin_notes)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_withdrawal_status_change ON withdrawals;
CREATE TRIGGER trigger_log_withdrawal_status_change
    AFTER UPDATE OF status ON withdrawals
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_withdrawal_status_change();

-- 3. Audit trigger for pending_groups
CREATE OR REPLACE FUNCTION log_pending_group_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('approved', 'rejected') THEN
        INSERT INTO audit_events (
            event_type,
            table_name,
            record_id,
            actor_auth_id,
            actor_user_id,
            source,
            old_values,
            new_values
        )
        VALUES (
            'pending_groups.status_updated',
            'pending_groups',
            NEW.id,
            auth.uid(),
            (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1),
            'trigger:log_pending_group_approval',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_pending_group_approval ON pending_groups;
CREATE TRIGGER trigger_log_pending_group_approval
    AFTER UPDATE OF status ON pending_groups
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_pending_group_approval();
