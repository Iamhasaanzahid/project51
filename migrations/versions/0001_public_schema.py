"""Public schema baseline: tenant registry, audit trail, crypto helpers, provisioning.

Revision ID: 0001_public_schema
Revises:
Create Date: 2026-10-23
"""
from __future__ import annotations

from alembic import op

revision = "0001_public_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ crypto
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        DO $$
        BEGIN
            BEGIN
                CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'pg_stat_statements unavailable (shared_preload_libraries?)';
            END;
        END $$;
        """
    )

    # --------------------------------------------------------- tenant registry
    op.execute(
        """
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
        )
        """
    )

    # ---------------------------------------------------- append-only audit log
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.security_audit (
            id          bigserial PRIMARY KEY,
            ts          timestamptz NOT NULL DEFAULT now(),
            event_type  text        NOT NULL,
            tenant_id   text,
            user_id     text,
            client_ip   inet,
            route       text,
            detail      jsonb       NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_security_audit_ts ON public.security_audit (ts DESC)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_security_audit_event "
        "ON public.security_audit (event_type, ts DESC)"
    )

    # -------------------------------------------------------------- helpers
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
        BEGIN
            NEW.updated_at := now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.encrypt_sensitive(plaintext text) RETURNS bytea AS $$
            SELECT pgp_sym_encrypt(plaintext, current_setting('app.encryption_key'))
        $$ LANGUAGE sql STRICT;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.decrypt_sensitive(ciphertext bytea) RETURNS text AS $$
            SELECT pgp_sym_decrypt(ciphertext, current_setting('app.encryption_key'))
        $$ LANGUAGE sql STRICT;
        """
    )

    # ---------------------------------------------------------- provisioning
    op.execute(
        """
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

            EXECUTE format('CREATE TRIGGER trg_users_touch BEFORE UPDATE ON %I.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_schema);
            EXECUTE format('CREATE TRIGGER trg_txn_touch BEFORE UPDATE ON %I.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_schema);
            EXECUTE format('CREATE TRIGGER trg_jobs_touch BEFORE UPDATE ON %I.render_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_schema);

            EXECUTE format('GRANT USAGE ON SCHEMA %I TO aifabric_app', p_schema);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA %I TO aifabric_app', p_schema);
        END;
        $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;
        """
    )

    # ------------------------------------------------------------- privileges
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifabric_app') THEN
                EXECUTE 'GRANT USAGE ON SCHEMA public TO aifabric_app';
                EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.tenants TO aifabric_app';
                EXECUTE 'GRANT INSERT, SELECT ON public.security_audit TO aifabric_app';
                EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.security_audit FROM aifabric_app';
                EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.security_audit_id_seq TO aifabric_app';
                EXECUTE 'REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text) FROM PUBLIC';
                EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text) TO aifabric_app';
                EXECUTE 'GRANT EXECUTE ON FUNCTION public.encrypt_sensitive(text) TO aifabric_app';
                EXECUTE 'GRANT EXECUTE ON FUNCTION public.decrypt_sensitive(bytea) TO aifabric_app';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.provision_tenant(text, text, text, text)")
    op.execute("DROP FUNCTION IF EXISTS public.encrypt_sensitive(text)")
    op.execute("DROP FUNCTION IF EXISTS public.decrypt_sensitive(bytea)")
    op.execute("DROP FUNCTION IF EXISTS public.touch_updated_at()")
    op.execute("DROP TABLE IF EXISTS public.security_audit")
    op.execute("DROP TABLE IF EXISTS public.tenants")
