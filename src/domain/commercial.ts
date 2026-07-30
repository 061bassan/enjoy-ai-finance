import { isWithinRange, type DateRange } from '@/lib/date'
import { safeRatio, sumCents, type Cents } from '@/lib/money'
import type { CommercialDay, Sale } from '@/data/types'
import { activeSales } from './sales'

/**
 * KPIs comerciais.
 *
 * Duas decisões que mudam a leitura dos números:
 *
 * 1. **Custo por etapa usa o investimento total do período**, não só a verba
 *    de anúncios. Um CPL que ignora o salário do SDR mente para menos — e é
 *    justamente essa diferença que decide se vale contratar mais um SDR.
 *
 * 2. **Taxas de conversão comparam etapas do mesmo período**, não coortes.
 *    É uma aproximação: o lead que virou reunião hoje pode ter entrado no mês
 *    passado. Para o ciclo de vendas da Enjoy (semanas), o desvio é pequeno e
 *    o ganho de simplicidade é grande. Se o ciclo passar de meses, isto aqui
 *    precisa virar análise por coorte.
 */

export interface CommercialTotals {
  leads: number
  calls: number
  meetings: number
  noShows: number
  proposalsSent: number
  proposalsApproved: number
  proposalsRejected: number
  followUps: number
  contractsSent: number
  contractsSigned: number

  adsInvestmentCents: Cents
  peopleInvestmentCents: Cents
  toolsInvestmentCents: Cents
  totalInvestmentCents: Cents
}

export function daysInPeriod(days: readonly CommercialDay[], range: DateRange): CommercialDay[] {
  return days.filter((day) => isWithinRange(day.date, range))
}

export function totalizeCommercial(days: readonly CommercialDay[]): CommercialTotals {
  const acc: CommercialTotals = {
    leads: 0,
    calls: 0,
    meetings: 0,
    noShows: 0,
    proposalsSent: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    followUps: 0,
    contractsSent: 0,
    contractsSigned: 0,
    adsInvestmentCents: 0,
    peopleInvestmentCents: 0,
    toolsInvestmentCents: 0,
    totalInvestmentCents: 0,
  }

  for (const day of days) {
    acc.leads += day.leads
    acc.calls += day.calls
    acc.meetings += day.meetings
    acc.noShows += day.noShows
    acc.proposalsSent += day.proposalsSent
    acc.proposalsApproved += day.proposalsApproved
    acc.proposalsRejected += day.proposalsRejected
    acc.followUps += day.followUps
    acc.contractsSent += day.contractsSent
    acc.contractsSigned += day.contractsSigned

    acc.adsInvestmentCents += day.adsInvestmentCents
    acc.peopleInvestmentCents += day.sdrInvestmentCents + day.closerInvestmentCents
    acc.toolsInvestmentCents +=
      day.toolsCents + day.crmCents + day.phoneCents + day.internetCents + day.softwareCents
  }

  acc.totalInvestmentCents =
    acc.adsInvestmentCents + acc.peopleInvestmentCents + acc.toolsInvestmentCents

  return acc
}

export interface CommercialKpis {
  /** Custo por lead. */
  cplCents: Cents | null
  /** Custo por call. */
  costPerCallCents: Cents | null
  costPerMeetingCents: Cents | null
  costPerProposalCents: Cents | null
  /** Custo de aquisição por cliente fechado. */
  cacCents: Cents | null
  /** Custo por aquisição, considerando contratos assinados. */
  cpaCents: Cents | null

  showRate: number | null
  noShowRate: number | null
  leadToCall: number | null
  callToMeeting: number | null
  meetingToProposal: number | null
  proposalToClose: number | null
  winRate: number | null
  lossRate: number | null

  /** Receita gerada sobre investimento comercial. */
  roi: number | null
  revenueCents: Cents
  averageTicketCents: Cents | null
}

