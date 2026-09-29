# LogVault

MVP executável para coleta, retenção, consulta e exportação auditável de eventos CGNAT.

## Instalação em uma VM — guia passo a passo

Este repositório contém somente o código e os modelos de configuração. Ele não
inclui banco de dados, logs CGNAT, backups, senhas, tokens ou arquivos `.env` de
nenhuma instalação. O instalador gera as credenciais internas diretamente na
VM e salva a configuração local com permissão `0600`.

## Topologia de coleta: escolha por cliente

Cada cliente pode usar um coletor **local (Edge)**, um coletor **Cloud
gerenciado** ou ambos. A escolha é feita no painel em **Coletores** e define
onde os dados chegam primeiro.

```text
COLETOR LOCAL (EDGE)                         COLETOR CLOUD GERENCIADO

equipamentos do cliente                      equipamentos do cliente
        | UDP                                        | UDP pela Internet, VPN ou rede privada
        v                                            v
VM local do cliente                            VM principal do LogVault
coletor + SQLite persistente                   coletor Cloud gerenciado
        | HTTPS de saída                               | SQLite persistente
        v                                            v
API LogVault  <------------------------------------> API LogVault
```

**Local (Edge).** O painel gera uma credencial individual e um bloco de
configuração. Esse bloco é colado no instalador da VM próxima aos equipamentos.
As portas UDP de NetFlow e Syslog ficam nessa VM local — por padrão, `2055/UDP`
e `5140/UDP`, salvo alteração na configuração do coletor. A VM local abre uma
conexão HTTPS de saída para a plataforma; ela pode ficar atrás de NAT e não
precisa receber conexões administrativas do LogVault.

**Cloud gerenciado.** Não há instalação na infraestrutura do cliente. Ao criar
o coletor no painel, a plataforma reserva automaticamente um par exclusivo de
portas UDP no servidor LogVault: uma para NetFlow/IPFIX e a seguinte para
Syslog. Por padrão, os pares são alocados dentro de `30000–31999` — por
exemplo, `30000/UDP` e `30001/UDP`. Os equipamentos enviam para o DNS/IP público
do LogVault e para as portas exibidas pelo painel.

### Quando o coletor local fica sem internet

O Edge grava cada datagrama recebido em um SQLite persistente antes de tentar o
envio. Enquanto a conexão com a API estiver indisponível, os registros
**pendentes não expiram**: permanecem no disco e são reenviados de forma
idempotente quando a conectividade retorna. Assim, o tempo suportado sem
internet é dado pelo espaço disponível no disco dividido pela taxa de coleta,
e não por um limite automático em horas.

Como referência inicial, dimensione o disco para **ao menos seis horas offline**
na taxa de pico mostrada em **Capacidade**; amplie essa reserva para cobrir a
indisponibilidade máxima que o cliente aceita. Após a confirmação da API, os
dados ainda ficam no SQLite por `24` horas por padrão para reprocessamento e só
então podem ser removidos. Falta de disco, desligamento da VM ou perda do pacote
antes de ele chegar ao Edge não são recuperáveis pelo spool.

### 1. Prepare a VM

Use uma VM nova com **Ubuntu Server 24.04 LTS ou superior** ou **Debian 12 ou
superior**, relógio sincronizado e acesso à internet durante a instalação. Para
produção, comece com pelo menos 8 vCPU, 16 GiB de RAM e discos dimensionados
pela carga indicada na tela **Capacidade**. O DC-B precisa suportar toda a carga
do DC-A.

Você precisará de:

- acesso `root` ou uma conta com `sudo`;
- espaço persistente para PostgreSQL, ClickHouse, spool e backups;
- DNS apontando para a VM caso o painel seja publicado por domínio;
- portas TCP 80 e 443 encaminhadas até a VM para emissão e renovação do
  certificado HTTPS;
- uma rede privada, VPN ou túnel entre DC-A e DC-B caso use continuidade;
- para coletores **Cloud**, a faixa UDP configurada para Cloud — por padrão
  `30000–31999` — encaminhada à VM principal e restrita às origens autorizadas.

