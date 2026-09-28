ALTER TABLE platform_continuity_settings
  ADD COLUMN IF NOT EXISTS routing jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE platform_continuity_settings
SET routing = jsonb_build_object(
  'siteAHost', 'logvault-a.lab.test',
  'siteBHost', 'logvault-b.lab.test',
  'panelHost', 'logvault.lab.test',
  'ingestHost', 'ingest.lab.test',
  'drControlHost', 'dr.lab.test',
  'dnsProvider', 'lab',
  'dnsTtlSeconds', 60
)
WHERE routing = '{}'::jsonb
  AND standby_api_url LIKE 'http://dc-b-gateway%';
