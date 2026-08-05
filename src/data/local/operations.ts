import { addMonths, fromIsoDate, nowIso, toIsoDate, type IsoDate } from '@/lib/date'
import { splitCents, sumCents } from '@/lib/money'
import { persistedStatus } from '@/domain/bills'
import { occurrencesBetween } from '@/domain/recurrence'
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
  Profile,
  Role,
  Sale,
  SaleCost,
  Transaction,
  WorkspaceMember,
} from '../types'
import { db, TABLE_NAMES } from './db'
import { newId } from './repository'

/**
 * Operações compostas do provider local.
 *
 * Tudo aqui roda dentro de uma transação Dexie. Quando o provider Supabase
 * for escrito, cada um destes métodos vira uma função RPC no Postgres — a
 * semântica precisa ser idêntica, porque a UI chama os dois pelo mesmo nome.
 */

function stampNew<T>(data: NewEntity<T>): T {
  const now = nowIso()
  return { ...(data as object), id: newId(), createdAt: now, updatedAt: now } as T
}

export class LocalOperations implements Operations {
  /**
   * Baixa de um título. Três escritas que precisam acontecer juntas:
   * o pagamento, a transação de caixa e o novo status do título.
   * Se qualquer uma falhar, nenhuma vale — daí a transação.
   */
  async settleBill(input: {
    billId: Id
    amountCents: number
    date: IsoDate
    accountId: Id
    actorId: Id
    notes?: string
  }) {
    return db.transaction('rw', [db.bills, db.billPayments, db.transactions], async () => {
      const bill = await db.bills.get(input.billId)
      if (!bill) throw new Error('Título não encontrado.')
      if (bill.status === 'canceled') throw new Error('Título cancelado não pode ser baixado.')

      const existing = await db.billPayments.where('billId').equals(bill.id).toArray()
      const alreadyPaid = sumCents(existing.map((p) => p.amountCents))
      const remaining = bill.amountCents - alreadyPaid

      if (remaining <= 0) throw new Error('Este título já está quitado.')
      if (input.amountCents <= 0) throw new Error('O valor da baixa precisa ser positivo.')
      if (input.amountCents > remaining) {
        throw new Error('O valor da baixa é maior que o saldo em aberto do título.')
      }

      // A direção do título define a direção do dinheiro no caixa.
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

      const updatedBill: Bill = {
        ...bill,
        status: persistedStatus(bill, alreadyPaid + input.amountCents),
        updatedAt: nowIso(),
      }

      await db.transactions.add(transaction)
      await db.billPayments.add(payment)
      await db.bills.put(updatedBill)

      return { bill: updatedBill, payment, transaction }
    })
  }

  /** Estorna uma baixa: apaga a transação de caixa e reabre o título. */
  async unsettleBillPayment(paymentId: Id): Promise<Bill> {
    return db.transaction('rw', [db.bills, db.billPayments, db.transactions], async () => {
      const payment = await db.billPayments.get(paymentId)
      if (!payment) throw new Error('Baixa não encontrada.')

      const bill = await db.bills.get(payment.billId)
      if (!bill) throw new Error('Título não encontrado.')

      if (payment.transactionId) await db.transactions.delete(payment.transactionId)
      await db.billPayments.delete(payment.id)

      const remainingPayments = await db.billPayments.where('billId').equals(bill.id).toArray()
      const paid = sumCents(remainingPayments.map((p) => p.amountCents))

      const updated: Bill = { ...bill, status: persistedStatus(bill, paid), updatedAt: nowIso() }
      await db.bills.put(updated)
      return updated
    })
  }

  /**
   * Cria a venda e os títulos a receber correspondentes.
   *
   * O desenho dos títulos segue o modelo comercial:
   * - `setupCents` vira um título único no primeiro vencimento;
   * - `mrrCents` vira um título por mês de contrato;
   * - modelos sem recorrência (projeto, consultoria, serviço) dividem o
   *   valor total no número de parcelas, com `splitCents` para não perder
   *   nem inventar centavo no arredondamento.
   */
  async createSaleWithReceivables(input: {
    sale: NewEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    generateReceivables: boolean
    firstDueDate?: IsoDate
  }) {
    return db.transaction('rw', [db.sales, db.saleCosts, db.bills], async () => {
      const sale = stampNew<Sale>(input.sale)
      await db.sales.add(sale)

      if (input.costs) {
        const costs = stampNew<SaleCost>({ ...input.costs, saleId: sale.id })
        await db.saleCosts.add(costs)
      }

      if (!input.generateReceivables) return { sale, bills: [] }

      const bills = this.buildReceivables(sale, input.firstDueDate)
      if (bills.length) await db.bills.bulkAdd(bills)

      return { sale, bills }
    })
  }

