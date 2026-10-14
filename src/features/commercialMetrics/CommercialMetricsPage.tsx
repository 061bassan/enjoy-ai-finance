import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CalendarCheck,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { data } from '@/data'
import {
  LEAD_SOURCE_LABEL,
  MEETING_REGION_LABEL,
  MEETING_STATUS_LABEL,
  SALE_PRODUCT_LABEL,
} from '@/data/enums'
import type { CommercialMeeting, MeetingStatus, Sale } from '@/data/types'
import {
  formatDate,
  formatMonthLabel,
  formatMonthLong,
  monthKey,
  rangeOfMonth,
  today,
  type IsoDate,
} from '@/lib/date'
import { formatMoney, formatMoneyCompact, formatNumber, formatPercent } from '@/lib/money'
import { cn } from '@/lib/cn'
import {
  activeMonths,
  isPaidTraffic,
  commercialMetrics,
  matchMeetingsToSales,
  meetingBreakdown,
  type CommercialMetrics,
  type MeetingBreakdownRow,
} from '@/domain/commercialMetrics'
import { useSession } from '@/app/session'
import { ChartTooltip, chartColor, moneyAxisTick } from '@/components/charts/primitives'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useCommercialMeetings,
  useLeads,
  useMarketingEntries,
  useRemove,
  useSales,
} from '@/hooks/data'
import { MeetingDialog } from './MeetingDialog'
import { LabelEditor } from '@/components/LabelEditor'

const ACCENT = 'hsl(var(--primary))'
const SECONDARY = 'hsl(var(--muted-foreground))'
const TERTIARY = 'hsl(var(--foreground) / 0.4)'

const pct = (value: number | null) => (value == null ? '—' : formatPercent(value))
const money = (value: number | null) => (value == null ? '—' : formatMoney(value))

