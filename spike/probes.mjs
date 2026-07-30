/**
 * As sondagens da Fase 0.
 *
 * Cada função responde a UMA pergunta do CLAUDE.md §6 e devolve
 * `{ id, pergunta, resposta, evidencia }`. `resposta` é texto curto para o
 * relatório; `evidencia` é o dado bruto que sustenta a afirmação, porque uma
 * conclusão sem evidência anexada é só mais uma premissa.
 *
 * Todas as sondagens são isoladas pelo orquestrador (regra inviolável 6): falha
 * em uma não interrompe as demais.
 */

import { CABECALHOS_DE_INTERESSE } from './client.mjs'
import * as cnj from './cnj.mjs'
import { SWEEP_PADRAO, SWEEP_COMPLETO, ALIASES_INVALIDOS, segmentoDoAlias } from './aliases.mjs'

const INDETERMINADO = 'INDETERMINADO — sondagem não conseguiu concluir'

/* ------------------------------------------------------------------ *
 * P00 — Bootstrap: colher números reais sem conhecer nenhum de antemão
 * ------------------------------------------------------------------ */

/**
 * O CLAUDE.md pede "consulta um processo real do TJSC", mas não fornece número.
 * Em vez de pedir um número ao usuário e travar, pedimos à própria API: um
 * `match_all` devolve documentos reais arbitrários do índice. O spike passa a ser
 * autossuficiente e o usuário pode sempre fixar um número com --numero=.
 */
export async function p00Bootstrap(ctx) {
  const { cliente, opcoes } = ctx
  const alias = opcoes.alias
  const resposta = await cliente.buscar(
    alias,
    { size: opcoes.amostra, query: { match_all: {} } },
    { rotulo: 'p00-bootstrap' },
  )

  await ctx.salvarFixture(`p00-bootstrap-${alias}`, resposta)

  const documentos = extrairHits(resposta)
  const numeros = documentos
    .map((h) => cnj.normalizar(h._source?.numeroProcesso))
    .filter((n) => n.length === 20)

  ctx.estado.documentos.push(...documentos)
  ctx.estado.numeros.push(...new Set(numeros))

  return {
    id: 'P00',
    pergunta: 'É possível colher processos reais sem conhecer nenhum número de antemão?',
    resposta: resposta.ok
      ? `Sim. \`match_all\` em \`api_publica_${alias}\` devolveu ${documentos.length} documentos reais (HTTP ${resposta.status}, ${resposta.ms} ms, ${resposta.bytes} bytes). Total declarado no índice: ${totalDeclarado(resposta)}.`
      : `Não. HTTP ${resposta.status}. Sem isto as demais sondagens ficam sem insumo.`,
    evidencia: {
      status: resposta.status,
      totalNoIndice: totalDeclarado(resposta),
      numerosColhidos: numeros.slice(0, 10),
      cabecalhos: filtrarCabecalhos(resposta.cabecalhos),
    },
  }
}

/* ------------------------------------------------ *
 * P01 — Consulta por número e dump do JSON bruto
 * ------------------------------------------------ */

export async function p01ConsultaPorNumero(ctx) {
  const { cliente, opcoes } = ctx
  const numero = opcoes.numero ?? ctx.estado.numeros[0]
  if (!numero) return indeterminado('P01', 'Consulta por numeroProcesso devolve o processo?')

  const alias = opcoes.alias
  const resposta = await cliente.buscar(
    alias,
    { query: { match: { numeroProcesso: numero } } },
    { rotulo: 'p01-por-numero' },
  )
  await ctx.salvarFixture('p01-consulta-por-numero', resposta)

  const documentos = extrairHits(resposta)
  ctx.estado.documentos.push(...documentos)
  ctx.estado.numeroPrincipal = numero

  // O CLAUDE.md afirma que numeroProcesso é armazenado com 20 dígitos sem
  // pontuação. Conferimos consultando a forma pontuada do mesmo número.
  const formatado = cnj.formatar(numero)
  const respostaFormatada = await cliente.buscar(
    alias,
    { query: { match: { numeroProcesso: formatado } } },
    { rotulo: 'p01-por-numero-formatado' },
  )
  const hitsFormatado = extrairHits(respostaFormatada).length

  return {
    id: 'P01',
    pergunta: 'A consulta por `numeroProcesso` funciona e exige número normalizado?',
    resposta: `Número \`${numero}\` → HTTP ${resposta.status}, ${documentos.length} hit(s). A mesma consulta com o número pontuado (\`${formatado}\`) devolveu ${hitsFormatado} hit(s) — ${
      hitsFormatado === 0
        ? 'confirma que a normalização para 20 dígitos é OBRIGATÓRIA.'
        : 'atenção: a forma pontuada também casou, provavelmente por análise do texto; normalize de todo modo para não depender do analyzer.'
    }`,
    evidencia: {
      numero,
      status: resposta.status,
      hits: documentos.length,
      hitsComPontuacao: hitsFormatado,
      camposDoPrimeiroDocumento: documentos[0] ? Object.keys(documentos[0]._source ?? {}) : [],
    },
  }
}

/* ---------------------------------------------------------- *
 * P02 — Unicidade: um número devolve mais de um documento?
 * ---------------------------------------------------------- */

/**
 * Pergunta mais importante desta fase para a modelagem: qual é a chave real de
 * unicidade? Se um mesmo numeroProcesso devolve N documentos (1º grau, 2º grau),
 * então `numero_cnj` NÃO pode ser a chave primária de movimentação, e o caso (d)
 * da Fase 4 (surgimento de novo documento = novo grau) tem de ser detectável.
 */
