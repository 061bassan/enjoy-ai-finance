import { differenceInCalendarDays, fromIsoDate, isWithinRange, type DateRange } from '@/lib/date'
import { percentOf, safeRatio, sumCents, type Cents } from '@/lib/money'
import type { Client, Id, Sale, SaleCost } from '@/data/types'

/**
 * Indicadores de vendas.
 *
 * Nenhum destes números é guardado no banco — todos nascem das vendas e dos
 * custos no instante da leitura. É por isso que criar uma venda atualiza
 * receita, MRR, TCV, CAC, ROI e forecast de uma vez só: não há cópia para
 * ficar desatualizada.
 */

/** Vendas canceladas não contam em nenhum indicador de receita. */
export function activeSales(sales: readonly Sale[]): Sale[] {
  return sales.filter((sale) => sale.status !== 'cancelado')
}

export function salesInRange(sales: readonly Sale[], range: DateRange): Sale[] {
  return sales.filter((sale) => isWithinRange(sale.saleDate, range))
}

/** Custo total de uma venda: a soma de todas as rubricas. */
export function saleCostTotal(cost: SaleCost | undefined): Cents {
  if (!cost) return 0
  return (
    cost.adsCents +
    cost.commissionCents +
    cost.bankFeeCents +
    cost.platformFeeCents +
    cost.operationalCents +
    cost.teamHoursCents +
    cost.freelancersCents +
    cost.productionCents +
    cost.travelCents +
    cost.otherCents
  )
}

/**
 * Sobre o que a comissão incide.
 *
 * Recorrente (MRR): implantação + 1ª mensalidade — o que entra no fechamento,
 * não o contrato inteiro, que depende de o cliente ficar. Sem recorrência
 * (TCV, projeto): o valor total do projeto. Antes a mesma conta do MRR valia
 * para os dois, e um TCV saía com comissão zero.
 *
 * O formulário de venda e a tabela de vendas usam esta função — uma regra só.
 */
export function commissionBase(sale: Pick<Sale, 'mrrCents' | 'setupCents' | 'amountCents'>): Cents {
  return sale.mrrCents > 0 ? sale.setupCents + sale.mrrCents : sale.amountCents
}

/** Comissão do closer em centavos, a partir do percentual da venda. */
export function closerCommission(sale: Sale): Cents {
  return percentOf(commissionBase(sale), sale.closerCommissionPercent)
}

export function sdrCommission(sale: Sale): Cents {
  return percentOf(commissionBase(sale), sale.sdrCommissionPercent)
}

export interface SaleEconomics {
  sale: Sale
  costCents: Cents
  grossProfitCents: Cents
  netProfitCents: Cents
  margin: number | null
  /** Retorno sobre o investimento total da venda. */
  roi: number | null
  /** Retorno sobre o investimento em anúncios especificamente. */
  roas: number | null
  /** Custo de aquisição desta venda. */
  cacCents: Cents
  /** Meses até o custo de aquisição se pagar pelo MRR. `null` sem recorrência. */
  paybackMonths: number | null
  /** Dias entre a entrada do lead e o fechamento. */
  daysToClose: number | null
}

/**
 * Economia unitária de uma venda.
 *
 * `grossProfit` desconta só os custos diretos de entrega (produção,
 * freelancers, horas de equipe); `netProfit` desconta tudo, inclusive
 * aquisição e taxas. A diferença entre os dois é o que revela se o problema
 * de margem está na entrega ou no custo de aquisição.
 */
export function saleEconomics(sale: Sale, cost: SaleCost | undefined): SaleEconomics {
  const total = saleCostTotal(cost)

  const deliveryCost = cost
    ? cost.productionCents + cost.freelancersCents + cost.teamHoursCents + cost.operationalCents
    : 0
  const acquisitionCost = cost ? cost.adsCents + cost.commissionCents + cost.travelCents : 0

  const grossProfit = sale.amountCents - deliveryCost
  const netProfit = sale.amountCents - total

  const daysToClose = sale.leadCreatedAt
    ? differenceInCalendarDays(fromIsoDate(sale.saleDate), fromIsoDate(sale.leadCreatedAt))
    : null

  return {
    sale,
    costCents: total,
    grossProfitCents: grossProfit,
    netProfitCents: netProfit,
    margin: safeRatio(netProfit, sale.amountCents),
    roi: safeRatio(netProfit, total),
    roas: cost?.adsCents ? safeRatio(sale.amountCents, cost.adsCents) : null,
    cacCents: acquisitionCost,
    paybackMonths: sale.mrrCents > 0 ? safeRatio(acquisitionCost, sale.mrrCents) : null,
    daysToClose,
  }
}

export interface SalesSummary {
  count: number
  totalCents: Cents
  averageTicketCents: Cents
  largestCents: Cents
  smallestCents: Cents
  mrrCents: Cents
  tcvCents: Cents
  recurringRevenueCents: Cents
  setupRevenueCents: Cents
  averageDaysToClose: number | null
}

