/**
 * Aliases CANDIDATOS. Nada aqui é verdade até o sweep confirmar.
 *
 * O CLAUDE.md manda não confiar na memória do modelo para o mapeamento J.TR ->
 * alias, e a wiki do CNJ é a fonte oficial. Como a wiki pode estar inacessível (ou
 * desatualizada), o spike faz o caminho inverso e mais forte: pergunta a cada índice
 * candidato por um documento real e LÊ o J.TR do número que voltou. O mapeamento
 * passa a ser derivado de dado, não de memória nem de prosa.
 *
 * Para os segmentos cuja grafia o CLAUDE.md marca como incerta (eleitoral e militar
 * estadual) listamos VARIANTES: o sweep testa cada uma e a que responder 200 vence.
 */

export const SUPERIORES = ['stj', 'stm', 'tst', 'tse']

export const FEDERAL = ['trf1', 'trf2', 'trf3', 'trf4', 'trf5', 'trf6']

export const TRABALHO = Array.from({ length: 24 }, (_, i) => `trt${i + 1}`)

export const ESTADUAL = [
  'tjac', 'tjal', 'tjam', 'tjap', 'tjba', 'tjce', 'tjdft', 'tjes', 'tjgo',
  'tjma', 'tjmg', 'tjms', 'tjmt', 'tjpa', 'tjpb', 'tjpe', 'tjpi', 'tjpr',
  'tjrj', 'tjrn', 'tjro', 'tjrr', 'tjrs', 'tjsc', 'tjse', 'tjsp', 'tjto',
]

const UFS = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms',
  'mt', 'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc',
  'se', 'sp', 'to',
]

/** Grafias possíveis para os TREs. O sweep decide. */
export const ELEITORAL_CANDIDATOS = UFS.flatMap((uf) => [`tre-${uf}`, `tre${uf}`, `tre_${uf}`])

/** Justiça Militar estadual existe apenas em MG, RS e SP. */
export const MILITAR_ESTADUAL_CANDIDATOS = ['mg', 'rs', 'sp'].flatMap((uf) => [
  `tjm${uf}`,
  `tjm-${uf}`,
])

/** Aliases inventados de propósito, para observar o erro de índice inexistente. */
export const ALIASES_INVALIDOS = ['tjxx', 'api_publica_tjsc', 'tj-sc']

/** Conjunto tido como confiável o suficiente para o sweep padrão. */
export const SWEEP_PADRAO = [...SUPERIORES, ...FEDERAL, ...TRABALHO, ...ESTADUAL]

/** Conjunto completo, incluindo as grafias em teste. */
export const SWEEP_COMPLETO = [
  ...SWEEP_PADRAO,
  ...ELEITORAL_CANDIDATOS,
  ...MILITAR_ESTADUAL_CANDIDATOS,
]

export function segmentoDoAlias(alias) {
  if (SUPERIORES.includes(alias)) return 'superior'
  if (/^trf\d+$/.test(alias)) return 'federal'
  if (/^trt\d+$/.test(alias)) return 'trabalho'
  if (ESTADUAL.includes(alias)) return 'estadual'
  if (/^tre[-_]?[a-z]{2}$/.test(alias)) return 'eleitoral'
  if (/^tjm[-]?(mg|rs|sp)$/.test(alias)) return 'militar_estadual'
  return 'desconhecido'
}
