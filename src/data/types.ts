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

  /**
   * Dados pessoais coletados no cadastro.
   *
   * Existem para que quem aprova saiba quem está aprovando: um nome e um
   * e-mail não bastam para decidir se aquela pessoa é mesmo do time. CPF e
   * nascimento são opcionais no tipo porque perfis criados antes desta tela
   * não os têm — a validação de obrigatoriedade mora no cadastro, não aqui.
   */
  cpf?: string | null
  birthDate?: IsoDate | null
  phone?: string | null

  /**
   * Registro PBKDF2 da senha (ver `@/lib/password`). Nunca a senha em claro.
   * `null` em perfis legados, que precisam definir senha no primeiro acesso.
   */
  passwordHash?: string | null
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
 * - `owner`   o fundador técnico — rotulado "Desenvolvedor" na tela (ver
 *             `ROLE_LABEL`). Faz tudo, inclusive excluir o workspace. É o
 *             cargo do primeiro cadastro, e o único no topo da cadeia: libera
 *             o CEO, que então libera o resto.
 * - `ceo`     executivo do negócio. Gerencia membros (libera acessos) e opera
 *             tudo, mas NÃO apaga o workspace. Só o `owner` concede este cargo.
 * - `socio`   sócio do negócio. PAR do `ceo`: mesma patente e mesmas
 *             permissões — também libera acessos. Um não nomeia nem rebaixa o
 *             outro; só o `owner` gerencia sócios e CEOs.
 * - `admin`   operador de confiança: acesso total aos dados e às configurações
 *             do workspace, mas NÃO gerencia membros — liberar acesso é da
 *             alçada de `owner`/`ceo`/`socio`.
 * - `finance` opera todo o financeiro, sem tocar em configurações nem membros.
 * - `sales`   closer/SDR: registra e edita as PRÓPRIAS vendas e o próprio
 *             diário comercial. Não enxerga custos da empresa nem o
 *             dashboard executivo.
 * - `viewer`  somente leitura.
 *
 * `ceo` e `socio` são pares: têm a mesma patente. Toda a lógica de "quem
 * concede/gerencia quem" usa PATENTE (ver `role_rank` no SQL e a ordem em
 * `assignableRoles`), não a posição neste union.
 */
export type Role = 'owner' | 'ceo' | 'socio' | 'admin' | 'finance' | 'sales' | 'viewer'

/**
 * Situação do vínculo de uma pessoa com o workspace.
 *
 * - `pending`   pediu acesso e aguarda decisão do sócio. Entra no app, mas
 *               só enxerga a tela de espera.
 * - `active`    aprovado, opera no cargo de `role`.
 * - `rejected`  recusado. A linha **fica no banco** de propósito: quem pediu,
 *               quando, qual cargo queria, quem recusou e por quê. Apagar
 *               apagaria o histórico da decisão.
 * - `invited`   convidado pela equipe, ainda não entrou.
 * - `suspended` teve o acesso cortado sem perder o histórico.
 */
export type MemberStatus = 'pending' | 'active' | 'rejected' | 'invited' | 'suspended'

export interface WorkspaceMember extends BaseEntity {
  workspaceId: Id
  userId: Id
  /**
   * Cargo efetivo. Enquanto `status` não é `active`, vale `viewer` — ninguém
   * recebe poder antes da aprovação, mesmo tendo pedido outro cargo.
   */
  role: Role
  invitedBy?: Id | null
  status: MemberStatus

