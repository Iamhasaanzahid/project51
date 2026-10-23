#!/usr/bin/env bash
# Create local-only secret files referenced by deploy/docker-compose.yml.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="$ROOT_DIR/deploy/secrets"
mkdir -p "$SECRETS_DIR"

if [[ ! -f "$SECRETS_DIR/grafana_admin" ]]; then
  openssl rand -base64 32 > "$SECRETS_DIR/grafana_admin"
  chmod 600 "$SECRETS_DIR/grafana_admin"
  echo "Created $SECRETS_DIR/grafana_admin"
fi

echo "Local secrets ready (ignored by git)."
