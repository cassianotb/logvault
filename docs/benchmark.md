# Benchmark de ingestão

## Baseline de 2026-08-07

O teste foi executado em contêineres e volumes temporários, na mesma VM da homologação, sem inserir dados artificiais no ambiente principal.

Características observadas da VM durante o teste:

- arquitetura `x86_64`;
- 4 CPUs lógicas;
- 15 GiB de memória;
- 299 GiB no filesystem, com 278 GiB disponíveis antes do teste;
- serviços normais da homologação continuaram ativos.

Resultados do pipeline central API → PostgreSQL → ClickHouse:

| Cenário | Registros | Concorrência | Vazão | Latência p95 do lote | Falhas |
|---|---:|---:|---:|---:|---:|
| 20 lotes × 250 | 5.000 | 2 | 1.723 registros/s | 361 ms | 0 |
| 30 lotes × 500 | 15.000 | 4 | 2.905 registros/s | 748 ms | 0 |
| 50 lotes × 1.000 | 50.000 | 6 | 5.837 registros/s | 1.260 ms | 0 |

Ao todo, foram persistidos e conferidos exatamente 70.000 registros brutos e 70.000 eventos normalizados. Nenhum lote falhou ou apresentou divergência de contagem.

Após a carga, 50 consultas foram executadas pela API autenticada:

- latência p50: 23 ms;
- latência p95: 34 ms;
- latência máxima: 43 ms.

Esse resultado comprova o patamar testado, não o limite máximo da VM. O cenário usa um evento normalizado para cada registro bruto e envia lotes diretamente para a API. Portanto, ele mede o armazenamento central e não inclui custo de recepção UDP, interpretação NetFlow/Syslog ou escrita inicial no spool do coletor.

## Repetição segura

```bash
scripts/run-benchmark.sh
```

Os cenários podem ser substituídos sem editar arquivos:

```bash
ARGUS_BENCHMARK_SCENARIOS=20x500x2,50x1000x6 ARGUS_BENCHMARK_QUERIES=100 scripts/run-benchmark.sh
```

Cada cenário usa o formato `lotes×registros_por_lote×concorrência`. O runner utiliza o projeto Docker fixo `argus-benchmark`, valida todas as contagens e remove seus contêineres, rede e volumes ao terminar. Ele não acessa os volumes `argus_*` da homologação.

## Próxima medição

Para transformar o baseline em dimensionamento comercial, ainda é necessário:

1. manter Cisco e A10 transmitindo durante janelas reais de pico e fora de pico;
2. medir recepção UDP, parser e crescimento do spool no coletor;
3. executar um teste prolongado, não apenas rajadas curtas;
4. comparar as taxas reais por equipamento com o patamar central validado acima.
