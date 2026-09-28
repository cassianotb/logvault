# Homologação inicial

## 1. Preparação

Requisitos do host: Docker Engine com Compose v2 e portas TCP 8080/8081 e UDP 2055/5140 disponíveis.

```bash
cp .env.example .env
```

No `.env`, substitua pelo menos `ARGUS_CLICKHOUSE_PASSWORD`, `ARGUS_SYNC_TOKEN` e `ARGUS_BOOTSTRAP_ADMIN_PASSWORD`. A `ARGUS_SYNC_TOKEN` é a chave individual do coletor inicial; novos coletores recebem suas próprias chaves pela tela **Coletores**. Em `ARGUS_DEVICES_JSON`, informe o IP de origem, UUID e vendor de cada equipamento. O UUID precisa ser único por equipamento.

Para esta primeira homologação, o tenant, coletor e equipamento padrão são criados pelo arquivo `infra/postgres/900_homolog_seed.sql`.

## 2. Inicialização

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:8080/health/ready
```

A interface fica em `http://localhost:8081`. O primeiro usuário administrador é criado com `ARGUS_BOOTSTRAP_ADMIN_EMAIL` e `ARGUS_BOOTSTRAP_ADMIN_PASSWORD`. Alterar essas variáveis depois da criação não sobrescreve silenciosamente a senha já gravada.

## 3. Envio dos equipamentos

- Cisco ASR NetFlow v9: destino UDP `<IP_DO_COLETOR>:2055`.
- A10 Syslog: destino UDP `<IP_DO_COLETOR>:5140`.

Libere os dois destinos somente para os IPs dos equipamentos. NetFlow e Syslog em UDP não devem ser expostos diretamente à internet; em cenário cloud, use VPN ou rede privada.

O spool local fica no volume `collector-data`. Registros ainda não confirmados pela API não expiram, portanto uma indisponibilidade de seis horas não causa descarte deliberado — desde que o volume tenha espaço e permaneça íntegro.

## 4. Replay do exemplo A10

Com o coletor em execução:

```bash
npm run replay:a10 -- 127.0.0.1 5140
```

Esse replay envia apenas o evento `Freed` fornecido como exemplo, com timestamp explícito. Portanto ele comprova recepção, armazenamento e desalocação, mas não cria uma alocação ativa para aparecer na consulta.

Para conferir os registros originais:

```bash
docker compose exec clickhouse clickhouse-client --user argus --password change-me --database argus --query "SELECT received_at, exporter_ip, parse_status, parse_error FROM ingest_raw ORDER BY received_at DESC LIMIT 10 FORMAT PrettyCompact"
```

Use no comando a senha definida no `.env`.

## 5. Captura real necessária

Para finalizar os parsers sem inferência, envie:

1. A10: ao menos uma mensagem bruta de alocação e uma de desalocação, exatamente como chegam ao socket UDP.
2. Cisco ASR: datagramas NetFlow v9 contendo template e registros de alocação/desalocação; o export do Graylog ajuda a conferir, mas não substitui o pacote binário e o template.
3. Modelo e versão de software de cada equipamento.
4. Fuso horário configurado e confirmação de sincronismo NTP.

Depois da captura, os dados originais já persistidos poderão ser reprocessados com a nova versão do parser.

## 6. Critérios do teste

- queda da API não remove itens pendentes do SQLite;
- heartbeat identifica queda e recuperação da API sem reiniciar o coletor;
- o mesmo lote pode ser reenviado sem duplicação lógica;
- evento sem mapeamento explícito fica como `decoded_unmapped`;
- consulta com porta retorna somente faixas compatíveis;
- consulta sem porta retorna todas as traduções vigentes e sinaliza escopo amplo;
- consulta e exportação sem sessão recebem HTTP 401, e o tenant vem exclusivamente da sessão;
- CSV e PDF recebem identificador de auditoria;
- registros confirmados permanecem 24 horas no spool local e 13 meses no ClickHouse.