export async function p02Unicidade(ctx) {
  const { cliente, opcoes } = ctx
  const alias = opcoes.alias

  // Tentativa barata primeiro: uma agregação encontra números com >1 documento
  // em uma única requisição — se agregações forem permitidas.
  const agg = await cliente.buscar(
    alias,
    {
      size: 0,
      aggs: {
        repetidos: {
          terms: { field: 'numeroProcesso', size: 20, min_doc_count: 2 },
        },
      },
    },
    { rotulo: 'p02-agg-repetidos' },
  )
  await ctx.salvarFixture('p02-agg-repetidos', agg)

  const agregacoesPermitidas = agg.ok && !!agg.json?.aggregations
  const baldes = agg.json?.aggregations?.repetidos?.buckets ?? []

  // Caminho robusto: varre números colhidos e conta documentos por número.
  const candidatos = [...new Set(ctx.estado.numeros)].slice(0, opcoes.maxUnicidade)
  const contagens = []
  for (const numero of candidatos) {
    const r = await cliente.buscar(
      alias,
      { size: 20, query: { match: { numeroProcesso: numero } } },
      { rotulo: 'p02-contagem' },
    )
    if (!r.ok) continue
    const hits = extrairHits(r)
    ctx.estado.documentos.push(...hits)
    contagens.push({
      numero,
      documentos: hits.length,
      graus: hits.map((h) => h._source?.grau ?? null),
      ids: hits.map((h) => h._id ?? h._source?.id ?? null),
      indices: [...new Set(hits.map((h) => h._index).filter(Boolean))],
      tribunais: [...new Set(hits.map((h) => h._source?.tribunal).filter(Boolean))],
    })
    if (hits.length > 1) {
      await ctx.salvarFixture(`p02-multi-documento-${numero}`, r)
    }
  }

  const multiplos = contagens.filter((c) => c.documentos > 1)
  const idsSaoUnicos = verificarIdsUnicos(ctx.estado.documentos)

  return {
    id: 'P02',
    pergunta:
      'O mesmo `numeroProcesso` retorna mais de um documento (1º grau, 2º grau, tribunais distintos)? Qual a chave real de unicidade?',
    resposta: [
      `Agregações ${agregacoesPermitidas ? 'SÃO' : 'NÃO são'} aceitas pela API${
        agregacoesPermitidas ? ` (${baldes.length} número(s) com 2+ documentos no balde)` : ` (HTTP ${agg.status})`
      }.`,
      `Varredura de ${contagens.length} número(s): ${multiplos.length} devolveram mais de um documento.`,
      multiplos.length
        ? `Exemplo: \`${multiplos[0].numero}\` → ${multiplos[0].documentos} documentos, graus ${JSON.stringify(multiplos[0].graus)}. Portanto a chave de unicidade é (numeroProcesso, grau[, tribunal]) e NÃO o número isolado; \`_id\` do ES ${idsSaoUnicos ? 'se mostrou único e é o candidato natural a chave técnica' : 'apresentou repetição e NÃO serve como chave sozinho'}.`
        : `Nenhum número da amostra devolveu múltiplos documentos. NÃO conclua que 1 número = 1 documento: a amostra pode simplesmente não conter processo com recurso. Modele (numeroProcesso, grau, tribunal) como chave e trate o caso (d) da Fase 4 de todo modo. \`_id\`: ${idsSaoUnicos.idsDistintos} distintos, ${idsSaoUnicos.idsComConteudoDivergente} com conteúdo divergente.`,
    ].join(' '),
    evidencia: { agregacoesPermitidas, baldes, contagens, idsSaoUnicos },
  }
}

/* ------------------------------------------------------------------ *
 * P03/P04 — movimentos: completude, ordenação e suficiência da tupla
 * ------------------------------------------------------------------ */

export async function p03Movimentos(ctx) {
  const documentos = ctx.estado.documentos
  if (!documentos.length) return indeterminado('P03', 'O array `movimentos` vem completo e ordenado?')

  const analises = documentos
    .map((h) => analisarMovimentos(h))
    .filter(Boolean)
    .sort((a, b) => b.quantidade - a.quantidade)

  const quantidades = analises.map((a) => a.quantidade)
  const ordenacoes = contar(analises.map((a) => a.ordenacao))
  // Contagem exatamente em número redondo é o sintoma clássico de truncamento.
  const suspeitasDeTruncamento = analises.filter((a) =>
    [10, 100, 500, 1000, 10_000].includes(a.quantidade),
  )

  const maior = analises[0]
  if (maior) await ctx.salvarFixture('p03-documento-com-mais-movimentos', maior.documento)

  return {
    id: 'P03',
    pergunta:
      'O array `movimentos` vem completo em toda resposta ou é paginado/truncado? Vem ordenado, e em qual sentido?',
    resposta: [
      `${analises.length} documento(s) analisado(s). Movimentos por documento: mín ${Math.min(...quantidades)}, máx ${Math.max(...quantidades)}, mediana ${mediana(quantidades)}.`,
      `Ordenação por \`dataHora\`: ${Object.entries(ordenacoes)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}.`,
      ordenacoes.desordenado
        ? '**O array NÃO é confiavelmente ordenado** — o motor de diff da Fase 4 deve ordenar por conta própria e nunca assumir que o último elemento é o mais recente.'
        : 'O array aparenta ordenação consistente, mas o diff da Fase 4 deve ordenar explicitamente de todo modo: depender da ordem da fonte é dívida gratuita.',
      suspeitasDeTruncamento.length
        ? `ATENÇÃO: ${suspeitasDeTruncamento.length} documento(s) com contagem exatamente redonda (${[...new Set(suspeitasDeTruncamento.map((a) => a.quantidade))].join(', ')}) — forte suspeita de truncamento do array. Investigue antes de confiar no histórico como completo.`
        : 'Nenhuma contagem redonda suspeita: não há indício de truncamento do array de movimentos.',
    ].join(' '),
    evidencia: {
      documentosAnalisados: analises.length,
      distribuicaoQuantidade: { min: Math.min(...quantidades), max: Math.max(...quantidades), mediana: mediana(quantidades) },
      ordenacoes,
      suspeitasDeTruncamento: suspeitasDeTruncamento.map((a) => ({ numero: a.numero, quantidade: a.quantidade })),
    },
  }
}

