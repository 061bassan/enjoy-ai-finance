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
  MarketingChannel,
  MeetingStatus,
  MemberStatus,
  PaymentMethod,
  PurchaseStatus,
  Role,
  SaleModel,
  SaleProduct,
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

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  no_show: 'No-show',
  proposta: 'Proposta em análise',
  fechada: 'Fechada',
  perdida: 'Perdida',
}

export const SALE_PRODUCT_LABEL: Record<SaleProduct, string> = {
  enjoy_start: 'Enjoy Start',
  // Antigo "PEAP".
  enjoy_pro: 'Enjoy Pro',
  enjoy_growth: 'Enjoy Growth',
  enjoy_rec: 'Enjoy Rec',
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

export const MARKETING_CHANNEL_LABEL: Record<MarketingChannel, string> = {
  geral: 'Geral',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  linkedin_ads: 'LinkedIn Ads',
  youtube_ads: 'YouTube Ads',
  influenciador: 'Influenciadores',
  email: 'E-mail marketing',
  organico: 'Orgânico',
  outro: 'Outro',
}

export const MARKETING_CHANNELS = Object.keys(MARKETING_CHANNEL_LABEL) as MarketingChannel[]

/** Explica o que cabe em cada canal — vira legenda no formulário. */
export const MARKETING_CHANNEL_DESCRIPTION: Record<MarketingChannel, string> = {
  geral: 'A verba do mês inteira, sem separar por plataforma.',
  meta_ads: 'Facebook e Instagram.',
  google_ads: 'Busca, display e performance max.',
  tiktok_ads: 'Anúncios no TikTok.',
  linkedin_ads: 'Anúncios no LinkedIn.',
  youtube_ads: 'Anúncios em vídeo no YouTube.',
  influenciador: 'Permutas e contratos com criadores.',
  email: 'Disparos, automação e listas.',
  organico: 'Conteúdo sem mídia paga — o custo aqui é de produção.',
  outro: 'Qualquer canal fora da lista.',
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
  owner: 'Desenvolvedor',
  ceo: 'CEO',
  socio: 'Sócio',
  admin: 'Administrador',
  finance: 'Financeiro',
  sales: 'Comercial',
  viewer: 'Visitante',
}

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Faz tudo, inclusive apagar o espaço da empresa. É o primeiro acesso e libera Sócios e CEOs.',
  ceo: 'Comanda o negócio e libera quem entra na equipe. Não apaga o espaço.',
  socio: 'Sócio do negócio. Mesmos poderes do CEO: opera tudo e libera novos acessos.',
  admin: 'Faz tudo no dia a dia e nas configurações. Não libera novos acessos.',
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

// ---------------------------------------------------------------------------
// Etiquetas editáveis
// ---------------------------------------------------------------------------

/**
 * Grupos de etiqueta que o time pode renomear na própria tela ("Perdida" →
 * "Desistente").
 *
 * Só o TEXTO muda: o valor gravado no banco (`perdida`) continua o mesmo, então
 * métrica, filtro e relatório que dependem do valor não percebem a troca. É o
 * que torna seguro deixar qualquer administrador renomear.
 *
 * Os mapas acima são sobrescritos no lugar por `applyLabelOverrides` — assim
 * TODA tela que já usa `MEETING_STATUS_LABEL[...]` (lista, filtro, relatório,
 * CSV, descrição de título) passa a mostrar o nome novo sem ser reescrita.
 */
export const EDITABLE_LABEL_GROUPS = {
  meetingStatus: { title: 'Status da reunião', labels: MEETING_STATUS_LABEL },
  saleProduct: { title: 'Produtos', labels: SALE_PRODUCT_LABEL },
  saleStatus: { title: 'Status da venda', labels: SALE_STATUS_LABEL },
  leadStage: { title: 'Etapas do lead', labels: LEAD_STAGE_LABEL },
  leadSource: { title: 'Origem do lead', labels: LEAD_SOURCE_LABEL },
} as const satisfies Record<string, { title: string; labels: Record<string, string> }>

export type LabelGroup = keyof typeof EDITABLE_LABEL_GROUPS
/** Grupo → valor → texto escolhido pelo time. Só guarda o que difere do padrão. */
export type LabelOverrides = Partial<Record<LabelGroup, Record<string, string>>>

/** Os textos de fábrica, copiados antes de qualquer sobrescrita. */
const DEFAULT_LABELS: Record<LabelGroup, Record<string, string>> = Object.fromEntries(
  Object.entries(EDITABLE_LABEL_GROUPS).map(([group, { labels }]) => [group, { ...labels }]),
) as unknown as Record<LabelGroup, Record<string, string>>

export function defaultLabel(group: LabelGroup, value: string): string {
  return DEFAULT_LABELS[group][value] ?? value
}

/**
 * Volta todos os mapas ao padrão e aplica as etiquetas do time por cima.
 * Idempotente: chamar duas vezes com o mesmo mapa dá o mesmo resultado, e um
 * valor removido do mapa volta ao texto de fábrica.
 */
export function applyLabelOverrides(overrides: LabelOverrides | null | undefined) {
  for (const group of Object.keys(EDITABLE_LABEL_GROUPS) as LabelGroup[]) {
    const target = EDITABLE_LABEL_GROUPS[group].labels as Record<string, string>
    const custom = overrides?.[group] ?? {}
    for (const [value, text] of Object.entries(DEFAULT_LABELS[group])) {
      const chosen = custom[value]?.trim()
      target[value] = chosen ? chosen : text
    }
  }
}
