import * as React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserCog,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABEL } from '@/data/enums'
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

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspaces, workspace, session, switchWorkspace } = useSession()

  if (!workspace) return null

  const trigger = collapsed ? (
    <button
      className="flex w-full items-center justify-center rounded-lg border border-border/70 bg-surface-1 p-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Espaço ${workspace.shortName}`}
    >
      <Logo />
    </button>
  ) : (
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
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
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

function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { allow, workspace } = useSession()
  const { isNavHidden } = useCustomization()
  const isPersonal = workspace?.type === 'personal'

  return (
    <nav className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'space-y-3 px-2' : 'space-y-5 px-3')}>
      {NAVIGATION.map((group) => {
        const items = group.items.filter((item) => {
          if (item.teamOnly && isPersonal) return false
          if (item.requires && !allow(item.requires)) return false
          // Configurações nunca some: é o caminho de volta para reexibir tudo.
          if (item.to !== '/configuracoes' && isNavHidden(item.to)) return false
          return true
        })
        if (!items.length) return null

        return (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-2 mb-1.5 border-t border-border/60" />
            ) : (
              <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
                {group.label}
              </p>
            )}

            <ul className="space-y-0.5">
              {items.map((item) => {
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center rounded-md text-sm transition-colors',
                        collapsed ? 'justify-center p-2' : 'gap-2.5 px-2 py-1.5',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                )

                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
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
        {/* Sair leva de volta à escolha de cargo, que é o caminho para trocar. */}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <UserCog />
          Trocar de cargo
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const { collapsed, toggle } = useSidebar()
  const location = useLocation()

  // Fecha a gaveta ao navegar no mobile.
  React.useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="app-backdrop flex min-h-screen">
      {/* Sidebar — fixa no desktop, gaveta no mobile.
          No mobile o estado recolhido não vale: quem abriu a gaveta quer ler
          os nomes, não decifrar ícones. */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface-1/80 backdrop-blur-xl transition-[transform,width] duration-200 lg:translate-x-0',
          mobileOpen ? 'w-60 translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[4.25rem]' : 'lg:w-60',
        )}
      >
        <div className={cn(collapsed ? 'p-2 lg:p-2' : 'p-3')}>
          <WorkspaceSwitcher collapsed={collapsed && !mobileOpen} />
        </div>

        <SidebarNav
          collapsed={collapsed && !mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />

        <div className="border-t border-border p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
                className={cn(
                  'hidden w-full items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex',
                  collapsed ? 'justify-center' : 'gap-2',
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4 shrink-0" />
                    <span>Recolher menu</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Expandir menu · [</TooltipContent>}
          </Tooltip>

          {!collapsed && (
            <p className="px-2 pt-2 text-[10px] leading-relaxed text-muted-foreground/60">
              Dados salvos neste navegador
            </p>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-[padding] duration-200',
          collapsed ? 'lg:pl-[4.25rem]' : 'lg:pl-60',
        )}
      >
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

          <div className="min-w-0 flex-1" />

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