/** Variação relativa contra o mês anterior; `null` quando não há base. */
function variation(current: number | null, previous: number | null | undefined) {
  if (current == null || previous == null || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

const STATUS_TONE: Record<MeetingStatus, 'positive' | 'negative' | 'outline' | 'muted'> = {
  agendada: 'muted',
  realizada: 'outline',
  no_show: 'negative',
  proposta: 'outline',
  fechada: 'positive',
  perdida: 'muted',
}

/**
 * Métricas comerciais — a planilha "Métricas Comercial" dentro do sistema.
 *
 * Nada aqui é digitado duas vezes. Leads e investimento vêm do Marketing;
 * reuniões, desta tela; vendas e faturamento, de Vendas. A reunião encontra a
 * venda pelo nome (`matchMeetingsToSales`): cadastrou a venda da "Kyoto
 * Residence", a reunião da "Kyoto" vira venda e o win rate muda sozinho.
 */
export function CommercialMetricsPage() {
  const { allow } = useSession()
  const canManage = allow('manage:commercial')

  const { data: meetings = [], isLoading } = useCommercialMeetings()
  const { data: sales = [] } = useSales()
  const { data: entries = [] } = useMarketingEntries()
  const { data: leads = [] } = useLeads()
  const removeMeeting = useRemove('commercialMeetings', data.commercialMeetings)

  const currentMonth = `${today().slice(0, 7)}-01`
  const months = React.useMemo(() => {
    const list = activeMonths({ meetings, sales, marketingEntries: entries })
    return list.includes(currentMonth) ? list : [...list, currentMonth]
  }, [meetings, sales, entries, currentMonth])
  const [month, setMonth] = React.useState(currentMonth)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CommercialMeeting | null>(null)
  const [deleting, setDeleting] = React.useState<CommercialMeeting | null>(null)

  // O casamento roda sobre TODAS as reuniões: uma venda de outubro pode ser
  // fruto de uma call de setembro, e cada venda só pode ser contada uma vez.
  const matches = React.useMemo(() => matchMeetingsToSales(meetings, sales), [meetings, sales])

  const metricsFor = React.useCallback(
    (m: IsoDate) =>
      commercialMetrics({
        range: rangeOfMonth(m),
        meetings,
        sales,
        marketingEntries: entries,
        crmLeads: leads,
        matches,
      }),
    [meetings, sales, entries, leads, matches],
  )

  const series = React.useMemo(
    () => months.map((m) => ({ month: m, ...metricsFor(m) })),
    [months, metricsFor],
  )
  const index = series.findIndex((point) => point.month === month)
  const current = series[index] ?? { month, ...metricsFor(month) }
  const previous = index > 0 ? series[index - 1] : undefined

  const monthMeetings = React.useMemo(
    () =>
      meetings
        .filter((m) => monthKey(m.date) === monthKey(month))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [meetings, month],
  )

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Métricas comerciais"
        description="Leads do Marketing, reuniões e vendas no mesmo lugar. Cadastrou a venda com o nome do lead, o win rate muda sozinho."
        actions={
          canManage && (
            <Button onClick={openNew}>
              <Plus /> Nova reunião
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full sm:w-[220px]" aria-label="Mês">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...months].reverse().map((m) => (
              <SelectItem key={m} value={m}>
                <span className="inline-block first-letter:uppercase">{formatMonthLong(m)}</span>
                {m === currentMonth && ' · atual'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {previous && (
          <span className="text-xs text-muted-foreground">
            Variações comparadas com {formatMonthLong(previous.month)}.
          </span>
        )}
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Painel</TabsTrigger>
          <TabsTrigger value="meetings">Reuniões ({monthMeetings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          {current.closedWithoutSale > 0 && (
            <Card className="flex flex-wrap items-center gap-3 border-negative/30 bg-negative/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-negative" aria-hidden />
              <span className="flex-1">
                {current.closedWithoutSale}{' '}
                {current.closedWithoutSale === 1 ? 'reunião marcada' : 'reuniões marcadas'} como
                fechada sem venda cadastrada. O win rate só conta venda registrada em Vendas.
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/vendas">Ir para Vendas</Link>
              </Button>
            </Card>
          )}

          <MetricTiles current={current} previous={previous} />

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-2">
              <h3 className="mb-1 text-sm font-medium">Funil do mês</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                De quem chamou até quem comprou. O percentual é a passagem de uma etapa para a
                seguinte.
              </p>
              <Funnel metrics={current} />
            </Card>

            <Card className="p-4 lg:col-span-3">
              <h3 className="mb-1 text-sm font-medium">Leads, reuniões e vendas por mês</h3>
              <Legend
                items={[
                  { label: 'Leads', color: TERTIARY },
                  { label: 'Reuniões', color: SECONDARY },
                  { label: 'Vendas', color: ACCENT },
                ]}
              />
              <div className="mt-2 h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={series}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColor('border')}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonthLabel}
                      tick={{ fontSize: 11, fill: SECONDARY }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: SECONDARY }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                      content={<ChartTooltip formatter={(v) => formatNumber(v)} />}
                      labelFormatter={(label) => formatMonthLong(String(label))}
                    />
                    <Bar
                      dataKey="leads"
                      name="Leads"
                      fill={TERTIARY}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="meetings"
                      name="Reuniões"
                      fill={SECONDARY}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="meetingSales"
                      name="Vendas"
                      fill={ACCENT}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TrendCard
              title="Taxas por mês"
              description="Agendamento = reuniões ÷ leads · Win rate = vendas ÷ leads · Conversão = vendas ÷ reuniões realizadas"
              data={series}
              lines={[
                { key: 'schedulingRate', label: 'Agendamento', color: TERTIARY },
                { key: 'leadWinRate', label: 'Win rate', color: ACCENT },
                {
                  key: 'meetingWinRate',
                  label: 'Conversão de reunião',
                  color: SECONDARY,
                  dashed: true,
                },
              ]}
              format={(v) => formatPercent(v)}
              axis={(v) => `${Math.round(v * 100)}%`}
            />
            <TrendCard
              title="Custos por mês"
              description="Investimento em anúncios ÷ leads e ÷ reuniões. O CAC está no cartão acima — na mesma escala ele achataria o CPL."
              data={series}
              lines={[
                { key: 'cplCents', label: 'CPL', color: TERTIARY },
                {
                  key: 'costPerMeetingCents',
                  label: 'Custo por reunião',
                  color: SECONDARY,
                  dashed: true,
                },
              ]}
              format={(v) => formatMoney(v)}
              axis={moneyAxisTick}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-3">
              <h3 className="mb-1 text-sm font-medium">
                Marcações por mês: {MEETING_REGION_LABEL.brasilia} × {MEETING_REGION_LABEL.brasil}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Reuniões marcadas com leads de cada praça, todas as origens. Reunião sem região
                informada não entra.
              </p>
              <Legend
                items={[
                  { label: MEETING_REGION_LABEL.brasilia, color: ACCENT },
                  { label: MEETING_REGION_LABEL.brasil, color: SECONDARY },
                ]}
              />
              <div className="mt-2 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={series}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColor('border')}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonthLabel}
                      tick={{ fontSize: 11, fill: SECONDARY }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: SECONDARY }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                      content={<ChartTooltip formatter={(v) => formatNumber(v)} />}
                      labelFormatter={(label) => formatMonthLong(String(label))}
                    />
                    <Bar
                      dataKey="brasiliaMeetings"
                      name={MEETING_REGION_LABEL.brasilia}
                      fill={ACCENT}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="brasilMeetings"
                      name={MEETING_REGION_LABEL.brasil}
                      fill={SECONDARY}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <BreakdownCard
              className="lg:col-span-2"
              title="Por região no mês"
              rows={meetingBreakdown(monthMeetings, matches, (m) =>
                m.region ? MEETING_REGION_LABEL[m.region] : null,
              )}
              empty="Nenhuma reunião neste mês."
            />
          </div>

          {monthMeetings.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <BreakdownCard
                title="Por origem"
                rows={meetingBreakdown(monthMeetings, matches, (m) =>
                  m.source ? LEAD_SOURCE_LABEL[m.source] : LEAD_SOURCE_LABEL.trafego_pago,
                )}
              />
              {/* Criativo é coisa de anúncio: só as reuniões do tráfego entram aqui. */}
              <BreakdownCard
                title="Por criativo (tráfego)"
                rows={meetingBreakdown(
                  monthMeetings.filter(isPaidTraffic),
                  matches,
                  (m) => m.creative,
                )}
              />
              <BreakdownCard
                title="Por quem fez a call"
                rows={meetingBreakdown(monthMeetings, matches, (m) => m.hostName)}
              />
              <BreakdownCard
                title="Por produto"
                rows={meetingBreakdown(monthMeetings, matches, (m) =>
                  m.product ? SALE_PRODUCT_LABEL[m.product] : m.proposal,
                )}
              />
            </div>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="Nenhuma reunião neste mês"
              description="Cadastre as calls do mês para ver conversão por criativo, por closer e por produto."
              action={
                canManage && (
                  <Button onClick={openNew}>
                    <Plus /> Nova reunião
                  </Button>
                )
              }
            />
          )}
        </TabsContent>

        <TabsContent value="meetings">
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : monthMeetings.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={CalendarCheck}
                  title="Nenhuma reunião neste mês"
                  description="Cada call com lead vira uma linha aqui — como na planilha."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[96px]">Data</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        Status <LabelEditor group="meetingStatus" />
                      </span>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">Região</TableHead>
                    <TableHead className="hidden md:table-cell">Proposta</TableHead>
                    <TableHead className="hidden lg:table-cell">Quem fez</TableHead>
                    <TableHead className="hidden xl:table-cell">Origem</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthMeetings.map((meeting) => (
                    <MeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      sale={matches.get(meeting.id)}
                      canManage={canManage}
                      onEdit={() => {
                        setEditing(meeting)
                        setDialogOpen(true)
                      }}
                      onDelete={() => setDeleting(meeting)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={editing}
        meetings={meetings}
        sales={sales}
        defaultDate={monthKey(month) === monthKey(currentMonth) ? today() : month}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir esta reunião?"
        description="Ela sai das métricas do mês. A venda, se houver, continua em Vendas."
        confirmLabel="Excluir reunião"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await removeMeeting.mutateAsync(deleting.id)
            toast.success('Reunião excluída.')
            setDeleting(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Peças do painel
// ---------------------------------------------------------------------------

function MetricTiles({
  current,
  previous,
}: {
  current: CommercialMetrics
  previous?: CommercialMetrics
}) {
  const leadsHint =
    current.leadsOrigin === 'plataforma'
      ? 'Leads informados em Marketing (plataforma de anúncios).'
      : current.leadsOrigin === 'crm'
        ? 'Sem leads em Marketing neste mês — contando os leads do CRM.'
        : 'Lance os leads do mês em Marketing para as taxas aparecerem.'

  return (
    <KpiGrid>
      <KpiCard
        label="Leads"
        value={formatNumber(current.leads)}
        variation={variation(current.leads, previous?.leads)}
        hint={leadsHint}
        secondary={current.adsCents ? `${formatMoney(current.adsCents)} em anúncios` : undefined}
      />
      <KpiCard
        label="Reuniões"
        value={formatNumber(current.meetings)}
        variation={variation(current.meetings, previous?.meetings)}
        secondary={`${current.paidMeetings} do tráfego · ${current.otherMeetings} de indicação/outras · ${current.noShows} no-show`}
        hint="Todas as origens. As taxas do tráfego (agendamento, custo por reunião, win rate, CAC) usam só as reuniões de tráfego pago."
      />
      <KpiCard
        label="Vendas do funil"
        value={formatNumber(current.meetingSales)}
        variation={variation(current.meetingSales, previous?.meetingSales)}
        secondary={`${formatMoney(current.meetingRevenueCents)} · ${current.sales} no total do mês (${formatMoney(current.revenueCents)})`}
        hint="Vendas que vieram de uma reunião (casadas pelo nome ou vinculadas). O total inclui vendas de fora do funil."
      />
      <KpiCard
        label="Win rate (venda ÷ lead)"
        value={pct(current.leadWinRate)}
        variation={variation(current.leadWinRate, previous?.leadWinRate)}
        hint="Vendas que vieram do tráfego ÷ leads do Marketing. Venda de indicação conta em Vendas do funil, não aqui."
      />
      <KpiCard
        label="Agendamento (reunião ÷ lead)"
        value={pct(current.schedulingRate)}
        variation={variation(current.schedulingRate, previous?.schedulingRate)}
        hint='Reuniões do TRÁFEGO ÷ leads do Marketing — a "win rate reuniões" da planilha. Indicação não entra: não veio desses leads.'
      />
      <KpiCard
        label="Conversão de reunião"
        value={pct(current.meetingWinRate)}
        variation={variation(current.meetingWinRate, previous?.meetingWinRate)}
        secondary={`${current.meetingSales} de ${current.meetingsHeld} realizadas`}
        hint="Reuniões do mês que viraram venda (casadas pelo nome) ÷ reuniões realizadas."
      />
      <KpiCard
        label="No-show"
        value={pct(current.noShowRate)}
        variation={variation(current.noShowRate, previous?.noShowRate)}
        invertVariation
      />
      <KpiCard
        label="CPL"
        value={money(current.cplCents)}
        variation={variation(current.cplCents, previous?.cplCents)}
        invertVariation
      />
      <KpiCard
        label="Custo por reunião"
        value={money(current.costPerMeetingCents)}
        variation={variation(current.costPerMeetingCents, previous?.costPerMeetingCents)}
        invertVariation
        hint='O "CPR" da planilha: investimento em anúncios ÷ reuniões.'
      />
      <KpiCard
        label="CAC"
        value={money(current.cacCents)}
        variation={variation(current.cacCents, previous?.cacCents)}
        invertVariation
      />
      <KpiCard
        label="ROAS"
        value={current.roas != null ? `${formatNumber(Math.round(current.roas * 10) / 10)}x` : '—'}
        variation={variation(current.roas, previous?.roas)}
        hint="Faturamento das vendas do funil ÷ investimento em anúncios."
      />
      <KpiCard
        label="Ticket médio"
        value={money(current.averageTicketCents)}
        variation={variation(current.averageTicketCents, previous?.averageTicketCents)}
        secondary={
          current.averageCycleDays != null
            ? `${current.averageCycleDays} dias da reunião à venda`
            : undefined
        }
      />
    </KpiGrid>
  )
}

/** Funil em barras horizontais: o comprimento é o volume, o texto é a passagem. */
function Funnel({ metrics }: { metrics: CommercialMetrics }) {
  const steps = [
    { label: 'Leads', value: metrics.leads },
    { label: 'Reuniões', value: metrics.meetings },
    { label: 'Realizadas', value: metrics.meetingsHeld },
    { label: 'Vendas', value: metrics.meetingSales },
  ]
  const max = Math.max(1, ...steps.map((step) => step.value))
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1]!.value : null
        const passage = prev ? step.value / prev : null
        return (
          <li key={step.label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span>{step.label}</span>
              <span className="tabular-nums">
                <strong>{formatNumber(step.value)}</strong>
                {passage != null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatPercent(passage)} da etapa anterior
                  </span>
                )}
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted">
              <div
                className="h-3 rounded-full"
                style={{
                  width: `${Math.max(step.value ? 3 : 0, (step.value / max) * 100)}%`,
                  background: i === steps.length - 1 ? ACCENT : SECONDARY,
                  opacity: i === steps.length - 1 ? 1 : 0.35 + i * 0.2,
                }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function TrendCard<T extends { month: IsoDate }>({
  title,
  description,
  data: points,
  lines,
  format,
  axis,
}: {
  title: string
  description: string
  data: T[]
  lines: { key: keyof T & string; label: string; color: string; dashed?: boolean }[]
  format: (value: number) => string
  axis: (value: number) => string
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mb-1 text-xs text-muted-foreground">{description}</p>
      <Legend items={lines} />
      <div className="mt-2 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColor('border')} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthLabel}
              tick={{ fontSize: 11, fill: SECONDARY }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={axis}
              tick={{ fontSize: 11, fill: SECONDARY }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <RechartsTooltip
              cursor={{ stroke: chartColor('border') }}
              content={<ChartTooltip formatter={format} />}
              labelFormatter={(label) => formatMonthLong(String(label))}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="linear"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeDasharray={line.dashed ? '5 4' : undefined}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: line.color }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function BreakdownCard({
  title,
  rows,
  className,
  empty,
}: {
  title: string
  rows: MeetingBreakdownRow[]
  className?: string
  empty?: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.meetings))
  return (
    <Card className={cn('p-4', className)}>
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {rows.length === 0 && empty && <p className="text-sm text-muted-foreground">{empty}</p>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate first-letter:uppercase">{row.label}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {row.meetings} {row.meetings === 1 ? 'reunião' : 'reuniões'} · {row.sales}{' '}
                {row.sales === 1 ? 'venda' : 'vendas'}
                {row.winRate != null && ` · ${formatPercent(row.winRate)}`}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(row.meetings / max) * 100}%`,
                  background: SECONDARY,
                  opacity: 0.45,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(row.sales / max) * 100}%`, background: ACCENT }}
              />
            </div>
            {row.revenueCents > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatMoneyCompact(row.revenueCents)} em vendas
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function MeetingRow({
  meeting,
  sale,
  canManage,
  onEdit,
  onDelete,
}: {
  meeting: CommercialMeeting
  sale?: Sale
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className={sale ? 'bg-positive/10 hover:bg-positive/15' : undefined}>
      <TableCell className="text-muted-foreground">{formatDate(meeting.date)}</TableCell>
      <TableCell className="max-w-[160px] truncate font-medium">{meeting.name}</TableCell>
      <TableCell>
        <Badge variant={STATUS_TONE[meeting.status]}>{MEETING_STATUS_LABEL[meeting.status]}</Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {meeting.region ? MEETING_REGION_LABEL[meeting.region] : '—'}
      </TableCell>
      <TableCell className="hidden max-w-[200px] truncate text-muted-foreground md:table-cell">
        {meeting.product ? SALE_PRODUCT_LABEL[meeting.product] : null}
        {meeting.product && meeting.proposal ? ' · ' : null}
        {meeting.proposal}
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">
        {meeting.hostName || '—'}
      </TableCell>
      <TableCell className="hidden max-w-[180px] truncate text-muted-foreground xl:table-cell">
        {meeting.source ? LEAD_SOURCE_LABEL[meeting.source] : LEAD_SOURCE_LABEL.trafego_pago}
        {meeting.creative ? ` · ${meeting.creative}` : null}
      </TableCell>
      <TableCell>
        {sale ? (
          <span
            className="inline-flex items-center gap-1 text-sm"
            title={meeting.saleId ? 'Vinculada à mão' : 'Encontrada pelo nome'}
          >
            {meeting.saleId && <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
            <span className="max-w-[140px] truncate">{sale.clientName}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatMoneyCompact(sale.amountCents)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações da reunião com ${meeting.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  )
}

/** Legenda com o mesmo traço da série (tracejado quando a linha é tracejada). */
function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke={item.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={item.dashed ? '4 3' : undefined}
            />
          </svg>
          {item.label}
        </span>
      ))}
    </span>
  )
}
