import { describe, expect, it } from 'vitest'
import type { RecurringRule } from '@/data/types'
import { monthlyEquivalent, nextOccurrence, occurrencesBetween } from './recurrence'

type RuleShape = Pick<
  RecurringRule,
  'frequency' | 'interval' | 'startDate' | 'endDate' | 'dayOfMonth' | 'active'
>

function rule(overrides: Partial<RuleShape> = {}): RuleShape {
  return {
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-10',
    endDate: null,
    dayOfMonth: 10,
    active: true,
    ...overrides,
  }
}

describe('monthlyEquivalent', () => {
  it('mantém o valor de uma regra mensal', () => {
    expect(monthlyEquivalent({ amountCents: 10000, frequency: 'monthly', interval: 1 })).toBe(10000)
  })

  it('divide a anual por doze', () => {
    expect(monthlyEquivalent({ amountCents: 120000, frequency: 'yearly', interval: 1 })).toBe(10000)
  })

  it('divide a trimestral por três', () => {
    expect(monthlyEquivalent({ amountCents: 30000, frequency: 'quarterly', interval: 1 })).toBe(
      10000,
    )
  })

  it('usa 52/12 semanas por mês, não 4', () => {
    // Com 4 semanas/mês daria 40000 e subestimaria o custo anual em ~8%.
    const value = monthlyEquivalent({ amountCents: 10000, frequency: 'weekly', interval: 1 })
    expect(value).toBeGreaterThan(43000)
    expect(value).toBeLessThan(44000)
  })

  it('considera o intervalo — a cada 2 meses custa metade por mês', () => {
    expect(monthlyEquivalent({ amountCents: 20000, frequency: 'monthly', interval: 2 })).toBe(10000)
  })

  it('trata intervalo zero como 1 em vez de dividir por zero', () => {
    expect(monthlyEquivalent({ amountCents: 10000, frequency: 'monthly', interval: 0 })).toBe(10000)
  })
})

describe('occurrencesBetween', () => {
  it('gera uma ocorrência por mês no dia âncora', () => {
    const dates = occurrencesBetween(rule(), '2026-01-01', '2026-04-30')
    expect(dates).toEqual(['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10'])
  })

  it('trunca o dia 31 para o último dia de fevereiro', () => {
    const dates = occurrencesBetween(
      rule({ startDate: '2026-01-31', dayOfMonth: 31 }),
      '2026-01-01',
      '2026-03-31',
    )
    expect(dates).toContain('2026-01-31')
    // 2026 não é bissexto: fevereiro termina em 28.
    expect(dates).toContain('2026-02-28')
    expect(dates).toContain('2026-03-31')
  })

  it('respeita a data final da regra', () => {
    const dates = occurrencesBetween(
      rule({ endDate: '2026-02-28' }),
      '2026-01-01',
      '2026-12-31',
    )
    expect(dates).toEqual(['2026-01-10', '2026-02-10'])
  })

  it('não retorna nada antes do início da regra', () => {
    const dates = occurrencesBetween(rule({ startDate: '2026-06-10' }), '2026-01-01', '2026-12-31')
    expect(dates[0]).toBe('2026-06-10')
  })

  it('ignora regras inativas, salvo quando pedido o contrário', () => {
    expect(occurrencesBetween(rule({ active: false }), '2026-01-01', '2026-12-31')).toEqual([])
    expect(
      occurrencesBetween(rule({ active: false }), '2026-01-01', '2026-03-31', {
        includeInactive: true,
      }),
    ).toHaveLength(3)
  })

  it('devolve lista vazia quando o intervalo está invertido', () => {
    expect(occurrencesBetween(rule(), '2026-12-31', '2026-01-01')).toEqual([])
  })

  it('gera semanais a cada 7 dias', () => {
    const dates = occurrencesBetween(
      rule({ frequency: 'weekly', startDate: '2026-01-05', dayOfMonth: null }),
      '2026-01-01',
      '2026-02-02',
    )
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02'])
  })

  it('gera anuais a cada 12 meses', () => {
    const dates = occurrencesBetween(
      rule({ frequency: 'yearly', startDate: '2024-03-15', dayOfMonth: 15 }),
      '2024-01-01',
      '2027-12-31',
    )
    expect(dates).toEqual(['2024-03-15', '2025-03-15', '2026-03-15', '2027-03-15'])
  })
})

describe('nextOccurrence', () => {
  it('encontra a próxima data a partir de uma referência', () => {
    expect(nextOccurrence(rule(), '2026-02-15')).toBe('2026-03-10')
  })

  it('inclui a própria data quando ela é uma ocorrência', () => {
    expect(nextOccurrence(rule(), '2026-03-10')).toBe('2026-03-10')
  })

  it('devolve null quando a regra já terminou', () => {
    expect(nextOccurrence(rule({ endDate: '2026-02-28' }), '2026-06-01')).toBeNull()
  })
})
