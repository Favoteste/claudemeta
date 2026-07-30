# Fase 0 — descobertas do spike

> Gerado por `node spike/probe.mjs`. Cada resposta abaixo foi produzida por uma
> sondagem contra a API real, e a evidência bruta está anexada. Onde aparecer
> `INDETERMINADO`, a sondagem não conseguiu concluir — trate como pergunta aberta,
> não como resposta negativa.

## Contexto da execução

| item | valor |
| --- | --- |
| executado em | 2026-07-30T01:05:53.562Z |
| base URL | `https://api-publica.datajud.cnj.jus.br` |
| alias principal | `tjsc` |
| intervalo entre requisições | 3000 ms |
| requisições feitas | 19 |
| documentos analisados | 29 |
| fixtures gravadas | 13 |
| sondagens com falha | 0 |

## Respostas

### P00 — É possível colher processos reais sem conhecer nenhum número de antemão?

Sim. `match_all` em `api_publica_tjsc` devolveu 25 documentos reais (HTTP 200, 16910 ms, 229308 bytes). Total declarado no índice: 10000.

<details><summary>evidência</summary>

```json
{
  "status": 200,
  "totalNoIndice": 10000,
  "numerosColhidos": [
    "50310534320268240038",
    "50559960920258240023",
    "08022882320128240033",
    "09001399420138240011",
    "50857055020268240930",
    "50028205720208240002",
    "50781236720248240930",
    "50076403120268240125",
    "50310542820268240038",
    "50044369520258240033"
  ],
  "cabecalhos": {}
}
```

</details>

### P01 — A consulta por `numeroProcesso` funciona e exige número normalizado?

Número `50310534320268240038` → HTTP 200, 1 hit(s). A mesma consulta com o número pontuado (`5031053-43.2026.8.24.0038`) devolveu 0 hit(s) — confirma que a normalização para 20 dígitos é OBRIGATÓRIA.

<details><summary>evidência</summary>

```json
{
  "numero": "50310534320268240038",
  "status": 200,
  "hits": 1,
  "hitsComPontuacao": 0,
  "camposDoPrimeiroDocumento": [
    "id",
    "tribunal",
    "grau",
    "numeroProcesso",
    "dataAjuizamento",
    "nivelSigilo",
    "orgaoJulgador",
    "classe",
    "sistema",
    "formato",
    "dataHoraUltimaAtualizacao",
    "@timestamp",
    "movimentos",
    "assuntos"
  ]
}
```

</details>

### P02 — O mesmo `numeroProcesso` retorna mais de um documento (1º grau, 2º grau, tribunais distintos)? Qual a chave real de unicidade?

Agregações NÃO são aceitas pela API (HTTP 400). Varredura de 3 número(s): 0 devolveram mais de um documento. Nenhum número da amostra devolveu múltiplos documentos. NÃO conclua que 1 número = 1 documento: a amostra pode simplesmente não conter processo com recurso. Modele (numeroProcesso, grau, tribunal) como chave e trate o caso (d) da Fase 4 de todo modo. `_id`: 25 distintos, 0 com conteúdo divergente.

<details><summary>evidência</summary>

```json
{
  "agregacoesPermitidas": false,
  "baldes": [],
  "contagens": [
    {
      "numero": "50310534320268240038",
      "documentos": 1,
      "graus": [
        "G1"
      ],
      "ids": [
        "TJSC_G1_50310534320268240038"
      ],
      "indices": [
        "api_publica_tjsc"
      ],
      "tribunais": [
        "TJSC"
      ]
    },
    {
      "numero": "50559960920258240023",
      "documentos": 1,
      "graus": [
        "G1"
      ],
      "ids": [
        "TJSC_G1_50559960920258240023"
      ],
      "indices": [
        "api_publica_tjsc"
      ],
      "tribunais": [
        "TJSC"
      ]
    },
    {
      "numero": "08022882320128240033",
      "documentos": 1,
      "graus": [
        "G1"
      ],
      "ids": [
        "TJSC_G1_08022882320128240033"
      ],
      "indices": [
        "api_publica_tjsc"
      ],
      "tribunais": [
        "TJSC"
      ]
    }
  ],
  "idsSaoUnicos": {
    "idsDistintos": 25,
    "idsComConteudoDivergente": 0,
    "unico": true,
    "exemplosConflitantes": []
  }
}
```

