/**
 * Editar e excluir vendas, sobre o banco real.
 *
 * O risco destas operações não é de cálculo, é de consistência: uma venda
 * alterada que deixa títulos antigos para trás infla o previsto do fluxo de
 * caixa; uma venda apagada com título já recebido deixa dinheiro no caixa sem
 * origem. Os dois casos parecem certos na tela e estão errados no banco — daí
 * o teste rodar contra o Dexie de verdade.
 *
 * Este arquivo também é o contrato que o provider Supabase precisará
 * satisfazer na Fase 9: se a RPC se comportar diferente, quebra aqui e não em
 * produção.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NewEntity } from '@/data/contracts'
import type { Lead, Sale } from '@/data/types'
import { LocalOperations } from './operations'
import { db, TABLE_NAMES } from './db'
import { newId } from './repository'

const ops = new LocalOperations()
const WORKSPACE = 'ws_teste'
const ATOR = 'user_teste'

function vendaBase(overrides: Partial<NewEntity<Sale>> = {}): NewEntity<Sale> {
  return {
    workspaceId: WORKSPACE,
    clientId: null,
    clientName: 'Padaria do Bairro',
    company: null,
    saleDate: '2026-08-15',
    closerId: ATOR,
    sdrId: null,
    leadSource: null,
    model: 'mrr',
    amountCents: 660_000,
    mrrCents: 50_000,
    setupCents: 60_000,
    contractMonths: 12,
    paymentMethod: 'pix',
    installments: 1,
    closerCommissionPercent: 8,
    sdrCommissionPercent: 0,
    status: 'pendente',
    leadCreatedAt: null,
    leadId: null,
    notes: null,
    createdBy: ATOR,
    ...overrides,
  }
}

/** Primeiro item de uma lista que o teste espera não estar vazia. */
function primeiro<T>(items: T[]): T {
  const item = items[0]
  if (!item) throw new Error('A lista veio vazia — o cenário do teste não se montou.')
  return item
}

async function criarConta() {
  const now = new Date().toISOString()
  const account = {
    id: newId(),
    workspaceId: WORKSPACE,
    name: 'Conta PJ',
    type: 'checking' as const,
    institution: null,
    openingBalanceCents: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.accounts.add(account)
  return account
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  for (const name of TABLE_NAMES) await db.table(name).clear()
})

describe('editar venda', () => {
  it('altera os campos sem tocar nos títulos quando a regeração não é pedida', async () => {
    const { sale } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })
    const antes = await db.bills.where('saleId').equals(sale.id).toArray()

    const resultado = await ops.updateSaleWithReceivables({
      saleId: sale.id,
      patch: { clientName: 'Padaria Central', status: 'pago' },
      regenerateReceivables: false,
    })

    expect(resultado.sale.clientName).toBe('Padaria Central')
    expect(resultado.sale.status).toBe('pago')

    const depois = await db.bills.where('saleId').equals(sale.id).toArray()
    expect(depois).toHaveLength(antes.length)
  })

  it('refaz os títulos quando pedido, sem deixar os antigos para trás', async () => {
    const { sale } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })
    // setup + 12 mensalidades
    expect(await db.bills.where('saleId').equals(sale.id).count()).toBe(13)

    await ops.updateSaleWithReceivables({
      saleId: sale.id,
      patch: { contractMonths: 6, amountCents: 360_000 },
      regenerateReceivables: true,
      firstDueDate: '2026-08-15',
    })

    const bills = await db.bills.where('saleId').equals(sale.id).toArray()
    expect(bills).toHaveLength(7)
  })

  it('recusa refazer títulos quando algum já foi recebido', async () => {
    const account = await criarConta()
    const { sale, bills } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })

    await ops.settleBill({
      billId: primeiro(bills).id,
      amountCents: primeiro(bills).amountCents,
      date: '2026-08-16',
      accountId: account.id,
      actorId: ATOR,
    })

    await expect(
      ops.updateSaleWithReceivables({
        saleId: sale.id,
        patch: { amountCents: 100_000 },
        regenerateReceivables: true,
      }),
    ).rejects.toThrow(/estorne as baixas/i)

    // E nada foi alterado: a transação inteira voltou atrás.
    const persistida = await db.sales.get(sale.id)
    expect(persistida?.amountCents).toBe(660_000)
    expect(await db.bills.where('saleId').equals(sale.id).count()).toBe(13)
  })

  it('atualiza os custos existentes em vez de criar uma segunda linha', async () => {
    const { sale } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      costs: {
        workspaceId: WORKSPACE,
        adsCents: 10_000,
        commissionCents: 0,
        bankFeeCents: 0,
        platformFeeCents: 0,
        operationalCents: 0,
        teamHoursCents: 0,
        freelancersCents: 0,
        productionCents: 0,
        travelCents: 0,
        otherCents: 0,
        notes: null,
      },
      generateReceivables: false,
    })

    await ops.updateSaleWithReceivables({
      saleId: sale.id,
      patch: {},
      costs: {
        workspaceId: WORKSPACE,
        adsCents: 25_000,
        commissionCents: 0,
        bankFeeCents: 0,
        platformFeeCents: 0,
        operationalCents: 0,
        teamHoursCents: 0,
        freelancersCents: 0,
        productionCents: 0,
        travelCents: 0,
        otherCents: 0,
        notes: null,
      },
      regenerateReceivables: false,
    })

    const custos = await db.saleCosts.where('saleId').equals(sale.id).toArray()
    expect(custos).toHaveLength(1)
    expect(primeiro(custos).adsCents).toBe(25_000)
  })
})

