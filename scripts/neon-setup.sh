#!/usr/bin/env bash
set -euo pipefail

# Litheum Neon sync backend setup.
#
# Stands up the deployed Neon Function with the latest backend code (CORS +
# proof-of-work auth) and seeds the Postgres schema it depends on.
#
# Run after editing hello.ts or the sync schema:
#   bash scripts/neon-setup.sh
#
# The Neon CLI was installed globally (pnpm i -g neon@latest) and the local
# context is already linked to royal-bird-90217763 / production.

cd "$(dirname "$0")/.."

# 1. Bundle + deploy hello.ts as the Neon Function `api`.
echo "Deploying function…"
neon deploy

# 2. Apply the schema (idempotent).
echo "Applying migrations…"
neon psql --file migrations/001_init.sql

echo
echo "Done. Confirm the function's base URL with:"
echo "  neon config status"
echo
echo "Note: set a strong AUTH_SECRET for the function (it currently defaults to"
echo "the insecure 'change-me-in-neon' used to sign sync tokens + POW challenges)."
echo "If your Neon CLI supports it, add it to the function env or .env and redeploy."
echo
echo "If the client's BACKEND_BASE ever needs to differ from the production"
echo "default, set VITE_SYNC_API in .env (see .env.example)."
