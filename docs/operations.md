# Operação do ambiente

## Endereços e portas da plataforma

- Interface publicada: URL configurada em `ARGUS_PUBLIC_URL`
- API: `http://127.0.0.1:8080`
- Coletores Cloud: pares UDP atribuídos automaticamente pelo painel, usando
  `30000–31999` na VM principal e `32000–33999` na VM redundante por padrão
- Coletores locais (Edge): portas UDP da própria VM Edge, normalmente
  `2055/UDP` para NetFlow/IPFIX e `5140/UDP` para Syslog

Somente a interface autenticada está publicada pelo Caddy em 80/443. O proxy escuta em `0.0.0.0` e permite o acesso direto de qualquer IP de origem, sem túnel SSH. A API direta permanece em loopback; a interface a acessa pelo proxy interno. Com domínio público, o Caddy emite, valida e renova o certificado automaticamente.

O administrador inicial é definido por `ARGUS_BOOTSTRAP_ADMIN_EMAIL` e `ARGUS_BOOTSTRAP_ADMIN_PASSWORD` no `.env`. O arquivo deve permanecer com permissão `600`. O sistema não registra a senha em texto aberto no PostgreSQL; somente o hash scrypt é armazenado.

Na opção **Usuários**, administradores podem criar contas, definir perfis e ativar/desativar acessos. Uma conta nunca é apagada pela interface, preservando suas referências de auditoria. O sistema impede que um administrador remova o próprio privilégio e impede a desativação do último administrador ativo.

Perfis:

- `Administrador`: acesso operacional, auditoria e gestão de usuários;
- `Auditor`: consultas, exportações, monitoramento e leitura da auditoria;
- `Operador`: consultas, exportações e monitoramento, sem gestão de usuários ou auditoria global.

A troca de senha revoga todas as sessões do usuário e exige novo login.

## Recuperação de senha

O link **Esqueci minha senha** envia uma URL temporária ao e-mail da conta. O token é armazenado somente como SHA-256, expira em 30 minutos por padrão, funciona uma única vez e revoga todas as sessões depois da troca. A resposta da API é a mesma para e-mails existentes e inexistentes.

O administrador global configura e testa o envio em **Plataforma → Configurações**. A senha SMTP é criptografada antes de ser salva no PostgreSQL e não é devolvida ao navegador. Deixar o campo de senha vazio durante uma edição preserva a credencial já armazenada.

As variáveis no `.env` continuam disponíveis como configuração inicial de emergência, usada somente enquanto nenhuma configuração tiver sido salva pelo painel:

```dotenv
ARGUS_PUBLIC_URL=https://logvault.exemplo.com.br
ARGUS_PASSWORD_RESET_TTL_MINUTES=30
ARGUS_SMTP_HOST=smtp.exemplo.com.br
ARGUS_SMTP_PORT=587
ARGUS_SMTP_SECURE=false
ARGUS_SMTP_USER=argus@exemplo.com.br
ARGUS_SMTP_PASSWORD=senha-do-smtp
ARGUS_SMTP_FROM=LogVault <logvault@exemplo.com.br>
```

Use TLS direto, normalmente na porta 465, quando o servidor exigir conexão segura desde o início. Na porta 587, selecione STARTTLS/automática para que o transporte faça a elevação oferecida pelo servidor. Depois de salvar, envie um teste pela própria tela antes de ativar a recuperação.

## Auditoria

A tela **Auditoria** reúne autenticação, consultas CGNAT, exportações e alterações de usuários, equipamentos e coletores. Cada exportação mantém o formato, a consulta de origem e o SHA-256 do arquivo. O tenant é aplicado no servidor a partir da sessão.

## Dashboard

Para usuários de clientes, o **Dashboard** é a tela inicial e sempre usa o tenant da sessão. Os filtros disponíveis são 24 horas, 7 dias e 30 dias. Os totais e destaques consideram somente `allocated` e `deallocated` normalizados a partir de ações explícitas dos equipamentos; uma alocação ainda ativa pode existir sem desalocação correspondente.

