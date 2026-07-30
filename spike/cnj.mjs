/**
 * Utilitários CNJ *do spike*, versão descartável.
 *
 * Não é o módulo da Fase 2 (lib/cnj.ts). Existe aqui por um motivo específico:
 * queremos validar o algoritmo do dígito verificador contra CENTENAS de números
 * reais colhidos da própria API antes de escrever o módulo definitivo. Se o DV
 * falhar em números que o CNJ considera válidos, o algoritmo (ou a premissa) está
 * errado — e é melhor descobrir agora do que na Fase 2.
 *
 * Formato (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO
 * Posições no número de 20 dígitos:
 *   [0..6]   sequencial   (7)
 *   [7..8]   DV           (2)
 *   [9..12]  ano          (4)
 *   [13]     segmento J   (1)
 *   [14..15] tribunal TR  (2)
 *   [16..19] origem OOOO  (4)
 */

export function normalizar(entrada) {
  return String(entrada ?? '').replace(/\D/g, '')
}

export function formatar(numero) {
  const d = normalizar(numero)
  if (d.length !== 20) return String(numero ?? '')
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`
}

export function decompor(numero) {
  const d = normalizar(numero)
  if (d.length !== 20) return null
  return {
    numero: d,
    formatado: formatar(d),
    sequencial: d.slice(0, 7),
    dv: d.slice(7, 9),
    ano: d.slice(9, 13),
    segmento: d.slice(13, 14),
    tribunal: d.slice(14, 16),
    origem: d.slice(16, 20),
    jtr: `${d.slice(13, 14)}.${d.slice(14, 16)}`,
  }
}

/**
 * Validação do DV por ISO 7064 MOD 97-10.
 *
 * Algoritmo do CNJ: monta o número na ordem sequencial + ano + J + TR + origem
 * (isto é, sem o DV), concatena "00" ao final e calcula 98 - (n mod 97).
 * O resto é feito por partes porque o inteiro passa de 2^53.
 */
export function validarDV(numero) {
  const p = decompor(numero)
  if (!p) return false
  const base = `${p.sequencial}${p.ano}${p.segmento}${p.tribunal}${p.origem}00`
  const dvEsperado = 98 - modulo97(base)
  return String(dvEsperado).padStart(2, '0') === p.dv
}

export function calcularDV(numeroSemDV20) {
  const p = decompor(numeroSemDV20)
  if (!p) return null
  const base = `${p.sequencial}${p.ano}${p.segmento}${p.tribunal}${p.origem}00`
  return String(98 - modulo97(base)).padStart(2, '0')
}

function modulo97(digitos) {
  let resto = 0
  for (const caractere of digitos) {
    resto = (resto * 10 + Number(caractere)) % 97
  }
  return resto
}
