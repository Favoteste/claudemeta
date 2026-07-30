/**
 * Cliente HTTP mínimo para o spike da Fase 0.
 *
 * Descartável de propósito: zero dependências, JavaScript puro (.mjs), para que
 * `node spike/probe.mjs` rode em qualquer máquina sem passo de build. O cliente
 * definitivo, tipado, é da Fase 3 (lib/datajud/client.ts) e vai nascer do schema
 * que ESTE script descobrir.
 *
 * Já respeita as regras invioláveis 2 e 5 do CLAUDE.md:
 *  - no máximo 1 requisição por segundo (configurável), com backoff e jitter;
 *  - toda requisição vai para uma trilha de auditoria em memória, despejada no fim.
 */

import { setTimeout as dormir } from 'node:timers/promises'

export const BASE_URL_PADRAO = 'https://api-publica.datajud.cnj.jus.br'

/** Status que valem nova tentativa. 4xx (fora do 429) é erro do cliente: não insista. */
const STATUS_RETENTAVEIS = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509])

/**
 * Cabeçalhos que interessam para descobrir se existe rate limit declarado.
 * Guardamos TODOS os cabeçalhos de resposta de todo jeito; esta lista só orienta
 * o relatório final.
 */
export const CABECALHOS_DE_INTERESSE = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
  'x-rate-limit-limit',
  'x-envoy-ratelimited',
  'x-kong-limit',
  'x-request-id',
  'server',
]

export function criarCliente({
  apiKey,
  baseUrl = process.env.DATAJUD_BASE_URL ?? BASE_URL_PADRAO,
  minIntervaloMs = Number(process.env.DATAJUD_MIN_INTERVALO_MS ?? 1100),
  maxTentativas = 4,
  // O cluster público é LENTO: `took` observado entre 38 s e 43 s até para consulta
  // dirigida por número, e um 504 apareceu aos 61 s. 30 s (o padrão anterior) fazia
  // toda requisição legítima estourar por timeout do cliente.
  timeoutMs = Number(process.env.DATAJUD_TIMEOUT_MS ?? 180_000),
  aoLogar = () => {},
} = {}) {
  if (!apiKey) throw new Error('apiKey ausente: exporte DATAJUD_API_KEY antes de rodar o spike.')

  /** Instante (epoch ms) a partir do qual a próxima requisição pode sair. */
  let proximoSlot = 0
  const auditoria = []

  async function aguardarSlot(ignorarRateLimit) {
    if (ignorarRateLimit) return
    const agora = Date.now()
    const espera = Math.max(0, proximoSlot - agora)
    proximoSlot = Math.max(agora, proximoSlot) + minIntervaloMs
    if (espera > 0) await dormir(espera)
  }

  /**
   * Uma requisição de busca. Nunca lança por erro HTTP: devolve o resultado
   * observado, porque no spike o erro É o dado que queremos (401, 404, 429...).
   * Só lança se a rede falhar em todas as tentativas.
   *
   * @param {string} alias      alias do tribunal, ex. 'tjsc' (sem o prefixo api_publica_)
   * @param {object|string} corpo  corpo da query ES; string é enviada crua (para testar body malformado)
   */
  async function buscar(alias, corpo, opcoes = {}) {
    const {
      rotulo = alias,
      apiKeyUsada = apiKey,
      semAutenticacao = false,
      caminho = `/api_publica_${alias}/_search`,
      metodo = 'POST',
      ignorarRateLimit = false,
      querystring = '',
    } = opcoes

    const url = `${baseUrl}${caminho}${querystring}`
    const payload = typeof corpo === 'string' ? corpo : JSON.stringify(corpo)

    let ultimaFalhaDeRede = null

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      await aguardarSlot(ignorarRateLimit)

      const cabecalhos = { 'Content-Type': 'application/json' }
      if (!semAutenticacao) cabecalhos.Authorization = `APIKey ${apiKeyUsada}`

      const inicio = performance.now()
      try {
        const resposta = await fetch(url, {
          method: metodo,
          headers: cabecalhos,
          body: metodo === 'GET' ? undefined : payload,
          signal: AbortSignal.timeout(timeoutMs),
        })

        const texto = await resposta.text()
        const ms = Math.round(performance.now() - inicio)
        const bytes = Buffer.byteLength(texto, 'utf8')

        let json = null
        try {
          json = JSON.parse(texto)
        } catch {
          /* resposta não-JSON também é achado: fica só em `texto` */
        }

        const cabecalhosResposta = Object.fromEntries(resposta.headers.entries())

        const registro = {
          ts: new Date().toISOString(),
          rotulo,
          alias,
          url,
          status: resposta.status,
          ms,
          bytes,
          tentativa,
        }
        auditoria.push(registro)
        aoLogar(registro)

        const deveRetentar = STATUS_RETENTAVEIS.has(resposta.status) && tentativa < maxTentativas
        if (deveRetentar) {
          // 429 sem cabeçalho declarado: a API não informa a janela, então recuamos
          // bem mais que num 5xx. Ser lento aqui é barato; ser abusivo não é (regra 2).
          const base = resposta.status === 429 ? 15_000 : 1_000
          await dormir(calcularEspera(tentativa, cabecalhosResposta['retry-after'], base))
          continue
        }

        return {
          ok: resposta.ok,
          status: resposta.status,
          cabecalhos: cabecalhosResposta,
          json,
          texto,
          ms,
          bytes,
          tentativas: tentativa,
          url,
        }
      } catch (erro) {
        const ms = Math.round(performance.now() - inicio)
        ultimaFalhaDeRede = erro
        const registro = {
          ts: new Date().toISOString(),
          rotulo,
          alias,
          url,
          status: 0,
          erro: String(erro?.message ?? erro),
          ms,
          bytes: 0,
          tentativa,
        }
        auditoria.push(registro)
        aoLogar(registro)

        if (tentativa < maxTentativas) {
          await dormir(calcularEspera(tentativa))
          continue
        }
      }
    }

    throw new Error(
      `falha de rede em ${rotulo} após ${maxTentativas} tentativas: ${ultimaFalhaDeRede?.message ?? 'motivo desconhecido'}`,
    )
  }

  return { buscar, auditoria, baseUrl, minIntervaloMs }
}

/** Backoff exponencial com jitter total; respeita Retry-After quando presente. */
function calcularEspera(tentativa, retryAfter, base = 1_000) {
  if (retryAfter) {
    const segundos = Number(retryAfter)
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1000, 120_000)
  }
  const teto = Math.min(base * 2 ** (tentativa - 1), 120_000)
  return Math.round(teto / 2 + Math.random() * (teto / 2))
}