describe('excluir venda', () => {
  it('leva junto os títulos e os custos', async () => {
    const { sale } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      costs: {
        workspaceId: WORKSPACE,
        adsCents: 10_000,
        commissionCents: 0,
        bankFeeCents: 0,
        platformFeeCents: 0,
        operationalCents: 0,
        teamHoursCents: 0,
        freelancersCents: 0,
        productionCents: 0,
        travelCents: 0,
        otherCents: 0,
        notes: null,
      },
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })

    await ops.deleteSale({ saleId: sale.id, actorId: ATOR })

    expect(await db.sales.get(sale.id)).toBeUndefined()
    expect(await db.bills.where('saleId').equals(sale.id).count()).toBe(0)
    expect(await db.saleCosts.where('saleId').equals(sale.id).count()).toBe(0)
  })

  it('recusa quando há título recebido — o caixa não pode ficar sem origem', async () => {
    const account = await criarConta()
    const { sale, bills } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })

    await ops.settleBill({
      billId: primeiro(bills).id,
      amountCents: primeiro(bills).amountCents,
      date: '2026-08-16',
      accountId: account.id,
      actorId: ATOR,
    })

    await expect(ops.deleteSale({ saleId: sale.id, actorId: ATOR })).rejects.toThrow(
      /estorne as baixas/i,
    )
    expect(await db.sales.get(sale.id)).toBeDefined()
  })

  it('devolve para negociação o lead que tinha sido convertido', async () => {
    const now = new Date().toISOString()
    const lead: Lead = {
      id: newId(),
      workspaceId: WORKSPACE,
      name: 'Padaria do Bairro',
      company: null,
      email: null,
      phone: null,
      source: 'indicacao',
      stage: 'negociacao',
      ownerId: ATOR,
      estimatedValueCents: 300_000,
      enteredAt: '2026-08-01',
      lastContactAt: null,
      nextActionAt: null,
      nextActionNote: null,
      closedAt: null,
      lostReason: null,
      clientId: null,
      saleId: null,
      notes: null,
      createdBy: ATOR,
      createdAt: now,
      updatedAt: now,
    }
    await db.leads.add(lead)

    const { sale } = await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
      actorId: ATOR,
    })

    await ops.deleteSale({ saleId: sale.id, actorId: ATOR })

    const depois = await db.leads.get(lead.id)
    // A invariante "lead ganho tem venda atrás" continua verdadeira depois
    // da exclusão — senão o funil contaria uma conversão que não existe mais.
    expect(depois?.stage).toBe('negociacao')
    expect(depois?.saleId).toBeNull()

    const historico = await db.leadActivities.where('leadId').equals(lead.id).toArray()
    expect(historico.some((row) => row.summary.includes('Venda excluída'))).toBe(true)
  })
})

describe('excluir lançamento', () => {
  it('apaga as duas pernas de uma transferência', async () => {
    const origem = await criarConta()
    const destino = await criarConta()

    const pernas = await ops.createTransfer({
      workspaceId: WORKSPACE,
      fromAccountId: origem.id,
      toAccountId: destino.id,
      amountCents: 100_000,
      date: '2026-08-10',
      description: 'Aporte',
      actorId: ATOR,
    })

    await ops.deleteTransaction(primeiro(pernas).id)

    // Apagar só uma perna inventaria receita numa conta e despesa em nenhuma.
    expect(await db.transactions.count()).toBe(0)
  })

  it('recusa apagar a transação que veio de uma baixa', async () => {
    const account = await criarConta()
    const { bills } = await ops.createSaleWithReceivables({
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })

    const { transaction } = await ops.settleBill({
      billId: primeiro(bills).id,
      amountCents: primeiro(bills).amountCents,
      date: '2026-08-16',
      accountId: account.id,
      actorId: ATOR,
    })

    await expect(ops.deleteTransaction(transaction.id)).rejects.toThrow(/estorne a baixa/i)
    expect(await db.transactions.get(transaction.id)).toBeDefined()
  })
})