/**
 * Calcula os KPIs comerciais.
 *
 * `sales` entra porque ROI e ticket médio dependem da receita efetivamente
 * fechada — o diário comercial sozinho conhece o esforço, não o resultado.
 */
export function commercialKpis(
  totals: CommercialTotals,
  sales: readonly Sale[],
): CommercialKpis {
  const closed = activeSales(sales)
  const revenue = sumCents(closed.map((sale) => sale.amountCents))
  const investment = totals.totalInvestmentCents

  const attended = totals.meetings - totals.noShows

  return {
    cplCents: totals.leads ? Math.round(investment / totals.leads) : null,
    costPerCallCents: totals.calls ? Math.round(investment / totals.calls) : null,
    costPerMeetingCents: totals.meetings ? Math.round(investment / totals.meetings) : null,
    costPerProposalCents: totals.proposalsSent
      ? Math.round(investment / totals.proposalsSent)
      : null,
    cacCents: closed.length ? Math.round(investment / closed.length) : null,
    cpaCents: totals.contractsSigned ? Math.round(investment / totals.contractsSigned) : null,

    showRate: safeRatio(attended, totals.meetings),
    noShowRate: safeRatio(totals.noShows, totals.meetings),
    leadToCall: safeRatio(totals.calls, totals.leads),
    callToMeeting: safeRatio(totals.meetings, totals.calls),
    meetingToProposal: safeRatio(totals.proposalsSent, attended),
    proposalToClose: safeRatio(totals.proposalsApproved, totals.proposalsSent),
    winRate: safeRatio(
      totals.proposalsApproved,
      totals.proposalsApproved + totals.proposalsRejected,
    ),
    lossRate: safeRatio(
      totals.proposalsRejected,
      totals.proposalsApproved + totals.proposalsRejected,
    ),

    roi: investment ? (revenue - investment) / investment : null,
    revenueCents: revenue,
    averageTicketCents: closed.length ? Math.round(revenue / closed.length) : null,
  }
}

export interface FunnelStage {
  key: string
  label: string
  count: number
  /** Conversão em relação à etapa imediatamente anterior. */
  conversionFromPrevious: number | null
  /** Conversão em relação ao topo do funil. */
  conversionFromTop: number | null
  costPerUnitCents: Cents | null
}

/** Funil comercial, do lead ao contrato assinado. */
export function buildFunnel(totals: CommercialTotals): FunnelStage[] {
  const investment = totals.totalInvestmentCents

  const stages: { key: string; label: string; count: number }[] = [
    { key: 'leads', label: 'Leads', count: totals.leads },
    { key: 'calls', label: 'Calls', count: totals.calls },
    { key: 'meetings', label: 'Reuniões', count: totals.meetings },
    { key: 'attended', label: 'Compareceram', count: totals.meetings - totals.noShows },
    { key: 'proposals', label: 'Propostas', count: totals.proposalsSent },
    { key: 'approved', label: 'Aprovadas', count: totals.proposalsApproved },
    { key: 'signed', label: 'Contratos assinados', count: totals.contractsSigned },
  ]

  const top = stages[0]?.count ?? 0

  return stages.map((stage, index) => {
    const previous = index > 0 ? stages[index - 1]?.count : undefined
    return {
      ...stage,
      conversionFromPrevious: previous != null ? safeRatio(stage.count, previous) : null,
      conversionFromTop: safeRatio(stage.count, top),
      costPerUnitCents: stage.count ? Math.round(investment / stage.count) : null,
    }
  })
}

/** Série diária para os gráficos de evolução do funil. */
export function commercialSeries(days: readonly CommercialDay[]) {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      leads: day.leads,
      calls: day.calls,
      meetings: day.meetings,
      proposals: day.proposalsSent,
      signed: day.contractsSigned,
      investmentCents:
        day.adsInvestmentCents +
        day.sdrInvestmentCents +
        day.closerInvestmentCents +
        day.toolsCents +
        day.crmCents +
        day.phoneCents +
        day.internetCents +
        day.softwareCents,
    }))
}