</details>

### P03 — O array `movimentos` vem completo em toda resposta ou é paginado/truncado? Vem ordenado, e em qual sentido?

29 documento(s) analisado(s). Movimentos por documento: mín 2, máx 190, mediana 17. Ordenação por `dataHora`: desordenado=27, decrescente=2. **O array NÃO é confiavelmente ordenado** — o motor de diff da Fase 4 deve ordenar por conta própria e nunca assumir que o último elemento é o mais recente. ATENÇÃO: 1 documento(s) com contagem exatamente redonda (10) — forte suspeita de truncamento do array. Investigue antes de confiar no histórico como completo.

<details><summary>evidência</summary>

```json
{
  "documentosAnalisados": 29,
  "distribuicaoQuantidade": {
    "min": 2,
    "max": 190,
    "mediana": 17
  },
  "ordenacoes": {
    "desordenado": 27,
    "decrescente": 2
  },
  "suspeitasDeTruncamento": [
    {
      "numero": "50239290220268240008",
      "quantidade": 10
    }
  ]
}
```

</details>

### P04 — Existem movimentações com `dataHora` e `codigo` idênticos no mesmo processo (a tupla é insuficiente como chave)?

1098 movimentações inspecionadas. Colisões de (codigo, dataHora): **18**. Dessas, mesmas também em `nome`: 18; mesmas também em `complementosTabelados`: 18; objetos JSON integralmente idênticos: **18**. Existem movimentações **indistinguíveis entre si**. Nenhuma combinação de campos as separa: o índice de ocorrência dentro do grupo é OBRIGATÓRIO na chave, senão a deduplicação apaga movimentação legítima (falso negativo — o pior defeito segundo o §2). Chave sugerida para a Fase 4: `sha256(processo_id, grau, codigo, dataHora, nome_normalizado, complementos_canonicos, indice_de_ocorrencia)`.

<details><summary>evidência</summary>

