import { describe, expect, it } from 'vitest'
import type { CommercialDay, Sale } from '@/data/types'
import { commercialKpis, totalizeCommercial } from './commercial'

/**
 * O win rate do funil.
 *
 * A conta é **vendas registradas ÷ leads do período**, e não a antiga
 * "propostas aprovadas ÷ propostas decididas". A diferença não é cosmética:
 * um time que envia três propostas e fecha as três marcava 100% enquanto
 * perdia duzentos leads antes da proposta. Estes testes existem para que
 * ninguém restaure a conta antiga sem perceber.
 */

function day(overrides: Partial<CommercialDay> = {}): CommercialDay {
  return {
    id: 'd1',
    workspaceId: 'w1',
    date: '2026-03-10',
    ownerId: null,
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
    sdrInvestmentCents: 0,
    closerInvestmentCents: 0,
    toolsCents: 0,
    crmCents: 0,
    phoneCents: 0,
    internetCents: 0,
    softwareCents: 0,
    notes: null,
    createdBy: 'u1',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
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
    amountCents: 120_000,
    mrrCents: 10_000,
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

describe('commercialKpis — win rate', () => {
  it('usa os leads do CRM quando existem', () => {
    const totals = totalizeCommercial([day({ leads: 100 })])
    const kpis = commercialKpis(totals, [sale({ id: 'a' }), sale({ id: 'b' })], { leadCount: 40 })

    expect(kpis.winRate).toBe(0.05)
    expect(kpis.leadCount).toBe(40)
    expect(kpis.saleCount).toBe(2)
    expect(kpis.winRateOrigin).toBe('crm')
  })

  it('cai para o diário comercial quando o CRM não tem leads no período', () => {
    const totals = totalizeCommercial([day({ leads: 20 })])
    const kpis = commercialKpis(totals, [sale()], { leadCount: 0 })

    expect(kpis.winRate).toBe(0.05)
    expect(kpis.winRateOrigin).toBe('diario')
  })

  it('fica indisponível sem nenhum lead — não inventa denominador', () => {
    const kpis = commercialKpis(totalizeCommercial([day()]), [sale()])

    expect(kpis.winRate).toBeNull()
    expect(kpis.winRateOrigin).toBe('indisponivel')
  })

  it('ignora vendas canceladas: contrato desfeito não ganhou nada', () => {
    const totals = totalizeCommercial([day({ leads: 10 })])
    const kpis = commercialKpis(
      totals,
      [sale({ id: 'a' }), sale({ id: 'b', status: 'cancelado' })],
      { leadCount: 10 },
    )

    expect(kpis.saleCount).toBe(1)
    expect(kpis.winRate).toBe(0.1)
  })

  it('mantém a aprovação de propostas como métrica separada', () => {
    const totals = totalizeCommercial([
      day({ leads: 10, proposalsSent: 5, proposalsApproved: 3, proposalsRejected: 1 }),
    ])
    const kpis = commercialKpis(totals, [sale()], { leadCount: 10 })

    expect(kpis.proposalApprovalRate).toBe(0.75)
    expect(kpis.lossRate).toBe(0.25)
    // E a aprovação de propostas não contamina o win rate.
    expect(kpis.winRate).toBe(0.1)
  })
})
