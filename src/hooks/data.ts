import { useMemo } from 'react'
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

/**
 * Converter um lead mexe no funil e no financeiro ao mesmo tempo.
 *
 * A lista é maior do que parece necessário de propósito: a conversão cria
 * cliente, venda e títulos numa tacada só, e esquecer uma coleção aqui faria
 * a tela de Leads mostrar o lead como ganho enquanto a de Vendas ainda não
 * conhece a venda — o tipo de inconsistência que destrói a confiança no
 * número.
 */
const LEAD_CONVERSION_COLLECTIONS = ['leads', 'leadActivities', 'clients', ...FINANCIAL_COLLECTIONS]

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
export const usePurchaseGoals = () =>
  useCollection<PurchaseGoal>('purchaseGoals', data.purchaseGoals)
export const useMonthlyTargets = () =>
  useCollection<MonthlyTarget>('monthlyTargets', data.monthlyTargets)
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

/**
 * Investimento de marketing.
 *
 * Sem filtro de período por padrão, e de propósito: a linha de agosto tem data
 * "2026-08-01", e um período de 05/08 a 20/08 a descartaria — sumindo com a
 * verba do próprio mês que se está olhando. O recorte é feito no domínio, por
 * mês (`entriesInPeriod`).
 */
export const useMarketingEntries = () =>
  useCollection<MarketingEntry>('marketingEntries', data.marketingEntries)

/**
 * Leads.
 *
 * Sem filtro de período por padrão: um lead aberto há três meses continua
 * sendo trabalho de hoje, e sumir do quadro por causa do seletor de período
 * seria a forma mais rápida de perder negócio. O recorte por período fica
 * para as métricas, que o fazem explicitamente com `leadsInPeriod`.
 */
export const useLeads = (query?: ListQuery) => useCollection<Lead>('leads', data.leads, query)

export const useLeadActivities = () =>
  useCollection<LeadActivity>('leadActivities', data.leadActivities)

/** Perfis não são escopados — a lista inteira é pequena e cabe em cache. */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => data.profiles.list('', {}),
  })
}

/**
 * Mapa id → perfil, para resolver nomes de closer, SDR e responsável.
 *
 * Memoizado porque o mapa é usado como dependência de `useMemo` nas telas —
 * uma instância nova a cada render invalidava a memoização de quem dependia
 * dele, e a tabela de vendas remontava as colunas a cada tecla digitada na
 * busca.
 */
export function useProfileMap() {
  const { data: profiles = [] } = useProfiles()
  return useMemo(
    () => new Map<Id, Profile>(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  )
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

/**
 * Alterar uma venda mexe nos mesmos lugares que criá-la: os títulos podem ser
 * refeitos e o cliente pode mudar de nome. A lista de invalidação é a mesma
 * de propósito — esquecer uma coleção aqui deixaria a tela de títulos
 * mostrando parcelas que não existem mais.
 */
export function useUpdateSale() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.updateSaleWithReceivables>[0]) =>
      data.ops.updateSaleWithReceivables(input),
    onSuccess: () => invalidate([...FINANCIAL_COLLECTIONS, 'clients']),
  })
}

/** Excluir pode devolver um lead para negociação — daí `leads` na lista. */
export function useDeleteSale() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.deleteSale>[0]) => data.ops.deleteSale(input),
    onSuccess: () => invalidate([...LEAD_CONVERSION_COLLECTIONS, 'cards']),
  })
}

/** Exclusão de lançamento com as regras de transferência e baixa aplicadas. */
export function useDeleteTransaction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (transactionId: Id) => data.ops.deleteTransaction(transactionId),
    onSuccess: () => invalidate(['transactions', 'bills', 'billPayments']),
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

export function useMoveLeadStage() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.moveLeadStage>[0]) =>
      data.ops.moveLeadStage(input),
    onSuccess: () => invalidate(['leads', 'leadActivities']),
  })
}

export function useConvertLeadToSale() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.convertLeadToSale>[0]) =>
      data.ops.convertLeadToSale(input),
    onSuccess: () => invalidate(LEAD_CONVERSION_COLLECTIONS),
  })
}

export function useApproveMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.approveMember>[0]) =>
      data.ops.approveMember(input),
    onSuccess: () => invalidate(['members', 'profiles']),
  })
}

export function useRejectMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Parameters<typeof data.ops.rejectMember>[0]) =>
      data.ops.rejectMember(input),
    onSuccess: () => invalidate(['members', 'profiles']),
  })
}

export function useGenerateBillsFromRule() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      ruleId,
      throughDate,
      actorId,
    }: {
      ruleId: Id
      throughDate: string
      actorId: Id
    }) => data.ops.generateBillsFromRule(ruleId, throughDate, actorId),
    onSuccess: () => invalidate(['bills', 'recurringRules']),
  })
}
