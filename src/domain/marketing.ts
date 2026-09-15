import {
  endOfMonth,
  fromIsoDate,
  isWithinRange,
  monthKey,
  startOfMonth,
  toIsoDate,
  type DateRange,
  type IsoDate,
} from '@/lib/date'
import { safeRatio, sumCents, type Cents } from '@/lib/money'
import type { MarketingChannel, MarketingEntry, Sale, Transaction } from '@/data/types'
import { activeSales } from './sales'

/**
 * Indicadores de marketing.
 *
 * Três decisões sustentam tudo que está aqui:
 *
 * 1. **O mês é indivisível.** Uma entrada de marketing entra no período quando
 *    o MÊS dela toca o período — não se rateia verba por dia. Quem gastou
 *    R$ 12.000 em agosto não gastou R$ 400 no dia 5: a campanha não distribui
 *    assim, e fingir que sim inventa precisão que o dado não tem.
 *
 * 2. **Leads da mídia e leads do CRM nunca se somam.** São a mesma pessoa
 *    contada de duas fontes. O CPL prefere o número da plataforma (é dela a
 *    entrega que se está medindo) e cai para o CRM quando ninguém informou —
 *    sempre dizendo de onde veio, como o win rate do funil já faz.
 *
 * 3. **ROAS usa só a verba de mídia; ROI usa tudo.** Agência e criativo não
 *    escalam com a campanha do jeito que a mídia escala. Misturar os dois num
 *    número só esconde qual das duas alavancas está travada.
 */

export interface MarketingTotals {
  adsCents: Cents
  agencyCents: Cents
  creativeCents: Cents
  toolsCents: Cents
  otherCents: Cents
  /** Soma de todas as rubricas — a base do CPL, do CAC e do ROI. */
  totalCents: Cents

  impressions: number
  clicks: number
  /** Leads segundo as plataformas. Ver decisão 2 acima. */
  leads: number

  entryCount: number
}

/** Investimento de uma entrada, somando todas as rubricas. */
export function entryTotal(entry: MarketingEntry): Cents {
  return (
    entry.adsCents + entry.agencyCents + entry.creativeCents + entry.toolsCents + entry.otherCents
  )
}

/**
 * Recorta as entradas cujo mês toca o período.
 *
 * Comparação por chave "YYYY-MM" justamente para que um período parcial
 * (05/08 a 20/08) traga agosto inteiro. Ver decisão 1.
 */
export function entriesInPeriod(
  entries: readonly MarketingEntry[],
  range: DateRange,
): MarketingEntry[] {
  const first = monthKey(range.from)
  const last = monthKey(range.to)
  return entries.filter((entry) => {
    const key = monthKey(entry.month)
    return key >= first && key <= last
  })
}

/**
 * Expande um período para os meses inteiros que ele toca.
 *
 * Serve para comparar marketing com qualquer coisa que seja diária (o caixa,
 * por exemplo) sobre a mesma janela. Sem isso, "investi R$ 12.000" apareceria
 * ao lado de "paguei R$ 3.000" só porque o período selecionado era de uma
 * semana — e a conciliação acusaria uma diferença que não existe.
 */
export function wholeMonthsRange(range: DateRange): DateRange {
  return {
    from: toIsoDate(startOfMonth(fromIsoDate(range.from))),
    to: toIsoDate(endOfMonth(fromIsoDate(range.to))),
  }
}

export function totalizeMarketing(entries: readonly MarketingEntry[]): MarketingTotals {
  const acc: MarketingTotals = {
    adsCents: 0,
    agencyCents: 0,
    creativeCents: 0,
    toolsCents: 0,
    otherCents: 0,
    totalCents: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    entryCount: entries.length,
  }

  for (const entry of entries) {
    acc.adsCents += entry.adsCents
    acc.agencyCents += entry.agencyCents
    acc.creativeCents += entry.creativeCents
    acc.toolsCents += entry.toolsCents
    acc.otherCents += entry.otherCents

    acc.impressions += entry.impressions
    acc.clicks += entry.clicks
    acc.leads += entry.leads
  }

  acc.totalCents =
    acc.adsCents + acc.agencyCents + acc.creativeCents + acc.toolsCents + acc.otherCents

  return acc
}

export interface MarketingKpiOptions {
  /**
   * Leads cadastrados no CRM no período. Usado só como alternativa quando
   * nenhuma plataforma informou lead — nunca somado. Ver decisão 2.
   */
  crmLeadCount?: number
}

export type LeadCountOrigin = 'plataforma' | 'crm' | 'indisponivel'

