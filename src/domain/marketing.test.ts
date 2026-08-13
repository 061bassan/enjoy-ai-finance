import { describe, expect, it } from 'vitest'
import type { MarketingEntry, Sale, Transaction } from '@/data/types'
import {
  entriesInPeriod,
  marketingKpis,
  marketingSeries,
  performanceByChannel,
  reconcileMarketingWithCash,
  totalizeMarketing,
  wholeMonthsRange,
} from './marketing'

/**
 * O que estes testes protegem:
 *
 * 1. O mês é indivisível — período parcial traz a verba inteira do mês.
 * 2. Lead de plataforma e lead de CRM nunca se somam.
 * 3. ROAS olha só a mídia; ROI olha o investimento inteiro.
 * 4. A conciliação com o caixa compara meses inteiros dos dois lados.
 */

function entry(overrides: Partial<MarketingEntry> = {}): MarketingEntry {
  return {
    id: 'm1',
    workspaceId: 'w1',
    month: '2026-03-01',
    channel: 'meta_ads',
    adsCents: 0,
    agencyCents: 0,
    creativeCents: 0,
    toolsCents: 0,
    otherCents: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    notes: null,
    createdBy: 'u1',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    workspaceId: 'w1',
    clientId: null,
    clientName: 'Cliente',
    saleDate: '2026-03-12',
    closerId: null,
    sdrId: null,
    leadSource: null,
    model: 'mrr',
    amountCents: 500_000,
    mrrCents: 0,
    setupCents: 0,
    contractMonths: 12,
    paymentMethod: 'pix',
    installments: 1,
    closerCommissionPercent: 0,
    sdrCommissionPercent: 0,
    status: 'pendente',
    createdBy: 'u1',
    createdAt: '2026-03-12T00:00:00.000Z',
    updatedAt: '2026-03-12T00:00:00.000Z',
    ...overrides,
  }
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    workspaceId: 'w1',
    accountId: 'a1',
    categoryId: null,
    kind: 'expense',
    amountCents: 0,
    date: '2026-03-10',
    description: 'Meta Ads',
    status: 'cleared',
    paymentMethod: 'credit_card',
    costCenter: 'marketing',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('recorte por período', () => {
  it('traz o mês inteiro quando o período é parcial', () => {
    const marco = entry({ month: '2026-03-01', adsCents: 1_200_000 })
    const periodo = entriesInPeriod([marco], { from: '2026-03-05', to: '2026-03-20' })

    // Ratear R$ 12.000 por dia inventaria precisão que a campanha não tem.
    expect(periodo).toHaveLength(1)
    expect(totalizeMarketing(periodo).totalCents).toBe(1_200_000)
  })

  it('exclui meses fora da janela', () => {
    const entradas = [entry({ month: '2026-02-01' }), entry({ month: '2026-04-01' })]
    expect(entriesInPeriod(entradas, { from: '2026-03-01', to: '2026-03-31' })).toHaveLength(0)
  })

  it('expande o período para meses inteiros', () => {
    expect(wholeMonthsRange({ from: '2026-03-05', to: '2026-04-10' })).toEqual({
      from: '2026-03-01',
      to: '2026-04-30',
    })
  })
})

describe('totalização', () => {
  it('soma as rubricas e os volumes', () => {
    const totais = totalizeMarketing([
      entry({ adsCents: 800_000, agencyCents: 150_000, impressions: 100_000, clicks: 2_000, leads: 80 }),
      entry({ channel: 'google_ads', adsCents: 400_000, creativeCents: 50_000, leads: 20 }),
    ])

    expect(totais.adsCents).toBe(1_200_000)
    expect(totais.totalCents).toBe(1_400_000)
    expect(totais.leads).toBe(100)
    expect(totais.entryCount).toBe(2)
  })
})

describe('KPIs', () => {
  const totais = totalizeMarketing([
    entry({ adsCents: 1_000_000, agencyCents: 200_000, impressions: 200_000, clicks: 4_000, leads: 100 }),
  ])

  it('divide o investimento TOTAL pelos leads, não só a mídia', () => {
    const kpis = marketingKpis(totais, [])
    // R$ 12.000 ÷ 100 leads. Um CPL que ignora a agência mente para menos.
    expect(kpis.cplCents).toBe(12_000)
    expect(kpis.cplOrigin).toBe('plataforma')
  })

  it('não soma o lead do CRM ao da plataforma', () => {
    const kpis = marketingKpis(totais, [], { crmLeadCount: 40 })
    expect(kpis.leadCount).toBe(100)
  })

  it('cai para o CRM quando nenhuma plataforma informou lead', () => {
    const semLeads = totalizeMarketing([entry({ adsCents: 1_000_000 })])
    const kpis = marketingKpis(semLeads, [], { crmLeadCount: 50 })

    expect(kpis.leadCount).toBe(50)
    expect(kpis.cplOrigin).toBe('crm')
    expect(kpis.cplCents).toBe(20_000)
  })

  it('marca o CPL como indisponível sem nenhuma fonte de lead', () => {
    const kpis = marketingKpis(totalizeMarketing([entry({ adsCents: 100 })]), [])
    expect(kpis.cplCents).toBeNull()
    expect(kpis.cplOrigin).toBe('indisponivel')
  })

  it('usa só a mídia no ROAS e o investimento inteiro no ROI', () => {
    const kpis = marketingKpis(totais, [sale({ amountCents: 3_000_000 })])

    expect(kpis.roas).toBeCloseTo(3) // 30.000 ÷ 10.000 de mídia
    expect(kpis.roi).toBeCloseTo(1.5) // (30.000 − 12.000) ÷ 12.000
    expect(kpis.profitCents).toBe(1_800_000)
    expect(kpis.cacCents).toBe(1_200_000)
  })

  it('ignora venda cancelada na receita', () => {
    const kpis = marketingKpis(totais, [
      sale({ amountCents: 3_000_000 }),
      sale({ id: 's2', amountCents: 9_000_000, status: 'cancelado' }),
    ])
    expect(kpis.revenueCents).toBe(3_000_000)
    expect(kpis.salesCount).toBe(1)
  })

  it('devolve null em vez de dividir por zero', () => {
    const kpis = marketingKpis(totalizeMarketing([]), [])
    expect(kpis.cplCents).toBeNull()
    expect(kpis.cpmCents).toBeNull()
    expect(kpis.cpcCents).toBeNull()
    expect(kpis.roas).toBeNull()
    expect(kpis.roi).toBeNull()
    expect(kpis.cacCents).toBeNull()
  })
})

describe('por canal', () => {
  it('agrupa, calcula CPL e ordena pelo maior investimento', () => {
    const linhas = performanceByChannel([
      entry({ channel: 'google_ads', adsCents: 300_000, leads: 10, clicks: 500, impressions: 50_000 }),
      entry({ channel: 'meta_ads', adsCents: 600_000, agencyCents: 100_000, leads: 50 }),
      entry({ id: 'm3', channel: 'meta_ads', month: '2026-04-01', adsCents: 300_000, leads: 20 }),
    ])

    expect(linhas.map((linha) => linha.channel)).toEqual(['meta_ads', 'google_ads'])

    const meta = linhas[0]!
    expect(meta.investmentCents).toBe(1_000_000)
    expect(meta.leads).toBe(70)
    expect(meta.cplCents).toBe(14_286)
    expect(meta.share).toBeCloseTo(1_000_000 / 1_300_000)

    const google = linhas[1]!
    expect(google.cpcCents).toBe(600)
    expect(google.ctr).toBeCloseTo(0.01)
  })
})

describe('série mensal', () => {
  it('agrupa por mês em ordem cronológica', () => {
    const serie = marketingSeries([
      entry({ month: '2026-04-01', adsCents: 500_000, leads: 25 }),
      entry({ month: '2026-03-01', adsCents: 400_000, leads: 20 }),
      entry({ id: 'm3', month: '2026-03-01', channel: 'google_ads', adsCents: 200_000, leads: 10 }),
    ])

    expect(serie.map((ponto) => ponto.month)).toEqual(['2026-03-01', '2026-04-01'])
    expect(serie[0]!.investmentCents).toBe(600_000)
    expect(serie[0]!.cplCents).toBe(20_000)
  })
})

describe('conciliação com o caixa', () => {
  it('acusa o que falta lançar como despesa', () => {
    const resultado = reconcileMarketingWithCash(
      [entry({ month: '2026-03-01', adsCents: 1_200_000 })],
      [transaction({ amountCents: 900_000 })],
      { from: '2026-03-01', to: '2026-03-31' },
    )

    expect(resultado.declaredCents).toBe(1_200_000)
    expect(resultado.cashCents).toBe(900_000)
    expect(resultado.differenceCents).toBe(300_000)
  })

  it('compara os dois lados sobre meses inteiros', () => {
    // Período de uma semana: a verba do mês inteiro precisa encontrar a
    // despesa do mês inteiro, senão a conciliação acusaria um buraco falso.
    const resultado = reconcileMarketingWithCash(
      [entry({ month: '2026-03-01', adsCents: 1_200_000 })],
      [transaction({ date: '2026-03-28', amountCents: 1_200_000 })],
      { from: '2026-03-02', to: '2026-03-08' },
    )

    expect(resultado.range).toEqual({ from: '2026-03-01', to: '2026-03-31' })
    expect(resultado.differenceCents).toBe(0)
  })

  it('ignora despesa de outro centro de custo e receita', () => {
    const resultado = reconcileMarketingWithCash(
      [],
      [
        transaction({ amountCents: 500_000, costCenter: 'equipe' }),
        transaction({ id: 't2', kind: 'income', amountCents: 700_000 }),
      ],
      { from: '2026-03-01', to: '2026-03-31' },
    )

    expect(resultado.cashCents).toBe(0)
  })
})
