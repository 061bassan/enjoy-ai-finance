/**
 * Modelo de dados do Enjoy AI Finance.
 *
 * Convenções que valem para TODAS as entidades:
 *
 * 1. Dinheiro é `Cents` (inteiro). Nunca float. Ver `@/lib/money`.
 * 2. Datas de negócio são `IsoDate` ("YYYY-MM-DD"). Timestamps de sistema
 *    são ISO completo. Ver `@/lib/date`.
 * 3. Toda entidade de negócio carrega `workspaceId` — é a chave de
 *    isolamento entre a Enjoy e os workspaces pessoais, e vira a coluna
 *    usada pelas políticas RLS quando migrarmos para o Supabase.
 * 4. Nada de valor derivado persistido. Saldo, MRR, CAC, progresso de meta
 *    e afins são SEMPRE calculados a partir dos fatos em `@/domain`.
 *    É isso que faz a "automação" pedida funcionar sem job nenhum: criar
 *    uma venda já muda todos os indicadores, porque nenhum deles é cópia.
 */

import type { Cents } from '@/lib/money'
import type { IsoDate } from '@/lib/date'

export type Id = string
export type Timestamp = string

/** Campos que toda linha carrega. */
export interface BaseEntity {
  id: Id
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ScopedEntity extends BaseEntity {
  workspaceId: Id
}

// ---------------------------------------------------------------------------
// Identidade, workspaces e papéis
// ---------------------------------------------------------------------------

export interface Profile extends BaseEntity {
  name: string
  email: string
  avatarUrl?: string | null
  /** Usado para atribuir vendas quando a pessoa também é closer/SDR. */
  jobTitle?: string | null
}

export type WorkspaceType = 'team' | 'personal'

export interface Workspace extends BaseEntity {
  name: string
  type: WorkspaceType
  ownerId: Id
  currency: string
  /** Slug curto exibido no seletor. */
  shortName: string
}

/**
 * Papéis, do mais para o menos poderoso:
 *
 * - `owner`   sócio-fundador. Tudo, incluindo excluir o workspace.
 * - `admin`   acesso total aos dados do workspace e à gestão de membros.
 *             É o papel pedido para "visualizar e gerenciar todos os dados
 *             de um único workspace, se for autorizado".
 * - `finance` opera todo o financeiro, sem mexer em membros nem apagar o
 *             workspace.
 * - `sales`   closer/SDR: registra e edita as PRÓPRIAS vendas e o próprio
 *             diário comercial. Não enxerga custos da empresa nem o
 *             dashboard executivo.
 * - `viewer`  somente leitura.
 */
export type Role = 'owner' | 'admin' | 'finance' | 'sales' | 'viewer'

export interface WorkspaceMember extends BaseEntity {
  workspaceId: Id
  userId: Id
  role: Role
  invitedBy?: Id | null
  status: 'active' | 'invited' | 'suspended'
}

// ---------------------------------------------------------------------------
// Estrutura financeira
// ---------------------------------------------------------------------------

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit_card' | 'investment'

export interface Account extends ScopedEntity {
  name: string
  type: AccountType
  institution?: string | null
  openingBalanceCents: Cents
  archived: boolean
}

export type CategoryKind = 'income' | 'expense'

/**
 * Centros de custo são um conjunto fechado — é o que permite o relatório
 * "% por centro de custo" comparar meses sem depender de texto livre.
 */
export type CostCenter =
  | 'marketing'
  | 'equipe'
  | 'comercial'
  | 'operacional'
  | 'producao'
  | 'infraestrutura'
  | 'tecnologia'
  | 'impostos'
  | 'administrativo'
  | 'financeiro'

export interface Category extends ScopedEntity {
  name: string
  kind: CategoryKind
  costCenter: CostCenter | null
  parentId?: Id | null
  /** Marca as categorias de receita que compõem MRR (mensalidades). */
  isRecurringRevenue?: boolean
  archived: boolean
}

export type TransactionKind = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'pending' | 'cleared'
export type PaymentMethod =
  | 'pix'
  | 'boleto'
  | 'credit_card'
  | 'debit_card'
  | 'transfer'
  | 'cash'
  | 'other'

/**
 * Movimento efetivo de caixa — o "realizado". Sempre positivo em
 * `amountCents`; a direção vem de `kind`.
 */
export interface Transaction extends ScopedEntity {
  accountId: Id
  categoryId: Id | null
  kind: TransactionKind
  amountCents: Cents
  date: IsoDate
  description: string
  status: TransactionStatus
  paymentMethod: PaymentMethod | null
  costCenter: CostCenter | null
  tags: string[]
  notes?: string | null
  createdBy: Id
  /** Amarra as duas pernas de uma transferência entre contas. */
  transferGroupId?: Id | null
  /** Preenchido quando a transação nasceu da liquidação de um título. */
  billId?: Id | null
  /** Preenchido quando nasceu de uma regra recorrente. */
  recurringRuleId?: Id | null
  /** Preenchido quando é receita de uma venda ou custo atribuído a ela. */
  saleId?: Id | null
  clientId?: Id | null
}

// ---------------------------------------------------------------------------
// Títulos a pagar e a receber — a ponte entre previsto e realizado
// ---------------------------------------------------------------------------

export type BillDirection = 'receivable' | 'payable'
export type BillStatus = 'open' | 'partial' | 'paid' | 'canceled'

/**
 * Um título é uma obrigação com data de vencimento: uma mensalidade a
 * receber, uma nota de fornecedor, um custo futuro programado.
 *
 * Contas a Receber, Contas a Pagar e "custos futuros" são a MESMA entidade
 * vista por filtros diferentes. Isso evita triplicar a lógica de atraso,
 * baixa parcial e parcelamento.
 *
 * `status` nunca guarda "atrasado": atraso é função de `dueDate` vs. hoje e
 * é calculado em `@/domain/bills`. Guardar tornaria o dado obsoleto todo dia
 * à meia-noite.
 */
export interface Bill extends ScopedEntity {
  direction: BillDirection
  /** Nome do cliente (a receber) ou do fornecedor (a pagar). */
  partyName: string
  clientId?: Id | null
  description: string
  amountCents: Cents
  dueDate: IsoDate
  issueDate?: IsoDate | null
  status: BillStatus
  categoryId: Id | null
  costCenter: CostCenter | null
  accountId?: Id | null
  /** Parcela N de M. `null` quando o título é avulso. */
  installmentNumber?: number | null
  installmentTotal?: number | null
  /** Agrupa todas as parcelas geradas do mesmo lançamento. */
  installmentGroupId?: Id | null
  recurringRuleId?: Id | null
  saleId?: Id | null
  notes?: string | null
  createdBy: Id
}

/** Baixa (total ou parcial) de um título. Gera uma transação de caixa. */
export interface BillPayment extends ScopedEntity {
  billId: Id
  amountCents: Cents
  date: IsoDate
  accountId: Id
  transactionId?: Id | null
  notes?: string | null
  createdBy: Id
}

// ---------------------------------------------------------------------------
// Custos recorrentes — o "custo de operação mensal"
// ---------------------------------------------------------------------------

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

/**
 * Regra que se repete no tempo: salários, aluguel, softwares, mensalidade
 * de cliente. O custo de operação mensal é a soma das regras ativas de
 * despesa, com cada frequência normalizada para o mês.
 */
export interface RecurringRule extends ScopedEntity {
  name: string
  kind: CategoryKind
  amountCents: Cents
  categoryId: Id | null
  costCenter: CostCenter | null
  accountId: Id | null
  clientId?: Id | null
  frequency: Frequency
  /** A cada quantos períodos. 1 = todo mês, 2 = a cada dois meses. */
  interval: number
  /** Dia do vencimento (1–31). Meses curtos usam o último dia. */
  dayOfMonth?: number | null
  startDate: IsoDate
  endDate?: IsoDate | null
  /** Gera o título automaticamente na virada do período. */
  autoGenerate: boolean
  active: boolean
  notes?: string | null
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export type ClientStatus = 'lead' | 'active' | 'paused' | 'churned'

export interface Client extends ScopedEntity {
  name: string
  company?: string | null
  email?: string | null
  phone?: string | null
  status: ClientStatus
  /** Origem do lead que virou cliente — alimenta receita por canal. */
  source?: LeadSource | null
  startDate?: IsoDate | null
  churnDate?: IsoDate | null
  ownerId?: Id | null
  notes?: string | null
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

export type SaleModel = 'mrr' | 'setup' | 'projeto' | 'consultoria' | 'servico' | 'tcv'

export type LeadSource =
  | 'inbound'
  | 'outbound'
  | 'indicacao'
  | 'trafego_pago'
  | 'organico'
  | 'evento'
  | 'parceria'
  | 'outro'

export type SaleStatus = 'pendente' | 'pago' | 'em_implantacao' | 'finalizado' | 'cancelado'

/**
 * Uma venda fechada. É o fato que dispara toda a cadeia: gera os títulos a
 * receber, alimenta MRR/TCV, entra no CAC e no forecast — sem nenhum campo
 * denormalizado, porque tudo isso é derivado em `@/domain/sales`.
 */
export interface Sale extends ScopedEntity {
  clientId: Id | null
  /** Redundante com o cliente de propósito: preserva o nome no momento da venda. */
  clientName: string
  company?: string | null
  saleDate: IsoDate
  closerId: Id | null
  sdrId: Id | null
  leadSource: LeadSource | null
  model: SaleModel
  /** Valor total do contrato (TCV). Para MRR puro, é mrr × meses. */
  amountCents: Cents
  /** Parcela recorrente mensal, quando houver. */
  mrrCents: Cents
  /** Valor de implantação/setup cobrado uma vez. */
  setupCents: Cents
  /** Duração do contrato em meses — usada em TCV e LTV. */
  contractMonths: number | null
  paymentMethod: PaymentMethod | null
  installments: number
  /** Percentuais; o valor em centavos é calculado no domínio. */
  closerCommissionPercent: number
  sdrCommissionPercent: number
  status: SaleStatus
  /** Data em que o lead entrou — permite medir dias até fechar. */
  leadCreatedAt?: IsoDate | null
  notes?: string | null
  createdBy: Id
}

/** Custos atribuídos a uma venda específica — base de CAC individual e ROI. */
export interface SaleCost extends ScopedEntity {
  saleId: Id
  adsCents: Cents
  commissionCents: Cents
  bankFeeCents: Cents
  platformFeeCents: Cents
  operationalCents: Cents
  teamHoursCents: Cents
  freelancersCents: Cents
  productionCents: Cents
  travelCents: Cents
  otherCents: Cents
  notes?: string | null
}

// ---------------------------------------------------------------------------
// Comercial — registro diário
// ---------------------------------------------------------------------------

/**
 * Uma linha por dia (opcionalmente por pessoa). Alimenta o funil e todos os
 * custos por etapa: CPL, custo por call, custo por reunião, CAC.
 */
export interface CommercialDay extends ScopedEntity {
  date: IsoDate
  /** Quando preenchido, o registro é de um closer/SDR específico. */
  ownerId?: Id | null

