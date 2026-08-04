/**
 * Rótulos em pt-BR de todos os enums do domínio.
 *
 * A UI nunca escreve o texto de um enum na mão — sempre lê daqui. Assim um
 * status renomeado muda em um lugar só, e nenhuma tela fica com o rótulo
 * antigo.
 */

import type {
  AccountType,
  BillDirection,
  BillStatus,
  CategoryKind,
  ClientStatus,
  CostCenter,
  Frequency,
  GoalStatus,
  GoalType,
  LeadActivityKind,
  LeadSource,
  LeadStage,
  MemberStatus,
  PaymentMethod,
  PurchaseStatus,
  Role,
  SaleModel,
  SaleStatus,
  TransactionKind,
  TransactionStatus,
} from './types'

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  investment: 'Investimento',
}

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  income: 'Receita',
  expense: 'Despesa',
}

export const COST_CENTER_LABEL: Record<CostCenter, string> = {
  marketing: 'Marketing',
  equipe: 'Equipe',
  comercial: 'Comercial',
  operacional: 'Operacional',
  producao: 'Produção',
  infraestrutura: 'Infraestrutura',
  tecnologia: 'Tecnologia',
  impostos: 'Impostos',
  administrativo: 'Administrativo',
  financeiro: 'Financeiro',
}

export const COST_CENTERS = Object.keys(COST_CENTER_LABEL) as CostCenter[]

export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
}

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  pending: 'Pendente',
  cleared: 'Compensada',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  transfer: 'Transferência',
  cash: 'Dinheiro',
  other: 'Outro',
}

export const BILL_DIRECTION_LABEL: Record<BillDirection, string> = {
  receivable: 'A receber',
  payable: 'A pagar',
}

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  open: 'Em aberto',
  partial: 'Parcial',
  paid: 'Quitado',
  canceled: 'Cancelado',
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
}

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: 'Lead',
  active: 'Ativo',
  paused: 'Pausado',
  churned: 'Churn',
}

export const SALE_MODEL_LABEL: Record<SaleModel, string> = {
  mrr: 'MRR',
  setup: 'Setup',
  projeto: 'Projeto',
  consultoria: 'Consultoria',
  servico: 'Serviço',
  tcv: 'TCV',
}

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  indicacao: 'Indicação',
  trafego_pago: 'Tráfego pago',
  organico: 'Orgânico',
  evento: 'Evento',
  parceria: 'Parceria',
  outro: 'Outro',
}

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  em_implantacao: 'Em implantação',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
}

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  savings: 'Acúmulo',
  reserve: 'Reserva',
  debt_payoff: 'Quitação de dívida',
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Ativa',
  reached: 'Atingida',
  archived: 'Arquivada',
}

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  wishlist: 'Desejo',
  saving: 'Juntando',
  approved: 'Aprovada',
  bought: 'Comprada',
  dropped: 'Descartada',
}

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  reuniao: 'Reunião marcada',
  proposta: 'Proposta enviada',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

/** Explica o que caracteriza cada etapa — vira legenda nas colunas do quadro. */
export const LEAD_STAGE_DESCRIPTION: Record<LeadStage, string> = {
  novo: 'Chegou e ainda não foi abordado.',
  contato: 'Já houve conversa, sem reunião marcada.',
  reuniao: 'Reunião agendada ou realizada.',
  proposta: 'Proposta comercial enviada.',
  negociacao: 'Discutindo valor, escopo ou contrato.',
  ganho: 'Fechou. Virou venda e cliente.',
  perdido: 'Não avançou. O motivo fica registrado.',
}

export const LEAD_ACTIVITY_KIND_LABEL: Record<LeadActivityKind, string> = {
  nota: 'Anotação',
  ligacao: 'Ligação',
  mensagem: 'Mensagem',
  email: 'E-mail',
  reuniao: 'Reunião',
  proposta: 'Proposta',
  mudanca_etapa: 'Mudança de etapa',
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  pending: 'Aguardando liberação',
  active: 'Ativo',
  rejected: 'Recusado',
  invited: 'Convidado',
  suspended: 'Suspenso',
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  finance: 'Financeiro',
  sales: 'Comercial',
  viewer: 'Visitante',
}

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Faz tudo, inclusive apagar o espaço da empresa.',
  admin: 'Faz tudo no dia a dia e controla quem entra na equipe.',
  finance: 'Cuida de todo o dinheiro. Não mexe na equipe.',
  sales: 'Lança as próprias vendas e o dia a dia comercial. Não vê os custos da empresa.',
  viewer: 'Só olha. Não altera nada.',
}

export const PRIORITY_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Urgente',
  2: 'Alta',
  3: 'Média',
  4: 'Baixa',
  5: 'Algum dia',
}

/** Helper para montar as opções de um <Select> a partir de um Record de rótulos. */
export function optionsFrom<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))
}
