import { describe, expect, it } from 'vitest'
import { maskDate, parseTypedDate } from './dateInput'

describe('maskDate', () => {
  it('formata conforme o usuário digita', () => {
    expect(maskDate('0')).toBe('0')
    expect(maskDate('05')).toBe('05')
    expect(maskDate('0503')).toBe('05/03')
    expect(maskDate('05032026')).toBe('05/03/2026')
  })

  it('ignora o que não é dígito', () => {
    expect(maskDate('05/03/2026')).toBe('05/03/2026')
    // Só os dígitos sobrevivem, na ordem em que aparecem: 5, 0, 3.
    expect(maskDate('a5b0c3')).toBe('50/3')
  })

  it('descarta dígitos além do oitavo', () => {
    expect(maskDate('050320269999')).toBe('05/03/2026')
  })
})

describe('parseTypedDate', () => {
  it('converte data completa para ISO', () => {
    expect(parseTypedDate('05/03/2026')).toBe('2026-03-05')
    expect(parseTypedDate('05032026')).toBe('2026-03-05')
  })

  it('devolve null enquanto a digitação está incompleta', () => {
    expect(parseTypedDate('')).toBeNull()
    expect(parseTypedDate('05')).toBeNull()
    expect(parseTypedDate('05/03')).toBeNull()
    expect(parseTypedDate('05/03/202')).toBeNull()
  })

  /** O caso que motivou a validação: o Date silenciosamente viraria 03/03. */
  it('rejeita dia que não existe no mês', () => {
    expect(parseTypedDate('31/02/2026')).toBeNull()
    expect(parseTypedDate('30/02/2026')).toBeNull()
    expect(parseTypedDate('31/04/2026')).toBeNull()
  })

  it('aceita 29 de fevereiro em ano bissexto e recusa fora dele', () => {
    expect(parseTypedDate('29/02/2024')).toBe('2024-02-29')
    expect(parseTypedDate('29/02/2026')).toBeNull()
  })

  it('rejeita mês e dia fora de faixa', () => {
    expect(parseTypedDate('05/13/2026')).toBeNull()
    expect(parseTypedDate('00/03/2026')).toBeNull()
    expect(parseTypedDate('32/01/2026')).toBeNull()
  })

  it('rejeita anos absurdos, que quase sempre são erro de digitação', () => {
    expect(parseTypedDate('05/03/0202')).toBeNull()
    expect(parseTypedDate('05/03/9999')).toBeNull()
  })

  it('preserva o dia sem deslocar por fuso horário', () => {
    // O bug clássico: parse em UTC faz o dia 01 virar o último do mês anterior.
    expect(parseTypedDate('01/01/2026')).toBe('2026-01-01')
    expect(parseTypedDate('31/12/2026')).toBe('2026-12-31')
  })
})
