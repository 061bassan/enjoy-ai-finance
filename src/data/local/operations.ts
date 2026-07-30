import { addMonths, fromIsoDate, nowIso, toIsoDate, type IsoDate } from '@/lib/date'
import { splitCents, sumCents } from '@/lib/money'
import { persistedStatus } from '@/domain/bills'
import { occurrencesBetween } from '@/domain/recurrence'
import type { NewEntity, Operations } from '../contracts'
import type { Bill, BillPayment, Card, Id, Sale, SaleCost, Transaction } from '../types'
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

      const firstDue = input.firstDueDate ?? sale.saleDate
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

      const bills = drafts.map((draft) => stampNew<Bill>(draft))
      if (bills.length) await db.bills.bulkAdd(bills)

      return { sale, bills }
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

  async exportWorkspace(workspaceId: Id): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      version: 1,
      exportedAt: nowIso(),
      workspaceId,
    }

    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      const rows = await table.toArray()
      payload[name] =
        name === 'profiles' || name === 'workspaces'
          ? rows
          : rows.filter((row: { workspaceId?: string }) => row.workspaceId === workspaceId)
    }

    return payload
  }

  async importWorkspace(payload: Record<string, unknown>): Promise<void> {
    await db.transaction('rw', TABLE_NAMES.map((name) => db.table(name)), async () => {
      for (const name of TABLE_NAMES) {
        const rows = payload[name]
        if (Array.isArray(rows) && rows.length) {
          await db.table(name).bulkPut(rows)
        }
      }
    })
  }
}
