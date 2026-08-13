import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { LoginPage } from '@/features/auth/LoginPage'
import { PendingAccessPage } from '@/features/auth/PendingAccessPage'
import { RecoveryPage } from '@/features/auth/RecoveryPage'
import { AppShell } from './AppShell'
import { permissionForPath } from './navigation'
import { useSession } from './session'

/**
 * Rotas carregadas sob demanda.
 *
 * Cada tela vira um arquivo próprio no build, então abrir o app baixa só o
 * necessário para a primeira tela — e não os gráficos, o quadro e os
 * relatórios de uma vez. Faz diferença sobretudo no celular em rede lenta.
 *
 * O painel entra aqui também, mesmo sendo a primeira tela: ele depende da
 * biblioteca de gráficos, que sozinha pesa mais que todo o resto do app.
 * Deixá-lo estático colocava esse peso no carregamento inicial de quem vai,
 * por exemplo, direto para a tela de lançamentos.
 */
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)

const TransactionsPage = lazy(() =>
  import('@/features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
)
const CashflowPage = lazy(() =>
  import('@/features/cashflow/CashflowPage').then((m) => ({ default: m.CashflowPage })),
)
const BillsPage = lazy(() =>
  import('@/features/bills/BillsPage').then((m) => ({ default: m.BillsPage })),
)
const RecurringPage = lazy(() =>
  import('@/features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })),
)
const SalesPage = lazy(() =>
  import('@/features/sales/SalesPage').then((m) => ({ default: m.SalesPage })),
)
const ClientsPage = lazy(() =>
  import('@/features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })),
)
const LeadsPage = lazy(() =>
  import('@/features/leads/LeadsPage').then((m) => ({ default: m.LeadsPage })),
)
const MarketingPage = lazy(() =>
  import('@/features/marketing/MarketingPage').then((m) => ({ default: m.MarketingPage })),
)
const CommercialPage = lazy(() =>
  import('@/features/commercial/CommercialPage').then((m) => ({ default: m.CommercialPage })),
)
const PerformancePage = lazy(() =>
  import('@/features/performance/PerformancePage').then((m) => ({ default: m.PerformancePage })),
)
const ExecutivePage = lazy(() =>
  import('@/features/executive/ExecutivePage').then((m) => ({ default: m.ExecutivePage })),
)
const GoalsPage = lazy(() =>
  import('@/features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })),
)
const PurchasesPage = lazy(() =>
  import('@/features/purchases/PurchasesPage').then((m) => ({ default: m.PurchasesPage })),
)
const KanbanPage = lazy(() =>
  import('@/features/kanban/KanbanPage').then((m) => ({ default: m.KanbanPage })),
)
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Portão único do app.
 *
 * Três saídas, e a do meio é a que importa: quem tem sessão mas ainda não foi
 * liberado **não** volta para o login. Voltar faria a pessoa achar que o
 * cadastro falhou e tentar de novo, enchendo a fila de pedidos repetidos.
 *
 * A checagem mora aqui, e não em cada tela, para que não exista tela nova que
 * esqueça de fazê-la.
 */
function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading, isActive } = useSession()

  if (loading) {
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isActive) return <PendingAccessPage />
  return <>{children}</>
}

/**
 * Portão por permissão.
 *
 * Esconder o item no menu deixa a tela **acessível pela URL**. Este guarda
 * fecha o buraco para todas as rotas de uma vez, usando a permissão declarada
 * na própria navegação — não há como esquecer de proteger uma tela nova sem
 * também esquecer de escondê-la do menu, e aí o descuido fica visível.
 *
 * No modo local isto continua sendo ergonomia, não segurança: quem abre o
 * DevTools alcança o IndexedDB de qualquer jeito. A barreira de verdade é o
 * RLS do Postgres, e as duas precisam dizer a mesma coisa.
 */
function RequirePermission({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { allow } = useSession()

  const required = permissionForPath(pathname)
  if (required && !allow(required)) return <Navigate to="/" replace />

  return <>{children}</>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Destino do link de redefinição — público de propósito: precisa abrir
          mesmo deslogado e é quem trata a sessão de recuperação. */}
      <Route path="/redefinir-senha" element={<RecoveryPage />} />

      <Route
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<Loading />}>
              <DashboardPage />
            </Suspense>
          }
        />

        <Route
          path="*"
          element={
            <RequirePermission>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="transacoes" element={<TransactionsPage />} />
                  <Route path="fluxo-de-caixa" element={<CashflowPage />} />
                  <Route path="a-receber" element={<BillsPage direction="receivable" />} />
                  <Route path="a-pagar" element={<BillsPage direction="payable" />} />
                  <Route path="recorrentes" element={<RecurringPage />} />
                  <Route path="vendas" element={<SalesPage />} />
                  <Route path="leads" element={<LeadsPage />} />
                  <Route path="clientes" element={<ClientsPage />} />
                  <Route path="marketing" element={<MarketingPage />} />
                  <Route path="comercial" element={<CommercialPage />} />
                  <Route path="performance" element={<PerformancePage />} />
                  <Route path="executivo" element={<ExecutivePage />} />
                  <Route path="metas" element={<GoalsPage />} />
                  <Route path="compras" element={<PurchasesPage />} />
                  <Route path="kanban" element={<KanbanPage />} />
                  <Route path="relatorios" element={<ReportsPage />} />
                  <Route path="configuracoes" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </RequirePermission>
          }
        />
      </Route>
    </Routes>
  )
}
