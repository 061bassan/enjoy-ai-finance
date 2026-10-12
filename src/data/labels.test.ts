import { afterEach, describe, expect, it } from 'vitest'
import { applyLabelOverrides, defaultLabel, MEETING_STATUS_LABEL, optionsFrom, SALE_PRODUCT_LABEL } from './enums'

afterEach(() => applyLabelOverrides(null))

describe('etiquetas editáveis', () => {
  it('troca o texto sem trocar o valor', () => {
    applyLabelOverrides({ meetingStatus: { perdida: 'Desistente' } })
    expect(MEETING_STATUS_LABEL.perdida).toBe('Desistente')
    const option = optionsFrom(MEETING_STATUS_LABEL).find((o) => o.value === 'perdida')
    expect(option).toEqual({ value: 'perdida', label: 'Desistente' })
  })

  it('tirar a etiqueta do mapa volta ao texto de fábrica', () => {
    applyLabelOverrides({ meetingStatus: { perdida: 'Desistente' } })
    applyLabelOverrides({})
    expect(MEETING_STATUS_LABEL.perdida).toBe('Perdida')
    expect(defaultLabel('meetingStatus', 'perdida')).toBe('Perdida')
  })

  it('texto vazio não apaga a etiqueta', () => {
    applyLabelOverrides({ saleProduct: { enjoy_pro: '   ' } })
    expect(SALE_PRODUCT_LABEL.enjoy_pro).toBe('Enjoy Pro')
  })
})
