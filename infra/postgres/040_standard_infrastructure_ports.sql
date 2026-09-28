BEGIN;

UPDATE infrastructure_firewall_policies
SET port = CASE service WHEN 'web' THEN 443 ELSE 22 END,
    public_port = CASE service WHEN 'web' THEN 443 ELSE 22 END,
    updated_at = now();

COMMIT;
