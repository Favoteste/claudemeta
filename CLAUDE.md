# Plataforma de Monitoramento Processual via DataJud (CNJ)

> **Estado atual — leia antes de agir.**
>
> - **Fase 0 NÃO foi concluída.** O instrumento existe (`spike/`), mas nunca rodou contra
>   a API real: a política de egresso do ambiente remoto nega os domínios do CNJ.
>   Ver `docs/decisoes.md`, D-007.
> - **Nenhuma premissa da §3 deste documento está verificada.** Trate tudo ali como
>   hipótese. Rode `node spike/probe.mjs` de um ambiente com acesso, leia
>   `docs/fase-0-descobertas.md`, corrija a §3 e só então comece a Fase 1.
> - A raiz do repositório ainda contém um dashboard de campanhas do Instagram
>   (`dashboard.html`, `src/app`, `fetchData.js`, `gestao-favo.js` e afins) que precisa
>   sair antes da Fase 7. Ver `docs/decisoes.md`, D-008.

## 1. Papel

Você é o engenheiro responsável por construir uma plataforma de monitoramento
processual para um advogado que gerencia uma carteira própria de processos. Trabalhe em
fases, valide cada premissa técnica contra a API real antes de escalar código, e pare
para perguntar sempre que uma decisão de produto for ambígua.

## 2. Objetivo

Construir um sistema que:

1. Mantém um cadastro de processos sob responsabilidade do usuário (número CNJ, cliente,
   tribunal, grau, tags, status).
2. Consulta diariamente a API Pública do DataJud para cada processo cadastrado.
3. Detecta o que mudou desde a última consulta (novas movimentações, mudança de órgão
   julgador, mudança de classe, novo grau).
4. Classifica e prioriza o que mudou (o que é ruído de secretaria e o que exige ação do
   advogado).
5. Entrega um resumo diário no e-mail e um dashboard web com timeline por processo.

O sistema é para uso profissional. **Perder uma movimentação relevante é o pior defeito
possível. Falso positivo é aceitável, falso negativo não é.**

## 3. A API — premissas A VERIFICAR (nada aqui está confirmado)

Base URL: `https://api-publica.datajud.cnj.jus.br/`
Endpoint: `https://api-publica.datajud.cnj.jus.br/api_publica_{alias}/_search`
Método: `POST` · Content-Type: `application/json`
Autenticação: header `Authorization: APIKey <DATAJUD_API_KEY>`

A chave é pública e compartilhada por todos os consumidores, e o CNJ pode trocá-la a
qualquer momento sem aviso. Portanto:

- A chave vive em `DATAJUD_API_KEY`, **nunca hardcoded** — nem neste documento. A chave
  vigente é publicada em <https://datajud-wiki.cnj.jus.br/api-publica/acesso>.
- Implemente health check que detecte falha de autenticação e emita alerta específico
  "chave do DataJud possivelmente rotacionada", com link para a página acima.

Sintaxe: a API expõe um índice ElasticSearch; o corpo é uma query ES.

```json
{ "query": { "match": { "numeroProcesso": "50012345620248240008" } } }
```

`numeroProcesso` seria armazenado com 20 dígitos sem pontuação — **normalize sempre**
antes de consultar (a sondagem P01 confirma ou refuta).

Estrutura esperada da resposta: `hits.hits[]._source`, contendo (**confirme os nomes
exatos com `docs/datajud-schema.md`**): `numeroProcesso`, `classe {codigo, nome}`,
`assuntos[] {codigo, nome}`, `sistema`, `formato`, `tribunal`, `grau`, `dataAjuizamento`,
`nivelSigilo`, `orgaoJulgador {codigo, nome, codigoMunicipioIBGE}`,
`dataHoraUltimaAtualizacao`, `movimentos[] {codigo, nome, dataHora,
complementosTabelados[]}`, `@timestamp`, `id`.

Aliases por segmento (a confirmar por P11 — ver `spike/aliases.mjs`):

- Superiores: `stj`, `stm`, `tst`, `tse`
- Federal: `trf1`…`trf6`
- Trabalho: `trt1`…`trt24`
- Estadual: `tjac`, `tjal`, `tjam`, `tjap`, `tjba`, `tjce`, `tjdft`, `tjes`, `tjgo`,
  `tjma`, `tjmg`, `tjms`, `tjmt`, `tjpa`, `tjpb`, `tjpe`, `tjpi`, `tjpr`, `tjrj`,
  `tjrn`, `tjro`, `tjrr`, `tjrs`, `tjsc`, `tjse`, `tjsp`, `tjto`
