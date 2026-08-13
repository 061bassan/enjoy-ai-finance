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
  Megaphone,
  PiggyBank,
  Repeat,
  Settings,
  ShoppingBag,
  Trello,
  UserPlus,
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
/**
 * Permissão exigida por rota — derivada do próprio menu.
 *
 * O roteador consulta este mapa antes de montar a tela. Esconder o item do
 * menu nunca foi proteção: a URL continuava aberta a quem a digitasse, e
 * `/executivo` só não vazava porque aquela tela tinha uma checagem própria —
 * que nenhuma tela nova lembraria de repetir.
 *
 * Derivar do menu em vez de manter uma segunda lista é o que garante que os
 * dois nunca divirjam: um item novo protegido no menu já nasce protegido na
 * rota.
 */
export function permissionForPath(pathname: string): Permission | undefined {
  const items = NAVIGATION.flatMap((group) => group.items)
  const exact = items.find((item) => item.to === pathname)
  if (exact) return exact.requires

  // Rotas mais específicas primeiro, senão "/" casaria com tudo.
  return [...items]
    .filter((item) => item.to !== '/')
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname.startsWith(item.to))?.requires
}

export const NAVIGATION: NavGroup[] = [
  {
    label: 'Resumo',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard },
      {
        to: '/performance',
        label: 'Evolução',
        icon: Gauge,
        // Séries de receita da empresa inteira. Closer e SDR veem o próprio
        // desempenho na tela de Vendas; aqui apareceria o de todo mundo.
        requires: 'view:sales:all',
        teamOnly: true,
      },
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
      // A ordem é a das coisas acontecendo: primeiro se investe para alguém
      // chegar, depois a pessoa chega, depois compra.
      //
      // `sales` (closer/SDR) não tem `view:marketing` — verba de anúncio é
      // custo da empresa, e este papel não enxerga custo da empresa.
      {
        to: '/marketing',
        label: 'Marketing',
        icon: Megaphone,
        requires: 'view:marketing',
        teamOnly: true,
      },
      { to: '/leads', label: 'Leads', icon: UserPlus, teamOnly: true },
      { to: '/vendas', label: 'Vendas', icon: Handshake, teamOnly: true },
      { to: '/comercial', label: 'Funil de vendas', icon: ClipboardList, teamOnly: true },
      { to: '/clientes', label: 'Clientes', icon: Banknote, teamOnly: true },
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      // O caixa da empresa não é informação de time comercial. `sales` não
      // tem `view:financials` na matriz — antes o item aparecia mesmo assim,
      // porque nenhuma permissão era exigida aqui.
      {
        to: '/transacoes',
        label: 'Entradas e saídas',
        icon: ArrowLeftRight,
        requires: 'view:financials',
      },
      { to: '/fluxo-de-caixa', label: 'Fluxo de caixa', icon: Wallet, requires: 'view:financials' },
      { to: '/a-receber', label: 'A receber', icon: PiggyBank, requires: 'manage:bills' },
      { to: '/a-pagar', label: 'A pagar', icon: CalendarClock, requires: 'manage:bills' },
      { to: '/recorrentes', label: 'Contas fixas', icon: Repeat, requires: 'manage:recurring' },
    ],
  },
  {
    label: 'Planejamento',
    items: [
      // Metas e compras mostram lucro, reserva e caixa disponível — mesma
      // razão do bloco acima.
      { to: '/metas', label: 'Metas', icon: Flag, requires: 'view:financials' },
      {
        to: '/compras',
        label: 'Compras planejadas',
        icon: ShoppingBag,
        requires: 'view:financials',
      },
      { to: '/kanban', label: 'Quadro de tarefas', icon: Trello, requires: 'manage:kanban' },
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