As portas UDP de um coletor **local** são abertas somente na respectiva VM
local, não na VM do painel/DC-A.

Conecte-se à VM pelo terminal do seu computador. Substitua o exemplo pelo
usuário e IP reais:

```bash
ssh usuario@IP_DA_VM
```

Depois obtenha uma sessão administrativa:

```bash
sudo -i
```

### 2. Instale Git, Docker Engine e Docker Compose

Os comandos abaixo usam o repositório oficial do Docker e funcionam nas
versões de Ubuntu e Debian indicadas acima:

```bash
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
. /etc/os-release
curl -fsSL "https://download.docker.com/linux/$ID/gpg" \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
docker compose version
```

Os dois últimos comandos devem mostrar as versões instaladas. Se apresentarem
erro, corrija o Docker antes de continuar.

### 3. Clone o LogVault

Instale o projeto em `/opt/logvault`:

```bash
git clone https://github.com/cassianotb/logvault.git /opt/logvault
cd /opt/logvault
chmod +x install.sh scripts/*.sh
```

Não copie um `.env` de outra instalação. Cada VM deve receber suas próprias
credenciais pelo instalador.

### 4. Abra o instalador

Ainda em `/opt/logvault`, execute:

```bash
sudo ./install.sh
```

O menu mostra a versão instalada e oferece quatro ações:

1. **Sistema LogVault** — instala painel, API, PostgreSQL, ClickHouse, serviço
   de coleta Cloud gerenciado e backups na VM principal (DC-A).
2. **Coletor local** — instala somente o coletor em um servidor próximo aos
   equipamentos.
3. **Datacenter B** — prepara a segunda VM como standby e inicia a replicação
   do DC-A para o DC-B.
4. **Atualizar LogVault** — busca a versão mais recente, preserva configuração
   e dados e recria os serviços necessários.

Use as setas e `Enter`, ou pressione o número da opção.

### 5. Primeira instalação do sistema (DC-A)

Escolha **1 — Sistema LogVault**. Tenha estas respostas preparadas:

- nome e e-mail do administrador inicial;
- uma frase-senha com 15 a 256 caracteres;
- retenção dos backups locais — o padrão é 15 dias;
- fuso horário dos equipamentos — normalmente `America/Sao_Paulo`;
- nome descritivo do servidor;
- URL pública do painel, por exemplo `https://logs.seuprovedor.com.br`;
- e-mail usado pelo emissor do certificado HTTPS.

O armazenamento é configurado automaticamente em `/var/lib/logvault`. A
continuidade permanece desativada e as portas dos bancos ficam vinculadas ao
`127.0.0.1`; nenhum dado do DC-B é solicitado nesta primeira instalação.

Antes de confirmar uma URL HTTPS, faça o registro DNS apontar para a VM e
confirme que 80/TCP e 443/TCP chegam até ela. Revise o resumo e confirme. O
assistente cria o `.env`, gera os segredos internos, configura o firewall
local quando UFW ou firewalld estiver ativo, sobe o proxy Caddy, emite o
certificado, valida a URL e constrói os containers. O
arquivo `.env` é confidencial: não envie por mensagem, não copie para o GitHub
e não altere suas permissões.

Confira o resultado:

```bash
cd /opt/logvault
docker compose --env-file .env ps
curl -fsS http://127.0.0.1:8080/health/ready
curl -I https://SEU_DOMINIO
```

Todos os serviços principais, inclusive `proxy`, devem aparecer como ativos.
Abra diretamente a URL informada no instalador e entre com o e-mail e a senha
do administrador. O Caddy redireciona HTTP para HTTPS, encaminha painel e API e
renova o certificado automaticamente. Não é necessário criar túnel SSH: o
proxy escuta em todas as interfaces da VM e aceita qualquer IP de origem nas
portas 80/443. PostgreSQL, ClickHouse e a porta direta da API continuam fora
da publicação pública.

### 6. Instalar um coletor local