O administrador global inicia no **Dashboard da plataforma**, que resume clientes ativos, coletores, equipamentos e usuários. Nenhum dado CGNAT fica associado implicitamente à conta global. Para atuar, use **Acessar ambiente** no Dashboard ou em **Clientes**; o menu passa a mostrar a operação daquele ISP e o cabeçalho identifica o contexto. **Voltar para a plataforma** encerra o contexto do cliente. Entrada e saída são registradas na auditoria global.

Os destaques por IP são ordenados pela quantidade de eventos, sem somar portas ou tentar calcular portas simultaneamente ativas. O número de registros brutos pode ser menor que o de eventos porque um único pacote NetFlow pode carregar vários registros CGNAT.

## Fuso horário das consultas

O campo **Fuso horário** da tela **Consulta** oferece o fuso cadastrado para o cliente e UTC. A data e a hora digitadas são interpretadas no fuso selecionado e convertidas pela API para UTC; a configuração regional do computador do usuário não interfere no resultado. Depois da pesquisa, a interface mostra tanto o horário informado quanto o instante UTC auditado. O PDF também registra os dois valores.

Os eventos Cisco usam o timestamp epoch em milissegundos do IE 323 e os eventos A10 usam o timestamp ISO 8601/RFC5424 com offset. Ambos são normalizados para UTC em `event_at`. `received_at` também é UTC. O conteúdo original de cada NetFlow/Syslog permanece no registro bruto, inclusive o timestamp original enviado pelo equipamento.

## Relatório para ofício

Após uma consulta, use **Relatório para ofício** na linha exata do registro desejado. Número do ofício/processo, órgão solicitante e observações são opcionais. O pedido aparece em **Relatórios para ofício** como `Na fila`, `Preparando`, `Pronto` ou `Falhou`; quando estiver pronto, use **Baixar PDF**.

O PDF desta etapa contém o cabeçalho cadastrado em **Dados da empresa**, os horários local e UTC e somente o registro CGNAT selecionado. Como o ERP ainda não está integrado, o documento informa que o assinante não foi identificado. Não são criados campos de início/fim de sessão, RADIUS ou dados cadastrais ausentes.

## Comandos rotineiros

```bash
docker compose ps
docker compose logs --tail=200 api collector
docker compose restart api collector web
docker compose up -d
docker compose down
```

`docker compose down` mantém os volumes. Não use a opção `-v`, pois ela remove os bancos e o spool.

Os containers possuem política `restart: unless-stopped`. O Docker está habilitado no boot do host.

## Liberação para equipamentos reais

Para um **coletor local (Edge)**, configure as portas na VM local e permita
entrada somente dos IPs dos equipamentos autorizados. O modelo entregue pelo
painel utiliza, por padrão:

```dotenv
ARGUS_NETFLOW_PORT=2055
ARGUS_SYSLOG_PORT=5140
```

No firewall da VM Edge, restrinja `2055/UDP` e `5140/UDP` às origens dos
equipamentos. A VM Edge precisa apenas de saída HTTPS até a API do LogVault;
ela pode permanecer atrás de NAT e não requer uma porta de administração
aberta pela plataforma.

Para um **coletor Cloud**, não configure Edge nem abra `2055/5140` no DC-A.
Crie o coletor no painel e use os pares específicos exibidos. No firewall
externo, permita `30000–31999/UDP` na VM principal e `32000–33999/UDP` na VM
redundante, restringindo as origens quando possível. Depois, cadastre cada IP
de origem pela opção **Equipamentos**. O cadastro chega ao coletor no próximo
heartbeat (até 10 segundos) e fica persistido no SQLite.

Uma origem ainda não cadastrada não é descartada nem atribuída ao equipamento padrão: o bruto fica temporariamente associado a uma identidade técnica isolada e o coletor emite um alerta por IP. Use **Descobrir equipamentos** ou faça o cadastro manual para que os próximos pacotes sejam associados ao equipamento correto.

