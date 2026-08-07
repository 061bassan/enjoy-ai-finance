/**
 * Tradução entre o TypeScript (camelCase) e o Postgres (snake_case).
 *
 * As entidades do domínio usam `amountCents`, `dueDate`, `workspaceId`; as
 * colunas do banco usam `amount_cents`, `due_date`, `workspace_id`. A migration
 * nomeou cada coluna como o snake_case direto do campo, então esta conversão
 * mecânica cobre todas as tabelas — não há mapa campo a campo para manter.
 *
 * A conversão é RASA de propósito: só as chaves de primeiro nível da linha.
 * Colunas `jsonb` (o `brand`/`hidden` da personalização, o `diff` da auditoria)
 * carregam objetos cuja forma é definida em TypeScript e precisa passar intacta
 * — converter as chaves internas as quebraria.
 */

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
}

export function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** Entidade → linha do Postgres. Chaves `undefined` somem no JSON e viram o
 *  default da coluna (`jsonb_populate_record` preenche o que falta com null). */
export function toRow(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) out[toSnake(key)] = value
  return out
}

/** Linha do Postgres → entidade. */
export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) out[toCamel(key)] = value
  return out as T
}