```json
{
  "totalMovimentos": 1098,
  "colisoes": {
    "codigoData": 18,
    "comNome": 18,
    "comComplementos": 18,
    "objetoIdentico": 18
  },
  "chaveRecomendada": "sha256(processo_id, grau, codigo, dataHora, nome_normalizado, complementos_canonicos, indice_de_ocorrencia)",
  "exemplos": [
    {
      "numero": "50028205720208240002",
      "grau": "G1",
      "chave": "581|2024-10-09T22:35:56.000Z",
      "ocorrencias": 3,
      "nomesDistintos": 1,
      "complementosDistintos": 1,
      "objetosDistintos": 1,
      "amostra": [
        {
          "codigo": 581,
          "dataHora": "2024-10-09T22:35:56.000Z",
          "nome": "Documento",
          "complementosTabelados": [
            {
              "codigo": 4,
              "descricao": "tipo_de_documento",
              "valor": 80,
              "nome": "Outros documentos"
            }
          ],
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        },
        {
          "codigo": 581,
          "dataHora": "2024-10-09T22:35:56.000Z",
          "nome": "Documento",
          "complementosTabelados": [
            {
              "codigo": 4,
              "descricao": "tipo_de_documento",
              "valor": 80,
              "nome": "Outros documentos"
            }
          ],
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        }
      ]
    },
    {
      "numero": "50028205720208240002",
      "grau": "G1",
      "chave": "581|2023-04-25T14:05:30.000Z",
      "ocorrencias": 2,
      "nomesDistintos": 1,
      "complementosDistintos": 1,
      "objetosDistintos": 1,
      "amostra": [
        {
          "codigo": 581,
          "dataHora": "2023-04-25T14:05:30.000Z",
          "nome": "Documento",
          "complementosTabelados": [
            {
              "codigo": 4,
              "descricao": "tipo_de_documento",
              "valor": 80,
              "nome": "Outros documentos"
            }
          ],
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        },
        {
          "codigo": 581,
          "dataHora": "2023-04-25T14:05:30.000Z",
          "nome": "Documento",
          "complementosTabelados": [
            {
              "codigo": 4,
              "descricao": "tipo_de_documento",
              "valor": 80,
              "nome": "Outros documentos"
            }
          ],
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        }
      ]
    },
    {
      "numero": "50028205720208240002",
      "grau": "G1",
      "chave": "581|2022-02-06T15:29:33.000Z",
      "ocorrencias": 2,
      "nomesDistintos": 1,
      "complementosDistintos": 1,
      "objetosDistintos": 1,
      "amostra": [
        {
          "codigo": 581,
          "dataHora": "2022-02-06T15:29:33.000Z",
          "nome": "Documento",
          "complementosTabelados": [
            {
              "codigo": 4,
              "descricao": "tipo_de_documento",
              "valor": 80,
              "nome": "Outros documentos"
            }
          ],
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        },
        {
          "codigo": 581,
          "dataHora": "2022-02-06T15:29:33.000Z",
          "nome": "Documento",
          "complementosTabelados": [
            {
              "codigo": 4,
              "descricao": "tipo_de_documento",
              "valor": 80,
              "nome": "Outros documentos"
            }
          ],
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        }
      ]
    },
    {
      "numero": "50028205720208240002",
      "grau": "G1",
      "chave": "12291|2021-12-11T16:05:04.000Z",
      "ocorrencias": 2,
      "nomesDistintos": 1,
      "complementosDistintos": 1,
      "objetosDistintos": 1,
      "amostra": [
        {
          "codigo": 12291,
          "dataHora": "2021-12-11T16:05:04.000Z",
          "nome": "Movimentação processual",
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        },
        {
          "codigo": 12291,
          "dataHora": "2021-12-11T16:05:04.000Z",
          "nome": "Movimentação processual",
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        }
      ]
    },
    {
      "numero": "50028205720208240002",
      "grau": "G1",
      "chave": "12282|2022-11-07T19:01:34.000Z",
      "ocorrencias": 3,
      "nomesDistintos": 1,
      "complementosDistintos": 1,
      "objetosDistintos": 1,
      "amostra": [
        {
          "codigo": 12282,
          "dataHora": "2022-11-07T19:01:34.000Z",
          "nome": "Expedida/Certificada",
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        },
        {
          "codigo": 12282,
          "dataHora": "2022-11-07T19:01:34.000Z",
          "nome": "Expedida/Certificada",
          "orgaoJulgador": {
            "codigo": "82982",
            "nome": "Vara Estadual de Direito Bancário"
          }
        }
      ]
    }
  ]
}
```

</details>

### P08 — Qual o comportamento em número inexistente, número de outro tribunal, alias errado, corpo inválido e chave inválida?

Número inexistente: HTTP 200, 0 hit(s) — não é erro HTTP, é resposta vazia; o sync precisa distinguir "não achou" de "falhou". Número de outro tribunal: HTTP 200, 0 hit(s) — reforça que o alias tem de estar certo, senão o processo parece não existir (falso negativo silencioso). Alias inválido: tjxx→HTTP 404, api_publica_tjsc→HTTP 404, tj-sc→HTTP 404. Corpo malformado: HTTP 500, 0 hit(s), erro `x_content_e_o_f_exception`. Sem `Authorization`: HTTP 401. Chave inválida: HTTP 401. → O health check da rotação de chave deve disparar em 401/401 .

<details><summary>evidência</summary>