- Eleitoral e Militar estadual: grafia **incerta** (`tre-XX`/`treXX`, `tjmXX`/`tjm-XX`);
  P11 testa as variantes.

### Limitações que precisam estar explícitas no produto (não esconda do usuário)

- O DataJud é base **estatística nacional** alimentada por carga periódica dos tribunais.
  Há latência de dias ou semanas, que varia por tribunal. Meça e exiba essa latência por
  tribunal para o usuário saber o quanto confiar.
- Não há nome de partes, advogados, teor de decisão nem documentos. Só metadados de capa
  e movimentações da TPU.
- Processos em segredo de justiça não retornam ou vêm suprimidos. Trate `nivelSigilo > 0`
  explicitamente.
- **Nunca** apresente uma movimentação do DataJud como marco de contagem de prazo. A
  fonte oficial de prazo é o DJEN / Domicílio Judicial Eletrônico. O DataJud é radar,
  não é certidão.

## 4. Stack

- Backend e ingestão: TypeScript + Node
- Banco: Postgres (Supabase), com RLS habilitada desde o primeiro dia
- Agendamento: pg_cron + Supabase Edge Function, ou worker Node com node-cron se for mais
  simples de testar localmente
- E-mail: Resend
- Front-end: Next.js (App Router) + Tailwind + shadcn/ui
- Testes: Vitest, com fixtures de resposta real gravadas em disco (**nenhum teste
  unitário bate na API de produção**)

Se outra escolha for claramente melhor, proponha antes de trocar. Não troque em silêncio.

## 5. Regras invioláveis

1. Nada de segredo em código ou em commit. Tudo em `.env`, com `.env.example` versionado.
2. Rate limit e civilidade com a API pública: no máximo 1 req/s por padrão, configurável,
   com backoff exponencial e jitter em 429 e 5xx. Nunca retry infinito.
3. Idempotência: rodar a ingestão duas vezes no mesmo dia não duplica movimentação nem
   reenvia alerta já enviado.
4. Nenhuma exclusão de dado histórico. Movimentação que sai da resposta da API não é
   deletada da base local, é **marcada**.
5. Toda requisição à API é logada (processo, alias, status, latência, tamanho da
   resposta) em tabela de auditoria.
6. Falha na consulta de um processo não interrompe o lote. Isole por processo, colete os
   erros, siga em frente e relate no fim.
7. Respeite o Termo de Uso da API Pública. Sem raspagem massiva, sem redistribuição de
   base, uso restrito ao acompanhamento da carteira do usuário.

## 6. Fases

### Fase 0 — spike de validação (**pendente de execução real**)

Não confie no que está escrito na §3. `spike/probe.mjs` já implementa:

1. Consulta a um processo real e dump do JSON bruto.
2. Geração de `docs/datajud-schema.md` — estrutura real, campo por campo, com exemplo.
3. Resposta por escrito, com evidência, a: unicidade do documento por número; completude
   e ordenação de `movimentos`; suficiência da tupla `codigo`+`dataHora` como chave;
   suporte a `size`/`sort`/`search_after` e o `size` máximo; viabilidade de consultar
   múltiplos números por requisição (`terms`); comportamento em número inexistente, de
   outro tribunal e alias errado; rate limit declarado.
4. Gravação das respostas reais em `tests/fixtures/datajud/`.

**Ao final da Fase 0, pare e apresente as descobertas antes de seguir.** Se alguma
premissa da §3 estiver errada, corrija a §3 e avise o que mudou. Ver `spike/README.md`.

### Fase 1 — modelo de dados

Migrations em `supabase/migrations/`. Modelo mínimo:

- `processos`: id, numero_cnj (normalizado, 20 dígitos, unique), numero_formatado,
  tribunal_alias, segmento, grau, cliente_nome, cliente_id, parte_representada, polo
  (autor/réu/terceiro), responsavel, tags[], comarca, vara, status
  (ativo/arquivado/suspenso/pausado_monitoramento), observacoes, criado_em, atualizado_em.
- `processo_versoes`: snapshot íntegro do `_source`, com hash do payload. Só grava nova
  versão se o hash mudar. Trilha de auditoria e permite reprocessar diff sem tocar a API.
- `movimentos`: id, processo_id, grau, codigo_tpu, nome, data_hora, complementos (jsonb),
  hash_unico (unique), primeira_deteccao_em, relevancia, lida_em, arquivada_em.
- `alteracoes`: mudanças que não são movimentação (órgão julgador, classe, assunto, novo
  grau), com valor anterior e novo.
