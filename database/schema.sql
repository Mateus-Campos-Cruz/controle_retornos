-- Plantão Solução - schema PostgreSQL
-- Compatível com PostgreSQL 14+.
-- O frontend atual trabalha em memória; este arquivo representa o modelo
-- persistente recomendado para a versão de produção.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

-- ============================================================
-- Tipos controlados pela aplicação
-- ============================================================

CREATE TYPE app.user_role AS ENUM ('ADMINISTRADOR', 'GESTOR', 'USUARIO');
CREATE TYPE app.conference_status AS ENUM ('PENDENTE', 'SIM', 'NAO');
CREATE TYPE app.contact_type AS ENUM ('LIGACAO', 'PRESENCIAL', 'DIGITAL');
CREATE TYPE app.audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT');

-- ============================================================
-- Identidade e autorização
-- ============================================================

CREATE TABLE app.areas (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(120) NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            varchar(120) NOT NULL,
    email           varchar(254) NOT NULL,
    password_hash   text,
    role            app.user_role NOT NULL DEFAULT 'USUARIO',
    area_id         uuid REFERENCES app.areas(id) ON DELETE SET NULL,
    is_active       boolean NOT NULL DEFAULT true,
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT users_email_not_blank CHECK (length(btrim(email)) > 3)
);

CREATE UNIQUE INDEX users_email_lower_uq ON app.users (lower(email));
CREATE INDEX users_area_idx ON app.users (area_id) WHERE is_active;

-- A sessão real deve ser criada pelo backend após autenticação.
CREATE TABLE app.user_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    token_hash      text NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz,
    CONSTRAINT session_expiration_valid CHECK (expires_at > created_at)
);

CREATE INDEX user_sessions_user_idx ON app.user_sessions (user_id);
CREATE INDEX user_sessions_valid_idx ON app.user_sessions (expires_at)
    WHERE revoked_at IS NULL;

-- ============================================================
-- Catálogos administráveis do formulário
-- ============================================================

CREATE TABLE app.companies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(100) NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT companies_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX companies_name_active_uq
    ON app.companies (lower(name)) WHERE is_active;

CREATE TABLE app.collectors (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(120) NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT collectors_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX collectors_name_active_uq
    ON app.collectors (lower(name)) WHERE is_active;

CREATE TABLE app.receipt_channels (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(100) NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT receipt_channels_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX receipt_channels_name_active_uq
    ON app.receipt_channels (lower(name)) WHERE is_active;

-- Tipos de contato são mantidos em tabela para permitir administração futura,
-- mesmo que o MVP inicial apresente três opções fixas.
CREATE TABLE app.contact_types (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        app.contact_type NOT NULL UNIQUE,
    name        varchar(100) NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Registro operacional de retornos
-- ============================================================

CREATE TABLE app.returns (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name             varchar(160) NOT NULL,
    contract_number          varchar(80) NOT NULL,
    contact_type_id          uuid NOT NULL REFERENCES app.contact_types(id),
    collector_id             uuid NOT NULL REFERENCES app.collectors(id),
    receipt_channel_id       uuid NOT NULL REFERENCES app.receipt_channels(id),
    company_id               uuid NOT NULL REFERENCES app.companies(id),
    created_by_user_id       uuid REFERENCES app.users(id) ON DELETE SET NULL,
    origin_role              app.user_role,
    conference_status        app.conference_status NOT NULL DEFAULT 'PENDENTE',
    conference_updated_by    uuid REFERENCES app.users(id) ON DELETE SET NULL,
    conference_updated_at    timestamptz,
    deleted_at               timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT returns_partner_not_blank CHECK (length(btrim(partner_name)) > 0),
    CONSTRAINT returns_contract_not_blank CHECK (length(btrim(contract_number)) > 0),
    CONSTRAINT returns_conference_consistency CHECK (
        (conference_status = 'PENDENTE' AND conference_updated_by IS NULL AND conference_updated_at IS NULL)
        OR
        (conference_status <> 'PENDENTE' AND conference_updated_by IS NOT NULL AND conference_updated_at IS NOT NULL)
    )
);

-- Um contrato só pode ter um retorno ativo. Registros excluídos logicamente
-- deixam de bloquear um novo cadastro, mas continuam disponíveis para auditoria.
CREATE UNIQUE INDEX returns_contract_active_uq
    ON app.returns (upper(btrim(contract_number))) WHERE deleted_at IS NULL;

CREATE INDEX returns_created_at_idx ON app.returns (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX returns_status_idx ON app.returns (conference_status) WHERE deleted_at IS NULL;
CREATE INDEX returns_company_idx ON app.returns (company_id) WHERE deleted_at IS NULL;
CREATE INDEX returns_collector_idx ON app.returns (collector_id) WHERE deleted_at IS NULL;
CREATE INDEX returns_creator_idx ON app.returns (created_by_user_id) WHERE deleted_at IS NULL;

-- ============================================================
-- Auditoria e consultas gerenciais
-- ============================================================

CREATE TABLE app.audit_log (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id   uuid REFERENCES app.users(id) ON DELETE SET NULL,
    action          app.audit_action NOT NULL,
    table_name      varchar(80) NOT NULL,
    record_id       uuid,
    old_data        jsonb,
    new_data        jsonb,
    ip_address      inet,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_record_idx ON app.audit_log (table_name, record_id);
CREATE INDEX audit_log_actor_idx ON app.audit_log (actor_user_id, created_at DESC);
CREATE INDEX audit_log_created_at_idx ON app.audit_log (created_at DESC);

-- View para alimentar dashboard e relatório sem duplicar regra de negócio.
CREATE VIEW app.active_returns AS
SELECT
    r.id,
    r.partner_name,
    r.contract_number,
    ct.code AS contact_type_code,
    ct.name AS contact_type,
    c.name AS collector,
    rc.name AS receipt_channel,
    co.name AS company,
    r.conference_status,
    r.origin_role,
    u.name AS owner,
    r.created_by_user_id,
    r.conference_updated_by,
    r.created_at,
    r.updated_at
FROM app.returns r
JOIN app.contact_types ct ON ct.id = r.contact_type_id
JOIN app.collectors c ON c.id = r.collector_id
JOIN app.receipt_channels rc ON rc.id = r.receipt_channel_id
JOIN app.companies co ON co.id = r.company_id
LEFT JOIN app.users u ON u.id = r.created_by_user_id
WHERE r.deleted_at IS NULL;

CREATE VIEW app.return_metrics AS
SELECT
    count(*) AS total_returns,
    count(*) FILTER (WHERE conference_status = 'PENDENTE') AS pending_returns,
    count(*) FILTER (WHERE conference_status = 'SIM') AS approved_returns,
    count(*) FILTER (WHERE conference_status = 'NAO') AS rejected_returns,
    count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS current_month_returns,
    count(*) FILTER (
        WHERE conference_status = 'PENDENTE'
          AND created_at < now() - interval '48 hours'
    ) AS overdue_returns
FROM app.returns
WHERE deleted_at IS NULL;

-- ============================================================
-- Atualização automática de timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER areas_updated_at
    BEFORE UPDATE ON app.areas
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON app.users
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER companies_updated_at
    BEFORE UPDATE ON app.companies
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER collectors_updated_at
    BEFORE UPDATE ON app.collectors
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER receipt_channels_updated_at
    BEFORE UPDATE ON app.receipt_channels
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER contact_types_updated_at
    BEFORE UPDATE ON app.contact_types
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER returns_updated_at
    BEFORE UPDATE ON app.returns
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

COMMIT;