export async function p04ChaveDeMovimento(ctx) {
  const documentos = ctx.estado.documentos
  if (!documentos.length)
    return indeterminado('P04', 'A tupla (codigo, dataHora) basta como chave de movimentação?')

  let totalMovimentos = 0
  const colisoes = { codigoData: 0, comNome: 0, comComplementos: 0, objetoIdentico: 0 }
  const exemplos = []

  for (const hit of documentos) {
    const movimentos = hit?._source?.movimentos
    if (!Array.isArray(movimentos)) continue
    totalMovimentos += movimentos.length

    const grupos = new Map()
    for (const m of movimentos) {
      const chave = `${m?.codigo}|${m?.dataHora}`
      const lista = grupos.get(chave) ?? []
      lista.push(m)
      grupos.set(chave, lista)
    }

    for (const [chave, lista] of grupos) {
      if (lista.length < 2) continue
      colisoes.codigoData += lista.length - 1

      const nomes = new Set(lista.map((m) => normalizarNome(m?.nome)))
      if (nomes.size === 1) colisoes.comNome += lista.length - 1

      const complementos = new Set(lista.map((m) => JSON.stringify(m?.complementosTabelados ?? null)))
      if (nomes.size === 1 && complementos.size === 1) colisoes.comComplementos += lista.length - 1

      const objetos = new Set(lista.map((m) => JSON.stringify(m)))
      if (objetos.size === 1) colisoes.objetoIdentico += lista.length - 1

      if (exemplos.length < 5) {
        exemplos.push({
          numero: hit?._source?.numeroProcesso,
          grau: hit?._source?.grau,
          chave,
          ocorrencias: lista.length,
          nomesDistintos: nomes.size,
          complementosDistintos: complementos.size,
          objetosDistintos: objetos.size,
          amostra: lista.slice(0, 2),
        })
      }
    }
  }

  if (exemplos.length) await ctx.salvarFixture('p04-colisoes-de-chave', { exemplos })

  const chaveRecomendada =
    colisoes.objetoIdentico > 0
      ? 'sha256(processo_id, grau, codigo, dataHora, nome_normalizado, complementos_canonicos, indice_de_ocorrencia)'
      : colisoes.comComplementos > 0
        ? 'sha256(processo_id, grau, codigo, dataHora, nome_normalizado, complementos_canonicos, indice_de_ocorrencia)'
        : colisoes.comNome > 0
          ? 'sha256(processo_id, grau, codigo, dataHora, nome_normalizado, complementos_canonicos)'
          : colisoes.codigoData > 0
            ? 'sha256(processo_id, grau, codigo, dataHora, nome_normalizado)'
            : 'sha256(processo_id, grau, codigo, dataHora) — suficiente na amostra, mas ver ressalva'

  return {
    id: 'P04',
    pergunta:
      'Existem movimentações com `dataHora` e `codigo` idênticos no mesmo processo (a tupla é insuficiente como chave)?',
    resposta: [
      `${totalMovimentos} movimentações inspecionadas.`,
      `Colisões de (codigo, dataHora): **${colisoes.codigoData}**.`,
      `Dessas, mesmas também em \`nome\`: ${colisoes.comNome}; mesmas também em \`complementosTabelados\`: ${colisoes.comComplementos}; objetos JSON integralmente idênticos: **${colisoes.objetoIdentico}**.`,
      colisoes.objetoIdentico > 0
        ? 'Existem movimentações **indistinguíveis entre si**. Nenhuma combinação de campos as separa: o índice de ocorrência dentro do grupo é OBRIGATÓRIO na chave, senão a deduplicação apaga movimentação legítima (falso negativo — o pior defeito segundo o §2).'
        : colisoes.codigoData > 0
          ? 'A tupla (codigo, dataHora) é insuficiente, mas os campos adicionais separam os casos.'
          : 'Nenhuma colisão na amostra. Ainda assim inclua nome e complementos na chave: a amostra é pequena e o custo de errar é falso negativo.',
      `Chave sugerida para a Fase 4: \`${chaveRecomendada}\`.`,
    ].join(' '),
    evidencia: { totalMovimentos, colisoes, chaveRecomendada, exemplos },
  }
}

/* ---------------------------------------------- *
 * P05/P06 — size, sort, search_after (paginação)
 * ---------------------------------------------- */

