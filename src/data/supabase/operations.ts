import type { SupabaseClient } from '@supabase/supabase-js'
import { nowIso, toIsoDate, type IsoDate } from '@/lib/date'
import { sumCents } from '@/lib/money'
import { persistedStatus } from '@/domain/bills'
import { occurrencesBetween } from '@/domain/recurrence'
import { buildReceivables } from '../receivables'
import type { NewEntity, Operations } from '../contracts'
import type {
  Bill,
  BillPayment,
  Card,
  Client,
  Id,
  Lead,
  LeadActivity,
  LeadStage,
  Role,
  Sale,
  SaleCost,
  Transaction,
  WorkspaceMember,
} from '../types'
import { COLLECTIONS } from './tables'
import { fromRow, toRow } from './serialization'

/**
 * Operações compostas do provider Supabase.
 *
 * O desenho é o do `CLAUDE.md` §8 e o desta camada: a REGRA (quanto parcelar,
 * qual status o título assume, quais datas a recorrência gera) roda aqui em
 * TypeScript, com as MESMAS funções de domínio que o provider local usa
 * (`buildReceivables`, `persistedStatus`, `occurrencesBetween`). As linhas
 * prontas vão para uma RPC (`op_*` na migration 0004) que só as PERSISTE, em
 * transação. Assim os dois providers são idênticos por construção — nenhuma
 * conta é reescrita em PL/pgSQL.
 *
 * As validações de negócio (título cancelado não baixa, venda com baixa não
 * se apaga) ficam aqui, como no local. O RLS no banco é a trava que não se
 * contorna; estas checagens são a ergonomia que dá a mensagem certa antes.
 */

const uuid = (): Id => crypto.randomUUID()
const today = (): IsoDate => toIsoDate(new Date())

function stampNew<T>(data: NewEntity<T>): T {
  const now = nowIso()
  return { ...(data as object), id: uuid(), createdAt: now, updatedAt: now } as T
}

/** Só para deixar o `toRow` legível quando a entrada é uma entidade tipada. */
const row = (entity: unknown) => toRow(entity as Record<string, unknown>)

export class SupabaseOperations implements Operations {
  constructor(private readonly client: SupabaseClient) {}

