UPDATE platform_access_profiles
SET permissions = permissions || '{"continuity":"manage"}'::jsonb,
    updated_at = now()
WHERE protected = true AND deleted_at IS NULL AND NOT (permissions ? 'continuity');