  /** Cargo que a pessoa pediu no cadastro. Vira `role` quando aprovada. */
  requestedRole?: Role | null
  /** Quem decidiu, quando, e o motivo — preenchidos na aprovação/recusa. */
  decidedBy?: Id | null
  decidedAt?: Timestamp | null
  decisionNote?: string | null
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
 * `amountCents`; a direção vem de `kind` (income soma, expense subtrai).
 *
 * Transferência é o caso especial: as duas pernas têm o MESMO `kind`
 * ('transfer') e o mesmo valor positivo, e cada conta só enxerga a sua perna.
 * Logo `kind` não basta para saber se aquela perna soma ou subtrai — quem diz
 * isso é `transferDirection`. Sem esse marcador, `accountBalance` subtraía as
 * duas pernas e a conta de destino nunca era creditada.
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
  /**
   * Só em transferência: `'out'` na conta de origem (subtrai), `'in'` na de
   * destino (soma). Ausente em income/expense — a direção deles vem de `kind`.
   */
  transferDirection?: 'out' | 'in' | null
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
  /**
   * Baixa o título sozinho na data de vencimento — cria a saída em Entradas e
   * saídas e liquida o título, sem esperar clique. Opt-in e `false` por
   * padrão: vencimento chegar não é prova de pagamento (ver invariante 22),
   * então só faz sentido para custo que realmente sai sozinho (débito
   * automático, assinatura no cartão). Exige `accountId` — sem conta não há
   * de onde debitar.
   */
  autoSettle: boolean
  /**
   * Conta parcelada (empréstimo, compra em N vezes): quantas parcelas existem
   * no total. `null`/ausente = conta fixa sem fim. Quando presente, a regra
   * para de gerar títulos depois da última parcela — sem isso, um empréstimo
   * quitado continuaria aparecendo em "A pagar" para sempre.
   */
  installmentTotal?: number | null
  /**
   * Número da parcela que vence na PRIMEIRA ocorrência da regra (a partir de
   * `startDate`). Permite cadastrar um parcelamento que já está no meio —
   * "estamos na 3ª de 10" — sem inventar títulos das parcelas já pagas.
   */
  installmentStart?: number | null
  /** Valor total do parcelamento. Informativo: o título usa `amountCents` (a parcela). */
  totalAmountCents?: Cents | null
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
// Leads — o funil pessoa a pessoa
// ---------------------------------------------------------------------------

/**
 * Etapas do funil, na ordem.
 *
 * São as mesmas etapas que o diário comercial já contava de forma agregada
 * (`leads`, `calls`, `meetings`, `proposalsSent`...). A diferença é que aqui
 * cada etapa é ocupada por *alguém* com nome e telefone — e é isso que
 * permite a conversão sair sozinha, sem ninguém digitar o total do dia.
 *
 * `ganho` e `perdido` são terminais: um lead sai do funil por uma das duas
 * portas, nunca pelas duas.
 */
export type LeadStage =
  | 'novo'
  | 'contato'
  | 'reuniao'
  | 'proposta'
  | 'negociacao'
  | 'ganho'
  | 'perdido'

/** Etapas em que o lead ainda está em jogo. */
export const OPEN_LEAD_STAGES: readonly LeadStage[] = [
  'novo',
  'contato',
  'reuniao',
  'proposta',
  'negociacao',
]

/**
 * Uma pessoa ou empresa que demonstrou interesse.
 *
 * Nasce separado de `Client` de propósito. Cliente é quem já comprou — tem
 * receita, churn e MRR. Lead é quem talvez compre: misturar os dois faria a
 * carteira de clientes inflar com gente que nunca pagou nada, e todo
 * indicador de receita por cliente ficaria errado.
 *
 * A ponte entre os dois é o `stage: 'ganho'`, que gera a venda e o cliente
 * de uma vez (`convertLeadToSale` em `@/data/contracts`).
 */
export interface Lead extends ScopedEntity {
  name: string
  company?: string | null
  email?: string | null
  phone?: string | null

  source: LeadSource | null
  stage: LeadStage
  /** Responsável pelo acompanhamento — closer ou SDR. */
  ownerId?: Id | null

  /** Quanto se espera fechar. Alimenta o valor do funil, não a receita. */
  estimatedValueCents: Cents

  /** Quando o lead entrou. É o marco zero do tempo de fechamento. */
  enteredAt: IsoDate
  /** Último toque registrado — o que revela lead esquecido. */
  lastContactAt?: IsoDate | null
  /** Próxima ação combinada. É o que a tela cobra quando vence. */
  nextActionAt?: IsoDate | null
  nextActionNote?: string | null

  /** Preenchidos ao sair do funil. */
  closedAt?: IsoDate | null
  lostReason?: string | null

