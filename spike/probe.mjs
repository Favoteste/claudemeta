#!/usr/bin/env node
/**
 * Spike da Fase 0 — orquestrador.
 *
 * Objetivo único: responder empiricamente às perguntas do CLAUDE.md §6 (FASE 0)
 * contra a API real, gravar as respostas cruas como fixtures e gerar os dois
 * documentos que a Fase 1 vai consumir:
 *
 *   docs/datajud-schema.md      — estrutura real, campo por campo
 *   docs/fase-0-descobertas.md  — resposta a cada pergunta, com evidência
 *
 * Uso:
 *   export DATAJUD_API_KEY='APIKey...'   # só a chave, sem o prefixo "APIKey "
 *   node spike/probe.mjs
 *   node spike/probe.mjs --alias=tjsp --numero=50012345620248240008
 *   node spike/probe.mjs --sweep-completo          # inclui TREs e TJMs (grafia em teste)
 *   node spike/probe.mjs --pular-sweep             # rápido, só o essencial
 *   node spike/probe.mjs --rate-limit-probe        # OPT-IN, incivil, rode uma vez só
 *
 * Este script é descartável (CLAUDE.md §6, Fase 0). Não construa nada sobre ele:
 * o cliente definitivo e tipado é a Fase 3.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { criarCliente, BASE_URL_PADRAO } from './client.mjs'
import * as schema from './schema.mjs'
import * as probes from './probes.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..')
const DIR_FIXTURES = path.join(RAIZ, 'tests', 'fixtures', 'datajud')
const DIR_DOCS = path.join(RAIZ, 'docs')
const DIR_SAIDA = path.join(RAIZ, 'spike', 'out')

/* ----------------------------- CLI ----------------------------- */

function lerOpcoes(argv) {
  const bandeiras = new Map()
  for (const arg of argv.slice(2)) {
    const [chave, valor] = arg.replace(/^--/, '').split('=')
    bandeiras.set(chave, valor ?? true)
  }
  return {
    alias: String(bandeiras.get('alias') ?? 'tjsc'),
    numero: bandeiras.get('numero') ? String(bandeiras.get('numero')).replace(/\D/g, '') : null,
    amostra: Number(bandeiras.get('amostra') ?? 25),
    amostraSweep: Number(bandeiras.get('amostra-sweep') ?? 3),
    maxUnicidade: Number(bandeiras.get('max-unicidade') ?? 15),
    pularSweep: bandeiras.has('pular-sweep'),
    sweepCompleto: bandeiras.has('sweep-completo'),
    sondarRateLimit: bandeiras.has('rate-limit-probe'),
    rajada: Number(bandeiras.get('rajada') ?? 25),
    verboso: bandeiras.has('verboso'),
    // A API pública é lenta (~40 s por consulta) e a chave é COMPARTILHADA por todos
    // os consumidores do país, então 429 é ruído de fundo que não depende do nosso
    // ritmo. Permite rodar um subconjunto e gastar a cota onde ela rende mais.
    sondagens: bandeiras.get('sondagens')
      ? String(bandeiras.get('sondagens'))
          .toUpperCase()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
  }
}

/* ----------------------- infraestrutura ----------------------- */

