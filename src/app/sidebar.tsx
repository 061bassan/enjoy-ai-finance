import * as React from 'react'

/**
 * Quais grupos do menu estão recolhidos.
 *
 * Fica em localStorage, e não no workspace, de propósito: é preferência de
 * PESSOA, não da empresa. Duas pessoas na mesma conta usam partes diferentes
 * do app e discordam sobre o que vale manter aberto.
 *
 * Guarda os RECOLHIDOS, e não os abertos: assim um grupo novo no menu nasce
 * visível para quem já tinha preferência salva, em vez de nascer escondido.
 */

const STORAGE_KEY = 'enjoy.sidebar.groups'

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    // Preferência corrompida não pode derrubar a navegação — abre tudo.
    return []
  }
}

interface SidebarContextValue {
  isGroupCollapsed: (label: string) => boolean
  toggleGroup: (label: string) => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsedGroups, setCollapsedGroups] = React.useState<string[]>(readCollapsed)

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedGroups))
  }, [collapsedGroups])

  const toggleGroup = React.useCallback((label: string) => {
    setCollapsedGroups((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }, [])

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      isGroupCollapsed: (label) => collapsedGroups.includes(label),
      toggleGroup,
    }),
    [collapsedGroups, toggleGroup],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error('useSidebar precisa estar dentro de <SidebarProvider>.')
  return context
}
