/**
 * Conversão de lead em venda, sobre o banco real.
 *
 * É a operação que fecha o ciclo do funil: cliente, venda e títulos a receber
 * nascem juntos, e a taxa de conversão passa a ser apurada em vez de digitada.
 *
 * Testar aqui e não só no domínio é deliberado — o risco desta operação não é
 * de cálculo, é de consistência: uma venda criada sem o cliente, ou um lead
 * marcado como ganho sem venda atrás, produz um número que parece certo na
 * tela e está errado no banco.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { conversionRate } from '@/domain/leads'
import type { NewEntity } from '@/data/contracts'
import type { Lead, Sale } from '@/data/types'
import { LocalOperations } from './operations'
import { db, TABLE_NAMES } from './db'
import { newId } from './repository'

const ops = new LocalOperations()
const WORKSPACE = 'ws_teste'
const ATOR = 'user_teste'

async function criarLead(overrides: Partial<Lead> = {}): Promise<Lead> {
  const now = new Date().toISOString()
  const lead: Lead = {
    id: newId(),
    workspaceId: WORKSPACE,
    name: 'Padaria do Bairro',
    company: 'Padaria do Bairro ME',
    email: 'contato@padaria.com.br',
    phone: '11987654321',
    source: 'indicacao',
    stage: 'negociacao',
    ownerId: ATOR,
    estimatedValueCents: 300_000,
    enteredAt: '2026-08-01',
    lastContactAt: null,
    nextActionAt: '2026-08-20',
    nextActionNote: 'Fechar contrato',
    closedAt: null,
    lostReason: null,
    clientId: null,
    saleId: null,
    notes: null,
    createdBy: ATOR,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  await db.leads.add(lead)
  return lead
}

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

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  for (const name of TABLE_NAMES) await db.table(name).clear()
})

describe('mover etapa', () => {
  it('registra a mudança na linha do tempo sem depender de ninguém anotar', async () => {
    const lead = await criarLead({ stage: 'novo' })

    await ops.moveLeadStage({ leadId: lead.id, toStage: 'reuniao', actorId: ATOR })

    const activities = await db.leadActivities.where('leadId').equals(lead.id).toArray()
    expect(activities).toHaveLength(1)
    expect(activities[0]?.kind).toBe('mudanca_etapa')
    expect(activities[0]?.fromStage).toBe('novo')
    expect(activities[0]?.toStage).toBe('reuniao')
  })

  it('avançar conta como contato — senão o lead apareceria como esquecido', async () => {
    const lead = await criarLead({ stage: 'novo', lastContactAt: null })

    const updated = await ops.moveLeadStage({
      leadId: lead.id,
      toStage: 'contato',
      actorId: ATOR,
    })

    expect(updated.lastContactAt).toBeTruthy()
  })

  it('perder carimba o fechamento e guarda o motivo', async () => {
    const lead = await criarLead()

    const updated = await ops.moveLeadStage({
      leadId: lead.id,
      toStage: 'perdido',
      actorId: ATOR,
      lostReason: 'preço acima do orçamento',
    })

    expect(updated.closedAt).toBeTruthy()
    expect(updated.lostReason).toBe('preço acima do orçamento')
    // A ação combinada morreu com o fechamento; cobrar por ela seria ruído.
    expect(updated.nextActionAt).toBeNull()
  })

  it('reabrir um perdido limpa o fechamento e o motivo', async () => {
    const lead = await criarLead()
    await ops.moveLeadStage({ leadId: lead.id, toStage: 'perdido', actorId: ATOR, lostReason: 'x' })

    const reaberto = await ops.moveLeadStage({
      leadId: lead.id,
      toStage: 'negociacao',
      actorId: ATOR,
    })

    expect(reaberto.closedAt).toBeNull()
    expect(reaberto.lostReason).toBeNull()
  })

  it('recusa marcar como ganho por troca de etapa (invariante 13)', async () => {
    // Ganho tem venda atrás; o caminho é converter, não etiquetar. A RPC do
    // Supabase recusa igual — os dois providers precisam concordar.
    const lead = await criarLead()
    await expect(
      ops.moveLeadStage({ leadId: lead.id, toStage: 'ganho', actorId: ATOR }),
    ).rejects.toThrow()

    const intocado = await db.leads.get(lead.id)
    expect(intocado?.stage).not.toBe('ganho')
  })
})

describe('converter em venda', () => {
  it('cria cliente, venda e títulos numa operação só', async () => {
    const lead = await criarLead()

    const result = await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
      actorId: ATOR,
    })

    expect(result.client.name).toBe('Padaria do Bairro')
    expect(result.client.status).toBe('active')
    // Setup + 12 mensalidades.
    expect(result.bills).toHaveLength(13)
    expect(result.lead.stage).toBe('ganho')
  })

  it('amarra lead, cliente e venda nos dois sentidos', async () => {
    const lead = await criarLead()

    const result = await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: false,
      actorId: ATOR,
    })

    expect(result.lead.saleId).toBe(result.sale.id)
    expect(result.lead.clientId).toBe(result.client.id)
    expect(result.sale.leadId).toBe(lead.id)
    expect(result.sale.clientId).toBe(result.client.id)
  })

  it('herda a entrada do lead como marco do tempo de fechamento', async () => {
    const lead = await criarLead({ enteredAt: '2026-07-05' })

    const result = await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: false,
      actorId: ATOR,
    })

    // Vem do CRM, não do formulário: é o dado que já existe e não erra.
    expect(result.sale.leadCreatedAt).toBe('2026-07-05')
    expect(result.sale.leadSource).toBe('indicacao')
  })

  it('reaproveita o cliente quando o lead já aponta para um', async () => {
    const now = new Date().toISOString()
    const clientId = newId()
    await db.clients.add({
      id: clientId,
      workspaceId: WORKSPACE,
      name: 'Padaria do Bairro',
      company: null,
      email: null,
      phone: null,
      status: 'churned',
      source: null,
      startDate: '2025-01-01',
      churnDate: '2026-01-01',
      ownerId: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })

    const lead = await criarLead({ clientId })

    const result = await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: false,
      actorId: ATOR,
    })

    // Duplicar a carteira faria receita por cliente e churn contarem a mesma
    // empresa duas vezes.
    expect(await db.clients.count()).toBe(1)
    expect(result.client.id).toBe(clientId)
    // Cliente que voltou deixa de ser churn.
    expect(result.client.status).toBe('active')
    expect(result.client.churnDate).toBeNull()
  })

  it('não converte o mesmo lead duas vezes', async () => {
    const lead = await criarLead()
    await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: false,
      actorId: ATOR,
    })

    await expect(
      ops.convertLeadToSale({
        leadId: lead.id,
        sale: vendaBase(),
        generateReceivables: false,
        actorId: ATOR,
      }),
    ).rejects.toThrow('Este lead já foi convertido em venda.')
  })

  it('gera os mesmos títulos que uma venda digitada à mão', async () => {
    const lead = await criarLead()

    const viaCrm = await ops.convertLeadToSale({
      leadId: lead.id,
      sale: vendaBase(),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
      actorId: ATOR,
    })

    const viaFormulario = await ops.createSaleWithReceivables({
      sale: vendaBase({ clientName: 'Outro Cliente' }),
      generateReceivables: true,
      firstDueDate: '2026-08-15',
    })

    // Uma venda vinda do CRM que parcelasse diferente de uma digitada seria
    // um bug impossível de achar: os dois caminhos parecem certos sozinhos.
    expect(viaCrm.bills.map((b) => [b.amountCents, b.dueDate])).toEqual(
      viaFormulario.bills.map((b) => [b.amountCents, b.dueDate]),
    )
  })
})

describe('conversão apurada de ponta a ponta', () => {
  it('o número sai sozinho depois de converter', async () => {
    const range = { from: '2026-08-01', to: '2026-08-31' }

    await criarLead({ name: 'Lead 1' })
    await criarLead({ name: 'Lead 2' })
    await criarLead({ name: 'Lead 3' })
    await criarLead({ name: 'Lead 4' })

    const antes = conversionRate({
      leads: await db.leads.toArray(),
      sales: await db.sales.toArray(),
      range,
    })
    expect(antes.ratio).toBe(0)

    const alvo = (await db.leads.toArray())[0]!
    await ops.convertLeadToSale({
      leadId: alvo.id,
      sale: vendaBase(),
      generateReceivables: false,
      actorId: ATOR,
    })

    const depois = conversionRate({
      leads: await db.leads.toArray(),
      sales: await db.sales.toArray(),
      range,
    })

    // 1 venda ÷ 4 leads = 25%. Ninguém digitou nenhum dos dois números.
    expect(depois.ratio).toBe(0.25)
    expect(depois.origin).toBe('crm')
  })
})
