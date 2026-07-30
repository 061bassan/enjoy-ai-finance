import * as React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Check, ChevronsUpDown, LogOut, Menu, Moon, Sun, UserCog, X } from 'lucide-react'
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
import { ROLE_LABEL } from '@/data/enums'
import { NAVIGATION } from './navigation'
import { PeriodPicker } from './PeriodPicker'
import { useSession } from './session'
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
  const isPersonal = workspace?.type === 'personal'

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAVIGATION.map((group) => {
        const items = group.items.filter((item) => {
          if (item.teamOnly && isPersonal) return false
          if (item.requires && !allow(item.requires)) return false
          return true
        })
        if (!items.length) return null

        return (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
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
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); toggle() }}>
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
  const location = useLocation()

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
        <div className="border-t border-border px-4 py-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground/60">
            Dados salvos neste navegador
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