  /** Vínculos criados quando o lead vira cliente. */
  clientId?: Id | null
  saleId?: Id | null

  notes?: string | null
  createdBy: Id
}

export type LeadActivityKind =
  | 'nota'
  | 'ligacao'
  | 'mensagem'
  | 'email'
  | 'reuniao'
  | 'proposta'
  | 'mudanca_etapa'

/**
 * Um toque no lead.
 *
 * O histórico é o que transforma uma lista de nomes em acompanhamento de
 * verdade: sem ele, ninguém sabe se o lead parado há duas semanas foi
 * abandonado ou está esperando resposta do jurídico.
 *
 * `mudanca_etapa` é gravado pelo próprio sistema quando o card muda de
 * coluna — assim a linha do tempo não depende de alguém lembrar de anotar.
 */
export interface LeadActivity extends ScopedEntity {
  leadId: Id
  kind: LeadActivityKind
  date: IsoDate
  summary: string
  /** Preenchidos só em `mudanca_etapa`. */
  fromStage?: LeadStage | null
  toStage?: LeadStage | null
  createdBy: Id
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

export type SaleModel = 'mrr' | 'setup' | 'projeto' | 'consultoria' | 'servico' | 'tcv'

/** Produtos da Enjoy. O valor de cada venda é negociado — o produto não tem preço fixo. */
export type SaleProduct = 'enjoy_start' | 'enjoy_pro' | 'enjoy_growth' | 'enjoy_rec'

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
  /**
   * Lead que originou esta venda, quando ela veio do CRM.
   *
   * É o que fecha o ciclo do funil: com ele dá para dizer quantos leads de
   * uma origem viraram receita, e não só quantos foram marcados como ganhos.
   */
  leadId?: Id | null
  notes?: string | null
  /** Produto vendido. Vendas antigas não têm. */
  product?: SaleProduct | null
  /**
   * Entrada do TCV (0/nulo = sem entrada). O restante — `amountCents` menos a
   * entrada — é dividido em `installments` parcelas mensais a partir de
   * `firstDueDate`.
   */
  downPaymentCents?: Cents | null
  /** Quando a entrada é paga. Nulo = na data da venda. */
  downPaymentDate?: IsoDate | null
  /**
   * 1º vencimento: a 1ª mensalidade (MRR) ou a 1ª parcela do restante (TCV).
   * Nulo = data da venda — o comportamento de antes desta coluna existir.
   */
  firstDueDate?: IsoDate | null
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
// Comercial — reuniões
// ---------------------------------------------------------------------------

/**
 * Onde a reunião está.
 *
 * `fechada` é o que a pessoa diz que aconteceu na call; quem prova a venda é o
 * módulo de Vendas. As métricas contam venda pela venda cadastrada (casada por
 * nome ou vinculada à mão), e marcam a reunião "fechada" sem venda atrás como
 * pendência — senão o win rate subiria com venda que ninguém registrou.
 */
export type MeetingStatus =
  'agendada' | 'realizada' | 'no_show' | 'proposta' | 'fechada' | 'perdida'

/**
 * Uma reunião (call) com um lead — uma linha da planilha "Métricas Comercial".
 *
 * É o elo entre o tráfego e a venda: o lead chega pelo Marketing, vira
 * reunião aqui, e a venda cadastrada em Vendas com o mesmo nome fecha o
 * ciclo. Win rate, custo por reunião e conversão por criativo saem daqui.
 */
export interface CommercialMeeting extends ScopedEntity {
  date: IsoDate
  /** Nome do lead/cliente — é por ele que a venda é encontrada. */
  name: string
  status: MeetingStatus
  /** O que foi oferecido, como se fala no dia a dia ("PEAP 9k", "Start + tráfego"). */
  proposal?: string | null
  product?: SaleProduct | null
  /** Quem fez a call. Texto livre: às vezes são duas pessoas ("João e Diogo"). */
  hostName?: string | null
  /** Criativo ou origem que gerou a call ("Depoimento Rafaela V2", "Orgânico"). */
  creative?: string | null
  /**
   * Venda vinculada à mão. Vence o casamento por nome — serve para quando o
   * nome da reunião e o da venda não batem ("Raphela" × "Raphaela Souza").
   */
  saleId?: Id | null
  notes?: string | null
  createdBy: Id
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
// Marketing — investimento mensal por canal
// ---------------------------------------------------------------------------

/**
 * Canais de mídia.
 *
 * Conjunto fechado pelo mesmo motivo de `CostCenter`: é o que permite comparar
 * "quanto o Meta custou por lead" entre meses sem depender de alguém digitar o
 * nome do canal do mesmo jeito duas vezes.
 *
 * `geral` existe para quem não separa por plataforma — lança a verba total do
 * mês numa linha só e todos os indicadores continuam funcionando. Sem ele, o
 * conjunto fechado obrigaria a inventar um canal para poder registrar.
 */
export type MarketingChannel =
  | 'geral'
  | 'meta_ads'
  | 'google_ads'
  | 'tiktok_ads'
  | 'linkedin_ads'
  | 'youtube_ads'
  | 'influenciador'
  | 'email'
  | 'organico'
  | 'outro'

/**
 * Investimento de marketing de um mês, num canal.
 *
 * Existe porque verba de anúncio é um fato MENSAL, e o sistema só tinha dois
 * lugares para ela: o custo por venda (`SaleCost.adsCents`) e o diário
 * comercial (`CommercialDay.adsInvestmentCents`). O primeiro obriga a ratear a
 * campanha do mês venda a venda — que é digitação repetida e chega errada; o
 * segundo pede o número quebrado por dia, que a plataforma de anúncios nem
 * sempre entrega. Nenhum dos dois é o formato em que a informação existe.
 *
 * Uma linha por (workspace, mês, canal). Guarda só o que **alguém precisa
 * digitar**: quanto foi gasto e o que a mídia entregou. CPL, CAC, ROAS, ROI e
 * lucro são calculados em `@/domain/marketing` — nenhum deles é coluna aqui,
 * pela mesma razão de sempre (invariante 3): número derivado guardado é número
 * que envelhece.
 */
export interface MarketingEntry extends ScopedEntity {
  /** Primeiro dia do mês, "YYYY-MM-01" — igual a `MonthlyTarget.month`. */
  month: IsoDate
  channel: MarketingChannel

