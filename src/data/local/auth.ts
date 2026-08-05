import { nowIso } from '@/lib/date'
import { hashPassword, verifyPassword } from '@/lib/password'
import { normalizeEmail, normalizeName, onlyDigits } from '@/lib/validators'
import { isFirstMember } from '@/domain/membership'
import type { AuthGateway, SignUpInput } from '../contracts'
import { AUTH_ERROR, AuthError } from '../errors'
import type { Id, Profile, Role, Session, Workspace, WorkspaceMember } from '../types'
import { db } from './db'
import { newId } from './repository'
import { seedWorkspacesFor } from './seed'

const SESSION_KEY = 'enjoy.session'
const THROTTLE_KEY = 'enjoy.signin.attempts'

/**
 * Por quanto tempo uma sessão parada continua valendo.
 *
 * Doze horas cobrem um dia de trabalho inteiro sem pedir senha de novo, e
 * fecham a porta do notebook esquecido aberto na mesa. Sem prazo nenhum, a
 * sessão gravada no `localStorage` durava para sempre — quem sentasse na
 * mesma máquina no dia seguinte entrava como a pessoa anterior.
 */
const SESSION_MAX_IDLE_MS = 12 * 60 * 60 * 1000

/** A partir de quantos erros seguidos o login começa a esperar. */
const THROTTLE_AFTER_ATTEMPTS = 5
/** Teto da espera: 30 segundos entre tentativas. */
const THROTTLE_MAX_MS = 30_000

interface StoredSession {
  userId: Id
  workspaceId: Id
  /** Último uso — base da expiração por inatividade. */
  seenAt?: number
}

/**
 * Autenticação local.
 *
 * A senha é derivada com PBKDF2 antes de tocar o banco (ver `@/lib/password`)
 * — não porque isso protegeria de quem tem o dispositivo, mas porque o backup
 * JSON circula por aí e não pode carregar senha em claro.
 *
 * A classe inteira é substituída pelo Supabase Auth na Fase 9. Nenhuma tela
 * muda junto, porque as duas implementam `AuthGateway`.
 */
export class LocalAuth implements AuthGateway {
  private listeners = new Set<(session: Session | null) => void>()

