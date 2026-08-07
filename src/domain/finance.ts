import { isWithinRange, monthKey, type DateRange, type IsoDate } from '@/lib/date'
import { safeRatio, sumCents, type Cents } from '@/lib/money'
import type { Account, Category, CostCenter, Transaction } from '@/data/types'

/**
 * Cálculos financeiros do caixa realizado.
 *
 * Tudo aqui é função pura sobre listas já carregadas. Nenhuma consulta,
 * nenhum efeito. É o que permite testar os números sem subir banco, e é o
 * motivo de todos os indicadores estarem sempre coerentes entre si: eles
 * vêm da mesma fonte, no mesmo instante.
 *
 * Transferências NUNCA entram em receita ou despesa. Dinheiro que sai da
 * conta corrente e entra na poupança não é gasto — contar como tal inflaria
 * despesa e destruiria a margem. Elas só afetam o saldo por conta.
 */

export function isRevenue(t: Transaction): boolean {
  return t.kind === 'income'
}

export function isExpense(t: Transaction): boolean {
  return t.kind === 'expense'
}

export function inRange(transactions: readonly Transaction[], range: DateRange): Transaction[] {
  return transactions.filter((t) => isWithinRange(t.date, range))
}

/** Receita bruta do período: soma das entradas. */
export function grossRevenue(transactions: readonly Transaction[]): Cents {
  return sumCents(transactions.filter(isRevenue).map((t) => t.amountCents))
}

/** Despesa total do período. */
export function totalExpenses(transactions: readonly Transaction[]): Cents {
  return sumCents(transactions.filter(isExpense).map((t) => t.amountCents))
}

/**
 * Receita líquida: bruta menos impostos e taxas.
 * Depende das categorias para saber o que é dedução — por isso recebe o mapa.
 */
export function netRevenue(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): Cents {
  const deductionCenters: CostCenter[] = ['impostos', 'financeiro']
  const deductionIds = new Set(
    categories.filter((c) => c.costCenter && deductionCenters.includes(c.costCenter)).map((c) => c.id),
  )

  const deductions = sumCents(
    transactions
      .filter((t) => isExpense(t) && t.categoryId && deductionIds.has(t.categoryId))
      .map((t) => t.amountCents),
  )

  return grossRevenue(transactions) - deductions
}

/** Lucro líquido: entradas menos saídas, ignorando transferências. */
export function netProfit(transactions: readonly Transaction[]): Cents {
  return grossRevenue(transactions) - totalExpenses(transactions)
}

/** Margem líquida como razão (0.32 = 32%). `null` quando não houve receita. */
export function netMargin(transactions: readonly Transaction[]): number | null {
  const revenue = grossRevenue(transactions)
  return safeRatio(netProfit(transactions), revenue)
}

/**
 * Saldo de uma conta em uma data — saldo inicial mais tudo que entrou e saiu
 * até ali. Transferências contam aqui (é o único lugar onde contam).
 */
export function accountBalance(
  account: Account,
  transactions: readonly Transaction[],
  until?: IsoDate,
): Cents {
  const relevant = transactions.filter(
    (t) => t.accountId === account.id && (!until || t.date <= until),
  )

  return relevant.reduce((balance, t) => {
    if (t.kind === 'income') return balance + t.amountCents
    if (t.kind === 'expense') return balance - t.amountCents
    // Transferência: cada conta vê só a sua perna, então o sinal vem do
    // marcador de direção — 'in' credita o destino, 'out' debita a origem.
    // Perna sem marcador (dado legado, criado antes do campo existir) cai no
    // comportamento antigo de debitar, para não alterar saldos já exibidos.
    if (t.transferDirection === 'in') return balance + t.amountCents
    return balance - t.amountCents
  }, account.openingBalanceCents)
}

/**
 * Caixa total disponível.
 *
 * Cartão de crédito fica de fora: o saldo dele é dívida, não caixa. Somar
 * faria o "cash em caixa" mentir para mais.
 */
export function totalCash(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  until?: IsoDate,
): Cents {
  return accounts
    .filter((a) => !a.archived && a.type !== 'credit_card')
    .reduce((total, account) => total + accountBalance(account, transactions, until), 0)
}

/** Uma linha por conta, com o saldo calculado. */
export interface AccountBalance {
  account: Account
  balanceCents: Cents
}

export function balancesByAccount(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  until?: IsoDate,
): AccountBalance[] {
  return accounts
    .filter((a) => !a.archived)
    .map((account) => ({ account, balanceCents: accountBalance(account, transactions, until) }))
}

// ---------------------------------------------------------------------------
// Agrupamentos
// ---------------------------------------------------------------------------

export interface GroupedAmount {
  key: string
  label: string
  totalCents: Cents
  count: number
  /** Fatia do total do grupo — já pronta para o gráfico de pizza. */
  share: number
}

function toGrouped(
  buckets: Map<string, { label: string; total: Cents; count: number }>,
): GroupedAmount[] {
  const grandTotal = [...buckets.values()].reduce((sum, b) => sum + b.total, 0)
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      totalCents: bucket.total,
      count: bucket.count,
      share: grandTotal ? bucket.total / grandTotal : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

/** Despesas agrupadas por categoria. */
export function expensesByCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): GroupedAmount[] {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const buckets = new Map<string, { label: string; total: Cents; count: number }>()

  for (const t of transactions) {
    if (!isExpense(t)) continue
    const key = t.categoryId ?? 'sem-categoria'
    const label = t.categoryId ? (names.get(t.categoryId) ?? 'Categoria removida') : 'Sem categoria'
    const bucket = buckets.get(key) ?? { label, total: 0, count: 0 }
    bucket.total += t.amountCents
    bucket.count += 1
    buckets.set(key, bucket)
  }

  return toGrouped(buckets)
}