- `execucoes_sync`: id, iniciada_em, finalizada_em, processos_consultados, sucessos,
  falhas, novos_movimentos, erros (jsonb).
- `notificacoes`: id, tipo, destinatario, payload, enviada_em, status.
- `tpu_movimentos`: referência dos códigos da TPU, com nome canônico e classificação de
  relevância. Popule com os códigos que aparecerem na prática; permita edição.

Índices em `(processo_id, data_hora desc)` e em `hash_unico`.

### Fase 2 — parser do número CNJ e resolução de tribunal

Formato `NNNNNNN-DD.AAAA.J.TR.OOOO` (Resolução CNJ 65/2008): sequencial, dígito
verificador (módulo 97 base 10, ISO 7064), ano, segmento, tribunal, unidade de origem.

Módulo `cnj.ts` com `normalizar()`, `formatar()`, `validarDV()`, `parse()` e
`resolverAlias()`. Número com DV inválido não entra no cadastro.

`resolverAlias()`: não confie na memória para o mapeamento J.TR → alias. Use a lista
oficial em <https://datajud-wiki.cnj.jus.br/api-publica/endpoints> e o mapeamento
empírico produzido por P11. Onde não houver validação empírica, marque como
`nao_verificado` e exija confirmação manual no cadastro. Aceite override manual sempre.

Cuidado com o que quebra a regra ingênua: processo que sobe para tribunal superior mantém
o número de origem; processo migrado de sistema pode ter número antigo; a Justiça Federal
tem TR por região, não por estado.

### Fase 3 — cliente da API

`lib/datajud/client.ts`: tipagem completa gerada do schema real da Fase 0 (não inventada);
fila com concorrência e rate limit configuráveis; timeout, retry com backoff exponencial e
jitter; circuit breaker por alias; cache de resposta por hash; modo `--dry-run` que lê de
fixture em vez da rede.

### Fase 4 — motor de diff (o coração do sistema)

`lib/sync/diff.ts`:

- Chave de deduplicação derivada da tupla real descoberta na Fase 0. Se
  `codigo`+`dataHora` não bastar, inclua `nome` normalizado e o **índice de ocorrência**.
  Documente a decisão em comentário e cubra com teste.
- Detecte quatro classes de mudança: (a) movimentação nova; (b) movimentação que
  desapareceu da resposta; (c) alteração de metadado de capa; (d) surgimento de novo
  documento para o mesmo processo, indicando novo grau ou remessa a tribunal superior.
  **O caso (d) é um dos eventos mais importantes e costuma ser esquecido**: processo que
  subiu de grau precisa passar a ser monitorado no alias novo também.
- **Movimentação retroativa**: o tribunal pode inserir hoje um andamento datado de duas
  semanas atrás. O critério é "não vista antes", **nunca** "data recente". Obrigatório.
- Teste de regressão: dados os snapshots A e B em fixture, o diff produz exatamente o
  conjunto esperado. Escreva os casos difíceis primeiro (retroativa, reordenação,
  duplicata legítima, movimentação removida).

### Fase 5 — classificação e priorização

`lib/classificacao.ts`. Regra baseada no **código TPU**, não em regex sobre o nome livre
(o nome varia por tribunal). Três níveis:

- **Crítico**: sentença, acórdão, decisão, julgamento, extinção, baixa definitiva,
  intimação, publicação, expedição de comunicação, designação de audiência, início de
  prazo, ato ordinatório com prazo.
- **Relevante**: juntada de petição da parte contrária, manifestação do MP, conclusão ao
  juiz, distribuição, redistribuição, remessa, recebimento, cumprimento de diligência.
- **Ruído**: juntada de documento próprio, decurso de prazo já conhecido, movimentação
  meramente cadastral.

A classificação vive em **tabela editável**, não em constante no código. O usuário
reclassifica um código e vê o efeito imediato, e pode definir regra por processo (um
processo específico pode exigir alerta em qualquer movimentação).

**Nunca infira data-limite de prazo.** Quando um código sugerir prazo em curso, sinalize
"possível prazo em curso, confira no DJEN e no sistema do tribunal" com link para a
consulta pública do tribunal daquele processo. Sinalizar, não calcular.

### Fase 6 — digest diário

- Job às 07:00 America/Sao_Paulo, dias úteis, com opção de rodar aos fins de semana.
- Faz sync completo da carteira, diff, classificação e emite e-mail HTML.
- Estrutura: resumo no topo (X consultados, Y com movimentação, Z críticas, W falhas);
  bloco de críticas agrupadas por processo com cliente e número formatado; relevantes;
  seção colapsada de ruído; bloco de saúde do sistema com falhas e latência por tribunal.
