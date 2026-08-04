import { nowIso } from '@/lib/date'
import type {
  Account,
  Board,
  BoardColumn,
  Category,
  CategoryKind,
  CostCenter,
  Id,
  Workspace,
  WorkspaceMember,
} from '../types'
import { DEFAULT_COMPANY } from '../defaults'
import { db } from './db'
import { newId } from './repository'

/**
 * Estrutura inicial do app.
 *
 * Aqui NÃO existem dados de exemplo: nenhuma transação, venda, cliente,
 * título ou meta. O app abre vazio, e o primeiro número que aparecer na tela
 * é um número que a Enjoy realmente lançou.
 *
 * O que este arquivo cria é só o esqueleto sem o qual não dá para usar o
 * produto: os dois espaços, uma conta em cada um, o plano de categorias e um
 * quadro kanban com as colunas certas. Tudo isso é editável em Configurações.
 *
 * O **usuário não nasce aqui** — nasce do cadastro (`signUp` em `./auth`).
 * Enquanto ninguém se cadastra, o banco fica vazio de propósito: um perfil
 * fantasma criado pelo sistema seria uma conta sem dono, sem senha e sem
 * responsável, e alguém acabaria usando como se fosse real.
 */

function stamp<T>(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, id: Id = newId()): T {
  const now = nowIso()
  return { ...(data as object), id, createdAt: now, updatedAt: now } as T
}

/** Plano de contas padrão de uma assessoria de marketing. */
const REVENUE_CATEGORIES: { name: string; recurring?: boolean }[] = [
  { name: 'Mensalidade', recurring: true },
  { name: 'Implantação' },
  { name: 'Projeto' },
  { name: 'Consultoria' },
  { name: 'Outras receitas' },
]

const EXPENSE_CATEGORIES: { name: string; costCenter: CostCenter }[] = [
  { name: 'Salários', costCenter: 'equipe' },
  { name: 'Pró-labore', costCenter: 'equipe' },
  { name: 'Freelancers', costCenter: 'producao' },
  { name: 'Tráfego pago', costCenter: 'marketing' },
  { name: 'Comissões', costCenter: 'comercial' },
  { name: 'Softwares', costCenter: 'tecnologia' },
  { name: 'Infraestrutura', costCenter: 'infraestrutura' },
  { name: 'Aluguel', costCenter: 'administrativo' },
  { name: 'Impostos', costCenter: 'impostos' },
  { name: 'Taxas bancárias', costCenter: 'financeiro' },
  { name: 'Operacional', costCenter: 'operacional' },
]

const PERSONAL_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  { name: 'Renda', kind: 'income' },
  { name: 'Moradia', kind: 'expense' },
  { name: 'Alimentação', kind: 'expense' },
  { name: 'Transporte', kind: 'expense' },
  { name: 'Saúde', kind: 'expense' },
  { name: 'Lazer', kind: 'expense' },
  { name: 'Outros', kind: 'expense' },
]

/**
 * Cria os espaços da primeira pessoa que se cadastra.
 *
 * Chamado por `signUp` quando ainda não existe nenhum espaço de empresa —
 * quem instala é quem manda, e por isso o vínculo já nasce `active` como
 * dono, sem passar pela fila de aprovação.
 */
export async function seedWorkspacesFor(ownerId: Id): Promise<void> {
  const company = stamp<Workspace>({
    name: DEFAULT_COMPANY.name,
    shortName: DEFAULT_COMPANY.shortName,
    type: 'team',
    ownerId,
    currency: 'BRL',
  })

  const personal = stamp<Workspace>({
    name: 'Pessoal',
    shortName: 'Pessoal',
    type: 'personal',
    ownerId,
    currency: 'BRL',
  })

  const members = [company, personal].map((workspace) =>
    stamp<WorkspaceMember>({
      workspaceId: workspace.id,
      userId: ownerId,
      role: 'owner',
      status: 'active',
      invitedBy: null,
      requestedRole: 'owner',
      decidedBy: ownerId,
      decidedAt: nowIso(),
      decisionNote: null,
    }),
  )

  const accounts = [
    stamp<Account>({
      workspaceId: company.id,
      name: 'Conta principal',
      type: 'checking',
      institution: null,
      openingBalanceCents: 0,
      archived: false,
    }),
    stamp<Account>({
      workspaceId: personal.id,
      name: 'Conta principal',
      type: 'checking',
      institution: null,
      openingBalanceCents: 0,
      archived: false,
    }),
  ]

  const categories: Category[] = [
    ...REVENUE_CATEGORIES.map((item) =>
      stamp<Category>({
        workspaceId: company.id,
        name: item.name,
        kind: 'income',
        costCenter: null,
        parentId: null,
        isRecurringRevenue: item.recurring ?? false,
        archived: false,
      }),
    ),
    ...EXPENSE_CATEGORIES.map((item) =>
      stamp<Category>({
        workspaceId: company.id,
        name: item.name,
        kind: 'expense',
        costCenter: item.costCenter,
        parentId: null,
        isRecurringRevenue: false,
        archived: false,
      }),
    ),
    ...PERSONAL_CATEGORIES.map((item) =>
      stamp<Category>({
        workspaceId: personal.id,
        name: item.name,
        kind: item.kind,
        costCenter: null,
        parentId: null,
        isRecurringRevenue: false,
        archived: false,
      }),
    ),
  ]

  // Quadro de contas a pagar. A última coluna liquida o título ao receber
  // um card — é o que faz o quadro valer mais do que uma lista de tarefas.
  const board = stamp<Board>({
    workspaceId: company.id,
    name: 'Contas a pagar',
    template: 'bills',
    description: 'Arraste um card até "Pago" para dar baixa no título e lançar no caixa.',
  })

  const columns = [
    { name: 'A pagar', action: 'none' as const },
    { name: 'Aguardando aprovação', action: 'none' as const },
    { name: 'Aprovado', action: 'none' as const },
    { name: 'Pago', action: 'settle_bill' as const },
  ].map((column, index) =>
    stamp<BoardColumn>({
      workspaceId: company.id,
      boardId: board.id,
      name: column.name,
      position: index,
      wipLimit: null,
      onDropAction: column.action,
    }),
  )

  await db.transaction(
    'rw',
    [db.workspaces, db.members, db.accounts, db.categories, db.boards, db.boardColumns],
    async () => {
      await db.workspaces.bulkAdd([company, personal])
      await db.members.bulkAdd(members)
      await db.accounts.bulkAdd(accounts)
      await db.categories.bulkAdd(categories)
      await db.boards.add(board)
      await db.boardColumns.bulkAdd(columns)
    },
  )
}
