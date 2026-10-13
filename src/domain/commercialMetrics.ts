import { differenceInCalendarDays } from 'date-fns'
import { fromIsoDate, isWithinRange, type DateRange, type IsoDate } from '@/lib/date'
import { safeRatio, type Cents } from '@/lib/money'
import type { CommercialMeeting, Lead, MarketingEntry, Sale } from '@/data/types'
import {
  entriesInPeriod,
  resolveLeadCount,
  totalizeMarketing,
  type LeadCountOrigin,
} from './marketing'
import { activeSales, summarizeSales } from './sales'

/**
 * Métricas comerciais — a conta da planilha "Métricas Comercial", feita sobre
 * os dados do sistema.
 *
 * Três fontes, cada uma dona de um pedaço, nenhuma copiada para outra:
 * - **Marketing** dá os leads (o que a plataforma de anúncios reportou) e o
 *   investimento em anúncios;
 * - **Reuniões** dá as calls, os no-shows e o criativo que gerou cada uma;
 * - **Vendas** dá a venda e o faturamento.
 *
 * A reunião e a venda se encontram pelo NOME (ou por vínculo manual). É isso
 * que faz "10 reuniões, 1 venda com o mesmo nome" mudar o win rate sozinho:
 * nada é digitado duas vezes, então nada fica desatualizado.
 */

// ---------------------------------------------------------------------------
// Casamento reunião ↔ venda
// ---------------------------------------------------------------------------

/** "Raphaela Souza" → ["raphaela", "souza"]: sem acento, sem pontuação, minúsculo. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1)
}

/** Distância de edição — para "Raphela" × "Raphaela", erro de digitação de planilha. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]!
}

function similarToken(a: string, b: string): boolean {
  if (a === b) return true
  // Só tolera um erro em palavra comprida: "ana" × "ina" são pessoas diferentes.
  return Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1
}

/**
 * O nome da reunião bate com o cliente da venda?
 *
 * Todas as palavras do nome MAIS CURTO precisam aparecer no mais longo:
 * "Kyoto" bate com "Kyoto Residence", "Clínica Vale" com "Clinica Vale". Um
 * erro de letra é tolerado em palavra longa ("Raphela" × "Raphaela").
 */
export function namesMatch(a: string, b: string): boolean {
  const left = nameTokens(a)
  const right = nameTokens(b)
  if (!left.length || !right.length) return false
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  return shorter.every((token) => longer.some((other) => similarToken(token, other)))
}

/** Janela em que uma venda ainda é "fruto" da reunião: de 7 dias antes a 120 depois. */
const MATCH_WINDOW = { before: 7, after: 120 }

/**
 * Venda de cada reunião.
 *
 * Vínculo manual (`saleId`) vence sempre. Sem ele, procura a venda ativa com
 * nome compatível dentro da janela, a mais próxima da data da reunião. Cada
 * venda é atribuída a UMA reunião só (a mais recente antes dela): o lead que
 * fez duas calls e comprou uma vez é uma venda, não duas.
 */
