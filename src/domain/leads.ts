import { daysOverdue, isWithinRange, today, type DateRange, type IsoDate } from '@/lib/date'
import { safeRatio, sumCents, type Cents } from '@/lib/money'
import {
  OPEN_LEAD_STAGES,
  type Id,
  type Lead,
  type LeadSource,
  type LeadStage,
  type Sale,
} from '@/data/types'
import { activeSales } from './sales'

/**
 * Funil pessoa a pessoa.
 *
 * O diário comercial (`@/domain/commercial`) responde "quanto esforço fizemos
 * e quanto custou". Este arquivo responde "quem está em qual etapa e o que
 * virou dinheiro". São perguntas diferentes, e é por isso que os dois
 * coexistem em vez de um substituir o outro.
 *
 * A ligação entre eles é a taxa de conversão: `conversionRate` abaixo é a
 * única função que olha para os dois mundos ao mesmo tempo.
 */

// ---------------------------------------------------------------------------
// Recortes
// ---------------------------------------------------------------------------

/**
 * Leads que **entraram** no período.
 *
 * Filtra por `enteredAt`, não pela data em que fecharam. É a leitura certa
 * para conversão: perguntar "de tudo que chegou em março, quanto virou
 * venda" é uma pergunta sobre a safra de março.
 */
export function leadsInPeriod(leads: readonly Lead[], range: DateRange): Lead[] {
  return leads.filter((lead) => isWithinRange(lead.enteredAt, range))
}

export function isOpen(lead: Lead): boolean {
  return OPEN_LEAD_STAGES.includes(lead.stage)
}

export function openLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter(isOpen)
}

export function wonLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter((lead) => lead.stage === 'ganho')
}

export function lostLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter((lead) => lead.stage === 'perdido')
}

// ---------------------------------------------------------------------------
// A métrica central: conversão de lead em venda
// ---------------------------------------------------------------------------

export type ConversionOrigin = 'crm' | 'diario' | 'indisponivel'

export interface ConversionRate {
  /** Razão (0.12 = 12%). `null` quando não há leads no período. */
  ratio: number | null
  leadCount: number
  saleCount: number
  /** De onde veio a contagem de leads — a tela precisa dizer isso ao usuário. */
  origin: ConversionOrigin
}

/**
 * Vendas ÷ leads no período.
 *
 * Duas decisões que definem o número:
 *
 * 1. **O numerador são vendas de verdade** (`Sale`), não "contratos
 *    assinados" digitado no diário. Esse era exatamente o furo: o funil
 *    tinha o lugar da conversão, mas nada nele conhecia a tela de Vendas,
 *    então a conta dependia de alguém digitar o mesmo número duas vezes.
 *
 * 2. **O denominador prefere o CRM.** Se há leads cadastrados no período,
 *    eles são a contagem — é o dado com nome e sobrenome. Sem CRM no
 *    período, cai para o total digitado no diário, que é melhor que nada.
 *    `origin` diz qual dos dois foi usado, para a tela não mentir sobre a
 *    procedência.
 *
 * Vendas canceladas não contam: um contrato desfeito não converteu nada.
 */
export function conversionRate(input: {
  leads: readonly Lead[]
  sales: readonly Sale[]
  range: DateRange
  /** Total de leads digitado no diário comercial, se houver. */
  diaryLeadCount?: number
}): ConversionRate {
  const periodLeads = leadsInPeriod(input.leads, input.range)
  const periodSales = activeSales(input.sales).filter((sale) =>
    isWithinRange(sale.saleDate, input.range),
  )

  const saleCount = periodSales.length
  const diaryCount = input.diaryLeadCount ?? 0

  if (periodLeads.length > 0) {
    return {
      ratio: safeRatio(saleCount, periodLeads.length),
      leadCount: periodLeads.length,
      saleCount,
      origin: 'crm',
    }
  }

  if (diaryCount > 0) {
    return {
      ratio: safeRatio(saleCount, diaryCount),
      leadCount: diaryCount,
      saleCount,
      origin: 'diario',
    }
  }

  return { ratio: null, leadCount: 0, saleCount, origin: 'indisponivel' }
}