/**
 * De onde vem o denominador do CPL: a plataforma quando ela informou lead,
 * o CRM quando não. Extraída de `marketingKpis` para que QUALQUER tela que
 * precise do CPL de marketing — hoje Leads e Relatórios, além da própria
 * tela de Marketing — use a mesma conta, em vez de reimplementar a
 * preferência e arriscar esquecer o lead da plataforma. Ver decisão 2 no
 * topo do arquivo.
 */
export function resolveLeadCount(
  platformLeads: number,
  crmLeadCount: number,
): { leadCount: number; origin: LeadCountOrigin } {
  if (platformLeads > 0) return { leadCount: platformLeads, origin: 'plataforma' }
  if (crmLeadCount > 0) return { leadCount: crmLeadCount, origin: 'crm' }
  return { leadCount: 0, origin: 'indisponivel' }
}

export interface MarketingLeadCpl {
  cplCents: Cents | null
  cplOrigin: LeadCountOrigin
  leadCount: number
}

/** CPL de marketing e a origem do denominador — ver `resolveLeadCount`. */
export function marketingLeadCpl(
  totals: Pick<MarketingTotals, 'totalCents' | 'leads'>,
  crmLeadCount: number,
): MarketingLeadCpl {
  const { leadCount, origin } = resolveLeadCount(totals.leads, crmLeadCount)
  return {
    cplCents: leadCount ? Math.round(totals.totalCents / leadCount) : null,
    cplOrigin: origin,
    leadCount,
  }
}

export interface MarketingKpis {
  investmentCents: Cents
  /** Só a verba de plataforma — a base do ROAS. */
  mediaInvestmentCents: Cents

  /** Custo por lead: investimento TOTAL ÷ leads. */
  cplCents: Cents | null
  /** De onde veio o denominador do CPL — a tela precisa dizer isso. */
  cplOrigin: 'plataforma' | 'crm' | 'indisponivel'
  leadCount: number

  /** Custo por mil impressões. */
  cpmCents: Cents | null
  /** Custo por clique. */
  cpcCents: Cents | null
  ctr: number | null
  /** Cliques que viraram lead. Revela se o problema é anúncio ou página. */
  clickToLead: number | null

  /** Investimento de marketing ÷ vendas fechadas no período. */
  cacCents: Cents | null
  /** Receita ÷ verba de mídia. */
  roas: number | null
  /** (Receita − investimento total) ÷ investimento total. */
  roi: number | null
  /**
   * Receita fechada menos o investimento de marketing.
   *
   * NÃO é o lucro da empresa — não desconta entrega, equipe nem imposto. É o
   * que sobrou da receita depois de pagar a aquisição, que é a pergunta que
   * esta tela responde. O lucro do negócio continua na Visão dos sócios.
   */
  profitCents: Cents
  revenueCents: Cents
  salesCount: number
  /** Quanto da receita foi para marketing. */
  investmentShare: number | null
}

/**
 * KPIs de marketing.
 *
 * `sales` entra porque CAC, ROAS e ROI dependem da receita efetivamente
 * fechada — o registro de investimento sozinho conhece o gasto, não o
 * resultado. Espera-se `sales` já recortado pelo período.
 */
export function marketingKpis(
  totals: MarketingTotals,
  sales: readonly Sale[],
  options: MarketingKpiOptions = {},
): MarketingKpis {
  const closed = activeSales(sales)
  const revenue = sumCents(closed.map((sale) => sale.amountCents))
  const investment = totals.totalCents

  const cpl = marketingLeadCpl(totals, options.crmLeadCount ?? 0)

  return {
    investmentCents: investment,
    mediaInvestmentCents: totals.adsCents,

    cplCents: cpl.cplCents,
    cplOrigin: cpl.cplOrigin,
    leadCount: cpl.leadCount,

    cpmCents: totals.impressions
      ? Math.round((totals.adsCents / totals.impressions) * 1000)
      : null,
    cpcCents: totals.clicks ? Math.round(totals.adsCents / totals.clicks) : null,
    ctr: safeRatio(totals.clicks, totals.impressions),
    clickToLead: safeRatio(totals.leads, totals.clicks),

    cacCents: closed.length ? Math.round(investment / closed.length) : null,
    roas: safeRatio(revenue, totals.adsCents),
    roi: investment ? (revenue - investment) / investment : null,
    profitCents: revenue - investment,
    revenueCents: revenue,
    salesCount: closed.length,
    investmentShare: safeRatio(investment, revenue),
  }
}