async function main() {
  const opcoes = lerOpcoes(process.argv)
  const apiKey = (process.env.DATAJUD_API_KEY ?? '').replace(/^APIKey\s+/i, '').trim()

  if (!apiKey) {
    console.error(
      [
        'ERRO: DATAJUD_API_KEY não está definida.',
        '',
        'A chave da API Pública do DataJud é pública e compartilhada, mas NÃO vai',
        'hardcoded no repositório (regra inviolável 1). Copie .env.example para .env,',
        'preencha DATAJUD_API_KEY e exporte antes de rodar:',
        '',
        '  export DATAJUD_API_KEY="$(grep ^DATAJUD_API_KEY .env | cut -d= -f2-)"',
        '',
        'A chave vigente é publicada em:',
        '  https://datajud-wiki.cnj.jus.br/api-publica/acesso',
      ].join('\n'),
    )
    process.exitCode = 1
    return
  }

  // O `fetch` embutido do Node IGNORA HTTPS_PROXY a menos que NODE_USE_ENV_PROXY=1
  // esteja definido na PARTIDA do processo (não dá para ligar daqui). Em ambiente
  // com proxy de egresso, sem isso toda requisição falha por timeout sem explicação.
  const temProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy
  if (temProxy && process.env.NODE_USE_ENV_PROXY !== '1') {
    console.error(
      [
        'ERRO: há proxy de egresso configurado (HTTPS_PROXY) mas NODE_USE_ENV_PROXY não está em 1.',
        'O fetch do Node ignoraria o proxy e toda requisição morreria em timeout.',
        '',
        'Rode assim:',
        '  NODE_USE_ENV_PROXY=1 node spike/probe.mjs',
      ].join('\n'),
    )
    process.exitCode = 1
    return
  }

  for (const dir of [DIR_FIXTURES, DIR_DOCS, DIR_SAIDA]) {
    await mkdir(dir, { recursive: true })
  }

  const iniciadoEm = new Date()
  const cliente = criarCliente({
    apiKey,
    aoLogar: (r) => {
      if (opcoes.verboso || r.status === 0 || r.status >= 400) {
        console.log(
          `  [${r.status || 'ERR'}] ${r.rotulo} ${r.ms}ms ${r.bytes}B${r.erro ? ` — ${r.erro}` : ''}`,
        )
      }
    },
  })

  const fixturesGravadas = []

  /** Estado compartilhado entre sondagens: documentos e números colhidos. */
  const estado = {
    documentos: [],
    numeros: [],
    numerosDeSweep: [],
    numeroPrincipal: null,
    cabecalhosVistos: {},
  }

  const ctx = {
    cliente,
    opcoes,
    estado,
    /**
     * Grava a resposta CRUA como fixture. O corpo puro vai para
     * tests/fixtures/datajud/<nome>.json para que o --dry-run da Fase 3 possa
     * consumi-lo sem tradução; os metadados vão para o manifest.
     */
    async salvarFixture(nome, resposta) {
      const seguro = nome.replace(/[^a-z0-9_.-]/gi, '_')
      const arquivo = path.join(DIR_FIXTURES, `${seguro}.json`)
      const corpo = resposta?.json ?? resposta ?? null
      await writeFile(arquivo, `${JSON.stringify(corpo, null, 2)}\n`, 'utf8')
      fixturesGravadas.push({
        nome: seguro,
        arquivo: path.relative(RAIZ, arquivo),
        status: resposta?.status ?? null,
        url: resposta?.url ?? null,
        bytes: resposta?.bytes ?? null,
        cabecalhos: resposta?.cabecalhos ?? null,
      })
      if (resposta?.cabecalhos) {
        Object.assign(estado.cabecalhosVistos, resposta.cabecalhos)
      }
    },
  }

  /* --------------------- execução das sondagens --------------------- */

  // Ordem importa: P00 colhe os números que as demais consomem.
  const roteiro = [
    ['P00', probes.p00Bootstrap],
    ['P11', probes.p11SweepDeAliases], // cedo, para as análises verem vários tribunais
    ['P01', probes.p01ConsultaPorNumero],
    ['P02', probes.p02Unicidade],
    ['P03', probes.p03Movimentos],
    ['P04', probes.p04ChaveDeMovimento],
    ['P05', probes.p05Size],
    ['P06', probes.p06Paginacao],
    ['P07', probes.p07Terms],
    ['P08', probes.p08Erros],
    ['P09', probes.p09RateLimit],
    ['P10', probes.p10Latencia],
  ]

  const selecionadas = opcoes.sondagens
    ? roteiro.filter(([id]) => opcoes.sondagens.includes(id))
    : roteiro

  const achados = []
  const falhas = []

  console.log(`\nSpike DataJud — Fase 0`)
  console.log(`base: ${process.env.DATAJUD_BASE_URL ?? BASE_URL_PADRAO}`)
  console.log(`alias principal: ${opcoes.alias} | rate limit: 1 req / ${cliente.minIntervaloMs} ms\n`)

  if (opcoes.sondagens) {
    console.log(`sondagens selecionadas: ${selecionadas.map(([id]) => id).join(', ')}\n`)
  }

  for (const [id, sondagem] of selecionadas) {
    process.stdout.write(`→ ${id} ${sondagem.name} ... `)
    try {
      const achado = await sondagem(ctx)
      achados.push(achado)
      console.log('ok')
    } catch (erro) {
      // Regra inviolável 6: isole a falha, colete, siga em frente.
      console.log(`FALHOU: ${erro.message}`)
      falhas.push({ id, sondagem: sondagem.name, erro: String(erro?.stack ?? erro) })
      achados.push({
        id,
        pergunta: `(sondagem ${sondagem.name})`,
        resposta: `FALHOU: ${erro.message}`,
        evidencia: {},
      })
    }
  }

  /* --------------------------- documentos --------------------------- */

  // Schema inferido de todos os _source colhidos, de todos os tribunais.
  const fontes = estado.documentos.map((h) => h?._source).filter(Boolean)
  const acumulador = {}
  for (const fonte of fontes) schema.acumular(acumulador, fonte)

  const primeiroHit = estado.documentos[0]
  const envelope = primeiroHit
    ? JSON.stringify(
        {
          took: '<number>',
          timed_out: '<boolean>',
          _shards: '<object>',
          hits: {
            total: { value: '<number>', relation: '<string>' },
            max_score: '<number|null>',
            hits: [
              {
                _index: primeiroHit._index ?? '<string>',
                _type: primeiroHit._type ?? undefined,
                _id: '<string>',
                _score: '<number|null>',
                _source: '{ ...campos da tabela abaixo }',
              },
            ],
          },
        },
        null,
        2,
      )
    : 'n/d — nenhum documento colhido'

  await writeFile(
    path.join(DIR_DOCS, 'datajud-schema.md'),
    schema.gerarMarkdown(acumulador, fontes.length, {
      geradoEm: iniciadoEm.toISOString(),
      aliases: [...new Set(estado.documentos.map((h) => h?._index).filter(Boolean))],
      baseUrl: cliente.baseUrl,
      envelope,
    }),
    'utf8',
  )

  await writeFile(
    path.join(DIR_DOCS, 'fase-0-descobertas.md'),
    gerarRelatorio({ achados, falhas, opcoes, cliente, iniciadoEm, fontes, fixturesGravadas }),
    'utf8',
  )

  await writeFile(
    path.join(DIR_FIXTURES, 'manifest.json'),
    `${JSON.stringify(
      { geradoEm: iniciadoEm.toISOString(), baseUrl: cliente.baseUrl, fixtures: fixturesGravadas },
      null,
      2,
    )}\n`,
    'utf8',
  )

  // Trilha de auditoria (regra inviolável 5), fora do controle de versão.
  await writeFile(
    path.join(DIR_SAIDA, 'auditoria.json'),
    `${JSON.stringify(cliente.auditoria, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    path.join(DIR_SAIDA, 'achados.json'),
    `${JSON.stringify(achados, null, 2)}\n`,
    'utf8',
  )

  /* ----------------------------- resumo ----------------------------- */

  const requisicoes = cliente.auditoria.length
  const erros = cliente.auditoria.filter((r) => r.status === 0 || r.status >= 400).length

  console.log('\n' + '─'.repeat(72))
  console.log(`requisições: ${requisicoes} (${erros} com erro)`)
  console.log(`documentos analisados: ${fontes.length}`)
  console.log(`campos mapeados: ${Object.keys(acumulador).length}`)
  console.log(`fixtures: ${fixturesGravadas.length} em tests/fixtures/datajud/`)
  console.log(`sondagens que falharam: ${falhas.length}`)
  console.log('─'.repeat(72))
  console.log('\nescrito:')
  console.log('  docs/datajud-schema.md')
  console.log('  docs/fase-0-descobertas.md')
  console.log('  tests/fixtures/datajud/*.json')
  console.log('  spike/out/{auditoria,achados}.json\n')
  console.log('Leia docs/fase-0-descobertas.md e confronte com o §3 do CLAUDE.md antes da Fase 1.\n')
}

/* --------------------------- relatório --------------------------- */

function gerarRelatorio({ achados, falhas, opcoes, cliente, iniciadoEm, fontes, fixturesGravadas }) {
  const l = []
  l.push('# Fase 0 — descobertas do spike')
  l.push('')
  l.push('> Gerado por `node spike/probe.mjs`. Cada resposta abaixo foi produzida por uma')
  l.push('> sondagem contra a API real, e a evidência bruta está anexada. Onde aparecer')
  l.push('> `INDETERMINADO`, a sondagem não conseguiu concluir — trate como pergunta aberta,')
  l.push('> não como resposta negativa.')
  l.push('')
  l.push('## Contexto da execução')
  l.push('')
  l.push(`| item | valor |`)
  l.push(`| --- | --- |`)
  l.push(`| executado em | ${iniciadoEm.toISOString()} |`)
  l.push(`| base URL | \`${cliente.baseUrl}\` |`)
  l.push(`| alias principal | \`${opcoes.alias}\` |`)
  l.push(`| intervalo entre requisições | ${cliente.minIntervaloMs} ms |`)
  l.push(`| requisições feitas | ${cliente.auditoria.length} |`)
  l.push(`| documentos analisados | ${fontes.length} |`)
  l.push(`| fixtures gravadas | ${fixturesGravadas.length} |`)
  l.push(`| sondagens com falha | ${falhas.length} |`)
  l.push('')

  l.push('## Respostas')
  l.push('')
  for (const achado of achados) {
    l.push(`### ${achado.id} — ${achado.pergunta}`)
    l.push('')
    l.push(achado.resposta)
    l.push('')
    if (achado.evidencia && Object.keys(achado.evidencia).length) {
      l.push('<details><summary>evidência</summary>')
      l.push('')
      l.push('```json')
      l.push(JSON.stringify(achado.evidencia, null, 2))
      l.push('```')
      l.push('')
      l.push('</details>')
      l.push('')
    }
  }

  if (falhas.length) {
    l.push('## Sondagens que falharam')
    l.push('')
    l.push('```json')
    l.push(JSON.stringify(falhas, null, 2))
    l.push('```')
    l.push('')
  }

  l.push('## Fixtures gravadas')
  l.push('')
  l.push('| fixture | status | arquivo |')
  l.push('| --- | --- | --- |')
  for (const f of fixturesGravadas) {
    l.push(`| \`${f.nome}\` | ${f.status ?? '—'} | \`${f.arquivo}\` |`)
  }
  l.push('')

  l.push('## O que revisar no CLAUDE.md §3 antes da Fase 1')
  l.push('')
  l.push('Confronte cada premissa do §3 com as respostas acima e corrija o documento:')
  l.push('')
  l.push('- [ ] `numeroProcesso` com 20 dígitos sem pontuação (ver P01)')
  l.push('- [ ] nomes exatos dos campos de `_source` (ver `docs/datajud-schema.md`)')
  l.push('- [ ] chave real de unicidade do processo (ver P02)')
  l.push('- [ ] completude e ordenação de `movimentos` (ver P03)')
  l.push('- [ ] chave de deduplicação de movimentação para a Fase 4 (ver P04)')
  l.push('- [ ] estratégia de lote: 1 requisição por processo ou `terms` (ver P07)')
  l.push('- [ ] status HTTP que caracteriza rotação de chave (ver P08)')
  l.push('- [ ] lista de aliases e mapeamento J.TR (ver P11)')
  l.push('- [ ] latência por tribunal a exibir no produto (ver P10)')
  l.push('')
  return l.join('\n')
}

main().catch((erro) => {
  console.error('\nspike abortou:', erro)
  process.exitCode = 1
})
