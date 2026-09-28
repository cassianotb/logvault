import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('orquestrador de failover assistido', () => {
  it('mantém a promoção real do DC-B atrás de sincronismo e duas confirmações', async () => {
    const script = await readFile(new URL('../scripts/dr-standby.sh', import.meta.url), 'utf8');
    const promotion = script.indexOf("pg_ctl -D \"$PGDATA\" promote");
    expect(promotion).toBeGreaterThan(0);
    expect(script.indexOf('ARGUS_DR_CONFIRM_PROMOTION')).toBeLessThan(promotion);
    expect(script.indexOf('ARGUS_DR_FENCING_CONFIRMED')).toBeLessThan(promotion);
    expect(script.indexOf('preflight || die "sincronismo perdido antes da promoção"')).toBeLessThan(promotion);
    expect(script.indexOf('compose stop clickhouse-mirror')).toBeLessThan(promotion);
    expect(script.indexOf('compose --profile failover up')).toBeGreaterThan(promotion);
    expect(script).toContain('O tráfego ainda NÃO foi alterado');
  });

  it('usa espelhamento assíncrono sem Keeper na topologia real de duas VMs', async () => {
    const compose = await readFile(new URL('../compose.dc-b.yaml', import.meta.url), 'utf8');
    const mirror = await readFile(new URL('../scripts/clickhouse-async-mirror.sh', import.meta.url), 'utf8');
    expect(compose).toContain('clickhouse-mirror:');
    expect(compose).not.toContain('keeper');
    expect(mirror).toContain('dr_mirror_state');
    expect(mirror).toContain('ingest_raw ingested_at');
    expect(mirror).toContain('cgnat_events ingested_at');
    expect(mirror).toContain('server_metrics ingested_at');
  });

  it('mantém fencing e confirmação antes da promoção', async () => {
    const script = await readFile(new URL('../scripts/dr-failover.sh', import.meta.url), 'utf8');
    const promotion = script.indexOf("pg_ctl -D \"$PGDATA\" promote");
    expect(promotion).toBeGreaterThan(0);
    expect(script.indexOf('ARGUS_DR_CONFIRM_FAILOVER')).toBeLessThan(promotion);
    expect(script.indexOf('ARGUS_DR_FENCING_CONFIRMED')).toBeLessThan(promotion);
    expect(script.indexOf('preflight_promote\n    audit execute started')).toBeLessThan(promotion);
    expect(script.indexOf('verify_lab_fence')).toBeLessThan(promotion);
    expect(script).toContain('exec -T --user postgres postgres-b');
  });

  it('inicia a aplicação B somente depois da promoção e deixa DNS explícito', async () => {
    const script = await readFile(new URL('../scripts/dr-failover.sh', import.meta.url), 'utf8');
    const promotion = script.indexOf("pg_ctl -D \"$PGDATA\" promote");
    const application = script.indexOf('up -d --no-deps --wait api-b web-b');
    expect(application).toBeGreaterThan(promotion);
    expect(script).toContain('services_ready_dns_pending');
    expect(script).toContain('ARGUS_DR_DNS_HOOK');
    expect(script).toContain('resume)');
    expect(script).toContain("pg_value postgres-b 'SELECT pg_is_in_recovery()'");
  });

  it('faz fencing apenas da cópia restaurada no comando de laboratório', async () => {
    const script = await readFile(new URL('../scripts/dr-failover.sh', import.meta.url), 'utf8');
    expect(script).toContain('ARGUS_DR_CONFIRM_LAB_FENCE');
    expect(script).toContain('dr_compose stop postgres-a clickhouse-a keeper-1');
    expect(script).not.toContain('docker compose stop postgres clickhouse');
  });
});
