# Alta disponibilidade (HA) por dupla ingestão

## Modelo operacional

O LogVault opera com uma autoridade administrativa principal e uma instalação
standby completa. As duas VMs têm API, PostgreSQL, ClickHouse, painel,
coletor Cloud e backups próprios. Não existe replicação direta entre os bancos
nesse modelo.

A VM principal sincroniza por HTTPS somente o plano de controle necessário à
ingestão: clientes, coletores, hashes de credenciais, equipamentos, portas
Cloud e políticas de origem. A standby aceita ingestão e consultas, mas fica
administrativamente somente leitura.

## Instalação

1. Instale a primeira VM com `sudo ./install.sh system`.
2. No painel, abra **Alta Disponibilidade** e selecione **Ativar como principal**.
3. Selecione **Adicionar servidor standby** e copie o código temporário.
4. Em uma VM nova, clone o mesmo repositório, execute `sudo ./install.sh`,
   selecione **Sistema LogVault Standby** e cole somente o código quando solicitado.
5. Confirme no painel principal que a standby apresenta heartbeat recente.
6. Configure cada equipamento Cloud com os dois destinos e seus respectivos
   pares de portas, exibidos no painel. Os pares são distintos para permitir
   exportadores que exigem uma porta diferente por destino. Por padrão, a VM
   principal usa `30000–31999/UDP` e a standby usa `32000–33999/UDP`.
7. Gere novamente a configuração dos coletores locais; ela passa a incluir as
   URLs e o token do destino standby.

O pareamento exige HTTPS. `--allow-insecure-http` existe somente para um
laboratório isolado e nunca deve ser usado na Internet.

## Semântica da fila do coletor local

Cada lote possui uma entrega para `primary` e outra para `secondary`. Tentativas,
erros e confirmações são independentes. Um destino indisponível não impede o
outro de avançar; o lote original permanece no SQLite até que todos os destinos
ativos confirmem a gravação. Cada confirmação contém o checksum e as contagens
do comprovante local do ClickHouse; uma resposta HTTP sem esse conteúdo não
retira o lote da fila. O destino só confirma depois de gravar e verificar os
IDs no ClickHouse e persistir o comprovante com sincronização em disco.

Após a reconexão, até 100 lotes originais são reunidos por requisição, sem
combinar seus IDs ou checksums. A resposta traz uma confirmação individual por
lote, portanto uma falha parcial não repete os sucessos. O heartbeat não reabre
o histórico já confirmado: somente a fila efetivamente pendente é recuperada.
Quando a fila chega a zero, as duas VMs receberam o mesmo conjunto lógico de
lotes; reenvios são idempotentes pelos IDs de registro/evento e pelo checksum.

## Promoção

1. Confirme que a VM principal antiga está desligada ou isolada da rede.
2. Acesse a URL independente da standby.
3. Em **Alta Disponibilidade**, selecione **Promover esta VM**.
4. Digite `PROMOVER STANDBY` quando solicitado.
5. Atualize DNS/NAT e os destinos dos equipamentos conforme o runbook externo.
6. Reinstale ou reintegre a VM antiga como uma nova standby antes de
   restabelecer sua conectividade administrativa.

A promoção aumenta a época de autoridade. Ela não altera DNS, NAT ou o
firewall externo automaticamente.

## Migração do mecanismo legado

O painel controla a sequência abaixo e não permite saltar etapas:

1. `Preparada`: principal ativado, código gerado e plano de testes aprovado.
2. `Migrada`: standby com heartbeat recente; coletores locais e equipamentos
   Cloud configurados para os dois destinos.
3. `Validada`: ingestão, consulta, backup, indisponibilidade de cada lado e
   promoção foram testados.

Somente depois de `Validada` a interface informa que a retirada do mecanismo
legado está liberada. Esta versão deliberadamente não remove tabelas, scripts ou
configurações antigas.

## Checklist de homologação com duas VMs

- criar um coletor local e confirmar o mesmo `batchId` nas duas APIs;
- interromper a API principal e comprovar que a standby continua recebendo;
- restaurar a principal e comprovar o reenvio da fila pendente;
- enviar NetFlow e Syslog Cloud diretamente aos dois IPs;
- confirmar consultas equivalentes em ambas as URLs;
- confirmar bloqueio HTTP `423` para alterações administrativas na standby;
- executar e restaurar um backup independente de cada VM;
- isolar a principal, promover a standby e validar a nova autoridade;
- reintegrar a VM antiga somente como standby.
