# Decisões técnicas

Registro de cada decisão não óbvia, com a alternativa descartada e o motivo
(CLAUDE.md §9). Ordem cronológica; a mais recente por último dentro de cada fase.

---

## Fase 0 — spike de validação

### D-001 — O spike é JavaScript puro (`.mjs`), não TypeScript

**Decisão.** `spike/*.mjs`, zero dependências, zero passo de build.

**Alternativa descartada.** TypeScript + tsx/ts-node, como o resto da stack.

**Motivo.** O CLAUDE.md chama a Fase 0 de "script descartável" e o valor dele está em
rodar em qualquer máquina com um comando, hoje. Introduzir `package.json`, `tsconfig` e
um runner só para o spike adicionaria pontos de falha entre o operador e o dado. O
código definitivo e tipado é a Fase 3, e a tipagem de lá vai ser **gerada a partir do
schema que este spike descobrir** — tipar o spike seria tipar contra a suposição que
estamos justamente tentando verificar.

---

### D-002 — O spike descobre os números de processo em vez de exigi-los

**Decisão.** P00 usa `match_all` para colher documentos reais arbitrários do índice do
tribunal e extrai daí os números que as outras sondagens consomem. `--numero=` permite
fixar um processo específico.

**Alternativa descartada.** Exigir que o usuário forneça um número real do TJSC (o
CLAUDE.md pede "um processo real do TJSC", sem informar qual).

**Motivo.** Torna o spike autossuficiente e reprodutível por qualquer pessoa, e permite
amostrar dezenas de processos em vez de um — o que é o que dá poder estatístico a P03
(ordenação), P04 (colisão de chave) e P10 (latência). Um único processo não responderia
"existem movimentações com dataHora idêntica?" com nenhuma confiança.

---

### D-003 — O mapeamento J.TR → alias é derivado de dado, não de memória nem da wiki

**Decisão.** P11 pede um documento real a cada índice candidato e lê os dígitos J e TR
do `numeroProcesso` retornado. O mapeamento é inferido dessas observações, e J.TR que
apareça em mais de um alias é reportado como **ambíguo**, exigindo confirmação manual.

**Alternativa descartada.** Raspar a tabela de endpoints da wiki do CNJ e confiar nela.

**Motivo.** A wiki é prosa e pode estar desatualizada; a memória do modelo é
explicitamente proibida pelo CLAUDE.md como fonte. O índice que responde e o número que
ele contém são o fato. A wiki continua sendo a referência para descobrir *quais aliases
tentar* — mas quem confirma é a API. Aliases sem confirmação empírica devem entrar no
cadastro como `nao_verificado`, conforme a Fase 2 já prevê.

---

### D-004 — A validação do dígito verificador é testada contra números reais no spike

**Decisão.** P11 roda o algoritmo ISO 7064 MOD 97-10 contra todos os números colhidos da
API e reporta quantos reprovaram.

**Alternativa descartada.** Escrever `validarDV()` na Fase 2 e cobrir só com testes
unitários de números inventados.

**Motivo.** Um `validarDV()` errado é especialmente perigoso porque a Fase 2 o usa para
**recusar cadastro** ("número inválido não entra no cadastro"). Se o algoritmo tiver
qualquer defeito, o sistema passa a rejeitar processos legítimos do usuário — falha
silenciosa e do tipo mais caro. Validar contra centenas de números que o CNJ considera
válidos, antes de escrever a camada, é barato e conclusivo. Testes unitários com números
inventados só provam que o código concorda consigo mesmo.

---

### D-005 — A sondagem de rate limit é opt-in

**Decisão.** P09 não roda por padrão. Sem a flag `--rate-limit-probe`, o spike apenas
inspeciona os cabeçalhos das requisições normais em busca de limite declarado.

**Alternativa descartada.** Sempre disparar uma rajada concorrente para descobrir o
status e o cabeçalho de estouro.

**Motivo.** O CLAUDE.md pede o dado (§6, Fase 0), mas as regras 2 e 7 pedem civilidade
com uma API pública e respeito ao Termo de Uso. As duas coisas se conciliam fazendo a
sondagem existir, ser consciente e rodar uma vez, em vez de a cada execução do spike.

---

