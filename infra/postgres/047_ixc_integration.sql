INSERT INTO platform_integration_providers (provider, enabled)
VALUES ('ixc', true)
ON CONFLICT (provider) DO NOTHING;
