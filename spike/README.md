# Spike da Fase 0 — validação da API Pública do DataJud

Código **descartável** (CLAUDE.md §6, Fase 0). Existe para responder empiricamente
às perguntas da Fase 0 antes de qualquer camada ser escrita. Não construa nada
sobre ele: o cliente definitivo e tipado é a Fase 3 (`lib/datajud/client.ts`), e vai
nascer do schema que este spike descobrir.

## Por que ele existe

O CLAUDE.md §3 descreve a API, mas manda tratar aquilo como **premissa a ser
verificada, não verdade**. Decisões que dependem de fatos que só a API responde:

| Pergunta | Decide |
| --- | --- |
| Um número devolve mais de um documento? | chave de unicidade do modelo (Fase 1) |
| A tupla `codigo` + `dataHora` é única? | chave de deduplicação do diff (Fase 4) |
| `movimentos` vem ordenado e completo? | se o diff pode confiar na ordem da fonte |
| `terms` funciona? | 1 requisição por processo ou lote (Fase 3) |
| Qual status indica chave rotacionada? | health check (critério de aceite 4) |
| Qual J.TR corresponde a qual alias? | `resolverAlias()` (Fase 2) |

Errar qualquer uma dessas custa reescrita de camada inteira.

## Como rodar

```bash
cp .env.example .env          # preencha DATAJUD_API_KEY
export DATAJUD_API_KEY="$(grep ^DATAJUD_API_KEY .env | cut -d= -f2-)"

node spike/probe.mjs
```

Zero dependências e zero build: JavaScript puro em `.mjs`, roda em qualquer Node 18+.

### Opções

| Flag | Efeito |
| --- | --- |
| `--alias=tjsp` | tribunal principal das sondagens (padrão `tjsc`) |
| `--numero=<20 dígitos>` | fixa o processo de P01 em vez de colher um da API |
| `--amostra=25` | quantos documentos colher no bootstrap |
| `--pular-sweep` | não varre a lista de aliases (bem mais rápido) |
| `--sweep-completo` | inclui TREs e TJMs, cuja grafia está em teste |
| `--rate-limit-probe` | **opt-in**: estoura o limite de propósito. Ver aviso abaixo |
| `--verboso` | loga toda requisição |

### Aviso sobre `--rate-limit-probe`

Estourar deliberadamente o limite de uma API pública contraria a regra inviolável 2
(civilidade) e o Termo de Uso (regra 7). A sondagem existe porque o CLAUDE.md pede o
dado, mas é **opt-in e para rodar uma única vez**. Sem a flag, o spike apenas inspeciona
os cabeçalhos das requisições normais em busca de limite declarado.

## O que ele produz

| Arquivo | Conteúdo | Versionado |
| --- | --- | --- |
| `docs/datajud-schema.md` | estrutura real, campo por campo, com exemplo e % de presença | sim |
| `docs/fase-0-descobertas.md` | resposta a cada pergunta da Fase 0, com evidência anexada | sim |
| `tests/fixtures/datajud/*.json` | respostas cruas, insumo dos testes e do `--dry-run` | sim |
| `spike/out/auditoria.json` | trilha de todas as requisições (regra 5) | não |
| `spike/out/achados.json` | achados em JSON, para processar por script | não |

Os dois documentos são **gerados**: não os edite à mão, rode o spike de novo.

## Mapa das sondagens

| ID | Pergunta da Fase 0 |
| --- | --- |
| P00 | colher processos reais sem conhecer número de antemão |
| P01 | consulta por `numeroProcesso` e exigência de normalização |
| P02 | um número → vários documentos? qual a chave de unicidade? |
| P03 | `movimentos` completo? ordenado? em qual sentido? |
| P04 | `codigo` + `dataHora` basta como chave? |
| P05 | `size` aceito e máximo |
| P06 | `sort` e `search_after` |
| P07 | múltiplos números por requisição (`terms`) e limite prático |
| P08 | número inexistente, tribunal errado, alias errado, corpo inválido, chave inválida |
| P09 | rate limit declarado (opt-in) |
| P10 | latência de carga por tribunal e `nivelSigilo` |
| P11 | quais aliases existem, mapeamento J.TR → alias, e validação do DV |

P00 e P11 rodam primeiro porque alimentam as demais com documentos e números reais.

### P11 merece uma nota

O CLAUDE.md proíbe confiar na memória do modelo para o mapeamento J.TR → alias. O
spike faz o caminho mais forte que a wiki: pede um documento real a cada índice
candidato e **lê os dígitos J e TR do número que voltou**. O mapeamento sai do dado.
De brinde, valida o algoritmo do dígito verificador (ISO 7064 MOD 97-10) contra todos
os números reais colhidos — se reprovar em número que o CNJ considera válido, o
algoritmo está errado e é melhor saber antes da Fase 2.

Para os TREs e TJMs o spike testa **variantes de grafia** (`tre-sc`, `tresc`, `tre_sc`)
e a que responder 200 vence.

## Depois de rodar

Leia `docs/fase-0-descobertas.md` e confronte com o §3 do CLAUDE.md. Onde a API
contrariar o documento, **corrija o §3** e registre em `docs/decisoes.md`. Só então
comece a Fase 1.
