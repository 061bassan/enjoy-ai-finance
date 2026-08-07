import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail, onlyDigits } from '@/lib/validators'
import type { AuthGateway, SignUpInput } from '../contracts'
import { AUTH_ERROR, AuthError } from '../errors'
import type { Id, Profile, Role, Session, Workspace, WorkspaceMember } from '../types'
import { fromRow } from './serialization'

/** Workspace ativo escolhido pela pessoa. O JWT não guarda isto — o app sim. */
const ACTIVE_WS_KEY = 'enjoy.supabase.workspace'

/**
 * Autenticação sobre o Supabase Auth.
 *
 * Implementa o MESMO `AuthGateway` que o `LocalAuth`, então nenhuma tela muda
 * ao trocar de provider. A diferença é onde a identidade vive: aqui a conta e
 * a senha são do `auth.users` do Supabase (senha nunca toca a aplicação), e o
 * perfil + o vínculo com o workspace nascem do trigger `handle_new_user`
 * (migrations 0002/0005) no momento do cadastro.
 *
 * A `Session` do app é derivada, não guardada: perfil + vínculo com o
 * workspace ativo. É o mesmo desenho do local — a sessão existe mesmo quando o
 * vínculo é `pending`, para a tela "aguardando liberação" poder aparecer.
 */
export class SupabaseAuth implements AuthGateway {
  private listeners = new Set<(session: Session | null) => void>()

  constructor(private readonly client: SupabaseClient) {
    // O Supabase dispara em login/logout/refresh. Repassa para quem escuta —
    // é o que faz a UI reagir sem a gente notificar na mão em cada método.
    this.client.auth.onAuthStateChange(() => {
      void this.notify()
    })
  }

  private async notify() {
    const session = await this.getSession()
    this.listeners.forEach((cb) => cb(session))
  }

  // -------------------------------------------------------------------------
  // Leitura de perfil, workspace e vínculo
  // -------------------------------------------------------------------------

  private async loadProfile(userId: Id): Promise<Profile | null> {
    const { data } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle()
    return data ? fromRow<Profile>(data) : null
  }

  private async loadWorkspace(workspaceId: Id): Promise<Workspace | null> {
    const { data } = await this.client
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle()
    return data ? fromRow<Workspace>(data) : null
  }

  /**
   * O vínculo da pessoa com um workspace — pendente e recusado inclusive.
   *
   * Se não há linha de membro mas a pessoa é dona do espaço, devolve um
   * vínculo virtual de dono, igual ao local: o dono sempre entra, mesmo sem
   * linha explícita (caso do espaço pessoal).
   */
  private async membershipIn(workspaceId: Id, userId: Id): Promise<WorkspaceMember | null> {
    const { data } = await this.client
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data) return fromRow<WorkspaceMember>(data)

    const workspace = await this.loadWorkspace(workspaceId)
    if (!workspace || workspace.ownerId !== userId) return null

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

  private async membershipsOf(userId: Id): Promise<WorkspaceMember[]> {
    const { data } = await this.client
      .from('workspace_members')
      .select('*')
      .eq('user_id', userId)
    const direct = (data ?? []).map((row) => fromRow<WorkspaceMember>(row))

    // Espaços de que a pessoa é dona podem não ter linha de membro.
    const { data: owned } = await this.client
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
    for (const row of owned ?? []) {
      const workspace = fromRow<Workspace>(row)
      if (direct.some((m) => m.workspaceId === workspace.id)) continue
      const virtual = await this.membershipIn(workspace.id, userId)
      if (virtual) direct.push(virtual)
    }

    const rank: Record<string, number> = { active: 0, pending: 1, invited: 2, rejected: 3, suspended: 4 }
    return direct.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
  }

  private async primaryMembership(userId: Id): Promise<WorkspaceMember | null> {
    const all = await this.membershipsOf(userId)
    return all[0] ?? null
  }

  private toSession(user: Profile, member: WorkspaceMember): Session {
    return {
      user,
      workspaceId: member.workspaceId,
      // Cargo só vale ativo: um pendente que pediu "Administrador" é tratado
      // como visitante até a decisão.
      role: member.status === 'active' ? member.role : 'viewer',
      status: member.status,
      requestedRole: member.requestedRole ?? null,
      decisionNote: member.decisionNote ?? null,
    }
  }

  /** Monta a sessão de um usuário no workspace ativo (ou no primeiro dele). */
  private async buildSession(userId: Id): Promise<Session | null> {
    const user = await this.loadProfile(userId)
    if (!user) return null

    const storedWs = localStorage.getItem(ACTIVE_WS_KEY)
    let member = storedWs ? await this.membershipIn(storedWs, userId) : null
    if (!member) member = await this.primaryMembership(userId)
    if (!member) return null

    localStorage.setItem(ACTIVE_WS_KEY, member.workspaceId)
    return this.toSession(user, member)
  }

