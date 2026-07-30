import Dexie, { type EntityTable } from 'dexie'
import type { Customization } from '@/customization/types'
import type {
  Account,
  ActivityLog,
  Bill,
  BillPayment,
  Board,
  BoardColumn,
  Card,
  Category,
  Client,
  CommercialDay,
  Goal,
  GoalContribution,
  MonthlyTarget,
  Profile,
  PurchaseGoal,
  RecurringRule,
  Sale,
  SaleCost,
  Transaction,
  Workspace,
  WorkspaceMember,
} from '../types'

/**
 * Banco local (IndexedDB via Dexie).
 *
 * Os índices declarados aqui espelham os índices da migration Postgres —
 * as mesmas consultas precisam ser rápidas nos dois provedores. Sempre que
 * uma consulta nova nascer, o índice entra nos dois lugares.
 *
 * `[workspaceId+date]` é o índice composto mais usado: quase toda tela
 * filtra por workspace e período ao mesmo tempo.
 */
export class EnjoyDatabase extends Dexie {
  profiles!: EntityTable<Profile, 'id'>
  workspaces!: EntityTable<Workspace, 'id'>
  members!: EntityTable<WorkspaceMember, 'id'>

  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  bills!: EntityTable<Bill, 'id'>
  billPayments!: EntityTable<BillPayment, 'id'>
  recurringRules!: EntityTable<RecurringRule, 'id'>

  clients!: EntityTable<Client, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleCosts!: EntityTable<SaleCost, 'id'>
  commercialDays!: EntityTable<CommercialDay, 'id'>

  monthlyTargets!: EntityTable<MonthlyTarget, 'id'>
  goals!: EntityTable<Goal, 'id'>
  goalContributions!: EntityTable<GoalContribution, 'id'>
  purchaseGoals!: EntityTable<PurchaseGoal, 'id'>

  boards!: EntityTable<Board, 'id'>
  boardColumns!: EntityTable<BoardColumn, 'id'>
  cards!: EntityTable<Card, 'id'>

  activity!: EntityTable<ActivityLog, 'id'>
  customizations!: EntityTable<Customization, 'id'>

  constructor() {
    super('enjoy-ai-finance')

    this.version(1).stores({
      profiles: 'id, email',
      workspaces: 'id, ownerId, type',
      members: 'id, workspaceId, userId, [workspaceId+userId], role',

      accounts: 'id, workspaceId, archived, [workspaceId+archived]',
      categories: 'id, workspaceId, kind, costCenter, [workspaceId+kind]',
      transactions:
        'id, workspaceId, date, accountId, categoryId, kind, status, saleId, billId, clientId, costCenter, transferGroupId, [workspaceId+date], [workspaceId+kind]',
      bills:
        'id, workspaceId, direction, dueDate, status, clientId, saleId, categoryId, costCenter, recurringRuleId, installmentGroupId, [workspaceId+direction], [workspaceId+dueDate], [workspaceId+status]',
      billPayments: 'id, workspaceId, billId, date, accountId, transactionId, [workspaceId+date]',
      recurringRules: 'id, workspaceId, active, kind, frequency, [workspaceId+active]',

      clients: 'id, workspaceId, status, source, [workspaceId+status]',
      sales:
        'id, workspaceId, saleDate, clientId, closerId, sdrId, status, model, leadSource, [workspaceId+saleDate], [workspaceId+status]',
      saleCosts: 'id, workspaceId, saleId',
      commercialDays: 'id, workspaceId, date, ownerId, [workspaceId+date]',

      monthlyTargets: 'id, workspaceId, month, [workspaceId+month]',
      goals: 'id, workspaceId, status, [workspaceId+status]',
      goalContributions: 'id, workspaceId, goalId, date',
      purchaseGoals: 'id, workspaceId, status, priority, [workspaceId+status]',

      boards: 'id, workspaceId, template',
      boardColumns: 'id, workspaceId, boardId, position',
      cards: 'id, workspaceId, boardId, columnId, assigneeId, dueDate, linkId, [boardId+columnId]',

      activity: 'id, workspaceId, entityId, actorId, createdAt, [workspaceId+createdAt]',
    })

    /**
     * v2 — personalização por workspace.
     *
     * Dexie aplica só o delta: as tabelas da v1 e os dados nelas ficam
     * intactos. Uma base existente ganha a tabela vazia na próxima abertura,
     * e a ausência de registro significa "preferências padrão".
     */
    this.version(2).stores({
      customizations: 'id, workspaceId',
    })
  }
}

export const db = new EnjoyDatabase()

/** Ordem em que as tabelas são exportadas/importadas e limpas. */
export const TABLE_NAMES = [
  'profiles',
  'workspaces',
  'members',
  'accounts',
  'categories',
  'transactions',
  'bills',
  'billPayments',
  'recurringRules',
  'clients',
  'sales',
  'saleCosts',
  'commercialDays',
  'monthlyTargets',
  'goals',
  'goalContributions',
  'purchaseGoals',
  'boards',
  'boardColumns',
  'cards',
  'activity',
  'customizations',
] as const

export type TableName = (typeof TABLE_NAMES)[number]

/** Campo de data "natural" de cada tabela — usado pelo filtro de período. */
export const DATE_FIELD: Partial<Record<TableName, string>> = {
  transactions: 'date',
  bills: 'dueDate',
  billPayments: 'date',
  sales: 'saleDate',
  commercialDays: 'date',
  goalContributions: 'date',
  monthlyTargets: 'month',
  activity: 'createdAt',
}
