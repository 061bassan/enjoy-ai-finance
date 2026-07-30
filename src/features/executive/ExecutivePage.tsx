import * as React from 'react'
import { Navigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatMonthLabel, monthsInRange, today } from '@/lib/date'
import { formatMoney, formatMultiple, formatNumber, formatPercent } from '@/lib/money'
import {
  burnRate,
  monthlySeries,
  netMargin,
  netProfit,
  grossRevenue,
  inRange,
  runwayMonths,
  totalCash,
  variation,
} from '@/domain/finance'
import { monthlyCashflow, projectionMonths, workingCapital } from '@/domain/cashflow'
import {
  activeMrr,
  arr,
  churnRate,
  lifetimeValue,
  ltvToCac,
  summarizeSales,
} from '@/domain/sales'
import { commercialKpis, daysInPeriod, totalizeCommercial } from '@/domain/commercial'
import { totalMonthlyCost } from '@/domain/recurrence'
import { toBillViews, totalOutstanding, totalOverdue } from '@/domain/bills'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { ChartFrame, ChartTooltip, chartColor, moneyAxisTick } from '@/components/charts/primitives'
import {
  useAccounts,
  useBillPayments,
  useBills,
  useClients,
  useCommercialDays,
  useRecurringRules,
  useSales,
  useTransactions,
} from '@/hooks/data'

/**
 * Dashboard executivo.
 *
 * Restrito a quem tem `view:executive` (sócio, admin e financeiro). O papel
 * `sales` não entra — não deve enxergar custo da empresa nem runway.
 *
 * A tela responde a uma pergunta só: o negócio é saudável e sustentável?
 * Por isso privilegia razões (LTV/CAC, margem, runway) sobre valores absolutos.
 */