export interface ChannelPerformance {
  channel: MarketingChannel
  investmentCents: Cents
  mediaInvestmentCents: Cents
  impressions: number
  clicks: number
  leads: number
  cplCents: Cents | null
  cpcCents: Cents | null
  ctr: number | null
  /** Fatia do investimento total do período. */
  share: number | null
}

/**
 * Desempenho por canal.
 *
 * Não há ROAS nem CAC por canal de propósito: para isso seria preciso saber de
 * qual plataforma veio cada venda, e a venda guarda a ORIGEM do lead
 * (`trafego_pago`, `indicacao`…), não a campanha. Rateio proporcional daria um
 * número apresentável e falso — pior que ausência, porque alguém decidiria
 * corte de verba com base nele. O que dá para responder por canal é custo:
 * CPL, CPC e CTR.
 */
export function performanceByChannel(entries: readonly MarketingEntry[]): ChannelPerformance[] {
  const buckets = new Map<MarketingChannel, ChannelPerformance>()
  const total = sumCents(entries.map(entryTotal))

  for (const entry of entries) {
    const current =
      buckets.get(entry.channel) ??
      ({
        channel: entry.channel,
        investmentCents: 0,
        mediaInvestmentCents: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        cplCents: null,
        cpcCents: null,
        ctr: null,
        share: null,
      } satisfies ChannelPerformance)

    current.investmentCents += entryTotal(entry)
    current.mediaInvestmentCents += entry.adsCents
    current.impressions += entry.impressions
    current.clicks += entry.clicks
    current.leads += entry.leads

    buckets.set(entry.channel, current)
  }

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      cplCents: row.leads ? Math.round(row.investmentCents / row.leads) : null,
      cpcCents: row.clicks ? Math.round(row.mediaInvestmentCents / row.clicks) : null,
      ctr: safeRatio(row.clicks, row.impressions),
      share: safeRatio(row.investmentCents, total),
    }))
    .sort((a, b) => b.investmentCents - a.investmentCents)
}

export interface MarketingMonthPoint {
  month: IsoDate
  investmentCents: Cents
  mediaInvestmentCents: Cents
  leads: number
  cplCents: Cents | null
}

/** Série mensal para o gráfico de evolução. */
export function marketingSeries(entries: readonly MarketingEntry[]): MarketingMonthPoint[] {
  const buckets = new Map<IsoDate, MarketingMonthPoint>()

  for (const entry of entries) {
    const current =
      buckets.get(entry.month) ??
      ({
        month: entry.month,
        investmentCents: 0,
        mediaInvestmentCents: 0,
        leads: 0,
        cplCents: null,
      } satisfies MarketingMonthPoint)

    current.investmentCents += entryTotal(entry)
    current.mediaInvestmentCents += entry.adsCents
    current.leads += entry.leads

    buckets.set(entry.month, current)
  }

  return [...buckets.values()]
    .map((point) => ({
      ...point,
      cplCents: point.leads ? Math.round(point.investmentCents / point.leads) : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export interface MarketingCashReconciliation {
  /** O que foi informado nesta tela. */
  declaredCents: Cents
  /** O que saiu do caixa com centro de custo Marketing. */
  cashCents: Cents
  /** Informado − caixa. Positivo = falta lançar a despesa. */
  differenceCents: Cents
  /** Janela realmente comparada (meses inteiros). */
  range: DateRange
}

/**
 * Compara o investimento informado aqui com a despesa já lançada no caixa.
 *
 * O registro de marketing NÃO cria transação — de propósito. Quem já lança a
 * fatura do Meta em Entradas e saídas teria o mesmo custo contado duas vezes no
 * lucro da empresa, e o lucro é a única coisa que este sistema não pode errar.
 * O preço dessa escolha é a possibilidade de as duas pontas se afastarem, e é
 * isso que esta função mede: a diferença é um lembrete, não um erro.
 */
export function reconcileMarketingWithCash(
  entries: readonly MarketingEntry[],
  transactions: readonly Transaction[],
  range: DateRange,
): MarketingCashReconciliation {
  const months = wholeMonthsRange(range)

  const declared = sumCents(entriesInPeriod(entries, range).map(entryTotal))
  const cash = sumCents(
    transactions
      .filter(
        (transaction) =>
          transaction.kind === 'expense' &&
          transaction.costCenter === 'marketing' &&
          isWithinRange(transaction.date, months),
      )
      .map((transaction) => transaction.amountCents),
  )

  return {
    declaredCents: declared,
    cashCents: cash,
    differenceCents: declared - cash,
    range: months,
  }
}
