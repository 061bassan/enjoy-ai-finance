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
  Id,
  Lead,
  LeadActivity,
  LeadStage,
  MarketingEntry,
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

/** Dados coletados no cadastro. Validados em `@/lib/validators` antes de chegar aqui. */
export interface SignUpInput {
  name: string
  email: string
  password: string
  cpf: string
  birthDate: string
  phone: string
  /** Cargo que a pessoa está pedindo. Só vira efetivo depois da aprovação. */
  requestedRole: Role
}

/** Autenticação. No modo local, PBKDF2 sobre o IndexedDB; no Supabase, o Auth real. */
export interface AuthGateway {
  getSession(): Promise<Session | null>
  signIn(email: string, password: string): Promise<Session>

  /**
   * Cria a conta e entra já com a sessão pendente.
   *
   * Entrar antes da aprovação é intencional: a pessoa precisa ver que o
   * pedido chegou. A alternativa — recusar o login até alguém aprovar — deixa
   * quem se cadastrou sem nenhum retorno, e ela tenta de novo achando que
   * deu erro.
   *
   * O primeiro cadastro de um workspace vazio entra aprovado como dono (ver
   * `isFirstMember` em `@/domain/membership`): sem isso não existiria ninguém
   * para aprovar o primeiro pedido.
   */
  signUp(input: SignUpInput): Promise<Session>

  /**
   * Define a senha de um perfil que ainda não tem uma.
   *
   * Existe para bases criadas antes do login com senha: os perfis daquela
   * fase não têm `passwordHash`, e trancá-los para fora apagaria dados reais
   * já lançados. A tela de entrada detecta o caso e pede a senha nova.
   */
  setInitialPassword(email: string, password: string): Promise<Session>

  /**
   * E-mails de contas sem senha definida.
   *
   * Opcional porque só o provider local tem esse problema: no Supabase toda
   * conta nasce do Auth e sempre tem credencial. Existe para a tela de
   * entrada conseguir dizer **qual** conta precisa de senha — quem abriu o app
   * há meses não lembra o e-mail que o sistema gerou sozinho, e sem esta
   * lista ficaria trancado para fora dos próprios dados.
   */
  listAccountsWithoutPassword?(): Promise<string[]>

  /**
   * Dispara o e-mail de redefinição de senha.
   *
   * Opcional porque só existe onde há servidor de e-mail: no Supabase. No modo
   * local não há para onde mandar o link (a senha é PBKDF2 no IndexedDB do
   * próprio dispositivo), então o método fica ausente e a tela esconde o
   * caminho. Nunca revela se o e-mail tem conta — devolver sucesso sempre é o
   * que impede usar a tela para descobrir quem está cadastrado.
   */
  requestPasswordReset?(email: string): Promise<void>

  /**
   * Fecha a redefinição: usa os tokens do link recebido por e-mail para abrir
   * a sessão de recuperação, grava a senha nova e devolve a sessão já ativa.
   * Par do `requestPasswordReset` — existe só no Supabase.
   */
  completePasswordReset?(input: {
    accessToken: string
    refreshToken: string
    newPassword: string
  }): Promise<Session>

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

  /**
   * Altera uma venda já registrada — e, se pedido, refaz os títulos dela.
   *
   * Existe porque criar sem poder corrigir não é um fluxo: a venda é digitada
   * às pressas no fim da reunião, e o valor, o closer ou o modelo saem
   * errados com frequência. Sem edição, o único caminho era apagar e lançar
   * de novo, o que descarta o histórico e os títulos já baixados.
   *
   * `regenerateReceivables` é opt-in porque refazer títulos é destrutivo: os
   * antigos deixam de existir. A operação **recusa** refazer quando algum
   * título da venda já tem baixa — o dinheiro que entrou no caixa não pode
   * ficar órfão de título. Nesse caso, desfaça as baixas primeiro.
   */
  updateSaleWithReceivables(input: {
    saleId: Id
    patch: PatchEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    regenerateReceivables: boolean
    firstDueDate?: string
  }): Promise<{ sale: Sale; bills: Bill[] }>