A opção **Excluir** usa exclusão lógica: remove o equipamento da lista ativa e da configuração do coletor, mas preserva sua identificação para logs e auditorias históricas. O mesmo IP de origem pode ser cadastrado novamente depois. A ação exige confirmação e fica registrada na Auditoria.

`ARGUS_DEVICES_JSON` é usado como fallback de primeira inicialização, antes de existir configuração sincronizada. Depois do primeiro heartbeat válido, o cadastro persistido prevalece durante reinícios sem acesso à API.

O endereço `192.168.25.103` foi entregue por DHCP. Configure uma reserva DHCP para a VM antes de apontar os equipamentos, evitando que o destino de coleta mude.

## Atualização da aplicação

```bash
npm test
docker compose up --build -d
docker compose ps
```

O coletor mantém dados não confirmados no SQLite durante a reconstrução da API.

## Estado dos equipamentos

A opção **Equipamentos** usa o horário do último registro bruto efetivamente armazenado:

- `Recebendo`: último pacote há no máximo 5 minutos;
- `Atrasado`: entre 5 minutos e 1 hora;
- `Sem recebimento`: há mais de 1 hora;
- `Nunca recebido`: não existe registro bruto para o equipamento.

A tela também mostra eventos normalizados e falhas de parsing nas últimas 24 horas. Esses estados não criam eventos CGNAT nem inferem alocação ou desalocação.

Em A10 HA, datagramas contendo somente `A10` são sondas de saúde. O conteúdo bruto é preservado para auditoria e capacidade, mas a sonda não é vinculada a um equipamento cadastrado, não atualiza seu estado de recebimento e não conta como falha de parsing ou evento CGNAT.

Eventos A10 `PortAllocated/PortFreed` cujo protocolo esteja em `ARGUS_A10_IGNORED_PROTOCOLS` são descartados pelo coletor antes de chegar ao spool. O padrão atual é `GRE,ESP`. TCP e UDP nunca devem ser incluídos nessa lista, pois são o núcleo da correlação CGNAT por portas.

## Estado dos coletores

### Coletor Cloud gerenciado

Ao criar um coletor no modo **Cloud gerenciado**, o cliente não instala nenhum serviço e não recebe credencial. O servidor principal atribui automaticamente o próximo par livre: a primeira porta UDP recebe NetFlow/IPFIX e a segunda recebe Syslog CGNAT. Apenas os pares atribuídos ficam com sockets ativos; o Docker não publica antecipadamente todo o intervalo.

O equipamento envia Flow e Syslog para as respectivas portas exibidas. O par separa o ambiente antes do parsing, permitindo que clientes diferentes utilizem os mesmos IPs de origem sem misturar tenants, equipamentos ou templates NetFlow. Inicialmente cada cliente pode manter um coletor Cloud ativo. Coletores Edge continuam usando credenciais próprias e podem existir em paralelo.

Na composição principal, configure a faixa reservada na API:

```dotenv
ARGUS_MANAGED_CLOUD_ENABLED=true
ARGUS_MANAGED_CLOUD_PORT_START=30000
ARGUS_MANAGED_CLOUD_PORT_END=31999
ARGUS_MANAGED_CLOUD_SECONDARY_PORT_START=32000
ARGUS_MANAGED_CLOUD_SECONDARY_PORT_END=33999
```

Cada faixa possui 2.000 portas e comporta 1.000 pares de coleta. Para cada
cliente, a API reserva automaticamente um par na faixa principal e outro par
na faixa redundante. O processo de cada VM abre somente os sockets que lhe
foram atribuídos. No firewall externo, permita `30000:31999/UDP` somente na VM
principal e `32000:33999/UDP` somente na VM redundante; restrinja as origens aos
IPs públicos ou redes privadas dos equipamentos sempre que possível.

O coletor envia heartbeat a cada 10 segundos com métricas calculadas diretamente no SQLite local: registros/eventos/lotes pendentes, item pendente mais antigo, tamanho do spool, último sincronismo e último erro. O mesmo heartbeat inclui CPU, RAM, armazenamento do filesystem do spool, sistema operacional e tempo ligado do servidor.