export async function p05Size(ctx) {
  const { cliente, opcoes } = ctx
  const tentativas = []
  for (const size of [1, 100, 1000, 10_000, 10_001]) {
    // `_source: false` é OBRIGATÓRIO aqui: um documento real tem ~10 KB, então
    // size=10000 com _source traria ~100 MB por requisição. Queremos saber se o
    // `size` é ACEITO, não baixar o índice (regras 2 e 7).
    const r = await cliente.buscar(
      opcoes.alias,
      { size, _source: false, query: { match_all: {} } },
      { rotulo: `p05-size-${size}` },
    )
    tentativas.push({
      size,
      status: r.status,
      hitsRetornados: extrairHits(r).length,
      bytes: r.bytes,
      ms: r.ms,
      erro: r.json?.error?.type ?? r.json?.error?.reason ?? null,
    })
    if (size === 10_001) await ctx.salvarFixture('p05-size-excedido', r)
  }

  const aceitos = tentativas.filter((t) => t.status === 200)
  const maiorAceito = aceitos.length ? Math.max(...aceitos.map((t) => t.size)) : null

  return {
    id: 'P05',
    pergunta: 'A consulta aceita `size`? Qual o `size` máximo aceito?',
    resposta: maiorAceito
      ? `\`size\` é aceito. Maior valor com HTTP 200 na amostra: **${maiorAceito}**. ${
          tentativas.find((t) => t.size === 10_001 && t.status !== 200)
            ? 'O limite padrão do ElasticSearch (`index.max_result_window` = 10000) é aplicado: size acima disso é rejeitado.'
            : 'Nenhuma rejeição observada até 10001 — confirme o teto antes de depender dele.'
        }`
      : `Nenhuma tentativa retornou 200. ${INDETERMINADO}`,
    evidencia: { tentativas, maiorAceito },
  }
}

export async function p06Paginacao(ctx) {
  const { cliente, opcoes } = ctx

  const comSort = await cliente.buscar(
    opcoes.alias,
    { size: 2, _source: false, query: { match_all: {} }, sort: [{ '@timestamp': { order: 'asc' } }] },
    { rotulo: 'p06-sort' },
  )
  await ctx.salvarFixture('p06-sort', comSort)

  const hits = extrairHits(comSort)
  const ultimoSort = hits.at(-1)?.sort ?? null

  let comSearchAfter = null
  if (comSort.ok && ultimoSort) {
    comSearchAfter = await cliente.buscar(
      opcoes.alias,
      {
        size: 2,
        query: { match_all: {} },
        sort: [{ '@timestamp': { order: 'asc' } }],
        search_after: ultimoSort,
      },
      { rotulo: 'p06-search-after' },
    )
    await ctx.salvarFixture('p06-search-after', comSearchAfter)
  }

  const comFrom = await cliente.buscar(
    opcoes.alias,
    { size: 2, _source: false, query: { match_all: {} }, from: 2 },
    { rotulo: 'p06-from' },
  )

  const paginouDeVerdade =
    comSearchAfter?.ok &&
    extrairHits(comSearchAfter).length > 0 &&
    extrairHits(comSearchAfter)[0]?._id !== hits[0]?._id

  let notaSort
  if (!comSort.ok) {
    notaSort = `\`sort\`: HTTP ${comSort.status} (recusado).`
  } else if (ultimoSort) {
    notaSort = `\`sort\`: HTTP ${comSort.status} — aceito, e os hits trazem o campo \`sort\` exigido pelo \`search_after\`.`
  } else {
    notaSort = `\`sort\`: HTTP ${comSort.status} — aceito, porém os hits NÃO trazem o campo \`sort\`, o que inviabiliza \`search_after\`.`
  }

  return {
    id: 'P06',
    pergunta: 'A consulta aceita `sort` e `search_after`?',
    resposta: [
      notaSort,
      comSearchAfter
        ? `\`search_after\`: HTTP ${comSearchAfter.status}, ${paginouDeVerdade ? 'paginou corretamente (página seguinte trouxe documentos distintos)' : 'não avançou a página como esperado'}.`
        : '`search_after`: não testável sem `sort` funcional.',
      `\`from\`: HTTP ${comFrom.status}.`,
      paginouDeVerdade
        ? 'Backfill amplo por tribunal é viável via sort + search_after; ainda assim o produto só consulta a carteira do usuário (regra 7).'
        : 'Sem paginação confiável, planeje a ingestão apenas por número de processo.',
    ].join(' '),
    evidencia: {
      sortStatus: comSort.status,
      searchAfterStatus: comSearchAfter?.status ?? null,
      fromStatus: comFrom.status,
      paginouDeVerdade: !!paginouDeVerdade,
      exemploCampoSort: ultimoSort,
    },
  }
}

/* -------------------------------------------------------- *
 * P07 — consulta de múltiplos números numa só requisição
 * -------------------------------------------------------- */

/**
 * Se `terms` funcionar, a estratégia de lote muda por completo: em vez de 1
 * requisição por processo (carteira de 300 = 300 requisições = 5,5 min a 1 rps),
 * agrupamos N números por requisição. Isso é a diferença entre um digest que roda
 * em minutos e um que roda em horas.
 */
