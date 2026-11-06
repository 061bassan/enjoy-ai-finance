import { describe, expect, it } from 'vitest'
import { toCsv, type CsvColumn } from './csv'

const columns: CsvColumn<{ name: string; cents: number }>[] = [
  { header: 'Nome', value: (row) => row.name },
  { header: 'Valor', value: (row) => row.cents, money: true },
]

function cellsOf(name: string, cents = 0) {
  return toCsv([{ name, cents }], columns).split('\r\n')[1]
}

describe('toCsv', () => {
  it('neutraliza texto que o Excel executaria como fórmula', () => {
    expect(cellsOf('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")";0,00`)
    expect(cellsOf('+5511999990000')).toBe(`'+5511999990000;0,00`)
    expect(cellsOf('-2+3')).toBe(`'-2+3;0,00`)
    expect(cellsOf('@SUM(A1)')).toBe(`'@SUM(A1);0,00`)
  })

  it('não mexe em texto comum nem em valor numérico negativo', () => {
    expect(cellsOf('Enjoy Scale', -1050)).toBe('Enjoy Scale;-10,50')
  })

  it('continua citando separador e quebra de linha', () => {
    expect(cellsOf('a;b')).toBe('"a;b";0,00')
  })
})
