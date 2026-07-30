import type { EntityTable, Table } from 'dexie'
import { nowIso } from '@/lib/date'
import type { Id } from '../types'
import type { ListQuery, NewEntity, PatchEntity, Repository } from '../contracts'
import { DATE_FIELD, type TableName } from './db'

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback para ambientes sem WebCrypto (jsdom antigo, alguns runners).
  return `id_${Math.abs(Date.now() ^ Math.floor(Math.random() * 1e9)).toString(36)}`
}

interface WithId {
  id: Id
}

/**
 * Repositório genérico sobre uma tabela Dexie.
 *
 * Vale para toda entidade escopada porque o formato é sempre o mesmo:
 * filtra por `workspaceId`, opcionalmente por um intervalo no campo de data
 * natural da tabela, ordena e pagina. Entidades não escopadas (profiles,
 * workspaces) passam `scoped: false`.
 */
export function createRepository<T extends WithId>(
  table: EntityTable<T, 'id'>,
  tableName: TableName,
  options: { scoped?: boolean } = {},
): Repository<T> {
  const scoped = options.scoped ?? true
  const dateField = DATE_FIELD[tableName]

  /**
   * `EntityTable` deriva o tipo da chave do próprio T, o que o compilador não
   * consegue reduzir a `string` enquanto T for genérico. Como todas as nossas
   * chaves primárias são UUIDs em string, um único cast aqui resolve — em vez
   * de espalhar casts por cada chamada abaixo.
   */
  const rows = table as unknown as Table<T, string>

  async function loadScoped(workspaceId: Id): Promise<T[]> {
    if (!scoped) return rows.toArray()
    return rows.where('workspaceId').equals(workspaceId).toArray()
  }

  return {
    async list(workspaceId, query: ListQuery = {}) {
      let rows = await loadScoped(workspaceId)

      if (dateField && (query.from || query.to)) {
        rows = rows.filter((row) => {
          const value = (row as Record<string, unknown>)[dateField]
          if (typeof value !== 'string') return true
          // Timestamps completos são comparados só pela parte da data.
          const day = value.slice(0, 10)
          if (query.from && day < query.from) return false
          if (query.to && day > query.to) return false
          return true
        })
      }

      const orderBy = query.orderBy ?? dateField
      if (orderBy) {
        const dir = query.direction ?? 'desc'
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[orderBy]
          const bv = (b as Record<string, unknown>)[orderBy]
          if (av === bv) return 0
          if (av == null) return 1
          if (bv == null) return -1
          const cmp = av < bv ? -1 : 1
          return dir === 'asc' ? cmp : -cmp
        })
      }

      const offset = query.offset ?? 0
      const end = query.limit != null ? offset + query.limit : undefined
      return offset || end != null ? rows.slice(offset, end) : rows
    },

    async get(id) {
      const row = await rows.get(id)
      return row ?? null
    },

    async create(data) {
      const now = nowIso()
      const row = { ...data, id: newId(), createdAt: now, updatedAt: now } as unknown as T
      await rows.add(row)
      return row
    },

    async update(id, patch) {
      const current = await rows.get(id)
      if (!current) throw new Error(`${tableName}: registro ${id} não encontrado`)
      const next = { ...current, ...patch, updatedAt: nowIso() } as T
      await rows.put(next)
      return next
    },

    async remove(id) {
      await rows.delete(id)
    },

    async bulkCreate(items) {
      const now = nowIso()
      const created = items.map(
        (data) => ({ ...data, id: newId(), createdAt: now, updatedAt: now }) as unknown as T,
      )
      if (created.length) await rows.bulkAdd(created)
      return created
    },

    async findBy(workspaceId, where) {
      const rows = await loadScoped(workspaceId)
      const entries = Object.entries(where) as [string, unknown][]
      if (!entries.length) return rows
      return rows.filter((row) =>
        entries.every(([key, value]) => (row as Record<string, unknown>)[key] === value),
      )
    },
  }
}

/** Aplica os campos gerados sem passar pelo repositório (usado no seed). */
export function stamp<T>(data: NewEntity<T>, id: Id = newId()): T {
  const now = nowIso()
  return { ...data, id, createdAt: now, updatedAt: now } as unknown as T
}

export type { NewEntity, PatchEntity }