  private read(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null

      const stored = JSON.parse(raw) as StoredSession
      if (!stored?.userId) return null

      // Sessão parada tempo demais não vale mais. Sessões gravadas antes
      // desta regra não têm `seenAt`: valem por mais uma abertura, que
      // carimba o campo — expulsar todo mundo de uma vez seria pior.
      if (stored.seenAt != null && Date.now() - stored.seenAt > SESSION_MAX_IDLE_MS) {
        localStorage.removeItem(SESSION_KEY)
        return null
      }

      return stored
    } catch {
      return null
    }
  }

  private write(value: { userId: Id; workspaceId: Id } | null) {
    if (value) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...value, seenAt: Date.now() }))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  // -------------------------------------------------------------------------
  // Freio de tentativas
  // -------------------------------------------------------------------------

  /**
   * Espera crescente depois de erros seguidos de senha.
   *
   * **Isto não é proteção contra um atacante com o dispositivo**: quem abre o
   * DevTools limpa o contador ou lê o IndexedDB direto. Serve contra o caso
   * real e comum — alguém sentado na máquina tentando adivinhar a senha do
   * sócio na mão, ou um script bobo na mesma aba. Fica no `localStorage`, e
   * não em memória, porque em memória bastaria recarregar a página.
   *
   * A trava de verdade chega com o Supabase Auth, que aplica o limite no
   * servidor, onde ninguém alcança.
   */
  private failedAttempts(email: string): number {
    try {
      const raw = localStorage.getItem(THROTTLE_KEY)
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
      return map[email] ?? 0
    } catch {
      return 0
    }
  }

  private recordAttempt(email: string, failed: boolean) {
    try {
      const raw = localStorage.getItem(THROTTLE_KEY)
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
      if (failed) map[email] = (map[email] ?? 0) + 1
      else delete map[email]
      localStorage.setItem(THROTTLE_KEY, JSON.stringify(map))
    } catch {
      // Armazenamento cheio ou bloqueado: o login não pode falhar por causa
      // do contador — ele é defesa extra, não requisito.
    }
  }

  private async waitForThrottle(email: string) {
    const attempts = this.failedAttempts(email)
    if (attempts < THROTTLE_AFTER_ATTEMPTS) return

    const delay = Math.min(THROTTLE_MAX_MS, 2 ** (attempts - THROTTLE_AFTER_ATTEMPTS) * 1000)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  private async notify() {
    const session = await this.getSession()
    this.listeners.forEach((cb) => cb(session))
  }

  // -------------------------------------------------------------------------
  // Resolução de vínculo
  // -------------------------------------------------------------------------

  /**
   * O vínculo da pessoa com o workspace, seja qual for a situação.
   *
   * Devolve pendentes e recusados de propósito: é o que permite montar a
   * sessão de quem ainda não foi liberado e mostrar a tela de espera. Antes,
   * só `active` contava, e um pendente simplesmente não conseguia entrar —
   * ficando sem saber se o cadastro chegou.
   */
  private async membershipIn(workspaceId: Id, userId: Id): Promise<WorkspaceMember | null> {
    const member = await db.members
      .where('[workspaceId+userId]')
      .equals([workspaceId, userId])
      .first()
    if (member) return member

    // O dono sempre tem acesso, mesmo sem linha de membro (espaço pessoal).
    const workspace = await db.workspaces.get(workspaceId)
    if (workspace?.ownerId !== userId) return null

    return {
      id: `virtual_${workspaceId}`,
      workspaceId,
      userId,
      role: 'owner',
      status: 'active',
      invitedBy: null,
      requestedRole: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }
  }

  private toSession(user: Profile, member: WorkspaceMember): Session {
    return {
      user,
      workspaceId: member.workspaceId,
      // Cargo só vale quando o vínculo está ativo. Um pendente que pediu
      // "Administrador" continua sendo tratado como visitante até a decisão.
      role: member.status === 'active' ? member.role : 'viewer',
      status: member.status,
      requestedRole: member.requestedRole ?? null,
      decisionNote: member.decisionNote ?? null,
    }
  }

  /** Todos os vínculos da pessoa, ativos primeiro. */
  private async membershipsOf(userId: Id): Promise<WorkspaceMember[]> {
    const direct = await db.members.where('userId').equals(userId).toArray()

    // Espaços de que a pessoa é dona podem não ter linha de membro.
    const owned = await db.workspaces.where('ownerId').equals(userId).toArray()
    for (const workspace of owned) {
      if (direct.some((m) => m.workspaceId === workspace.id)) continue
      const virtual = await this.membershipIn(workspace.id, userId)
      if (virtual) direct.push(virtual)
    }

    const rank: Record<string, number> = {
      active: 0,
      pending: 1,
      invited: 2,
      rejected: 3,
      suspended: 4,
    }
    return direct.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
  }

  private async primaryMembership(userId: Id): Promise<WorkspaceMember | null> {
    const all = await this.membershipsOf(userId)
    return all[0] ?? null
  }

  // -------------------------------------------------------------------------
  // Sessão
  // -------------------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    const stored = this.read()
    if (!stored) return null

    const user = await db.profiles.get(stored.userId)
    if (!user) {
      this.write(null)
      return null
    }

    const member = await this.membershipIn(stored.workspaceId, stored.userId)
    if (member) {
      // Abrir o app conta como uso: renova o prazo de inatividade.
      this.write({ userId: stored.userId, workspaceId: stored.workspaceId })
      return this.toSession(user, member)
    }

    // Perdeu o vínculo com o espaço guardado: cai no primeiro disponível.
    const fallback = await this.primaryMembership(stored.userId)
    if (!fallback) {
      this.write(null)
      return null
    }
    this.write({ userId: stored.userId, workspaceId: fallback.workspaceId })
    return this.toSession(user, fallback)
  }

  async signIn(email: string, password: string): Promise<Session> {
    const normalized = normalizeEmail(email)
    await this.waitForThrottle(normalized)

    const user = await db.profiles.where('email').equals(normalized).first()
    if (!user) {
      // Mensagem genérica de propósito: dizer "e-mail não existe" entrega a
      // lista de quem tem conta a quem estiver tentando adivinhar.
      this.recordAttempt(normalized, true)
      throw new AuthError(AUTH_ERROR.invalidCredentials, 'E-mail ou senha incorretos.')
    }

    if (!user.passwordHash) {
      throw new AuthError(
        AUTH_ERROR.passwordNotSet,
        'Esta conta ainda não tem senha. Defina uma para continuar.',
      )
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      this.recordAttempt(normalized, true)
      throw new AuthError(AUTH_ERROR.invalidCredentials, 'E-mail ou senha incorretos.')
    }

    this.recordAttempt(normalized, false)
    return this.startSession(user)
  }

  async setInitialPassword(email: string, password: string): Promise<Session> {
    const normalized = normalizeEmail(email)
    const user = await db.profiles.where('email').equals(normalized).first()
    if (!user) throw new AuthError(AUTH_ERROR.invalidCredentials, 'E-mail ou senha incorretos.')
    if (user.passwordHash) {
      throw new AuthError(AUTH_ERROR.invalidCredentials, 'Esta conta já tem senha definida.')
    }

    const updated: Profile = {
      ...user,
      passwordHash: await hashPassword(password),
      updatedAt: nowIso(),
    }
    await db.profiles.put(updated)
    return this.startSession(updated)
  }

  /**
   * Contas legadas que ainda não têm senha.
   *
   * Só faz sentido no modo local, onde o banco inteiro já é do dono do
   * dispositivo — não há informação a proteger que ele ainda não tenha.
   */
  async listAccountsWithoutPassword(): Promise<string[]> {
    const profiles = await db.profiles.toArray()
    return profiles.filter((profile) => !profile.passwordHash).map((profile) => profile.email)
  }

  private async startSession(user: Profile): Promise<Session> {
    const member = await this.primaryMembership(user.id)
    if (!member)
      throw new AuthError(AUTH_ERROR.noWorkspace, 'Este usuário não pertence a nenhum espaço.')

    this.write({ userId: user.id, workspaceId: member.workspaceId })
    void this.notify()
    return this.toSession(user, member)
  }

  // -------------------------------------------------------------------------
  // Cadastro
  // -------------------------------------------------------------------------

  /**
   * Cria a conta e o pedido de acesso.
   *
   * Duas situações, e a diferença entre elas é o que faz o produto abrir sem
   * ovo-e-galinha:
   *
   * - **Base vazia** — quem se cadastra é o fundador. O espaço da empresa e o
   *   pessoal nascem aqui, e o vínculo já sai `active` como dono. Não haveria
   *   quem aprovasse o primeiro pedido.
   * - **Base com empresa** — o pedido entra `pending` com o cargo pretendido
   *   guardado em `requestedRole`. Até a decisão, o cargo efetivo é `viewer`.
   *
   * Só o fundador ganha espaço pessoal. É deliberado: "Pessoal" são as
   * finanças do sócio, não um espaço por funcionário — quem entra a convite
   * vem operar a empresa.
   */
  async signUp(input: SignUpInput): Promise<Session> {
    const email = normalizeEmail(input.email)
    const cpf = onlyDigits(input.cpf)

    const existingEmail = await db.profiles.where('email').equals(email).first()
    if (existingEmail) {
      throw new AuthError(AUTH_ERROR.emailTaken, 'Já existe uma conta com este e-mail.')
    }

    const allProfiles = await db.profiles.toArray()
    if (allProfiles.some((profile) => profile.cpf && onlyDigits(profile.cpf) === cpf)) {
      throw new AuthError(AUTH_ERROR.cpfTaken, 'Já existe uma conta com este CPF.')
    }

    // O hash fica fora da transação: é a operação mais cara do fluxo e não
    // toca no banco. Segurar uma transação Dexie durante 100 mil iterações
    // de PBKDF2 bloquearia qualquer outra escrita nesse intervalo.
    const passwordHash = await hashPassword(input.password)
    const now = nowIso()

    const profile: Profile = {
      id: newId(),
      name: normalizeName(input.name),
      email,
      cpf,
      birthDate: input.birthDate,
      phone: onlyDigits(input.phone),
      passwordHash,
      avatarUrl: null,
      jobTitle: null,
      createdAt: now,
      updatedAt: now,
    }

    await db.profiles.add(profile)

    const company = await db.workspaces.where('type').equals('team').first()

    if (!company) {
      await seedWorkspacesFor(profile.id)
      return this.startSession(profile)
    }

    const existingMembers = await db.members.where('workspaceId').equals(company.id).toArray()
    const first = isFirstMember(existingMembers)

    const member: WorkspaceMember = {
      id: newId(),
      workspaceId: company.id,
      userId: profile.id,
      role: first ? 'owner' : 'viewer',
      status: first ? 'active' : 'pending',
      invitedBy: null,
      requestedRole: input.requestedRole,
      decidedBy: null,
      decidedAt: first ? now : null,
      decisionNote: null,
      createdAt: now,
      updatedAt: now,
    }

    await db.members.add(member)
    return this.startSession(profile)
  }

  // -------------------------------------------------------------------------
  // Resto do contrato
  // -------------------------------------------------------------------------

  async signOut(): Promise<void> {
    this.write(null)
    await this.notify()
  }

  async switchWorkspace(workspaceId: Id): Promise<Session> {
    const stored = this.read()
    if (!stored) throw new AuthError(AUTH_ERROR.noSession, 'Nenhuma sessão ativa.')

    const member = await this.membershipIn(workspaceId, stored.userId)
    if (!member || member.status !== 'active') {
      throw new AuthError(AUTH_ERROR.noAccess, 'Você não tem acesso a este espaço.')
    }

    const user = await db.profiles.get(stored.userId)
    if (!user)
      throw new AuthError(AUTH_ERROR.invalidCredentials, 'Usuário da sessão não existe mais.')

    this.write({ userId: stored.userId, workspaceId })
    void this.notify()
    return this.toSession(user, member)
  }

  onAuthChange(callback: (session: Session | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Espaços que a pessoa pode abrir.
   *
   * Só os ativos: mostrar no seletor um espaço que ainda aguarda aprovação
   * convidaria ao clique que dá erro.
   */
  async listMyWorkspaces(): Promise<{ workspace: Workspace; role: Role }[]> {
    const stored = this.read()
    if (!stored) return []

    const memberships = await this.membershipsOf(stored.userId)
    const result: { workspace: Workspace; role: Role }[] = []

    for (const membership of memberships) {
      if (membership.status !== 'active') continue
      const workspace = await db.workspaces.get(membership.workspaceId)
      if (workspace) result.push({ workspace, role: membership.role })
    }

    // Equipe antes de pessoal, e alfabético dentro de cada grupo.
    return result.sort((a, b) => {
      if (a.workspace.type !== b.workspace.type) return a.workspace.type === 'team' ? -1 : 1
      return a.workspace.name.localeCompare(b.workspace.name, 'pt-BR')
    })
  }
}
