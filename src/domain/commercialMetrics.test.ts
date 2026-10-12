import { describe, expect, it } from 'vitest'
import type { CommercialMeeting, MarketingEntry, Sale } from '@/data/types'
import {
  commercialMetrics,
  matchMeetingsToSales,
  meetingBreakdown,
  namesMatch,
} from './commercialMetrics'

let seq = 0
function meeting(date: string, name: string, overrides: Partial<CommercialMeeting> = {}) {
  return {
    id: `m${++seq}`,
    workspaceId: 'w',
    date,
    name,
    status: 'proposta',
    createdBy: 'u',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as CommercialMeeting
}

function sale(
  saleDate: string,
  clientName: string,
  amountCents: number,
  overrides: Partial<Sale> = {},
) {
  return {
    id: `s${++seq}`,
    workspaceId: 'w',
    saleDate,
    clientName,
    amountCents,
    mrrCents: 0,
    setupCents: 0,
    status: 'pendente',
    ...overrides,
  } as Sale
}

const julyAds = {
  id: 'mk',
  workspaceId: 'w',
  month: '2026-07-01',
  channel: 'meta_ads',
  adsCents: 184_200,
  agencyCents: 0,
  creativeCents: 0,
  toolsCents: 0,
  otherCents: 25_421,
  impressions: 0,
  clicks: 0,
  leads: 45,
} as MarketingEntry

describe('namesMatch', () => {
  it('nome curto da planilha bate com o nome completo da venda', () => {
    expect(namesMatch('Kyoto', 'Kyoto Residence')).toBe(true)
    expect(namesMatch('Clinica Vale', 'Clínica Vale')).toBe(true)
  })

  it('tolera um erro de digitação em nome comprido', () => {
    expect(namesMatch('Raphela', 'Raphaela')).toBe(true)
  })

  it('não confunde nomes curtos diferentes', () => {
    expect(namesMatch('Ana', 'Ina')).toBe(false)
    expect(namesMatch('Thiago', 'Hugo')).toBe(false)
  })
})

describe('matchMeetingsToSales', () => {
  it('casa pelo nome dentro da janela e ignora venda fora dela', () => {
    const m1 = meeting('2026-06-06', 'Kyoto')
    const m2 = meeting('2026-01-10', 'Raphaela')
    const sales = [
      sale('2026-06-10', 'Kyoto Residence', 900_000),
      sale('2026-07-14', 'Raphaela', 170_000),
    ]
    const matches = matchMeetingsToSales([m1, m2], sales)
    expect(matches.get(m1.id)?.clientName).toBe('Kyoto Residence')
    // Reunião de janeiro, venda de julho: passa dos 120 dias, não é fruto dela.
    expect(matches.has(m2.id)).toBe(false)
  })

  it('uma venda conta para uma reunião só — a última antes dela', () => {
    const first = meeting('2026-09-01', 'Thiago')
    const second = meeting('2026-09-20', 'Thiago')
    const matches = matchMeetingsToSales(
      [first, second],
      [sale('2026-09-25', 'Thiago Lima', 500_000)],
    )
    expect(matches.has(second.id)).toBe(true)
    expect(matches.has(first.id)).toBe(false)
  })

  it('vínculo manual vence o nome', () => {
    const linked = sale('2026-09-24', 'Linconl (Linha de óculos)', 280_000)
    const m = meeting('2026-09-21', 'Leticia', { saleId: linked.id })
    expect(matchMeetingsToSales([m], [linked]).get(m.id)).toBe(linked)
  })

  it('venda cancelada não conta', () => {
    const m = meeting('2026-09-21', 'Karen')
    const canceled = sale('2026-09-22', 'Karen', 100_000, { status: 'cancelado' })
    expect(matchMeetingsToSales([m], [canceled]).size).toBe(0)
  })
})

describe('commercialMetrics', () => {
  const range = { from: '2026-07-01', to: '2026-07-31' }

  it('reproduz a conta da planilha de julho (CPL, CPR, agendamento)', () => {
    const meetings = Array.from({ length: 10 }, (_, i) =>
      meeting(`2026-07-${String(i + 1).padStart(2, '0')}`, `Lead ${i}`),
    )
    meetings[0]!.status = 'no_show'
    meetings[1]!.status = 'agendada'
    const raphaela = meeting('2026-07-06', 'Raphela', { status: 'fechada' })
    const all = [...meetings.slice(0, 9), raphaela]
    const sales = [sale('2026-07-14', 'Raphaela', 210_000)]

    const metrics = commercialMetrics({
      range,
      meetings: all,
      sales,
      marketingEntries: [julyAds],
      crmLeads: [],
      matches: matchMeetingsToSales(all, sales),
    })

    expect(metrics.leads).toBe(45)
    expect(metrics.leadsOrigin).toBe('plataforma')
    expect(metrics.meetings).toBe(10)
    expect(metrics.cplCents).toBe(4_093) // R$ 40,93
    expect(metrics.costPerMeetingCents).toBe(18_420) // R$ 184,20
    expect(metrics.schedulingRate).toBeCloseTo(10 / 45) // 22,2%
    expect(metrics.sales).toBe(1)
    expect(metrics.leadWinRate).toBeCloseTo(1 / 45)
    expect(metrics.meetingSales).toBe(1)
    expect(metrics.meetingsHeld).toBe(8)
    expect(metrics.meetingWinRate).toBeCloseTo(1 / 8)
    expect(metrics.noShowRate).toBeCloseTo(1 / 9)
    expect(metrics.roas).toBeCloseTo(210_000 / 184_200)
    expect(metrics.averageCycleDays).toBe(8)
    expect(metrics.closedWithoutSale).toBe(0)
  })

  it('cadastrar a venda muda o win rate sem tocar na reunião', () => {
    const m = meeting('2026-07-10', 'Brunna', { status: 'fechada' })
    const base = { range, meetings: [m], marketingEntries: [julyAds], crmLeads: [] }

    const before = commercialMetrics({ ...base, sales: [], matches: matchMeetingsToSales([m], []) })
    expect(before.meetingWinRate).toBe(0)
    expect(before.closedWithoutSale).toBe(1)

    const withSale = [sale('2026-07-12', 'Brunna', 240_000)]
    const after = commercialMetrics({
      ...base,
      sales: withSale,
      matches: matchMeetingsToSales([m], withSale),
    })
    expect(after.meetingWinRate).toBe(1)
    expect(after.closedWithoutSale).toBe(0)
  })

  it('sem marketing, usa os leads do CRM; sem nada, não inventa taxa', () => {
    const empty = commercialMetrics({
      range,
      meetings: [],
      sales: [],
      marketingEntries: [],
      crmLeads: [],
      matches: new Map(),
    })
    expect(empty.leadsOrigin).toBe('indisponivel')
    expect(empty.schedulingRate).toBeNull()
    expect(empty.cplCents).toBeNull()
  })
})

describe('meetingBreakdown', () => {
  it('junta o mesmo criativo escrito de jeitos diferentes', () => {
    const a = meeting('2026-09-03', 'Sthefany', { creative: 'depoimento rafaela' })
    const b = meeting('2026-09-03', 'Thiago', { creative: 'Depoimento Rafaela ' })
    const c = meeting('2026-09-18', 'Cinthia', { creative: 'Orgânico' })
    const rows = meetingBreakdown([a, b, c], new Map(), (m) => m.creative)
    expect(rows.map((row) => [row.label, row.meetings])).toEqual([
      ['depoimento rafaela', 2],
      ['Orgânico', 1],
    ])
  })
})

describe('vendas do funil × todas as vendas', () => {
  it('win rate conta só a venda que veio de reunião, como na planilha', () => {
    const range = { from: '2026-09-01', to: '2026-09-30' }
    const leticia = meeting('2026-09-21', 'Leticia', { status: 'fechada' })
    const vale = sale('2026-09-25', 'Clinica Vale', 850_000)
    const linconl = sale('2026-09-24', 'Linconl (Linha de óculos)', 280_000)
    leticia.saleId = vale.id
    const sales = [vale, linconl]
    const metrics = commercialMetrics({
      range,
      meetings: [leticia],
      sales,
      marketingEntries: [{ ...julyAds, month: '2026-09-01', adsCents: 201_325 }],
      crmLeads: [],
      matches: matchMeetingsToSales([leticia], sales),
    })
    expect(metrics.sales).toBe(2) // contexto: tudo que foi vendido
    expect(metrics.meetingSales).toBe(1)
    expect(metrics.leadWinRate).toBeCloseTo(1 / 45) // 2,22%, igual à planilha
    expect(metrics.meetingRevenueCents).toBe(850_000)
    expect(metrics.cacCents).toBe(201_325)
  })
})

describe('mês sem reuniões registradas', () => {
  it('não mostra 0% de agendamento — mostra que não há dado', () => {
    const may = commercialMetrics({
      range: { from: '2026-05-01', to: '2026-05-31' },
      meetings: [],
      sales: [],
      marketingEntries: [{ ...julyAds, month: '2026-05-01', leads: 18 }],
      crmLeads: [],
      matches: new Map(),
    })
    expect(may.leads).toBe(18)
    expect(may.schedulingRate).toBeNull()
    expect(may.leadWinRate).toBeNull()
  })
})
