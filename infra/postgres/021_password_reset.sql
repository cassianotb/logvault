ALTER TABLE auth_audit DROP CONSTRAINT IF EXISTS auth_audit_action_check;
ALTER TABLE auth_audit
  ADD CONSTRAINT auth_audit_action_check
  CHECK (action IN (
    'login_success', 'login_failure', 'logout', 'password_change',
    'password_reset_requested', 'password_reset_completed'
  ));

CREATE TABLE IF NOT EXISTS password_reset_tokens
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    requested_ip inet,
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_active_idx
  ON password_reset_tokens (token_hash, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, created_at DESC);