Primeiro, entre no painel central, abra **Coletores**, crie um coletor no modo
**Servidor local** e copie todo o bloco de configuração exibido uma única vez.
Na VM do coletor, repita as etapas 1 a 4 e escolha **2 — Coletor local**.

Cole o bloco quando solicitado, pressione `Enter`, digite `FIM` em uma nova
linha e pressione `Enter` novamente. A colagem fica oculta e o instalador cria
`.env.edge` com permissão `0600`, inicia somente o coletor e preserva o spool em
volume persistente. Confirme o heartbeat na tela **Coletores**.

Na VM Edge, permita a entrada UDP somente dos equipamentos autorizados nas
portas exibidas na configuração — normalmente `2055/UDP` para NetFlow/IPFIX e
`5140/UDP` para Syslog. Permita também a saída HTTPS para a URL central. O
coletor não precisa de uma porta TCP de administração aberta para a plataforma.

### 7. Criar um coletor Cloud gerenciado

No painel central, abra **Coletores**, escolha **Cloud gerenciado**, informe o
nome e conclua o cadastro. O painel mostrará imediatamente as duas portas UDP
atribuídas. Configure os equipamentos para enviar NetFlow/IPFIX à primeira e
Syslog à segunda, usando o DNS/IP público do LogVault.

No firewall externo da plataforma, permita o intervalo Cloud configurado —
por padrão `30000–31999/UDP` — apenas das redes ou IPs de origem dos
equipamentos quando essa restrição for conhecida. A própria aplicação também
observa e permite controlar as origens pela tela **Firewall**.

### 8. Instalar o Datacenter B

Instale e valide o DC-A antes do B. Os dois sites devem ter FQDNs estáveis e
conectividade segura. Nunca exponha as portas de banco de dados à internet
aberta.

No painel do DC-A, abra **Administração da plataforma → Continuidade →
Adicionar DC-B**, informe os FQDNs e gere o comando temporário. Execute esse
comando como `root` na VM B. O token expira em 30 minutos e só pode ser usado
uma vez.

Ao gerar o comando, o agente local do DC-A resolve os dois FQDNs, confirma que
o endereço do A pertence à própria VM, vincula os bancos à interface correta e
autoriza somente o IPv4 do B (`/32`). Se UFW ou firewalld estiver ativo, as
portas de replicação também são liberadas somente para esse endereço. A API
não recebe acesso ao socket do Docker.

O instalador do B detecta sistema, CPU, RAM, discos, interfaces e IPs; instala
dependências ausentes; clona este repositório; recebe as credenciais sem
exibi-las; faz a carga inicial do PostgreSQL; e inicia o espelhamento
assíncrono do ClickHouse. Painel, API, proxy HTTPS, coletor e backup do B permanecem
desligados até uma promoção explícita.

Verifique o standby na VM B:

```bash
cd /opt/logvault
sudo scripts/dr-standby.sh status
sudo scripts/dr-standby.sh preflight
```

A instalação e a promoção dos serviços **não alteram DNS, NAT ou VIP**. A
virada de tráfego só deve ocorrer manualmente, depois de confirmar que o DC-A
foi isolado. O procedimento completo está em
[docs/datacenter-b-installation.md](docs/datacenter-b-installation.md).

### 9. Atualizar o LogVault

Na VM que contém o sistema, execute:

```bash
cd /opt/logvault
sudo ./install.sh
```

Escolha **4 — Atualizar LogVault**. O atualizador verifica a branch instalada,
cria um backup adicional no DC-A, preserva `.env`, dados e backups, aplica
as migrações versionadas dos bancos, aceita apenas atualizações fast-forward e
recria os serviços sem remover os volumes persistentes.

### 10. Comandos úteis e solução de problemas

```bash
# Estado dos containers
docker compose --env-file .env ps

# Últimas 100 linhas de log de todos os serviços
docker compose --env-file .env logs --tail=100

# Espaço livre nos discos
df -h

# Teste local do painel e da API
curl -I http://127.0.0.1:8081
curl -fsS http://127.0.0.1:8080/health/ready

# Estado e logs do proxy HTTPS
docker compose --env-file .env ps proxy
docker compose --env-file .env logs --tail=100 proxy

# Versão do instalador
./install.sh --version
```

