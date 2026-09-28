# Laboratório legado de quorum e replicação

> Este documento preserva o ensaio anterior com ClickHouse Keeper para fins de
> comparação. Ele não representa a topologia de produção atual. A implantação
> suportada usa somente DC-A e DC-B, conforme `docs/datacenter-b-installation.md`.
> O ensaio atual de duas VMs é executado por `scripts/dr-two-node-test.sh`.

Este laboratório valida, em uma única VM, a configuração de replicação prevista
para os datacenters A e B. Ele é completamente separado da pilha `argus` ativa:
usa o projeto Compose `argus-dr-lab`, redes internas e volumes com prefixo próprio.

O laboratório comprova o comportamento dos bancos e dos procedimentos, mas não
protege contra perda da VM nem reproduz falhas de energia, storage, hypervisor,
link físico ou latência real entre datacenters.

## Topologia

```text
DC-A 172.30.10.0/24          DC-B 172.30.20.0/24
  postgres-a  ----------------  postgres-b
  clickhouse-a ----------------  clickhouse-b
                  |
        replicação 172.30.254.0/28
          keeper-1 / keeper-2 / keeper-witness
```

- nenhuma porta é publicada no host;
- as três redes Docker são marcadas como `internal`;
- PostgreSQL B nasce por `pg_basebackup` e permanece em hot standby;
- cada PostgreSQL tem volume próprio;
- os ClickHouse usam caminhos compartilhados no Keeper e macros de réplica
  distintas (`dca` e `dcb`);
- os três Keeper executados na mesma VM comprovam o protocolo de quorum, não uma
  terceira zona de falha real;
- CPU e memória são limitadas para não competir sem controle com a pilha ativa.

## Preparação

```bash
scripts/dr-lab.sh init
```

O comando gera três segredos aleatórios, cria o arquivo com modo `0600` e se
recusa a sobrescrevê-lo. O arquivo `.env.dr-lab` é ignorado pelo Git.

Valide o manifesto sem criar containers:

```bash
scripts/dr-lab.sh config
```

## Operação

Inicie e aguarde todos os healthchecks:

```bash
scripts/dr-lab.sh start
scripts/dr-lab.sh status
```

Valide o streaming do PostgreSQL e a replicação de todas as tabelas ClickHouse:

```bash
scripts/dr-lab.sh validate
```

Cadastre o DC-B simulado no painel da plataforma, usando o mesmo token de uso
único e o mesmo endpoint de enrollment do instalador real:

```bash
scripts/dr-lab.sh enroll
```

O comando inicia um gateway somente na rede privada do laboratório, conecta a
API ativa a essa rede e cria contas exclusivas de monitoramento. O token é
gerado com auditoria, consumido uma única vez e não é exibido. Esse atalho é
exclusivo do laboratório; em uma VM real, o token nasce no botão **Adicionar
DC-B** e o comando é executado no próprio host standby.

O teste cria probes somente nas bases descartáveis do laboratório. Ele exige:

- PostgreSQL A fora de recovery;
- PostgreSQL B em recovery;
- um `walreceiver` em estado `streaming`;
- probe gravado em A visível em B;
- quatro tabelas replicadas em cada ClickHouse;
- nenhuma réplica ClickHouse em modo somente leitura;
- probe ClickHouse gravado em A visível em B.

### Indisponibilidade do ClickHouse A

```bash
scripts/dr-lab.sh exercise-clickhouse
```

O script para somente o ClickHouse A, grava no B, reinicia A e exige que o
registro criado durante a indisponibilidade apareça novamente em A.

### Promoção do PostgreSQL B

A promoção altera a linha do tempo do laboratório e exige confirmação explícita:

```bash
ARGUS_DR_CONFIRM_PROMOTION=PROMOTE-POSTGRES-B \
  scripts/dr-lab.sh exercise-postgres
```

O script confirma primeiro o streaming, para A, promove B e valida uma escrita
no novo primário. Não reinicie A depois da promoção: ele deve ser reconstruído
como standby da nova linha do tempo.

Para voltar ao cenário inicial, remova somente os volumes do laboratório e
inicialize novamente:

```bash
ARGUS_DR_CONFIRM_CLEANUP=REMOVE-ARGUS-DR-LAB \
  scripts/dr-lab.sh cleanup
scripts/dr-lab.sh start
scripts/dr-lab.sh validate
```

Pare o laboratório quando não estiver em teste:

```bash
scripts/dr-lab.sh stop
```

Os volumes ficam preservados. `cleanup` é a única operação do script que remove
volumes, sempre restritos ao projeto `argus-dr-lab`.

## Resultado da primeira homologação

Executada em 10 de setembro de 2026, na VM de laboratório:

