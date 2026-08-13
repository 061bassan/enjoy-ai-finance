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

  /**
   * Win rate do funil: **vendas registradas ÷ leads do período**.
   *
   * É a pergunta que o funil existe para responder — "de tudo que chegou,
   * quanto virou cliente". A conta anterior (propostas aprovadas ÷ propostas
   * decididas) media outra coisa: o aproveitamento de quem já tinha recebido
   * proposta, ignorando todo mundo que nunca chegou lá. Um time que envia
   * três propostas por mês e fecha as três marcava 100% enquanto perdia 200
   * leads no caminho.
   */
  winRate: number | null
  /** De onde veio o denominador — a tela precisa dizer isso a quem lê. */
  winRateOrigin: 'crm' | 'diario' | 'indisponivel'
  /** Numerador e denominador expostos: sem eles, um % não se audita. */
  saleCount: number
  leadCount: number

  /**
   * A métrica antiga, com o nome que sempre foi o correto. Continua útil —
   * responde pela qualidade da proposta, não pela do funil inteiro.
   */
  proposalApprovalRate: number | null
  lossRate: number | null

  /** Receita gerada sobre investimento comercial. */
  roi: number | null
  revenueCents: Cents
  averageTicketCents: Cents | null

  /**
   * Investimento efetivamente usado nas divisões acima — o do diário MAIS o
   * que veio de fora (marketing). Exposto porque um CPL sem o divisor à vista
   * não se audita: quem lê precisa poder conferir de onde saiu o número.
   */
  investmentCents: Cents
}

export interface CommercialKpiOptions {
  /**
   * Leads do CRM no período.
   *
   * Quando existe, é o denominador do win rate: lead com nome e telefone é um
   * dado melhor que um total digitado no fim do dia. Sem ele, o diário
   * comercial assume — pior, mas ainda auditável.
   */
  leadCount?: number

  /**
   * Investimento comercial registrado FORA do diário — hoje, o que a tela de
   * Marketing lançou no período.
   *
   * Entra somando, e não substituindo, porque as duas telas medem coisas
   * diferentes: o diário conhece SDR, closer e ferramentas; o marketing
   * conhece a verba de mídia, a agência e os criativos. Um CAC que enxergasse
   * só metade do custo diria que adquirir cliente é mais barato do que é — e
   * essa é a conta que decide contratação e corte de verba.
   *
   * O risco do desenho é o mesmo custo lançado nos dois lugares; por isso a
   * tela do diário avisa que anúncio tem lugar próprio, e o cartão de
   * investimento mostra a composição em vez de um total mudo.
   */
  extraInvestmentCents?: Cents
}

/**
 * Calcula os KPIs comerciais.
 *
 * `sales` entra porque ROI, ticket médio e win rate dependem da receita
 * efetivamente fechada — o diário comercial sozinho conhece o esforço, não o
 * resultado. Espera-se que `sales` já venha recortado pelo período.
 */
export function commercialKpis(
  totals: CommercialTotals,
  sales: readonly Sale[],
  options: CommercialKpiOptions = {},
): CommercialKpis {
  const closed = activeSales(sales)
  const revenue = sumCents(closed.map((sale) => sale.amountCents))
  const investment = totals.totalInvestmentCents + (options.extraInvestmentCents ?? 0)

  const attended = totals.meetings - totals.noShows

  // O CRM tem precedência sobre o diário, e a origem viaja junto com o número.
  const crmLeads = options.leadCount ?? 0
  const leadCount = crmLeads > 0 ? crmLeads : totals.leads
  const winRateOrigin: CommercialKpis['winRateOrigin'] =
    crmLeads > 0 ? 'crm' : totals.leads > 0 ? 'diario' : 'indisponivel'

  return {
    // Mesmo denominador do win rate: o CRM quando existe, o diário quando não.
    // Usar `totals.leads` aqui deixava o CPL vazio para quem cadastra lead no
    // CRM e não preenche o diário — que é justamente quem tem o dado melhor.
    cplCents: leadCount ? Math.round(investment / leadCount) : null,
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

    winRate: safeRatio(closed.length, leadCount),
    winRateOrigin,
    saleCount: closed.length,
    leadCount,

    proposalApprovalRate: safeRatio(
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
    investmentCents: investment,
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
  /**
   * `true` quando a contagem veio de um fato registrado (venda fechada, lead
   * cadastrado) e não de um número digitado no diário. A tela marca a
   * diferença: um número que o sistema apurou sozinho merece confiança
   * diferente de um que alguém somou de cabeça no fim do dia.
   */
  measured?: boolean
}

export interface FunnelOptions {
  /**
   * Leads do CRM no período. Quando informado, substitui o topo do funil —
   * lead com nome e telefone é um dado melhor que um total digitado.
   */
  leadCount?: number
  /**
   * Vendas efetivamente registradas no período.
   *
   * Fecha o funil com o fato que interessa. Antes, a última etapa era
   * "contratos assinados" digitado no diário: o funil tinha o lugar da
   * conversão final, mas nada nele conhecia a tela de Vendas, então o número
   * dependia de alguém lançar a mesma informação duas vezes — e divergia
   * sempre que essa pessoa esquecia.
   */
  salesCount?: number
  /** Investimento de fora do diário (marketing). Ver `CommercialKpiOptions`. */
  extraInvestmentCents?: Cents
}

/** Funil comercial, do lead à venda fechada. */
export function buildFunnel(totals: CommercialTotals, options: FunnelOptions = {}): FunnelStage[] {
  const investment = totals.totalInvestmentCents + (options.extraInvestmentCents ?? 0)
  const hasCrmLeads = options.leadCount != null && options.leadCount > 0

  const stages: { key: string; label: string; count: number; measured?: boolean }[] = [
    {
      key: 'leads',
      label: 'Leads',
      count: hasCrmLeads ? (options.leadCount as number) : totals.leads,
      measured: hasCrmLeads,
    },
    { key: 'calls', label: 'Calls', count: totals.calls },
    { key: 'meetings', label: 'Reuniões', count: totals.meetings },
    { key: 'attended', label: 'Compareceram', count: totals.meetings - totals.noShows },
    { key: 'proposals', label: 'Propostas', count: totals.proposalsSent },
    { key: 'approved', label: 'Aprovadas', count: totals.proposalsApproved },
    { key: 'signed', label: 'Contratos assinados', count: totals.contractsSigned },
  ]

  if (options.salesCount != null) {
    stages.push({
      key: 'sales',
      label: 'Vendas registradas',
      count: options.salesCount,
      measured: true,
    })
  }

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
