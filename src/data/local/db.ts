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
  CommercialMeeting,
  Goal,
  GoalContribution,
  Lead,
  LeadActivity,
  MarketingEntry,
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
  leads!: EntityTable<Lead, 'id'>
  leadActivities!: EntityTable<LeadActivity, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleCosts!: EntityTable<SaleCost, 'id'>
  commercialDays!: EntityTable<CommercialDay, 'id'>
  commercialMeetings!: EntityTable<CommercialMeeting, 'id'>
  marketingEntries!: EntityTable<MarketingEntry, 'id'>

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

    /**
     * v3 — CRM de leads e fila de aprovação.
     *
     * `members` é redeclarada só para ganhar o índice por `status`: a fila de
     * aprovação consulta "quem está pendente neste workspace" a cada abertura
     * do painel, e sem índice isso varre a tabela inteira. Redeclarar não
     * apaga nada — o Dexie preserva as linhas e só reconstrói os índices.
     */
    this.version(3).stores({
      leads:
        'id, workspaceId, stage, ownerId, source, enteredAt, clientId, saleId, nextActionAt, [workspaceId+stage], [workspaceId+enteredAt], [workspaceId+ownerId]',
      leadActivities: 'id, workspaceId, leadId, date, kind, [workspaceId+date], [leadId+date]',
      members: 'id, workspaceId, userId, [workspaceId+userId], role, status, [workspaceId+status]',
    })

    /**
     * v4 — investimento de marketing por mês e canal.
     *
     * O índice composto `[workspaceId+month+channel]` é o mesmo par que a
     * migration marca como único no Postgres: a tela consulta "já existe
     * lançamento deste canal neste mês?" antes de deixar criar outro, e sem
     * índice isso varreria a tabela a cada abertura do formulário.
     */
    this.version(4).stores({
      marketingEntries:
        'id, workspaceId, month, channel, [workspaceId+month], [workspaceId+month+channel]',
    })

    /**
     * v5: reuniões com leads (painel de Métricas comerciais). Tabela nova —
     * as anteriores não mudam, então quem já tem dados não perde nada.
     */
    this.version(5).stores({
      commercialMeetings: 'id, workspaceId, date, status, saleId, [workspaceId+date]',
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
  'leads',
  'leadActivities',
  'sales',
  'saleCosts',
  'commercialDays',
  'commercialMeetings',
  'marketingEntries',
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
  commercialMeetings: 'date',
  // Leads são filtrados pela data de ENTRADA: a pergunta do funil é sempre
  // "de tudo que chegou no período, quanto virou venda".
  leads: 'enteredAt',
  leadActivities: 'date',
  goalContributions: 'date',
  monthlyTargets: 'month',
  /**
   * Só para ordenação. O recorte por período NÃO passa por aqui: o filtro
   * genérico compara dia a dia, e um período de 05/08 a 20/08 descartaria a
   * linha "2026-08-01" — justamente a verba daquele mês. Quem recorta é
   * `entriesInPeriod` em `@/domain/marketing`, que compara meses.
   */
  marketingEntries: 'month',
  activity: 'createdAt',
}