- manifesto Compose válido;
- PostgreSQL 17.10 em streaming A para B;
- atraso observado após o probe: `0 bytes`;
- promoção manual do PostgreSQL B concluída e escrita confirmada em `1s`;
- ClickHouse 26.3 com quatro tabelas replicadas por nó;
- nenhuma tabela em modo somente leitura;
- filas de replicação A/B zeradas após sincronização;
- escrita no ClickHouse B durante parada de A confirmada em A após o retorno;
- pilha ativa `argus` não foi recriada nem conectada às redes do laboratório;
- ao final, o laboratório foi recriado, revalidado e removido porque a execução
  usou credenciais descartáveis do arquivo de exemplo.

Esses resultados aprovam a configuração funcional. A homologação final ainda
deve ser repetida com latência e volumes representativos e, depois, entre as VMs
reais dos datacenters.

## Homologação com cópia dos dados reais

Executada em 10 de setembro de 2026 usando o overlay
`compose.dr-rehearsal.yaml` e o backup `20260910T153436Z`, cuja base incremental
é `20260907T153237Z`. Os volumes ativos foram usados somente como origem do
backup; a restauração, conversão e promoção ocorreram em volumes isolados.

O wrapper `scripts/dr-rehearsal.sh` valida os manifests e controla a ordem de
inicialização do primário restaurado, standby e API B. Migração e cutover
ClickHouse continuam manuais para impedir uma troca sem comparação prévia.

### Restauração

- restauração e validação completas: `157s`;
- PostgreSQL restaurado: 2 tenants, 3 usuários, 4 coletores, 7 equipamentos e
  204 consultas auditadas;
- ClickHouse: 18.265.728 registros brutos únicos e 18.375.244 eventos únicos;
- período: `2026-08-07 13:57:45.478` a `2026-09-10 15:35:02.027`;
- nenhum evento sem registro bruto e todos os `CHECK TABLE` aprovados;
- SQLite: `integrity_check=ok`, 611.168 registros, sendo 9 pendentes.

### PostgreSQL real

- base restaurada compactada pelo restore: aproximadamente 316 MB;
- `pg_basebackup` criou B e iniciou streaming com atraso observado de 0 bytes;
- contagens de tenants, coletores e equipamentos coincidiram em A/B;
- probe escrito em A apareceu em B;
- promoção de B: `0,275s` no mesmo host;
- escrita em B depois da promoção: aprovada;
- novo standby A reconstruído a partir de B em menos de 5 segundos no mesmo
  host;
- probe pós-promoção e contagens confirmados no novo A;
- streaming B para o novo A com atraso observado de 0 bytes.

Durante o rejoin, uma dependência herdada pelo Compose religou o primário A
antigo. Não havia aplicação ou escrita conectada, ele foi parado imediatamente e
o manifesto foi corrigido com `!reset {}`. O achado confirma que o procedimento
real deve fazer fencing fora do Compose e nunca permitir que dependências iniciem
automaticamente o primário antigo.

### ClickHouse real

Um primeiro `INSERT INTO ... SELECT` foi cancelado pelo limite de memória de
1,5 GiB após inserir uma parte parcial. A temporária foi truncada e a migração
foi repetida por partição com `ATTACH PARTITION ... FROM`, preservando as tabelas
originais:

- primeira partição: `0,319s`;
- demais partições e métricas: `0,987s`;
- fingerprints, contagens e intervalos de `ingest_raw` e `cgnat_events`
  coincidiram em tabela local, réplica A e réplica B;
- B recebeu 18.265.728 registros brutos e 18.375.244 eventos, com filas zeradas;
- cutover renomeou as replicadas para os nomes finais e preservou as originais
  com sufixo `_local_backup`;
- perda simultânea de ClickHouse A e Keeper A manteve B gravável com B+witness;
- após o retorno, A recuperou o probe e voltou a 2/2 réplicas, filas zeradas.

A tabela `server_metrics` possui TTL de 48 horas. Durante o ensaio, a tabela
replicada eliminou 125 linhas na borda do TTL antes da tabela local. A comparação
estável das últimas 24 horas coincidiu nos três pontos: 15.411 linhas e
fingerprint `18373873488887661144`. Homologações futuras devem excluir a borda do
TTL ao comparar tabelas com expiração curta.

### Aplicação e capacidade

- API B iniciou isolada, sem porta publicada e sem acesso externo;
- readiness estável: `200 {"status":"ready"}`;
- a API só deve iniciar depois de PostgreSQL e ClickHouse estarem saudáveis; uma
  partida simultânea gerou uma tentativa inicial de métrica recusada;