  /**
   * Desenha os títulos a receber de uma venda.
   *
   * Puro e sem I/O de propósito: `createSaleWithReceivables` e
   * `convertLeadToSale` precisam gerar exatamente os mesmos títulos, e uma
   * venda vinda do CRM que parcelasse diferente de uma venda digitada à mão
   * seria um bug impossível de achar — os dois caminhos parecem certos
   * quando olhados separadamente.
   */
  private buildReceivables(sale: Sale, firstDueDate?: IsoDate): Bill[] {
    const firstDue = firstDueDate ?? sale.saleDate
    const groupId = newId()
    const drafts: NewEntity<Bill>[] = []

    const base = {
      workspaceId: sale.workspaceId,
      direction: 'receivable' as const,
      partyName: sale.clientName,
      clientId: sale.clientId,
      categoryId: null,
      costCenter: null,
      status: 'open' as const,
      saleId: sale.id,
      installmentGroupId: groupId,
      createdBy: sale.createdBy,
      issueDate: sale.saleDate,
    }

    if (sale.setupCents > 0) {
      drafts.push({
        ...base,
        description: `Implantação — ${sale.clientName}`,
        amountCents: sale.setupCents,
        dueDate: firstDue,
        installmentNumber: null,
        installmentTotal: null,
      })
    }

    if (sale.mrrCents > 0) {
      const months = Math.max(1, sale.contractMonths ?? 12)
      for (let i = 0; i < months; i++) {
        drafts.push({
          ...base,
          description: `Mensalidade ${i + 1}/${months} — ${sale.clientName}`,
          amountCents: sale.mrrCents,
          dueDate: toIsoDate(addMonths(fromIsoDate(firstDue), i)),
          installmentNumber: i + 1,
          installmentTotal: months,
        })
      }
    }

    // Modelos sem recorrência: o valor do contrato menos o que já virou setup.
    const oneOffTotal = sale.mrrCents > 0 ? 0 : sale.amountCents - sale.setupCents
    if (oneOffTotal > 0) {
      const parts = Math.max(1, sale.installments || 1)
      const amounts = splitCents(oneOffTotal, parts)
      amounts.forEach((amount, i) => {
        drafts.push({
          ...base,
          description:
            parts > 1
              ? `${sale.clientName} — parcela ${i + 1}/${parts}`
              : `${sale.clientName} — ${sale.model}`,
          amountCents: amount,
          dueDate: toIsoDate(addMonths(fromIsoDate(firstDue), i)),
          installmentNumber: parts > 1 ? i + 1 : null,
          installmentTotal: parts > 1 ? parts : null,
        })
      })
    }

    return drafts.map((draft) => stampNew<Bill>(draft))
  }

  /**
   * Altera a venda e, opcionalmente, refaz os títulos dela.
   *
   * A regra que sustenta tudo aqui: **título com baixa é intocável**. A baixa
   * gerou uma transação no caixa, e apagar o título por baixo dela deixaria
   * dinheiro entrando de lugar nenhum. Por isso a regeneração é recusada
   * inteira quando existe qualquer pagamento — recusar é mais honesto do que
   * refazer "só os que dá", que produziria um parcelamento diferente do que
   * a tela mostrou no momento da edição.
   */
  async updateSaleWithReceivables(input: {
    saleId: Id
    patch: Partial<Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'workspaceId'>>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    regenerateReceivables: boolean
    firstDueDate?: IsoDate
  }): Promise<{ sale: Sale; bills: Bill[] }> {
    return db.transaction('rw', [db.sales, db.saleCosts, db.bills, db.billPayments], async () => {
      const current = await db.sales.get(input.saleId)
      if (!current) throw new Error('Venda não encontrada.')

      const sale: Sale = { ...current, ...input.patch, updatedAt: nowIso() }
      await db.sales.put(sale)

      if (input.costs) {
        const existing = await db.saleCosts.where('saleId').equals(sale.id).first()
        if (existing) {
          await db.saleCosts.put({ ...existing, ...input.costs, updatedAt: nowIso() })
        } else {
          await db.saleCosts.add(stampNew<SaleCost>({ ...input.costs, saleId: sale.id }))
        }
      }

      if (!input.regenerateReceivables) return { sale, bills: [] }

      const oldBills = await db.bills.where('saleId').equals(sale.id).toArray()
      for (const bill of oldBills) {
        const payments = await db.billPayments.where('billId').equals(bill.id).toArray()
        if (payments.length) {
          throw new Error(
            'Esta venda já tem recebimentos registrados. Estorne as baixas antes de refazer os títulos.',
          )
        }
      }

      await db.bills.bulkDelete(oldBills.map((bill) => bill.id))

      const bills = this.buildReceivables(sale, input.firstDueDate)
      if (bills.length) await db.bills.bulkAdd(bills)

      return { sale, bills }
    })
  }

