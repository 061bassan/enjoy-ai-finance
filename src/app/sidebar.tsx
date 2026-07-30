import * as React from 'react'

/**
 * Estado recolhido da barra lateral.
 *
 * Fica em localStorage, e não no workspace, de propósito: é preferência de
 * PESSOA, não da empresa. Duas pessoas na mesma conta têm telas de tamanhos
 * diferentes e opiniões diferentes sobre o que fazer com o espaço.
 */

const STORAGE_KEY = 'enjoy.sidebar.collapsed'

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = React.useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === '1',
  )

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const toggle = React.useCallback(() => setCollapsedState((current) => !current), [])

  // Atalho "[" — só dispara fora de campo de texto, senão digitar um colchete
  // numa observação recolheria o menu.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      event.preventDefault()
      toggle()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const value = React.useMemo<SidebarContextValue>(
    () => ({ collapsed, toggle, setCollapsed: setCollapsedState }),
    [collapsed, toggle],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error('useSidebar precisa estar dentro de <SidebarProvider>.')
  return context
}