  // -------------------------------------------------------------------------
  // Contrato
  // -------------------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession()
    if (!data.session) return null
    return this.buildSession(data.session.user.id)
  }

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    })
    // Mensagem genérica de propósito: dizer "e-mail não existe" entrega a lista
    // de quem tem conta. O limite de tentativas é do próprio Supabase Auth.
    if (error || !data.user) {
      throw new AuthError(AUTH_ERROR.invalidCredentials, 'E-mail ou senha incorretos.')
    }

    const session = await this.buildSession(data.user.id)
    if (!session) {
      throw new AuthError(AUTH_ERROR.noWorkspace, 'Este usuário não pertence a nenhum espaço.')
    }
    return session
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const { data, error } = await this.client.auth.signUp({
      email: normalizeEmail(input.email),
      password: input.password,
      // O trigger `handle_new_user` lê estes campos de `raw_user_meta_data`
      // para montar o perfil e o vínculo (e semear os espaços, se for o
      // primeiro cadastro). As chaves precisam bater com as que o SQL lê.
      options: {
        data: {
          name: input.name,
          cpf: onlyDigits(input.cpf),
          birth_date: input.birthDate,
          phone: onlyDigits(input.phone),
          requested_role: input.requestedRole,
        },
      },
    })

    if (error) {
      // O Supabase devolve o mesmo erro para e-mail já cadastrado; traduz para
      // o código que a tela de cadastro sabe tratar.
      if (/registered|already/i.test(error.message)) {
        throw new AuthError(AUTH_ERROR.emailTaken, 'Já existe uma conta com este e-mail.')
      }
      throw new AuthError(AUTH_ERROR.invalidCredentials, error.message)
    }

    if (!data.session || !data.user) {
      // Sem sessão logo após o cadastro = confirmação de e-mail está ligada.
      // Para este produto de um time só, ela deve ficar desligada (ver o
      // roteiro de configuração do Supabase).
      throw new AuthError(
        AUTH_ERROR.noSession,
        'Confirmação de e-mail está ativa no Supabase. Desative-a para o fluxo de cadastro direto.',
      )
    }

    const session = await this.buildSession(data.user.id)
    if (!session) {
      throw new AuthError(AUTH_ERROR.noWorkspace, 'Cadastro criado, mas sem vínculo com um espaço.')
    }
    return session
  }

  /**
   * Não se aplica no Supabase: toda conta nasce do Auth e sempre tem senha.
   * Existe só para satisfazer o contrato (o caso real é do provider local, com
   * bases anteriores ao login com senha). Redefinição de senha aqui é pelo
   * e-mail de recuperação do próprio Supabase.
   */
  async setInitialPassword(): Promise<Session> {
    throw new AuthError(
      AUTH_ERROR.passwordNotSet,
      'No modo Supabase, use a recuperação de senha por e-mail.',
    )
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(ACTIVE_WS_KEY)
    await this.client.auth.signOut()
  }

  async switchWorkspace(workspaceId: Id): Promise<Session> {
    const { data } = await this.client.auth.getSession()
    if (!data.session) throw new AuthError(AUTH_ERROR.noSession, 'Nenhuma sessão ativa.')

    const member = await this.membershipIn(workspaceId, data.session.user.id)
    if (!member || member.status !== 'active') {
      throw new AuthError(AUTH_ERROR.noAccess, 'Você não tem acesso a este espaço.')
    }

    const user = await this.loadProfile(data.session.user.id)
    if (!user) throw new AuthError(AUTH_ERROR.invalidCredentials, 'Usuário da sessão não existe mais.')

    localStorage.setItem(ACTIVE_WS_KEY, workspaceId)
    void this.notify()
    return this.toSession(user, member)
  }

  onAuthChange(callback: (session: Session | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  async listMyWorkspaces(): Promise<{ workspace: Workspace; role: Role }[]> {
    const { data } = await this.client.auth.getSession()
    if (!data.session) return []

    const memberships = await this.membershipsOf(data.session.user.id)
    const result: { workspace: Workspace; role: Role }[] = []

    for (const membership of memberships) {
      if (membership.status !== 'active') continue
      const workspace = await this.loadWorkspace(membership.workspaceId)
      if (workspace) result.push({ workspace, role: membership.role })
    }

    // Equipe antes de pessoal, e alfabético dentro de cada grupo.
    return result.sort((a, b) => {
      if (a.workspace.type !== b.workspace.type) return a.workspace.type === 'team' ? -1 : 1
      return a.workspace.name.localeCompare(b.workspace.name, 'pt-BR')
    })
  }
}
