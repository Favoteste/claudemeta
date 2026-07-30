/**
 * Inferência de schema a partir das respostas reais.
 *
 * A Fase 0 exige documentar a estrutura "campo por campo, com exemplo de valor".
 * Escrever isso à mão convida a erro e a invenção; aqui a documentação é DERIVADA
 * dos documentos que a API devolveu. O que não aparecer em nenhum documento não
 * entra no doc — e essa ausência também é informação (ver coluna "presença").
 */

const MAX_EXEMPLO = 90

/**
 * Percorre um valor e acumula, por caminho, o tipo observado, quantos documentos
 * o exibiram e um exemplo. Arrays viram `campo[]` e descemos nos elementos, de
 * modo que `movimentos[].codigo` apareça como caminho próprio.
 */
export function acumular(acumulador, valor, caminho = '') {
  const tipo = tipoDe(valor)

  if (caminho !== '') {
    const entrada = (acumulador[caminho] ??= {
      caminho,
      tipos: new Set(),
      ocorrencias: 0,
      nulos: 0,
      exemplos: new Set(),
      cardinalidades: [],
    })
    entrada.tipos.add(tipo)
    entrada.ocorrencias += 1
    if (valor === null || valor === undefined) entrada.nulos += 1
    if (tipo === 'array') entrada.cardinalidades.push(valor.length)
    if (tipo !== 'object' && tipo !== 'array' && valor !== null && valor !== undefined) {
      if (entrada.exemplos.size < 3) entrada.exemplos.add(resumirValor(valor))
    }
  }

  if (tipo === 'object') {
    for (const [chave, filho] of Object.entries(valor)) {
      acumular(acumulador, filho, caminho === '' ? chave : `${caminho}.${chave}`)
    }
  } else if (tipo === 'array') {
    for (const item of valor) {
      acumular(acumulador, item, `${caminho}[]`)
    }
  }
}

function tipoDe(valor) {
  if (valor === null) return 'null'
  if (valor === undefined) return 'undefined'
  if (Array.isArray(valor)) return 'array'
  return typeof valor
}

function resumirValor(valor) {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor)
  if (texto.length <= MAX_EXEMPLO) return texto
  return `${texto.slice(0, MAX_EXEMPLO)}…`
}

/**
 * Monta o markdown de docs/datajud-schema.md.
 *
 * @param {object} acumulador saída de acumular() sobre N documentos `_source`
 * @param {number} totalDocumentos quantos `_source` foram analisados
 * @param {object} contexto metadados para o cabeçalho do doc
 */
export function gerarMarkdown(acumulador, totalDocumentos, contexto = {}) {
  const caminhos = Object.keys(acumulador).sort(compararCaminhos)

  const linhas = []
  linhas.push('# Schema real da API Pública do DataJud')
  linhas.push('')
  linhas.push(
    '> Documento **gerado** por `node spike/probe.mjs` a partir de respostas reais da API.',
  )
  linhas.push('> Não edite à mão: rode o spike de novo. Se um campo não está aqui, é porque não')
  linhas.push('> apareceu em nenhum dos documentos amostrados — ausência é informação.')
  linhas.push('')
  linhas.push(`- Gerado em: ${contexto.geradoEm ?? 'n/d'}`)
  linhas.push(`- Documentos \`_source\` analisados: **${totalDocumentos}**`)
  linhas.push(`- Aliases amostrados: ${(contexto.aliases ?? []).join(', ') || 'n/d'}`)
  linhas.push(`- Base URL: \`${contexto.baseUrl ?? 'n/d'}\``)
  linhas.push('')
  linhas.push('## Envelope da resposta')
  linhas.push('')
  linhas.push('```')
  linhas.push(contexto.envelope ?? 'n/d')
  linhas.push('```')
  linhas.push('')
  linhas.push('## Campos de `hits.hits[]._source`')
  linhas.push('')
  linhas.push('`presença` = em quantos % dos documentos analisados o caminho apareceu.')
  linhas.push('Campos com presença < 100% são **opcionais** e a tipagem da Fase 3 deve refleti-lo.')
  linhas.push('')
  linhas.push('| campo | tipo | presença | cardinalidade | exemplo |')
  linhas.push('| --- | --- | --- | --- | --- |')

  for (const caminho of caminhos) {
    const e = acumulador[caminho]
    const tipos = [...e.tipos].sort().join(' \\| ')
    const raizDeArray = !caminho.includes('[]')
    const presenca = raizDeArray
      ? `${Math.round((e.ocorrencias / Math.max(totalDocumentos, 1)) * 100)}%`
      : '—'
    const cardinalidade = e.cardinalidades.length
      ? `min ${Math.min(...e.cardinalidades)} / máx ${Math.max(...e.cardinalidades)} / méd ${(
          e.cardinalidades.reduce((a, b) => a + b, 0) / e.cardinalidades.length
        ).toFixed(1)}`
      : ''
    const exemplo = [...e.exemplos]
      .map((v) => `\`${String(v).replace(/\|/g, '\\|')}\``)
      .join('<br>')
    linhas.push(
      `| \`${caminho}\` | ${tipos} | ${presenca} | ${cardinalidade} | ${exemplo} |`,
    )
  }

  linhas.push('')
  return linhas.join('\n')
}

/** Ordena por profundidade e alfabeticamente, para o doc ficar legível. */
function compararCaminhos(a, b) {
  const pa = a.split('.').length
  const pb = b.split('.').length
  if (pa !== pb) return pa - pb
  return a.localeCompare(b, 'pt-BR')
}
