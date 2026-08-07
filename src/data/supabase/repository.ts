import type { SupabaseClient } from '@supabase/supabase-js'
import type { Id } from '../types'
import type { ListQuery, NewEntity, PatchEntity, Repository } from '../contracts'
import { fromRow, toRow, toSnake } from './serialization'

/**
 * Coluna de data natural por tabela (nome já em snake_case do Postgres).
 * Espelho de `DATE_FIELD` em `src/data/local/db.ts` — é o campo pelo qual o
 * filtro de período e a ordenação padrão operam.
 */
const DATE_COLUMN: Record<string, string | undefined> = {
  transactions: 'date',
  bills: 'due_date',
  bill_payments: 'date',
  sales: 'sale_date',
  commercial_days: 'date',
  leads: 'entered_at',
  lead_activities: 'date',
  goal_contributions: 'date',
  monthly_targets: 'month',
  activity_log: 'created_at',
}

/**
 * Repositório genérico sobre uma tabela via PostgREST.
 *
 * Mesma superfície e mesma semântica do repositório local (`createRepository`
 * em `src/data/local/repository.ts`): filtra por `workspace_id`, opcionalmente
 * por um intervalo no campo de data, ordena e pagina. A diferença é só o meio —
 * lá é Dexie, aqui é HTTP. O RLS decide o que cada consulta enxerga; o
 * repositório não repete regra de permissão nenhuma.
 *
 * `id`, `created_at` e `updated_at` são gerados pelo Postgres (defaults e o
 * trigger `touch_updated_at`): o `insert`/`update` devolve a linha pronta com
 * `.select()`, e é ela que volta mapeada para camelCase.
 */
export function createSupabaseRepository<T extends { id: Id }>(
  client: SupabaseClient,
  table: string,
  options: { scoped?: boolean; readFrom?: string } = {},
): Repository<T> {
  const scoped = options.scoped ?? true
  const dateColumn = DATE_COLUMN[table]
  // Leitura pode vir de uma view (ex.: `profiles_directory` mascara o PII);
  // a escrita sempre vai na tabela-base. Sem `readFrom`, os dois são a tabela.
  const readTable = options.readFrom ?? table

  return {
    async list(workspaceId, query: ListQuery = {}) {
      let q = client.from(readTable).select('*')
      if (scoped) q = q.eq('workspace_id', workspaceId)
      if (dateColumn && query.from) q = q.gte(dateColumn, query.from)
      if (dateColumn && query.to) q = q.lte(dateColumn, query.to)

      const orderColumn = query.orderBy ? toSnake(query.orderBy) : dateColumn
      if (orderColumn) {
        q = q.order(orderColumn, { ascending: (query.direction ?? 'desc') === 'asc' })
      }

      if (query.limit != null) {
        const offset = query.offset ?? 0
        q = q.range(offset, offset + query.limit - 1)
      } else if (query.offset) {
        q = q.range(query.offset, query.offset + 999)
      }

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => fromRow<T>(row))
    },

    async get(id) {
      const { data, error } = await client.from(readTable).select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? fromRow<T>(data) : null
    },

    async create(payload: NewEntity<T>) {
      const { data, error } = await client
        .from(table)
        .insert(toRow(payload as Record<string, unknown>))
        .select()
        .single()
      if (error) throw new Error(error.message)
      return fromRow<T>(data)
    },

    async update(id, patch: PatchEntity<T>) {
      const { data, error } = await client
        .from(table)
        .update(toRow(patch as Record<string, unknown>))
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return fromRow<T>(data)
    },

    async remove(id) {
      const { error } = await client.from(table).delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async bulkCreate(items: NewEntity<T>[]) {
      if (!items.length) return []
      const { data, error } = await client
        .from(table)
        .insert(items.map((item) => toRow(item as Record<string, unknown>)))
        .select()
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => fromRow<T>(row))
    },

    async findBy(workspaceId, where) {
      let q = client.from(readTable).select('*')
      if (scoped) q = q.eq('workspace_id', workspaceId)
      for (const [key, value] of Object.entries(where)) {
        q = q.eq(toSnake(key), value as string | number | boolean)
      }
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => fromRow<T>(row))
    },
  }
}
