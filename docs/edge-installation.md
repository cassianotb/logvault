# Coletor de borda

O servidor do cliente executa somente o serviço `collector`. PostgreSQL, ClickHouse, API e painel permanecem no ambiente central. O coletor recebe UDP dos equipamentos, confirma a gravação no SQLite local e sincroniza lotes idempotentes com a nuvem.

## Requisitos

- Linux x86_64 ou ARM64 com Docker Engine e Docker Compose v2;
- relógio sincronizado por NTP;
- armazenamento persistente dimensionado pela tela **Capacidade** para pelo menos seis horas offline;
- conectividade de saída com a API central por HTTPS, VPN ou rede privada roteada.

Enquanto a API central estiver em HTTP, use somente WireGuard ou uma rede privada confiável. Não exponha a chave do coletor nem os lotes CGNAT em HTTP pela internet pública.

## Regras de rede

- UDP 2055 de entrada, restrito aos IPs dos Cisco ASR;
- UDP 5140 de entrada, restrito aos IPs dos A10;
- TCP de saída para o endereço da API central;
- nenhuma porta de administração precisa ser aberta da nuvem para o cliente.

O coletor pode operar atrás de NAT porque todas as conexões com a nuvem são iniciadas por ele.

## Provisionamento

1. No painel central, acesse **Coletores**, crie um coletor em modo **Servidor local** e copie a configuração exibida.
2. No servidor do cliente, obtenha este repositório e entre no diretório do projeto.
3. Execute o instalador unificado e escolha **Coletor local**:

```bash
sudo ./install.sh
```

4. Quando solicitado, cole toda a configuração copiada do painel. Em uma nova linha, digite `FIM` e pressione Enter. A colagem fica oculta para que a chave individual não apareça no terminal.
5. O instalador valida IDs, token, URLs, portas e linhas obrigatórias antes de criar `.env.edge` com permissão `0600`.

Em uma automação ou instalação sem terminal interativo, armazene o bloco em um arquivo protegido e informe seu caminho:

```bash
sudo ./install.sh collector --config-file /caminho/seguro/collector.env
```

Para apenas validar e preparar `.env.edge`, sem construir ou iniciar o coletor, acrescente `--prepare-only`.

Depois da validação, o instalador constrói a imagem e inicia somente o coletor. O volume persistente recebe o nome `argus-edge-data`. Para substituir uma configuração existente pelo modo interativo, execute `sudo ./install.sh collector --configure`; a versão anterior será preservada em `.env.edge.bak`.

## Operação

Verificar container, integridade e filas do spool:

```bash
sh scripts/edge-status.sh
```

Atualizar a partir da branch atualmente instalada:

```bash
sh scripts/update-edge.sh
```

Parar/remover o container preservando o spool:

```bash
sh scripts/uninstall-edge.sh
```

A remoção definitiva do volume exige confirmação explícita:

```bash
ARGUS_CONFIRM_PURGE=PURGE-EDGE-DATA sh scripts/uninstall-edge.sh --purge-data
```

## Comportamento durante falha de internet

Itens não confirmados permanecem no SQLite nos estados `pending` ou `batched` e
**não possuem prazo máximo de expiração**. O sincronizador tenta novamente sem
apagar o lote e a API usa identificador e checksum para evitar duplicações. O
tempo que o Edge suporta sem internet depende do espaço persistente disponível
e da taxa de ingestão: dimensione, no mínimo, seis horas na taxa de pico e
reserve mais disco quando a janela de indisponibilidade aceitável for maior.

Registros já confirmados permanecem localmente pelo período de
`ARGUS_EDGE_ACK_RETENTION_HOURS` (24 horas por padrão) e depois podem ser
limpos. Se o disco esgotar, novos datagramas não terão garantia de persistência;
acompanhe a ocupação e a fila pendente pela tela **Servidores** e por
`edge-status.sh`.

O coletor somente marca uma entrega como confirmada quando a API devolve um
comprovante com o mesmo `batchId`, checksum e contagens. Um `HTTP 200` vazio,
uma página de proxy ou um comprovante divergente mantém o lote pendente. Após
uma indisponibilidade, até quatro lotes por destino são drenados sequencialmente
em cada ciclo por padrão; ajuste `ARGUS_SYNC_MAX_BATCHES_PER_TICK` somente após
medir a capacidade da API.

Para revalidar no destino secundário todos os lotes confirmados que ainda estão
retidos no spool, sem afetar a confirmação do principal:

```bash
docker compose -f compose.edge.yaml --env-file .env.edge exec collector \
  npm run reverify:retained -- secondary
```

O comando apenas reabre a entrega do destino indicado. A API verifica o
comprovante, completa membros ausentes e mantém os demais IDs idempotentes.

A garantia começa depois que o datagrama UDP foi recebido e persistido. Uma parada do servidor local ou perda na rede entre equipamento e coletor ainda pode impedir o recebimento inicial.

## Roteiro do piloto

1. Confirmar heartbeat e métricas do servidor local no painel.
2. Enviar NetFlow/Syslog de um equipamento cadastrado.
3. Bloquear apenas a comunicação de saída com a API central.
4. Confirmar crescimento de `pending`/`batched` com `edge-status.sh`.
5. Restabelecer a conexão e acompanhar a fila chegar a zero.
6. Comparar IDs e contagens na nuvem para confirmar ausência de duplicação.
7. Validar os alertas de coletor offline e recuperação.
