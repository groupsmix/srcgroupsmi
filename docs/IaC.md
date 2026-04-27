# Infrastructure as Code (IaC) Architecture

GroupsMix infrastructure is managed via Terraform to ensure reproducibility, auditability, and drift detection.
State is stored securely in a Cloudflare R2 bucket.

## Managed Resources

### Cloudflare
- **Zone Settings:** DNS records, Page Rules, WAF rules, Bot Management.
- **Workers & KV:** The `groupsmix` Worker, `STORE_KV` and `RATE_LIMIT_KV` namespaces.
- **R2 Storage:** Buckets for logs (`gm-logs`) and IaC state (`gm-terraform-state`).
- **Logpush:** Delivery configuration for Worker Trace Events to R2.
- **Access (Zero Trust):** SSO and MFA policies protecting `/admin/*`.

### Sentry
- **Projects:** `groupsmix-web` and `groupsmix-edge`.
- **Alert Rules:** High error rate thresholds and anomaly detection.

## Setup & Deployment

1. Install Terraform >= 1.5.0
2. Configure environment variables:
   ```bash
   export CLOUDFLARE_API_TOKEN="<token>"
   export CLOUDFLARE_ACCOUNT_ID="<account_id>"
   export SENTRY_AUTH_TOKEN="<token>"
   ```
3. Initialize the backend:
   ```bash
   cd terraform/
   terraform init -backend-config="bucket=gm-terraform-state" -backend-config="region=auto"
   ```
4. Review changes and apply:
   ```bash
   terraform plan
   terraform apply
   ```

*Note: The actual Terraform HCL files are stored in the `terraform/` directory. If any drift is detected during the nightly CI run, an alert is fired.*
