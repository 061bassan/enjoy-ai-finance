/**
 * Contas fixas → "A pagar" → Entradas e saídas, sobre o banco real.
 *
 * O caminho que importa para o caixa atravessa três tabelas (regra, título,
 * transação), e cada peça isolada parece certa. Aqui se confere a corrente
 * inteira: a regra gera o título com a parcela certa, a baixa vira saída, e
 * o título cancelado não renasce na próxima geração.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RecurringRule } from '@/data/types'
import { LocalOperations } from './operations'
import { db, TABLE_NAMES } from './db'
import { newId } from './repository'

const ops = new LocalOperations()
const WORKSPACE = 'ws_teste'
const ATOR = 'user_teste'
const CONTA = 'conta_teste'

async function criarRegra(overrides: Partial<RecurringRule> = {}): Promise<RecurringRule> {
  const now = new Date().toISOString()
  const regra: RecurringRule = {
    id: newId(),
    workspaceId: WORKSPACE,
    name: 'HD externo',
    kind: 'expense',
    amountCents: 25_000,
    categoryId: null,
    costCenter: null,
    accountId: CONTA,
    clientId: null,
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 15,
    startDate: '2026-10-15',
    endDate: null,
    autoGenerate: true,
    autoSettle: false,
    active: true,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  await db.recurringRules.add(regra)
  return regra
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  for (const name of TABLE_NAMES) await db.table(name).clear()
})

describe('geração de títulos de conta parcelada', () => {
  it('grava a parcela em cada título e para na última', async () => {
    const regra = await criarRegra({
      installmentTotal: 4,
      installmentStart: 2,
      totalAmountCents: 100_000,
    })

    const bills = await ops.generateBillsFromRule(regra.id, '2027-12-31', ATOR)

    expect(bills.map((b) => [b.dueDate, b.installmentNumber, b.installmentTotal])).toEqual([
      ['2026-10-15', 2, 4],
      ['2026-11-15', 3, 4],
      ['2026-12-15', 4, 4],
    ])
    expect(bills.every((b) => b.direction === 'payable' && b.amountCents === 25_000)).toBe(true)
  })

  it('regra comum continua gerando título sem número de parcela', async () => {
    const regra = await criarRegra({ name: 'Aluguel' })
    const bills = await ops.generateBillsFromRule(regra.id, '2026-11-30', ATOR)
    expect(bills).toHaveLength(2)
    expect(bills.every((b) => b.installmentNumber == null && b.installmentTotal == null)).toBe(true)
  })

  it('o autor do título é quem gerou, não o workspace', async () => {
    // No Postgres `bills.created_by` referencia `profiles(id)`: com o id do
    // workspace ali a inserção era recusada e nenhum título nascia.
    const regra = await criarRegra({ name: 'Aluguel' })
    const bills = await ops.generateBillsFromRule(regra.id, '2026-10-31', ATOR)
    expect(bills.map((b) => b.createdBy)).toEqual([ATOR])
  })

  it('título cancelado não é gerado de novo', async () => {
    const regra = await criarRegra({ name: 'Aluguel' })
    const [outubro] = await ops.generateBillsFromRule(regra.id, '2026-10-31', ATOR)
    if (!outubro) throw new Error('O título de outubro não foi gerado.')

    await db.bills.update(outubro.id, { status: 'canceled' })
    const again = await ops.generateBillsFromRule(regra.id, '2026-11-30', ATOR)

    expect(again.map((b) => b.dueDate)).toEqual(['2026-11-15'])
    expect((await db.bills.get(outubro.id))?.status).toBe('canceled')
  })
})

describe('baixa do título gerado pela regra', () => {
  it('vira saída em Entradas e saídas, ligada ao título', async () => {
    const regra = await criarRegra({ installmentTotal: 10, installmentStart: 3 })
    const [titulo] = await ops.generateBillsFromRule(regra.id, '2026-10-31', ATOR)
    if (!titulo) throw new Error('O título não foi gerado.')

    const { bill, transaction } = await ops.settleBill({
      billId: titulo.id,
      amountCents: titulo.amountCents,
      date: '2026-10-15',
      accountId: CONTA,
      actorId: ATOR,
    })

    expect(bill.status).toBe('paid')
    expect(transaction.kind).toBe('expense')
    expect(transaction.amountCents).toBe(25_000)
    expect(transaction.billId).toBe(titulo.id)
    expect(await db.transactions.count()).toBe(1)
  })

  it('título cancelado não aceita baixa — não há saída dupla no caixa', async () => {
    const regra = await criarRegra()
    const [titulo] = await ops.generateBillsFromRule(regra.id, '2026-10-31', ATOR)
    if (!titulo) throw new Error('O título não foi gerado.')
    await db.bills.update(titulo.id, { status: 'canceled' })

    await expect(
      ops.settleBill({
        billId: titulo.id,
        amountCents: titulo.amountCents,
        date: '2026-10-15',
        accountId: CONTA,
        actorId: ATOR,
      }),
    ).rejects.toThrow()
    expect(await db.transactions.count()).toBe(0)
  })
})
