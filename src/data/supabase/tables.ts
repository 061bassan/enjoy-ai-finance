/**
 * Mapa entre a coleção do app e a tabela do Postgres.
 *
 * A maioria coincide, mas algumas divergem porque o nome bom em cada lado é
 * diferente: `members` → `workspace_members`, `activity` → `activity_log`,
 * `billPayments` → `bill_payments`. A `key` é a mesma usada pelo backup JSON do
 * provider local (`TABLE_NAMES` em `src/data/local/db.ts`), para que um export
 * feito no local possa ser importado aqui sem renomear nada.
 *
 * A ORDEM importa: é a ordem de dependência (pais antes de filhos), usada no
 * import para não violar chave estrangeira.
 */
export interface CollectionMeta {
  /** Nome da coleção no app e no backup JSON. */
  key: string
  /** Tabela correspondente no Postgres. */
  table: string
  /** `false` só para as globais (profiles, workspaces): não filtram workspace. */
  scoped: boolean
}

export const COLLECTIONS: readonly CollectionMeta[] = [
  { key: 'profiles', table: 'profiles', scoped: false },
  { key: 'workspaces', table: 'workspaces', scoped: false },
  { key: 'members', table: 'workspace_members', scoped: true },
  { key: 'accounts', table: 'accounts', scoped: true },
  { key: 'categories', table: 'categories', scoped: true },
  { key: 'transactions', table: 'transactions', scoped: true },
  { key: 'bills', table: 'bills', scoped: true },
  { key: 'billPayments', table: 'bill_payments', scoped: true },
  { key: 'recurringRules', table: 'recurring_rules', scoped: true },
  { key: 'clients', table: 'clients', scoped: true },
  { key: 'leads', table: 'leads', scoped: true },
  { key: 'leadActivities', table: 'lead_activities', scoped: true },
  { key: 'sales', table: 'sales', scoped: true },
  { key: 'saleCosts', table: 'sale_costs', scoped: true },
  { key: 'commercialDays', table: 'commercial_days', scoped: true },
  { key: 'monthlyTargets', table: 'monthly_targets', scoped: true },
  { key: 'goals', table: 'goals', scoped: true },
  { key: 'goalContributions', table: 'goal_contributions', scoped: true },
  { key: 'purchaseGoals', table: 'purchase_goals', scoped: true },
  { key: 'boards', table: 'boards', scoped: true },
  { key: 'boardColumns', table: 'board_columns', scoped: true },
  { key: 'cards', table: 'cards', scoped: true },
  { key: 'activity', table: 'activity_log', scoped: true },
  { key: 'customizations', table: 'customizations', scoped: true },
] as const