Se a instalação falhar, não apague `/var/lib/logvault` nem o `.env`. Guarde a
mensagem exibida, consulte os logs acima e corrija a causa antes de executar o
assistente novamente. Uma reconfiguração preserva as credenciais existentes e
salva a configuração anterior em `.env.bak`.

## Componentes

- `collector`: recebe NetFlow v9 e Syslog via UDP, persiste o conteúdo original em SQLite, sincroniza lotes idempotentes e reporta fila, CPU, RAM e armazenamento local por heartbeat.
- `api`: recebe lotes, grava eventos no ClickHouse e mantém configuração, sessões e auditoria no PostgreSQL.
- `web`: autentica o usuário, exibe indicadores CGNAT, gerencia contas, exibe auditoria, monitora equipamentos/coletores, consulta por IP público, data/hora, porta opcional e protocolo; exporta CSV/PDF e gera relatórios para ofício.
- `ClickHouse`: mensagens/pacotes originais e eventos normalizados, com retenção automática de 13 meses.
- `PostgreSQL`: tenants, usuários, equipamentos, coletores, integrações ERP e auditoria.
- `backup`: gera pontos diários consistentes de PostgreSQL, ClickHouse e spool SQLite, com backup completo semanal e incremental diário, download auditado, réplica SSH/rsync opcional e cópia criptografada para Google Shared Drive.
- `proxy`: publica o painel e a API com Caddy, HTTPS automático e renovação do certificado.

O cadastro de assinantes não é copiado. A integração sob demanda com o ERP está prevista, mas ainda não está ativa nesta etapa; consultas e relatórios informam isso explicitamente e não tentam identificar o assinante por inferência.

## Estado atual dos parsers

- A10 Syslog: reconhece o formato `LSN:PortBatchV2...`; `Allocated` e `Freed` são normalizados respectivamente como alocação e desalocação, conforme os dois eventos confirmados no tráfego real. Em topologias com Log Receiver/HA, o equipamento é identificado pelo remetente do cabeçalho RFC5424 e o IP de transporte continua preservado nos campos do vendor. Datagramas de saúde contendo apenas `A10` também permanecem armazenados no formato original, mas são classificados como `health_probe`: não criam evento CGNAT, falha de parser ou atividade falsa no equipamento standby.
- Cisco ASR NetFlow v9: templates e registros BPA são decodificados; eventos 1/2 são normalizados como alocação/desalocação, usando os IEs 8, 225, 4, 230, 323, 361, 363 e 364 confirmados na captura real.

Em ambos os casos, dados desconhecidos continuam armazenados no formato original. O sistema não cria alocações ou desalocações por suposição. A exceção operacional configurada neste ambiente são eventos A10 `PortAllocated/PortFreed` GRE e ESP: por decisão de escopo, eles são descartados antes do spool e não ocupam a retenção. A lista fica em `ARGUS_A10_IGNORED_PROTOCOLS`.

## Desenvolvimento

1. Copie `.env.example` para `.env` e altere as senhas e identificadores.
2. Instale as dependências com `npm install`.
3. Execute os testes com `npm test`.
4. Inicie o ambiente com `docker compose up --build -d`.
5. Abra a URL configurada em `ARGUS_PUBLIC_URL`, entre com o administrador definido no `.env` e verifique a API em `http://localhost:8080/health/ready`.

O menu de instalação usa a identidade Azul elétrico do LogVault, aceita setas,
Enter e atalhos numéricos. Em terminais sem cores ou com `NO_COLOR` definido,
a interface permanece funcional em modo monocromático.

Na instalação do sistema, o assistente solicita a conta administrativa inicial, senha, retenção dos backups, fuso horário e publicação do painel. O armazenamento novo usa automaticamente `/var/lib/logvault`; `--data-root` continua disponível para automações avançadas. Os segredos de PostgreSQL, ClickHouse, ingestão e alertas, além dos identificadores internos, são gerados automaticamente e nunca são exibidos. O `.env` completo é salvo com permissão `0600` e uma reconfiguração preserva credenciais válidas, mantendo também uma cópia `.env.bak`.

