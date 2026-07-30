import * as React from 'react'
import { data } from '@/data'
import { can, type Permission } from '@/data/rules/permissions'
import type { Id, Role, Session, Workspace } from '@/data/types'

interface SessionContextValue {
  session: Session | null
  workspaces: { workspace: Workspace; role: Role }[]
  workspace: Workspace | null
  role: Role | undefined
  loading: boolean
  signIn: (email: string, role?: Role) => Promise<void>
  signOut: () => Promise<void>
  switchWorkspace: (workspaceId: Id) => Promise<void>
  /** Atalho para a matriz de permissões, já ligado ao papel atual. */
  allow: (permission: Permission) => boolean
  refreshWorkspaces: () => Promise<void>
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

  const signIn = React.useCallback(
    async (email: string, role?: Role) => {
      const next = role
        ? await data.auth.signInAs(email, role)
        : await data.auth.signIn(email, '')
      setSession(next)
      await refreshWorkspaces()
    },
    [refreshWorkspaces],
  )

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

  const allow = React.useCallback(
    (permission: Permission) => can(session?.role, permission),
    [session?.role],
  )

  const value = React.useMemo<SessionContextValue>(
    () => ({
      session,
      workspaces,
      workspace,
      role: session?.role,
      loading,
      signIn,
      signOut,
      switchWorkspace,
      allow,
      refreshWorkspaces,
    }),
    [session, workspaces, workspace, loading, signIn, signOut, switchWorkspace, allow, refreshWorkspaces],
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
