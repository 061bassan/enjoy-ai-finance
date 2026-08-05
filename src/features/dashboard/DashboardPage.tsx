import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  Handshake,
  Repeat,
  Target,
  Wallet,
} from 'lucide-react'
import { formatDate, formatMonthLabel, monthsInRange, rangeOfMonth, today } from '@/lib/date'
import { formatMoney, formatMoneyCompact, formatNumber, formatPercent } from '@/lib/money'
import { COST_CENTER_LABEL } from '@/data/enums'
import {
  burnRate,
  expensesByCostCenter,
  grossRevenue,
  inRange,
  monthlySeries,
  netMargin,
  netProfit,
  netRevenue,
  runwayMonths,
  totalCash,
  totalExpenses,
  variation,
} from '@/domain/finance'
import { toBillViews, totalOutstanding, totalOverdue } from '@/domain/bills'
import { activeMrr, arr, summarizeSales } from '@/domain/sales'
import { totalMonthlyCost } from '@/domain/recurrence'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  CHART_SERIES,
  ChartFrame,
  ChartTooltip,
  chartColor,
  moneyAxisTick,
} from '@/components/charts/primitives'
import {
  useAccounts,
  useBillPayments,
  useBills,
  useCategories,
  useClients,
  useMonthlyTargets,
  useRecurringRules,
  useSales,
  useTransactions,
} from '@/hooks/data'
import { OwnDashboard } from './OwnDashboard'

/**
 * Porta de entrada do painel.
 *
 * Quem não pode ver o financeiro da empresa (`sales`, hoje) recebe um painel
 * próprio em vez desta tela. A bifurcação fica num componente separado, e não
 * num `if` no meio do outro, porque assim o painel financeiro nem chega a
 * carregar transações, títulos e contas para quem não vai vê-los — a
 * restrição sai de graça em desempenho.
 */
export function DashboardPage() {
  const { allow } = useSession()
  if (!allow('view:financials')) return <OwnDashboard />
  return <FinancialDashboard />
}

/**
 * Dashboard principal.
 *
 * Todo indicador aqui é derivado no render, a partir dos fatos crus. Isso é
 * o que entrega a "automação" pedida: registrar uma venda ou baixar um
 * título muda estes números na hora seguinte, sem recálculo agendado.
 */