O SQLite usa `busy_timeout` para aguardar operações curtas de backup ou manutenção. Se o arquivo permanecer ocupado, a sincronização é adiada e tentada novamente sem encerrar o processo nem descartar o spool.

- `Conectado`: heartbeat recebido em até 30 segundos;
- `Atrasado`: entre 30 segundos e 5 minutos;
- `Desconectado`: há mais de 5 minutos;
- `Nunca conectado`: nenhuma telemetria recebida.
- `Desativado`: a credencial está bloqueada e a API recusa heartbeat e lotes.

O PostgreSQL mantém somente o estado mais recente de cada coletor. Cada leitura de recursos também gera uma amostra no ClickHouse para os gráficos operacionais. Se a API ou a internet cair, o coletor continua recebendo UDP e gravando no SQLite. Ao restabelecer a conexão, o heartbeat e os lotes retomam automaticamente.

## Saúde dos servidores

A opção **Servidores** mostra o servidor principal e um cartão para cada coletor cadastrado no tenant. A API mede a VM principal; cada coletor mede o servidor em que está executando. A tela atualiza automaticamente a cada 15 segundos. O gráfico permite selecionar o servidor e consultar 5 minutos, 30 minutos, 1 hora ou 24 horas, exibindo valor atual, média e pico de CPU, RAM e armazenamento.

As amostras históricas são gravadas a cada 10 segundos e removidas automaticamente do ClickHouse após 48 horas. A API consolida os pontos em intervalos maiores para as janelas longas. Uma ausência de heartbeat aparece como lacuna, não como valor zero nem como uma continuidade presumida.

Limites iniciais:

- CPU: atenção a partir de 80% e crítico a partir de 95%;
- RAM e armazenamento: atenção a partir de 85% e crítico a partir de 95%;
- heartbeat: atrasado depois de 30 segundos e offline depois de 5 minutos.

Em Docker sem limites de recursos, CPU e RAM refletem o host visível ao container. O armazenamento local corresponde ao filesystem que contém o spool; no servidor principal corresponde ao filesystem do volume de backups, que na composição padrão compartilha o disco dos volumes persistentes.

### Provisionamento e rotação

Na tela **Coletores**, um administrador pode criar um cadastro em modo local (`edge`) ou nuvem (`cloud`). A configuração exibida contém `ARGUS_TENANT_ID`, `ARGUS_COLLECTOR_ID`, a chave individual e as URLs de sincronismo/heartbeat. A chave aparece uma única vez; somente seu hash fica no PostgreSQL.

Ao rotacionar, a chave anterior é revogada imediatamente. Primeiro copie a nova configuração, atualize o `.env` do servidor correspondente e reinicie somente aquele coletor. Enquanto ele estiver sem uma credencial válida, os pacotes continuam no spool local e não são descartados.

Desativar bloqueia a ingestão daquele coletor sem apagar seu cadastro, telemetria, lotes anteriores, equipamentos ou logs históricos. Excluir usa exclusão lógica, revoga a credencial e remove o coletor das listas ativas, mas mantém todas as referências históricas. A exclusão é bloqueada enquanto existir qualquer equipamento não excluído vinculado; mova-o para outro coletor ou exclua-o primeiro. Todas essas ações ficam na trilha de auditoria.

## Dados persistentes

Em uma instalação nova, o assistente sugere um diretório único no host e cria os diretórios persistentes necessários:

- `/var/lib/logvault/postgres`: configuração e auditoria.
- `/var/lib/logvault/clickhouse`: registros brutos e eventos CGNAT.
- `/var/lib/logvault/collector`: spool local e templates NetFlow.
- `/var/lib/logvault/backups`: pontos de restauração locais.
- `/var/lib/logvault/tenant-backups`: pacotes lógicos solicitados pelos clientes.
- `/var/lib/logvault/backup-staging`: área temporária privada para criptografia e envio externo.

