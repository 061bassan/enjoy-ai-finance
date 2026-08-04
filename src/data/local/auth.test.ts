/**
 * Fluxo de cadastro e aprovação, ponta a ponta sobre o banco real.
 *
 * Os outros testes cobrem funções puras. Este cobre o que elas não alcançam:
 * a interação entre `signUp`, a fila de aprovação e a sessão — que é
 * exatamente onde um erro passaria despercebido, porque cada peça parece
 * correta sozinha.
 *
 * Vale mais do que parece agora: quando o provider Supabase for escrito, este
 * arquivo é o contrato que ele precisa satisfazer. Se `signUp` lá se
 * comportar diferente do daqui, a diferença aparece aqui e não em produção.
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalAuth } from './auth'
import { LocalOperations } from './operations'
import { db, TABLE_NAMES } from './db'

const auth = new LocalAuth()
const ops = new LocalOperations()

const FUNDADOR = {
  name: 'Rafael Bassan',
  email: 'rafael@enjoyscale.com.br',
  password: 'senhaforte1',
  cpf: '11144477735',
  birthDate: '1990-05-10',
  phone: '11987654321',
  requestedRole: 'owner' as const,
}

const CANDIDATO = {
  name: 'Marina Souza',
  email: 'marina@enjoyscale.com.br',
  password: 'outrasenha2',
  cpf: '52998224725',
  birthDate: '1995-03-22',
  phone: '11912345678',
  requestedRole: 'finance' as const,
}

beforeEach(async () => {
  // `localStorage` não existe no ambiente `node` do Vitest, e é onde a sessão
  // é guardada. Um objeto em memória basta: o que se testa aqui é o banco.
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } as Storage

  if (!db.isOpen()) await db.open()
  for (const name of TABLE_NAMES) await db.table(name).clear()
})

describe('primeiro cadastro', () => {
  it('vira dono e já entra liberado', async () => {
    const session = await auth.signUp(FUNDADOR)

    // Sem esta regra o produto travaria no primeiro uso: não existiria
    // ninguém com poder para aprovar o primeiro pedido.
    expect(session.status).toBe('active')
    expect(session.role).toBe('owner')
  })

  it('cria os espaços da empresa e pessoal', async () => {
    await auth.signUp(FUNDADOR)

    const workspaces = await db.workspaces.toArray()
    expect(workspaces.map((w) => w.type).sort()).toEqual(['personal', 'team'])

    // O esqueleto operacional nasce junto — sem conta e sem categorias não dá
    // para lançar nada.
    expect(await db.accounts.count()).toBeGreaterThan(0)
    expect(await db.categories.count()).toBeGreaterThan(0)
  })

  it('nunca grava a senha em claro', async () => {
    await auth.signUp(FUNDADOR)
    const profile = await db.profiles.where('email').equals(FUNDADOR.email).first()

    expect(profile?.passwordHash).toBeTruthy()
    expect(profile?.passwordHash).not.toContain(FUNDADOR.password)
    expect(profile?.passwordHash?.startsWith('pbkdf2$')).toBe(true)
  })

  it('guarda CPF e telefone só com dígitos', async () => {
    await auth.signUp({ ...FUNDADOR, cpf: '111.444.777-35', phone: '(11) 98765-4321' })
    const profile = await db.profiles.where('email').equals(FUNDADOR.email).first()

    // Máscara é apresentação. Guardá-la faria "111.444.777-35" e
    // "11144477735" serem duas pessoas diferentes.
    expect(profile?.cpf).toBe('11144477735')
    expect(profile?.phone).toBe('11987654321')
  })
})

describe('cadastro seguinte', () => {
  beforeEach(async () => {
    await auth.signUp(FUNDADOR)
    await auth.signOut()
  })

  it('entra pendente, sem o cargo pedido', async () => {
    const session = await auth.signUp(CANDIDATO)

    expect(session.status).toBe('pending')
    expect(session.requestedRole).toBe('finance')
    // O cargo pedido não vale nada antes da decisão.
    expect(session.role).toBe('viewer')
  })

  it('recusa e-mail já cadastrado', async () => {
    await auth.signUp(CANDIDATO)
    await expect(auth.signUp({ ...CANDIDATO, cpf: '11144477735' })).rejects.toThrow(
      'Já existe uma conta com este e-mail.',
    )
  })

  it('recusa CPF já cadastrado, mesmo com e-mail diferente', async () => {
    await auth.signUp(CANDIDATO)
    await expect(
      auth.signUp({ ...CANDIDATO, email: 'outra@enjoyscale.com.br' }),
    ).rejects.toThrow('Já existe uma conta com este CPF.')
  })

  it('não lista o espaço para quem ainda não foi liberado', async () => {
    await auth.signUp(CANDIDATO)

    // Mostrar no seletor um espaço sem acesso convidaria ao clique que dá erro.
    expect(await auth.listMyWorkspaces()).toHaveLength(0)
  })
})

describe('entrada com senha', () => {
  beforeEach(async () => {
    await auth.signUp(FUNDADOR)
    await auth.signOut()
  })

  it('entra com a senha correta', async () => {
    const session = await auth.signIn(FUNDADOR.email, FUNDADOR.password)
    expect(session.user.email).toBe(FUNDADOR.email)
  })

  it('recusa senha errada', async () => {
    await expect(auth.signIn(FUNDADOR.email, 'errada123')).rejects.toThrow(
      'E-mail ou senha incorretos.',
    )
  })

  it('não revela se o e-mail existe', async () => {
    // Mensagem idêntica nos dois casos: distinguir entregaria a lista de quem
    // tem conta a quem estiver tentando adivinhar.
    await expect(auth.signIn('ninguem@enjoyscale.com.br', 'x')).rejects.toThrow(
      'E-mail ou senha incorretos.',
    )
  })

  it('ignora maiúsculas e espaços no e-mail', async () => {
    const session = await auth.signIn('  RAFAEL@EnjoyScale.com.BR ', FUNDADOR.password)
    expect(session.user.email).toBe(FUNDADOR.email)
  })

  it('oferece definir senha em conta legada', async () => {
    const profile = await db.profiles.where('email').equals(FUNDADOR.email).first()
    await db.profiles.put({ ...profile!, passwordHash: null })

    // Trancar essas contas para fora apagaria acesso a dados reais.
    await expect(auth.signIn(FUNDADOR.email, 'qualquer1')).rejects.toMatchObject({
      code: 'PASSWORD_NOT_SET',
    })

    const session = await auth.setInitialPassword(FUNDADOR.email, 'novasenha1')
    expect(session.status).toBe('active')
    await expect(auth.signIn(FUNDADOR.email, 'novasenha1')).resolves.toBeTruthy()
  })
})

describe('decisão sobre o pedido', () => {
  let fundadorId: string
  let pedidoId: string

  beforeEach(async () => {
    const fundador = await auth.signUp(FUNDADOR)
    fundadorId = fundador.user.id
    await auth.signOut()
    await auth.signUp(CANDIDATO)

    const pending = await db.members.where('status').equals('pending').first()
    pedidoId = pending!.id
  })

  it('aprovar concede o cargo e libera a sessão', async () => {
    await ops.approveMember({ memberId: pedidoId, grantedRole: 'finance', actorId: fundadorId })

    const session = await auth.getSession()
    expect(session?.status).toBe('active')
    expect(session?.role).toBe('finance')
    // A partir daqui o espaço aparece no seletor.
    expect(await auth.listMyWorkspaces()).toHaveLength(1)
  })

  it('aprovar registra quem decidiu e quando', async () => {
    await ops.approveMember({
      memberId: pedidoId,
      grantedRole: 'sales',
      actorId: fundadorId,
      note: 'entrou como closer',
    })

    const member = await db.members.get(pedidoId)
    expect(member?.decidedBy).toBe(fundadorId)
    expect(member?.decidedAt).toBeTruthy()
    expect(member?.decisionNote).toBe('entrou como closer')
    // O que a pessoa pediu continua registrado, mesmo tendo recebido outro.
    expect(member?.requestedRole).toBe('finance')
  })

  it('recusar mantém a linha no banco', async () => {
    await ops.rejectMember({ memberId: pedidoId, actorId: fundadorId, note: 'não é do time' })

    const member = await db.members.get(pedidoId)
    expect(member).toBeTruthy()
    expect(member?.status).toBe('rejected')
    expect(member?.decisionNote).toBe('não é do time')
    // Apagar deixaria a mesma pessoa recadastrando sem ninguém lembrar.
    expect(member?.requestedRole).toBe('finance')
  })

  it('recusado continua entrando, mas sem acesso', async () => {
    await ops.rejectMember({ memberId: pedidoId, actorId: fundadorId, note: 'engano' })

    const session = await auth.getSession()
    expect(session?.status).toBe('rejected')
    expect(session?.role).toBe('viewer')
    // A tela de espera precisa poder explicar o motivo.
    expect(session?.decisionNote).toBe('engano')
  })

  it('ninguém aprova o próprio cadastro', async () => {
    const pending = await db.members.get(pedidoId)

    await expect(
      ops.approveMember({
        memberId: pedidoId,
        grantedRole: 'admin',
        actorId: pending!.userId,
      }),
    ).rejects.toThrow('Ninguém pode aprovar o próprio cadastro.')
  })

  it('não aprova duas vezes', async () => {
    await ops.approveMember({ memberId: pedidoId, grantedRole: 'finance', actorId: fundadorId })

    await expect(
      ops.approveMember({ memberId: pedidoId, grantedRole: 'admin', actorId: fundadorId }),
    ).rejects.toThrow('Este acesso já está liberado.')
  })
})

describe('backup', () => {
  it('não leva o hash da senha embora', async () => {
    const session = await auth.signUp(FUNDADOR)
    const payload = await ops.exportWorkspace(session.workspaceId)

    const profiles = payload.profiles as { passwordHash: string | null }[]
    expect(profiles).toHaveLength(1)
    // O arquivo circula por e-mail e WhatsApp. Hash não é senha, mas é
    // material para ataque offline — e quase todo mundo reusa senha.
    expect(profiles[0]?.passwordHash).toBeNull()
  })

  it('restaurar não apaga a senha de quem já está na base', async () => {
    const session = await auth.signUp(FUNDADOR)
    const payload = await ops.exportWorkspace(session.workspaceId)

    await ops.importWorkspace(payload)

    // Sem esta preservação, reimportar o próprio backup trancaria a pessoa
    // para fora — o restore viraria uma armadilha.
    await expect(auth.signIn(FUNDADOR.email, FUNDADOR.password)).resolves.toBeTruthy()
  })
})
