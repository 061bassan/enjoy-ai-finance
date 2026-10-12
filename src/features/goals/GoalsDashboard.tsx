import * as React from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, CircleX, Target, TrendingUp, Trophy } from 'lucide-react'
import {
  daysInRange,
  formatDate,
  formatMonthLabel,
  formatMonthLong,
  monthKey,
  rangeOfMonth,
  today,
  type IsoDate,
} from '@/lib/date'
import { formatMoney, formatMoneyCompact, formatNumber, formatPercent } from '@/lib/money'
import type { MonthlyTarget } from '@/data/types'
import { cumulativeSeries, goalPace, type GoalPace, type PaceStatus } from '@/domain/goals'
import { chartColor } from '@/components/charts/primitives'
import { EmptyState } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { useMonthlyTargets } from '@/hooks/data'
import { useMonthActuals, type MonthActuals } from './monthActuals'

// ---------------------------------------------------------------------------
// Catálogo de métricas
// ---------------------------------------------------------------------------

type MetricFormat = 'money' | 'number' | 'percent'

interface MetricDef {
  key: string
  label: string
  format: MetricFormat
  target: keyof Pick<
    MonthlyTarget,
    | 'revenueCents'
    | 'profitCents'
    | 'mrrCents'
    | 'setupCents'
    | 'salesCount'
    | 'clientsCount'
    | 'meetingsCount'
    | 'proposalsCount'
    | 'marginPercent'
  >
  actual: keyof MonthActuals
  /** Margem é uma razão do mês, não uma soma — não tem curva acumulada nem ritmo. */
  cumulative: boolean
}

const METRICS: MetricDef[] = [
  {
    key: 'revenue',
    label: 'Faturamento',
    format: 'money',
    target: 'revenueCents',
    actual: 'revenueCents',
    cumulative: true,
  },
  {
    key: 'profit',
    label: 'Lucro',
    format: 'money',
    target: 'profitCents',
    actual: 'profitCents',
    cumulative: true,
  },
  {
    key: 'mrr',
    label: 'MRR',
    format: 'money',
    target: 'mrrCents',
    actual: 'mrrCents',
    cumulative: true,
  },
  {
    key: 'setup',
    label: 'Implantação',
    format: 'money',
    target: 'setupCents',
    actual: 'setupCents',
    cumulative: true,
  },
  {
    key: 'sales',
    label: 'Vendas',
    format: 'number',
    target: 'salesCount',
    actual: 'salesCount',
    cumulative: true,
  },
  {
    key: 'clients',
    label: 'Novos clientes',
    format: 'number',
    target: 'clientsCount',
    actual: 'newClientsCount',
    cumulative: true,
  },
  {
    key: 'meetings',
    label: 'Reuniões',
    format: 'number',
    target: 'meetingsCount',
    actual: 'meetingsCount',
    cumulative: true,
  },
  {
    key: 'proposals',
    label: 'Propostas',
    format: 'number',
    target: 'proposalsCount',
    actual: 'proposalsCount',
    cumulative: true,
  },
  {
    key: 'margin',
    label: 'Margem',
    format: 'percent',
    target: 'marginPercent',
    actual: 'marginPercent',
    cumulative: false,
  },
]

function formatValue(format: MetricFormat, value: number, compact = false) {
  if (format === 'money') return compact ? formatMoneyCompact(value) : formatMoney(value)
  if (format === 'percent') return `${formatNumber(value)}%`
  return formatNumber(Math.round(value))
}

const PRIMARY_KEY_STORAGE = 'goals.primaryMetric'

/** A métrica principal é preferência de quem olha — fica no navegador, não no banco. */
function readPrimaryKey(): string | null {
  try {
    return window.localStorage.getItem(PRIMARY_KEY_STORAGE)
  } catch {
    return null
  }
}

function writePrimaryKey(key: string) {
  try {
    window.localStorage.setItem(PRIMARY_KEY_STORAGE, key)
  } catch {
    // Navegação privada ou armazenamento bloqueado: só não lembra a escolha.
  }
}

