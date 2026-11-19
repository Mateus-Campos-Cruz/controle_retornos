BEGIN;
ALTER TABLE app.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
ALTER TABLE app.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
-- Legacy accounts without a hash cannot authenticate. Reset them through an administrator.
ALTER TABLE app.returns ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES app.areas(id);
UPDATE app.returns r SET area_id=u.area_id FROM app.users u WHERE r.created_by_user_id=u.id AND r.area_id IS NULL;
CREATE INDEX IF NOT EXISTS returns_area_idx ON app.returns(area_id) WHERE deleted_at IS NULL;
ALTER TABLE app.contact_types ALTER COLUMN code DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contact_types_name_active_uq ON app.contact_types(lower(name)) WHERE is_active;
CREATE TABLE IF NOT EXISTS app.auth_attempts (
    key_hash text PRIMARY KEY,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_expiration_idx ON app.auth_attempts(expires_at);
CREATE TABLE IF NOT EXISTS app.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO app.schema_migrations(version) VALUES ('001_auth') ON CONFLICT DO NOTHING;
COMMIT;