export async function p07Terms(ctx) {
  const { cliente, opcoes } = ctx
  const disponiveis = [...new Set(ctx.estado.numeros)]
  if (disponiveis.length < 2)
    return indeterminado('P07', 'É possível consultar múltiplos números numa única requisição?')

  const tentativas = []
  for (const tamanho of [2, 10, 50, 100, 1024, 65_537]) {
    // Completa o lote com números sintéticos válidos quando não há reais suficientes:
    // o objetivo aqui é descobrir o TETO ACEITO pela API, e para isso basta que os
    // números sejam bem formados — os hits continuam vindo só dos reais.
    const lote = preencherLote(disponiveis, tamanho)
    const r = await cliente.buscar(
      opcoes.alias,
      { size: 1000, _source: false, query: { terms: { numeroProcesso: lote } } },
      { rotulo: `p07-terms-${tamanho}` },
    )
    tentativas.push({
      numerosEnviados: lote.length,
      numerosReaisNoLote: Math.min(disponiveis.length, tamanho),
      status: r.status,
      hits: extrairHits(r).length,
      totalDeclarado: totalDeclarado(r),
      bytes: r.bytes,
      ms: r.ms,
      erro: r.json?.error?.type ?? r.json?.error?.root_cause?.[0]?.reason ?? null,
    })
    if (tamanho === 2) await ctx.salvarFixture('p07-terms-lote', r)
    // Não insista em lotes maiores depois que a API já recusou um menor.
    if (r.status !== 200) break
  }

  // `terms` sobre campo `text` falha silenciosamente (200 com 0 hits). Se for o
  // caso, o subcampo `.keyword` costuma resolver — testamos antes de desistir.
  const precisaKeyword = tentativas.some((t) => t.status === 200 && t.hits === 0)
  let comKeyword = null
  if (precisaKeyword) {
    comKeyword = await cliente.buscar(
      opcoes.alias,
      { size: 100, _source: false, query: { terms: { 'numeroProcesso.keyword': disponiveis.slice(0, 10) } } },
      { rotulo: 'p07-terms-keyword' },
    )
    await ctx.salvarFixture('p07-terms-keyword', comKeyword)
  }

  // `terms` exige o valor exato do campo indexado; se o campo for `text` analisado,
  // pode falhar silenciosamente (200 com 0 hits). Distinguimos os dois casos.
  const funcionou = tentativas.some((t) => t.status === 200 && t.hits > 0)
  const hitsComKeyword = comKeyword ? extrairHits(comKeyword).length : null
  const maiorLoteAceito = Math.max(0, ...tentativas.filter((t) => t.status === 200).map((t) => t.numerosEnviados))
  const maiorLoteOk = Math.max(
    0,
    ...tentativas.filter((t) => t.status === 200 && t.hits > 0).map((t) => t.numerosEnviados),
  )

  return {
    id: 'P07',
    pergunta:
      'É possível consultar múltiplos números numa única requisição (`terms`)? Qual o limite prático?',
    resposta: funcionou
      ? `**Sim.** Maior lote que retornou hits: ${maiorLoteOk} números; maior lote ACEITO (HTTP 200) : ${maiorLoteAceito}. Isso muda a estratégia de lote da Fase 3: agrupe a carteira por alias e consulte em lotes, respeitando o teto de \`size\` de P05 — como um processo pode devolver mais de um documento (P02), o lote precisa caber no \`size\`, não no número de processos.`
      : hitsComKeyword
        ? `**Sim, mas via \`numeroProcesso.keyword\`**: \`terms\` sobre \`numeroProcesso\` devolveu 200 com 0 hits (campo \`text\` analisado), enquanto o subcampo \`.keyword\` devolveu ${hitsComKeyword} hit(s). Use o subcampo para lote.`
        : `Não confirmado. ${tentativas.map((t) => `${t.numerosEnviados}→HTTP ${t.status}/${t.hits} hits`).join(', ')}. Caia para \`bool.should\` de \`match\` (N cláusulas numa requisição) e, se nem isso, 1 requisição por processo na Fase 3.`,
    evidencia: { tentativas, maiorLoteOk, maiorLoteAceito, hitsComKeyword },
  }
}

/* ------------------------------------------------ *
 * P08 — comportamento de erro (crítico p/ MVP #4)
 * ------------------------------------------------ */

export async function p08Erros(ctx) {
  const { cliente, opcoes } = ctx
  const casos = []

  async function registrar(nome, alias, corpo, extras = {}) {
    const r = await cliente.buscar(alias, corpo, { rotulo: `p08-${nome}`, ...extras })
    casos.push({
      caso: nome,
      alias,
      status: r.status,
      hits: extrairHits(r).length,
      tipoDeErro: r.json?.error?.type ?? null,
      motivo: recortar(r.json?.error?.reason ?? r.json?.message ?? r.texto, 200),
      corpoResumido: recortar(r.texto, 300),
    })
    await ctx.salvarFixture(`p08-${nome}`, r)
    return r
  }

  // Número sintaticamente válido (DV correto) mas inexistente.
  const inexistente = numeroInexistenteValido()
  await registrar('numero-inexistente', opcoes.alias, {
    query: { match: { numeroProcesso: inexistente } },
  })

  // Número real de um tribunal consultado no índice de OUTRO tribunal.
  const numeroReal = ctx.estado.numeroPrincipal ?? ctx.estado.numeros[0]
  if (numeroReal) {
    const outroAlias = opcoes.alias === 'tjsp' ? 'tjrj' : 'tjsp'
    await registrar('numero-de-outro-tribunal', outroAlias, {
      query: { match: { numeroProcesso: numeroReal } },
    })
  }

  // Alias inexistente.
  for (const alias of ALIASES_INVALIDOS) {
    await registrar(`alias-invalido-${alias}`, alias, { query: { match_all: {} }, size: 1 })
  }

  // Corpo malformado.
  await registrar('body-malformado', opcoes.alias, '{"query": {"match": ')

  // Sem cabeçalho Authorization.
  const semAuth = await registrar(
    'sem-autenticacao',
    opcoes.alias,
    { query: { match_all: {} }, size: 1 },
    { semAutenticacao: true },
  )

  // Chave inválida — simula exatamente a rotação de chave pelo CNJ (critério MVP 4).
  const chaveErrada = await registrar(
    'chave-invalida',
    opcoes.alias,
    { query: { match_all: {} }, size: 1 },
    { apiKeyUsada: 'APIKeyObviamenteInvalidaParaTesteDeRotacao' },
  )

  return {
    id: 'P08',
    pergunta:
      'Qual o comportamento em número inexistente, número de outro tribunal, alias errado, corpo inválido e chave inválida?',
    resposta: [
      `Número inexistente: ${descrever(casos, 'numero-inexistente')} — não é erro HTTP, é resposta vazia; o sync precisa distinguir "não achou" de "falhou".`,
      `Número de outro tribunal: ${descrever(casos, 'numero-de-outro-tribunal')} — reforça que o alias tem de estar certo, senão o processo parece não existir (falso negativo silencioso).`,
      `Alias inválido: ${casos.filter((c) => c.caso.startsWith('alias-invalido')).map((c) => `${c.alias}→HTTP ${c.status}`).join(', ')}.`,
      `Corpo malformado: ${descrever(casos, 'body-malformado')}.`,
      `Sem \`Authorization\`: HTTP ${semAuth.status}. Chave inválida: HTTP ${chaveErrada.status}. → O health check da rotação de chave deve disparar em ${[semAuth.status, chaveErrada.status].join('/')} .`,
    ].join(' '),
    evidencia: {
      casos,
      statusDeFalhaDeAutenticacao: [...new Set([semAuth.status, chaveErrada.status])],
      numeroInexistenteUsado: inexistente,
    },
  }
}

