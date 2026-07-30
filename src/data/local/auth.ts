import type { AuthGateway } from '../contracts'
import type { Id, Role, Session, Workspace } from '../types'
import { db } from './db'

const SESSION_KEY = 'enjoy.session'

/**
 * Autenticação local.
 *
 * Não há verificação de senha: qualquer senha entra, desde que o e-mail
 * exista entre os perfis semeados. Isso é deliberado — no modo local não há
 * segredo a proteger e a barreira só atrapalharia o teste do produto.
 * A autenticação real chega junto com o Supabase Auth na Fase 9, e esta
 * classe é substituída inteira; nenhuma tela precisa mudar porque ambas
 * implementam `AuthGateway`.
 */
export class LocalAuth implements AuthGateway {
  private listeners = new Set<(session: Session | null) => void>()

  private read(): { userId: Id; workspaceId: Id } | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as { userId: Id; workspaceId: Id }) : null
    } catch {
      return null
    }
  }

  private write(value: { userId: Id; workspaceId: Id } | null) {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value))
    else localStorage.removeItem(SESSION_KEY)
  }

  private async notify() {
    const session = await this.getSession()
    this.listeners.forEach((cb) => cb(session))
  }

  private async resolveRole(workspaceId: Id, userId: Id): Promise<Role | null> {
    const member = await db.members
      .where('[workspaceId+userId]')
      .equals([workspaceId, userId])
      .first()
    if (member && member.status === 'active') return member.role
    // O dono sempre tem acesso, mesmo sem linha de membro (workspace pessoal).
    const workspace = await db.workspaces.get(workspaceId)
    return workspace?.ownerId === userId ? 'owner' : null
  }

  async getSession(): Promise<Session | null> {
    const stored = this.read()
    if (!stored) return null

    const user = await db.profiles.get(stored.userId)
    if (!user) {
      this.write(null)
      return null
    }

    const role = await this.resolveRole(stored.workspaceId, stored.userId)
    if (!role) {
      // Perdeu acesso ao workspace guardado: cai no primeiro disponível.
      const fallback = await this.firstWorkspaceOf(stored.userId)
      if (!fallback) {
        this.write(null)
        return null
      }
      this.write({ userId: stored.userId, workspaceId: fallback.workspace.id })
      return { user, workspaceId: fallback.workspace.id, role: fallback.role }
    }

    return { user, workspaceId: stored.workspaceId, role }
  }

  private async firstWorkspaceOf(userId: Id): Promise<{ workspace: Workspace; role: Role } | null> {
    const all = await this.workspacesOf(userId)
    return all[0] ?? null
  }

  private async workspacesOf(userId: Id): Promise<{ workspace: Workspace; role: Role }[]> {
    const memberships = await db.members.where('userId').equals(userId).toArray()
    const result: { workspace: Workspace; role: Role }[] = []

    for (const membership of memberships) {
      if (membership.status !== 'active') continue
      const workspace = await db.workspaces.get(membership.workspaceId)
      if (workspace) result.push({ workspace, role: membership.role })
    }

    // Workspaces pessoais podem não ter linha de membro.
    const owned = await db.workspaces.where('ownerId').equals(userId).toArray()
    for (const workspace of owned) {
      if (!result.some((r) => r.workspace.id === workspace.id)) {
        result.push({ workspace, role: 'owner' })
      }
    }

    // Equipe antes de pessoal, e alfabético dentro de cada grupo.
    return result.sort((a, b) => {
      if (a.workspace.type !== b.workspace.type) return a.workspace.type === 'team' ? -1 : 1
      return a.workspace.name.localeCompare(b.workspace.name, 'pt-BR')
    })
  }

  async signIn(email: string): Promise<Session> {
    const normalized = email.trim().toLowerCase()
    const user = await db.profiles.where('email').equals(normalized).first()
    if (!user) throw new Error('E-mail não encontrado.')

    const first = await this.firstWorkspaceOf(user.id)
    if (!first) throw new Error('Este usuário não pertence a nenhum espaço.')

    this.write({ userId: user.id, workspaceId: first.workspace.id })
    const session: Session = { user, workspaceId: first.workspace.id, role: first.role }
    void this.notify()
    return session
  }

  /**
   * Grava o cargo escolhido nos vínculos do usuário e entra.
   *
   * O cargo vai para a tabela de membros, não para a sessão — assim as telas
   * se comportam exatamente como se comportariam para alguém convidado com
   * esse cargo, sem nenhum caminho especial no código.
   *
   * O espaço pessoal fica sempre como dono: não faria sentido o usuário ser
   * "leitor" das próprias finanças.
   */
  async signInAs(email: string, role: Role): Promise<Session> {
    const normalized = email.trim().toLowerCase()
    const user = await db.profiles.where('email').equals(normalized).first()
    if (!user) throw new Error('E-mail não encontrado.')

    const memberships = await db.members.where('userId').equals(user.id).toArray()

    for (const membership of memberships) {
      const workspace = await db.workspaces.get(membership.workspaceId)
      const nextRole: Role = workspace?.type === 'personal' ? 'owner' : role
      if (membership.role !== nextRole) {
        await db.members.put({ ...membership, role: nextRole, updatedAt: new Date().toISOString() })
      }
    }

    return this.signIn(email)
  }

  async signOut(): Promise<void> {
    this.write(null)
    await this.notify()
  }

  async switchWorkspace(workspaceId: Id): Promise<Session> {
    const stored = this.read()
    if (!stored) throw new Error('Nenhuma sessão ativa.')

    const role = await this.resolveRole(workspaceId, stored.userId)
    if (!role) throw new Error('Você não tem acesso a este workspace.')

    const user = await db.profiles.get(stored.userId)
    if (!user) throw new Error('Usuário da sessão não existe mais.')

    this.write({ userId: stored.userId, workspaceId })
    const session: Session = { user, workspaceId, role }
    void this.notify()
    return session
  }

  onAuthChange(callback: (session: Session | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  async listMyWorkspaces(): Promise<{ workspace: Workspace; role: Role }[]> {
    const stored = this.read()
    if (!stored) return []
    return this.workspacesOf(stored.userId)
  }
}