/**
 * Conversão apenas dentro do CRM: ganhos ÷ leads decididos.
 *
 * Diferente de `conversionRate`: ignora quem ainda está em jogo. Responde
 * "das oportunidades que já terminaram, quantas ganhamos" — é o win rate do
 * time, e não sofre da distorção de um mês com muito lead novo ainda aberto.
 */
export function winRateFromLeads(leads: readonly Lead[]): number | null {
  const won = wonLeads(leads).length
  const lost = lostLeads(leads).length
  return safeRatio(won, won + lost)
}

// ---------------------------------------------------------------------------
// Funil por etapa
// ---------------------------------------------------------------------------

export interface LeadStageBucket {
  stage: LeadStage
  count: number
  valueCents: Cents
  /** Participação sobre o total de leads do recorte. */
  share: number | null
}

/** Distribuição dos leads pelas etapas, na ordem do funil. */
export function leadFunnel(leads: readonly Lead[]): LeadStageBucket[] {
  const order: LeadStage[] = [...OPEN_LEAD_STAGES, 'ganho', 'perdido']
  const total = leads.length

  return order.map((stage) => {
    const inStage = leads.filter((lead) => lead.stage === stage)
    return {
      stage,
      count: inStage.length,
      valueCents: sumCents(inStage.map((lead) => lead.estimatedValueCents)),
      share: safeRatio(inStage.length, total),
    }
  })
}

export interface LeadTotals {
  total: number
  open: number
  won: number
  lost: number
  /** Valor estimado do que ainda está em jogo — o "pipeline". */
  pipelineCents: Cents
  /** Valor estimado do que foi ganho. */
  wonCents: Cents
  averageTicketCents: Cents | null
  /** Dias médios entre a entrada e o fechamento dos leads ganhos. */
  averageDaysToWin: number | null
}

export function totalizeLeads(leads: readonly Lead[]): LeadTotals {
  const open = openLeads(leads)
  const won = wonLeads(leads)
  const lost = lostLeads(leads)

  const daysToWin = won
    .map((lead) => (lead.closedAt ? daysBetween(lead.enteredAt, lead.closedAt) : null))
    .filter((value): value is number => value != null)

  const wonCents = sumCents(won.map((lead) => lead.estimatedValueCents))

  return {
    total: leads.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    pipelineCents: sumCents(open.map((lead) => lead.estimatedValueCents)),
    wonCents,
    averageTicketCents: won.length ? Math.round(wonCents / won.length) : null,
    averageDaysToWin: daysToWin.length
      ? Math.round(daysToWin.reduce((a, b) => a + b, 0) / daysToWin.length)
      : null,
  }
}

/** Diferença em dias entre duas datas ISO. Negativa nunca acontece no funil. */
function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}

// ---------------------------------------------------------------------------
// Acompanhamento — o que faz o CRM cobrar em vez de só listar
// ---------------------------------------------------------------------------

/** Depois de quantos dias sem toque um lead é considerado esquecido. */
export const STALE_AFTER_DAYS = 7

export interface LeadAttention {
  lead: Lead
  /** Dias desde o último contato (ou desde a entrada, se nunca houve). */
  daysSilent: number
  /** Dias de atraso da próxima ação combinada. 0 quando não há atraso. */
  actionOverdueDays: number
  reason: 'acao_atrasada' | 'sem_contato'
}

/**
 * Leads que precisam de atenção hoje, do mais urgente para o menos.
 *
 * Ação combinada e vencida pesa mais que silêncio: alguém prometeu ligar
 * terça e não ligou é um problema maior do que um lead novo de ontem.
 *
 * Só olha leads abertos — cobrar follow-up de quem já fechou ou já foi
 * perdido é ruído, e ruído faz a lista inteira ser ignorada.
 */