Para os dados persistentes, o padrão de uma instalação nova é
`/var/lib/logvault`; em automações, `--data-root docker` permite usar volumes
nomeados. O SSH normalmente utiliza `22/TCP`; o proxy Caddy integrado publica
80/443 e mantém o certificado. Somente o DNS e, quando houver NAT, o
encaminhamento dessas portas pertencem à infraestrutura externa.

Em automações, selecione o perfil sem abrir o menu e acrescente as opções do instalador correspondente:

```bash
sudo ./install.sh system --admin-email admin@example.com --admin-password-file /root/logvault-admin.pass --data-root /var/lib/logvault --public-url https://logs.example.com --acme-email infra@example.com --tls-challenge automatic
sudo ./install.sh collector --config-file /caminho/seguro/collector.env
sudo ./install.sh dc-b --argus-url https://logs.example.com --enrollment-token-file /root/logvault-dcb.token --site-a-host logvault-dca.example.com --site-b-host logvault-dcb.example.com --panel-host logs.example.com --ingest-host ingest.example.com --dr-control-host dr.example.com --yes
```

Proteja o arquivo usado em `--admin-password-file` com permissão `0600` e remova-o do servidor depois de confirmar o primeiro acesso. A senha nunca deve ser passada diretamente como argumento.

No modo interativo do coletor, a configuração gerada no painel pode ser colada diretamente no instalador; o token não é exibido e o `.env.edge` é criado com permissão `0600` após a validação.

No modo DC-B, o token é digitado de forma oculta ou lido de um arquivo privado. O instalador detecta hostname, IP de saída, interface, gateway, CPU, memória, Docker, NTP e os filesystems; instala dependências ausentes, clona a versão indicada pelo DC-A, executa a carga inicial PostgreSQL, inicia o espelhamento assíncrono do ClickHouse e aguarda o sincronismo. API, painel, proxy HTTPS, coletor e backup permanecem desligados. A instalação não promove o standby nem transfere tráfego.

A continuidade de produção usa somente duas VMs: streaming PostgreSQL A → B e espelhamento ClickHouse A → B com checkpoint e lag mensurável. Não há Keeper nem witness. A promoção exige confirmação explícita de fencing e, mesmo concluída, deixa a troca de DNS/NAT para o operador. Consulte [docs/datacenter-b-installation.md](docs/datacenter-b-installation.md).

Use `./install.sh --help` para consultar os modos disponíveis. Os scripts específicos continuam disponíveis para compatibilidade com automações existentes.

O procedimento completo para o primeiro teste está em [docs/homologation.md](docs/homologation.md).
Os comandos de manutenção e a liberação segura para equipamentos estão em [docs/operations.md](docs/operations.md).
O ambiente isolado e o baseline de carga estão documentados em [docs/benchmark.md](docs/benchmark.md).
O pacote de instalação do servidor local está em [docs/edge-installation.md](docs/edge-installation.md).

## Vários equipamentos

Administradores cadastram Cisco/A10 pela tela **Equipamentos**, associando o IP de origem ao coletor. O heartbeat entrega o cadastro ao coletor, que o persiste no SQLite para reinícios sem internet. `ARGUS_DEVICES_JSON` permanece como configuração inicial de emergência antes do primeiro heartbeat. Se um IP não estiver cadastrado, o pacote ainda é preservado sob uma identidade técnica isolada e um único alerta é emitido; assim, a origem desconhecida não atualiza a atividade de um equipamento cadastrado incorretamente.

O cadastro manual permanece sempre disponível. Como alternativa, **Descobrir equipamentos** inicia uma sessão passiva de dois minutos em um coletor escolhido e analisa exclusivamente os logs recebidos entre o início e o fim dessa sessão. Origens já cadastradas e probes A10 que contenham apenas a mensagem de saúde são excluídos das sugestões; o usuário revisa e confirma cada cadastro pelo mesmo formulário manual.

