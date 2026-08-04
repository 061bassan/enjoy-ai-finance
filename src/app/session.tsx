import * as React from 'react'
import { data } from '@/data'
import type { SignUpInput } from '@/data/contracts'
import { can, type Permission } from '@/data/rules/permissions'
import type { Id, Role, Session, Workspace } from '@/data/types'

interface SessionContextValue {
  session: Session | null
  workspaces: { workspace: Workspace; role: Role }[]
  workspace: Workspace | null
  role: Role | undefined
  loading: boolean
  /**
   * `true` só quando o vínculo está liberado.
   *
   * Quem acabou de se cadastrar tem sessão, mas não tem acesso — e é essa
   * diferença que o roteador usa para mandar a pessoa à tela de espera em vez
   * de à tela de login, que a faria achar que o cadastro falhou.
   */
  isActive: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  setInitialPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  switchWorkspace: (workspaceId: Id) => Promise<void>
  /** Atalho para a matriz de permissões, já ligado ao papel atual. */
  allow: (permission: Permission) => boolean
  refreshWorkspaces: () => Promise<void>
  /** Recarrega a sessão do banco — usado depois de uma aprovação. */
  refreshSession: () => Promise<void>
}

const SessionContext = React.createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [workspaces, setWorkspaces] = React.useState<{ workspace: Workspace; role: Role }[]>([])
  const [loading, setLoading] = React.useState(true)

  const refreshWorkspaces = React.useCallback(async () => {
    setWorkspaces(await data.auth.listMyWorkspaces())
  }, [])

  // Cria a estrutura inicial na primeira abertura e restaura a sessão salva.
  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        await data.seedIfEmpty?.()
        const current = await data.auth.getSession()
        if (cancelled) return
        setSession(current)
        if (current) setWorkspaces(await data.auth.listMyWorkspaces())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const adopt = React.useCallback(
    async (next: Session) => {
      setSession(next)
      await refreshWorkspaces()
    },
    [refreshWorkspaces],
  )

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      await adopt(await data.auth.signIn(email, password))
    },
    [adopt],
  )

  const signUp = React.useCallback(
    async (input: SignUpInput) => {
      await adopt(await data.auth.signUp(input))
    },
    [adopt],
  )

  const setInitialPassword = React.useCallback(
    async (email: string, password: string) => {
      await adopt(await data.auth.setInitialPassword(email, password))
    },
    [adopt],
  )

  /**
   * Relê a sessão do banco.
   *
   * Necessário porque a aprovação acontece na sessão de OUTRA pessoa: quem
   * está esperando não tem como saber que foi liberado sem perguntar de novo.
   * A tela de espera chama isto no botão "já fui liberado?".
   */
  const refreshSession = React.useCallback(async () => {
    const current = await data.auth.getSession()
    setSession(current)
    if (current) await refreshWorkspaces()
  }, [refreshWorkspaces])

  const signOut = React.useCallback(async () => {
    await data.auth.signOut()
    setSession(null)
    setWorkspaces([])
  }, [])

  const switchWorkspace = React.useCallback(async (workspaceId: Id) => {
    setSession(await data.auth.switchWorkspace(workspaceId))
  }, [])

  const workspace = React.useMemo(
    () => workspaces.find((w) => w.workspace.id === session?.workspaceId)?.workspace ?? null,
    [workspaces, session?.workspaceId],
  )

  /**
   * Vínculo não liberado não tem permissão nenhuma — nem as de leitura do
   * visitante. A checagem de status fica aqui, e não em cada tela, para que
   * não exista tela que esqueça de fazê-la.
   */
  const allow = React.useCallback(
    (permission: Permission) =>
      session?.status === 'active' && can(session?.role, permission),
    [session?.role, session?.status],
  )

  const isActive = session?.status === 'active'

  const value = React.useMemo<SessionContextValue>(
    () => ({
      session,
      workspaces,
      workspace,
      role: session?.role,
      loading,
      isActive,
      signIn,
      signUp,
      setInitialPassword,
      signOut,
      switchWorkspace,
      allow,
      refreshWorkspaces,
      refreshSession,
    }),
    [
      session,
      workspaces,
      workspace,
      loading,
      isActive,
      signIn,
      signUp,
      setInitialPassword,
      signOut,
      switchWorkspace,
      allow,
      refreshWorkspaces,
      refreshSession,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = React.useContext(SessionContext)
  if (!context) throw new Error('useSession precisa estar dentro de <SessionProvider>.')
  return context
}

/** Workspace ativo — a maioria das consultas precisa só disto. */
export function useWorkspaceId(): Id {
  const { session } = useSession()
  if (!session) throw new Error('Nenhuma sessão ativa.')
  return session.workspaceId
}
