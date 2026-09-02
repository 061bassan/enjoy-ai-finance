import * as React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu,
  Moon,
  Sun,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { data } from '@/data'
import { ROLE_LABEL } from '@/data/enums'
import { pendingRequests } from '@/domain/membership'
import { useMembers } from '@/hooks/data'
import { useAutoGenerateRecurringBills } from '@/hooks/recurring'
import { useCustomization } from '@/customization/context'
import { NAVIGATION } from './navigation'
import { PeriodPicker } from './PeriodPicker'
import { useSession } from './session'
import { useSidebar } from './sidebar'
import { useTheme } from './theme'

function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Enjoy AI Finance"
      className={cn(
        'h-8 w-8 rounded-md object-cover',
        // A logo é branca sobre preto; no tema claro precisa inverter.
        'dark:invert-0 invert',
        className,
      )}
    />
  )
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, session, switchWorkspace } = useSession()

  if (!workspace) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-surface-1 px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">
              {workspace.shortName}
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {session?.role ? ROLE_LABEL[session.role] : ''}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Trocar de espaço</DropdownMenuLabel>
        {workspaces.map(({ workspace: ws, role }) => (
          <DropdownMenuItem
            key={ws.id}
            onSelect={() => {
              if (ws.id !== workspace.id) void switchWorkspace(ws.id)
            }}
            className="gap-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{ws.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {ws.type === 'team' ? 'Empresa' : 'Pessoal'} · {ROLE_LABEL[role]}
              </span>
            </span>
            {ws.id === workspace.id && <Check className="h-4 w-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { allow, workspace } = useSession()
  const { isNavHidden } = useCustomization()
  const { isGroupCollapsed, toggleGroup } = useSidebar()
  const { pathname } = useLocation()
  const isPersonal = workspace?.type === 'personal'

  return (
    <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
      {NAVIGATION.map((group) => {
        const items = group.items.filter((item) => {
          if (item.teamOnly && isPersonal) return false
          if (item.requires && !allow(item.requires)) return false
          // Configurações nunca some: é o caminho de volta para reexibir tudo.
          if (item.to !== '/configuracoes' && isNavHidden(item.to)) return false
          return true
        })
        if (!items.length) return null

        const collapsed = isGroupCollapsed(group.label)
        // Mesma regra de "ativo" do NavLink abaixo — o painel recolhido precisa
        // dizer que a tela aberta está lá dentro, senão some a única pista de
        // onde a pessoa está.
        const hasActive = items.some((item) =>
          item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
        )
        const panelId = `nav-grupo-${group.label.toLowerCase().replace(/\s+/g, '-')}`

        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              aria-expanded={!collapsed}
              aria-controls={panelId}
              className={cn(
                'mb-1.5 flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-2 text-[10px] font-medium uppercase tracking-widest transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                collapsed && hasActive
                  ? 'text-foreground'
                  : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              <ChevronRight
                className={cn(
                  'h-3 w-3 shrink-0 transition-transform duration-200',
                  !collapsed && 'rotate-90',
                )}
              />
              <span className="truncate">{group.label}</span>
              {collapsed && hasActive && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
              )}
            </button>

            {/* grid-rows 0fr→1fr anima a altura sem precisar medi-la em JS. */}
            <div
              id={panelId}
              className={cn(
                'grid transition-[grid-template-rows] duration-200',
                collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
              )}
            >
              <ul className="space-y-0.5 overflow-hidden">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      tabIndex={collapsed ? -1 : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'bg-accent font-medium text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function UserMenu() {
  const { session, signOut } = useSession()
  const { theme, toggle } = useTheme()

  if (!session) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar>
            <AvatarFallback>{initialsOf(session.user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
          <Badge variant="muted" className="mt-1.5">
            {ROLE_LABEL[session.role]}
          </Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            toggle()
          }}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
          Tema {theme === 'dark' ? 'claro' : 'escuro'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/*
          "Trocar de cargo" saiu daqui junto com o login por seleção de papel.
          O cargo agora vem da aprovação de um sócio e só muda em
          Configurações → Equipe — deixar um atalho que sugere trocar sozinho
          contradiria a fila de aprovação que acabamos de criar.
        */}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Nome da tela aberta.
 *
 * Sai da mesma lista que monta o menu, então nunca diverge dele. O header
 * ficava vazio à esquerda: no celular, com a gaveta fechada, não havia nada
 * dizendo em que tela a pessoa estava.
 */
function useCurrentPageLabel(): string | null {
  const { pathname } = useLocation()

  return React.useMemo(() => {
    const items = NAVIGATION.flatMap((group) => group.items)
    const exact = items.find((item) => item.to === pathname)
    if (exact) return exact.label

    // Rotas mais específicas primeiro, senão "/" casaria com tudo.
    const prefix = [...items]
      .filter((item) => item.to !== '/')
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => pathname.startsWith(item.to))

    return prefix?.label ?? null
  }, [pathname])
}

/**
 * Aviso de acessos aguardando liberação.
 *
 * Um pedido de acesso que ninguém vê é um pedido que nunca é decidido — e a
 * pessoa do outro lado fica olhando a tela de espera sem saber que não há
 * nada acontecendo. O aviso só aparece para quem pode decidir.
 */
function PendingAccessAlert() {
  const { allow } = useSession()
  const { data: members = [] } = useMembers()

  const count = React.useMemo(() => pendingRequests(members).length, [members])

  if (!allow('manage:members') || count === 0) return null

  return (
    <NavLink
      to="/configuracoes"
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-1 text-xs transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <UserRoundCheck className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">
        {count === 1 ? '1 acesso aguardando' : `${count} acessos aguardando`}
      </span>
      <span className="sm:hidden">{count}</span>
    </NavLink>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const location = useLocation()
  const pageLabel = useCurrentPageLabel()

  // Mantém os títulos das contas fixas sempre gerados com meses de folga,
  // sem depender de alguém abrir "Contas fixas" e clicar em "Gerar títulos".
  useAutoGenerateRecurringBills()

  // Fecha a gaveta ao navegar no mobile.
  React.useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="app-backdrop flex min-h-screen">
      {/* Sidebar — fixa no desktop, gaveta no mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface-1/80 backdrop-blur-xl transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-3">
          <WorkspaceSwitcher />
        </div>
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
        <div className="space-y-1 border-t border-border px-4 py-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground/60">
            {data.kind === 'supabase' ? 'Dados salvos na nuvem' : 'Dados salvos neste navegador'}
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground/60">
            Desenvolvido por{' '}
            <a
              href="https://www.linkedin.com/in/rafael-lopes-bassan-b5a1a53a9/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              @rbassan_
            </a>
          </p>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Abrir menu"
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>

          <div className="min-w-0 flex-1">
            {pageLabel && (
              <span className="truncate text-sm font-medium text-muted-foreground lg:hidden">
                {pageLabel}
              </span>
            )}
          </div>

          <PendingAccessAlert />
          <PeriodPicker />
          <UserMenu />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
