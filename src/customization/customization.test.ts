import { describe, expect, it } from 'vitest'
import { brandCssVars, MANAGED_VARS } from './theme'
import { defaultHidden, findSection, SCREENS, sectionKey } from './registry'
import type { BrandPrefs } from './types'

const BASE: BrandPrefs = {
  accent: 'grafite',
  intensity: 'equilibrado',
  corners: 'suave',
  density: 'confortavel',
}

/** Extrai a saturação de um valor HSL "H S% L%". */
function saturationOf(hsl: string | undefined): number {
  const part = hsl?.split(' ')[1]
  if (!part) throw new Error(`valor HSL inesperado: ${hsl}`)
  return Number(part.replace('%', ''))
}

describe('brandCssVars', () => {
  it('não sobrescreve cor nenhuma no acento grafite', () => {
    const vars = brandCssVars(BASE, 'dark')
    expect(vars['--primary']).toBeUndefined()
    expect(vars['--accent']).toBeUndefined()
    expect(vars['--ring']).toBeUndefined()
  })

  it('mantém cantos e densidade mesmo sem cor', () => {
    const vars = brandCssVars(BASE, 'dark')
    expect(vars['--radius']).toBe('0.625rem')
    expect(vars['--density-cell-y']).toBeDefined()
  })

  it('aplica o matiz do acento escolhido', () => {
    const vars = brandCssVars({ ...BASE, accent: 'azul' }, 'dark')
    expect(vars['--primary']).toMatch(/^217 /)
    expect(vars['--ring']).toMatch(/^217 /)
    expect(vars['--accent']).toMatch(/^217 /)
  })

  it('sobe a saturação conforme a intensidade', () => {
    const sutil = saturationOf(
      brandCssVars({ ...BASE, accent: 'verde', intensity: 'sutil' }, 'dark')['--primary'],
    )
    const medio = saturationOf(
      brandCssVars({ ...BASE, accent: 'verde', intensity: 'equilibrado' }, 'dark')['--primary'],
    )
    const forte = saturationOf(
      brandCssVars({ ...BASE, accent: 'verde', intensity: 'vibrante' }, 'dark')['--primary'],
    )

    expect(sutil).toBeLessThan(medio)
    expect(medio).toBeLessThan(forte)
  })

  /**
   * O teto de saturação é o que impede a personalização de virar um problema
   * de legibilidade. Se alguém subir esses números, este teste avisa.
   */
  it('nunca passa de 70% de saturação, nem no vibrante', () => {
    for (const accent of ['azul', 'violeta', 'verde', 'ambar', 'rosa', 'ciano', 'vermelho'] as const) {
      const vars = brandCssVars({ ...BASE, accent, intensity: 'vibrante' }, 'dark')
      expect(saturationOf(vars['--primary'])).toBeLessThanOrEqual(70)
    }
  })

  it('usa luminosidades diferentes no claro e no escuro', () => {
    const dark = brandCssVars({ ...BASE, accent: 'azul' }, 'dark')
    const light = brandCssVars({ ...BASE, accent: 'azul' }, 'light')
    expect(dark['--primary']).not.toBe(light['--primary'])
  })

  /** O par acento/texto é o mais fácil de errar — e o mais visível quando erra. */
  it('dá texto escuro sobre acento claro e vice-versa', () => {
    expect(brandCssVars({ ...BASE, accent: 'azul' }, 'dark')['--primary-foreground']).toBe('0 0% 6%')
    expect(brandCssVars({ ...BASE, accent: 'azul' }, 'light')['--primary-foreground']).toBe(
      '0 0% 100%',
    )
  })

  it('muda o raio conforme os cantos', () => {
    expect(brandCssVars({ ...BASE, corners: 'reto' }, 'dark')['--radius']).toBe('0.25rem')
    expect(brandCssVars({ ...BASE, corners: 'arredondado' }, 'dark')['--radius']).toBe('1rem')
  })

  it('compacto encolhe a célula em relação ao confortável', () => {
    const compacto = brandCssVars({ ...BASE, density: 'compacto' }, 'dark')['--density-cell-y']
    const confortavel = brandCssVars({ ...BASE, density: 'confortavel' }, 'dark')['--density-cell-y']
    expect(parseFloat(compacto ?? '')).toBeLessThan(parseFloat(confortavel ?? ''))
  })

  /**
   * Toda variável emitida precisa estar em MANAGED_VARS, senão a limpeza
   * feita antes de reaplicar deixa resíduo — trocar um acento colorido por
   * grafite manteria a cor antiga grudada na tela.
   */
  it('só emite variáveis declaradas como gerenciadas', () => {
    for (const accent of ['grafite', 'azul'] as const) {
      for (const mode of ['dark', 'light'] as const) {
        const vars = brandCssVars({ ...BASE, accent }, mode)
        for (const name of Object.keys(vars)) {
          expect(MANAGED_VARS).toContain(name)
        }
      }
    }
  })
})

describe('registry', () => {
  it('monta a chave de seção no formato esperado', () => {
    expect(sectionKey('sales', 'columns')).toBe('sales.columns')
  })

  it('encontra uma seção existente e devolve undefined para inexistente', () => {
    expect(findSection('sales', 'columns')?.items.length).toBeGreaterThan(0)
    expect(findSection('sales', 'inexistente')).toBeUndefined()
    expect(findSection('inexistente', 'columns')).toBeUndefined()
  })

  it('lista como ocultos por padrão apenas os marcados', () => {
    const hidden = defaultHidden('sales', 'columns')
    expect(hidden).toContain('sdr')
    expect(hidden).toContain('installments')
    expect(hidden).toContain('commission')
    expect(hidden).not.toContain('client')
    expect(hidden).not.toContain('amount')
  })

  it('devolve lista vazia para seção desconhecida', () => {
    expect(defaultHidden('nada', 'nada')).toEqual([])
  })

  it('não tem ids repetidos dentro de uma seção', () => {
    for (const screen of SCREENS) {
      for (const section of screen.sections) {
        const ids = section.items.map((item) => item.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })

  /** Um item travado que nascesse oculto seria impossível de reexibir. */
  it('nenhum item travado nasce oculto', () => {
    for (const screen of SCREENS) {
      for (const section of screen.sections) {
        for (const item of section.items) {
          if (item.locked) expect(item.hiddenByDefault).toBeFalsy()
        }
      }
    }
  })

  it('a tabela de vendas mantém cliente e valor travados', () => {
    const columns = findSection('sales', 'columns')
    const locked = columns?.items.filter((item) => item.locked).map((item) => item.id)
    expect(locked).toContain('client')
    expect(locked).toContain('amount')
  })
})