  /**
   * Apaga a venda e tudo que nasceu dela.
   *
   * O lead convertido volta para negociação em vez de continuar "ganho": um
   * ganho sem venda atrás quebraria a leitura do funil, que passaria a contar
   * uma conversão que não existe mais. A volta fica registrada na linha do
   * tempo do lead — quem abrir amanhã precisa entender por que ele voltou.
   */
  async deleteSale(input: { saleId: Id; actorId: Id }): Promise<void> {
    await db.transaction(
      'rw',
      [db.sales, db.saleCosts, db.bills, db.billPayments, db.leads, db.leadActivities, db.cards],
      async () => {
        const sale = await db.sales.get(input.saleId)
        if (!sale) throw new Error('Venda não encontrada.')

        const bills = await db.bills.where('saleId').equals(sale.id).toArray()
        for (const bill of bills) {
          const payments = await db.billPayments.where('billId').equals(bill.id).toArray()
          if (payments.length) {
            throw new Error(
              'Esta venda tem títulos já recebidos. Estorne as baixas antes de excluí-la.',
            )
          }
        }

        await db.bills.bulkDelete(bills.map((bill) => bill.id))

        const costs = await db.saleCosts.where('saleId').equals(sale.id).toArray()
        await db.saleCosts.bulkDelete(costs.map((cost) => cost.id))

        // Cards do kanban apontando para esta venda ficariam sem destino.
        const cards = await db.cards.where('linkId').equals(sale.id).toArray()
        const orphans = cards.filter((card) => card.linkType === 'sale')
        await db.cards.bulkDelete(orphans.map((card) => card.id))

        const lead = sale.leadId ? await db.leads.get(sale.leadId) : null
        if (lead) {
          await db.leads.put({
            ...lead,
            stage: 'negociacao',
            saleId: null,
            closedAt: null,
            updatedAt: nowIso(),
          })
          await db.leadActivities.add(
            stampNew<LeadActivity>({
              workspaceId: lead.workspaceId,
              leadId: lead.id,
              kind: 'mudanca_etapa',
              date: toIsoDate(new Date()),
              summary: 'Venda excluída — lead devolvido para negociação',
              fromStage: 'ganho',
              toStage: 'negociacao',
              createdBy: input.actorId,
            }),
          )
        }

        await db.sales.delete(sale.id)
      },
    )
  }

  /**
   * Exclusão de lançamento com as duas travas que faltavam.
   *
   * Antes, a tela apagava a linha direto pelo repositório: uma transferência
   * perdia metade do par (a saída sumia e a entrada ficava, inventando
   * receita) e nada impedia apagar o outro lado de uma baixa se a checagem da
   * tela fosse contornada. As duas regras moram aqui agora, onde valem para
   * qualquer chamador.
   */
  async deleteTransaction(transactionId: Id): Promise<void> {
    await db.transaction('rw', [db.transactions, db.billPayments], async () => {
      const transaction = await db.transactions.get(transactionId)
      if (!transaction) return

      if (transaction.billId) {
        throw new Error(
          'Este lançamento veio da baixa de um título. Estorne a baixa na tela do título.',
        )
      }

      if (transaction.transferGroupId) {
        const pair = await db.transactions
          .where('transferGroupId')
          .equals(transaction.transferGroupId)
          .toArray()
        await db.transactions.bulkDelete(pair.map((row) => row.id))
        return
      }

      await db.transactions.delete(transaction.id)
    })
  }

