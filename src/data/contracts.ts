/**
 * A fronteira entre a aplicação e onde os dados vivem.
 *
 * Nenhum arquivo em `src/features/`, `src/app/` ou `src/components/` importa
 * Dexie ou supabase-js. Todos falam com estas interfaces. Trocar o provider
 * (Fase 9) é implementar `DataProvider` de novo — nenhuma tela muda.
 *
 * Por isso todo método é `async` mesmo quando a implementação local poderia
 * ser síncrona: a assinatura precisa ser a mesma dos dois lados.
 */

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
  Id,
  MonthlyTarget,
  Profile,
  PurchaseGoal,
  RecurringRule,
  Role,
  Sale,
  SaleCost,
  Session,
  Transaction,
  Workspace,
  WorkspaceMember,
} from './types'

/** Campos gerados pela camada de dados — quem cria não os informa. */
export type NewEntity<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
export type PatchEntity<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'workspaceId'>>

/** Filtro genérico aplicado no `list` de qualquer coleção escopada. */
export interface ListQuery {
  /** Intervalo aplicado ao campo de data natural da entidade. */
  from?: string
  to?: string
  /** Campo de ordenação. Padrão: o campo de data da entidade, decrescente. */
  orderBy?: string
  direction?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * CRUD de uma coleção dentro de um workspace.
 * `workspaceId` nunca é opcional: não existe leitura fora de escopo.
 */
export interface Repository<T> {
  list(workspaceId: Id, query?: ListQuery): Promise<T[]>
  get(id: Id): Promise<T | null>
  create(data: NewEntity<T>): Promise<T>
  update(id: Id, patch: PatchEntity<T>): Promise<T>
  remove(id: Id): Promise<void>
  bulkCreate(items: NewEntity<T>[]): Promise<T[]>
  /** Consulta livre por igualdade de campos — usada em vínculos (saleId, billId...). */
  findBy(workspaceId: Id, where: Partial<Record<keyof T, unknown>>): Promise<T[]>
}

/** Autenticação. No modo local é uma sessão fake; no Supabase, o Auth real. */
export interface AuthGateway {
  getSession(): Promise<Session | null>
  signIn(email: string, password: string): Promise<Session>
  /**
   * Entra assumindo um cargo específico.
   *
   * Existe porque o MVP tem um único usuário e precisamos conseguir ver o
   * produto pelos olhos de cada cargo antes de convidar a equipe de verdade.
   * Não é um truque de sessão: o cargo é gravado na tabela de membros, então
   * o comportamento é idêntico ao de alguém que foi convidado com esse cargo.
   *
   * Quando houver equipe real, esta função sai e o cargo passa a vir só do
   * convite — que é como o Supabase vai tratar na Fase 9.
   */
  signInAs(email: string, role: Role): Promise<Session>
  signOut(): Promise<void>
  /** Troca o workspace ativo da sessão, revalidando o papel do usuário. */
  switchWorkspace(workspaceId: Id): Promise<Session>
  onAuthChange(callback: (session: Session | null) => void): () => void
  /** Lista os workspaces a que o usuário atual pertence. */
  listMyWorkspaces(): Promise<{ workspace: Workspace; role: Role }[]>
}

/**
 * Operações que tocam mais de uma coleção e precisam ser atômicas.
 *
 * Ficam aqui, e não em `@/domain`, porque escrevem. O domínio só calcula.
 * Cada provider implementa com a transação nativa (Dexie transaction hoje,
 * função RPC no Postgres depois) — a semântica precisa ser idêntica.
 */
export interface Operations {
  /**
   * Baixa (total ou parcial) de um título: cria o `BillPayment`, gera a
   * `Transaction` de caixa e atualiza o status do `Bill`.
   * É o coração do "previsto vira realizado".
   */
  settleBill(input: {
    billId: Id
    amountCents: number
    date: string
    accountId: Id
    actorId: Id
    notes?: string
  }): Promise<{ bill: Bill; payment: BillPayment; transaction: Transaction }>

  /** Desfaz uma baixa: remove a transação, o pagamento e reabre o título. */
  unsettleBillPayment(paymentId: Id): Promise<Bill>

  /**
   * Cria uma venda e, junto, os títulos a receber correspondentes
   * (setup + parcelas de MRR conforme o contrato).
   */
  createSaleWithReceivables(input: {
    sale: NewEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    /** Gera os títulos automaticamente a partir do modelo e das parcelas. */
    generateReceivables: boolean
    firstDueDate?: string
  }): Promise<{ sale: Sale; bills: Bill[] }>

  /** Materializa os títulos de uma regra recorrente até a data limite. */
  generateBillsFromRule(ruleId: Id, throughDate: string): Promise<Bill[]>

  /** Move um card e executa a ação da coluna de destino, se houver. */
  moveCard(input: {
    cardId: Id
    toColumnId: Id
    position: number
    actorId: Id
  }): Promise<{ card: Card; sideEffect?: 'settled_bill' | 'sale_paid' }>

  /** Transferência entre contas: duas transações amarradas pelo mesmo grupo. */
  createTransfer(input: {
    workspaceId: Id
    fromAccountId: Id
    toAccountId: Id
    amountCents: number
    date: string
    description: string
    actorId: Id
  }): Promise<Transaction[]>

  /** Exporta todo o workspace como JSON — backup e futura migração. */
  exportWorkspace(workspaceId: Id): Promise<Record<string, unknown>>
  importWorkspace(payload: Record<string, unknown>): Promise<void>
}

/** O provider completo. `src/data/index.ts` escolhe qual instanciar. */
export interface DataProvider {
  readonly kind: 'local' | 'supabase'

  auth: AuthGateway
  ops: Operations

  profiles: Repository<Profile>
  workspaces: Repository<Workspace>
  members: Repository<WorkspaceMember>

  accounts: Repository<Account>
  categories: Repository<Category>
  transactions: Repository<Transaction>
  bills: Repository<Bill>
  billPayments: Repository<BillPayment>
  recurringRules: Repository<RecurringRule>

  clients: Repository<Client>
  sales: Repository<Sale>
  saleCosts: Repository<SaleCost>
  commercialDays: Repository<CommercialDay>

  monthlyTargets: Repository<MonthlyTarget>
  goals: Repository<Goal>
  goalContributions: Repository<GoalContribution>
  purchaseGoals: Repository<PurchaseGoal>

  boards: Repository<Board>
  boardColumns: Repository<BoardColumn>
  cards: Repository<Card>

  activity: Repository<ActivityLog>

  /** Popula o workspace de demonstração. Só existe no provider local. */
  seedIfEmpty?(): Promise<void>
  /** Apaga tudo — usado pelo botão "recomeçar" nas configurações. */
  reset?(): Promise<void>
}
