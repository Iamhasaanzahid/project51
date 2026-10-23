-- Tenant schema migration 0001: tenant_id indexes.
-- Applied by scripts/migrate_tenants.py with search_path set to the tenant schema.
CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users (tenant_id);
CREATE INDEX IF NOT EXISTS payment_transactions_tenant_id_idx ON payment_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS render_jobs_tenant_id_idx ON render_jobs (tenant_id);