/* ---------------------------- *
 * P09 — rate limit declarado
 * ---------------------------- */

/**
 * Deliberadamente OPT-IN (--rate-limit-probe). Estourar de propósito o limite de
 * uma API pública é incivil (regra 2) e só se justifica uma vez, para descobrir o
 * status e o cabeçalho de resposta. O padrão é não rodar.
 */
export async function p09RateLimit(ctx) {
  const { cliente, opcoes } = ctx
  if (!opcoes.sondarRateLimit) {
    return {
      id: 'P09',
      pergunta: 'Existe rate limit declarado? Qual o status e o header retornado ao estourar?',
      resposta:
        'NÃO EXECUTADO por padrão. Estourar de propósito o limite de uma API pública contraria a regra 2 do CLAUDE.md; rode `--rate-limit-probe` uma única vez, de forma consciente, se precisar do dado. Os cabeçalhos de todas as demais requisições foram inspecionados e constam na evidência.',
      evidencia: { cabecalhosObservados: ctx.estado.cabecalhosVistos },
    }
  }

  const rajada = Number(opcoes.rajada)
  const resultados = await Promise.all(
    Array.from({ length: rajada }, (_, i) =>
      cliente
        .buscar(
          opcoes.alias,
          { size: 1, query: { match_all: {} } },
          { rotulo: `p09-rajada-${i}`, ignorarRateLimit: true },
        )
        .then((r) => ({ status: r.status, ms: r.ms, cabecalhos: filtrarCabecalhos(r.cabecalhos) }))
        .catch((e) => ({ status: 0, erro: String(e.message) })),
    ),
  )

  const limitados = resultados.filter((r) => r.status === 429)
  return {
    id: 'P09',
    pergunta: 'Existe rate limit declarado? Qual o status e o header retornado ao estourar?',
    resposta: limitados.length
      ? `Rajada de ${rajada} requisições concorrentes: ${limitados.length} receberam HTTP 429. Cabeçalhos relevantes: ${JSON.stringify(limitados[0].cabecalhos)}.`
      : `Rajada de ${rajada} requisições concorrentes NÃO produziu 429 (status observados: ${[...new Set(resultados.map((r) => r.status))].join(', ')}). Não conclua que não há limite: pode haver limite por janela mais longa, ou o teto é acima da rajada testada. Mantenha 1 rps como padrão.`,
    evidencia: { rajada, statusObservados: contar(resultados.map((r) => String(r.status))), amostra: resultados.slice(0, 5) },
  }
}

/* ------------------------------------------------------- *
 * P10 — latência da fonte (o "quanto confiar" do produto)
 * ------------------------------------------------------- */

export async function p10Latencia(ctx) {
  const documentos = ctx.estado.documentos
  if (!documentos.length) return indeterminado('P10', 'Qual a latência de carga do DataJud?')

  const agora = Date.now()
  const porTribunal = new Map()

  for (const hit of documentos) {
    const fonte = hit?._source
    if (!fonte) continue
    const tribunal = fonte.tribunal ?? hit._index ?? 'desconhecido'

    const datas = (Array.isArray(fonte.movimentos) ? fonte.movimentos : [])
      .map((m) => Date.parse(m?.dataHora))
      .filter(Number.isFinite)
    const ultimoMovimento = datas.length ? Math.max(...datas) : null
    const ultimaAtualizacao = Date.parse(fonte.dataHoraUltimaAtualizacao ?? '')

    const registro = porTribunal.get(tribunal) ?? { tribunal, amostras: [] }
    registro.amostras.push({
      diasDesdeUltimoMovimento: ultimoMovimento ? diasEntre(ultimoMovimento, agora) : null,
      diasDesdeUltimaAtualizacao: Number.isFinite(ultimaAtualizacao)
        ? diasEntre(ultimaAtualizacao, agora)
        : null,
      nivelSigilo: fonte.nivelSigilo ?? null,
    })
    porTribunal.set(tribunal, registro)
  }

  const resumo = [...porTribunal.values()].map((r) => {
    const atualizacoes = r.amostras.map((a) => a.diasDesdeUltimaAtualizacao).filter((v) => v !== null)
    return {
      tribunal: r.tribunal,
      documentos: r.amostras.length,
      medianaDiasUltimaAtualizacao: atualizacoes.length ? mediana(atualizacoes) : null,
      minimoDiasUltimaAtualizacao: atualizacoes.length ? Math.min(...atualizacoes) : null,
    }
  })

  const sigilos = contar(
    documentos.map((h) => `nivelSigilo=${h?._source?.nivelSigilo ?? 'ausente'}`),
  )

  return {
    id: 'P10',
    pergunta: 'Qual a latência real da carga do DataJud, e como se comportam os processos sigilosos?',
    resposta: [
      `Latência medida como (hoje − \`dataHoraUltimaAtualizacao\`) por tribunal: ${resumo
        .map((r) => `${r.tribunal}: mediana ${r.medianaDiasUltimaAtualizacao} d (mínimo ${r.minimoDiasUltimaAtualizacao} d)`)
        .join('; ')}.`,
      `O mínimo é a melhor estimativa do atraso estrutural do tribunal — a mediana é inflada por processos parados.`,
      `Distribuição de \`nivelSigilo\` na amostra: ${JSON.stringify(sigilos)}.`,
      'Estes números alimentam o indicador de latência por tribunal exigido nas Fases 6, 7 e 8.',
    ].join(' '),
    evidencia: { porTribunal: resumo, sigilos },
  }
}

