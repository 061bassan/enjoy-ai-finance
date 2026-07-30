import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  ClipboardList,
  Crown,
  FileBarChart,
  Flag,
  Gauge,
  Handshake,
  LayoutDashboard,
  type LucideIcon,
  PiggyBank,
  Repeat,
  Settings,
  ShoppingBag,
  Trello,
  Wallet,
} from 'lucide-react'
import type { Permission } from '@/data/rules/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Item só aparece se o papel atual tiver esta permissão. */
  requires?: Permission
  /** Oculto em workspaces pessoais — não faz sentido fora da empresa. */
  teamOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Menu agrupado.
 *
 * Os nomes evitam jargão de propósito: "Entradas e saídas" em vez de
 * "Transações", "Contas fixas" em vez de "Custos recorrentes". Quem usa o
 * app todo dia não é necessariamente da área financeira, e o nome do menu é
 * a primeira coisa que ensina o que aquilo faz.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Resumo',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard },
      { to: '/performance', label: 'Evolução', icon: Gauge, teamOnly: true },
      {
        to: '/executivo',
        label: 'Visão dos sócios',
        icon: Crown,
        requires: 'view:executive',
        teamOnly: true,
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { to: '/vendas', label: 'Vendas', icon: Handshake, teamOnly: true },
      { to: '/comercial', label: 'Funil de vendas', icon: ClipboardList, teamOnly: true },
      { to: '/clientes', label: 'Clientes', icon: Banknote, teamOnly: true },
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      { to: '/transacoes', label: 'Entradas e saídas', icon: ArrowLeftRight },
      { to: '/fluxo-de-caixa', label: 'Fluxo de caixa', icon: Wallet },
      { to: '/a-receber', label: 'A receber', icon: PiggyBank, requires: 'manage:bills' },
      { to: '/a-pagar', label: 'A pagar', icon: CalendarClock, requires: 'manage:bills' },
      { to: '/recorrentes', label: 'Contas fixas', icon: Repeat, requires: 'manage:recurring' },
    ],
  },
  {
    label: 'Planejamento',
    items: [
      { to: '/metas', label: 'Metas', icon: Flag },
      { to: '/compras', label: 'Compras planejadas', icon: ShoppingBag },
      { to: '/kanban', label: 'Quadro de tarefas', icon: Trello },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, requires: 'export:reports' },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]