- espaço aproximado usado pelo ensaio completo: 12,3 GB, além dos backups já
  existentes;
- ClickHouse A/B usaram aproximadamente 1,0 GiB/810 MiB na amostra final;
- API B usou aproximadamente 36 MiB;
- cada Keeper usou aproximadamente 94-103 MiB.

A execução com dados reais aprova a estratégia funcional e a migração por
partição. Os tempos locais não estimam o tempo entre datacenters: no ambiente
real, carga inicial e catch-up dependem de banda, latência e IOPS.

## Revalidação do cadastro automático e monitoramento

Executada em 24 de setembro de 2026 com o backup incremental
`20260923T154400Z`, baseado no full `20260921T154218Z`. O instalador cadastrou
automaticamente a VM `dc-b-simulado`; nenhuma credencial foi exibida ou
armazenada no navegador.

- PostgreSQL A/B: 2 tenants, 3 usuários, 4 coletores e 7 equipamentos em ambos;
- streaming WAL e probe A para B aprovados, sem promoção;
- ClickHouse A/B: 25.397.965 registros brutos, fingerprint
  `4915575076328841122`, e 25.499.303 eventos, fingerprint
  `9042762398988354152`;
- migração ClickHouse feita somente na cópia restaurada, por partição, com as
  tabelas originais preservadas sob o sufixo `_local_backup`;
- o painel ativo alcançou o gateway privado do ensaio com credenciais somente
  leitura e mostrou PostgreSQL B, ClickHouse B e API B saudáveis;
- a autorização PostgreSQL do monitor usa a sub-rede isolada de replicação, e
  não o endereço efêmero do contêiner da API;
- o estado geral permaneceu `Em preparação`, o failover permaneceu bloqueado
  e o ClickHouse ativo mostrou a migração pendente, como esperado antes da
  janela de ativação real.

Este ensaio valida restauração, sincronização, cadastro e observabilidade sem
alterar as tabelas ativas nem encaminhar tráfego de clientes ao ambiente B.

### DNS reservado do laboratório

As redes isoladas usam `logvault.lab.test`, `ingest.lab.test`, `dr.lab.test`,
`logvault-a.lab.test`, `logvault-b.lab.test`, `keeper-a.lab.test`,
`keeper-b.lab.test` e `witness.lab.test`. Esses aliases existem somente no DNS
interno do Docker; não são registrados publicamente e não interferem no DNS da
VM. O instalador troca esses valores pelos hostnames reais informados durante o
cadastro de produção.

## Failover assistido completo

Executado em 25 de setembro de 2026 como incidente
`LAB-20260925-DR01`, somente sobre a cópia restaurada:

- antes do corte, PostgreSQL B estava em recovery com receive/replay LSN
  `0/1A031388` e contagens `2|3|4|7` para tenants, usuários, coletores e
  equipamentos;
- ClickHouse B continha 25.397.965 registros brutos e 25.499.303 eventos, com
  filas zeradas;
- o fencing parou PostgreSQL A, ClickHouse A e Keeper A restaurados; a pilha
  ativa `argus` não foi parada nem teve seus volumes alterados;
- ClickHouse B permaneceu gravável com uma réplica ativa e quorum formado por
  Keeper B mais witness;
- PostgreSQL B foi promovido, a migração idempotente pendente foi aplicada e
  API/Web B ficaram saudáveis;
- `logvault.lab.test` e `ingest.lab.test` foram transferidos ao Web B;
- painel e `/api/health/ready` responderam HTTP 200 pelo hostname transferido;
- um heartbeat autenticado de coletor por `ingest.lab.test` foi registrado com
  HTTP 200;
- o probe `failover-LAB-20260925-DR01|dc-b-promoted` confirmou escrita no
  ClickHouse B após a perda do site A;
- o RTO observado entre o fencing e a conclusão da rota foi `3m03s`, incluindo
  duas correções feitas durante o próprio ensaio.

O primeiro comando de promoção tentou executar `pg_ctl` como root e foi
recusado pelo PostgreSQL antes de alterar o papel; o orquestrador passou a usar
explicitamente o usuário `postgres`. Depois da promoção, o hook de DNS carregou
somente o perfil de aplicação e foi recusado pelo Compose; todos os perfis foram
incluídos e foi criado o comando idempotente `resume`, que retoma apenas a troca
de rota sem tentar promover novamente. Esses bloqueios aumentaram o RTO medido,
mas falharam de forma segura e agora possuem testes de regressão.

O laboratório foi deixado deliberadamente no estado promovido para preservar
as evidências. Antes de repetir o ensaio, reconstrua PostgreSQL B como standby e
sincronize novamente as réplicas, ou restaure outra cópia isolada.