Equipamentos podem ser desativados ou excluídos logicamente. A exclusão retira o exportador do coletor, mas não apaga eventos históricos nem a trilha de auditoria.

## Planos e limite de equipamentos

O catálogo inicial contém planos para 1, até 3, até 5 e uma modalidade personalizada para ambientes acima de 5 equipamentos. O plano e o consumo são exibidos na tela **Equipamentos**, mas não podem ser alterados pelo cliente. O limite é validado transacionalmente pela API para impedir cadastros simultâneos acima do contratado. Equipamentos desativados continuam contando; a exclusão lógica libera a vaga sem apagar logs ou auditoria.

Tenants já existentes e o ambiente de homologação permanecem no plano **Personalizado**, sem limite definido, até que a gestão comercial dos planos seja implementada.

## Gestão de clientes

Administradores da plataforma possuem uma área separada para criar tenants, definir o plano, configurar um limite personalizado acima de cinco equipamentos e criar a primeira conta administrativa do ISP. Administradores comuns de um cliente não recebem acesso a essa área e continuam restritos ao próprio tenant.

Desativar um cliente revoga suas sessões e bloqueia os coletores por meio do estado do tenant, preservando dados e auditoria. Não é permitido reduzir um plano para menos equipamentos do que o cliente já possui. A conta administrativa global reside em um tenant interno, não listado como cliente e sem dados CGNAT; por isso os ambientes comerciais podem ser administrados sem estarem vinculados à conta da plataforma. O e-mail é único entre contas não excluídas porque funciona como identificador global de login.

A área **Clientes** também apresenta a auditoria global de criação, edição, ativação, desativação e troca de plano. O histórico pode ser filtrado por cliente e ação e exportado em CSV; o download recebe hash SHA-256 e também gera um evento na própria trilha.

O catálogo de planos é administrável pela plataforma: planos podem ser criados, renomeados, ter o limite alterado ou ser retirados do catálogo. Um plano atribuído não pode ser excluído até que seus clientes sejam movidos, e uma redução de limite é recusada se algum cliente sem limite específico já utilizar mais equipamentos.

A exclusão de um cliente é assíncrona e irreversível. O tenant é bloqueado imediatamente; em seguida os registros brutos e eventos são removidos e confirmados no ClickHouse, e os cadastros, sessões e auditorias do cliente são apagados do PostgreSQL. A interface exige o nome exato do cliente e ciência sobre backups. Backups compartilhados já existentes podem reter uma cópia por até a janela configurada (15 dias por padrão), e cópias externas seguem a retenção do servidor remoto. Spools em servidores de borda do cliente precisam ser descartados diretamente nesses servidores.

## Coletores e credenciais

Administradores criam, editam, ativam, desativam e excluem logicamente coletores pela tela **Coletores**. Cada coletor recebe uma chave aleatória individual, exibida somente na criação ou rotação. A nuvem armazena apenas o SHA-256 da chave; desativar um coletor bloqueia imediatamente seus heartbeats e lotes sem afetar os demais. A exclusão preserva logs, lotes e auditoria e só é permitida depois que seus equipamentos forem movidos ou excluídos.

`ARGUS_SYNC_TOKEN` continua sendo usado no servidor de borda, mas representa a chave daquele coletor — não uma chave global do ambiente. O coletor inicial do `.env` é migrado automaticamente uma única vez para esse modelo.

## Usuários

Administradores podem criar, editar, ativar, desativar e excluir logicamente usuários. A exclusão revoga imediatamente todas as sessões e retira a conta da lista, mas preserva consultas, exportações e auditoria vinculadas ao UUID histórico. Não é permitido excluir a própria conta nem remover o último administrador ativo. Um e-mail excluído pode ser usado em uma nova conta sem misturar os históricos.

## Licenciamento

Os componentes escolhidos para este MVP não exigem a contratação de licença de banco de dados. Continuam existindo os custos normais da infraestrutura onde ele será executado, armazenamento, backup e tráfego.

