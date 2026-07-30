# Schema real da API Pública do DataJud

> Documento **gerado** por `node spike/probe.mjs` a partir de respostas reais da API.
> Não edite à mão: rode o spike de novo. Se um campo não está aqui, é porque não
> apareceu em nenhum dos documentos amostrados — ausência é informação.

- Gerado em: 2026-07-30T01:05:53.562Z
- Documentos `_source` analisados: **29**
- Aliases amostrados: api_publica_tjsc
- Base URL: `https://api-publica.datajud.cnj.jus.br`

## Envelope da resposta

```
{
  "took": "<number>",
  "timed_out": "<boolean>",
  "_shards": "<object>",
  "hits": {
    "total": {
      "value": "<number>",
      "relation": "<string>"
    },
    "max_score": "<number|null>",
    "hits": [
      {
        "_index": "api_publica_tjsc",
        "_id": "<string>",
        "_score": "<number|null>",
        "_source": "{ ...campos da tabela abaixo }"
      }
    ]
  }
}
```

## Campos de `hits.hits[]._source`

`presença` = em quantos % dos documentos analisados o caminho apareceu.
Campos com presença < 100% são **opcionais** e a tipagem da Fase 3 deve refleti-lo.

| campo | tipo | presença | cardinalidade | exemplo |
| --- | --- | --- | --- | --- |
| `@timestamp` | string | 100% |  | `2026-07-13T08:31:23.896000Z`<br>`2026-07-13T08:31:24.756000Z`<br>`2026-07-13T08:31:25.548000Z` |
| `assuntos` | array | 100% | min 1 / máx 3 / méd 1.2 |  |
| `assuntos[]` | object | — |  |  |
| `classe` | object | 100% |  |  |
| `dataAjuizamento` | string | 100% |  | `20260626084031`<br>`20250904111843`<br>`20121122163734` |
| `dataHoraUltimaAtualizacao` | string | 100% |  | `2026-07-13T08:31:23.896000Z`<br>`2026-07-13T08:31:24.756000Z`<br>`2026-07-13T08:31:25.548000Z` |
| `formato` | object | 100% |  |  |
| `grau` | string | 100% |  | `G1`<br>`JE` |
| `id` | string | 100% |  | `TJSC_G1_50310534320268240038`<br>`TJSC_G1_50559960920258240023`<br>`TJSC_G1_08022882320128240033` |
| `movimentos` | array | 100% | min 2 / máx 190 / méd 37.9 |  |
| `movimentos[]` | object | — |  |  |
| `nivelSigilo` | number | 100% |  | `0` |
| `numeroProcesso` | string | 100% |  | `50310534320268240038`<br>`50559960920258240023`<br>`08022882320128240033` |
| `orgaoJulgador` | object | 100% |  |  |
| `sistema` | object | 100% |  |  |
| `tribunal` | string | 100% |  | `TJSC` |
| `assuntos[].codigo` | number | — |  | `10462`<br>`6017`<br>`10538` |
| `assuntos[].nome` | string | — |  | `Condomínio`<br>`Dívida Ativa (Execução Fiscal)`<br>`Taxa de Licenciamento de Estabelecimento` |
| `classe.codigo` | number | 100% |  | `12154`<br>`1116`<br>`81` |
| `classe.nome` | string | 100% |  | `Execução de Título Extrajudicial`<br>`Execução Fiscal`<br>`Busca e Apreensão em Alienação Fiduciária` |
| `formato.codigo` | number | 100% |  | `1` |
| `formato.nome` | string | 100% |  | `Eletrônico` |
| `movimentos[].codigo` | number | — |  | `581`<br>`60`<br>`92` |
| `movimentos[].complementosTabelados` | array | — | min 1 / máx 2 / méd 1.0 |  |
| `movimentos[].complementosTabelados[]` | object | — |  |  |
| `movimentos[].dataHora` | string | — |  | `2026-07-08T01:15:23.000Z`<br>`2026-07-02T14:23:20.000Z`<br>`2026-06-30T03:39:23.000Z` |
| `movimentos[].nome` | string | — |  | `Documento`<br>`Expedição de documento`<br>`Publicação` |
| `movimentos[].orgaoJulgador` | object | — |  |  |
| `orgaoJulgador.codigo` | number | 100% |  | `86492`<br>`81425`<br>`17510` |
| `orgaoJulgador.codigoMunicipioIBGE` | number | 100% |  | `4209102`<br>`4205407`<br>`4208302` |
| `orgaoJulgador.nome` | string | 100% |  | `8ª Vara Cível da Comarca de Joinville`<br>`Unidade Regional de Execuções Fiscais Municipais da Comarca da Capital`<br>`Vara de Execução Fiscal Estadual` |
| `sistema.codigo` | number | 100% |  | `4` |
| `sistema.nome` | string | 100% |  | `Projudi` |
| `movimentos[].complementosTabelados[].codigo` | number | — |  | `4`<br>`3`<br>`2` |
| `movimentos[].complementosTabelados[].descricao` | string | — |  | `tipo_de_documento`<br>`tipo_de_conclusao`<br>`tipo_de_distribuicao_redistribuicao` |
| `movimentos[].complementosTabelados[].nome` | string | — |  | `Certidão`<br>`Ofício`<br>`para despacho` |
| `movimentos[].complementosTabelados[].valor` | number | — |  | `107`<br>`79`<br>`5` |
| `movimentos[].orgaoJulgador.codigo` | string | — |  | `86492`<br>`81425`<br>`6289` |
| `movimentos[].orgaoJulgador.nome` | string | — |  | `8ª Vara Cível da Comarca de Joinville`<br>`Unidade Regional de Execuções Fiscais Municipais da Comarca da Capital`<br>`Vara da Fazenda Púb, Exec. Fis., Acid. do Trab. e Reg. Púb. da Comarca de Itajaí` |