  /**
   * Materializa os títulos de uma regra recorrente até `throughDate`.
   *
   * Idempotente de propósito: consulta os títulos já gerados pela regra e
   * pula as datas que já existem. Isso permite chamar na abertura do app
   * sem risco de duplicar cobrança — e é exatamente o que o `autoGenerate`
   * faz.
   */
  async generateBillsFromRule(ruleId: Id, throughDate: IsoDate): Promise<Bill[]> {
    return db.transaction('rw', [db.recurringRules, db.bills], async () => {
      const rule = await db.recurringRules.get(ruleId)
      if (!rule) throw new Error('Regra recorrente não encontrada.')

      const existing = await db.bills.where('recurringRuleId').equals(rule.id).toArray()
      const alreadyGenerated = new Set(existing.map((bill) => bill.dueDate))

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

      if (bills.length) await db.bills.bulkAdd(bills)
      return bills
    })
  }

  /**
   * Move um card e dispara a ação da coluna de destino.
   *
   * É o que transforma o kanban em operação: arrastar um card de "A pagar"
   * para "Pago" liquida o título de verdade e gera a transação no caixa.
   */
  async moveCard(input: { cardId: Id; toColumnId: Id; position: number; actorId: Id }) {
    const card = await db.cards.get(input.cardId)
    if (!card) throw new Error('Card não encontrado.')

    const column = await db.boardColumns.get(input.toColumnId)
    if (!column) throw new Error('Coluna de destino não encontrada.')

    const moved: Card = {
      ...card,
      columnId: input.toColumnId,
      position: input.position,
      updatedAt: nowIso(),
    }
    await db.cards.put(moved)

    // Liquidação automática ao entrar na coluna de "pago".
    if (column.onDropAction === 'settle_bill' && card.linkType === 'bill' && card.linkId) {
      const bill = await db.bills.get(card.linkId)
      if (bill && bill.status !== 'paid' && bill.status !== 'canceled') {
        const payments = await db.billPayments.where('billId').equals(bill.id).toArray()
        const remaining = bill.amountCents - sumCents(payments.map((p) => p.amountCents))

        // Sem conta definida no título, usa a primeira conta ativa do workspace.
        const accountId =
          bill.accountId ??
          (await db.accounts.where('workspaceId').equals(bill.workspaceId).first())?.id

        if (remaining > 0 && accountId) {
          await this.settleBill({
            billId: bill.id,
            amountCents: remaining,
            date: toIsoDate(new Date()),
            accountId,
            actorId: input.actorId,
            notes: 'Baixa automática pelo kanban',
          })
          return { card: moved, sideEffect: 'settled_bill' as const }
        }
      }
    }

    if (column.onDropAction === 'mark_sale_paid' && card.linkType === 'sale' && card.linkId) {
      const sale = await db.sales.get(card.linkId)
      if (sale && sale.status !== 'pago') {
        await db.sales.put({ ...sale, status: 'pago', updatedAt: nowIso() })
        return { card: moved, sideEffect: 'sale_paid' as const }
      }
    }

    return { card: moved }
  }

  // ---------------------------------------------------------------------------
  // Fila de aprovação
  // ---------------------------------------------------------------------------

  /**
   * Libera o acesso: ativa o vínculo e grava o cargo concedido.
   *
   * As quatro escritas — status, cargo, quem decidiu, quando — acontecem
   * juntas. Um membro ativo sem registro de quem o liberou é pior do que um
   * pedido que ficou pendente: o primeiro parece legítimo.
   */
  async approveMember(input: {
    memberId: Id
    grantedRole: Role
    actorId: Id
    note?: string
  }): Promise<WorkspaceMember> {
    return db.transaction('rw', [db.members], async () => {
      const member = await db.members.get(input.memberId)
      if (!member) throw new Error('Pedido não encontrado.')
      if (member.status === 'active') throw new Error('Este acesso já está liberado.')
      if (member.userId === input.actorId)
        throw new Error('Ninguém pode aprovar o próprio cadastro.')

      const updated: WorkspaceMember = {
        ...member,
        role: input.grantedRole,
        status: 'active',
        decidedBy: input.actorId,
        decidedAt: nowIso(),
        decisionNote: input.note ?? null,
        updatedAt: nowIso(),
      }
      await db.members.put(updated)
      return updated
    })
  }

