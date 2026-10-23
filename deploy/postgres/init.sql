-- ===========================================================================
-- AI Fabric & Retail SaaS - PostgreSQL bootstrap
--
-- Isolation model: schema-per-tenant + row-level security (defence in depth).
-- The application role (aifabric_app) is NOLOGIN here; it is granted LOGIN via
-- the deployment secret. It is NOT a superuser, cannot create databases/roles,
-- and cannot bypass RLS.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ---------------------------------------------------------------- app role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifabric_app') THEN
        EXECUTE 'CREATE ROLE aifabric_app NOLOGIN NOINHERIT';
    END IF;
END $$;

-- ------------------------------------------------------------ tenant registry
CREATE TABLE IF NOT EXISTS public.tenants (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          varchar(64)  NOT NULL UNIQUE,
    display_name  varchar(200) NOT NULL,
    schema_name   varchar(80)  NOT NULL UNIQUE,
    is_active     boolean      NOT NULL DEFAULT true,
    plan          varchar(32)  NOT NULL DEFAULT 'starter',
    settings      jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.tenants TO aifabric_app;

-- --------------------------------------------------------- append-only audit
CREATE TABLE IF NOT EXISTS public.security_audit (
    id          bigserial PRIMARY KEY,
    ts          timestamptz NOT NULL DEFAULT now(),
    event_type  text        NOT NULL,
    tenant_id   text,
    user_id     text,
    client_ip   inet,
    route       text,
    detail      jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_security_audit_ts ON public.security_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_event ON public.security_audit (event_type, ts DESC);

REVOKE UPDATE, DELETE, TRUNCATE ON public.security_audit FROM aifabric_app;
GRANT INSERT, SELECT ON public.security_audit TO aifabric_app;
GRANT USAGE, SELECT ON SEQUENCE public.security_audit_id_seq TO aifabric_app;

-- ------------------------------------------------------- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------- column-level encryption
-- Call with: SELECT set_config('app.encryption_key', :key, true);
CREATE OR REPLACE FUNCTION public.encrypt_sensitive(plaintext text) RETURNS bytea AS $$
    SELECT pgp_sym_encrypt(plaintext, current_setting('app.encryption_key'))
$$ LANGUAGE sql STRICT;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive(ciphertext bytea) RETURNS text AS $$
    SELECT pgp_sym_decrypt(ciphertext, current_setting('app.encryption_key'))
$$ LANGUAGE sql STRICT;

-- ------------------------------------------------------------ provisioning
CREATE OR REPLACE FUNCTION public.provision_tenant(
    p_slug   text,
    p_name   text,
    p_plan   text,
    p_schema text
) RETURNS void AS $fn$
DECLARE
    tenant_uuid uuid;
BEGIN
    IF p_schema !~ '^tenant_[a-z0-9_]{1,48}$' THEN
        RAISE EXCEPTION 'invalid schema name';
    END IF;
    IF p_slug !~ '^[a-z0-9][a-z0-9_-]{2,63}$' THEN
        RAISE EXCEPTION 'invalid tenant slug';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = p_slug OR schema_name = p_schema) THEN
        RAISE EXCEPTION 'tenant already exists';
    END IF;

    INSERT INTO public.tenants (slug, display_name, schema_name, plan)
    VALUES (p_slug, p_name, p_schema, p_plan)
    RETURNING id INTO tenant_uuid;

    EXECUTE format('CREATE SCHEMA %I', p_schema);

    -- users -----------------------------------------------------------------
    EXECUTE format($ddl$
        CREATE TABLE %I.users (
            id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id          varchar(64)  NOT NULL,
            email              varchar(320) NOT NULL UNIQUE,
            full_name          varchar(200) NOT NULL,
            password_hash      varchar(255) NOT NULL,
            roles              jsonb        NOT NULL DEFAULT '[]'::jsonb,
            scopes             jsonb        NOT NULL DEFAULT '[]'::jsonb,
            is_active          boolean      NOT NULL DEFAULT true,
            is_system_admin    boolean      NOT NULL DEFAULT false,
            failed_login_count integer      NOT NULL DEFAULT 0,
            locked_until       timestamptz,
            last_login_at      timestamptz,
            token_version      integer      NOT NULL DEFAULT 1,
            created_at         timestamptz  NOT NULL DEFAULT now(),
            updated_at         timestamptz  NOT NULL DEFAULT now()
        )$ddl$, p_schema);

    -- payment ledger --------------------------------------------------------
    EXECUTE format($ddl$
        CREATE TABLE %I.payment_transactions (
            id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id          varchar(64) NOT NULL,
            user_id            varchar(64) NOT NULL,
            provider           varchar(32) NOT NULL,
            provider_reference varchar(128),
            idempotency_key    varchar(128) NOT NULL UNIQUE,
            sku                varchar(64) NOT NULL,
            quantity           integer     NOT NULL DEFAULT 1,
            amount_minor       integer     NOT NULL CHECK (amount_minor > 0),
            currency           varchar(3)  NOT NULL,
            status             varchar(32) NOT NULL DEFAULT 'pending',
            raw_event          jsonb       NOT NULL DEFAULT '{}'::jsonb,
            completed_at       timestamptz,
            created_at         timestamptz NOT NULL DEFAULT now(),
            updated_at         timestamptz NOT NULL DEFAULT now()
        )$ddl$, p_schema);

    EXECUTE format('CREATE INDEX %I ON %I.payment_transactions (status, created_at DESC)',
                   p_schema || '_txn_status_idx', p_schema);

    -- render jobs -----------------------------------------------------------
    EXECUTE format($ddl$
        CREATE TABLE %I.render_jobs (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     varchar(64)  NOT NULL,
            user_id       varchar(64)  NOT NULL,
            status        varchar(32)  NOT NULL DEFAULT 'queued',
            source_s3_key varchar(512),
            result_s3_key varchar(512),
            pipeline      varchar(64)  NOT NULL DEFAULT 'idm_vton_sdxl',
            prompt        varchar(2000) NOT NULL DEFAULT '',
            gpu_seconds   integer      NOT NULL DEFAULT 0,
            error_code    varchar(64),
            metadata_json jsonb        NOT NULL DEFAULT '{}'::jsonb,
            created_at    timestamptz  NOT NULL DEFAULT now(),
            updated_at    timestamptz  NOT NULL DEFAULT now()
        )$ddl$, p_schema);

    -- row-level security ----------------------------------------------------
    EXECUTE format('ALTER TABLE %I.users ENABLE ROW LEVEL SECURITY', p_schema);
    EXECUTE format('ALTER TABLE %I.users FORCE ROW LEVEL SECURITY', p_schema);
    EXECUTE format($pol$
        CREATE POLICY tenant_isolation ON %I.users
        USING (tenant_id = current_setting('app.current_tenant', true))
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true))
    $pol$, p_schema);

    EXECUTE format('ALTER TABLE %I.payment_transactions ENABLE ROW LEVEL SECURITY', p_schema);
    EXECUTE format('ALTER TABLE %I.payment_transactions FORCE ROW LEVEL SECURITY', p_schema);
    EXECUTE format($pol$
        CREATE POLICY tenant_isolation ON %I.payment_transactions
        USING (tenant_id = current_setting('app.current_tenant', true))
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true))
    $pol$, p_schema);

    EXECUTE format('ALTER TABLE %I.render_jobs ENABLE ROW LEVEL SECURITY', p_schema);
    EXECUTE format('ALTER TABLE %I.render_jobs FORCE ROW LEVEL SECURITY', p_schema);
    EXECUTE format($pol$
        CREATE POLICY tenant_isolation ON %I.render_jobs
        USING (tenant_id = current_setting('app.current_tenant', true))
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true))
    $pol$, p_schema);

    -- triggers --------------------------------------------------------------
    EXECUTE format('CREATE TRIGGER trg_users_touch BEFORE UPDATE ON %I.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_schema);
    EXECUTE format('CREATE TRIGGER trg_txn_touch BEFORE UPDATE ON %I.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_schema);
    EXECUTE format('CREATE TRIGGER trg_jobs_touch BEFORE UPDATE ON %I.render_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_schema);

    -- least-privilege grants ------------------------------------------------
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO aifabric_app', p_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA %I TO aifabric_app', p_schema);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text) TO aifabric_app;

-- ------------------------------------------------------------ hardened GUCs
-- Applied per-connection by the app; kept here for documentation/verification.
-- ALTER DATABASE aifabric_prod SET ssl_min_protocol_version = 'TLSv1.3';
-- ALTER DATABASE aifabric_prod SET log_statement = 'ddl';
-- ALTER DATABASE aifabric_prod SET idle_in_transaction_session_timeout = '30s';