export function ExecutivePage() {
  const { range, comparisonRange } = usePeriod()
  const { allow } = useSession()

  const { data: transactions = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: sales = [] } = useSales()
  const { data: clients = [] } = useClients()
  const { data: bills = [] } = useBills()
  const { data: payments = [] } = useBillPayments()
  const { data: days = [] } = useCommercialDays()
  const { data: rules = [] } = useRecurringRules()

  const metrics = React.useMemo(() => {
    const current = inRange(transactions, range)
    const previous = inRange(transactions, comparisonRange)

    const periodSales = sales.filter(
      (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
    )
    const previousSales = sales.filter(
      (sale) => sale.saleDate >= comparisonRange.from && sale.saleDate <= comparisonRange.to,
    )

    const summary = summarizeSales(periodSales)
    const previousSummary = summarizeSales(previousSales)

    const commercial = totalizeCommercial(daysInPeriod(days, range))
    const kpis = commercialKpis(commercial, periodSales)

    const mrr = activeMrr(sales, clients)
    const cash = totalCash(accounts, transactions)

    const yearMonths = monthsInRange({
      from: `${Number(today().slice(0, 4)) - 1}-${today().slice(5, 7)}-01`,
      to: today(),
    })
    const yearSeries = monthlySeries(transactions, yearMonths)
    const burn = burnRate(yearSeries)

    const ltv = lifetimeValue(sales)
    const cac = kpis.cacCents ?? 0

    const billViews = toBillViews(bills, payments)
    const receivables = billViews.filter((view) => view.bill.direction === 'receivable')

    // Forecast: o que ainda vai vencer daqui pra frente.
    const forecast = receivables
      .filter((view) => view.bill.dueDate > today() && view.status !== 'paid')
      .reduce((sum, view) => sum + view.outstandingCents, 0)

    const projectionRange = projectionMonths(range, 6)
    const flow = monthlyCashflow(transactions, bills, projectionRange, cash)

    return {
      revenue: grossRevenue(current),
      revenuePrevious: grossRevenue(previous),
      profit: netProfit(current),
      profitPrevious: netProfit(previous),
      margin: netMargin(current),
      marginPrevious: netMargin(previous),
      cash,
      mrr,
      arrCents: arr(mrr),
      summary,
      previousSummary,
      activeClients: clients.filter((client) => client.status === 'active').length,
      newClients: clients.filter(
        (client) =>
          client.startDate && client.startDate >= range.from && client.startDate <= range.to,
      ).length,
      churn: churnRate(clients, range),
      ltv,
      cac,
      ltvCac: ltvToCac(ltv, cac),
      winRate: kpis.winRate,
      roi: kpis.roi,
      burn,
      runway: runwayMonths(cash, burn),
      operationCost: totalMonthlyCost(rules.filter((r) => r.active && r.kind === 'expense')),
      workingCapitalCents: workingCapital(bills, payments),
      forecast,
      outstandingReceivable: totalOutstanding(receivables),
      overdueReceivable: totalOverdue(receivables),
      flow,
      yearSeries,
    }
  }, [transactions, accounts, sales, clients, bills, payments, days, rules, range, comparisonRange])

  // A rota é escondida na navegação, mas alguém pode chegar pela URL.
  if (!allow('view:executive')) return <Navigate to="/" replace />

  const health = assessHealth(metrics)

  return (
    <>
      <PageHeader
        title="Visão dos sócios"
        description="O negócio se paga? Vale o que custa trazer cliente novo? O caixa aguenta quanto tempo?"
      />

      <Card
        className={
          'mb-4 p-4 ' +
          (health.issues.length ? 'border-negative/30 bg-negative/5' : 'border-positive/30 bg-positive/5')
        }
      >
        <div className="flex gap-3">
          {health.issues.length ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{health.headline}</p>
            {health.issues.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {health.issues.map((issue) => (
                  <li key={issue} className="text-sm text-muted-foreground">
                    {issue}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <KpiGrid className="mb-4">
        <KpiCard
          label="Receita"
          value={formatMoney(metrics.revenue)}
          variation={variation(metrics.revenue, metrics.revenuePrevious)}
        />
        <KpiCard
          label="Lucro"
          value={formatMoney(metrics.profit)}
          variation={variation(metrics.profit, metrics.profitPrevious)}
        />
        <KpiCard
          label="Margem"
          value={metrics.margin != null ? formatPercent(metrics.margin) : '—'}
          variation={
            metrics.margin != null && metrics.marginPrevious != null
              ? metrics.margin - metrics.marginPrevious
              : null
          }
        />
        <KpiCard label="MRR" value={formatMoney(metrics.mrr)} />
        <KpiCard label="ARR" value={formatMoney(metrics.arrCents)} />
        <KpiCard label="Cash" value={formatMoney(metrics.cash)} />
        <KpiCard label="Clientes ativos" value={formatNumber(metrics.activeClients)} />
        <KpiCard label="Novos clientes" value={formatNumber(metrics.newClients)} />
        <KpiCard
          label="Churn"
          value={metrics.churn != null ? formatPercent(metrics.churn) : '—'}
          invertVariation
        />
        <KpiCard
          label="LTV"
          value={formatMoney(metrics.ltv)}
          hint="Receita média por cliente ao longo da vida, usando a duração média de contrato observada — não uma constante arbitrária."
        />
        <KpiCard label="CAC" value={formatMoney(metrics.cac)} invertVariation />
        <KpiCard
          label="LTV / CAC"
          value={metrics.ltvCac != null ? formatMultiple(metrics.ltvCac) : '—'}
          hint="Abaixo de 3x costuma indicar aquisição cara demais para o valor que o cliente gera."
        />
        <KpiCard
          label="ROI comercial"
          value={metrics.roi != null ? formatMultiple(metrics.roi) : '—'}
        />
        <KpiCard
          label="Win rate"
          value={metrics.winRate != null ? formatPercent(metrics.winRate) : '—'}
        />
        <KpiCard label="Ticket médio" value={formatMoney(metrics.summary.averageTicketCents)} />
        <KpiCard
          label="Custo de operação"
          value={formatMoney(metrics.operationCost)}
          invertVariation
          secondary="por mês"
        />
        <KpiCard
          label="Burn rate"
          value={metrics.burn > 0 ? formatMoney(metrics.burn) : 'sem queima'}
          invertVariation
        />
        <KpiCard
          label="Runway"
          value={metrics.runway != null ? `${formatNumber(metrics.runway)} meses` : '—'}
        />
        <KpiCard
          label="Forecast a receber"
          value={formatMoney(metrics.forecast)}
          secondary="títulos futuros em aberto"
        />
        <KpiCard
          label="Capital de giro"
          value={formatMoney(metrics.workingCapitalCents)}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Saldo projetado"
          description="Realizado até hoje, previsto pelos títulos daqui pra frente"
          height={280}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.flow} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="exec-balance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor('foreground')} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={chartColor('foreground')} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColor('border')} vertical={false} />
              <XAxis
                dataKey="period"
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
              <RechartsTooltip content={<ChartTooltip />} labelFormatter={formatMonthLabel} />
              <Area
                type="monotone"
                dataKey="projectedBalanceCents"
                name="Saldo"
                stroke={chartColor('foreground')}
                strokeWidth={2}
                fill="url(#exec-balance)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Lucro nos últimos 12 meses"
          description="Independente do filtro de período"
          height={280}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.yearSeries} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="exec-profit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor('positive')} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chartColor('positive')} stopOpacity={0} />
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
              <RechartsTooltip content={<ChartTooltip />} labelFormatter={formatMonthLabel} />
              <Area
                type="monotone"
                dataKey="profitCents"
                name="Lucro"
                stroke={chartColor('positive')}
                strokeWidth={2}
                fill="url(#exec-profit)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
    </>
  )
}

/**
 * Diagnóstico de saúde.
 *
 * Os limiares são os usuais de SaaS/serviço: LTV/CAC acima de 3, runway de 6
 * meses, margem de 20%. Não são leis — servem para chamar atenção, e cada um
 * está explicado na própria mensagem para o sócio poder discordar com base.
 */
function assessHealth(metrics: {
  margin: number | null
  ltvCac: number | null
  runway: number | null
  churn: number | null
  overdueReceivable: number
  workingCapitalCents: number
  cash: number
}): { headline: string; issues: string[] } {
  const issues: string[] = []

  if (metrics.margin != null && metrics.margin < 0.2) {
    issues.push(
      `Margem em ${formatPercent(metrics.margin)} — abaixo dos 20% que costumam sustentar uma operação de serviço.`,
    )
  }
  if (metrics.ltvCac != null && metrics.ltvCac < 3) {
    issues.push(
      `LTV/CAC em ${formatMultiple(metrics.ltvCac)} — abaixo de 3x, cada cliente novo devolve pouco sobre o que custou adquirir.`,
    )
  }
  if (metrics.runway != null && metrics.runway < 6) {
    issues.push(
      `Runway de ${formatNumber(metrics.runway)} meses — abaixo do colchão mínimo de 6.`,
    )
  }
  if (metrics.churn != null && metrics.churn > 0.05) {
    issues.push(`Churn em ${formatPercent(metrics.churn)} no período.`)
  }
  if (metrics.overdueReceivable > 0) {
    issues.push(`${formatMoney(metrics.overdueReceivable)} a receber está vencido.`)
  }
  if (metrics.workingCapitalCents < 0) {
    issues.push('Capital de giro negativo: os compromissos superam os direitos a receber.')
  }
  if (metrics.cash < 0) {
    issues.push('Caixa consolidado negativo.')
  }

  return {
    headline: issues.length
      ? `${issues.length} ${issues.length === 1 ? 'ponto pede atenção' : 'pontos pedem atenção'}`
      : 'Indicadores dentro dos parâmetros saudáveis',
    issues,
  }
}