/** Resumo de um conjunto de vendas — alimenta os cards do módulo Vendas. */
export function summarizeSales(sales: readonly Sale[]): SalesSummary {
  const active = activeSales(sales)
  const amounts = active.map((sale) => sale.amountCents)

  const daysToCloseValues = active
    .map((sale) =>
      sale.leadCreatedAt
        ? differenceInCalendarDays(fromIsoDate(sale.saleDate), fromIsoDate(sale.leadCreatedAt))
        : null,
    )
    .filter((value): value is number => value != null)

  return {
    count: active.length,
    totalCents: sumCents(amounts),
    averageTicketCents: active.length ? Math.round(sumCents(amounts) / active.length) : 0,
    largestCents: amounts.length ? Math.max(...amounts) : 0,
    smallestCents: amounts.length ? Math.min(...amounts) : 0,
    mrrCents: sumCents(active.map((sale) => sale.mrrCents)),
    tcvCents: sumCents(amounts),
    recurringRevenueCents: sumCents(
      active.map((sale) => sale.mrrCents * (sale.contractMonths ?? 0)),
    ),
    setupRevenueCents: sumCents(active.map((sale) => sale.setupCents)),
    averageDaysToClose: daysToCloseValues.length
      ? Math.round(daysToCloseValues.reduce((a, b) => a + b, 0) / daysToCloseValues.length)
      : null,
  }
}

/**
 * MRR ativo: a soma da recorrência dos clientes que ainda são clientes.
 *
 * Diferente do "MRR vendido no período" — este é o que efetivamente entra
 * todo mês hoje. Vendas de clientes que deram churn saem da conta, que é
 * exatamente o que faz o indicador cair quando alguém cancela.
 */
export function activeMrr(sales: readonly Sale[], clients: readonly Client[]): Cents {
  const activeClientIds = new Set(
    clients.filter((client) => client.status === 'active').map((client) => client.id),
  )

  return sumCents(
    activeSales(sales)
      .filter((sale) => sale.mrrCents > 0 && sale.clientId && activeClientIds.has(sale.clientId))
      .map((sale) => sale.mrrCents),
  )
}

/** ARR = MRR ativo × 12. */
export function arr(mrrCents: Cents): Cents {
  return mrrCents * 12
}

/**
 * Churn de clientes no período: quantos cancelaram sobre quantos existiam
 * no início. Retorna razão, não percentual.
 */
export function churnRate(clients: readonly Client[], range: DateRange): number | null {
  const churnedInPeriod = clients.filter(
    (client) => client.churnDate && isWithinRange(client.churnDate, range),
  ).length

  const baseAtStart = clients.filter(
    (client) => client.startDate && client.startDate < range.from,
  ).length

  return safeRatio(churnedInPeriod, baseAtStart)
}

/**
 * LTV: receita média por cliente ao longo do tempo de vida.
 *
 * Usa a duração média de contrato observada, não uma constante chutada.
 * Sem contratos com MRR, cai para o ticket médio — que é o LTV correto de
 * um negócio sem recorrência.
 */
export function lifetimeValue(sales: readonly Sale[]): Cents {
  const active = activeSales(sales)
  if (!active.length) return 0

  const recurring = active.filter((sale) => sale.mrrCents > 0)
  if (!recurring.length) {
    return Math.round(sumCents(active.map((s) => s.amountCents)) / active.length)
  }

  const averageMrr = sumCents(recurring.map((s) => s.mrrCents)) / recurring.length
  const averageMonths =
    recurring.reduce((sum, sale) => sum + (sale.contractMonths ?? 12), 0) / recurring.length
  const averageSetup = sumCents(recurring.map((s) => s.setupCents)) / recurring.length

  return Math.round(averageMrr * averageMonths + averageSetup)
}

/** Razão LTV/CAC — abaixo de 3 costuma indicar aquisição cara demais. */
export function ltvToCac(ltvCents: Cents, cacCents: Cents): number | null {
  return safeRatio(ltvCents, cacCents)
}

export interface SellerPerformance {
  sellerId: Id
  count: number
  totalCents: Cents
  averageTicketCents: Cents
  mrrCents: Cents
}

/** Receita por closer (ou por SDR, conforme o campo escolhido). */
export function performanceBySeller(
  sales: readonly Sale[],
  field: 'closerId' | 'sdrId',
): SellerPerformance[] {
  const buckets = new Map<Id, { count: number; total: Cents; mrr: Cents }>()

  for (const sale of activeSales(sales)) {
    const sellerId = sale[field]
    if (!sellerId) continue
    const bucket = buckets.get(sellerId) ?? { count: 0, total: 0, mrr: 0 }
    bucket.count += 1
    bucket.total += sale.amountCents
    bucket.mrr += sale.mrrCents
    buckets.set(sellerId, bucket)
  }

  return [...buckets.entries()]
    .map(([sellerId, bucket]) => ({
      sellerId,
      count: bucket.count,
      totalCents: bucket.total,
      averageTicketCents: Math.round(bucket.total / bucket.count),
      mrrCents: bucket.mrr,
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

/** Receita agrupada por origem do lead — mostra qual canal paga a conta. */
export function revenueBySource(
  sales: readonly Sale[],
): { source: string; totalCents: Cents; count: number }[] {
  const buckets = new Map<string, { total: Cents; count: number }>()

  for (const sale of activeSales(sales)) {
    const key = sale.leadSource ?? 'outro'
    const bucket = buckets.get(key) ?? { total: 0, count: 0 }
    bucket.total += sale.amountCents
    bucket.count += 1
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .map(([source, bucket]) => ({ source, totalCents: bucket.total, count: bucket.count }))
    .sort((a, b) => b.totalCents - a.totalCents)
}
