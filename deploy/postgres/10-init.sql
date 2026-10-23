-- ===========================================================================
-- AI Fabric & Retail SaaS - PostgreSQL bootstrap (runs once, as the admin role)
--
-- This file deliberately contains NO tenant or application tables. The public
-- schema is owned by Alembic (migrations/versions/0001_public_schema.py), and
-- tenant schemas are created by public.provision_tenant().
--
-- The least-privilege login role `aifabric_app` is created by 00-app-role.sh.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_stat_statements unavailable (requires shared_preload_libraries)';
    END;
END $$;

-- Objects created later by the migration/admin role inherit these grants.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifabric_app') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO aifabric_app';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                'GRANT SELECT, INSERT, UPDATE ON TABLES TO aifabric_app';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
                'GRANT USAGE, SELECT ON SEQUENCES TO aifabric_app';
    END IF;
END $$;

-- ------------------------------------------------------------ hardened GUCs
-- Applied per-connection by the app; kept here for documentation/verification.
-- ALTER DATABASE aifabric_prod SET ssl_min_protocol_version = 'TLSv1.3';
-- ALTER DATABASE aifabric_prod SET log_statement = 'ddl';
-- ALTER DATABASE aifabric_prod SET idle_in_transaction_session_timeout = '30s';
