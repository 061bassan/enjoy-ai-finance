import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMonthLabel, monthKey, monthsInRange } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent } from '@/lib/money'
import { COST_CENTER_LABEL, LEAD_SOURCE_LABEL } from '@/data/enums'
import type { LeadSource } from '@/data/types'
import { expensesByCostCenter, inRange, monthlySeries, revenueByCategory } from '@/domain/finance'
import { activeSales, performanceBySeller, revenueBySource } from '@/domain/sales'
import { buildFunnel, daysInPeriod, totalizeCommercial } from '@/domain/commercial'
import { usePeriod } from '@/app/period'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  CHART_SERIES,
  ChartFrame,
  ChartTooltip,
  chartColor,
  moneyAxisTick,
} from '@/components/charts/primitives'
import {
  useCategories,
  useCommercialDays,
  useProfileMap,
  useSales,
  useTransactions,
} from '@/hooks/data'
import { useMarketingInvestment } from '@/hooks/marketing'

/**
 * Dashboard de performance.
 *
 * Diferente do dashboard principal, que responde "como estamos agora", esta
 * tela responde "como chegamos aqui" — tudo é série temporal ou distribuição.
 */
export function PerformancePage() {
  const { range } = usePeriod()

  const { data: transactions = [] } = useTransactions()
  const { data: sales = [] } = useSales()
  const { data: categories = [] } = useCategories()
  const { data: days = [] } = useCommercialDays()
  // O funil desta tela mostra custo por etapa: sem o marketing, cada etapa
  // pareceria mais barata do que é.
  const marketingCents = useMarketingInvestment(range)
  const profileMap = useProfileMap()

  const metrics = React.useMemo(() => {
    const months = monthsInRange(range)
    const seriesMonths = months.length > 1 ? months : monthsInRange({ from: range.from, to: range.to })
    const series = monthlySeries(transactions, seriesMonths)
    const current = inRange(transactions, range)

    const periodSales = activeSales(
      sales.filter((sale) => sale.saleDate >= range.from && sale.saleDate <= range.to),
    )

    // Série mensal de MRR e TCV vendidos.
    const salesByMonth = new Map<string, { mrr: number; tcv: number; count: number }>()
    for (const sale of periodSales) {
      const key = monthKey(sale.saleDate)
      const bucket = salesByMonth.get(key) ?? { mrr: 0, tcv: 0, count: 0 }
      bucket.mrr += sale.mrrCents
      bucket.tcv += sale.amountCents
      bucket.count += 1
      salesByMonth.set(key, bucket)
    }

    const salesSeries = seriesMonths.map((month) => {
      const bucket = salesByMonth.get(monthKey(month)) ?? { mrr: 0, tcv: 0, count: 0 }
      return { month, mrrCents: bucket.mrr, tcvCents: bucket.tcv, count: bucket.count }
    })

    const commercial = totalizeCommercial(daysInPeriod(days, range))

    return {
      series,
      salesSeries,
      costCenters: expensesByCostCenter(current, COST_CENTER_LABEL),
      revenueCategories: revenueByCategory(current, categories),
      byCloser: performanceBySeller(periodSales, 'closerId'),
      bySdr: performanceBySeller(periodSales, 'sdrId'),
      bySource: revenueBySource(periodSales),
      funnel: buildFunnel(commercial, { extraInvestmentCents: marketingCents }),
    }
  }, [transactions, sales, categories, days, marketingCents, range])

  return (
    <>
      <PageHeader
        title="Evolução"
        description="Como os números mudaram ao longo do tempo e de onde vem cada real."
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Receita e despesa por mês" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={metrics.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
              <Bar
                dataKey="revenueCents"
                name="Receita"
                fill={chartColor('positive')}
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
              />
              <Bar
                dataKey="expenseCents"
                name="Despesa"
                fill={chartColor('negative')}
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
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

        <ChartFrame title="Lucro acumulado" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="perf-cumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor('foreground')} stopOpacity={0.24} />
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
              <RechartsTooltip content={<ChartTooltip />} labelFormatter={formatMonthLabel} />
              <Area
                type="monotone"
                dataKey="cumulativeProfitCents"
                name="Acumulado"
                stroke={chartColor('foreground')}
                strokeWidth={2}
                fill="url(#perf-cumulative)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="MRR e TCV vendidos por mês" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={metrics.salesSeries}
              margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
            >
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
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
              <Bar
                dataKey="tcvCents"
                name="TCV"
                fill={chartColor('muted')}
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
              />
              <Line
                type="monotone"
                dataKey="mrrCents"
                name="MRR"
                stroke={chartColor('foreground')}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame title="Receita por origem do lead" height={280}>
          {metrics.bySource.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.bySource}
                  dataKey="totalCents"
                  nameKey="source"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                >
                  {metrics.bySource.map((entry, index) => (
                    <Cell key={entry.source} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={
                    <ChartTooltip />
                  }
                  formatter={(value: number, name: string) => [
                    formatMoney(value),
                    LEAD_SOURCE_LABEL[name as LeadSource] ?? name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={7}
                  formatter={(value: string) => LEAD_SOURCE_LABEL[value as LeadSource] ?? value}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <SellerCard
          title="Receita por closer"
          rows={metrics.byCloser.map((row) => ({
            id: row.sellerId,
            name: profileMap.get(row.sellerId)?.name ?? 'Sem responsável',
            totalCents: row.totalCents,
            count: row.count,
          }))}
        />
        <SellerCard
          title="Receita por SDR"
          rows={metrics.bySdr.map((row) => ({
            id: row.sellerId,
            name: profileMap.get(row.sellerId)?.name ?? 'Sem responsável',
            totalCents: row.totalCents,
            count: row.count,
          }))}
        />

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Funil comercial</h3>
          <ul className="space-y-2.5">
            {metrics.funnel.map((stage) => (
              <li key={stage.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{stage.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatNumber(stage.count)}
                    {stage.conversionFromPrevious != null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {formatPercent(stage.conversionFromPrevious)}
                      </span>
                    )}
                  </span>
                </div>
                <Progress value={(stage.conversionFromTop ?? 0) * 100} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Despesas por centro de custo" height={300}>
          {metrics.costCenters.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.costCenters}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartColor('muted') }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
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

        <ChartFrame title="Receita por categoria" height={300}>
          {metrics.revenueCategories.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.revenueCategories}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartColor('muted') }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <RechartsTooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                />
                <Bar dataKey="totalCents" name="Total" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {metrics.revenueCategories.map((entry, index) => (
                    <Cell key={entry.key} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>
    </>
  )
}

function SellerCard({
  title,
  rows,
}: {
  title: string
  rows: { id: string; name: string; totalCents: number; count: number }[]
}) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.totalCents), 0)

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem vendas no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(row.totalCents)}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {row.count} {row.count === 1 ? 'venda' : 'vendas'}
                  </span>
                </span>
              </div>
              <Progress value={max ? (row.totalCents / max) * 100 : 0} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados no período.
    </div>
  )
}