A tela **Sistema** separa a proteção por contexto. A plataforma acompanha e baixa o backup completo, configura uma cópia criptografada para Google Shared Drive e sua retenção; o administrador de cada cliente gera somente um pacote lógico do próprio tenant, com opção de envio ao mesmo destino externo. Senhas, sessões, tokens, chaves e segredos não entram no pacote do cliente. Em **Alertas**, administradores acompanham ocorrências e podem manter simultaneamente destinos Webhook, Discord e Telegram, cada um com ativação, teste, severidade, categorias, repetição e recuperação independentes.

A tela **Capacidade** mede taxas, picos, armazenamento, spool para seis horas offline e latência das consultas. As projeções usam a maior carga entre 5 minutos, 1 hora e 24 horas, com margem técnica explícita para orientar o dimensionamento e os futuros planos. Quando a coleta para, as janelas permanecem ancoradas no último recebimento; ao voltar, o cálculo acompanha automaticamente os novos dados.

A tela **Dashboard** agrega os eventos explícitos do ClickHouse em janelas de 24 horas, 7 dias e 30 dias. Ela mostra alocações, desalocações, IPs públicos/privados, destaques por quantidade de eventos e a evolução temporal. Horas ou dias sem eventos permanecem visíveis com valor zero; o painel não reconstrói sessões nem presume desalocações ausentes.

Na **Consulta**, a data e a hora são interpretadas no fuso escolhido explicitamente pelo usuário. O fuso cadastrado no cliente é a opção padrão e UTC permanece disponível para ordens que já informem Tempo Universal. A API realiza e valida a conversão; o fuso do computador não é utilizado. Auditoria, pesquisa e armazenamento normalizado usam UTC, enquanto o payload bruto preserva exatamente o timestamp recebido do equipamento.

Cada correspondência da consulta oferece **Relatório para ofício**. A solicitação é enfileirada, o servidor confirma novamente o evento pelo identificador auditado e gera um PDF imutável com o cabeçalho institucional, os dados da consulta e somente o registro CGNAT selecionado. O documento declara **ERP ainda não integrado — assinante não identificado**. Razão social, CNPJ, endereço, telefone, e-mail e logotipo podem ser mantidos pelo administrador do cliente em **Dados da empresa** ou pelo administrador da plataforma na área **Clientes**. O relatório preserva uma cópia desses dados no momento da geração e recebe hash SHA-256 na auditoria de exportações.

A tela **Servidores** mede CPU, RAM e armazenamento do servidor principal diretamente pela API e recebe as mesmas métricas dos servidores de borda pelo heartbeat de cada coletor. Além da última leitura, o ClickHouse mantém 48 horas de amostras operacionais. O gráfico compara CPU, RAM e armazenamento em janelas de 5 minutos, 30 minutos, 1 hora ou 24 horas, com consolidação automática dos pontos. Servidores desconectados preservam a última leitura e deixam lacunas no histórico durante a ausência de heartbeat.

## Segurança desta etapa

As consultas e exportações exigem sessão autenticada; o tenant é obtido no servidor a partir da sessão e não é aceito da interface. O administrador global inicia sem contexto operacional, seleciona um cliente por **Acessar ambiente** e pode retornar à plataforma a qualquer momento; ambas as ações são auditadas. As sessões usam token aleatório, hash no banco, cookie `HttpOnly`/`SameSite=Strict`, expiração e revogação no logout. A recuperação de senha usa SMTP administrado globalmente em **Plataforma → Configurações**, credencial criptografada, token de uso único armazenado somente como hash e revogação de todas as sessões após a troca. A ingestão vincula cada chave ao tenant e ao `collectorId` correspondentes. Login, troca e recuperação de senha, gestão de usuários/coletores, consultas e exportações permanecem auditados.

O instalador entrega TLS público e mantém os segredos locais em `.env` com
permissão restrita. Antes de uso jurídico em produção, ainda é recomendável
integrar um cofre externo de segredos, programar ensaios de restauração e
configurar os alertas externos de acordo com a operação do cliente.
