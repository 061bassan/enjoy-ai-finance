import { daysOverdue, today, type IsoDate } from '@/lib/date'
import { sumCents, type Cents } from '@/lib/money'
import type { Bill, BillPayment, BillStatus } from '@/data/types'

/**
 * Regras de títulos a pagar/receber.
 *
 * O ponto central: "atrasado" NÃO é um status guardado no banco. É uma
 * função de `dueDate` e da data de hoje. Guardar exigiria um job varrendo a
 * base à meia-noite, e qualquer falha desse job deixaria o dashboard
 * mentindo. Aqui o atraso é sempre verdade no instante da leitura.
 */

/** Status apresentado ao usuário, incluindo o atraso derivado. */
export type DisplayBillStatus = BillStatus | 'overdue'

export interface BillView {
  bill: Bill
  paidCents: Cents
  outstandingCents: Cents
  status: DisplayBillStatus
  daysLate: number
}

/** Quanto já foi baixado de um título. */
export function paidAmount(payments: readonly BillPayment[]): Cents {
  return sumCents(payments.map((p) => p.amountCents))
}

/** Quanto ainda falta. Nunca negativo — pagamento a maior não vira crédito aqui. */
export function outstandingAmount(bill: Bill, payments: readonly BillPayment[]): Cents {
  return Math.max(0, bill.amountCents - paidAmount(payments))
}

/** Status derivado do título, considerando baixas e vencimento. */
export function resolveStatus(
  bill: Bill,
  payments: readonly BillPayment[],
  reference: IsoDate = today(),
): DisplayBillStatus {
  if (bill.status === 'canceled') return 'canceled'

  const outstanding = outstandingAmount(bill, payments)
  if (outstanding === 0) return 'paid'
  if (bill.dueDate < reference) return 'overdue'
  return payments.length > 0 ? 'partial' : 'open'
}

/** Monta a visão completa de um título — o que as telas de AR/AP consomem. */
export function toBillView(
  bill: Bill,
  payments: readonly BillPayment[],
  reference: IsoDate = today(),
): BillView {
  const paid = paidAmount(payments)
  const outstanding = Math.max(0, bill.amountCents - paid)
  const status = resolveStatus(bill, payments, reference)
  return {
    bill,
    paidCents: paid,
    outstandingCents: outstanding,
    status,
    daysLate: status === 'overdue' ? daysOverdue(bill.dueDate, reference) : 0,
  }
}

/**
 * Status persistido correspondente ao estado de pagamento.
 * Diferente de `resolveStatus`: aqui não existe "overdue", porque isso
 * jamais é gravado.
 */
export function persistedStatus(bill: Bill, paidCents: Cents): BillStatus {
  if (bill.status === 'canceled') return 'canceled'
  if (paidCents >= bill.amountCents) return 'paid'
  return paidCents > 0 ? 'partial' : 'open'
}

/** Agrupa as baixas por título — evita N consultas ao montar a lista. */
export function groupPaymentsByBill(
  payments: readonly BillPayment[],
): Map<string, BillPayment[]> {
  const map = new Map<string, BillPayment[]>()
  for (const payment of payments) {
    const list = map.get(payment.billId)
    if (list) list.push(payment)
    else map.set(payment.billId, [payment])
  }
  return map
}

/** Constrói as visões de uma lista de títulos de uma vez só. */
export function toBillViews(
  bills: readonly Bill[],
  payments: readonly BillPayment[],
  reference: IsoDate = today(),
): BillView[] {
  const grouped = groupPaymentsByBill(payments)
  return bills.map((bill) => toBillView(bill, grouped.get(bill.id) ?? [], reference))
}

/** Total em aberto de um conjunto de títulos. */
export function totalOutstanding(views: readonly BillView[]): Cents {
  return sumCents(views.map((v) => v.outstandingCents))
}

/** Total vencido e ainda não quitado. */
export function totalOverdue(views: readonly BillView[]): Cents {
  return sumCents(views.filter((v) => v.status === 'overdue').map((v) => v.outstandingCents))
}

/**
 * Aging — a distribuição do atraso em faixas.
 * É o relatório que responde "quanto do meu a receber está podre".
 */
export interface AgingBucket {
  label: string
  minDays: number
  maxDays: number | null
  totalCents: Cents
  count: number
}

export function agingBuckets(views: readonly BillView[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: 'A vencer', minDays: -Infinity, maxDays: 0, totalCents: 0, count: 0 },
    { label: '1–15 dias', minDays: 1, maxDays: 15, totalCents: 0, count: 0 },
    { label: '16–30 dias', minDays: 16, maxDays: 30, totalCents: 0, count: 0 },
    { label: '31–60 dias', minDays: 31, maxDays: 60, totalCents: 0, count: 0 },
    { label: '60+ dias', minDays: 61, maxDays: null, totalCents: 0, count: 0 },
  ]

  for (const view of views) {
    if (view.status === 'paid' || view.status === 'canceled') continue
    const bucket = buckets.find(
      (b) => view.daysLate >= b.minDays && (b.maxDays === null || view.daysLate <= b.maxDays),
    )
    if (bucket) {
      bucket.totalCents += view.outstandingCents
      bucket.count += 1
    }
  }

  return buckets
}
