import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manual do cliente', () => {
  it('orienta a exportação Cisco para coletores local e Cloud', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('ip nat log translations flow-export v9 udp destination &lt;IP_DO_COLETOR&gt; 2055 source &lt;INTERFACE&gt;');
    expect(html).toContain('ip nat log translations flow-export v9 udp destination ingest-a.logvault.com.br &lt;PORTA&gt; source &lt;INTERFACE&gt;');
    expect(html).toContain('ip nat log translations flow-export v9 udp destination ingest-b.logvault.com.br &lt;PORTA&gt; source &lt;INTERFACE&gt;');
    expect(html).toContain('Não use automaticamente a porta 2055');
  });

  it('orienta a exportação A10 para coletores local e Cloud', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('cgnv6 server LOGVAULT-COLETOR &lt;IP_DO_COLETOR&gt;');
    expect(html).toContain('member LOGVAULT-COLETOR 5140');
    expect(html).toContain('cgnv6 server LOGVAULT-CLOUD-A ingest-a.logvault.com.br');
    expect(html).toContain('cgnv6 server LOGVAULT-CLOUD-B ingest-b.logvault.com.br');
    expect(html).toContain('member LOGVAULT-CLOUD-A &lt;PORTA_A&gt;');
    expect(html).toContain('member LOGVAULT-CLOUD-B &lt;PORTA_B&gt;');
    expect(html).toContain('custom message port-batch-v2-allocated');
    expect(html).toContain('custom message port-batch-v2-freed');
  });

  it('recomenda sincronização NTP para todos os equipamentos exportadores', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('Os equipamentos que estiverem exportando logs devem manter data, hora e fuso corretos');
    expect(html).not.toContain('Os equipamentos Cisco e A10 devem manter data, hora e fuso corretos');
    expect(html).toContain('sincronizados com um servidor NTP confiável');
  });

  it('explica a diferença entre o último evento da consulta e o ciclo completo', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('Como interpretar o último evento');
    expect(html).toContain('É o último evento explícito existente até a data e o horário pesquisados.');
    expect(html).toContain('inclusive depois do horário pesquisado');
    expect(html).toContain('Isso não altera o estado válido às 08:10.');
  });

  it('documenta os campos, os estados do ciclo e a geração de relatórios', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('O que significa cada campo do resultado');
    expect(html).toContain('Alocado · data e hora');
    expect(html).toContain('Ciclo completo');
    expect(html).toContain('Alocação sem desalocação recebida');
    expect(html).toContain('Ciclo sem pareamento seguro');
    expect(html).toContain('Exportação rápida da pesquisa');
    expect(html).toContain('Como gerar um relatório para ofício');
    expect(html).toContain('número do ofício ou processo');
    expect(html).toContain('Sem horário de encerramento confirmado');
  });

  it('explica conjuntos de portas contíguos e intercalados na consulta', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('Como interpretar a quantidade e o passo das portas');
    expect(html).toContain('Início e fim não indicam sempre uma faixa contínua');
    expect(html).toContain('porta inicial + passo × (quantidade − 1)');
    expect(html).toContain('9217, 9219, 9221…');
    expect(html).toContain('21508, 21516, 21524…');
    expect(html).toContain('Os exemplos não limitam o cálculo');
    expect(html).toContain('qualquer que seja ele');
  });

  it('apresenta visão geral, arquitetura, operação, firewall e glossário ao cliente', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).toContain('data-manual-target="client-manual-overview"');
    expect(html).toContain('data-manual-target="client-manual-architecture"');
    expect(html).toContain('data-manual-target="client-manual-operation"');
    expect(html).toContain('data-manual-target="client-manual-firewall"');
    expect(html).toContain('data-manual-target="client-manual-glossary"');
    expect(html).toContain('Como um log percorre o LogVault');
    expect(html).toContain('Dupla ingestão e alta disponibilidade');
    expect(html).toContain('Controlar as origens dos coletores Cloud');
    expect(html).toContain('Termos usados no LogVault');
  });

  it('mantém a dupla ingestão dentro da arquitetura no manual da plataforma', () => {
    const html = readFileSync('web/index.html', 'utf8');

    expect(html).not.toContain('data-manual-target="manual-continuity"');
    expect(html).not.toContain('id="manual-continuity"');
    expect(html).toContain('<h4>Dupla ingestão e alta disponibilidade</h4>');
  });

  it('mantém no glossário da plataforma os mesmos termos explicados ao cliente', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const platformGlossary = html.slice(
      html.indexOf('id="manual-glossary"'),
      html.indexOf('id="tenant-manual-view"')
    );

    for (const term of ['Alocação', 'Desalocação', 'Ciclo de alocação', 'Registro bruto', 'Evento normalizado', 'Coletor local', 'Coletor Cloud', 'Parser', 'NTP', 'CIDR']) {
      expect(platformGlossary).toContain(`<strong>${term}</strong>`);
    }
  });
});