  leads: number
  calls: number
  meetings: number
  noShows: number
  proposalsSent: number
  proposalsApproved: number
  proposalsRejected: number
  followUps: number
  contractsSent: number
  contractsSigned: number

  adsInvestmentCents: Cents
  sdrInvestmentCents: Cents
  closerInvestmentCents: Cents
  toolsCents: Cents
  crmCents: Cents
  phoneCents: Cents
  internetCents: Cents
  softwareCents: Cents

  notes?: string | null
  createdBy: Id
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

/** Metas mensais do negócio — uma linha por mês por workspace. */
export interface MonthlyTarget extends ScopedEntity {
  /** Primeiro dia do mês, "YYYY-MM-01". */
  month: IsoDate
  revenueCents: Cents
  profitCents: Cents
  salesCount: number
  meetingsCount: number
  proposalsCount: number
  clientsCount: number
  mrrCents: Cents
  setupCents: Cents
  /** Margem alvo em pontos percentuais (ex.: 35 = 35%). */
  marginPercent: number
}

export type GoalType = 'savings' | 'reserve' | 'debt_payoff'
export type GoalStatus = 'active' | 'reached' | 'archived'

/** Meta financeira de acúmulo (reserva de emergência, caixa alvo). */
export interface Goal extends ScopedEntity {
  name: string
  type: GoalType
  targetCents: Cents
  targetDate?: IsoDate | null
  accountId?: Id | null
  status: GoalStatus
  notes?: string | null
}

/** Aporte para uma meta. O progresso é a soma destes — nunca um campo. */
export interface GoalContribution extends ScopedEntity {
  goalId: Id
  amountCents: Cents
  date: IsoDate
  transactionId?: Id | null
  notes?: string | null
}

export type PurchaseStatus = 'wishlist' | 'saving' | 'approved' | 'bought' | 'dropped'

/** Meta de compra: um item que se quer adquirir. */
export interface PurchaseGoal extends ScopedEntity {
  name: string
  description?: string | null
  estimatedCents: Cents
  savedCents: Cents
  /** 1 = mais urgente, 5 = menos. */
  priority: 1 | 2 | 3 | 4 | 5
  targetDate?: IsoDate | null
  productUrl?: string | null
  costCenter: CostCenter | null
  status: PurchaseStatus
  boughtAt?: IsoDate | null
  transactionId?: Id | null
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------

export type BoardTemplate = 'bills' | 'approvals' | 'sales_pipeline' | 'custom'

export interface Board extends ScopedEntity {
  name: string
  template: BoardTemplate
  description?: string | null
}

export interface BoardColumn extends ScopedEntity {
  boardId: Id
  name: string
  position: number
  wipLimit?: number | null
  /**
   * Efeito colateral disparado ao soltar um card nesta coluna.
   * `settle_bill` liquida o título vinculado e gera a transação —
   * é o que faz o kanban ser operação de verdade, não post-it.
   */
  onDropAction?: 'none' | 'settle_bill' | 'mark_sale_paid' | null
}

export type CardLinkType = 'bill' | 'transaction' | 'sale' | 'purchase_goal'

export interface Card extends ScopedEntity {
  boardId: Id
  columnId: Id
  title: string
  description?: string | null
  position: number
  amountCents?: Cents | null
  dueDate?: IsoDate | null
  assigneeId?: Id | null
  labels: string[]
  linkType?: CardLinkType | null
  linkId?: Id | null
  createdBy: Id
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export type ActivityAction = 'create' | 'update' | 'delete' | 'settle' | 'move'

export interface ActivityLog extends ScopedEntity {
  actorId: Id
  entity: string
  entityId: Id
  action: ActivityAction
  summary: string
  diff?: Record<string, { from: unknown; to: unknown }> | null
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export interface Session {
  user: Profile
  workspaceId: Id
  role: Role
}
