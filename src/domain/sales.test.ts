import { describe, expect, it } from 'vitest'
import { closerCommission, commissionBase, sdrCommission } from './sales'
import type { Sale } from '@/data/types'

const sale = (overrides: Partial<Sale>) =>
  ({
    mrrCents: 0,
    setupCents: 0,
    amountCents: 0,
    closerCommissionPercent: 10,
    sdrCommissionPercent: 5,
    ...overrides,
  }) as Sale

describe('comissão', () => {
  it('MRR: incide sobre implantação + 1ª mensalidade, não sobre o contrato inteiro', () => {
    const mrr = sale({ mrrCents: 200_000, setupCents: 100_000, amountCents: 2_500_000 })
    expect(commissionBase(mrr)).toBe(300_000)
    expect(closerCommission(mrr)).toBe(30_000)
  })

  it('TCV: incide sobre o valor total do projeto', () => {
    const tcv = sale({ amountCents: 1_200_000 })
    expect(commissionBase(tcv)).toBe(1_200_000)
    expect(closerCommission(tcv)).toBe(120_000)
    expect(sdrCommission(tcv)).toBe(60_000)
  })
})
