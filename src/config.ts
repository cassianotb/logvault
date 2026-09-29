import { z } from 'zod';

const commonSchema = z.object({
  ARGUS_ENV: z.string().default('development'),
  ARGUS_TENANT_ID: z.string().uuid(),
  ARGUS_COLLECTOR_ID: z.string().uuid(),
  ARGUS_DEVICE_ID: z.string().uuid()
});

const collectorDeviceSchema = z.object({
  exporterIp: z.string().ip({ version: 'v4' }),
  deviceId: z.string().uuid(),
  vendor: z.string().min(1),
  timezone: z.string().default('America/Sao_Paulo')
});

function parseDevices(value: string, context: z.RefinementCtx) {
  if (!value.trim()) return [];
  try {
    return z.array(collectorDeviceSchema).max(1000).parse(JSON.parse(value));
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `ARGUS_DEVICES_JSON inválido: ${error instanceof Error ? error.message : String(error)}`
    });
    return z.NEVER;
  }
}

function parseProtocolList(value: string, context: z.RefinementCtx) {
  const protocols = [...new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
  const invalid = protocols.find((protocol) => !/^[A-Z0-9_-]+$/.test(protocol));
  if (invalid) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Protocolo inválido na lista: ${invalid}` });
    return z.NEVER;
  }
  return protocols;
}

export const collectorConfigSchema = commonSchema.extend({
  ARGUS_DEVICE_VENDOR: z.string().min(1),
  ARGUS_DEVICE_TIMEZONE: z.string().default('America/Sao_Paulo'),
  ARGUS_DEVICES_JSON: z.string().default('').transform(parseDevices),
  ARGUS_SPOOL_PATH: z.string().min(1),
  ARGUS_NETFLOW_HOST: z.string().default('0.0.0.0'),
  ARGUS_NETFLOW_PORT: z.coerce.number().int().min(1).max(65535).default(2055),
  ARGUS_SYSLOG_HOST: z.string().default('0.0.0.0'),
  ARGUS_SYSLOG_PORT: z.coerce.number().int().min(1).max(65535).default(5140),
  ARGUS_A10_IGNORED_PROTOCOLS: z.string().default('GRE,ESP').transform(parseProtocolList),
  ARGUS_SYNC_URL: z.string().url(),
  ARGUS_HEARTBEAT_URL: z.string().url(),
  ARGUS_SYNC_TOKEN: z.string().min(1),
  ARGUS_COLLECTOR_VERSION: z.string().min(1).max(100).default('0.1.0'),
  ARGUS_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(10000),
  ARGUS_SYNC_BATCH_SIZE: z.coerce.number().int().positive().max(100000).default(5000),
  ARGUS_SYNC_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  ARGUS_EDGE_ACK_RETENTION_HOURS: z.coerce.number().int().nonnegative().default(24),
  ARGUS_MANAGED_CLOUD_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ARGUS_MANAGED_CLOUD_REGISTRY_URL: z.string().url().default('http://127.0.0.1:8080/v1/ingest/managed-cloud/registry')
});

export const apiConfigSchema = z.object({
  ARGUS_ENV: z.string().default('development'),
  ARGUS_API_HOST: z.string().default('0.0.0.0'),
  ARGUS_API_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  ARGUS_POSTGRES_URL: z.string().min(1),
  ARGUS_CLICKHOUSE_URL: z.string().url(),
  ARGUS_CLICKHOUSE_USER: z.string().min(1),
  ARGUS_CLICKHOUSE_PASSWORD: z.string(),
  ARGUS_CLICKHOUSE_DATABASE: z.string().default('argus'),
  ARGUS_SYNC_TOKEN: z.string().min(1),
  ARGUS_ALERT_ENCRYPTION_KEY: z.string().refine((value) => !value || value.length >= 32, 'mínimo de 32 caracteres').default(''),
  ARGUS_TENANT_ID: z.string().uuid(),
  ARGUS_COLLECTOR_ID: z.string().uuid(),
  ARGUS_BACKUP_ROOT: z.string().min(1).default('/var/lib/argus/backups'),
  ARGUS_TENANT_BACKUP_ROOT: z.string().min(1).default('/var/lib/argus/tenant-backups'),
  ARGUS_BACKUP_STAGING_ROOT: z.string().min(1).default('/var/lib/argus/backup-staging'),
  ARGUS_BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  ARGUS_BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(15),
  ARGUS_CONTINUITY_CONTROL_PATH: z.string().min(1).default('/var/lib/argus/control'),
  ARGUS_BACKUP_REMOTE_TARGET: z.string().default(''),
  ARGUS_CAPACITY_OFFLINE_HOURS: z.coerce.number().int().min(1).max(168).default(6),
  ARGUS_DR_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ARGUS_DR_LOCAL_SITE: z.enum(['a', 'b']).default('a'),
  ARGUS_DR_SITE_A_HOST: z.string().max(255).default(''),
  // Compatibilidade temporária com instalações anteriores.
  ARGUS_DR_SITE_A_PRIVATE_HOST: z.string().max(255).default(''),
  ARGUS_DR_PANEL_HOST: z.string().max(255).default(''),
  ARGUS_DR_INGEST_HOST: z.string().max(255).default(''),
  ARGUS_DR_CONTROL_HOST: z.string().max(255).default(''),
  ARGUS_DR_DNS_PROVIDER: z.string().min(2).max(80).default('manual'),
  ARGUS_DR_DNS_TTL_SECONDS: z.coerce.number().int().min(30).max(86400).default(300),
  ARGUS_DR_SITE_A_NAME: z.string().min(1).max(100).default('Data Center A'),
  ARGUS_DR_SITE_B_NAME: z.string().min(1).max(100).default('Data Center B'),
  ARGUS_DR_POSTGRES_STANDBY_URL: z.string().default(''),
  ARGUS_DR_CLICKHOUSE_STANDBY_URL: z.string().url().or(z.literal('')).default(''),
  ARGUS_DR_CLICKHOUSE_STANDBY_USER: z.string().default('default'),
  ARGUS_DR_CLICKHOUSE_STANDBY_PASSWORD: z.string().default(''),
  ARGUS_DR_STANDBY_API_URL: z.string().url().or(z.literal('')).default(''),
  ARGUS_DR_LAG_WARNING_SECONDS: z.coerce.number().int().min(1).max(86400).default(10),
  ARGUS_DR_LAG_CRITICAL_SECONDS: z.coerce.number().int().min(2).max(86400).default(60),
  ARGUS_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  ARGUS_PUBLIC_URL: z.string().url().default('http://localhost:8081'),
  ARGUS_FIREWALL_SERVER_NAME: z.string().trim().min(1).max(120).default('Servidor principal · DC-A'),
  ARGUS_TLS_DOMAIN: z.string().trim().max(255).default(''),
  ARGUS_TLS_EMAIL: z.string().trim().email().or(z.literal('')).default(''),
  ARGUS_TLS_CHALLENGE: z.enum(['http-01', 'dns-01', 'existing', 'disabled']).default('disabled'),
  ARGUS_PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(1440).default(30),
  ARGUS_SMTP_HOST: z.string().default(''),
  ARGUS_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  ARGUS_SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ARGUS_SMTP_USER: z.string().default(''),
  ARGUS_SMTP_PASSWORD: z.string().default(''),
  ARGUS_SMTP_FROM: z.string().default(''),
  ARGUS_COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ARGUS_MANAGED_CLOUD_PORT_START: z.coerce.number().int().min(1024).max(65535).default(30000),
  ARGUS_MANAGED_CLOUD_PORT_END: z.coerce.number().int().min(1025).max(65535).default(31999),
  ARGUS_BOOTSTRAP_ADMIN_NAME: z.string().min(1).default('Administrador'),
  ARGUS_BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  // Instalações novas exigem 15; o piso de 12 preserva upgrades criados pela política anterior.
  ARGUS_BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(256)
}).refine((config) => config.ARGUS_MANAGED_CLOUD_PORT_END >= config.ARGUS_MANAGED_CLOUD_PORT_START + 1, {
  message: 'O intervalo Cloud deve conter ao menos um par de portas',
  path: ['ARGUS_MANAGED_CLOUD_PORT_END']
}).refine((config) => config.ARGUS_DR_LAG_CRITICAL_SECONDS > config.ARGUS_DR_LAG_WARNING_SECONDS, {
  message: 'O limite crítico de replicação deve ser maior que o limite de aviso',
  path: ['ARGUS_DR_LAG_CRITICAL_SECONDS']
});

export function loadCollectorConfig() {
  return collectorConfigSchema.parse(process.env);
}

export function loadApiConfig() {
  return apiConfigSchema.parse(process.env);
}