- **Se não houver novidade, mande e-mail curto de "nada novo hoje" mesmo assim.** Silêncio
  total é indistinguível de sistema quebrado, e essa distinção é crítica aqui.
- Se o job falhar por completo, alerta imediato separado.
- Cada item tem deep link para o processo no dashboard.

### Fase 7 — front-end

- `/` dashboard: cards de resumo, feed de movimentações não lidas por relevância, alerta
  de saúde do sistema, indicador de latência por tribunal.
- `/processos`: tabela com busca por número, cliente, tribunal e tag; filtros por status e
  relevância pendente; ações em lote (arquivar, pausar monitoramento, marcar como lido).
- `/processos/[id]`: capa com metadados, timeline vertical com badge de relevância, aba de
  alterações de capa, aba de histórico de snapshots, anotação livre do advogado, botão de
  forçar sync agora.
- `/processos/importar`: entrada em massa. Aceite cola de lista de números (um por linha) e
  upload de CSV. Valide DV, resolva alias, mostre pré-visualização com o que foi resolvido
  e o que precisa de confirmação, e só então grave. Consulte a API na importação para
  preencher capa e carregar o histórico inicial completo — **essa baseline não gera
  alerta**.
- `/configuracoes`: horário do digest, destinatários, classificação de códigos TPU, chave
  da API, rate limit.

Design: interface densa e sóbria, de ferramenta profissional. Prioridade absoluta para
legibilidade de tabela e timeline. Nada de dashboard decorativo.

### Fase 8 — observabilidade e confiança

- Página de status interna: última execução, duração, taxa de sucesso por tribunal,
  latência média do DataJud por tribunal nos últimos 30 dias.
- Alerta quando um processo ativo fica N dias sem movimentação **e** o tribunal dele está
  atualizando normalmente (processo parado de fato), e também quando um tribunal inteiro
  para de atualizar (problema na fonte, não no processo).
- CLI: `sync --processo=<numero>`, `sync --all`, `sync --dry-run`,
  `backfill --processo=<numero>`, `reprocessar-diff --processo=<numero>` (recalcula diff a
  partir dos snapshots gravados, sem tocar na API).

## 7. Roadmap posterior (arquitete pensando nisso, não implemente agora)

1. Ingestão do DJEN via API Comunica do PJe (`https://comunicaapi.pje.jus.br/api/v1/...`),
   por número de OAB e UF. É a fonte que efetivamente dispara prazo e cobre a lacuna do
   DataJud. Investigue documentação e autenticação antes de prometer. **A camada de "fonte
   de evento" deve ser abstrata desde já**, com o DataJud como primeiro adaptador, para o
   DJEN entrar como segundo sem reescrita.
2. Resumo em linguagem natural da movimentação e sugestão de próxima ação, via LLM, sempre
   com o texto original visível ao lado e sem nunca afirmar prazo.
3. Notificação por WhatsApp para movimentação crítica.
4. Visão por cliente, com relatório mensal enviável ao cliente.
5. Multiusuário com RLS por escritório.

## 8. Critérios de aceite do MVP

1. Importo 30 números por colagem, todos com DV validado e alias resolvido, e o histórico
   completo é carregado como baseline sem gerar alerta.
2. Rodo `sync --all` duas vezes seguidas: a segunda produz zero movimentação nova e zero
   notificação.
3. Injeto uma movimentação retroativa numa fixture: o sistema detecta como nova.
4. Simulo falha de autenticação: o sistema alerta sobre possível rotação de chave e não
   trava.
5. Simulo falha em um alias: os demais processos sincronizam normalmente e a falha aparece
   no digest.
6. Recebo o e-mail das 07:00 com agrupamento correto e deep links funcionais.
7. Nenhum segredo no repositório. Nenhuma tabela sem RLS.
8. Cobertura de teste do módulo de diff e do módulo CNJ acima de 90%.

## 9. Como trabalhar

- Comece pela Fase 0 e pare para reportar antes da Fase 1.
- Mantenha `docs/decisoes.md` registrando cada decisão técnica não óbvia, com a
  alternativa descartada e o motivo.
- Commits pequenos e descritivos, em português, um por unidade lógica.
- Ambiguidade de **produto**: pergunte, não assuma. Ambiguidade **técnica**: teste contra
  a API real e documente.
- Se descobrir que algo aqui está factualmente errado sobre a API, **corrija este
  documento** e diga o que mudou. Este documento é premissa a ser verificada, não verdade.
