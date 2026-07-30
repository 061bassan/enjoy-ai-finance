import { monthKey, monthsInRange, today, type DateRange, type IsoDate } from '@/lib/date'
import { sumCents, type Cents } from '@/lib/money'
import type { Bill, BillPayment, Transaction } from '@/data/types'
import { groupPaymentsByBill } from './bills'

/**
 * Fluxo de caixa: previsto contra realizado.
 *
 * As duas séries vêm de fontes diferentes de propósito:
 *
 *   previsto  = títulos (`bills`) pela data de VENCIMENTO
 *   realizado = transações (`transactions`) pela data do MOVIMENTO
 *
 * A diferença entre elas é exatamente o que o financeiro precisa ver: um mês
 * com previsto alto e realizado baixo não é queda de vendas, é inadimplência.
 * Misturar as duas numa métrica só apagaria essa distinção.
 */

export interface CashflowPoint {
  period: IsoDate
  forecastInflowCents: Cents
  forecastOutflowCents: Cents
  actualInflowCents: Cents
  actualOutflowCents: Cents
  forecastNetCents: Cents
  actualNetCents: Cents
  /** Saldo acumulado usando o realizado até hoje e o previsto daí em diante. */
  projectedBalanceCents: Cents
}

/**
 * Série mensal de fluxo.
 *
 * `openingBalanceCents` é o caixa no início do primeiro mês da série. A partir
 * de hoje, a projeção passa a usar o previsto — antes de hoje, o que valeu foi
 * o que de fato aconteceu.
 */
export function monthlyCashflow(
  transactions: readonly Transaction[],
  bills: readonly Bill[],
  months: readonly IsoDate[],
  openingBalanceCents: Cents,
  reference: IsoDate = today(),
): CashflowPoint[] {
  const actual = new Map<string, { inflow: Cents; outflow: Cents }>()
  for (const transaction of transactions) {
    if (transaction.kind === 'transfer') continue
    const key = monthKey(transaction.date)
    const bucket = actual.get(key) ?? { inflow: 0, outflow: 0 }
    if (transaction.kind === 'income') bucket.inflow += transaction.amountCents
    else bucket.outflow += transaction.amountCents
    actual.set(key, bucket)
  }

  const forecast = new Map<string, { inflow: Cents; outflow: Cents }>()
  for (const bill of bills) {
    if (bill.status === 'canceled') continue
    const key = monthKey(bill.dueDate)
    const bucket = forecast.get(key) ?? { inflow: 0, outflow: 0 }
    if (bill.direction === 'receivable') bucket.inflow += bill.amountCents
    else bucket.outflow += bill.amountCents
    forecast.set(key, bucket)
  }

  const currentMonth = monthKey(reference)
  let balance = openingBalanceCents

  return months.map((period) => {
    const key = monthKey(period)
    const actualBucket = actual.get(key) ?? { inflow: 0, outflow: 0 }
    const forecastBucket = forecast.get(key) ?? { inflow: 0, outflow: 0 }

    const actualNet = actualBucket.inflow - actualBucket.outflow
    const forecastNet = forecastBucket.inflow - forecastBucket.outflow

    // Meses passados e o corrente usam o realizado; o futuro usa o previsto.
    balance += key <= currentMonth ? actualNet : forecastNet

    return {
      period,
      forecastInflowCents: forecastBucket.inflow,
      forecastOutflowCents: forecastBucket.outflow,
      actualInflowCents: actualBucket.inflow,
      actualOutflowCents: actualBucket.outflow,
      forecastNetCents: forecastNet,
      actualNetCents: actualNet,
      projectedBalanceCents: balance,
    }
  })
}

/**
 * Capital de giro: o que se tem a receber em aberto menos o que se deve.
 * Negativo significa que os compromissos superam os direitos — mesmo com
 * caixa positivo hoje.
 */
export function workingCapital(
  bills: readonly Bill[],
  payments: readonly BillPayment[],
): Cents {
  const grouped = groupPaymentsByBill(payments)

  function outstanding(bill: Bill): Cents {
    const paid = sumCents((grouped.get(bill.id) ?? []).map((p) => p.amountCents))
    return Math.max(0, bill.amountCents - paid)
  }

  const open = bills.filter((bill) => bill.status !== 'paid' && bill.status !== 'canceled')
  const receivable = sumCents(open.filter((b) => b.direction === 'receivable').map(outstanding))
  const payable = sumCents(open.filter((b) => b.direction === 'payable').map(outstanding))

  return receivable - payable
}

/** Entradas e saídas realizadas de um período, para o resumo da tela. */
export function periodTotals(transactions: readonly Transaction[], range: DateRange) {
  const inPeriod = transactions.filter(
    (t) => t.kind !== 'transfer' && t.date >= range.from && t.date <= range.to,
  )
  const inflow = sumCents(inPeriod.filter((t) => t.kind === 'income').map((t) => t.amountCents))
  const outflow = sumCents(inPeriod.filter((t) => t.kind === 'expense').map((t) => t.amountCents))
  return { inflowCents: inflow, outflowCents: outflow, netCents: inflow - outflow }
}

/**
 * Janela de projeção: do início do período visível até N meses à frente.
 * A tela de fluxo precisa enxergar o futuro, então não pode se limitar ao
 * filtro global de período.
 */
export function projectionMonths(range: DateRange, monthsAhead = 6): IsoDate[] {
  const start = range.from
  const endYear = Number(range.to.slice(0, 4))
  const endMonth = Number(range.to.slice(5, 7)) + monthsAhead
  const year = endYear + Math.floor((endMonth - 1) / 12)
  const month = ((endMonth - 1) % 12) + 1
  return monthsInRange({ from: start, to: `${year}-${String(month).padStart(2, '0')}-01` })
}