Ao selecionar `docker` no instalador, os equivalentes são volumes nomeados, incluindo `argus_postgres-data`, `argus_clickhouse-data`, `argus_collector-data`, `argus_backup-data`, `argus_tenant-backup-data` e `argus_backup-staging-data`. Os caminhos efetivos ficam registrados em `ARGUS_*_DATA_PATH` no `.env`; não os altere com a stack em execução.

Os logs stdout dos containers usam rotação local de 20 MB, com até cinco arquivos por serviço.

## Backup

O serviço `backup` executa imediatamente ao iniciar e depois repete no intervalo configurado:

```dotenv
ARGUS_BACKUP_INTERVAL_HOURS=24
ARGUS_BACKUP_RETENTION_DAYS=15
ARGUS_BACKUP_FULL_INTERVAL_DAYS=7
```

Cada execução cria um ponto restaurável no diretório ou volume indicado por `ARGUS_BACKUP_DATA_PATH`:

- dump consistente do PostgreSQL em formato customizado e comprimido;
- backup nativo completo do ClickHouse a cada sete dias e incremental nos demais dias;
- snapshot online e comprimido do SQLite do coletor, incluindo itens ainda não sincronizados;
- metadados, marcador de conclusão e checksums dos arquivos PostgreSQL/SQLite.

As execuções são serializadas por um lock no volume de backup: se a rotina automática e uma solicitação manual coincidirem, uma aguarda a outra em vez de gerar duas cópias simultâneas.

Os 15 dias representam pontos de restauração, e não necessariamente a idade máxima de todos os arquivos físicos. Um backup completo só é removido depois que o último incremental dependente dele expira; com a configuração padrão, uma base pode permanecer por aproximadamente 21 dias. O dump do PostgreSQL e o snapshot SQLite continuam completos em cada ponto, permitindo validar e recuperar esses componentes de forma independente.

A opção **Sistema** mostra o último backup, tamanhos, histórico recente e alerta quando a rotina falha ou fica fora da janela esperada. Para executar uma cópia adicional manualmente:

```bash
docker compose exec -T backup /usr/local/bin/backup-once.sh
docker compose logs --tail=100 backup
```

### Alertas externos

Na opção **Alertas**, administradores podem manter simultaneamente um webhook HTTP/HTTPS genérico, um webhook de canal do Discord e um bot do Telegram. Cada canal possui credencial, ativação, severidade mínima, origens (equipamentos, coletores, fila, parsing, backups e servidores), intervalo de repetição, teste e aviso de recuperação independentes. Alterar ou excluir um canal não modifica os demais nem os alertas internos do painel.

No Discord, informe a URL criada nas integrações do canal. No Telegram, crie o bot pelo BotFather e informe o token e o `chat_id` da conversa, grupo ou canal; o bot precisa ter acesso ao destino. O webhook genérico recebe `POST` em JSON com `event` (`test`, `triggered`, `reminder` ou `resolved`), instante UTC, identificação do cliente e dados do alerta. Discord e Telegram recebem mensagens formatadas nativamente.

O botão **Enviar teste** usa a configuração já salva. Respostas fora de `2xx`, redirecionamentos e tempos acima de 10 segundos são considerados falha. Alertas ativos são deduplicados no PostgreSQL e só reaparecem depois do intervalo escolhido; falhas de entrega são tentadas novamente na avaliação seguinte. URLs e tokens são cifrados no PostgreSQL, mas ficam visíveis para administradores autenticados na tela de configuração. Defina `ARGUS_ALERT_ENCRYPTION_KEY` com pelo menos 32 caracteres; quando ausente, instalações existentes usam temporariamente `ARGUS_SYNC_TOKEN` para compatibilidade.

Administradores da plataforma também podem baixar, na mesma tela, um pacote `.tar.gz` restaurável. O pacote é compactado e transmitido diretamente do backup concluído, sem manter outra cópia permanente na VM, e contém `checksums.sha256` para validar todos os arquivos. Ao baixar um ponto incremental, o pacote inclui automaticamente tanto a base completa quanto o incremental:

```bash
tar -xzf logvault-backup-20260807T180000Z.tar.gz
cd 20260807T180000Z
sha256sum -c checksums.sha256
```

