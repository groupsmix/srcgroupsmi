# Data Retention Schedule

This document outlines the retention policy for data stored within the GroupsMix database, aligning with our RoPA (Record of Processing Activities).

| Data Category | Tables | Retention Period | Deletion Mechanism |
| :--- | :--- | :--- | :--- |
| **Audit Logs** | `audit_events` | 2 Years | Automated cron (`/api/purge-deleted`) |
| **User Accounts** | `users`, `user_profiles` | 30 Days post-deletion | Automated cron (`/api/purge-deleted`) |
| **Notifications** | `notifications` | 90 Days | Automated cron (`/api/purge-deleted`) |
| **Groups & Content** | `groups`, `articles`, `comments` | Indefinite (unless deleted by user) | N/A |
| **DSAR Requests** | `dsar_audit` | 5 Years | Manual / Legal hold |

*Note: Deletions are executed nightly via the `/api/purge-deleted` endpoint triggered by Cloudflare Cron.*
