# Disaster Recovery Drill Log

This document records the quarterly execution of the Database Restore Drill, which is required to comply with SOC 2 CC9.1 and ISO 22301 standards.
While Supabase provides Point-in-Time Recovery (PITR), relying solely on their infrastructure without a tested alternative off-site is a critical risk.

## Restore Drill Procedure

1. Obtain a cold `pg_dump` from the R2 offsite backup bucket.
2. Spin up a fresh Supabase project (or local Docker instance) to act as the recovery target.
3. Run the restore command:
   ```bash
   psql -h <recovery_host> -U postgres -d postgres < backup.sql
   ```
4. Verify the database state by running a series of smoke tests:
   - Check user count matches expected.
   - Verify `wallet_balance` totals.
   - Verify articles and group posts are readable.
5. Record the Time to Restore (RTO indicator) and any issues encountered.
6. Destroy the recovery target instance.

## Drill Log

| Date | Drill Conductor | Backup Date | Target | Time to Restore (RTO) | Issues Encountered | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-04-25 | Admin | N/A | Local Docker | N/A | Initial creation of the drill log. First drill needs to be scheduled. | PENDING |