  private async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data
  }

  private async one<T>(table: string, id: Id): Promise<T | null> {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? fromRow<T>(data) : null
  }

  private async many<T>(table: string, column: string, value: unknown): Promise<T[]> {
    const { data, error } = await this.client.from(table).select('*').eq(column, value)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => fromRow<T>(r))
  }

  // ---------------------------------------------------------------------------
  // Títulos e caixa
  // ---------------------------------------------------------------------------

  async settleBill(input: {
    billId: Id
    amountCents: number
    date: IsoDate
    accountId: Id
    actorId: Id
    notes?: string
  }) {
    const bill = await this.one<Bill>('bills', input.billId)
    if (!bill) throw new Error('Título não encontrado.')
    if (bill.status === 'canceled') throw new Error('Título cancelado não pode ser baixado.')

    const existing = await this.many<BillPayment>('bill_payments', 'bill_id', bill.id)
    const alreadyPaid = sumCents(existing.map((p) => p.amountCents))
    const remaining = bill.amountCents - alreadyPaid

    if (remaining <= 0) throw new Error('Este título já está quitado.')
    if (input.amountCents <= 0) throw new Error('O valor da baixa precisa ser positivo.')
    if (input.amountCents > remaining) {
      throw new Error('O valor da baixa é maior que o saldo em aberto do título.')
    }

    const transaction = stampNew<Transaction>({
      workspaceId: bill.workspaceId,
      accountId: input.accountId,
      categoryId: bill.categoryId,
      kind: bill.direction === 'receivable' ? 'income' : 'expense',
      amountCents: input.amountCents,
      date: input.date,
      description: bill.description || bill.partyName,
      status: 'cleared',
      paymentMethod: null,
      costCenter: bill.costCenter,
      tags: [],
      createdBy: input.actorId,
      billId: bill.id,
      saleId: bill.saleId ?? null,
      clientId: bill.clientId ?? null,
      notes: input.notes ?? null,
    })

    const payment = stampNew<BillPayment>({
      workspaceId: bill.workspaceId,
      billId: bill.id,
      amountCents: input.amountCents,
      date: input.date,
      accountId: input.accountId,
      transactionId: transaction.id,
      createdBy: input.actorId,
      notes: input.notes ?? null,
    })

    const status = persistedStatus(bill, alreadyPaid + input.amountCents)

    await this.rpc('op_settle_bill', {
      p_transaction: row(transaction),
      p_payment: row(payment),
      p_bill_id: bill.id,
      p_bill_status: status,
    })

    const updatedBill: Bill = { ...bill, status, updatedAt: nowIso() }
    return { bill: updatedBill, payment, transaction }
  }

  async unsettleBillPayment(paymentId: Id): Promise<Bill> {
    const payment = await this.one<BillPayment>('bill_payments', paymentId)
    if (!payment) throw new Error('Baixa não encontrada.')

    const bill = await this.one<Bill>('bills', payment.billId)
    if (!bill) throw new Error('Título não encontrado.')

    const all = await this.many<BillPayment>('bill_payments', 'bill_id', bill.id)
    const paid = sumCents(all.filter((p) => p.id !== payment.id).map((p) => p.amountCents))
    const status = persistedStatus(bill, paid)

    await this.rpc('op_unsettle_payment', {
      p_payment_id: payment.id,
      p_transaction_id: payment.transactionId ?? null,
      p_bill_id: bill.id,
      p_bill_status: status,
    })

    return { ...bill, status, updatedAt: nowIso() }
  }

  // ---------------------------------------------------------------------------
  // Vendas
  // ---------------------------------------------------------------------------

  async createSaleWithReceivables(input: {
    sale: NewEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    generateReceivables: boolean
    firstDueDate?: IsoDate
  }) {
    const sale = stampNew<Sale>(input.sale)
    const cost = input.costs ? stampNew<SaleCost>({ ...input.costs, saleId: sale.id }) : null
    const bills = input.generateReceivables
      ? buildReceivables(sale, input.firstDueDate, stampNew, uuid())
      : []

    await this.rpc('op_create_sale', {
      p_sale: row(sale),
      p_cost: cost ? row(cost) : null,
      p_bills: bills.map(row),
    })

    return { sale, bills }
  }

  async updateSaleWithReceivables(input: {
    saleId: Id
    patch: Partial<Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'workspaceId'>>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    regenerateReceivables: boolean
    firstDueDate?: IsoDate
  }): Promise<{ sale: Sale; bills: Bill[] }> {
    const current = await this.one<Sale>('sales', input.saleId)
    if (!current) throw new Error('Venda não encontrada.')

    const sale: Sale = { ...current, ...input.patch, updatedAt: nowIso() }

    let cost: SaleCost | null = null
    if (input.costs) {
      const existing = (await this.many<SaleCost>('sale_costs', 'sale_id', sale.id))[0]
      cost = existing
        ? { ...existing, ...input.costs, updatedAt: nowIso() }
        : stampNew<SaleCost>({ ...input.costs, saleId: sale.id })
    }

    let deleteBillIds: Id[] = []
    let bills: Bill[] = []

    if (input.regenerateReceivables) {
      const oldBills = await this.many<Bill>('bills', 'sale_id', sale.id)
      if (oldBills.length) {
        const { data: paid, error } = await this.client
          .from('bill_payments')
          .select('id')
          .in('bill_id', oldBills.map((b) => b.id))
          .limit(1)
        if (error) throw new Error(error.message)
        if (paid && paid.length) {
          throw new Error(
            'Esta venda já tem recebimentos registrados. Estorne as baixas antes de refazer os títulos.',
          )
        }
      }
      deleteBillIds = oldBills.map((b) => b.id)
      bills = buildReceivables(sale, input.firstDueDate, stampNew, uuid())
    }

    await this.rpc('op_update_sale', {
      p_sale: row(sale),
      p_cost: cost ? row(cost) : null,
      p_delete_bill_ids: deleteBillIds,
      p_bills: bills.map(row),
    })

    return { sale, bills }
  }

  async deleteSale(input: { saleId: Id; actorId: Id }): Promise<void> {
    const sale = await this.one<Sale>('sales', input.saleId)
    if (!sale) throw new Error('Venda não encontrada.')

    const bills = await this.many<Bill>('bills', 'sale_id', sale.id)
    if (bills.length) {
      const { data: paid, error } = await this.client
        .from('bill_payments')
        .select('id')
        .in('bill_id', bills.map((b) => b.id))
        .limit(1)
      if (error) throw new Error(error.message)
      if (paid && paid.length) {
        throw new Error('Esta venda tem títulos já recebidos. Estorne as baixas antes de excluí-la.')
      }
    }

    const costs = await this.many<SaleCost>('sale_costs', 'sale_id', sale.id)

    const { data: cardRows, error: cardErr } = await this.client
      .from('cards')
      .select('id')
      .eq('link_id', sale.id)
      .eq('link_type', 'sale')
    if (cardErr) throw new Error(cardErr.message)

    const lead = sale.leadId ? await this.one<Lead>('leads', sale.leadId) : null
    const activity = lead
      ? stampNew<LeadActivity>({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          kind: 'mudanca_etapa',
          date: today(),
          summary: 'Venda excluída — lead devolvido para negociação',
          fromStage: 'ganho',
          toStage: 'negociacao',
          createdBy: input.actorId,
        })
      : null

    await this.rpc('op_delete_sale', {
      p_sale_id: sale.id,
      p_bill_ids: bills.map((b) => b.id),
      p_cost_ids: costs.map((c) => c.id),
      p_card_ids: (cardRows ?? []).map((c) => (c as { id: Id }).id),
      p_lead_id: lead?.id ?? null,
      p_activity: activity ? row(activity) : null,
    })
  }

  // ---------------------------------------------------------------------------
  // Caixa
  // ---------------------------------------------------------------------------

  async deleteTransaction(transactionId: Id): Promise<void> {
    const transaction = await this.one<Transaction>('transactions', transactionId)
    if (!transaction) return

    if (transaction.billId) {
      throw new Error(
        'Este lançamento veio da baixa de um título. Estorne a baixa na tela do título.',
      )
    }

    let ids = [transaction.id]
    if (transaction.transferGroupId) {
      const pair = await this.many<Transaction>(
        'transactions',
        'transfer_group_id',
        transaction.transferGroupId,
      )
      ids = pair.map((t) => t.id)
    }

    await this.rpc('op_delete_transactions', { p_ids: ids })
  }

  async generateBillsFromRule(ruleId: Id, throughDate: IsoDate): Promise<Bill[]> {
    const rule = await this.one<import('../types').RecurringRule>('recurring_rules', ruleId)
    if (!rule) throw new Error('Regra recorrente não encontrada.')

    const existing = await this.many<Bill>('bills', 'recurring_rule_id', rule.id)
    const alreadyGenerated = new Set(existing.map((b) => b.dueDate))

    const dates = occurrencesBetween(rule, rule.startDate, throughDate).filter(
      (date) => !alreadyGenerated.has(date),
    )

    const bills = dates.map((dueDate) =>
      stampNew<Bill>({
        workspaceId: rule.workspaceId,
        direction: rule.kind === 'income' ? 'receivable' : 'payable',
        partyName: rule.name,
        clientId: rule.clientId ?? null,
        description: rule.name,
        amountCents: rule.amountCents,
        dueDate,
        issueDate: null,
        status: 'open',
        categoryId: rule.categoryId,
        costCenter: rule.costCenter,
        accountId: rule.accountId,
        recurringRuleId: rule.id,
        installmentNumber: null,
        installmentTotal: null,
        createdBy: rule.workspaceId,
        notes: null,
      }),
    )

    await this.rpc('op_insert_bills', { p_bills: bills.map(row) })
    return bills
  }

  // ---------------------------------------------------------------------------
  // Kanban
  // ---------------------------------------------------------------------------

  async moveCard(input: { cardId: Id; toColumnId: Id; position: number; actorId: Id }) {
    const card = await this.one<Card>('cards', input.cardId)
    if (!card) throw new Error('Card não encontrado.')

    const column = await this.one<import('../types').BoardColumn>('board_columns', input.toColumnId)
    if (!column) throw new Error('Coluna de destino não encontrada.')

    const moved: Card = {
      ...card,
      columnId: input.toColumnId,
      position: input.position,
      updatedAt: nowIso(),
    }

    const { error } = await this.client
      .from('cards')
      .update(row({ columnId: input.toColumnId, position: input.position }))
      .eq('id', card.id)
    if (error) throw new Error(error.message)

    if (column.onDropAction === 'settle_bill' && card.linkType === 'bill' && card.linkId) {
      const bill = await this.one<Bill>('bills', card.linkId)
      if (bill && bill.status !== 'paid' && bill.status !== 'canceled') {
        const payments = await this.many<BillPayment>('bill_payments', 'bill_id', bill.id)
        const remaining = bill.amountCents - sumCents(payments.map((p) => p.amountCents))

        let accountId = bill.accountId ?? null
        if (!accountId) {
          const { data } = await this.client
            .from('accounts')
            .select('id')
            .eq('workspace_id', bill.workspaceId)
            .limit(1)
          accountId = (data?.[0] as { id: Id } | undefined)?.id ?? null
        }

        if (remaining > 0 && accountId) {
          await this.settleBill({
            billId: bill.id,
            amountCents: remaining,
            date: today(),
            accountId,
            actorId: input.actorId,
            notes: 'Baixa automática pelo kanban',
          })
          return { card: moved, sideEffect: 'settled_bill' as const }
        }
      }
    }

    if (column.onDropAction === 'mark_sale_paid' && card.linkType === 'sale' && card.linkId) {
      const sale = await this.one<Sale>('sales', card.linkId)
      if (sale && sale.status !== 'pago') {
        const { error: saleErr } = await this.client
          .from('sales')
          .update({ status: 'pago' })
          .eq('id', sale.id)
        if (saleErr) throw new Error(saleErr.message)
        return { card: moved, sideEffect: 'sale_paid' as const }
      }
    }

    return { card: moved }
  }

  // ---------------------------------------------------------------------------
  // Transferência
  // ---------------------------------------------------------------------------

  async createTransfer(input: {
    workspaceId: Id
    fromAccountId: Id
    toAccountId: Id
    amountCents: number
    date: IsoDate
    description: string
    actorId: Id
  }): Promise<Transaction[]> {
    if (input.fromAccountId === input.toAccountId) {
      throw new Error('A conta de origem e a de destino precisam ser diferentes.')
    }
    if (input.amountCents <= 0) throw new Error('O valor da transferência precisa ser positivo.')

    const groupId = uuid()
    const common = {
      workspaceId: input.workspaceId,
      categoryId: null,
      kind: 'transfer' as const,
      amountCents: input.amountCents,
      date: input.date,
      status: 'cleared' as const,
      paymentMethod: 'transfer' as const,
      costCenter: null,
      tags: [] as string[],
      createdBy: input.actorId,
      transferGroupId: groupId,
    }

    const out = stampNew<Transaction>({
      ...common,
      accountId: input.fromAccountId,
      description: `${input.description} (saída)`,
    })
    const into = stampNew<Transaction>({
      ...common,
      accountId: input.toAccountId,
      description: `${input.description} (entrada)`,
    })

    await this.rpc('op_create_transfer', { p_transactions: [out, into].map(row) })
    return [out, into]
  }

  // ---------------------------------------------------------------------------
  // Fila de aprovação e CRM — RPCs já existentes na migration 0002
  // ---------------------------------------------------------------------------

  async approveMember(input: {
    memberId: Id
    grantedRole: Role
    actorId: Id
    note?: string
  }): Promise<WorkspaceMember> {
    const data = await this.rpc('approve_member', {
      target_member: input.memberId,
      granted_role: input.grantedRole,
      note: input.note ?? null,
    })
    return fromRow<WorkspaceMember>(data as Record<string, unknown>)
  }

  async rejectMember(input: { memberId: Id; actorId: Id; note?: string }): Promise<WorkspaceMember> {
    const data = await this.rpc('reject_member', {
      target_member: input.memberId,
      note: input.note ?? null,
    })
    return fromRow<WorkspaceMember>(data as Record<string, unknown>)
  }

  async moveLeadStage(input: {
    leadId: Id
    toStage: LeadStage
    actorId: Id
    note?: string
    lostReason?: string
  }): Promise<Lead> {
    const data = await this.rpc('move_lead_stage', {
      target_lead: input.leadId,
      to_stage: input.toStage,
      note: input.note ?? null,
      lost: input.lostReason ?? null,
    })
    return fromRow<Lead>(data as Record<string, unknown>)
  }

  async convertLeadToSale(input: {
    leadId: Id
    sale: NewEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    generateReceivables: boolean
    firstDueDate?: IsoDate
    actorId: Id
  }): Promise<{ lead: Lead; sale: Sale; client: Client; bills: Bill[] }> {
    const lead = await this.one<Lead>('leads', input.leadId)
    if (!lead) throw new Error('Lead não encontrado.')
    if (lead.saleId) throw new Error('Este lead já foi convertido em venda.')

    const stampDate = today()

    // Resolve o cliente: reaproveita o existente (reativando se preciso) ou
    // cria um novo. O TS decide qual caso e a RPC só aplica o que se aplica.
    const existing = lead.clientId ? await this.one<Client>('clients', lead.clientId) : null
    let clientNew: Client | null = null
    let clientReactivateId: Id | null = null
    let client: Client

    if (!existing) {
      clientNew = stampNew<Client>({
        workspaceId: lead.workspaceId,
        name: lead.name,
        company: lead.company ?? null,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        status: 'active',
        source: lead.source,
        startDate: input.sale.saleDate,
        churnDate: null,
        ownerId: lead.ownerId ?? null,
        notes: null,
      })
      client = clientNew
    } else if (existing.status !== 'active') {
      clientReactivateId = existing.id
      client = { ...existing, status: 'active', churnDate: null, updatedAt: nowIso() }
    } else {
      client = existing
    }

    const sale = stampNew<Sale>({
      ...input.sale,
      clientId: client.id,
      leadId: lead.id,
      leadCreatedAt: input.sale.leadCreatedAt ?? lead.enteredAt,
      leadSource: input.sale.leadSource ?? lead.source,
    })
    const cost = input.costs ? stampNew<SaleCost>({ ...input.costs, saleId: sale.id }) : null
    const bills = input.generateReceivables
      ? buildReceivables(sale, input.firstDueDate, stampNew, uuid())
      : []

    const activity = stampNew<LeadActivity>({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      kind: 'mudanca_etapa',
      date: stampDate,
      summary: 'Lead convertido em venda',
      fromStage: lead.stage,
      toStage: 'ganho',
      createdBy: input.actorId,
    })

    await this.rpc('op_convert_lead', {
      p_client_new: clientNew ? row(clientNew) : null,
      p_client_reactivate_id: clientReactivateId,
      p_client_id: client.id,
      p_sale: row(sale),
      p_cost: cost ? row(cost) : null,
      p_bills: bills.map(row),
      p_lead_id: lead.id,
      p_sale_id: sale.id,
      p_stamp_date: stampDate,
      p_activity: row(activity),
    })

    const updatedLead: Lead = {
      ...lead,
      stage: 'ganho',
      clientId: client.id,
      saleId: sale.id,
      closedAt: stampDate,
      lastContactAt: stampDate,
      nextActionAt: null,
      lostReason: null,
      updatedAt: nowIso(),
    }

    return { lead: updatedLead, sale, client, bills }
  }

  // ---------------------------------------------------------------------------
  // Backup / migração
  // ---------------------------------------------------------------------------

  async exportWorkspace(workspaceId: Id): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { version: 2, exportedAt: nowIso(), workspaceId }

    for (const meta of COLLECTIONS) {
      let query = this.client.from(meta.table).select('*')
      if (meta.scoped) query = query.eq('workspace_id', workspaceId)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      payload[meta.key] = (data ?? []).map((r) => fromRow(r))
    }

    return payload
  }

  /**
   * Restaura um backup (upsert por coleção, em ordem de dependência).
   *
   * `profiles` é pulado: no Supabase os perfis nascem do Auth, e um perfil sem
   * `auth.users` correspondente violaria a chave estrangeira. A migração de uma
   * base local para o Supabase pressupõe que cada pessoa já se cadastrou — só
   * então os dados de negócio dela podem entrar. Ver o roteiro no CLAUDE.md §8.
   */
  async importWorkspace(payload: Record<string, unknown>): Promise<void> {
    for (const meta of COLLECTIONS) {
      if (meta.key === 'profiles') continue
      const rows = payload[meta.key]
      if (!Array.isArray(rows) || !rows.length) continue

      const { error } = await this.client
        .from(meta.table)
        .upsert(rows.map((r) => toRow(r as Record<string, unknown>)))
      if (error) throw new Error(error.message)
    }
  }
}
