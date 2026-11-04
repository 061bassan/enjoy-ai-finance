import { describe, expect, it } from 'vitest'
import { addCreative, creativeOptions, EMPTY_CREATIVE_CATALOG, removeCreative } from './creativeCatalog'

describe('lista de criativos da reunião', () => {
  it('junta os usados em reuniões com os cadastrados, em ordem alfabética', () => {
    const catalog = addCreative(EMPTY_CREATIVE_CATALOG, 'Oferta Black')
    expect(creativeOptions(['Depoimento Rafaela'], catalog)).toEqual([
      'Depoimento Rafaela',
      'Oferta Black',
    ])
  })

  it('não repete o mesmo criativo escrito de outro jeito, e a grafia cadastrada vence', () => {
    const catalog = addCreative(EMPTY_CREATIVE_CATALOG, 'Depoimento Rafaela')
    expect(creativeOptions(['depoimento rafaela ', 'DEPOIMENTO RAFAELA'], catalog)).toEqual([
      'Depoimento Rafaela',
    ])
  })

  it('retirar tira da lista mesmo quando há reunião usando o nome', () => {
    const catalog = removeCreative(EMPTY_CREATIVE_CATALOG, 'Depoimento Rafaela')
    expect(creativeOptions(['depoimento rafaela', 'Oferta'], catalog)).toEqual(['Oferta'])
  })

  it('retirar um criativo numerado não leva o outro junto', () => {
    const catalog = removeCreative(EMPTY_CREATIVE_CATALOG, 'Criativo 1')
    expect(creativeOptions(['Criativo 1', 'Criativo 2'], catalog)).toEqual(['Criativo 2'])
  })

  it('cadastrar de novo traz de volta o que foi retirado', () => {
    const removed = removeCreative(EMPTY_CREATIVE_CATALOG, 'Oferta')
    expect(creativeOptions([], addCreative(removed, 'oferta'))).toEqual(['oferta'])
  })

  it('ignora nome vazio', () => {
    expect(addCreative(EMPTY_CREATIVE_CATALOG, '   ')).toBe(EMPTY_CREATIVE_CATALOG)
    expect(removeCreative(EMPTY_CREATIVE_CATALOG, '   ')).toBe(EMPTY_CREATIVE_CATALOG)
  })
})