O início de cada download é registrado na trilha de auditoria com usuário, backup, volume e IP de origem. O arquivo reúne tudo o que é necessário para restaurar o ponto escolhido e deve ser armazenado como dado sensível.

No contexto de um cliente, a mesma tela não expõe o backup global. Um administrador do tenant pode solicitar um pacote lógico que contém somente seus cadastros, auditorias e registros no PostgreSQL e ClickHouse. Hashes de senha e chaves de coletores, sessões, tokens, segredos de integração e payloads binários de relatórios/logotipos são excluídos. O `.tar.gz` local fica disponível por sete dias e inclui manifesto e hashes SHA-256; esse pacote serve para portabilidade e recuperação controlada de um tenant, não substitui o ponto completo usado pelo procedimento automático de restauração da plataforma.

Os backups locais protegem contra corrupção e erros operacionais, mas continuam na mesma VM. Para tolerar perda completa do host, replique o caminho definido em `ARGUS_BACKUP_DATA_PATH` para outro servidor ou storage. Isso pode ser feito sem serviço pago, por exemplo com cópia periódica via SSH/rsync para outro equipamento do cliente.

### Cópia criptografada no Google Drive

Na plataforma, abra **Sistema → Google Drive**. Informe uma pasta pertencente a um **Drive compartilhado do Google Workspace**, o JSON de uma conta de serviço com acesso de colaborador e uma frase de recuperação com pelo menos 20 caracteres. Contas de serviço não possuem cota própria no “Meu Drive”, por isso uma pasta pessoal compartilhada não é aceita. O teste cria e remove um arquivo de prova antes de liberar o destino.

O JSON e a frase ficam cifrados no PostgreSQL. Guarde uma cópia da frase fora da VM e do próprio Drive: ela não volta a ser exibida e, sem ela, os arquivos externos não podem ser recuperados. Depois de salvar, execute **Testar conexão** e habilite o envio. O processador envia automaticamente o ponto completo mais recente — incluindo a base exigida por um incremental — usando upload retomável, e exclui do Drive somente arquivos LogVault mais antigos que a retenção configurada. Uma falha externa não remove nem invalida o backup local.

O administrador de um cliente pode marcar **Enviar também ao Google Drive da plataforma** ao criar seu pacote. O backend fixa o tenant pela sessão, sem aceitar um identificador de cliente enviado pelo navegador. Usuários operadores e auditores podem consultar o estado, mas não gerar nem baixar o arquivo.

Todo arquivo enviado termina em `.lvault` e usa AES-256-GCM com chave derivada por scrypt. Para recuperar um arquivo, crie um arquivo privado contendo somente a frase, com permissão `0600`, e execute no checkout da mesma versão ou de uma posterior:

```bash
node scripts/decrypt-backup.mjs \
  logvault-platform-20260929T120000Z.tar.gz.lvault \
  logvault-platform-20260929T120000Z.tar.gz \
  /root/logvault-backup.pass
```

Se a frase estiver errada ou o arquivo tiver sido alterado, a autenticação falha e a saída parcial é removida. Depois de descriptografar um backup da plataforma, extraia o pacote em uma área privada, confira os checksums internos e siga o procedimento de restauração abaixo.

### Segunda cópia via SSH/rsync

O LogVault possui suporte opcional a uma cópia automática após cada backup local. Crie previamente o diretório no servidor remoto, use um usuário SSH exclusivo e configure no `.env`:

```dotenv
ARGUS_BACKUP_REMOTE_TARGET=argus-backup@10.0.0.20:/srv/argus
ARGUS_BACKUP_REMOTE_PORT=22
```

Coloque a chave privada em `infra/backup/ssh/argus_backup_ssh_key` e o `known_hosts` validado em `infra/backup/ssh/argus_backup_known_hosts`. Esses arquivos são ignorados pelo controle de versão e montados somente no serviço de backup. Recrie o serviço para ativar:

```bash
docker compose up -d --build backup api
docker compose logs --tail=100 backup
```

