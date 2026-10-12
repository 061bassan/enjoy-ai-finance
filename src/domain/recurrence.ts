import {
  addDays,
  addMonths,
  endOfMonth,
  fromIsoDate,
  toIsoDate,
  type IsoDate,
} from '@/lib/date'
import type { Cents } from '@/lib/money'
import type { Bill, Frequency, RecurringRule } from '@/data/types'

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

/**
 * Soma o equivalente mensal de várias regras.
 *
 * Com `asOf`, deixa de fora o parcelamento cuja última parcela já venceu —
 * empréstimo quitado não é custo de operação, mesmo que ninguém tenha
 * desligado a regra.
 */
export function totalMonthlyCost(rules: readonly RecurringRule[], asOf?: IsoDate): Cents {
  return rules
    .filter((rule) => !asOf || !isInstallmentPlanFinished(rule, asOf))
    .reduce((sum, rule) => sum + monthlyEquivalent(rule), 0)
}

/** Parcelamento com a última parcela antes de `asOf`. Regra sem parcelas nunca termina aqui. */
export function isInstallmentPlanFinished(rule: RuleSchedule, asOf: IsoDate): boolean {
  const last = lastInstallmentDate(rule)
  return last != null && last < asOf
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
  rule: RuleSchedule,
  from: IsoDate,
  to: IsoDate,
  options: { includeInactive?: boolean } = {},
): IsoDate[] {
  return scheduledOccurrences(rule, from, to, options).map((occurrence) => occurrence.date)
}

/** O que o motor precisa saber da regra para calcular datas e parcelas. */
type RuleSchedule = Pick<
  RecurringRule,
  'frequency' | 'interval' | 'startDate' | 'endDate' | 'dayOfMonth' | 'active'
> &
  Partial<Pick<RecurringRule, 'installmentTotal' | 'installmentStart'>>

export interface ScheduledOccurrence {
  date: IsoDate
  /** Parcela N de `installmentTotal`. `null` quando a regra não é parcelada. */
  installmentNumber: number | null
  installmentTotal: number | null
}

/**
 * Parcela inicial e total já normalizados — ou `null` quando a regra não é
 * parcelada. Uma parcela inicial fora de [1, total] é tratada como 1 em vez
 * de gerar parcelas "0/10" ou "12/10".
 */
export function installmentPlan(
  rule: Partial<Pick<RecurringRule, 'installmentTotal' | 'installmentStart'>>,
): { start: number; total: number } | null {
  const total = rule.installmentTotal
  if (!total || total < 1) return null
  const start = rule.installmentStart ?? 1
  return { start: start >= 1 && start <= total ? Math.floor(start) : 1, total: Math.floor(total) }
}

/**
 * Datas da regra dentro de [from, to], cada uma com o número da parcela.
 *
 * A contagem da parcela parte de `startDate` (não de `from`), pelo mesmo
 * motivo da âncora do dia: a parcela de novembro é a mesma não importa de
 * onde se começou a olhar. Numa regra parcelada, a sequência para na última
 * parcela — é o que faz o empréstimo quitado sumir de "A pagar" sozinho.
 */
export function scheduledOccurrences(
  rule: RuleSchedule,
  from: IsoDate,
  to: IsoDate,
  options: { includeInactive?: boolean } = {},
): ScheduledOccurrence[] {
  if (!rule.active && !options.includeInactive) return []
  if (to < from) return []

  const plan = installmentPlan(rule)
  // Parcelas que ainda vencem a partir de `startDate`, contando a primeira.
  const remaining = plan ? plan.total - plan.start + 1 : Infinity

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

  const occurrences: ScheduledOccurrence[] = []
  let index = 0
  const MAX_ITERATIONS = 2000

  while (index < MAX_ITERATIONS && index < remaining) {
    const iso = toIsoDate(cursor)
    if (iso > limit) break
    if (iso >= from) {
      occurrences.push({
        date: iso,
        installmentNumber: plan ? plan.start + index : null,
        installmentTotal: plan ? plan.total : null,
      })
    }
    index++
    cursor = advance(cursor, rule.frequency, interval, rule.dayOfMonth)
  }

  return occurrences
}

/**
 * Data da última parcela de uma regra parcelada — `null` quando a regra não
 * é parcelada (não tem fim por parcelas). Serve para a tela mostrar "termina
 * em mai/2027" antes de salvar.
 */
