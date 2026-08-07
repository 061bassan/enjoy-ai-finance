import type { Customization } from '@/customization/types'
import type { DataProvider } from '../contracts'
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
  Lead,
  LeadActivity,
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
import { getSupabaseClient } from './client'
import { createSupabaseRepository } from './repository'
import { SupabaseAuth } from './auth'
import { SupabaseOperations } from './operations'

/**
 * Monta o `DataProvider` do Supabase — o espelho do `createLocalProvider`.
 *
 * Cada repositório aponta para a tabela do Postgres (nomes em snake_case, que
 * diferem da coleção em alguns casos: `members` → `workspace_members`,
 * `activity` → `activity_log`). `profiles` e `workspaces` são globais (não
 * filtram workspace); o resto é escopado.
 *
 * `seedIfEmpty` e `reset` NÃO existem aqui de propósito: semear é papel do
 * trigger `handle_new_user` (migration 0005), e "apagar tudo" não é uma
 * operação de cliente num banco compartilhado — seria destrutiva para todo o
 * time. São opcionais no contrato justamente para isto.
 */
export function createSupabaseProvider(): DataProvider {
  const client = getSupabaseClient()

  return {
    kind: 'supabase',

    auth: new SupabaseAuth(client),
    ops: new SupabaseOperations(client),

    // Lê da view que mascara o PII (CPF/telefone/nascimento) para quem não é
    // gatekeeper; escreve na tabela-base (cada um edita o seu). Ver 0010.
    profiles: createSupabaseRepository<Profile>(client, 'profiles', {
      scoped: false,
      readFrom: 'profiles_directory',
    }),
    workspaces: createSupabaseRepository<Workspace>(client, 'workspaces', { scoped: false }),
    members: createSupabaseRepository<WorkspaceMember>(client, 'workspace_members'),

    accounts: createSupabaseRepository<Account>(client, 'accounts'),
    categories: createSupabaseRepository<Category>(client, 'categories'),
    transactions: createSupabaseRepository<Transaction>(client, 'transactions'),
    bills: createSupabaseRepository<Bill>(client, 'bills'),
    billPayments: createSupabaseRepository<BillPayment>(client, 'bill_payments'),
    recurringRules: createSupabaseRepository<RecurringRule>(client, 'recurring_rules'),

    clients: createSupabaseRepository<Client>(client, 'clients'),
    leads: createSupabaseRepository<Lead>(client, 'leads'),
    leadActivities: createSupabaseRepository<LeadActivity>(client, 'lead_activities'),
    sales: createSupabaseRepository<Sale>(client, 'sales'),
    saleCosts: createSupabaseRepository<SaleCost>(client, 'sale_costs'),
    commercialDays: createSupabaseRepository<CommercialDay>(client, 'commercial_days'),

    monthlyTargets: createSupabaseRepository<MonthlyTarget>(client, 'monthly_targets'),
    goals: createSupabaseRepository<Goal>(client, 'goals'),
    goalContributions: createSupabaseRepository<GoalContribution>(client, 'goal_contributions'),
    purchaseGoals: createSupabaseRepository<PurchaseGoal>(client, 'purchase_goals'),

    boards: createSupabaseRepository<Board>(client, 'boards'),
    boardColumns: createSupabaseRepository<BoardColumn>(client, 'board_columns'),
    cards: createSupabaseRepository<Card>(client, 'cards'),

    activity: createSupabaseRepository<ActivityLog>(client, 'activity_log'),
    customizations: createSupabaseRepository<Customization>(client, 'customizations'),
  }
}