A tela **Sistema** informa se a cópia externa está atualizada, pendente ou falhou. Uma falha remota não invalida nem apaga o backup local. O LogVault também não apaga automaticamente arquivos no servidor externo; a retenção desse destino deve ser definida de acordo com a capacidade disponível.

### Exclusão definitiva de um cliente

Na área **Clientes**, use **Excluir dados**, digite exatamente o nome do ISP e confirme a ciência sobre os backups. O acesso é bloqueado imediatamente e a exclusão segue em segundo plano. Enquanto houver processamento, a linha mostra o estado; em caso de falha, use **Repetir exclusão**.

A conclusão confirma que PostgreSQL e ClickHouse não mantêm dados ativos do tenant. Ela não reescreve backups compartilhados já concluídos: esses arquivos expiram pela retenção configurada. Se existir cópia externa ou coletor de borda no servidor do cliente, a retenção e a remoção desses locais devem ser executadas nos respectivos servidores.

### Restauração

A restauração substitui os bancos atuais e, por isso, exige confirmação explícita. Consulte o ID na tela **Sistema** e execute em janela de manutenção:

```bash
ARGUS_CONFIRM_RESTORE=RESTORE-20260807T180000Z sh scripts/restore-backup.sh 20260807T180000Z
```

O script valida os checksums, confirma a base exigida por um incremental, para coletor/API/backup, restaura PostgreSQL e ClickHouse e, quando disponível, recupera o snapshot comprimido do spool. Backups antigos com snapshot SQLite sem compressão continuam compatíveis. Em caso de falha parcial, os serviços permanecem parados para evitar gravações sobre uma restauração incompleta.

Além dos bancos, mantenha uma cópia segura do `.env`; as chaves individuais aparecem somente no provisionamento e não podem ser recuperadas a partir dos hashes no PostgreSQL.

### Ensaio de restauração isolada

Para comprovar um backup sem parar ou alterar o LogVault ativo, execute:

```bash
sh scripts/restore-test.sh latest
```

O ensaio usa somente o arquivo `compose.restore-test.yaml`, o projeto Docker fixo `argus-restore-test` e os volumes `argus-restore-test-*`. PostgreSQL, ClickHouse e SQLite são restaurados separadamente; nenhuma porta é publicada. A origem configurada em `ARGUS_BACKUP_DATA_PATH` é a única dependência do ambiente ativo e é montada somente para leitura.

O script valida checksums, cadeia incremental, estrutura do dump PostgreSQL, integridade e unicidade do ClickHouse, vínculos entre eventos e brutos, chaves estrangeiras e `PRAGMA integrity_check` do spool. Ao concluir, grava um relatório local privado em `restore-tests/<ID>.txt`, para os containers e preserva os volumes isolados. Para removê-los depois da inspeção:

```bash
sh scripts/restore-test.sh cleanup
```

Em caso de falha, containers e volumes de teste permanecem disponíveis para diagnóstico. O script nunca usa `compose.yaml`, não para API/coletor/backup e não monta os volumes ativos de PostgreSQL, ClickHouse ou coletor.

## Diagnóstico rápido

```bash
docker compose exec -T web wget -qO- http://api:8080/health/ready
docker compose exec -T postgres psql -U argus -d argus -c "SELECT status, count(*) FROM sync_batches GROUP BY status"
```

Um retorno `{"status":"ready"}` confirma conectividade da API com PostgreSQL e ClickHouse.

## Discovery de equipamentos

Na opção **Equipamentos**, administradores podem usar **Descobrir equipamentos**, escolher um coletor e iniciar uma janela passiva de dois minutos. O LogVault não varre a rede e não consulta registros anteriores: somente os pacotes com `received_at` entre o clique de início e o término da sessão são analisados.

Ao final, origens já cadastradas são omitidas e cada equipamento novo aparece como sugestão editável. A confirmação utiliza o cadastro manual existente e continua sujeita ao limite do plano. No A10 com RFC5424, a sugestão usa o remetente declarado e mostra separadamente o IP de transporte; datagramas de health check contendo somente `A10` permanecem brutos, mas não são sugeridos como equipamentos.

