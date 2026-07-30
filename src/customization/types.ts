/**
 * Personalização da aparência e do que aparece em cada tela.
 *
 * Existe para que o sócio ajuste o produto sem pedir deploy: cor de acento,
 * densidade, itens do menu e quais indicadores/colunas cada tela mostra.
 *
 * Duas fronteiras que este módulo NÃO cruza, e que são o motivo de ele ser
 * seguro:
 *
 * 1. **Ocultar é apresentação, nunca filtro.** Um KPI escondido continua
 *    sendo calculado com os mesmos dados. Se ocultar mudasse o número,
 *    "limpar a tela" viraria "sumir com a receita" e alguém decidiria errado.
 * 2. **Cor entra por acento, não por paleta livre.** O produto é neutro de
 *    propósito (ver src/styles/theme.css). Um seletor RGB aberto destruiria
 *    a hierarquia visual e o contraste. Aqui só há presets validados.
 */

import type { ScopedEntity } from '@/data/types'

/** Acentos disponíveis. O valor é o matiz HSL; a saturação vem da intensidade. */
export type AccentName =
  | 'grafite'
  | 'azul'
  | 'violeta'
  | 'verde'
  | 'ambar'
  | 'rosa'
  | 'ciano'
  | 'vermelho'

/** Quanto o acento aparece. `sutil` mantém o visual quase neutro original. */
export type AccentIntensity = 'sutil' | 'equilibrado' | 'vibrante'

/** Cantos dos cards, botões e campos. */
export type CornerStyle = 'reto' | 'suave' | 'arredondado'

/** Altura das linhas e espaçamento. `compacto` cabe mais coisa na tela. */
export type Density = 'compacto' | 'confortavel'

export interface BrandPrefs {
  accent: AccentName
  intensity: AccentIntensity
  corners: CornerStyle
  density: Density
}

/**
 * O que está oculto, por tela e por seção.
 *
 * Guarda-se o que está OCULTO, não o que está visível. É o que faz um
 * indicador novo aparecer sozinho para quem já personalizou — se guardássemos
 * a lista de visíveis, toda adição futura nasceria invisível para eles.
 */
export type HiddenMap = Record<string, string[]>

export interface Customization extends ScopedEntity {
  brand: BrandPrefs
  /** Chave: `${screenId}.${sectionId}` → ids ocultos. */
  hidden: HiddenMap
  /** Rotas removidas do menu lateral. */
  hiddenNav: string[]
}