  /**
   * Verba que foi para a plataforma de anúncios. Separada das demais porque é
   * a única base honesta do ROAS: agência e criativo não escalam com o
   * resultado da campanha do jeito que a mídia escala.
   */
  adsCents: Cents
  /** Agência, gestor de tráfego, social media. */
  agencyCents: Cents
  /** Criativos: produção, edição, filmagem, banco de imagens. */
  creativeCents: Cents
  /** Ferramentas de marketing: automação, landing page, e-mail. */
  toolsCents: Cents
  otherCents: Cents

  /**
   * O que a mídia entregou no mês. Zero significa "não informado" — os
   * indicadores que dependem do número saem como "—" em vez de fingir
   * precisão.
   */
  impressions: number
  clicks: number
  /**
   * Leads gerados pelo canal, segundo a plataforma.
   *
   * NÃO se soma aos leads do CRM em lugar nenhum: é a mesma pessoa contada de
   * outra fonte. Serve para o CPL de mídia e para revelar a diferença entre o
   * que a plataforma reporta e o que virou lead cadastrado.
   */
  leads: number

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
  /**
   * Situação do vínculo com o workspace ativo.
   *
   * A sessão existe mesmo quando não é `active` — é o que permite mostrar a
   * tela "aguardando liberação" para quem acabou de se cadastrar. Sem isso, a
   * única alternativa seria negar o login, e a pessoa não teria como saber se
   * o cadastro chegou.
   *
   * Quem lê isto: `RequireSession` em `@/app/routes`. Nenhuma tela de negócio
   * precisa checar — elas só renderizam para sessão ativa.
   */
  status: MemberStatus
  /** Cargo pedido, quando ainda aguarda decisão. */
  requestedRole?: Role | null
  /** Motivo informado na recusa, para a tela de espera poder explicar. */
  decisionNote?: string | null
}