/* -------------------------------------------------------------------- *
 * P11 — sweep: alias existe? e qual J.TR ele realmente contém?
 * -------------------------------------------------------------------- */

/**
 * Resolve empiricamente o que a Fase 2 não pode adivinhar. Para cada alias
 * candidato pedimos 1 documento e lemos os dígitos J e TR do numeroProcesso que
 * voltou. O mapeamento J.TR -> alias sai do dado. De brinde, validamos o algoritmo
 * do DV contra todos os números reais colhidos.
 */
export async function p11SweepDeAliases(ctx) {
  const { cliente, opcoes } = ctx
  if (opcoes.pularSweep) {
    return {
      id: 'P11',
      pergunta: 'Quais aliases existem e qual J.TR cada um contém?',
      resposta: 'NÃO EXECUTADO (--pular-sweep).',
      evidencia: {},
    }
  }

  const lista = opcoes.sweepCompleto ? SWEEP_COMPLETO : SWEEP_PADRAO
  const resultados = []

  for (const alias of lista) {
    let r
    try {
      r = await cliente.buscar(
        alias,
        { size: opcoes.amostraSweep, query: { match_all: {} } },
        { rotulo: `p11-${alias}` },
      )
    } catch (erro) {
      resultados.push({ alias, status: 0, erro: String(erro.message), existe: false })
      continue
    }

    const hits = extrairHits(r)
    const numeros = hits.map((h) => cnj.normalizar(h._source?.numeroProcesso)).filter((n) => n.length === 20)
    const jtrs = [...new Set(numeros.map((n) => cnj.decompor(n)?.jtr).filter(Boolean))]

    resultados.push({
      alias,
      segmento: segmentoDoAlias(alias),
      status: r.status,
      existe: r.status === 200,
      documentos: hits.length,
      totalNoIndice: totalDeclarado(r),
      jtrObservados: jtrs,
      tribunaisObservados: [...new Set(hits.map((h) => h._source?.tribunal).filter(Boolean))],
      grausObservados: [...new Set(hits.map((h) => h._source?.grau).filter(Boolean))],
      exemploNumero: numeros[0] ?? null,
    })

    // Alimenta as demais análises com documentos de tribunais variados.
    ctx.estado.documentos.push(...hits)
    if (numeros.length) ctx.estado.numerosDeSweep.push(...numeros)
  }

  await ctx.salvarFixture('p11-sweep-aliases', { resultados })

  const existentes = resultados.filter((r) => r.existe)
  const ausentes = resultados.filter((r) => !r.existe)

  // Validação do DV contra números reais: se falhar muito, o algoritmo está errado.
  const todosOsNumeros = [...new Set([...ctx.estado.numeros, ...ctx.estado.numerosDeSweep])]
  const invalidos = todosOsNumeros.filter((n) => !cnj.validarDV(n))

  // Ambiguidade: um mesmo J.TR aparecendo em mais de um alias quebraria resolverAlias().
  const porJtr = new Map()
  for (const r of existentes) {
    for (const jtr of r.jtrObservados) {
      porJtr.set(jtr, [...(porJtr.get(jtr) ?? []), r.alias])
    }
  }
  const jtrAmbiguos = [...porJtr.entries()].filter(([, aliases]) => aliases.length > 1)

  return {
    id: 'P11',
    pergunta:
      'Quais aliases existem de fato, qual J.TR cada um contém, e o algoritmo do DV confere com números reais?',
    resposta: [
      `${existentes.length}/${resultados.length} aliases responderam HTTP 200.`,
      ausentes.length
        ? `Não responderam (${ausentes.length}): ${ausentes
            .slice(0, 20)
            .map((a) => `${a.alias}(${a.status})`)
            .join(', ')}${ausentes.length > 20 ? ` … e outros ${ausentes.length - 20}, ver evidência` : ''}.`
        : 'Todos os candidatos responderam.',
      `Mapeamento J.TR → alias derivado de dado real para ${porJtr.size} combinação(ões).`,
      jtrAmbiguos.length
        ? `**ATENÇÃO: J.TR ambíguo** — ${jtrAmbiguos.map(([jtr, aliases]) => `${jtr} aparece em ${aliases.join('/')}`).join('; ')}. \`resolverAlias()\` não pode ser função pura de J.TR nesses casos; exija confirmação manual.`
        : 'Nenhum J.TR ambíguo na amostra: `resolverAlias()` pode ser determinístico para os pares observados.',
      `Validação do DV (ISO 7064 MOD 97-10) contra ${todosOsNumeros.length} números reais: ${invalidos.length} reprovaram. ${
        invalidos.length === 0
          ? 'O algoritmo está correto e pode ir para lib/cnj.ts com confiança.'
          : `**Revise o algoritmo ou a premissa antes da Fase 2.** Exemplos reprovados: ${invalidos.slice(0, 5).join(', ')}.`
      }`,
    ].join(' '),
    evidencia: {
      existentes: existentes.map((r) => ({
        alias: r.alias,
        segmento: r.segmento,
        jtr: r.jtrObservados,
        tribunal: r.tribunaisObservados,
        graus: r.grausObservados,
        totalNoIndice: r.totalNoIndice,
      })),
      ausentes: ausentes.map((r) => ({ alias: r.alias, status: r.status })),
      mapeamentoJtr: Object.fromEntries(porJtr),
      jtrAmbiguos,
      dv: {
        numerosTestados: todosOsNumeros.length,
        reprovados: invalidos.length,
        exemplosReprovados: invalidos.slice(0, 10),
      },
    },
  }
}