## Firewall de ingestão

O menu **Firewall** mostra as portas UDP dos coletores Cloud, o endereço de transporte observado, os protocolos recebidos e as origens autorizadas. Novos coletores permanecem em **Monitoramento**: os pacotes são contabilizados, mas nenhum é bloqueado.

Antes de selecionar **Proteção ativa**:

1. mantenha o equipamento exportando durante uma janela representativa;
2. confirme que o endereço observado corresponde ao IP público/NAT esperado;
3. autorize o IP individual (`/32`) ou, somente quando necessário, uma rede CIDR controlada;
4. ative a proteção e aguarde a interface confirmar que a política foi aplicada pelo coletor;
5. acompanhe os contadores de recebidos e bloqueados.

O IP usado no cadastro do equipamento continua sendo a identidade lógica do exportador. Para A10, ele pode vir do remetente RFC5424; a allowlist sempre usa o IP visto pela conexão UDP. Em um coletor Edge, as regras pertencem à VM local do cliente e o LogVault apenas informa que a proteção deve ser administrada nesse servidor.

Alterações de modo, inclusões e remoções de origens são registradas na trilha de auditoria. O sistema impede ativar a proteção sem autorização e também impede remover a última origem enquanto a proteção estiver ativa.

## Perfis de acesso da plataforma

A conta administrativa criada na instalação é o **Administrador principal** e sempre conserva acesso total. No menu **Usuários** da plataforma, outros acessos administrativos podem receber perfis reutilizáveis com um dos seguintes níveis para cada menu:

- **Sem acesso**: o menu não aparece e a API recusa a operação;
- **Visualizar**: permite abrir e consultar o módulo, sem executar alterações;
- **Gerenciar**: permite visualizar, cadastrar, editar, ativar, desativar ou excluir conforme as regras do módulo.

As permissões são verificadas no backend em todas as requisições da plataforma. Portanto, ocultar o menu no navegador não é o mecanismo de segurança. Alterações em um perfil passam a valer para as sessões ativas na requisição seguinte. Perfis em uso não podem ser excluídos, e um administrador não pode reduzir o próprio perfil.

## Capacidade e dimensionamento

A opção **Capacidade** é disponibilizada para administradores e auditores. O cálculo usa somente medições armazenadas pelo ambiente:

- taxas de registros brutos e eventos nas janelas de 5 minutos, 1 hora e 24 horas;
- maior pico por segundo observado nas últimas 24 horas;
- bytes físicos por registro, calculados a partir das partes ativas do ClickHouse;
- volume por equipamento e projeção para 13 meses;
- bytes por registro no SQLite informados pelo heartbeat do coletor;
- estimativa do spool para a janela offline configurada, inicialmente 6 horas;
- média, percentil 95 e máximo da duração das consultas nas últimas 24 horas.

Para não dimensionar o ambiente usando uma janela momentaneamente ociosa, a projeção diária adota a maior taxa entre 5 minutos, 1 hora e 24 horas. Essas janelas são ancoradas no último registro recebido por equipamento: se a coleta parar, a última medição útil permanece estável; quando novos logs chegarem, ela volta a avançar automaticamente. A recomendação de armazenamento e spool acrescenta 30% de margem e mostra essa margem explicitamente na interface.

Esses números só representam corretamente uma instalação depois que cada equipamento transmitir tráfego típico por um período representativo. Antes de fechar planos e infraestrutura, mantenha os flows ativos durante horários de pico e fora de pico e compare a evolução do painel.

## Exclusão de usuários

A ação **Excluir** na tela **Usuários** realiza exclusão lógica. A conta desaparece da gestão, fica impedida de autenticar e tem todas as sessões revogadas. Os registros de consultas, exportações e auditoria permanecem associados ao identificador histórico do usuário.

Por segurança, o sistema rejeita a exclusão da própria conta e a exclusão do último administrador ativo. Depois da exclusão, o mesmo endereço de e-mail pode ser cadastrado novamente, produzindo um novo UUID e uma trilha histórica independente.
