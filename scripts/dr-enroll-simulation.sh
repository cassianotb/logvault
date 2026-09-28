#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"

cd "$repo_root"

argus_url="$(docker compose exec -T api printenv ARGUS_PUBLIC_URL)"
case "$argus_url" in
  http://*|https://*) ;;
  *) echo "ARGUS_PUBLIC_URL inválida na API ativa" >&2; exit 1 ;;
esac

token="$(docker compose exec -T api node --input-type=module -e '
  import { randomBytes } from "node:crypto";
  import pg from "pg";
  import { PostgresRepository } from "./dist/api/postgres.js";
  import { sha256 } from "./dist/core/crypto.js";
  const pool = new pg.Pool({ connectionString: process.env.ARGUS_POSTGRES_URL });
  const actorResult = await pool.query(`
    SELECT u.id
    FROM platform_administrators pa
    JOIN users u ON u.id = pa.user_id
    WHERE u.active = true AND u.deleted_at IS NULL
    ORDER BY pa.is_owner DESC, u.created_at
    LIMIT 1
  `);
  await pool.end();
  const actor = actorResult.rows[0];
  if (!actor) throw new Error("Administrador da plataforma não encontrado");
  const token = randomBytes(32).toString("base64url");
  const repository = new PostgresRepository(process.env.ARGUS_POSTGRES_URL);
  await repository.createContinuityEnrollment({
    actorUserId: actor.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString()
  });
  await repository.close();
  process.stdout.write(token);
')"

test -n "$token"
http_flag=""
case "$argus_url" in http://*) http_flag="--allow-http" ;; esac

ARGUS_DC_B_ENROLLMENT_TOKEN="$token" \
  "$script_dir/install-dc-b.sh" enroll \
  --argus-url "$argus_url" \
  --simulation \
  --force \
  $http_flag

unset token
echo "Enrollment do DC-B simulado concluído sem expor o token."