/** Despesas agrupadas por centro de custo — o relatório pedido pelos sócios. */
export function expensesByCostCenter(
  transactions: readonly Transaction[],
  labels: Record<CostCenter, string>,
): GroupedAmount[] {
  const buckets = new Map<string, { label: string; total: Cents; count: number }>()

  for (const t of transactions) {
    if (!isExpense(t)) continue
    const key = t.costCenter ?? 'sem-centro'
    const label = t.costCenter ? labels[t.costCenter] : 'Sem centro de custo'
    const bucket = buckets.get(key) ?? { label, total: 0, count: 0 }
    bucket.total += t.amountCents
    bucket.count += 1
    buckets.set(key, bucket)
  }

  return toGrouped(buckets)
}

/** Receita agrupada por categoria. */
export function revenueByCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): GroupedAmount[] {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const buckets = new Map<string, { label: string; total: Cents; count: number }>()

  for (const t of transactions) {
    if (!isRevenue(t)) continue
    const key = t.categoryId ?? 'sem-categoria'
    const label = t.categoryId ? (names.get(t.categoryId) ?? 'Categoria removida') : 'Sem categoria'
    const bucket = buckets.get(key) ?? { label, total: 0, count: 0 }
    bucket.total += t.amountCents
    bucket.count += 1
    buckets.set(key, bucket)
  }

  return toGrouped(buckets)
}

// ---------------------------------------------------------------------------
// Séries temporais
// ---------------------------------------------------------------------------

export interface MonthlySeriesPoint {
  month: string
  revenueCents: Cents
  expenseCents: Cents
  profitCents: Cents
  /** Lucro somado desde o início da série. */
  cumulativeProfitCents: Cents
}

/**
 * Série mensal de receita, despesa e lucro.
 * `months` vem de fora para que meses sem movimento apareçam zerados — um
 * buraco no gráfico esconde justamente o mês que deu errado.
 */
export function monthlySeries(
  transactions: readonly Transaction[],
  months: readonly IsoDate[],
): MonthlySeriesPoint[] {
  const byMonth = new Map<string, { revenue: Cents; expense: Cents }>()

  for (const t of transactions) {
    if (t.kind === 'transfer') continue
    const key = monthKey(t.date)
    const bucket = byMonth.get(key) ?? { revenue: 0, expense: 0 }
    if (t.kind === 'income') bucket.revenue += t.amountCents
    else bucket.expense += t.amountCents
    byMonth.set(key, bucket)
  }

  let cumulative = 0
  return months.map((month) => {
    const bucket = byMonth.get(monthKey(month)) ?? { revenue: 0, expense: 0 }
    const profit = bucket.revenue - bucket.expense
    cumulative += profit
    return {
      month,
      revenueCents: bucket.revenue,
      expenseCents: bucket.expense,
      profitCents: profit,
      cumulativeProfitCents: cumulative,
    }
  })
}

export interface DailyBalancePoint {
  date: IsoDate
  inflowCents: Cents
  outflowCents: Cents
  netCents: Cents
  balanceCents: Cents
}

/** Saldo dia a dia, partindo de um saldo inicial. */
export function dailyBalanceSeries(
  transactions: readonly Transaction[],
  days: readonly IsoDate[],
  openingBalanceCents: Cents,
): DailyBalancePoint[] {
  const byDay = new Map<IsoDate, { inflow: Cents; outflow: Cents }>()

  for (const t of transactions) {
    if (t.kind === 'transfer') continue
    const bucket = byDay.get(t.date) ?? { inflow: 0, outflow: 0 }
    if (t.kind === 'income') bucket.inflow += t.amountCents
    else bucket.outflow += t.amountCents
    byDay.set(t.date, bucket)
  }

  let balance = openingBalanceCents
  return days.map((date) => {
    const bucket = byDay.get(date) ?? { inflow: 0, outflow: 0 }
    const net = bucket.inflow - bucket.outflow
    balance += net
    return {
      date,
      inflowCents: bucket.inflow,
      outflowCents: bucket.outflow,
      netCents: net,
      balanceCents: balance,
    }
  })
}

// ---------------------------------------------------------------------------
// Burn rate e runway
// ---------------------------------------------------------------------------

/**
 * Burn rate: quanto de caixa a operação queima por mês, em média.
 *
 * Só conta os meses em que o resultado foi negativo. Um mês lucrativo não
 * "compensa" a queima do mês anterior no cálculo de runway — a pergunta é
 * quanto tempo o caixa aguenta se a operação continuar no ritmo ruim.
 * Retorna 0 quando a operação é lucrativa em todos os meses.
 */
export function burnRate(series: readonly MonthlySeriesPoint[]): Cents {
  const burning = series.filter((point) => point.profitCents < 0)
  if (!burning.length) return 0
  return Math.round(
    burning.reduce((sum, point) => sum + Math.abs(point.profitCents), 0) / burning.length,
  )
}

/**
 * Runway em meses: por quantos meses o caixa atual sustenta a queima.
 * `null` quando não há queima (a operação se paga).
 */
export function runwayMonths(cashCents: Cents, burnCents: Cents): number | null {
  if (burnCents <= 0) return null
  return cashCents / burnCents
}

/** Variação percentual entre dois períodos. `null` quando a base é zero. */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}