export function matchMeetingsToSales(
  meetings: readonly CommercialMeeting[],
  sales: readonly Sale[],
): Map<string, Sale> {
  const active = activeSales(sales)
  const byId = new Map(active.map((sale) => [sale.id, sale]))
  const result = new Map<string, Sale>()
  const taken = new Set<string>()

  for (const meeting of meetings) {
    const linked = meeting.saleId ? byId.get(meeting.saleId) : undefined
    if (linked) {
      result.set(meeting.id, linked)
      taken.add(linked.id)
    }
  }

  // Reuniões mais recentes primeiro: a última call antes da venda leva o crédito.
  const pending = [...meetings]
    .filter((meeting) => !result.has(meeting.id) && !meeting.saleId)
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const meeting of pending) {
    const meetingDate = fromIsoDate(meeting.date)
    let best: { sale: Sale; distance: number } | null = null
    for (const sale of active) {
      if (taken.has(sale.id) || !namesMatch(meeting.name, sale.clientName)) continue
      const delta = differenceInCalendarDays(fromIsoDate(sale.saleDate), meetingDate)
      if (delta < -MATCH_WINDOW.before || delta > MATCH_WINDOW.after) continue
      const distance = Math.abs(delta)
      if (!best || distance < best.distance) best = { sale, distance }
    }
    if (best) {
      result.set(meeting.id, best.sale)
      taken.add(best.sale.id)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Métricas de um período
// ---------------------------------------------------------------------------

/** Call que de fato aconteceu: tudo menos agendada e no-show. */
export function meetingHappened(meeting: CommercialMeeting): boolean {
  return meeting.status !== 'agendada' && meeting.status !== 'no_show'
}

/**
 * A reunião veio do tráfego pago?
 *
 * É o recorte que decide em quais contas ela entra. Lead e verba de anúncio só
 * existem para o tráfego: dividir o investimento da Meta por uma reunião de
 * indicação, ou somar essa reunião ao "reunião ÷ lead", mistura um funil que
 * custou dinheiro com um que não custou — e o tráfego parece melhor do que é.
 *
 * Sem origem informada conta como tráfego: era o único funil que a planilha
 * acompanhava, e é o padrão do formulário.
 */
export function isPaidTraffic(meeting: Pick<CommercialMeeting, 'source'>): boolean {
  return meeting.source == null || meeting.source === 'trafego_pago'
}

export interface CommercialMetrics {
  leads: number
  leadsOrigin: LeadCountOrigin
  /** Investimento em anúncios (sem impostos) — a mesma base da planilha. */
  adsCents: Cents
  meetings: number
  meetingsHeld: number
  noShows: number
  meetingsScheduled: number
  /** TODAS as vendas cadastradas no período (módulo de Vendas) — contexto. */
  sales: number
  revenueCents: Cents
  /**
   * Reuniões do período que viraram venda: a venda DO FUNIL. É a base do win
   * rate, do CAC e do ROAS — como na planilha, que conta 1 venda em setembro
   * mesmo com 2 vendas cadastradas (uma veio de fora do tráfego).
   */
  meetingSales: number
  meetingRevenueCents: Cents
  /** Reuniões marcadas "fechada" sem venda encontrada — pendência de cadastro. */
  closedWithoutSale: number

  /**
   * O recorte do TRÁFEGO PAGO (ver `isPaidTraffic`). É a base de tudo que
   * divide por lead ou por verba de anúncio: agendamento, win rate venda ÷
   * lead, custo por reunião, CAC e ROAS. Indicação e orgânico ficam fora
   * dessas contas e aparecem em `otherMeetings` / na quebra por origem.
   */
  paidMeetings: number
  paidMeetingSales: number
  paidRevenueCents: Cents
  /** Reuniões de outras origens (indicação, orgânico…) — não entram nas taxas do tráfego. */
  otherMeetings: number
  otherMeetingSales: number

  /** Reuniões do tráfego ÷ leads — a "win rate reuniões" da planilha. */
  schedulingRate: number | null
  /** Vendas do tráfego ÷ leads — a "win rate (venda/lead)" da planilha. */
  leadWinRate: number | null
  /** Vendas vindas de reunião ÷ reuniões realizadas — TODAS as origens (mede o closer). */
  meetingWinRate: number | null
  noShowRate: number | null
  cplCents: Cents | null
  /** Custo por reunião (CPR da planilha). */
  costPerMeetingCents: Cents | null
  cacCents: Cents | null
  roas: number | null
  averageTicketCents: Cents | null
  /** Dias médios entre a reunião e a venda. */
  averageCycleDays: number | null
}

export function commercialMetrics(input: {
  range: DateRange
  meetings: readonly CommercialMeeting[]
  sales: readonly Sale[]
  marketingEntries: readonly MarketingEntry[]
  crmLeads: readonly Lead[]
  /** Casamento calculado sobre TODAS as reuniões — ver `matchMeetingsToSales`. */
  matches: ReadonlyMap<string, Sale>
}): CommercialMetrics {
  const { range, matches } = input
  const meetings = input.meetings.filter((meeting) => isWithinRange(meeting.date, range))
  const periodSales = input.sales.filter((sale) => isWithinRange(sale.saleDate, range))
  const summary = summarizeSales(periodSales)
  const marketing = totalizeMarketing(entriesInPeriod(input.marketingEntries, range))
  const crmLeadCount = input.crmLeads.filter((lead) => isWithinRange(lead.enteredAt, range)).length
  const { leadCount, origin } = resolveLeadCount(marketing.leads, crmLeadCount)

  const held = meetings.filter(meetingHappened)
  const noShows = meetings.filter((meeting) => meeting.status === 'no_show').length
  const scheduled = meetings.filter((meeting) => meeting.status === 'agendada').length
  const converted = meetings.filter((meeting) => matches.has(meeting.id))
  const closedWithoutSale = meetings.filter(
    (meeting) => meeting.status === 'fechada' && !matches.has(meeting.id),
  ).length

  const cycles = converted
    .map((meeting) =>
      differenceInCalendarDays(
        fromIsoDate(matches.get(meeting.id)!.saleDate),
        fromIsoDate(meeting.date),
      ),
    )
    .filter((days) => days >= 0)

  const revenueOf = (list: readonly CommercialMeeting[]) =>
    list.reduce((sum, meeting) => sum + matches.get(meeting.id)!.amountCents, 0)
  const meetingRevenue = revenueOf(converted)

  // Funil do tráfego: só o que tem lead e verba de anúncio por trás.
  const paid = meetings.filter(isPaidTraffic)
  const paidConverted = converted.filter(isPaidTraffic)
  const paidRevenue = revenueOf(paidConverted)

  const ads = marketing.adsCents
  const perUnit = (count: number) => (ads > 0 && count > 0 ? Math.round(ads / count) : null)

  return {
    leads: leadCount,
    leadsOrigin: origin,
    adsCents: ads,
    meetings: meetings.length,
    meetingsHeld: held.length,
    noShows,
    meetingsScheduled: scheduled,
    sales: summary.count,
    revenueCents: summary.totalCents,
    meetingSales: converted.length,
    meetingRevenueCents: meetingRevenue,
    closedWithoutSale,
    paidMeetings: paid.length,
    paidMeetingSales: paidConverted.length,
    paidRevenueCents: paidRevenue,
    otherMeetings: meetings.length - paid.length,
    otherMeetingSales: converted.length - paidConverted.length,
    // Mês sem reunião registrada não é "0% de agendamento" — é mês sem dado.
    // Tudo que divide por lead ou por verba usa SÓ o tráfego pago.
    schedulingRate: meetings.length ? safeRatio(paid.length, leadCount) : null,
    leadWinRate: meetings.length ? safeRatio(paidConverted.length, leadCount) : null,
    meetingWinRate: safeRatio(converted.length, held.length),
    noShowRate: safeRatio(noShows, held.length + noShows),
    cplCents: perUnit(leadCount),
    costPerMeetingCents: perUnit(paid.length),
    cacCents: perUnit(paidConverted.length),
    roas: ads > 0 && paidConverted.length ? paidRevenue / ads : null,
    averageTicketCents: converted.length ? Math.round(meetingRevenue / converted.length) : null,
    averageCycleDays: cycles.length
      ? Math.round(cycles.reduce((sum, days) => sum + days, 0) / cycles.length)
      : null,
  }
}

// ---------------------------------------------------------------------------
// Quebras: por criativo, por quem fez a call, por produto
// ---------------------------------------------------------------------------

export interface MeetingBreakdownRow {
  label: string
  meetings: number
  held: number
  sales: number
  revenueCents: Cents
  /** Vendas ÷ reuniões realizadas. */
  winRate: number | null
}

/**
 * Agrupa as reuniões por uma chave textual. A chave é normalizada para juntar
 * "Depoimento rafaela" e "depoimento Rafaela " — na planilha a mesma coisa
 * aparece escrita de três jeitos.
 */
export function meetingBreakdown(
  meetings: readonly CommercialMeeting[],
  matches: ReadonlyMap<string, Sale>,
  keyOf: (meeting: CommercialMeeting) => string | null | undefined,
): MeetingBreakdownRow[] {
  const groups = new Map<string, MeetingBreakdownRow>()
  for (const meeting of meetings) {
    const raw = (keyOf(meeting) ?? '').trim()
    const label = raw || 'Não informado'
    const key = nameTokens(label).join(' ') || 'nao informado'
    const row = groups.get(key) ?? {
      label,
      meetings: 0,
      held: 0,
      sales: 0,
      revenueCents: 0,
      winRate: null,
    }
    row.meetings += 1
    if (meetingHappened(meeting)) row.held += 1
    const sale = matches.get(meeting.id)
    if (sale) {
      row.sales += 1
      row.revenueCents += sale.amountCents
    }
    groups.set(key, row)
  }
  return [...groups.values()]
    .map((row) => ({ ...row, winRate: safeRatio(row.sales, row.held) }))
    .sort((a, b) => b.sales - a.sales || b.meetings - a.meetings)
}

/** Meses (YYYY-MM-01) em que há reunião, venda ou marketing — o eixo da tendência. */
export function activeMonths(sources: {
  meetings: readonly { date: IsoDate }[]
  sales: readonly { saleDate: IsoDate }[]
  marketingEntries: readonly { month: IsoDate }[]
}): IsoDate[] {
  const months = new Set<string>()
  for (const meeting of sources.meetings) months.add(`${meeting.date.slice(0, 7)}-01`)
  for (const sale of sources.sales) months.add(`${sale.saleDate.slice(0, 7)}-01`)
  for (const entry of sources.marketingEntries) months.add(`${entry.month.slice(0, 7)}-01`)
  return [...months].sort()
}

// ---------------------------------------------------------------------------
// Reuniões registradas → totais do funil (diário comercial)
// ---------------------------------------------------------------------------

/**
 * Sobrepõe aos totais do diário comercial o que as REUNIÕES registradas dizem.
 *
 * Metas, Funil de vendas, Performance, Visão executiva, Relatórios e Leads
 * contavam reuniões só pelo diário — que ninguém preenche desde que as calls
 * passaram a ser registradas uma a uma. Sem esta ponte, a meta "Reuniões: 20"
 * nunca andava e cada tela mostrava um número diferente.
 *
 * Regra: havendo reunião registrada no período, ela é a fonte (é o dado mais
 * granular e o que o time de fato mantém); sem nenhuma, vale o diário como
 * antes — quem só usa o diário não perde nada.
 */
export function withMeetingRegistry<
  T extends {
    calls: number
    meetings: number
    noShows: number
    proposalsSent: number
    proposalsApproved: number
    proposalsRejected: number
  },
>(totals: T, meetings: readonly CommercialMeeting[], range: DateRange): T {
  const inRange = meetings.filter((meeting) => isWithinRange(meeting.date, range))
  if (!inRange.length) return totals
  const count = (statuses: CommercialMeeting['status'][]) =>
    inRange.filter((meeting) => statuses.includes(meeting.status)).length
  return {
    ...totals,
    calls: inRange.length,
    meetings: inRange.filter(meetingHappened).length,
    noShows: count(['no_show']),
    proposalsSent: count(['proposta', 'fechada']),
    proposalsApproved: count(['fechada']),
    proposalsRejected: count(['perdida']),
  }
}
