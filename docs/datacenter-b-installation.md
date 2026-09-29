# Instalação e operação do Datacenter B

O LogVault usa duas VMs: o DC-A permanece ativo e o DC-B recebe uma cópia
contínua. Não existe terceira VM, witness ou dependência de ClickHouse Keeper na
topologia de produção.

## Modelo de continuidade

- PostgreSQL: streaming físico A → B, com `pg_basebackup`, slot dedicado e B em
  `hot standby`.
- ClickHouse: espelhamento assíncrono incremental A → B, com checkpoint
  persistente para `ingest_raw`, `cgnat_events` e `server_metrics`.
- API, painel, proxy HTTPS, coletor Cloud e backup: instalados no B, mas desligados até uma
  promoção explícita.
- Coletores Edge: continuam usando o hostname estável de ingestão e retêm dados
  no spool durante a troca.
- Tráfego: nunca é alterado pela instalação ou pela promoção dos serviços. A
  mudança de DNS/NAT/VIP é uma etapa operacional posterior.

O espelhamento do ClickHouse é deliberadamente assíncrono. O painel mostra o
checkpoint, tabelas pendentes e idade da última sincronização; o maior atraso
entre PostgreSQL e ClickHouse representa o RPO estimado.

## Rede obrigatória

Use FQDNs estáveis para os dois sites. Eles podem resolver para endereços de uma
VPN, rede dedicada, VIP ou túnel. As portas dos bancos não devem atravessar a
internet aberta, mesmo quando os FQDNs públicos forem usados como endpoints.

| Origem | Destino | Porta | Uso |
|---|---|---:|---|
| DC-B | DC-A | TCP 5432 | carga inicial e streaming WAL |
| DC-B | DC-A | TCP 9000 | leitura incremental do ClickHouse A |
| DC-A | DC-B | TCP 5432 | monitoramento do PostgreSQL B |
| DC-A | DC-B | TCP 8123 | monitoramento do ClickHouse B |
| DC-A | DC-B | TCP 8082 | agente de prontidão do standby |

Restrinja essas portas aos endereços da VPN/rede entre os datacenters. Na
instalação inicial do A, os bancos permanecem vinculados ao `127.0.0.1`.

## Instalação do DC-A

Execute o assistente unificado e escolha **Sistema LogVault**:

```bash
sudo ./install.sh
```

O instalador inicial:

1. gera uma senha exclusiva de replicação;
2. mantém PostgreSQL e ClickHouse acessíveis somente localmente;
3. instala um agente `systemd` com operação restrita para a ativação posterior;
4. preserva os segredos no `.env` com modo `0600`.

Em **Continuidade → Adicionar DC-B**, informe os nomes e FQDNs dos dois sites.
Ao gerar o comando, o agente resolve ambos os endereços, verifica se o IPv4 do
DC-A pertence à VM, publica os bancos somente nessa interface, cria ou atualiza
`argus_replica`, limita o `pg_hba.conf` ao IPv4 do B (`/32`) e ajusta UFW ou
firewalld quando ativo. Só depois o painel entrega o token de uso único.

Uma atualização de instalação antiga acrescenta automaticamente as variáveis
necessárias e instala o agente local antes de recriar os serviços. Instalações
que já possuíam continuidade continuam preservando a interface e o CIDR atuais.

## Requisitos do DC-B

O B deve suportar 100% da carga do A:

| Recurso | Bloqueio inicial |
|---|---:|
| vCPU | 8 |
| RAM | 16 GiB |
| Disco do sistema | 50 GiB |
| PostgreSQL | 50 GiB |
| ClickHouse | 100 GiB |

Use Ubuntu 24.04+ ou Debian 12+, NTP ativo e, preferencialmente, filesystems
separados para PostgreSQL e ClickHouse. O dimensionamento da tela **Capacidade**
prevalece sobre esses mínimos.

## Instalação automática do DC-B

No painel do A, acesse **Administração da plataforma → Continuidade → Adicionar
DC-B**. Informe nomes e FQDNs resolvíveis dos dois sites. O FQDN do A deve
apontar para um IPv4 local desta VM. Copie o comando temporário; o token expira
em 30 minutos e aceita um único uso.

Execute o comando como root na VM B. O instalador:

