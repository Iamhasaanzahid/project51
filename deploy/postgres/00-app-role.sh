#!/bin/sh
# ===========================================================================
# Docker-entrypoint init script (runs before 10-init.sql).
# Creates the least-privilege application role with a password supplied by
# POSTGRES_APP_PASSWORD. The admin/migration role remains separate.
# ===========================================================================
set -eu

: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE aifabric_app LOGIN PASSWORD %L NOINHERIT', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifabric_app') \gexec
SELECT format('ALTER ROLE aifabric_app WITH LOGIN PASSWORD %L NOINHERIT', :'app_password') \gexec
SQL