function FinancialDashboard() {
  const { range, comparisonRange } = usePeriod()
  const { workspace } = useSession()
  const isTeam = workspace?.type === 'team'

  const { data: transactions = [], isLoading } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: bills = [] } = useBills()
  const { data: payments = [] } = useBillPayments()
  const { data: sales = [] } = useSales()
  const { data: clients = [] } = useClients()
  const { data: rules = [] } = useRecurringRules()
  const { data: targets = [] } = useMonthlyTargets()

  const metrics = React.useMemo(() => {
    const current = inRange(transactions, range)
    const previous = inRange(transactions, comparisonRange)

    const revenue = grossRevenue(current)
    const expenses = totalExpenses(current)
    const profit = netProfit(current)

    const salesCurrent = sales.filter(
      (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
    )
    const salesPrevious = sales.filter(
      (sale) => sale.saleDate >= comparisonRange.from && sale.saleDate <= comparisonRange.to,
    )

    const summary = summarizeSales(salesCurrent)
    const previousSummary = summarizeSales(salesPrevious)

    const billViews = toBillViews(bills, payments)
    const receivables = billViews.filter((view) => view.bill.direction === 'receivable')
    const payables = billViews.filter((view) => view.bill.direction === 'payable')

    // Previsto do período = títulos com vencimento dentro do intervalo.
    const forecastRevenue = receivables
      .filter((v) => v.bill.dueDate >= range.from && v.bill.dueDate <= range.to)
      .reduce((sum, v) => sum + v.bill.amountCents, 0)

    const months = monthsInRange({
      from: range.from < range.to ? range.from : range.to,
      to: range.to,
    })
    const seriesMonths = months.length > 1 ? months : monthsInRange(rangeOfMonth(range.to))
    const series = monthlySeries(transactions, seriesMonths)

    // Série longa para burn rate e runway — 12 meses independem do filtro.
    const yearMonths = monthsInRange({
      from: `${Number(range.to.slice(0, 4)) - 1}-${range.to.slice(5, 7)}-01`,
      to: range.to,
    })
    const yearSeries = monthlySeries(transactions, yearMonths)
    const burn = burnRate(yearSeries)
    const cash = totalCash(accounts, transactions)

    const mrr = activeMrr(sales, clients)
    const currentMonth = `${today().slice(0, 7)}-01`
    const target = targets.find((t) => t.month === currentMonth)

    return {
      revenue,
      revenuePrevious: grossRevenue(previous),
      netRevenueCents: netRevenue(current, categories),
      expenses,
      expensesPrevious: totalExpenses(previous),
      profit,
      profitPrevious: netProfit(previous),
      margin: netMargin(current),
      marginPrevious: netMargin(previous),
      cash,
      mrr,
      arrCents: arr(mrr),
      summary,
      previousSummary,
      activeClients: clients.filter((c) => c.status === 'active').length,
      forecastRevenue,
      outstandingReceivable: totalOutstanding(receivables),
      overdueReceivable: totalOverdue(receivables),
      outstandingPayable: totalOutstanding(payables),
      overduePayable: totalOverdue(payables),
      upcoming: payables
        .filter((v) => v.status !== 'paid' && v.status !== 'canceled')
        .sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate))
        .slice(0, 6),
      series,
      costCenters: expensesByCostCenter(current, COST_CENTER_LABEL).slice(0, 8),
      monthlyOperationCost: totalMonthlyCost(rules.filter((r) => r.active && r.kind === 'expense')),
      burn,
      runway: runwayMonths(cash, burn),
      target,
      cumulativeProfit: series.at(-1)?.cumulativeProfitCents ?? 0,
    }
  }, [
    transactions,
    range,
    comparisonRange,
    accounts,
    categories,
    bills,
    payments,
    sales,
    clients,
    rules,
    targets,
  ])

  const targetProgress =
    metrics.target && metrics.target.revenueCents > 0
      ? metrics.revenue / metrics.target.revenueCents
      : null

  // Base ainda vazia: mostrar o caminho, não uma parede de zeros.
  const isEmpty =
    !isLoading && transactions.length === 0 && sales.length === 0 && bills.length === 0

  if (isEmpty) {
    return (
      <>
        <PageHeader
          title="Painel"
          description={
            isTeam
              ? 'Comece registrando o que já aconteceu.'
              : 'Comece registrando suas movimentações.'
          }
        />
        <FirstSteps isTeam={isTeam} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Painel"
        description={
          isTeam
            ? 'Como a Enjoy está no período escolhido lá em cima.'
            : 'Suas finanças no período escolhido lá em cima.'
        }
      />

      {/* Alertas — só aparecem quando há algo de fato errado. */}
      <AlertsStrip
        overdueReceivable={metrics.overdueReceivable}
        overduePayable={metrics.overduePayable}
        cash={metrics.cash}
        runway={metrics.runway}
        targetProgress={targetProgress}
      />

      <KpiGrid className="mb-4">
        <KpiCard
          label="Receita bruta"
          value={formatMoney(metrics.revenue)}
          variation={variation(metrics.revenue, metrics.revenuePrevious)}
          loading={isLoading}
          hint="Soma de todas as entradas de caixa no período. Transferências entre contas não entram."
        />
        <KpiCard
          label="Receita líquida"
          value={formatMoney(metrics.netRevenueCents)}
          loading={isLoading}
          hint="Receita bruta menos impostos e taxas financeiras."
        />
        <KpiCard
          label="Despesas"
          value={formatMoney(metrics.expenses)}
          variation={variation(metrics.expenses, metrics.expensesPrevious)}
          invertVariation
          loading={isLoading}
        />
        <KpiCard
          label="Lucro líquido"
          value={formatMoney(metrics.profit)}
          variation={variation(metrics.profit, metrics.profitPrevious)}
          loading={isLoading}
        />
        <KpiCard
          label="Margem líquida"
          value={metrics.margin != null ? formatPercent(metrics.margin) : '—'}
          variation={
            metrics.margin != null && metrics.marginPrevious != null
              ? metrics.margin - metrics.marginPrevious
              : null
          }
          loading={isLoading}
        />
        <KpiCard
          label="Cash em caixa"
          value={formatMoney(metrics.cash)}
          secondary="todas as contas"
          loading={isLoading}
          hint="Saldo somado das contas, exceto cartão de crédito — cujo saldo é dívida, não caixa."
        />

        {isTeam && (
          <>
            <KpiCard
              label="MRR"
              value={formatMoney(metrics.mrr)}
              loading={isLoading}
              hint="Receita recorrente mensal dos clientes ativos hoje. Clientes em churn saem da conta."
            />
            <KpiCard label="ARR" value={formatMoney(metrics.arrCents)} loading={isLoading} />
            <KpiCard
              label="Vendas no período"
              value={formatNumber(metrics.summary.count)}
              variation={variation(metrics.summary.count, metrics.previousSummary.count)}
              secondary={formatMoney(metrics.summary.totalCents)}
              loading={isLoading}
            />
            <KpiCard
              label="Ticket médio"
              value={formatMoney(metrics.summary.averageTicketCents)}
              variation={variation(
                metrics.summary.averageTicketCents,
                metrics.previousSummary.averageTicketCents,
              )}
              loading={isLoading}
            />
            <KpiCard
              label="Clientes ativos"
              value={formatNumber(metrics.activeClients)}
              loading={isLoading}
            />
            <KpiCard
              label="Receita de implantação"
              value={formatMoney(metrics.summary.setupRevenueCents)}
              loading={isLoading}
            />
            <KpiCard
              label="Custo de operação"
              value={formatMoney(metrics.monthlyOperationCost)}
              secondary="por mês"
              loading={isLoading}
              hint="Soma das regras recorrentes ativas, com cada frequência normalizada para o mês."
            />
            <KpiCard
              label="Runway"
              value={
                metrics.runway != null
                  ? `${formatNumber(metrics.runway)} meses`
                  : 'operação lucrativa'
              }
              loading={isLoading}
              hint="Por quantos meses o caixa atual sustenta a queima média. Só existe quando há meses de prejuízo nos últimos 12."
            />
          </>
        )}

        <KpiCard
          label="Receita prevista"
          value={formatMoney(metrics.forecastRevenue)}
          secondary="títulos do período"
          loading={isLoading}
        />
        <KpiCard
          label="A receber em aberto"
          value={formatMoney(metrics.outstandingReceivable)}
          secondary={
            metrics.overdueReceivable > 0
              ? `${formatMoney(metrics.overdueReceivable)} vencido`
              : 'nada vencido'
          }
          loading={isLoading}
        />
        <KpiCard
          label="A pagar em aberto"
          value={formatMoney(metrics.outstandingPayable)}
          secondary={
            metrics.overduePayable > 0
              ? `${formatMoney(metrics.overduePayable)} vencido`
              : 'nada vencido'
          }
          loading={isLoading}
        />
        <KpiCard
          label="Lucro acumulado"
          value={formatMoney(metrics.cumulativeProfit)}
          secondary="no período exibido"
          loading={isLoading}
        />
      </KpiGrid>

      {/* Meta do mês */}
      {isTeam && metrics.target && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Meta de faturamento do mês</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {formatMoney(metrics.revenue)}{' '}
                  <span className="text-muted-foreground/60">
                    de {formatMoney(metrics.target.revenueCents)}
                  </span>
                </p>
              </div>
              <Progress
                value={(targetProgress ?? 0) * 100}
                tone={targetProgress != null && targetProgress >= 1 ? 'positive' : 'auto'}
              />
            </div>
            <Badge variant={targetProgress != null && targetProgress >= 1 ? 'positive' : 'muted'}>
              {targetProgress != null ? formatPercent(targetProgress) : '—'}
            </Badge>
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartFrame
            title="Receita, despesa e lucro"
            description="Evolução mensal dentro do período selecionado"
            height={280}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={metrics.series}
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={chartColor('border')}
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 11, fill: chartColor('muted') }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={moneyAxisTick}
                  tick={{ fontSize: 11, fill: chartColor('muted') }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <RechartsTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={7}
                />
                <Bar
                  dataKey="revenueCents"
                  name="Receita"
                  fill={chartColor('positive')}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="expenseCents"
                  name="Despesa"
                  fill={chartColor('negative')}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  type="monotone"
                  dataKey="profitCents"
                  name="Lucro"
                  stroke={chartColor('foreground')}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <ChartFrame
          title="Onde o dinheiro sai"
          description="Despesas por centro de custo"
          height={280}
        >
          {metrics.costCenters.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem despesas no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.costCenters}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartColor('muted') }}
                  axisLine={false}
                  tickLine={false}
                  width={104}
                />
                <RechartsTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                />
                <Bar dataKey="totalCents" name="Total" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {metrics.costCenters.map((entry, index) => (
                    <Cell key={entry.key} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          title="Lucro acumulado"
          description="Soma corrida do resultado no período"
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="cumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor('foreground')} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={chartColor('foreground')} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColor('border')} vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthLabel}
                tick={{ fontSize: 11, fill: chartColor('muted') }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={moneyAxisTick}
                tick={{ fontSize: 11, fill: chartColor('muted') }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <RechartsTooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="cumulativeProfitCents"
                name="Acumulado"
                stroke={chartColor('foreground')}
                strokeWidth={2}
                fill="url(#cumulative)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Próximos vencimentos</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Títulos a pagar em aberto, do mais próximo ao mais distante
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/a-pagar">
                Ver todos <ArrowRight />
              </Link>
            </Button>
          </div>

          {metrics.upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum título a pagar em aberto.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {metrics.upcoming.map((view) => (
                <li key={view.bill.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{view.bill.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(view.bill.dueDate)}
                      {view.bill.costCenter && ` · ${COST_CENTER_LABEL[view.bill.costCenter]}`}
                    </p>
                  </div>
                  {view.status === 'overdue' && (
                    <Badge variant="negative">
                      {view.daysLate} {view.daysLate === 1 ? 'dia' : 'dias'}
                    </Badge>
                  )}
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatMoney(view.outstandingCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

/**
 * Primeiros passos.
 *
 * Substitui o painel enquanto não há nada lançado. Um painel zerado não
 * ensina nada; esta tela diz por onde começar e por que aquilo importa.
 */
function FirstSteps({ isTeam }: { isTeam: boolean }) {
  const steps = isTeam
    ? [
        {
          to: '/configuracoes',
          icon: Wallet,
          title: 'Confira suas contas',
          description:
            'Ajuste o nome e o saldo atual da conta da empresa. É de onde sai o "dinheiro em caixa".',
        },
        {
          to: '/recorrentes',
          icon: Repeat,
          title: 'Cadastre os custos fixos',
          description:
            'Salários, aluguel, tráfego, softwares. Isso revela quanto custa manter a Enjoy de pé todo mês.',
        },
        {
          to: '/vendas',
          icon: Handshake,
          title: 'Registre uma venda',
          description:
            'As cobranças do cliente são criadas junto, e faturamento, MRR e comissões se atualizam sozinhos.',
        },
        {
          to: '/transacoes',
          icon: ArrowLeftRight,
          title: 'Lance o que entrou e saiu',
          description: 'Todo dinheiro que de fato entrou ou saiu da conta entra aqui.',
        },
      ]
    : [
        {
          to: '/configuracoes',
          icon: Wallet,
          title: 'Confira sua conta',
          description: 'Ajuste o nome e o saldo atual para o app partir do número certo.',
        },
        {
          to: '/transacoes',
          icon: ArrowLeftRight,
          title: 'Lance o que entrou e saiu',
          description: 'Salário, mercado, aluguel. É a base de tudo.',
        },
        {
          to: '/recorrentes',
          icon: Repeat,
          title: 'Cadastre as contas fixas',
          description: 'O que se repete todo mês, para saber quanto sobra de verdade.',
        },
        {
          to: '/metas',
          icon: Target,
          title: 'Defina uma meta',
          description: 'O app calcula quando você chega lá no ritmo atual.',
        },
      ]

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="mb-4 p-5">
        <h2 className="text-sm font-medium">Nada lançado ainda</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Este painel se preenche sozinho conforme você usa o app. Nenhum número aqui é digitado
          duas vezes — tudo é calculado a partir do que você lança.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => (
          <Link
            key={step.to}
            to={step.to}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                <step.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {index + 1}. {step.title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

/**
 * Faixa de alertas.
 *
 * Aparece apenas quando existe um problema real — um painel de alertas que
 * está sempre lá vira ruído e deixa de ser lido.
 */
function AlertsStrip({
  overdueReceivable,
  overduePayable,
  cash,
  runway,
  targetProgress,
}: {
  overdueReceivable: number
  overduePayable: number
  cash: number
  runway: number | null
  targetProgress: number | null
}) {
  const alerts: string[] = []

  if (cash < 0) alerts.push('O caixa consolidado está negativo.')
  if (overdueReceivable > 0)
    alerts.push(`${formatMoneyCompact(overdueReceivable)} a receber está vencido.`)
  if (overduePayable > 0)
    alerts.push(`${formatMoneyCompact(overduePayable)} a pagar está em atraso.`)
  if (runway != null && runway < 6)
    alerts.push(`Runway de ${formatNumber(runway)} meses — abaixo do mínimo saudável de 6.`)
  if (targetProgress != null && targetProgress < 0.5)
    alerts.push(`Meta do mês em ${formatPercent(targetProgress)}.`)

  if (!alerts.length) return null

  return (
    <Card className="mb-4 border-negative/30 bg-negative/5 p-3">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Atenção</p>
          <ul className="mt-1 space-y-0.5">
            {alerts.map((alert) => (
              <li key={alert} className="text-sm text-muted-foreground">
                {alert}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Separator className="my-0" />
    </Card>
  )
}