export function leadsNeedingAttention(
  leads: readonly Lead[],
  reference: IsoDate = today(),
  staleAfterDays: number = STALE_AFTER_DAYS,
): LeadAttention[] {
  const result: LeadAttention[] = []

  for (const lead of openLeads(leads)) {
    const daysSilent = daysOverdue(lead.lastContactAt ?? lead.enteredAt, reference)
    const actionOverdueDays = lead.nextActionAt ? daysOverdue(lead.nextActionAt, reference) : 0

    if (actionOverdueDays > 0) {
      result.push({ lead, daysSilent, actionOverdueDays, reason: 'acao_atrasada' })
      continue
    }
    if (daysSilent >= staleAfterDays) {
      result.push({ lead, daysSilent, actionOverdueDays: 0, reason: 'sem_contato' })
    }
  }

  return result.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'acao_atrasada' ? -1 : 1
    return b.actionOverdueDays - a.actionOverdueDays || b.daysSilent - a.daysSilent
  })
}

// ---------------------------------------------------------------------------
// Cortes por origem e por responsável
// ---------------------------------------------------------------------------

export interface LeadSourceStats {
  source: LeadSource | 'sem_origem'
  total: number
  won: number
  conversion: number | null
  pipelineCents: Cents
}

/**
 * Desempenho por canal de entrada.
 *
 * Ordena por conversão e não por volume de propósito: o canal que traz 200
 * leads e fecha 1 é pior que o que traz 10 e fecha 3, e a ordenação por
 * volume esconderia exatamente isso.
 */
export function leadsBySource(leads: readonly Lead[]): LeadSourceStats[] {
  const buckets = new Map<string, Lead[]>()

  for (const lead of leads) {
    const key = lead.source ?? 'sem_origem'
    const bucket = buckets.get(key) ?? []
    bucket.push(lead)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .map(([source, group]) => {
      const won = wonLeads(group).length
      return {
        source: source as LeadSource | 'sem_origem',
        total: group.length,
        won,
        conversion: safeRatio(won, group.length),
        pipelineCents: sumCents(openLeads(group).map((lead) => lead.estimatedValueCents)),
      }
    })
    .sort((a, b) => (b.conversion ?? -1) - (a.conversion ?? -1) || b.total - a.total)
}

export interface LeadOwnerStats {
  ownerId: Id | null
  total: number
  open: number
  won: number
  conversion: number | null
  pipelineCents: Cents
}

export function leadsByOwner(leads: readonly Lead[]): LeadOwnerStats[] {
  const buckets = new Map<string, Lead[]>()

  for (const lead of leads) {
    const key = lead.ownerId ?? ''
    const bucket = buckets.get(key) ?? []
    bucket.push(lead)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .map(([ownerId, group]) => {
      const won = wonLeads(group).length
      return {
        ownerId: ownerId || null,
        total: group.length,
        open: openLeads(group).length,
        won,
        conversion: safeRatio(won, group.length),
        pipelineCents: sumCents(openLeads(group).map((lead) => lead.estimatedValueCents)),
      }
    })
    .sort((a, b) => b.won - a.won || b.total - a.total)
}

/** Série diária de entradas e ganhos — alimenta o gráfico de evolução. */
export function leadSeries(leads: readonly Lead[]) {
  const byDay = new Map<IsoDate, { entered: number; won: number; lost: number }>()

  const bump = (date: IsoDate, field: 'entered' | 'won' | 'lost') => {
    const bucket = byDay.get(date) ?? { entered: 0, won: 0, lost: 0 }
    bucket[field] += 1
    byDay.set(date, bucket)
  }

  for (const lead of leads) {
    bump(lead.enteredAt, 'entered')
    if (lead.closedAt && lead.stage === 'ganho') bump(lead.closedAt, 'won')
    if (lead.closedAt && lead.stage === 'perdido') bump(lead.closedAt, 'lost')
  }

  return [...byDay.entries()]
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
