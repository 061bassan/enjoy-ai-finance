import {
  addDays,
  addMonths,
  endOfMonth,
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '@/lib/date'
import type { Cents } from '@/lib/money'
import type { Frequency, RecurringRule } from '@/data/types'

/**
 * Motor de recorrência — funções puras, sem I/O.
 *
 * Duas regras não óbvias que valem a leitura:
 *
 * 1. `dayOfMonth: 31` em fevereiro cai no dia 28 (ou 29). Truncar para o
 *    último dia do mês é o comportamento de qualquer cobrança real, e é o
 *    que evita "pular" o mês.
 * 2. Frequências não mensais são convertidas para um equivalente mensal por
 *    proporção anual, não por aproximação. Semanal é 52/12 semanas por mês,
 *    não 4 — quatro subestima o custo anual em quase um mês inteiro.
 */

/** Quantos meses cada frequência representa. */
const MONTHS_PER_PERIOD: Record<Frequency, number> = {
  weekly: 7 / 30.436875,
  biweekly: 14 / 30.436875,
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
}

/**
 * Converte o valor da regra para o equivalente mensal.
 * É a base do card "Custo de operação mensal".
 *
 * monthlyEquivalent({amount: 120000, frequency: 'yearly', interval: 1}) → 10000
 */
export function monthlyEquivalent(
  rule: Pick<RecurringRule, 'amountCents' | 'frequency' | 'interval'>,
): Cents {
  const interval = Math.max(1, rule.interval || 1)
  const months = MONTHS_PER_PERIOD[rule.frequency] * interval
  return Math.round(rule.amountCents / months)
}

/** Soma o equivalente mensal de várias regras. */
export function totalMonthlyCost(rules: readonly RecurringRule[]): Cents {
  return rules.reduce((sum, rule) => sum + monthlyEquivalent(rule), 0)
}

/** Ajusta o dia do mês respeitando meses curtos. */
function withDayOfMonth(date: Date, dayOfMonth: number): Date {
  const lastDay = endOfMonth(date).getDate()
  const day = Math.min(Math.max(1, dayOfMonth), lastDay)
  const result = new Date(date)
  result.setDate(day)
  return result
}

function advance(date: Date, frequency: Frequency, interval: number, dayOfMonth?: number | null) {
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7 * interval)
    case 'biweekly':
      return addDays(date, 14 * interval)
    case 'monthly':
    case 'quarterly':
    case 'semiannual':
    case 'yearly': {
      const monthsToAdd =
        (frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : frequency === 'semiannual' ? 6 : 12) *
        interval
      const next = addMonths(date, monthsToAdd)
      return dayOfMonth ? withDayOfMonth(next, dayOfMonth) : next
    }
  }
}

/**
 * Datas em que a regra ocorre dentro do intervalo [from, to].
 *
 * O laço parte sempre de `startDate` — nunca de `from` — para que a âncora
 * do dia do mês seja preservada. Um teto de iterações protege contra regra
 * malformada (interval 0 já é normalizado, mas datas absurdas não).
 */
export function occurrencesBetween(
  rule: Pick<
    RecurringRule,
    'frequency' | 'interval' | 'startDate' | 'endDate' | 'dayOfMonth' | 'active'
  >,
  from: IsoDate,
  to: IsoDate,
  options: { includeInactive?: boolean } = {},
): IsoDate[] {
  if (!rule.active && !options.includeInactive) return []
  if (to < from) return []

  const interval = Math.max(1, rule.interval || 1)
  const limit = rule.endDate && rule.endDate < to ? rule.endDate : to

  const start = fromIsoDate(rule.startDate)
  let cursor =
    rule.dayOfMonth && rule.frequency !== 'weekly' && rule.frequency !== 'biweekly'
      ? withDayOfMonth(start, rule.dayOfMonth)
      : start

  // Se ajustar o dia jogou a primeira ocorrência para antes do início, avança um período.
  if (toIsoDate(cursor) < rule.startDate) {
    cursor = advance(cursor, rule.frequency, interval, rule.dayOfMonth)
  }

  const dates: IsoDate[] = []
  let guard = 0
  const MAX_ITERATIONS = 2000

  while (guard++ < MAX_ITERATIONS) {
    const iso = toIsoDate(cursor)
    if (iso > limit) break
    if (iso >= from) dates.push(iso)
    cursor = advance(cursor, rule.frequency, interval, rule.dayOfMonth)
  }

  return dates
}

/** Próxima ocorrência a partir de uma data (inclusive). */
export function nextOccurrence(
  rule: Pick<
    RecurringRule,
    'frequency' | 'interval' | 'startDate' | 'endDate' | 'dayOfMonth' | 'active'
  >,
  after: IsoDate,
): IsoDate | null {
  // Uma janela de dois anos cobre até a frequência anual com folga.
  const horizon = toIsoDate(addMonths(fromIsoDate(after), 24))
  const [first] = occurrencesBetween(rule, after, horizon)
  return first ?? null
}
