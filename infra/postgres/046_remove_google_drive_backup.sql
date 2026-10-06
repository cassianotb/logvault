BEGIN;

-- O backup externo no Google Drive foi descontinuado. As tabelas continham
-- credenciais cifradas e referências remotas que não devem permanecer ativas.
DROP TABLE IF EXISTS external_backup_uploads;
DROP TABLE IF EXISTS platform_backup_destinations;

ALTER TABLE tenant_backup_jobs
  DROP COLUMN IF EXISTS send_to_google_drive,
  DROP COLUMN IF EXISTS google_drive_file_id;

ALTER TABLE system_backup_audit DROP CONSTRAINT IF EXISTS system_backup_audit_action_check;
ALTER TABLE system_backup_audit ADD CONSTRAINT system_backup_audit_action_check
  CHECK (action IN ('download_started', 'tenant_backup_requested', 'tenant_backup_downloaded'));

-- Mantém os nomes antigos somente para preservar o histórico imutável de auditoria.
ALTER TABLE platform_management_audit DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;
ALTER TABLE platform_management_audit ADD CONSTRAINT platform_management_audit_action_check CHECK (action IN (
  'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
  'plan_created', 'plan_updated', 'plan_deleted',
  'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
  'email_settings_updated', 'email_tested', 'company_profile_updated',
  'tenant_accessed', 'tenant_access_ended',
  'access_profile_created', 'access_profile_updated', 'access_profile_deleted',
  'integration_provider_enabled', 'integration_provider_disabled',
  'continuity_settings_updated', 'continuity_tested',
  'continuity_enrollment_created', 'continuity_enrolled', 'continuity_enrollment_revoked',
  'backup_destination_updated', 'backup_destination_tested',
  'backup_google_connected', 'backup_google_disconnected',
  'backup_external_export_requested', 'backup_imported',
  'redundancy_primary_configured', 'redundancy_enrollment_created', 'redundancy_site_enrolled',
  'redundancy_site_revoked', 'redundancy_secondary_promoted', 'redundancy_legacy_migration_updated'
));

COMMIT;
