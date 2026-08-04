import { describe, expect, it } from 'vitest'
import type { Lead, LeadStage, Sale } from '@/data/types'
import {
  conversionRate,
  leadFunnel,
  leadsBySource,
  leadsInPeriod,
  leadsNeedingAttention,
  totalizeLeads,
  winRateFromLeads,
} from './leads'

const RANGE = { from: '2026-08-01', to: '2026-08-31' }

function lead(overrides: Partial<Lead> & { id: string }): Lead {
  return {
    workspaceId: 'ws',
    name: `Lead ${overrides.id}`,
    company: null,
    email: null,
    phone: null,
    source: null,
    stage: 'novo',
    ownerId: null,
    estimatedValueCents: 0,
    enteredAt: '2026-08-10',
    lastContactAt: null,
    nextActionAt: null,
    nextActionNote: null,
    closedAt: null,
    lostReason: null,
    clientId: null,
    saleId: null,
    notes: null,
    createdBy: 'user',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
}

function sale(overrides: Partial<Sale> & { id: string }): Sale {
  return {
    workspaceId: 'ws',
    clientId: null,
    clientName: 'Cliente',
    company: null,
    saleDate: '2026-08-15',
    closerId: null,
    sdrId: null,
    leadSource: null,
    model: 'mrr',
    amountCents: 100_000,
    mrrCents: 10_000,
    setupCents: 0,
    contractMonths: 10,
    paymentMethod: null,
    installments: 1,
    closerCommissionPercent: 0,
    sdrCommissionPercent: 0,
    status: 'pago',
    leadCreatedAt: null,
    leadId: null,
    notes: null,
    createdBy: 'user',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('recorte por período', () => {
  it('filtra pela data de entrada, não pela de fechamento', () => {
    const leads = [
      lead({ id: 'a', enteredAt: '2026-07-20', closedAt: '2026-08-05', stage: 'ganho' }),
      lead({ id: 'b', enteredAt: '2026-08-02' }),
    ]

    // O lead 'a' fechou em agosto, mas é safra de julho: a pergunta do funil
    // é sempre "de tudo que chegou no período, quanto virou venda".
    const result = leadsInPeriod(leads, RANGE)
    expect(result.map((l) => l.id)).toEqual(['b'])
  })
})

describe('conversão lead → venda', () => {
  it('divide vendas reais pelos leads do CRM', () => {
    const leads = [lead({ id: 'a' }), lead({ id: 'b' }), lead({ id: 'c' }), lead({ id: 'd' })]
    const sales = [sale({ id: 's1' })]

    const result = conversionRate({ leads, sales, range: RANGE })

    expect(result.ratio).toBe(0.25)
    expect(result.leadCount).toBe(4)
    expect(result.saleCount).toBe(1)
    expect(result.origin).toBe('crm')
  })

  it('ignora vendas canceladas — contrato desfeito não converteu nada', () => {
    const leads = [lead({ id: 'a' }), lead({ id: 'b' })]
    const sales = [sale({ id: 's1' }), sale({ id: 's2', status: 'cancelado' })]

    expect(conversionRate({ leads, sales, range: RANGE }).saleCount).toBe(1)
  })

  it('ignora vendas fora do período', () => {
    const leads = [lead({ id: 'a' }), lead({ id: 'b' })]
    const sales = [sale({ id: 's1' }), sale({ id: 's2', saleDate: '2026-09-02' })]

    expect(conversionRate({ leads, sales, range: RANGE }).saleCount).toBe(1)
  })

  it('cai para o total do diário quando não há leads no CRM', () => {
    const result = conversionRate({
      leads: [],
      sales: [sale({ id: 's1' })],
      range: RANGE,
      diaryLeadCount: 20,
    })

    expect(result.ratio).toBe(0.05)
    expect(result.leadCount).toBe(20)
    expect(result.origin).toBe('diario')
  })

  it('prefere o CRM ao diário quando os dois existem', () => {
    const result = conversionRate({
      leads: [lead({ id: 'a' }), lead({ id: 'b' })],
      sales: [sale({ id: 's1' })],
      range: RANGE,
      diaryLeadCount: 50,
    })

    expect(result.origin).toBe('crm')
    expect(result.leadCount).toBe(2)
    expect(result.ratio).toBe(0.5)
  })

  it('não divide por zero quando não há lead nenhum', () => {
    const result = conversionRate({ leads: [], sales: [sale({ id: 's1' })], range: RANGE })

    expect(result.ratio).toBeNull()
    expect(result.origin).toBe('indisponivel')
  })
})

describe('taxa de ganho', () => {
  it('considera só os leads já decididos', () => {
    const leads = [
      lead({ id: 'a', stage: 'ganho' }),
      lead({ id: 'b', stage: 'perdido' }),
      lead({ id: 'c', stage: 'proposta' }),
      lead({ id: 'd', stage: 'novo' }),
    ]

    // 1 ganho de 2 decididos — os 2 abertos não entram na conta.
    expect(winRateFromLeads(leads)).toBe(0.5)
  })

  it('devolve null quando nada foi decidido', () => {
    expect(winRateFromLeads([lead({ id: 'a', stage: 'novo' })])).toBeNull()
  })
})

describe('totais da carteira', () => {
  it('separa pipeline aberto de valor ganho', () => {
    const leads = [
      lead({ id: 'a', stage: 'proposta', estimatedValueCents: 500_000 }),
      lead({ id: 'b', stage: 'novo', estimatedValueCents: 300_000 }),
      lead({ id: 'c', stage: 'ganho', estimatedValueCents: 200_000, closedAt: '2026-08-20' }),
      lead({ id: 'd', stage: 'perdido', estimatedValueCents: 900_000 }),
    ]

    const totals = totalizeLeads(leads)

    expect(totals.open).toBe(2)
    expect(totals.pipelineCents).toBe(800_000)
    expect(totals.won).toBe(1)
    expect(totals.wonCents).toBe(200_000)
    // Perdido não entra em pipeline nem em ganho.
    expect(totals.lost).toBe(1)
  })

  it('calcula dias médios até fechar a partir de entrada e fechamento', () => {
    const leads = [
      lead({ id: 'a', stage: 'ganho', enteredAt: '2026-08-01', closedAt: '2026-08-11' }),
      lead({ id: 'b', stage: 'ganho', enteredAt: '2026-08-01', closedAt: '2026-08-21' }),
    ]

    expect(totalizeLeads(leads).averageDaysToWin).toBe(15)
  })
})

describe('funil por etapa', () => {
  it('devolve todas as etapas na ordem, mesmo as vazias', () => {
    const buckets = leadFunnel([lead({ id: 'a', stage: 'reuniao' })])
    const stages = buckets.map((b) => b.stage)

    expect(stages).toEqual<LeadStage[]>([
      'novo',
      'contato',
      'reuniao',
      'proposta',
      'negociacao',
      'ganho',
      'perdido',
    ])
    expect(buckets.find((b) => b.stage === 'reuniao')?.count).toBe(1)
    expect(buckets.find((b) => b.stage === 'novo')?.count).toBe(0)
  })
})

describe('leads que precisam de atenção', () => {
  const hoje = '2026-08-20'

  it('põe ação atrasada acima de silêncio', () => {
    const leads = [
      lead({ id: 'silencioso', stage: 'contato', lastContactAt: '2026-08-01' }),
      lead({
        id: 'atrasado',
        stage: 'proposta',
        lastContactAt: '2026-08-19',
        nextActionAt: '2026-08-18',
      }),
    ]

    const result = leadsNeedingAttention(leads, hoje)

    expect(result[0]?.lead.id).toBe('atrasado')
    expect(result[0]?.reason).toBe('acao_atrasada')
    expect(result[1]?.reason).toBe('sem_contato')
  })

  it('ignora leads já fechados', () => {
    const leads = [
      lead({ id: 'ganho', stage: 'ganho', lastContactAt: '2026-07-01' }),
      lead({ id: 'perdido', stage: 'perdido', lastContactAt: '2026-07-01' }),
    ]

    // Cobrar follow-up de quem já saiu do funil é ruído — e ruído faz a
    // lista inteira ser ignorada.
    expect(leadsNeedingAttention(leads, hoje)).toHaveLength(0)
  })

  it('usa a data de entrada quando nunca houve contato', () => {
    const leads = [lead({ id: 'novo', stage: 'novo', enteredAt: '2026-08-01' })]
    const result = leadsNeedingAttention(leads, hoje)

    expect(result).toHaveLength(1)
    expect(result[0]?.daysSilent).toBe(19)
  })

  it('não cobra lead recente', () => {
    const leads = [lead({ id: 'recente', stage: 'novo', enteredAt: '2026-08-19' })]
    expect(leadsNeedingAttention(leads, hoje)).toHaveLength(0)
  })
})

describe('desempenho por origem', () => {
  it('ordena por conversão, não por volume', () => {
    const leads = [
      // Canal de volume: 4 leads, 1 ganho (25%).
      ...['a', 'b', 'c'].map((id) => lead({ id, source: 'trafego_pago' })),
      lead({ id: 'd', source: 'trafego_pago', stage: 'ganho' }),
      // Canal pequeno: 2 leads, 1 ganho (50%).
      lead({ id: 'e', source: 'indicacao' }),
      lead({ id: 'f', source: 'indicacao', stage: 'ganho' }),
    ]

    const result = leadsBySource(leads)

    expect(result[0]?.source).toBe('indicacao')
    expect(result[0]?.conversion).toBe(0.5)
    expect(result[1]?.source).toBe('trafego_pago')
    expect(result[1]?.conversion).toBe(0.25)
  })

  it('agrupa leads sem origem informada', () => {
    const result = leadsBySource([lead({ id: 'a' })])
    expect(result[0]?.source).toBe('sem_origem')
  })
})
