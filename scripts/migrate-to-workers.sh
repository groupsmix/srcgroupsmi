#!/usr/bin/env bash
# migrate-to-workers.sh — Interactive helper for the Pages → Workers cutover.
#
# This script walks you through:
#   1. Creating KV namespaces (STORE_KV, RATE_LIMIT_KV) + preview counterparts
#   2. Setting every required + optional secret via `wrangler secret put`
#   3. Doing a dry-run deploy to verify the bundle
#   4. Deploying the Worker
#
# Prerequisites:
#   - `npx wrangler whoami` shows you're logged in
#   - `npm run build` has been run (or this script runs it for you)
#
# Usage:
#   chmod +x scripts/migrate-to-workers.sh
#   ./scripts/migrate-to-workers.sh

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}[ OK ]${NC}  %s\n" "$1"; }
err()   { printf "${RED}[ERR]${NC}   %s\n" "$1"; }

# ── Pre-flight checks ────────────────────────────────────────────────

info "Checking wrangler authentication..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  err "Not logged in to Cloudflare. Run: npx wrangler login"
  exit 1
fi
ok "Authenticated with Cloudflare"

# ── Step 1: KV Namespaces ────────────────────────────────────────────

echo ""
info "=== Step 1/4: KV Namespaces ==="
echo ""

create_kv() {
  local name="$1"
  local is_preview="${2:-false}"

  local cmd="npx wrangler kv namespace create $name"
  if [ "$is_preview" = "true" ]; then
    cmd="$cmd --preview"
  fi

  info "Running: $cmd"
  local output
  if output=$($cmd 2>&1); then
    ok "Created $name$([ "$is_preview" = "true" ] && echo " (preview)" || echo "")"
    # Extract the namespace ID from the output
    local ns_id
    ns_id=$(echo "$output" | grep -oP 'id\s*=\s*"\K[^"]+' || echo "")
    if [ -n "$ns_id" ]; then
      echo "   Namespace ID: $ns_id"
      echo "   Paste this into wrangler.toml in the corresponding [[kv_namespaces]] block."
    fi
    echo "$output"
  else
    warn "Could not create $name — it may already exist. Output:"
    echo "$output"
  fi
  echo ""
}

read -rp "Create KV namespaces now? (y/N) " yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
  create_kv "STORE_KV"
  create_kv "STORE_KV" "true"
  create_kv "RATE_LIMIT_KV"
  create_kv "RATE_LIMIT_KV" "true"
  echo ""
  warn "Remember to uncomment the [[kv_namespaces]] blocks in wrangler.toml"
  warn "and paste the IDs printed above."
else
  info "Skipping KV namespace creation."
fi

# ── Step 2: Secrets ──────────────────────────────────────────────────

echo ""
info "=== Step 2/4: Secrets ==="
echo ""

REQUIRED_SECRETS=(
  "CRON_SECRET"
  "SUPABASE_URL"
  "SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_KEY"
  "TURNSTILE_SECRET_KEY"
  "GROQ_API_KEY"
  "OPENROUTER_API_KEY"
  "LEMONSQUEEZY_API_KEY"
  "LEMONSQUEEZY_STORE_ID"
  "LEMONSQUEEZY_WEBHOOK_SECRET"
)

OPTIONAL_SECRETS=(
  "RESEND_API_KEY"
  "CONTACT_EMAIL_TO"
  "SENTRY_DSN_EDGE"
  "SENTRY_ENVIRONMENT"
  "SENTRY_RELEASE"
  "AI_QUOTA_DAILY_LIMIT"
)

set_secret() {
  local name="$1"
  local required="$2"

  local label="[required]"
  [ "$required" = "false" ] && label="[optional]"

  read -rp "Set $name $label? (y/N) " yn
  if [[ "$yn" =~ ^[Yy]$ ]]; then
    info "Running: npx wrangler secret put $name"
    npx wrangler secret put "$name"
    echo ""
  fi
}

info "Required secrets (handlers fail closed without these):"
echo ""
for secret in "${REQUIRED_SECRETS[@]}"; do
  set_secret "$secret" "true"
done

echo ""
info "Optional secrets:"
echo ""
for secret in "${OPTIONAL_SECRETS[@]}"; do
  set_secret "$secret" "false"
done

# ── Step 3: Build + Dry-Run ──────────────────────────────────────────

echo ""
info "=== Step 3/4: Build + Dry-Run Deploy ==="
echo ""

read -rp "Run build + dry-run deploy now? (Y/n) " yn
if [[ ! "$yn" =~ ^[Nn]$ ]]; then
  info "Building..."
  npm run build
  echo ""
  info "Dry-run deploying..."
  npx wrangler deploy --dry-run
  ok "Dry-run succeeded! The Worker bundles correctly."
else
  info "Skipping build + dry-run."
fi

# ── Step 4: Deploy ───────────────────────────────────────────────────

echo ""
info "=== Step 4/4: Deploy ==="
echo ""

read -rp "Deploy the Worker to Cloudflare now? (y/N) " yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
  info "Deploying..."
  npx wrangler deploy
  echo ""
  ok "Worker deployed!"
  echo ""
  info "Next steps:"
  echo "  1. Smoke-test on the *.workers.dev URL:"
  echo "     - GET /                  → Astro home page"
  echo "     - GET /api/health-check  → 200 { ok: true }"
  echo "     - GET /sitemap.xml       → valid sitemap"
  echo "  2. Trigger each cron manually and check Worker logs."
  echo "  3. Point groupsmix.com at the Worker (Workers & Pages → Settings → Domains)."
  echo "  4. Keep the old Pages project as rollback until satisfied."
else
  info "Skipping deploy. Run 'npm run worker:deploy' when ready."
fi

echo ""
ok "Migration helper complete!"
