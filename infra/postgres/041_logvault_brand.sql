UPDATE tenants
SET name = 'LogVault Plataforma', updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000000'
  AND name IN ('Argus Plataforma', 'Argos Plataforma');

UPDATE platform_continuity_settings
SET routing = jsonb_set(
      jsonb_set(
        jsonb_set(routing, '{siteAHost}', '"logvault-a.lab.test"'),
        '{siteBHost}', '"logvault-b.lab.test"'
      ),
      '{panelHost}', '"logvault.lab.test"'
    ),
    updated_at = now()
WHERE COALESCE(routing ->> 'siteAHost', routing ->> 'siteAPrivateHost') = 'argus-a.lab.test'
  AND COALESCE(routing ->> 'siteBHost', routing ->> 'siteBPrivateHost') = 'argus-b.lab.test'
  AND routing ->> 'panelHost' = 'argus.lab.test';