/* ---------------- helpers ---------------- */

export function extrairHits(resposta) {
  const hits = resposta?.json?.hits?.hits
  return Array.isArray(hits) ? hits : []
}

function totalDeclarado(resposta) {
  const total = resposta?.json?.hits?.total
  if (total && typeof total === 'object') return total.value ?? null
  return total ?? null
}

function filtrarCabecalhos(cabecalhos = {}) {
  const saida = {}
  for (const chave of CABECALHOS_DE_INTERESSE) {
    if (cabecalhos[chave] !== undefined) saida[chave] = cabecalhos[chave]
  }
  return saida
}

/**
 * `_id` do ElasticSearch é candidato natural a chave técnica, mas só serve se for
 * estável e único por (número, grau). Aqui checamos se algum `_id` aparece
 * associado a conteúdo divergente, o que o desqualificaria.
 */
function verificarIdsUnicos(documentos) {
  const porId = new Map()
  for (const hit of documentos) {
    const id = hit?._id ?? hit?._source?.id
    if (!id) continue
    const assinatura = `${hit?._source?.numeroProcesso}|${hit?._source?.grau}|${hit?._index}`
    const conhecidas = porId.get(id) ?? new Set()
    conhecidas.add(assinatura)
    porId.set(id, conhecidas)
  }
  const conflitantes = [...porId.entries()].filter(([, assinaturas]) => assinaturas.size > 1)
  return {
    idsDistintos: porId.size,
    idsComConteudoDivergente: conflitantes.length,
    unico: conflitantes.length === 0 && porId.size > 0,
    exemplosConflitantes: conflitantes.slice(0, 3).map(([id, s]) => ({ id, assinaturas: [...s] })),
  }
}

function analisarMovimentos(hit) {
  const movimentos = hit?._source?.movimentos
  if (!Array.isArray(movimentos)) return null
  const datas = movimentos.map((m) => Date.parse(m?.dataHora)).filter(Number.isFinite)

  let ordenacao = 'indefinido'
  if (datas.length > 1) {
    const crescente = datas.every((d, i) => i === 0 || d >= datas[i - 1])
    const decrescente = datas.every((d, i) => i === 0 || d <= datas[i - 1])
    ordenacao = crescente ? 'crescente' : decrescente ? 'decrescente' : 'desordenado'
  }

  return {
    numero: hit._source?.numeroProcesso,
    quantidade: movimentos.length,
    datasParseaveis: datas.length,
    ordenacao,
    documento: hit,
  }
}

function normalizarNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Número sintaticamente válido (DV correto) mas com sequencial improvável, para
 * separar "processo não existe" de "requisição falhou".
 */
function numeroInexistenteValido(sequencial = '9999999', origem = '0001') {
  return montarNumeroValido({ sequencial, ano: '2024', segmento: '8', tribunal: '24', origem })
}

/**
 * Devolve um lote de `tamanho` números: primeiro os reais, depois sintéticos
 * válidos para completar. Sintéticos não produzem hits — servem só para medir o
 * teto de aceitação da API.
 */
function preencherLote(reais, tamanho) {
  const lote = reais.slice(0, tamanho)
  for (let i = lote.length; i < tamanho; i++) {
    lote.push(
      montarNumeroValido({
        sequencial: String(1_000_000 + i).slice(0, 7),
        ano: '2019',
        segmento: '8',
        tribunal: '24',
        origem: '0001',
      }),
    )
  }
  return lote
}

/** Monta um número de 20 dígitos com DV calculado. */
function montarNumeroValido({ sequencial, ano, segmento, tribunal, origem }) {
  const comDvZerado = `${sequencial}00${ano}${segmento}${tribunal}${origem}`
  const dv = cnj.calcularDV(comDvZerado)
  return `${sequencial}${dv}${ano}${segmento}${tribunal}${origem}`
}

function descrever(casos, nome) {
  const c = casos.find((x) => x.caso === nome)
  if (!c) return 'não executado'
  return `HTTP ${c.status}, ${c.hits} hit(s)${c.tipoDeErro ? `, erro \`${c.tipoDeErro}\`` : ''}`
}

function indeterminado(id, pergunta) {
  return { id, pergunta, resposta: INDETERMINADO, evidencia: {} }
}

function contar(lista) {
  return lista.reduce((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {})
}

function mediana(numeros) {
  if (!numeros.length) return null
  const ordenados = [...numeros].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 ? ordenados[meio] : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2)
}

function diasEntre(inicio, fim) {
  return Math.round((fim - inicio) / 86_400_000)
}

function recortar(texto, max) {
  const t = String(texto ?? '')
  return t.length > max ? `${t.slice(0, max)}…` : t
}
