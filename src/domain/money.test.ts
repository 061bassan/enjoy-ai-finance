import { describe, expect, it } from 'vitest'
import { parseMoneyToCents, percentOf, safeRatio, splitCents, sumCents } from '@/lib/money'

/**
 * Testes de dinheiro.
 *
 * É aqui que erro financeiro nasce, então cada caso abaixo corresponde a um
 * bug que aconteceria de verdade no produto — não a cobertura por cobertura.
 */

describe('parseMoneyToCents', () => {
  it('entende o formato pt-BR com separador de milhar', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456)
    expect(parseMoneyToCents('R$ 1.234,56')).toBe(123456)
    expect(parseMoneyToCents('12.345.678,90')).toBe(1234567890)
  })

  it('entende o formato en-US, que aparece em CSV importado', () => {
    expect(parseMoneyToCents('1,234.56')).toBe(123456)
    expect(parseMoneyToCents('1234.56')).toBe(123456)
  })

  it('trata número inteiro sem separador decimal', () => {
    expect(parseMoneyToCents('1234')).toBe(123400)
  })

  it('devolve null quando não há número', () => {
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('R$')).toBeNull()
  })

  it('não perde precisão em valores que quebrariam em float', () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos o problema não existe.
    expect(parseMoneyToCents('0,10')! + parseMoneyToCents('0,20')!).toBe(
      parseMoneyToCents('0,30'),
    )
  })
})

describe('splitCents', () => {
  it('divide sem perder nem inventar centavos', () => {
    const parts = splitCents(10000, 3)
    expect(parts).toEqual([3334, 3333, 3333])
    expect(sumCents(parts)).toBe(10000)
  })

  it('mantém a soma exata em qualquer número de parcelas', () => {
    for (let n = 1; n <= 24; n++) {
      const parts = splitCents(99_999, n)
      expect(sumCents(parts)).toBe(99_999)
      expect(parts).toHaveLength(n)
    }
  })

  it('preserva o sinal em valores negativos', () => {
    const parts = splitCents(-10000, 3)
    expect(sumCents(parts)).toBe(-10000)
    expect(parts.every((value) => value < 0)).toBe(true)
  })

  it('devolve lista vazia para zero parcelas', () => {
    expect(splitCents(1000, 0)).toEqual([])
  })
})

describe('percentOf', () => {
  it('calcula comissão arredondando ao centavo', () => {
    expect(percentOf(10000, 8.5)).toBe(850)
    expect(percentOf(3333, 3)).toBe(100) // 99.99 → 100
  })

  it('aceita zero por cento', () => {
    expect(percentOf(10000, 0)).toBe(0)
  })
})

describe('safeRatio', () => {
  it('devolve null em vez de Infinity quando o divisor é zero', () => {
    expect(safeRatio(100, 0)).toBeNull()
  })

  it('devolve null quando algum operando não é finito', () => {
    expect(safeRatio(Number.NaN, 10)).toBeNull()
    expect(safeRatio(10, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('calcula a razão normalmente', () => {
    expect(safeRatio(50, 200)).toBe(0.25)
  })
})