  /**
   * Apaga a venda, os custos e os títulos que ela gerou.
   *
   * Recusa quando há título com baixa registrada: apagar deixaria a entrada
   * no caixa sem origem, e o caixa é a única coisa no sistema que não pode
   * mentir. Um lead convertido volta para negociação — a invariante "lead
   * ganho tem venda atrás" continua valendo depois da exclusão.
   */
  deleteSale(input: { saleId: Id; actorId: Id }): Promise<void>

  /**
   * Apaga um lançamento, respeitando o que ele representa.
   *
   * Transferência apaga as duas pernas juntas — deixar uma sozinha inventaria
   * receita numa conta e despesa em nenhuma. Transação vinda de baixa de
   * título é recusada: o caminho é estornar a baixa.
   */
  deleteTransaction(transactionId: Id): Promise<void>

  /**
   * Materializa os títulos de uma regra recorrente até a data limite.
   *
   * `actorId` vira o `createdBy` dos títulos. No Postgres `bills.created_by`
   * referencia `profiles(id)` — sem um perfil de verdade a inserção é recusada
   * (e foi exatamente isso que deixou "A pagar" vazio em produção).
   */
  generateBillsFromRule(ruleId: Id, throughDate: string, actorId: Id): Promise<Bill[]>

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

  /**
   * Libera um pedido de acesso: grava o cargo concedido e ativa o vínculo.
   *
   * Atômica porque decidir é uma coisa só — status, cargo, quem decidiu e
   * quando precisam mudar juntos, senão sobra um membro ativo sem registro de
   * quem o liberou.
   */
  approveMember(input: {
    memberId: Id
    grantedRole: Role
    actorId: Id
    note?: string
  }): Promise<WorkspaceMember>

  /**
   * Recusa o pedido. **Não apaga a linha**: o pedido, o cargo pretendido, a
   * decisão e o motivo continuam no banco, que foi o pedido explícito —
   * "independente de aceitar ou recusar as informações devem ser armazenadas".
   */
  rejectMember(input: { memberId: Id; actorId: Id; note?: string }): Promise<WorkspaceMember>

  /**
   * Move o lead de etapa e registra a mudança na linha do tempo.
   *
   * O histórico é gravado pelo sistema justamente para não depender de
   * alguém lembrar de anotar — sem isso, "lead parado há 10 dias" seria
   * indistinguível de "lead que ninguém registrou".
   */
  moveLeadStage(input: {
    leadId: Id
    toStage: LeadStage
    actorId: Id
    note?: string
    lostReason?: string
  }): Promise<Lead>

  /**
   * Converte um lead ganho em venda.
   *
   * Cria (ou reaproveita) o cliente, cria a venda com os títulos a receber e
   * amarra tudo de volta ao lead. É o ponto em que o funil comercial vira
   * dinheiro no financeiro — e é o que faz a taxa de conversão do funil ser
   * apurada em vez de digitada.
   */
  convertLeadToSale(input: {
    leadId: Id
    sale: NewEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    generateReceivables: boolean
    firstDueDate?: string
    actorId: Id
  }): Promise<{ lead: Lead; sale: Sale; client: Client; bills: Bill[] }>

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
  leads: Repository<Lead>
  leadActivities: Repository<LeadActivity>
  sales: Repository<Sale>
  saleCosts: Repository<SaleCost>
  commercialDays: Repository<CommercialDay>
  /** Reuniões com leads — a ponte entre o tráfego e a venda. */
  commercialMeetings: Repository<CommercialMeeting>
  /** Investimento de marketing, uma linha por mês e canal. */
  marketingEntries: Repository<MarketingEntry>

  monthlyTargets: Repository<MonthlyTarget>
  goals: Repository<Goal>
  goalContributions: Repository<GoalContribution>
  purchaseGoals: Repository<PurchaseGoal>

  boards: Repository<Board>
  boardColumns: Repository<BoardColumn>
  cards: Repository<Card>

  activity: Repository<ActivityLog>

  /** Aparência e visibilidade escolhidas pelo sócio. Uma linha por workspace. */
  customizations: Repository<Customization>

  /** Popula o workspace de demonstração. Só existe no provider local. */
  seedIfEmpty?(): Promise<void>
  /** Apaga tudo — usado pelo botão "recomeçar" nas configurações. */
  reset?(): Promise<void>
}
