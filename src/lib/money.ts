/**
 * Dinheiro no Enjoy AI Finance é SEMPRE um inteiro em centavos.
 *
 * Nenhum valor monetário circula como float em nenhuma camada — nem no
 * banco, nem no domínio, nem no estado da UI. Float só existe no momento
 * exato em que o usuário digita, e é convertido para centavos na borda.
 */

export type Cents = number

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const BRL_COMPACT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const PERCENT = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Formata centavos como moeda: 123456 → "R$ 1.234,56". */
export function formatMoney(cents: Cents): string {
  return BRL.format(cents / 100)
}

/** Versão compacta para cards e eixos de gráfico: 123456789 → "R$ 1,2 mi". */
export function formatMoneyCompact(cents: Cents): string {
  return BRL_COMPACT.format(cents / 100)
}

/** Formata com sinal explícito — usado em variações e lançamentos. */
export function formatMoneySigned(cents: Cents): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}${BRL.format(Math.abs(cents) / 100)}`
}

/** Converte uma razão (0.1234) em percentual formatado ("12,3%"). */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  return PERCENT.format(ratio)
}

/** Formata um número genérico (ex.: 2,4x de ROI, 18 leads). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return DECIMAL.format(value)
}

/** Formata um múltiplo: 2.43 → "2,4x". Usado em ROAS, LTV/CAC. */
export function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${DECIMAL.format(value)}x`
}

/**
 * Converte o que o usuário digitou para centavos.
 * Aceita "1.234,56", "1234.56", "1234,56", "R$ 1.234,56" e "1234".
 * Retorna null quando não há número reconhecível.
 */
export function parseMoneyToCents(input: string): Cents | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').trim()
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    // Formato pt-BR: ponto é milhar, vírgula é decimal.
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // Formato en-US: vírgula é milhar, ponto é decimal.
    normalized = cleaned.replace(/,/g, '')
  } else {
    normalized = cleaned
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Centavos → número decimal, apenas para preencher inputs. */
export function centsToDecimal(cents: Cents): number {
  return cents / 100
}

/**
 * Divide um valor em N parcelas sem perder nem criar centavos.
 * O resto é distribuído nas primeiras parcelas — o mesmo critério
 * que operadoras de cartão usam.
 *
 * splitCents(10000, 3) → [3334, 3333, 3333]
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return []
  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  const base = Math.floor(abs / parts)
  const remainder = abs - base * parts
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)))
}

/**
 * Aplica um percentual a um valor em centavos, arredondando meio-acima.
 * Usado em comissões, impostos e taxas.
 *
 * percentOf(10000, 8.5) → 850
 */
export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round(cents * (percent / 100))
}

/** Razão segura: devolve null em vez de Infinity/NaN quando o divisor é 0. */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return null
  const result = numerator / denominator
  return Number.isFinite(result) ? result : null
}

/** Soma uma lista de centavos. */
export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0)
}