// O realizado usa a cor de destaque do produto (a que o sócio escolhe em
// Aparência); meta e ritmo ideal ficam em cinza tracejado — referência, não dado.
const REALIZED = 'hsl(var(--primary))'
// `--muted` é cor de FUNDO no tema — como traço some no escuro. Referência usa a tinta secundária.
const REFERENCE = 'hsl(var(--muted-foreground))'

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

interface MetricView {
  def: MetricDef
  target: number
  current: number
  pace: GoalPace
  series: ReturnType<typeof cumulativeSeries> | null
}

/**
 * Painel de metas: só gráficos.
 *
 * Um cartão grande para a métrica principal — anel de progresso, curva do mês
 * contra a reta ideal e o histórico dos últimos meses — e cartões menores para
 * as demais. Clicar num cartão secundário o promove a principal: é o jeito
 * mais curto de "olhar de perto" sem procurar um seletor.
 *
 * Os números vêm de `useMonthActuals`, a mesma conta da aba "Metas do mês".
 */
export function GoalsDashboard() {
  const { data: targets = [], isLoading } = useMonthlyTargets()
  const actualsFor = useMonthActuals()

  const currentMonth = `${today().slice(0, 7)}-01`
  const months = React.useMemo(
    () => [...targets].sort((a, b) => b.month.localeCompare(a.month)),
    [targets],
  )
  const [selectedMonth, setSelectedMonth] = React.useState<IsoDate | null>(null)
  const month =
    selectedMonth ??
    months.find((row) => row.month === currentMonth)?.month ??
    months[0]?.month ??
    currentMonth
  const target = targets.find((row) => row.month === month) ?? null

  const [primaryKey, setPrimaryKey] = React.useState<string | null>(() => readPrimaryKey())

  const views = React.useMemo<MetricView[]>(() => {
    if (!target) return []
    const range = rangeOfMonth(month)
    const days = daysInRange(range)
    const now = today()
    const asOf = now < range.to ? now : range.to
    const elapsedDays = days.filter((day) => day <= asOf).length

    // Um realizado por dia decorrido, do dia 1 até ele — a curva acumulada.
    const daily = new Map<IsoDate, MonthActuals>()
    for (const day of days) {
      if (day <= asOf) daily.set(day, actualsFor({ from: range.from, to: day }))
    }
    const monthTotal = actualsFor(range)

    return METRICS.filter((def) => target[def.target] > 0).map((def) => {
      const goal = target[def.target]
      const current = monthTotal[def.actual]
      return {
        def,
        target: goal,
        current,
        pace: goalPace({
          current,
          target: goal,
          elapsedDays,
          totalDays: days.length,
          cumulative: def.cumulative,
        }),
        series: def.cumulative
          ? cumulativeSeries(days, goal, asOf, (day) => daily.get(day)?.[def.actual] ?? 0)
          : null,
      }
    })
  }, [target, month, actualsFor])

  const primary =
    views.find((view) => view.def.key === primaryKey) ??
    views.find((view) => view.def.key === 'revenue') ??
    views[0]
  const secondary = views.filter((view) => view !== primary)

  const history = React.useMemo(() => {
    if (!primary) return []
    return [...targets]
      .filter((row) => row.month <= month && row[primary.def.target] > 0)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((row) => ({
        month: row.month,
        realized: actualsFor(rangeOfMonth(row.month))[primary.def.actual],
        target: row[primary.def.target],
      }))
  }, [targets, month, primary, actualsFor])

  function choosePrimary(key: string) {
    setPrimaryKey(key)
    writePrimaryKey(key)
  }

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
  }

  if (!target || !primary) {
    return (
      <EmptyState
        icon={Target}
        title="Sem meta para mostrar"
        description='Defina a meta do mês na aba "Metas do mês" — o painel se monta sozinho a partir dela.'
      />
    )
  }

  const isCurrentMonth = monthKey(month) === monthKey(currentMonth)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((row) => (
              <SelectItem key={row.month} value={row.month}>
                {formatMonthLong(row.month)}
                {monthKey(row.month) === monthKey(currentMonth) && ' · atual'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={primary.def.key} onValueChange={choosePrimary}>
          <SelectTrigger className="w-full sm:w-[220px]" aria-label="Métrica principal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {views.map((view) => (
              <SelectItem key={view.def.key} value={view.def.key}>
                Principal: {view.def.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PrimaryCard view={primary} history={history} isCurrentMonth={isCurrentMonth} />

      {secondary.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Metas secundárias</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {secondary.map((view) => (
              <SecondaryCard
                key={view.def.key}
                view={view}
                onSelect={() => choosePrimary(view.def.key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cartão principal
// ---------------------------------------------------------------------------

function PrimaryCard({
  view,
  history,
  isCurrentMonth,
}: {
  view: MetricView
  history: { month: IsoDate; realized: number; target: number }[]
  isCurrentMonth: boolean
}) {
  const { def, pace } = view
  const fmt = (value: number) => formatValue(def.format, value)
  const fmtCompact = (value: number) => formatValue(def.format, value, true)

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Métrica principal
          </p>
          <h2 className="text-lg font-semibold">{def.label}</h2>
        </div>
        <StatusPill status={pace.status} cumulative={def.cumulative} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col items-center gap-4">
          <ProgressRing
            ratio={pace.ratio}
            expected={def.cumulative ? pace.expectedRatio : null}
            size={176}
            stroke={14}
            reached={pace.status === 'reached'}
          >
            <span className="text-3xl font-semibold tabular-nums">{formatPercent(pace.ratio)}</span>
            <span className="text-xs text-muted-foreground">da meta</span>
          </ProgressRing>

          <div className="text-center">
            <p className="text-2xl font-semibold tabular-nums">{fmt(view.current)}</p>
            <p className="text-sm text-muted-foreground">de {fmt(view.target)}</p>
          </div>

          <dl className="grid w-full grid-cols-2 gap-2 text-sm">
            <Stat
              label="Falta"
              value={pace.remainingValue > 0 ? fmt(pace.remainingValue) : 'Nada 🎉'}
            />
            {def.cumulative && isCurrentMonth ? (
              <>
                <Stat
                  label="Projeção do mês"
                  value={pace.projectedValue != null ? fmt(pace.projectedValue) : '—'}
                />
                <Stat
                  label="Precisa por dia"
                  value={
                    pace.requiredPerDay == null
                      ? '—'
                      : // "0,6 reunião por dia" diz mais que um "1" arredondado.
                        def.format === 'number'
                        ? formatNumber(Math.round(pace.requiredPerDay * 10) / 10)
                        : fmt(pace.requiredPerDay)
                  }
                />
                <Stat label="Dias restantes" value={String(pace.daysLeft)} />
              </>
            ) : (
              <Stat label="Situação" value={pace.ratio >= 1 ? 'Batida' : 'Abaixo'} />
            )}
          </dl>
        </div>

        <div className="min-w-0 space-y-5">
          {view.series && (
            <figure>
              <figcaption className="mb-2">
                <span className="text-sm font-medium">Evolução no mês</span>
                <Legend
                  items={[
                    { label: 'Realizado acumulado', color: REALIZED },
                    { label: 'Ritmo ideal', color: REFERENCE, dashed: true },
                  ]}
                />
              </figcaption>
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={view.series}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="goal-realized" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={REALIZED} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={REALIZED} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColor('border')}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: REFERENCE }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      tickFormatter={fmtCompact}
                      tick={{ fontSize: 11, fill: REFERENCE }}
                      axisLine={false}
                      tickLine={false}
                      width={def.format === 'money' ? 72 : 36}
                      // A meta sempre cabe no eixo (é a linha que se quer alcançar), e o
                      // lucro negativo do começo do mês também.
                      domain={[
                        (min: number) => Math.min(0, min),
                        (max: number) => Math.max(max, view.target),
                      ]}
                    />
                    <RechartsTooltip
                      cursor={{ stroke: chartColor('border') }}
                      content={<SeriesTooltip format={fmt} />}
                    />
                    <ReferenceLine
                      y={view.target}
                      stroke={REFERENCE}
                      strokeDasharray="4 4"
                      label={{
                        value: `Meta ${fmtCompact(view.target)}`,
                        position: 'insideTopLeft',
                        fontSize: 11,
                        fill: REFERENCE,
                      }}
                    />
                    <Line
                      type="linear"
                      dataKey="ideal"
                      name="Ritmo ideal"
                      stroke={REFERENCE}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="realized"
                      name="Realizado"
                      stroke={REALIZED}
                      strokeWidth={2}
                      fill="url(#goal-realized)"
                      connectNulls={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </figure>
          )}

          {history.length > 1 && (
            <figure>
              <figcaption className="mb-2">
                <span className="text-sm font-medium">Últimos meses</span>
                <Legend
                  items={[
                    { label: 'Realizado', color: REALIZED },
                    { label: 'Meta', color: REFERENCE, dashed: true },
                  ]}
                />
              </figcaption>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColor('border')}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonthLabel}
                      tick={{ fontSize: 11, fill: REFERENCE }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={fmtCompact}
                      tick={{ fontSize: 11, fill: REFERENCE }}
                      axisLine={false}
                      tickLine={false}
                      width={def.format === 'money' ? 72 : 36}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                      content={<HistoryTooltip format={fmt} />}
                    />
                    <Bar
                      dataKey="realized"
                      name="Realizado"
                      fill={REALIZED}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    >
                      {/* O mês em andamento fica mais claro: barra baixa ali não é
                          resultado ruim, é mês que ainda não acabou. */}
                      {history.map((point) => (
                        <Cell
                          key={point.month}
                          fillOpacity={monthKey(point.month) === monthKey(today()) ? 0.45 : 0.9}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="linear"
                      dataKey="target"
                      name="Meta"
                      stroke={REFERENCE}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={{
                        r: 4,
                        fill: 'hsl(var(--card))',
                        stroke: REFERENCE,
                        strokeWidth: 2,
                        strokeDasharray: '0',
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </figure>
          )}

          {!view.series && history.length <= 1 && (
            <p className="text-sm text-muted-foreground">
              {def.label} é medida no mês inteiro, sem curva diária. O histórico aparece quando
              houver mais de um mês com meta.
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Cartões secundários
// ---------------------------------------------------------------------------

function SecondaryCard({ view, onSelect }: { view: MetricView; onSelect: () => void }) {
  const { def, pace } = view
  const fmt = (value: number) => formatValue(def.format, value)

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Ver ${def.label} como métrica principal`}
      className="group rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{def.label}</span>
        <StatusPill status={pace.status} cumulative={def.cumulative} compact />
      </div>

      <div className="flex items-center gap-3">
        <ProgressRing
          ratio={pace.ratio}
          expected={def.cumulative ? pace.expectedRatio : null}
          size={64}
          stroke={7}
          reached={pace.status === 'reached'}
        >
          <span className="text-xs font-semibold tabular-nums">{formatPercent(pace.ratio)}</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tabular-nums">{fmt(view.current)}</p>
          <p className="truncate text-xs text-muted-foreground">de {fmt(view.target)}</p>
        </div>
      </div>

      {view.series && (
        <div className="mt-3 h-12" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={view.series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${def.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REALIZED} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={REALIZED} stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Lucro começa negativo quando a despesa chega antes da receita — o eixo desce junto. */}
              <YAxis
                hide
                domain={[(min: number) => Math.min(0, min), Math.max(view.target, view.current)]}
              />
              <RechartsTooltip
                cursor={{ stroke: chartColor('border') }}
                content={<SeriesTooltip format={fmt} />}
              />
              <Line
                type="linear"
                dataKey="ideal"
                name="Ritmo ideal"
                stroke={REFERENCE}
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                activeDot={false}
              />
              <Area
                type="monotone"
                dataKey="realized"
                name="Realizado"
                stroke={REALIZED}
                strokeWidth={1.5}
                fill={`url(#spark-${def.key})`}
                activeDot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

/**
 * Anel de progresso. O traço fino sobre o anel marca onde o realizado deveria
 * estar hoje (a reta ideal) — dá para ver de relance se o arco já passou dele.
 */
function ProgressRing({
  ratio,
  expected,
  size,
  stroke,
  reached,
  children,
}: {
  ratio: number
  expected: number | null
  size: number
  stroke: number
  reached: boolean
  children: React.ReactNode
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const shown = Math.min(Math.max(ratio, 0), 1)
  const center = size / 2
  const markerAngle = expected != null ? expected * 2 * Math.PI - Math.PI / 2 : null

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${formatPercent(ratio)} da meta`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={reached ? chartColor('positive') : REALIZED}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
        {markerAngle != null && expected! > 0 && expected! < 1 && (
          <line
            x1={center + (radius - stroke / 2 - 2) * Math.cos(markerAngle)}
            y1={center + (radius - stroke / 2 - 2) * Math.sin(markerAngle)}
            x2={center + (radius + stroke / 2 + 2) * Math.cos(markerAngle)}
            y2={center + (radius + stroke / 2 + 2) * Math.sin(markerAngle)}
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <title>Onde deveria estar hoje: {formatPercent(expected!)}</title>
          </line>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

const STATUS: Record<
  PaceStatus,
  { label: string; icon: typeof Trophy; tone: 'positive' | 'negative' }
> = {
  reached: { label: 'Meta batida', icon: Trophy, tone: 'positive' },
  on_track: { label: 'No ritmo', icon: TrendingUp, tone: 'positive' },
  behind: { label: 'Abaixo do ritmo', icon: AlertTriangle, tone: 'negative' },
  missed: { label: 'Não atingida', icon: CircleX, tone: 'negative' },
}

/** Status sempre com ícone e texto — a cor nunca carrega o significado sozinha. */
function StatusPill({
  status,
  cumulative,
  compact = false,
}: {
  status: PaceStatus
  cumulative: boolean
  compact?: boolean
}) {
  const config = STATUS[status]
  const label = status === 'behind' && !cumulative ? 'Abaixo da meta' : config.label
  const Icon = config.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-medium',
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        config.tone === 'positive'
          ? 'border-positive/30 bg-positive/10 text-positive'
          : 'border-negative/30 bg-negative/10 text-negative',
      )}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke={item.color}
              strokeWidth="2"
              strokeDasharray={item.dashed ? '4 3' : undefined}
            />
          </svg>
          {item.label}
        </span>
      ))}
    </span>
  )
}

interface TooltipProps<T> {
  active?: boolean
  payload?: { payload: T }[]
  format: (value: number) => string
}

function SeriesTooltip({
  active,
  payload,
  format,
}: TooltipProps<{ date: IsoDate; realized: number | null; ideal: number }>) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{formatDate(point.date)}</p>
      <TooltipRow
        color={REALIZED}
        label="Realizado"
        value={point.realized != null ? format(point.realized) : 'ainda não chegou'}
      />
      <TooltipRow color={REFERENCE} label="Ritmo ideal" value={format(point.ideal)} dashed />
    </div>
  )
}

function HistoryTooltip({
  active,
  payload,
  format,
}: TooltipProps<{ month: IsoDate; realized: number; target: number }>) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const ratio = point.target ? point.realized / point.target : 0
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium first-letter:uppercase">{formatMonthLong(point.month)}</p>
      <TooltipRow color={REALIZED} label="Realizado" value={format(point.realized)} />
      <TooltipRow color={REFERENCE} label="Meta" value={format(point.target)} dashed />
      <p className="mt-1 text-muted-foreground">{formatPercent(ratio)} da meta</p>
    </div>
  )
}

function TooltipRow({
  color,
  label,
  value,
  dashed = false,
}: {
  color: string
  label: string
  value: string
  dashed?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <svg width="12" height="8" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="12"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '3 2' : undefined}
        />
      </svg>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-medium tabular-nums">{value}</span>
    </div>
  )
}
