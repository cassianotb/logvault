BEGIN;

ALTER TABLE infrastructure_firewall_policies
  ADD COLUMN IF NOT EXISTS public_port integer CHECK (public_port IS NULL OR public_port BETWEEN 1 AND 65535),
  ADD COLUMN IF NOT EXISTS server_name text NOT NULL DEFAULT 'Servidor principal · DC-A';

UPDATE infrastructure_firewall_policies
SET public_port = port
WHERE public_port IS NULL;

COMMIT;
