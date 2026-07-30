/**
 * Tradução das preferências de marca em variáveis CSS.
 *
 * Função pura de ponta a ponta: recebe preferências e o modo claro/escuro,
 * devolve o mapa de variáveis. Nada de DOM aqui — quem aplica é o provider.
 * Assim dá para testar a regra de cor sem renderizar nada.
 *
 * Só sobrescrevemos as variáveis que o acento realmente afeta. Fundo, texto e
 * bordas continuam neutros, vindos do theme.css. É isso que impede a
 * personalização de virar tema paralelo — e de quebrar o contraste.
 */

import type { AccentIntensity, AccentName, BrandPrefs, CornerStyle, Density } from './types'

/** Matiz de cada acento. `grafite` é o neutro original — sem cor nenhuma. */
const HUE: Record<AccentName, number | null> = {
  grafite: null,
  azul: 217,
  violeta: 262,
  verde: 152,
  ambar: 38,
  rosa: 330,
  ciano: 190,
  vermelho: 6,
}

export const ACCENT_LABEL: Record<AccentName, string> = {
  grafite: 'Grafite',
  azul: 'Azul',
  violeta: 'Violeta',
  verde: 'Verde',
  ambar: 'Âmbar',
  rosa: 'Rosa',
  ciano: 'Ciano',
  vermelho: 'Vermelho',
}

export const INTENSITY_LABEL: Record<AccentIntensity, string> = {
  sutil: 'Sutil',
  equilibrado: 'Equilibrado',
  vibrante: 'Vibrante',
}

export const CORNER_LABEL: Record<CornerStyle, string> = {
  reto: 'Reto',
  suave: 'Suave',
  arredondado: 'Arredondado',
}

export const DENSITY_LABEL: Record<Density, string> = {
  compacto: 'Compacto',
  confortavel: 'Confortável',
}

/**
 * Saturação por intensidade.
 *
 * Os tetos são baixos de propósito. Acima de ~70% a cor começa a competir
 * com o dado na tela — e o dado é o produto.
 */
const SATURATION: Record<AccentIntensity, number> = {
  sutil: 26,
  equilibrado: 48,
  vibrante: 68,
}

const RADIUS: Record<CornerStyle, string> = {
  reto: '0.25rem',
  suave: '0.625rem',
  arredondado: '1rem',
}

/**
 * Luminosidade do acento em cada modo.
 *
 * São valores distintos porque o mesmo matiz precisa de mais luz no escuro
 * para manter contraste com o fundo, e de menos no claro.
 */
const LIGHTNESS = {
  dark: { primary: 62, accentBg: 22, ring: 52 },
  light: { primary: 42, accentBg: 92, ring: 58 },
} as const

/** Texto que fica LEGÍVEL sobre o acento — o par mais fácil de errar. */
function foregroundFor(mode: 'dark' | 'light'): string {
  return mode === 'dark' ? '0 0% 6%' : '0 0% 100%'
}

export interface CssVars {
  [key: string]: string
}

/**
 * Gera as variáveis a aplicar no `<html>`.
 *
 * Devolve mapa vazio de cor quando o acento é `grafite`: nesse caso as
 * variáveis do theme.css valem, e não há sobrescrita nenhuma. Densidade e
 * cantos continuam valendo, porque não dependem de cor.
 */
export function brandCssVars(prefs: BrandPrefs, mode: 'dark' | 'light'): CssVars {
  const vars: CssVars = {
    '--radius': RADIUS[prefs.corners],
    '--density-cell-y': prefs.density === 'compacto' ? '0.375rem' : '0.625rem',
  }

  const hue = HUE[prefs.accent]
  if (hue == null) return vars

  const saturation = SATURATION[prefs.intensity]
  const light = LIGHTNESS[mode]

  vars['--primary'] = `${hue} ${saturation}% ${light.primary}%`
  vars['--primary-foreground'] = foregroundFor(mode)
  vars['--ring'] = `${hue} ${Math.round(saturation * 0.8)}% ${light.ring}%`

  // O item ativo do menu e o hover: saturação bem menor, senão o menu inteiro
  // vira um bloco de cor e nada mais se destaca.
  vars['--accent'] = `${hue} ${Math.round(saturation * 0.5)}% ${light.accentBg}%`
  vars['--accent-foreground'] = mode === 'dark' ? '0 0% 98%' : `${hue} ${saturation}% 18%`

  return vars
}

/** Lista das variáveis que este módulo pode escrever — usada para limpar. */
export const MANAGED_VARS = [
  '--radius',
  '--density-cell-y',
  '--primary',
  '--primary-foreground',
  '--ring',
  '--accent',
  '--accent-foreground',
] as const
