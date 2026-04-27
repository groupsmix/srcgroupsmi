# Supabase Key Rotation Log

This document tracks the quarterly rotation of the `SUPABASE_SERVICE_KEY` used by Cloudflare Workers.
Until per-role JWTs are fully implemented, rotating the global service key quarterly mitigates the risk of long-term credential leakage.

## Rotation Procedure

1. Go to the Supabase Dashboard -> Project Settings -> API.
2. Click **Generate new secret** under the `service_role` key section.
3. Update the `SUPABASE_SERVICE_KEY` environment variable in Cloudflare Workers:
   - For Production: Update in Cloudflare Dashboard (Workers -> Settings -> Variables).
   - For Staging: Update in Cloudflare Dashboard (or via Wrangler).
4. Verify endpoints are functioning properly using the new key.
5. Delete the old `service_role` key from the Supabase Dashboard.
6. Log the rotation in the table below.

## Rotation History

| Date | Environment | Performed By | Notes |
| :--- | :--- | :--- | :--- |
| 2026-04-25 | Prod/Staging | Admin | Initial documentation of rotation procedure. Need to rotate key this quarter. |