export function lastInstallmentDate(rule: RuleSchedule): IsoDate | null {
  const plan = installmentPlan(rule)
  if (!plan) return null
  const remaining = plan.total - plan.start + 1
  // Teto generoso: mesmo semanal, 2000 iterações cobrem qualquer parcelamento real.
  const horizon = toIsoDate(addMonths(fromIsoDate(rule.startDate), 12 * 40))
  const all = scheduledOccurrences(rule, rule.startDate, horizon, { includeInactive: true })
  return all.length === remaining ? (all[all.length - 1]?.date ?? null) : null
}

/**
 * Correções nos títulos já gerados quando a regra passa a ser (ou deixa de
 * ser) parcelada, ou muda de número de parcelas.
 *
 * Só toca título `open` sem baixa — título pago ou com baixa parcial é fato
 * registrado, e o histórico dele não se reescreve. Título que ficou além da
 * última parcela é CANCELADO, nunca apagado: o gerador pula datas que já
 * existem, então apagar faria o título renascer na próxima geração (e, além
 * disso, a regra agora não geraria mais essa data — cancelado deixa o rastro).
 */
export function installmentCorrections(
  rule: RuleSchedule,
  bills: readonly Pick<
    Bill,
    'id' | 'dueDate' | 'status' | 'installmentNumber' | 'installmentTotal'
  >[],
  paidBillIds: ReadonlySet<string>,
): {
  id: string
  patch: Pick<Bill, 'installmentNumber' | 'installmentTotal'> | { status: 'canceled' }
}[] {
  const touchable = bills.filter((bill) => bill.status === 'open' && !paidBillIds.has(bill.id))
  if (!touchable.length) return []

  const latest = touchable.reduce((max, bill) => (bill.dueDate > max ? bill.dueDate : max), '')
  const expected = new Map(
    scheduledOccurrences(rule, rule.startDate, latest, { includeInactive: true }).map((o) => [
      o.date,
      o,
    ]),
  )

  const corrections: ReturnType<typeof installmentCorrections> = []
  for (const bill of touchable) {
    const occurrence = expected.get(bill.dueDate)
    if (!occurrence) {
      // Só cancela o que passou da última parcela. Datas que não batem por
      // outro motivo (mudou o dia de vencimento) ficam como estão — esse é o
      // comportamento que já existia ao editar a regra.
      const last = lastInstallmentDate(rule)
      if (last && bill.dueDate > last)
        corrections.push({ id: bill.id, patch: { status: 'canceled' } })
      continue
    }
    const number = occurrence.installmentNumber
    const total = occurrence.installmentTotal
    if ((bill.installmentNumber ?? null) !== number || (bill.installmentTotal ?? null) !== total) {
      corrections.push({
        id: bill.id,
        patch: { installmentNumber: number, installmentTotal: total },
      })
    }
  }
  return corrections
}

/**
 * Títulos prontos para a baixa automática.
 *
 * Só entram títulos: (1) gerados por uma regra ATIVA com `autoSettle` ligado
 * — desativar a regra também para a baixa sozinha, mesma fronteira que já
 * vale para a geração de títulos; (2) ainda `open` — uma baixa parcial já é
 * decisão de alguém, e a automação não pisa em cima; (3) vencidos (a data
 * chegou, nunca antes — a automação não adianta pagamento); (4) com conta
 * definida, porque `settleBill` exige de onde debitar.
 */
export function billsDueForAutoSettlement(
  bills: readonly Bill[],
  rules: readonly RecurringRule[],
  asOf: IsoDate,
): Bill[] {
  const autoSettleRuleIds = new Set(
    rules.filter((rule) => rule.active && rule.autoSettle).map((rule) => rule.id),
  )

  return bills.filter(
    (bill) =>
      bill.recurringRuleId != null &&
      autoSettleRuleIds.has(bill.recurringRuleId) &&
      bill.status === 'open' &&
      bill.dueDate <= asOf &&
      bill.accountId != null,
  )
}

/** Próxima ocorrência a partir de uma data (inclusive). */
export function nextOccurrence(rule: RuleSchedule, after: IsoDate): IsoDate | null {
  // Uma janela de dois anos cobre até a frequência anual com folga.
  const horizon = toIsoDate(addMonths(fromIsoDate(after), 24))
  const [first] = occurrencesBetween(rule, after, horizon)
  return first ?? null
}