  /**
   * Recusa o pedido — sem apagar nada.
   *
   * A linha continua no banco com quem pediu, qual cargo queria, quem
   * recusou, quando e por quê. Apagar deixaria a mesma pessoa cadastrando de
   * novo na semana seguinte sem ninguém lembrar que já havia sido recusada.
   */
  async rejectMember(input: {
    memberId: Id
    actorId: Id
    note?: string
  }): Promise<WorkspaceMember> {
    return db.transaction('rw', [db.members], async () => {
      const member = await db.members.get(input.memberId)
      if (!member) throw new Error('Pedido não encontrado.')
      if (member.userId === input.actorId)
        throw new Error('Ninguém pode decidir o próprio cadastro.')

      const updated: WorkspaceMember = {
        ...member,
        role: 'viewer',
        status: 'rejected',
        decidedBy: input.actorId,
        decidedAt: nowIso(),
        decisionNote: input.note ?? null,
        updatedAt: nowIso(),
      }
      await db.members.put(updated)
      return updated
    })
  }

  // ---------------------------------------------------------------------------
  // CRM de leads
  // ---------------------------------------------------------------------------

  /**
   * Move o lead de etapa e registra a mudança na linha do tempo.
   *
   * O histórico é escrito pelo sistema, não pela pessoa. É o que permite
   * distinguir "lead parado há dez dias" de "lead que ninguém anotou" — e
   * essa distinção é a razão de o CRM existir.
   *
   * `closedAt` e `lastContactAt` são derivados do movimento: sair do funil
   * carimba a data de fechamento, e qualquer avanço conta como toque.
   */
  async moveLeadStage(input: {
    leadId: Id
    toStage: LeadStage
    actorId: Id
    note?: string
    lostReason?: string
  }): Promise<Lead> {
    return db.transaction('rw', [db.leads, db.leadActivities], async () => {
      const lead = await db.leads.get(input.leadId)
      if (!lead) throw new Error('Lead não encontrado.')
      if (lead.stage === input.toStage) return lead

      const isClosing = input.toStage === 'ganho' || input.toStage === 'perdido'
      const stampDate = toIsoDate(new Date())

      const updated: Lead = {
        ...lead,
        stage: input.toStage,
        lastContactAt: stampDate,
        closedAt: isClosing ? stampDate : null,
        lostReason:
          input.toStage === 'perdido' ? (input.lostReason ?? lead.lostReason ?? null) : null,
        // Reabrir um lead limpa a próxima ação: a combinada anterior morreu
        // junto com o fechamento e cobrar por ela seria ruído.
        nextActionAt: isClosing ? null : lead.nextActionAt,
        updatedAt: nowIso(),
      }

      await db.leads.put(updated)
      await db.leadActivities.add(
        stampNew<LeadActivity>({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          kind: 'mudanca_etapa',
          date: stampDate,
          summary: input.note ?? `${lead.stage} → ${input.toStage}`,
          fromStage: lead.stage,
          toStage: input.toStage,
          createdBy: input.actorId,
        }),
      )

      return updated
    })
  }