### D-006 — Fixtures guardam a resposta crua, sem envelope próprio

**Decisão.** `tests/fixtures/datajud/<nome>.json` contém exatamente o corpo JSON que a
API devolveu. Metadados (status, URL, cabeçalhos) ficam à parte, em `manifest.json`.

**Alternativa descartada.** Gravar `{ status, headers, body }` num envelope por fixture.

**Motivo.** O `--dry-run` da Fase 3 precisa consumir fixture no lugar da resposta de
rede sem tradução, e o motor de diff da Fase 4 precisa comparar snapshot A com snapshot
B diretamente. Envelope obrigaria toda leitura a desembrulhar, e um desembrulho é uma
oportunidade de o teste divergir da produção.

---

### D-007 — Bloqueio de rede no ambiente de desenvolvimento remoto

**Decisão.** O spike foi escrito e validado de ponta a ponta contra um mock local que
reproduz o formato ElasticSearch, incluindo os casos difíceis (processo em dois graus,
movimentações integralmente idênticas, array desordenado, `terms` sobre campo `text`,
401/403, rejeição de `size > 10000`). **Ele ainda não rodou contra a API real.**

**Motivo.** A política de egresso do ambiente remoto em que este código foi escrito nega
`api-publica.datajud.cnj.jus.br`, `datajud-wiki.cnj.jus.br` e `comunicaapi.pje.jus.br`
(CONNECT respondido com 403 pelo proxy). Sem acesso à API não há como cumprir a Fase 0 —
que é, por definição, validação empírica.

**Consequência.** Nenhuma premissa do §3 do CLAUDE.md está confirmada. Os documentos
`docs/datajud-schema.md` e `docs/fase-0-descobertas.md` **só existem depois** de uma
execução real, e não foram versionados a partir do mock justamente para não passarem por
verificados. Rodar o spike de um ambiente com acesso é o próximo passo obrigatório antes
da Fase 1.

---

### D-008 — A plataforma assume a raiz; o dashboard do Instagram sai (pendente)

**Decisão do usuário.** A plataforma ocupa a raiz do repositório, com os caminhos do
CLAUDE.md valendo literalmente (`lib/`, `supabase/migrations/`, `docs/`, `tests/`). O
dashboard de campanhas do Instagram é removido, com o histórico do git preservando-o.

**Alternativa descartada.** Subdiretório dedicado (`monitor-processual/`), que evitaria a
colisão sem remover nada.

**Motivo.** Colisão direta: o dashboard já ocupa `src/app`, `package.json`,
`next.config.js`, `tailwind.config.js`, `tsconfig.json` e `postcss.config.js` — todos
necessários ao front-end da Fase 7. Duas aplicações Next.js sem relação na mesma base
seria atrito permanente.

**PENDENTE, e de propósito.** A remoção ainda não foi executada. Os arquivos
`gestao-favo.js`, `criar-favo-reveal.js`, `ativar-favo-reveal.js` e `dashboard.html` são
trabalho **recente e aparentemente em andamento** (últimos seis commits do repositório,
com uma branch paralela `claude/instagram-campaign-analysis-*` ativa). Apagá-los a partir
desta branch os removeria do main na integração. Confirmar com o usuário, arquivo por
arquivo, antes de remover qualquer coisa — a decisão de layout foi tomada sem que essa
sobreposição estivesse à vista.

---

### D-009 — A chave da API foi redigida do CLAUDE.md versionado

**Decisão.** O `CLAUDE.md` na raiz reproduz o documento original, porém com o valor da
chave substituído por `<DATAJUD_API_KEY>` e um ponteiro para a página oficial do CNJ.

**Alternativa descartada.** Versionar o documento exatamente como recebido, com a chave.

**Motivo.** A regra inviolável 1 não abre exceção para segredo de baixo valor, e o próprio
critério de aceite 7 exige "nenhum segredo no repositório". A chave ser pública e
compartilhada reduz o impacto, não a violação: uma chave literal no repositório ensina o
padrão errado e sobrevive no histórico do git mesmo depois de removida. Como o CNJ pode
rotacioná-la sem aviso, um valor fixo no documento estaria errado em algum momento de todo
modo — o ponteiro para a wiki não.
