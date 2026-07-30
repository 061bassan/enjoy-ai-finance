import { describe, expect, it } from 'vitest'
import type { Account, Bill, BillPayment, Transaction } from '@/data/types'
import { outstandingAmount, resolveStatus, toBillViews } from './bills'
import {
  accountBalance,
  burnRate,
  grossRevenue,
  monthlySeries,
  netProfit,
  runwayMonths,
  totalCash,
  totalExpenses,
  variation,
} from './finance'

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${Math.random()}`,
    workspaceId: 'ws',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accountId: 'acc1',
    categoryId: null,
    kind: 'income',
    amountCents: 10000,
    date: '2026-01-15',
    description: 'teste',
    status: 'cleared',
    paymentMethod: null,
    costCenter: null,
    tags: [],
    createdBy: 'user',
    ...overrides,
  }
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc1',
    workspaceId: 'ws',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Conta',
    type: 'checking',
    institution: null,
    openingBalanceCents: 0,
    archived: false,
    ...overrides,
  }
}

describe('receita, despesa e lucro', () => {
  const transactions = [
    transaction({ kind: 'income', amountCents: 100_000 }),
    transaction({ kind: 'expense', amountCents: 30_000 }),
    transaction({ kind: 'transfer', amountCents: 50_000 }),
  ]

  it('soma apenas as entradas na receita', () => {
    expect(grossRevenue(transactions)).toBe(100_000)
  })

  it('não conta transferência como despesa', () => {
    // O bug clássico: mover dinheiro para a poupança aparecendo como gasto.
    expect(totalExpenses(transactions)).toBe(30_000)
  })

  it('calcula o lucro ignorando transferências', () => {
    expect(netProfit(transactions)).toBe(70_000)
  })
})

describe('accountBalance', () => {
  it('parte do saldo inicial e aplica as movimentações', () => {
    const acc = account({ openingBalanceCents: 50_000 })
    const balance = accountBalance(acc, [
      transaction({ kind: 'income', amountCents: 20_000 }),
      transaction({ kind: 'expense', amountCents: 5_000 }),
    ])
    expect(balance).toBe(65_000)
  })

  it('respeita o corte por data', () => {
    const acc = account({ openingBalanceCents: 0 })
    const balance = accountBalance(
      acc,
      [
        transaction({ kind: 'income', amountCents: 10_000, date: '2026-01-10' }),
        transaction({ kind: 'income', amountCents: 90_000, date: '2026-02-10' }),
      ],
      '2026-01-31',
    )
    expect(balance).toBe(10_000)
  })

  it('exclui cartão de crédito do caixa total', () => {
    // Saldo de cartão é dívida; somar inflaria o "cash em caixa".
    const accounts = [
      account({ id: 'a', type: 'checking', openingBalanceCents: 100_000 }),
      account({ id: 'b', type: 'credit_card', openingBalanceCents: 80_000 }),
    ]
    expect(totalCash(accounts, [])).toBe(100_000)
  })
})

describe('monthlySeries', () => {
  it('zera meses sem movimento em vez de omiti-los', () => {
    const series = monthlySeries(
      [transaction({ kind: 'income', amountCents: 10_000, date: '2026-01-15' })],
      ['2026-01-01', '2026-02-01', '2026-03-01'],
    )
    expect(series).toHaveLength(3)
    expect(series[1]?.revenueCents).toBe(0)
  })

  it('acumula o lucro ao longo da série', () => {
    const series = monthlySeries(
      [
        transaction({ kind: 'income', amountCents: 10_000, date: '2026-01-15' }),
        transaction({ kind: 'income', amountCents: 20_000, date: '2026-02-15' }),
      ],
      ['2026-01-01', '2026-02-01'],
    )
    expect(series[0]?.cumulativeProfitCents).toBe(10_000)
    expect(series[1]?.cumulativeProfitCents).toBe(30_000)
  })
})

describe('burn rate e runway', () => {
  it('considera apenas os meses de prejuízo', () => {
    const series = monthlySeries(
      [
        transaction({ kind: 'expense', amountCents: 30_000, date: '2026-01-15' }),
        transaction({ kind: 'income', amountCents: 90_000, date: '2026-02-15' }),
      ],
      ['2026-01-01', '2026-02-01'],
    )
    // Janeiro queimou 30k, fevereiro deu lucro: o burn é 30k, não a média dos dois.
    expect(burnRate(series)).toBe(30_000)
  })

  it('devolve zero quando a operação nunca queima caixa', () => {
    const series = monthlySeries(
      [transaction({ kind: 'income', amountCents: 10_000, date: '2026-01-15' })],
      ['2026-01-01'],
    )
    expect(burnRate(series)).toBe(0)
  })

  it('não calcula runway sem queima', () => {
    expect(runwayMonths(100_000, 0)).toBeNull()
  })

  it('calcula quantos meses o caixa aguenta', () => {
    expect(runwayMonths(120_000, 20_000)).toBe(6)
  })
})

describe('variation', () => {
  it('devolve null quando a base é zero, em vez de Infinity', () => {
    expect(variation(100, 0)).toBeNull()
  })

  it('calcula crescimento e queda', () => {
    expect(variation(150, 100)).toBeCloseTo(0.5)
    expect(variation(50, 100)).toBeCloseTo(-0.5)
  })

  it('usa o módulo da base para não inverter o sinal em bases negativas', () => {
    // Sair de -100 para -50 é melhora, e precisa aparecer como positivo.
    expect(variation(-50, -100)).toBeCloseTo(0.5)
  })
})

// ---------------------------------------------------------------------------

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b1',
    workspaceId: 'ws',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    direction: 'receivable',
    partyName: 'Cliente',
    description: 'Mensalidade',
    amountCents: 100_000,
    dueDate: '2026-02-10',
    status: 'open',
    categoryId: null,
    costCenter: null,
    createdBy: 'user',
    ...overrides,
  }
}

function payment(amountCents: number, billId = 'b1'): BillPayment {
  return {
    id: `p${amountCents}`,
    workspaceId: 'ws',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    billId,
    amountCents,
    date: '2026-02-10',
    accountId: 'acc1',
    createdBy: 'user',
  }
}

describe('títulos', () => {
  it('calcula o saldo em aberto', () => {
    expect(outstandingAmount(bill(), [payment(30_000)])).toBe(70_000)
  })

  it('nunca devolve saldo negativo com pagamento a maior', () => {
    expect(outstandingAmount(bill(), [payment(150_000)])).toBe(0)
  })

  it('deriva o atraso da data, sem depender de status gravado', () => {
    // O título continua com status "open" no banco; o atraso é calculado.
    expect(resolveStatus(bill({ dueDate: '2026-01-01' }), [], '2026-02-01')).toBe('overdue')
    expect(resolveStatus(bill({ dueDate: '2026-03-01' }), [], '2026-02-01')).toBe('open')
  })

  it('reconhece baixa parcial antes do vencimento', () => {
    expect(resolveStatus(bill({ dueDate: '2026-03-01' }), [payment(30_000)], '2026-02-01')).toBe(
      'partial',
    )
  })

  it('marca como quitado quando a soma das baixas cobre o valor', () => {
    expect(
      resolveStatus(bill({ dueDate: '2026-01-01' }), [payment(60_000), payment(40_000)], '2026-02-01'),
    ).toBe('paid')
  })

  it('mantém cancelado independentemente de datas', () => {
    expect(resolveStatus(bill({ status: 'canceled', dueDate: '2020-01-01' }), [], '2026-02-01')).toBe(
      'canceled',
    )
  })

  it('agrupa as baixas por título ao montar as visões', () => {
    const views = toBillViews(
      [bill({ id: 'b1' }), bill({ id: 'b2', amountCents: 50_000 })],
      [payment(30_000, 'b1')],
      '2026-01-01',
    )
    expect(views[0]?.outstandingCents).toBe(70_000)
    expect(views[1]?.outstandingCents).toBe(50_000)
  })
})