  /**
   * Fecha o ciclo: lead ganho vira cliente, venda e títulos a receber.
   *
   * É o ponto em que o funil comercial encosta no financeiro. Sem esta
   * operação o "ganho" do CRM seria só uma etiqueta — e a taxa de conversão
   * continuaria dependendo de alguém digitar a venda numa segunda tela,
   * que era exatamente o problema relatado.
   *
   * O cliente é reaproveitado quando o lead já aponta para um: um lead que
   * volta a comprar não pode duplicar a carteira, senão receita por cliente
   * e churn passam a contar a mesma empresa duas vezes.
   */
  async convertLeadToSale(input: {
    leadId: Id
    sale: NewEntity<Sale>
    costs?: Omit<NewEntity<SaleCost>, 'saleId'>
    generateReceivables: boolean
    firstDueDate?: IsoDate
    actorId: Id
  }): Promise<{ lead: Lead; sale: Sale; client: Client; bills: Bill[] }> {
    return db.transaction(
      'rw',
      [db.leads, db.leadActivities, db.clients, db.sales, db.saleCosts, db.bills],
      async () => {
        const lead = await db.leads.get(input.leadId)
        if (!lead) throw new Error('Lead não encontrado.')
        if (lead.saleId) throw new Error('Este lead já foi convertido em venda.')

        const stampDate = toIsoDate(new Date())

        let client = lead.clientId ? ((await db.clients.get(lead.clientId)) ?? null) : null
        if (!client) {
          client = stampNew<Client>({
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
          await db.clients.add(client)
        } else if (client.status !== 'active') {
          // Cliente que voltou: reativa e limpa o churn, senão o indicador de
          // cancelamento continuaria contando alguém que está pagando.
          client = { ...client, status: 'active', churnDate: null, updatedAt: nowIso() }
          await db.clients.put(client)
        }

        const sale = stampNew<Sale>({
          ...input.sale,
          clientId: client.id,
          leadId: lead.id,
          // A entrada do lead é o marco zero do tempo de fechamento. Vem do
          // CRM, não do formulário: é o dado que já existe e não erra.
          leadCreatedAt: input.sale.leadCreatedAt ?? lead.enteredAt,
          leadSource: input.sale.leadSource ?? lead.source,
        })
        await db.sales.add(sale)

        if (input.costs) {
          await db.saleCosts.add(stampNew<SaleCost>({ ...input.costs, saleId: sale.id }))
        }

        const bills = input.generateReceivables
          ? this.buildReceivables(sale, input.firstDueDate)
          : []
        if (bills.length) await db.bills.bulkAdd(bills)

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
        await db.leads.put(updatedLead)

        await db.leadActivities.add(
          stampNew<LeadActivity>({
            workspaceId: lead.workspaceId,
            leadId: lead.id,
            kind: 'mudanca_etapa',
            date: stampDate,
            summary: 'Lead convertido em venda',
            fromStage: lead.stage,
            toStage: 'ganho',
            createdBy: input.actorId,
          }),
        )

        return { lead: updatedLead, sale, client, bills }
      },
    )
  }

  /** Transferência entre contas: saída de uma, entrada na outra, mesmo grupo. */
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

    const groupId = newId()
    const common = {
      workspaceId: input.workspaceId,
      categoryId: null,
      kind: 'transfer' as const,
      amountCents: input.amountCents,
      date: input.date,
      status: 'cleared' as const,
      paymentMethod: 'transfer' as const,
      costCenter: null,
      tags: [],
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

    await db.transactions.bulkAdd([out, into])
    return [out, into]
  }

  /**
   * Backup do workspace em JSON.
   *
   * `passwordHash` é removido dos perfis antes de sair.
   *
   * O arquivo circula por e-mail, WhatsApp e pen drive — é um arquivo que
   * sai do controle de quem o gerou. O hash não é a senha, mas é material
   * para ataque offline por lista de senhas comuns, e a maioria das pessoas
   * reusa senha. Quem restaura o backup define a senha de novo no primeiro
   * acesso (`setInitialPassword`), que é o comportamento correto: restaurar
   * dados não deveria restaurar credenciais.
   */
  async exportWorkspace(workspaceId: Id): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      version: 2,
      exportedAt: nowIso(),
      workspaceId,
    }

    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      const rows = await table.toArray()

      if (name === 'profiles') {
        payload[name] = (rows as Profile[]).map(({ passwordHash: _omit, ...profile }) => ({
          ...profile,
          passwordHash: null,
        }))
        continue
      }

      payload[name] =
        name === 'workspaces'
          ? rows
          : rows.filter((row: { workspaceId?: string }) => row.workspaceId === workspaceId)
    }

    return payload
  }

  /**
   * Restaura um backup.
   *
   * A senha de quem já está nesta base é preservada. O backup vem sem hash
   * (ver `exportWorkspace`), e sobrescrever cegamente trancaria para fora
   * quem apenas quis reimportar os próprios dados — o restore viraria uma
   * armadilha. Perfis que não existem aqui entram sem senha e a definem no
   * primeiro acesso.
   */
  async importWorkspace(payload: Record<string, unknown>): Promise<void> {
    const currentHashes = new Map(
      (await db.profiles.toArray()).map((profile) => [profile.id, profile.passwordHash ?? null]),
    )

    await db.transaction(
      'rw',
      TABLE_NAMES.map((name) => db.table(name)),
      async () => {
        for (const name of TABLE_NAMES) {
          const rows = payload[name]
          if (!Array.isArray(rows) || !rows.length) continue

          if (name === 'profiles') {
            await db.profiles.bulkPut(
              (rows as Profile[]).map((profile) => ({
                ...profile,
                passwordHash: currentHashes.get(profile.id) ?? profile.passwordHash ?? null,
              })),
            )
            continue
          }

          await db.table(name).bulkPut(rows)
        }
      },
    )
  }
}
