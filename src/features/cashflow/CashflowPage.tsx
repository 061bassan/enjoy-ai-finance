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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeftRight } from 'lucide-react'
import { formatMonthLabel, monthsInRange, today } from '@/lib/date'
import { formatMoney, formatNumber } from '@/lib/money'
import { ACCOUNT_TYPE_LABEL } from '@/data/enums'
import {
  balancesByAccount,
  burnRate,
  monthlySeries,
  runwayMonths,
  totalCash,
} from '@/domain/finance'
import { monthlyCashflow, periodTotals, projectionMonths, workingCapital } from '@/domain/cashflow'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChartFrame, ChartTooltip, chartColor, moneyAxisTick } from '@/components/charts/primitives'
import { useAccounts, useBillPayments, useBills, useTransactions } from '@/hooks/data'
import { TransferDialog } from './TransferDialog'

/**
 * Fluxo de caixa.
 *
 * A tela responde a três perguntas distintas, e por isso tem três blocos:
 * quanto entrou e saiu (realizado), quanto vai entrar e sair (previsto), e
 * até quando o caixa aguenta (burn rate e runway).
 */
export function CashflowPage() {
  const { range } = usePeriod()
  const { allow } = useSession()
  const canManage = allow('manage:transactions')

  const { data: transactions = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: bills = [] } = useBills()
  const { data: payments = [] } = useBillPayments()

  const [transferOpen, setTransferOpen] = React.useState(false)

  const metrics = React.useMemo(() => {
    const totals = periodTotals(transactions, range)
    const cash = totalCash(accounts, transactions)

    const months = projectionMonths(range, 6)

    // Saldo no início da janela — o que já havia antes do primeiro mês exibido.
    const firstMonth = months[0] ?? range.from
    const beforeWindow = transactions.filter((t) => t.date < firstMonth)
    const openingBalance = accounts
      .filter((a) => !a.archived && a.type !== 'credit_card')
      .reduce((sum, account) => {
        const own = beforeWindow.filter((t) => t.accountId === account.id)
        const movement = own.reduce((acc, t) => {
          if (t.kind === 'income') return acc + t.amountCents
          return acc - t.amountCents
        }, 0)
        return sum + account.openingBalanceCents + movement
      }, 0)

    const flow = monthlyCashflow(transactions, bills, months, openingBalance)

    // Burn e runway olham os últimos 12 meses, independentemente do filtro.
    const yearMonths = monthsInRange({
      from: `${Number(today().slice(0, 4)) - 1}-${today().slice(5, 7)}-01`,
      to: today(),
    })
    const burn = burnRate(monthlySeries(transactions, yearMonths))

    return {
      totals,
      cash,
      flow,
      balances: balancesByAccount(accounts, transactions),
      workingCapitalCents: workingCapital(bills, payments),
      burn,
      runway: runwayMonths(cash, burn),
      lowestProjected: flow.reduce(
        (min, point) => Math.min(min, point.projectedBalanceCents),
        Number.POSITIVE_INFINITY,
      ),
    }
  }, [transactions, accounts, bills, payments, range])

  return (
    <>
      <PageHeader
        title="Fluxo de caixa"
        description="Realizado até hoje, previsto daqui pra frente. O previsto vem dos títulos por vencimento; o realizado, dos lançamentos de caixa."
        actions={
          canManage && (
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight /> Transferir entre contas
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        <KpiCard label="Cash em caixa" value={formatMoney(metrics.cash)} />
        <KpiCard label="Entradas no período" value={formatMoney(metrics.totals.inflowCents)} />
        <KpiCard label="Saídas no período" value={formatMoney(metrics.totals.outflowCents)} />
        <KpiCard label="Resultado do período" value={formatMoney(metrics.totals.netCents)} />
        <KpiCard
          label="Capital de giro"
          value={formatMoney(metrics.workingCapitalCents)}
          hint="A receber em aberto menos a pagar em aberto. Negativo significa que os compromissos superam os direitos, mesmo com caixa positivo hoje."
        />
        <KpiCard
          label="Burn rate"
          value={metrics.burn > 0 ? formatMoney(metrics.burn) : 'sem queima'}
          secondary={metrics.burn > 0 ? 'média dos meses negativos' : 'operação lucrativa'}
          hint="Média dos meses de prejuízo nos últimos 12. Meses lucrativos não entram na média — a pergunta é quanto o caixa aguenta no ritmo ruim."
        />
        <KpiCard
          label="Runway"
          value={metrics.runway != null ? `${formatNumber(metrics.runway)} meses` : '—'}
        />
        <KpiCard
          label="Menor saldo projetado"
          value={
            Number.isFinite(metrics.lowestProjected) ? formatMoney(metrics.lowestProjected) : '—'
          }
          hint="O ponto mais baixo do saldo na janela projetada. Se for negativo, existe um mês em que o caixa não fecha."
        />
      </KpiGrid>

      <div className="mb-4">
        <ChartFrame
          title="Saldo projetado"
          description="Realizado até o mês corrente, previsto nos meses seguintes"
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.flow} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="balance" x1="0" y1="0" x2="0" y2="1">
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
                width={72}
              />
              <RechartsTooltip content={<ChartTooltip />} labelFormatter={formatMonthLabel} />
              {/* A linha do zero é o que importa olhar: cruzar para baixo é o problema. */}
              <ReferenceLine y={0} stroke={chartColor('negative')} strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="projectedBalanceCents"
                name="Saldo"
                stroke={chartColor('foreground')}
                strokeWidth={2}
                fill="url(#balance)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartFrame
            title="Previsto contra realizado"
            description="Barras são o previsto pelos títulos; a linha é o que entrou de fato"
            height={280}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics.flow} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
                  width={72}
                />
                <RechartsTooltip content={<ChartTooltip />} labelFormatter={formatMonthLabel} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
                <Bar
                  dataKey="forecastInflowCents"
                  name="Previsto a receber"
                  fill={chartColor('positive')}
                  fillOpacity={0.45}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                />
                <Bar
                  dataKey="forecastOutflowCents"
                  name="Previsto a pagar"
                  fill={chartColor('negative')}
                  fillOpacity={0.45}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                />
                <Line
                  type="monotone"
                  dataKey="actualInflowCents"
                  name="Recebido"
                  stroke={chartColor('foreground')}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="actualOutflowCents"
                  name="Pago"
                  stroke={chartColor('muted')}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Saldo por conta</h3>
          <ul className="space-y-3">
            {metrics.balances.map(({ account, balanceCents }) => (
              <li key={account.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">{account.name}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatMoney(balanceCents)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {ACCOUNT_TYPE_LABEL[account.type]}
                  {account.type === 'credit_card' && ' · fora do caixa'}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ChartFrame
        title="Resultado mensal realizado"
        description="Entradas menos saídas, mês a mês"
        height={240}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={metrics.flow} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
              width={72}
            />
            <RechartsTooltip content={<ChartTooltip />} labelFormatter={formatMonthLabel} />
            <ReferenceLine y={0} stroke={chartColor('border')} />
            <Bar dataKey="actualNetCents" name="Resultado" radius={[3, 3, 0, 0]} maxBarSize={30}>
              {metrics.flow.map((point) => (
                <Cell
                  key={point.period}
                  fill={point.actualNetCents >= 0 ? chartColor('positive') : chartColor('negative')}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} accounts={accounts} />
    </>
  )
}
