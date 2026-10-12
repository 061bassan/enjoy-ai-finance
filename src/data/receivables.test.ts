import { describe, expect, it } from 'vitest'
import type { NewEntity } from './contracts'
import { buildReceivables } from './receivables'
import type { Bill, Sale } from './types'

let seq = 0
const stamp = (draft: NewEntity<Bill>): Bill =>
  ({ ...draft, id: `b${++seq}`, createdAt: '', updatedAt: '' }) as Bill

function sale(overrides: Partial<Sale>): Sale {
  return {
    id: 's1',
    workspaceId: 'w',
    clientId: null,
    clientName: 'Clínica Vale',
    saleDate: '2026-10-12',
    closerId: null,
    sdrId: null,
    leadSource: null,
    model: 'tcv',
    amountCents: 0,
    mrrCents: 0,
    setupCents: 0,
    contractMonths: null,
    paymentMethod: 'pix',
    installments: 1,
    closerCommissionPercent: 0,
    sdrCommissionPercent: 0,
    status: 'pendente',
    createdBy: 'u',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const summary = (bills: Bill[]) => bills.map((b) => [b.dueDate, b.amountCents, b.description])

describe('buildReceivables — TCV', () => {
  it('à vista vira um título só, no dia do pagamento', () => {
    const bills = buildReceivables(
      sale({
        product: 'enjoy_rec',
        amountCents: 900_000,
        downPaymentCents: 900_000,
        downPaymentDate: '2026-10-15',
        contractMonths: 3,
      }),
      undefined,
      stamp,
      'g',
    )
    expect(summary(bills)).toEqual([
      ['2026-10-15', 900_000, 'Enjoy Rec — Clínica Vale (à vista)'],
    ])
  })

  it('entrada + restante em parcelas a partir do 1º vencimento', () => {
    const bills = buildReceivables(
      sale({
        product: 'enjoy_pro',
        amountCents: 1_000_000,
        downPaymentCents: 400_000,
        downPaymentDate: '2026-10-12',
        firstDueDate: '2026-11-10',
        installments: 3,
      }),
      undefined,
      stamp,
      'g',
    )
    expect(summary(bills)).toEqual([
      ['2026-10-12', 400_000, 'Entrada — Enjoy Pro — Clínica Vale'],
      ['2026-11-10', 200_000, 'Restante — Enjoy Pro — Clínica Vale — parcela 1/3'],
      ['2026-12-10', 200_000, 'Restante — Enjoy Pro — Clínica Vale — parcela 2/3'],
      ['2027-01-10', 200_000, 'Restante — Enjoy Pro — Clínica Vale — parcela 3/3'],
    ])
    // Nenhum centavo some nem aparece.
    expect(bills.reduce((sum, b) => sum + b.amountCents, 0)).toBe(1_000_000)
  })

  it('restante numa parcela só não leva "parcela 1/1"', () => {
    const bills = buildReceivables(
      sale({ amountCents: 500_000, downPaymentCents: 100_000, firstDueDate: '2026-12-01' }),
      undefined,
      stamp,
      'g',
    )
    expect(summary(bills)[1]).toEqual(['2026-12-01', 400_000, 'Restante — TCV — Clínica Vale'])
    expect(bills[1]?.installmentNumber).toBeNull()
  })

  it('entrada maior que o total é tratada como à vista, sem título negativo', () => {
    const bills = buildReceivables(
      sale({ amountCents: 300_000, downPaymentCents: 999_999 }),
      undefined,
      stamp,
      'g',
    )
    expect(bills).toHaveLength(1)
    expect(bills[0]?.amountCents).toBe(300_000)
  })

  it('sem entrada continua parcelando o total como antes', () => {
    const bills = buildReceivables(
      sale({ model: 'projeto', amountCents: 300_000, installments: 3 }),
      '2026-10-20',
      stamp,
      'g',
    )
    expect(bills.map((b) => b.dueDate)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20'])
  })
})

describe('buildReceivables — MRR', () => {
  it('uma mensalidade por mês a partir do 1º pagamento guardado na venda', () => {
    const bills = buildReceivables(
      sale({
        model: 'mrr',
        product: 'enjoy_growth',
        mrrCents: 250_000,
        contractMonths: 3,
        amountCents: 750_000,
        firstDueDate: '2026-11-05',
      }),
      '2026-10-12',
      stamp,
      'g',
    )
    expect(summary(bills)).toEqual([
      ['2026-11-05', 250_000, 'Mensalidade 1/3 — Clínica Vale'],
      ['2026-12-05', 250_000, 'Mensalidade 2/3 — Clínica Vale'],
      ['2027-01-05', 250_000, 'Mensalidade 3/3 — Clínica Vale'],
    ])
  })

  it('venda antiga, sem 1º pagamento guardado, usa o parâmetro como antes', () => {
    const bills = buildReceivables(
      sale({ model: 'mrr', mrrCents: 100_000, contractMonths: 2, amountCents: 200_000 }),
      '2026-10-12',
      stamp,
      'g',
    )
    expect(bills.map((b) => b.dueDate)).toEqual(['2026-10-12', '2026-11-12'])
  })
})
