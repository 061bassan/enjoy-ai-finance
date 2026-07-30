import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '@/data'
import type { ListQuery, NewEntity, PatchEntity, Repository } from '@/data/contracts'
import type {
  Account,
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
  Id,
  MonthlyTarget,
  Profile,
  PurchaseGoal,
  RecurringRule,
  Sale,
  SaleCost,
  Transaction,
  WorkspaceMember,
} from '@/data/types'
import { useWorkspaceId } from '@/app/session'

/**
 * Hooks de leitura e escrita.
 *
 * Todos seguem o mesmo formato porque o repositório é genérico: uma
 * `queryKey` de `[coleção, workspaceId, filtros]` e invalidação por coleção
 * na escrita. Isso é o que faz a "automação" pedida acontecer sozinha —
 * criar uma venda invalida vendas, títulos e transações, e todo indicador
 * derivado recalcula na renderização seguinte, sem job nem sincronização.
 */

/** Coleções que mudam quando uma venda ou uma baixa acontece. */
const FINANCIAL_COLLECTIONS = ['transactions', 'bills', 'billPayments', 'sales', 'saleCosts']

function useCollection<T>(
  key: string,
  repo: Repository<T>,
  query?: ListQuery,
  options: { enabled?: boolean } = {},
) {
  const workspaceId = useWorkspaceId()
  return useQuery({
    queryKey: [key, workspaceId, query ?? null],
    queryFn: () => repo.list(workspaceId, query),
    enabled: options.enabled ?? true,
  })
}

/** Invalida uma ou mais coleções — usado por toda mutação. */
export function useInvalidate() {
  const queryClient = useQueryClient()
  return (keys: string[]) => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export const useAccounts = () => useCollection<Account>('accounts', data.accounts)
export const useCategories = () => useCollection<Category>('categories', data.categories)
export const useClients = () => useCollection<Client>('clients', data.clients)
export const useMembers = () => useCollection<WorkspaceMember>('members', data.members)
export const useRecurringRules = () =>
  useCollection<RecurringRule>('recurringRules', data.recurringRules)
export const useGoals = () => useCollection<Goal>('goals', data.goals)
export const useGoalContributions = () =>
  useCollection<GoalContribution>('goalContributions', data.goalContributions)
export const usePurchaseGoals = () => useCollection<PurchaseGoal>('purchaseGoals', data.purchaseGoals)
export const useMonthlyTargets = () => useCollection<MonthlyTarget>('monthlyTargets', data.monthlyTargets)
export const useBoards = () => useCollection<Board>('boards', data.boards)
export const useBoardColumns = () => useCollection<BoardColumn>('boardColumns', data.boardColumns)
export const useCards = () => useCollection<Card>('cards', data.cards)
export const useSaleCosts = () => useCollection<SaleCost>('saleCosts', data.saleCosts)
export const useBillPayments = () => useCollection<BillPayment>('billPayments', data.billPayments)

export const useTransactions = (query?: ListQuery) =>
  useCollection<Transaction>('transactions', data.transactions, query)

export const useBills = (query?: ListQuery) => useCollection<Bill>('bills', data.bills, query)

export const useSales = (query?: ListQuery) => useCollection<Sale>('sales', data.sales, query)

export const useCommercialDays = (query?: ListQuery) =>
  useCollection<CommercialDay>('commercialDays', data.commercialDays, query)

/** Perfis não são escopados — a lista inteira é pequena e cabe em cache. */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => data.profiles.list('', {}),
  })
}

/** Mapa id → perfil, para resolver nomes de closer, SDR e responsável. */
export function useProfileMap() {
  const { data: profiles = [] } = useProfiles()
  return new Map<Id, Profile>(profiles.map((profile) => [profile.id, profile]))
}

// ---------------------------------------------------------------------------
// Escritas genéricas
// ---------------------------------------------------------------------------

export function useCreate<T>(key: string, repo: Repository<T>, alsoInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: NewEntity<T>) => repo.create(input),
    onSuccess: () => invalidate([key, ...alsoInvalidate]),
  })
}

export function useUpdate<T>(key: string, repo: Repository<T>, alsoInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, patch }: { id: Id; patch: PatchEntity<T> }) => repo.update(id, patch),
    onSuccess: () => invalidate([key, ...alsoInvalidate]),
  })
}

export function useRemove<T>(key: string, repo: Repository<T>, alsoInvalidate: string[] = []) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: Id) => repo.remove(id),
    onSuccess: () => invalidate([key, ...alsoInvalidate]),
  })
}

// ---------------------------------------------------------------------------
// Operações compostas
// ---------------------------------------------------------------------------

export function useSettleBill() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.settleBill>[0]) => data.ops.settleBill(input),
    onSuccess: () => invalidate(FINANCIAL_COLLECTIONS),
  })
}

export function useUnsettleBillPayment() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (paymentId: Id) => data.ops.unsettleBillPayment(paymentId),
    onSuccess: () => invalidate(FINANCIAL_COLLECTIONS),
  })
}

export function useCreateSale() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.createSaleWithReceivables>[0]) =>
      data.ops.createSaleWithReceivables(input),
    onSuccess: () => invalidate([...FINANCIAL_COLLECTIONS, 'clients']),
  })
}

export function useCreateTransfer() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.createTransfer>[0]) =>
      data.ops.createTransfer(input),
    onSuccess: () => invalidate(['transactions']),
  })
}

export function useMoveCard() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.moveCard>[0]) => data.ops.moveCard(input),
    onSuccess: () => invalidate(['cards', ...FINANCIAL_COLLECTIONS]),
  })
}

export function useGenerateBillsFromRule() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ ruleId, throughDate }: { ruleId: Id; throughDate: string }) =>
      data.ops.generateBillsFromRule(ruleId, throughDate),
    onSuccess: () => invalidate(['bills', 'recurringRules']),
  })
}
