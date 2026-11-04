import { normalizedLabel } from './commercialMetrics'

/**
 * Lista de criativos oferecida no cadastro de reunião.
 *
 * O criativo continua sendo texto na própria reunião: esta lista só decide o que
 * é SUGERIDO. Por isso retirar é seguro: as reuniões já registradas guardam o
 * nome e as métricas "por criativo" continuam contando com ele. É a mesma regra
 * da personalização: ocultar é apresentação, nunca filtro.
 */
export interface CreativeCatalog {
  /** Cadastrados à mão, mesmo sem nenhuma reunião ainda. */
  added: string[]
  /** Retirados da lista. Guardados porque reuniões antigas ainda trazem o nome de volta. */
  removed: string[]
}

export const EMPTY_CREATIVE_CATALOG: CreativeCatalog = { added: [], removed: [] }

/** A mesma chave do quadro "Por criativo": a lista e a métrica concordam sobre o que é igual. */
const catalogKey = normalizedLabel

/** O que aparece na lista: cadastrados + usados em reuniões − retirados, sem repetir grafia. */
export function creativeOptions(
  used: readonly string[],
  catalog: CreativeCatalog = EMPTY_CREATIVE_CATALOG,
): string[] {
  const removed = new Set(catalog.removed.map(catalogKey))
  const options = new Map<string, string>()
  // Os cadastrados vêm primeiro: a grafia escolhida à mão vence a digitada numa reunião.
  for (const name of [...catalog.added, ...used]) {
    const key = catalogKey(name)
    if (key && !removed.has(key) && !options.has(key)) options.set(key, name.trim())
  }
  return [...options.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Cadastra um criativo. Se ele tinha sido retirado, volta para a lista. */
export function addCreative(catalog: CreativeCatalog, name: string): CreativeCatalog {
  const key = catalogKey(name)
  if (!key) return catalog
  return {
    added: [...catalog.added.filter((item) => catalogKey(item) !== key), name.trim()],
    removed: catalog.removed.filter((item) => catalogKey(item) !== key),
  }
}

/** Retira um criativo da lista, sem tocar nas reuniões que já o usam. */
export function removeCreative(catalog: CreativeCatalog, name: string): CreativeCatalog {
  const key = catalogKey(name)
  if (!key) return catalog
  return {
    added: catalog.added.filter((item) => catalogKey(item) !== key),
    removed: [...catalog.removed.filter((item) => catalogKey(item) !== key), name.trim()],
  }
}
