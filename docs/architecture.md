# Arquitetura do MVP

## Princípios

1. O conteúdo recebido é persistido antes da normalização ou sincronização.
2. O registro original é imutável e pode ser reprocessado por versões futuras dos parsers.
3. Alocação e desalocação só existem quando indicadas pelo equipamento.
4. Campos ausentes permanecem ausentes; o parser não completa dados por inferência.
5. O coletor cria `raw_id`, `event_id` e `batch_id`, tornando reenvios verificáveis e logicamente idempotentes.
6. Dados de assinantes permanecem no ERP. Enquanto a integração sob demanda não estiver ativa, a plataforma declara o assinante como não identificado e não replica nem infere esse cadastro.
7. O tenant de consultas e exportações vem da sessão autenticada e nunca de um parâmetro enviado pelo navegador.
8. O cadastro de equipamentos é distribuído pela API e persistido no SQLite do coletor; a última configuração válida continua disponível durante indisponibilidade.
9. Cada coletor possui credencial própria; a API valida a chave, o tenant e o `collectorId` em conjunto e armazena somente o hash da chave.
10. O limite comercial de equipamentos pertence ao tenant e é aplicado em transação; desativar não libera licença, enquanto excluir logicamente libera a vaga e preserva o histórico.
11. A gestão global exige uma autorização de plataforma independente do perfil administrativo do ISP; rotas de clientes nunca aceitam essa permissão a partir do navegador.
12. Alterações globais e exportações da auditoria são registradas no PostgreSQL com ator, tenant alvo, instante, filtros e hash do arquivo.
13. A exclusão de tenant bloqueia novas sessões/ingestão antes da remoção, aguarda as mutações do ClickHouse, verifica contagem zero e só então elimina as relações no PostgreSQL; falhas permanecem visíveis e podem ser repetidas.
14. Para Syslog A10 encaminhado por Log Receiver ou HA, a identidade do equipamento vem do remetente IPv4 explícito no cabeçalho RFC5424; o endereço de transporte também é preservado para auditoria do caminho percorrido.
15. Um coletor Cloud gerenciado recebe um par exclusivo por tenant: uma porta UDP para NetFlow/IPFIX e a seguinte para Syslog. O par define tenant e coletor antes do parsing; IPs de origem e templates NetFlow iguais em clientes diferentes permanecem isolados.
16. Administradores globais pertencem a um tenant interno sem dados operacionais. Eles iniciam no contexto da plataforma e precisam selecionar explicitamente um cliente antes de acessar consultas, logs, equipamentos ou coletores.
17. A troca de contexto é mantida no servidor, nunca em parâmetro livre do navegador, e registra tanto a entrada no ambiente quanto o retorno à plataforma na auditoria global.
18. O firewall de ingestão usa o IP de transporte observado no socket UDP para autorizar a origem. Esse endereço não substitui o IP lógico do exportador usado para identificar Cisco/A10. Coletores Cloud começam em monitoramento e só podem bloquear após existir ao menos uma origem autorizada.
19. A API só confirma um lote depois de verificar os IDs persistidos e gravar no ClickHouse um comprovante indexado contendo `batch_id`, checksum e contagens. O coletor valida esse comprovante antes de retirar a entrega da fila.

## Fluxo híbrido

```text
usuário -> HTTPS 443 -> Caddy (TLS automático) -> Nginx Web -> API

equipamento -> UDP -> coletor -> SQLite -> lote HTTPS -> API -> ClickHouse
                                 -> heartbeat -> API -> PostgreSQL (fila e saúde atual do servidor)
                                                  -> ClickHouse (histórico de recursos por 48 horas)
                                                        -> PostgreSQL (controle)

backup -> pg_dump diário + ClickHouse completo semanal/incremental diário + snapshot SQLite comprimido -> volume isolado

consulta -> API -> ClickHouse -> resposta/exportação

relatório para ofício -> fila PostgreSQL -> confirmação do evento ClickHouse -> PDF auditado

integração futura -> API do ERP sob demanda, sem replicar a base de assinantes

dashboard do cliente -> API -> agregações tenant-aware no ClickHouse -> indicadores temporais

dashboard da plataforma -> PostgreSQL -> clientes, coletores, equipamentos e usuários -> acesso auditado ao tenant escolhido

firewall Cloud -> observa remote.address -> PostgreSQL (origens e política) -> coletor aplica allowlist antes do parsing
```

As sessões ficam no PostgreSQL com apenas o hash do token. Para um administrador global, a sessão mantém separadamente o tenant interno de origem e o cliente ativo; sem cliente ativo, as rotas operacionais respondem `tenant_context_required`. As chaves individuais dos coletores também são persistidas somente como SHA-256 e podem ser revogadas isoladamente. O navegador recebe um cookie `HttpOnly` e `SameSite=Strict`; login, logout, troca de contexto, consultas, exportações e alterações de cadastros geram trilha de auditoria.

O modo cloud-only utiliza o mesmo processo coletor executado na nuvem, com listeners provisionados automaticamente e sem credencial entregue ao cliente. Sempre que possível, o tráfego UDP do equipamento deve chegar por VPN ou rede privada.

## Retenção

- ClickHouse: 13 meses contados a partir de `received_at`.
- Histórico de recursos no ClickHouse: 48 horas contadas a partir de `sampled_at`.
- SQLite local: eventos confirmados permanecem por 24 horas por padrão; eventos não confirmados não expiram.
- Auditoria PostgreSQL: política independente a ser definida com o responsável jurídico e de segurança.
- Backups operacionais: um ponto a cada 24 horas, com 15 pontos diários por padrão; ClickHouse completo a cada sete dias e incremental nos demais, mantendo a base enquanto houver incremental dependente. Essa janela é configurável e não altera a retenção legal do ClickHouse.

## Evolução para dois datacenters

- API e coletor cloud sem estado persistente fora do spool.
- Identificadores globais gerados na borda.
- Inserções em lotes reproduzíveis, com checksum, contagem esperada e comprovante durável por servidor.
- O caminho normal consulta `ingest_batch_receipts`, ordenada por `batch_id`; somente lotes sem comprovante inspecionam as tabelas extensas.
- Escritas interrompidas são retomadas pelos IDs ausentes. `ReplacingMergeTree` e tokens de deduplicação convergem reenvios do mesmo identificador.
- Espelhamento assíncrono incremental do ClickHouse com checkpoint persistente,
  sem exigir Keeper ou uma terceira VM.
- Configuração externa por variáveis de ambiente, sem endereços de infraestrutura no código.