```json
{
  "casos": [
    {
      "caso": "numero-inexistente",
      "alias": "tjsc",
      "status": 200,
      "hits": 0,
      "tipoDeErro": null,
      "motivo": "{\"took\":14765,\"timed_out\":false,\"_shards\":{\"total\":10,\"successful\":10,\"skipped\":0,\"failed\":0},\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"max_score\":null,\"hits\":[]}}",
      "corpoResumido": "{\"took\":14765,\"timed_out\":false,\"_shards\":{\"total\":10,\"successful\":10,\"skipped\":0,\"failed\":0},\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"max_score\":null,\"hits\":[]}}"
    },
    {
      "caso": "numero-de-outro-tribunal",
      "alias": "tjsp",
      "status": 200,
      "hits": 0,
      "tipoDeErro": null,
      "motivo": "{\"took\":27689,\"timed_out\":false,\"_shards\":{\"total\":20,\"successful\":20,\"skipped\":0,\"failed\":0},\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"max_score\":null,\"hits\":[]}}",
      "corpoResumido": "{\"took\":27689,\"timed_out\":false,\"_shards\":{\"total\":20,\"successful\":20,\"skipped\":0,\"failed\":0},\"hits\":{\"total\":{\"value\":0,\"relation\":\"eq\"},\"max_score\":null,\"hits\":[]}}"
    },
    {
      "caso": "alias-invalido-tjxx",
      "alias": "tjxx",
      "status": 404,
      "hits": 0,
      "tipoDeErro": "index_not_found_exception",
      "motivo": "no such index [api_publica_tjxx]",
      "corpoResumido": "{\"error\":{\"root_cause\":[{\"type\":\"index_not_found_exception\",\"reason\":\"no such index [api_publica_tjxx]\",\"resource.type\":\"index_or_alias\",\"resource.id\":\"api_publica_tjxx\",\"index_uuid\":\"_na_\",\"index\":\"api_publica_tjxx\"}],\"type\":\"index_not_found_exception\",\"reason\":\"no such index [api_publica_tjxx]\",\"r…"
    },
    {
      "caso": "alias-invalido-api_publica_tjsc",
      "alias": "api_publica_tjsc",
      "status": 404,
      "hits": 0,
      "tipoDeErro": "index_not_found_exception",
      "motivo": "no such index [api_publica_api_publica_tjsc]",
      "corpoResumido": "{\"error\":{\"root_cause\":[{\"type\":\"index_not_found_exception\",\"reason\":\"no such index [api_publica_api_publica_tjsc]\",\"resource.type\":\"index_or_alias\",\"resource.id\":\"api_publica_api_publica_tjsc\",\"index_uuid\":\"_na_\",\"index\":\"api_publica_api_publica_tjsc\"}],\"type\":\"index_not_found_exception\",\"reason\":\"…"
    },
    {
      "caso": "alias-invalido-tj-sc",
      "alias": "tj-sc",
      "status": 404,
      "hits": 0,
      "tipoDeErro": "index_not_found_exception",
      "motivo": "no such index [api_publica_tj-sc]",
      "corpoResumido": "{\"error\":{\"root_cause\":[{\"type\":\"index_not_found_exception\",\"reason\":\"no such index [api_publica_tj-sc]\",\"resource.type\":\"index_or_alias\",\"resource.id\":\"api_publica_tj-sc\",\"index_uuid\":\"_na_\",\"index\":\"api_publica_tj-sc\"}],\"type\":\"index_not_found_exception\",\"reason\":\"no such index [api_publica_tj-sc]…"
    },
    {
      "caso": "body-malformado",
      "alias": "tjsc",
      "status": 500,
      "hits": 0,
      "tipoDeErro": "x_content_e_o_f_exception",
      "motivo": "com.fasterxml.jackson.core.io.JsonEOFException: Unexpected end-of-input within/between Object entries\n at [Source: (byte[])\"{\"query\": {\"match\": \"; line: 1, column: 21]",
      "corpoResumido": "{\"error\":{\"root_cause\":[{\"type\":\"x_content_e_o_f_exception\",\"reason\":\"com.fasterxml.jackson.core.io.JsonEOFException: Unexpected end-of-input within/between Object entries\\n at [Source: (byte[])\\\"{\\\"query\\\": {\\\"match\\\": \\\"; line: 1, column: 21]\"}],\"type\":\"x_content_e_o_f_exception\",\"reason\":\"com.fas…"
    },
    {
      "caso": "sem-autenticacao",
      "alias": "tjsc",
      "status": 401,
      "hits": 0,
      "tipoDeErro": "security_exception",
      "motivo": "missing authentication credentials for REST request [/api_publica_tjsc/_search]",
      "corpoResumido": "{\"error\":{\"root_cause\":[{\"type\":\"security_exception\",\"reason\":\"missing authentication credentials for REST request [/api_publica_tjsc/_search]\",\"header\":{\"WWW-Authenticate\":[\"Basic realm=\\\"security\\\" charset=\\\"UTF-8\\\"\",\"Bearer realm=\\\"security\\\"\",\"ApiKey\"]}}],\"type\":\"security_exception\",\"reason\":\"mi…"
    },
    {
      "caso": "chave-invalida",
      "alias": "tjsc",
      "status": 401,
      "hits": 0,
      "tipoDeErro": "security_exception",
      "motivo": "unable to authenticate with provided credentials and anonymous access is not allowed for this request",
      "corpoResumido": "{\"error\":{\"root_cause\":[{\"type\":\"security_exception\",\"reason\":\"unable to authenticate with provided credentials and anonymous access is not allowed for this request\",\"additional_unsuccessful_credentials\":\"API key: invalid ApiKey value\",\"header\":{\"WWW-Authenticate\":[\"Basic realm=\\\"security\\\" charset=…"
    }
  ],
  "statusDeFalhaDeAutenticacao": [
    401
  ],
  "numeroInexistenteUsado": "99999995620248240001"
}
```

