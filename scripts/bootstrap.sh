#!/usr/bin/env bash
# One-shot local setup for Shindig. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null || { echo "Missing $1. $2"; exit 1; }; }
need node "Install Node 22+ (brew install node@22)."
need pnpm "Run: corepack enable && corepack prepare pnpm@10 --activate"
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || { echo "Node 22+ required"; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  # macOS and Linux sed differ; use a temp file.
  for key in SESSION_SECRET TOKEN_ENCRYPTION_KEY; do
    val=$(openssl rand -base64 32)
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' .env > .env.tmp && mv .env.tmp .env
  done
  echo "Created .env with fresh secrets. Add ANTHROPIC_API_KEY and Pinterest keys when you have them."
fi
ln -sf ../../.env packages/db/.env

if command -v docker >/dev/null && ! (docker compose ps 2>/dev/null | grep -q postgres); then
  docker compose up -d postgres
  echo "Waiting for Postgres…"
  until docker compose exec -T postgres pg_isready -U shindig >/dev/null 2>&1; do sleep 1; done
fi

pnpm install
pnpm --filter @shindig/core build
pnpm --filter @shindig/db generate
pnpm db:migrate --name init
pnpm --filter @shindig/db build
pnpm db:seed

echo
echo "Ready. Run: pnpm dev   → http://localhost:3000"