1. detecta SO, hostname, IP, rota, CPU, RAM, NTP, Docker e discos;
2. instala Git, Python, Docker Engine e Compose v2 via APT quando necessário;
3. envia o inventário e as credenciais de monitoramento pelo endpoint HTTPS de
   uso único;
4. recebe as credenciais de provisionamento sem imprimi-las;
5. clona a versão indicada pelo DC-A em `/opt/logvault`;
6. cria `/opt/logvault/.env.dc-b` com modo `0600`;
7. executa `pg_basebackup` e inicia o PostgreSQL B em recovery;
8. inicia o ClickHouse B e a carga incremental das três tabelas;
9. cria as contas de monitoramento;
10. aguarda PostgreSQL e ClickHouse alcançarem o A;
11. mantém API, Web, proxy HTTPS, coletor e backup desligados.

O pacote local confidencial fica em `/var/lib/argus-bootstrap` quando o script
foi baixado isoladamente, ou em `artifacts/dc-b-installation` quando executado a
partir de um checkout. Não o envie por e-mail nem o adicione ao Git.

Para validar a VM sem consumir um token:

```bash
scripts/install-dc-b.sh preflight \
  --postgres-path /var/lib/postgresql \
  --clickhouse-path /var/lib/clickhouse
```

Se a carga histórica exceder uma hora, aumente a espera com
`--sync-timeout 14400`. Se o comando terminar por timeout, os containers
continuam sincronizando; acompanhe com:

```bash
cd /opt/logvault
sudo scripts/dr-standby.sh status
sudo scripts/dr-standby.sh preflight
```

## Estado normal

Antes do failover:

- `SELECT pg_is_in_recovery()` no B retorna `true`;
- `clickhouse-mirror` permanece ativo;
- as três linhas de `argus.dr_mirror_state FINAL` ficam sem pendências;
- `api-b`, `web-b`, `proxy-b`, `collector-b` e `backup-b` permanecem desligados;
- o painel do A muda de **Em preparação** para **Protegido** somente depois que
  todos os probes estiverem saudáveis.

Comandos úteis:

```bash
sudo scripts/dr-standby.sh status
sudo docker compose --project-name logvault-dc-b \
  -f compose.dc-b.yaml --env-file .env.dc-b ps
```

## Failover assistido

Primeiro confirme que o A realmente parou ou foi isolado de rede/storage. Nunca
promova o B apenas porque um healthcheck falhou.

Prepare uma autorização de 15 minutos:

```bash
sudo scripts/dr-standby.sh prepare \
  --incident INC-2026-001 \
  --fencing-reference TICKET-DC-A-ISOLADO
```

Depois do isolamento, use o desafio retornado:

```bash
sudo ARGUS_DR_CONFIRM_PROMOTION='PROMOTE-DC-B:DESAFIO' \
  ARGUS_DR_FENCING_CONFIRMED='DC-A-ISOLATED:TICKET-DC-A-ISOLADO' \
  scripts/dr-standby.sh promote --incident INC-2026-001
```

O comando repete o preflight, para o espelhamento, promove o PostgreSQL B,
desativa o estado de continuidade antigo e inicia API, painel, proxy HTTPS,
coletor e backup.
Ele não altera DNS/NAT/VIP. Valide o painel e `/health/ready`; somente então vire
o tráfego.

Nunca religue o A antigo aceitando escrita. Depois da promoção, ele pertence a
uma linha do tempo anterior.

## Retorno ao DC-A

Failback exige nova janela:

1. mantenha B como primário;
2. faça backup e preserve evidências;
3. recrie PostgreSQL A por `pg_basebackup` a partir de B;
4. faça uma nova carga base do ClickHouse A a partir de B;
5. confirme atraso zero;
6. execute um switchover planejado com a mesma regra de fencing;
7. reconstrua B como standby novamente.

Não reutilize diretamente o volume PostgreSQL antigo.

## Atualizações

Use **Atualizar LogVault** no menu. O atualizador valida o Git, cria um backup,
preserva `.env`, volumes e certificados e recria os serviços. Em uma topologia
protegida, atualize B primeiro e confirme `dr-standby.sh preflight`; depois
atualize A.

## Ensaio reproduzível de duas VMs

O teste abaixo cria somente A e B em redes e volumes isolados, confirma as duas
replicações, para A e promove B:

```bash
scripts/dr-two-node-test.sh
```

Por padrão, containers e volumes do ensaio são removidos ao final. O cenário não
usa Keeper nem uma terceira VM.