</details>

### P10 — Qual a latência real da carga do DataJud, e como se comportam os processos sigilosos?

Latência medida como (hoje − `dataHoraUltimaAtualizacao`) por tribunal: TJSC: mediana 17 d (mínimo 17 d). O mínimo é a melhor estimativa do atraso estrutural do tribunal — a mediana é inflada por processos parados. Distribuição de `nivelSigilo` na amostra: {"nivelSigilo=0":29}. Estes números alimentam o indicador de latência por tribunal exigido nas Fases 6, 7 e 8.

<details><summary>evidência</summary>

```json
{
  "porTribunal": [
    {
      "tribunal": "TJSC",
      "documentos": 29,
      "medianaDiasUltimaAtualizacao": 17,
      "minimoDiasUltimaAtualizacao": 17
    }
  ],
  "sigilos": {
    "nivelSigilo=0": 29
  }
}
```

</details>

## Fixtures gravadas

| fixture | status | arquivo |
| --- | --- | --- |
| `p00-bootstrap-tjsc` | 200 | `tests/fixtures/datajud/p00-bootstrap-tjsc.json` |
| `p01-consulta-por-numero` | 200 | `tests/fixtures/datajud/p01-consulta-por-numero.json` |
| `p02-agg-repetidos` | 400 | `tests/fixtures/datajud/p02-agg-repetidos.json` |
| `p03-documento-com-mais-movimentos` | — | `tests/fixtures/datajud/p03-documento-com-mais-movimentos.json` |
| `p04-colisoes-de-chave` | — | `tests/fixtures/datajud/p04-colisoes-de-chave.json` |
| `p08-numero-inexistente` | 200 | `tests/fixtures/datajud/p08-numero-inexistente.json` |
| `p08-numero-de-outro-tribunal` | 200 | `tests/fixtures/datajud/p08-numero-de-outro-tribunal.json` |
| `p08-alias-invalido-tjxx` | 404 | `tests/fixtures/datajud/p08-alias-invalido-tjxx.json` |
| `p08-alias-invalido-api_publica_tjsc` | 404 | `tests/fixtures/datajud/p08-alias-invalido-api_publica_tjsc.json` |
| `p08-alias-invalido-tj-sc` | 404 | `tests/fixtures/datajud/p08-alias-invalido-tj-sc.json` |
| `p08-body-malformado` | 500 | `tests/fixtures/datajud/p08-body-malformado.json` |
| `p08-sem-autenticacao` | 401 | `tests/fixtures/datajud/p08-sem-autenticacao.json` |
| `p08-chave-invalida` | 401 | `tests/fixtures/datajud/p08-chave-invalida.json` |

## O que revisar no CLAUDE.md §3 antes da Fase 1

Confronte cada premissa do §3 com as respostas acima e corrija o documento:

- [ ] `numeroProcesso` com 20 dígitos sem pontuação (ver P01)
- [ ] nomes exatos dos campos de `_source` (ver `docs/datajud-schema.md`)
- [ ] chave real de unicidade do processo (ver P02)
- [ ] completude e ordenação de `movimentos` (ver P03)
- [ ] chave de deduplicação de movimentação para a Fase 4 (ver P04)
- [ ] estratégia de lote: 1 requisição por processo ou `terms` (ver P07)
- [ ] status HTTP que caracteriza rotação de chave (ver P08)
- [ ] lista de aliases e mapeamento J.TR (ver P11)
- [ ] latência por tribunal a exibir no produto (ver P10)
