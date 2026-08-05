import * as React from 'react'
import { toast } from 'sonner'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { data } from '@/data'
import type { CommercialDay } from '@/data/types'
import { formatDate, today } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent, formatMultiple } from '@/lib/money'
import {
  buildFunnel,
  commercialKpis,
  commercialSeries,
  daysInPeriod,
  totalizeCommercial,
} from '@/domain/commercial'
import { leadsInPeriod } from '@/domain/leads'
import { activeSales } from '@/domain/sales'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { DateField } from '@/components/DateField'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { PageHeader } from '@/components/PageHeader'
import { MoneyInput } from '@/components/MoneyInput'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartFrame, ChartTooltip, chartColor } from '@/components/charts/primitives'
import {
  useCommercialDays,
  useCreate,
  useLeads,
  useRemove,
  useSales,
  useUpdate,
} from '@/hooks/data'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function CommercialPage() {
  const { range } = usePeriod()
  const { allow } = useSession()
  const canManage = allow('manage:commercial')

  const { data: days = [] } = useCommercialDays()
  const { data: sales = [] } = useSales()
  const { data: leads = [] } = useLeads()
  const removeDay = useRemove('commercialDays', data.commercialDays)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CommercialDay | null>(null)
  const [deleting, setDeleting] = React.useState<CommercialDay | null>(null)

  const metrics = React.useMemo(() => {
    const period = daysInPeriod(days, range)
    const totals = totalizeCommercial(period)
    const periodSales = sales.filter(
      (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
    )
    const activePeriodSales = activeSales(periodSales)
    const periodLeads = leadsInPeriod(leads, range)

    return {
      period,
      totals,
      leadCount: periodLeads.length,
      // O win rate agora é vendas ÷ leads, então precisa do CRM: sem o
      // `leadCount` ele cairia no total digitado no diário sem necessidade.
      kpis: commercialKpis(totals, periodSales, { leadCount: periodLeads.length }),
      funnel: buildFunnel(totals, {
        leadCount: periodLeads.length,
        salesCount: activePeriodSales.length,
      }),
      series: commercialSeries(period),
    }
  }, [days, sales, leads, range])

  return (
    <>
      <PageHeader
        title="Funil de vendas"
        description="O que a equipe fez por dia e quanto custa cada etapa até fechar um cliente."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus /> Registrar dia
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        {/* Win rate é o primeiro cartão porque é a pergunta da tela. Havia
            também um "Conversão lead → venda" logo aqui: mesma conta, outro
            nome. Dois cartões com o mesmo número e rótulos diferentes fazem
            quem lê procurar a diferença que não existe. */}
        <KpiCard
          label="Win rate"
          value={metrics.kpis.winRate != null ? formatPercent(metrics.kpis.winRate) : '—'}
          secondary={`${formatNumber(metrics.kpis.saleCount)} vendas ÷ ${formatNumber(
            metrics.kpis.leadCount,
          )} leads`}
          hint={
            metrics.kpis.winRateOrigin === 'crm'
              ? 'Vendas registradas no período divididas pelos leads que entraram no CRM. Os dois números são apurados — nenhum é digitado.'
              : metrics.kpis.winRateOrigin === 'diario'
                ? 'Os leads vêm do registro diário abaixo, e as vendas da tela de Vendas. Cadastre os leads em Leads para o número deixar de depender de digitação.'
                : 'Sem leads no período — não há denominador para a conta.'
          }
        />
        <KpiCard
          label="Leads"
          value={formatNumber(metrics.kpis.leadCount)}
          secondary={metrics.kpis.winRateOrigin === 'crm' ? 'do CRM' : 'do registro diário'}
        />
        <KpiCard label="Calls" value={formatNumber(metrics.totals.calls)} />
        <KpiCard label="Reuniões" value={formatNumber(metrics.totals.meetings)} />
        <KpiCard
          label="Show rate"
          value={metrics.kpis.showRate != null ? formatPercent(metrics.kpis.showRate) : '—'}
          hint="Reuniões em que o lead compareceu, sobre o total agendado."
        />
        <KpiCard label="Propostas enviadas" value={formatNumber(metrics.totals.proposalsSent)} />
        <KpiCard label="Contratos assinados" value={formatNumber(metrics.totals.contractsSigned)} />
        <KpiCard
          label="Aprovação de propostas"
          value={
            metrics.kpis.proposalApprovalRate != null
              ? formatPercent(metrics.kpis.proposalApprovalRate)
              : '—'
          }
          hint="Propostas aprovadas sobre o total de propostas decididas (aprovadas + recusadas). Mede a qualidade da proposta, não a do funil inteiro."
        />
        <KpiCard
          label="Investimento comercial"
          value={formatMoney(metrics.totals.totalInvestmentCents)}
          invertVariation
          secondary="anúncios + pessoas + ferramentas"
        />
        <KpiCard
          label="CPL"
          value={metrics.kpis.cplCents != null ? formatMoney(metrics.kpis.cplCents) : '—'}
          invertVariation
          hint="Investimento total do período dividido pelos leads. Inclui o custo de SDR e closer, não só a verba de anúncios."
        />
        <KpiCard
          label="Custo por reunião"
          value={
            metrics.kpis.costPerMeetingCents != null
              ? formatMoney(metrics.kpis.costPerMeetingCents)
              : '—'
          }
          invertVariation
        />
        <KpiCard
          label="CAC"
          value={metrics.kpis.cacCents != null ? formatMoney(metrics.kpis.cacCents) : '—'}
          invertVariation
          hint="Investimento comercial do período dividido pelo número de vendas fechadas."
        />
        <KpiCard
          label="ROI comercial"
          value={metrics.kpis.roi != null ? formatMultiple(metrics.kpis.roi) : '—'}
          hint="(Receita fechada − investimento) ÷ investimento."
        />
      </KpiGrid>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-medium">Funil</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Conversão entre etapas e quanto custa cada unidade
          </p>

          <ul className="space-y-3">
            {metrics.funnel.map((stage) => (
              <li key={stage.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-baseline gap-2">
                    <span className={stage.measured ? 'font-medium' : undefined}>
                      {stage.label}
                    </span>
                    {/* Etapa apurada pelo sistema aparece marcada: um número
                        que veio de uma venda registrada merece confiança
                        diferente de um que alguém somou de cabeça. */}
                    {stage.measured && (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        apurado
                      </span>
                    )}
                    {stage.conversionFromPrevious != null && (
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(stage.conversionFromPrevious)} da etapa anterior
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatNumber(stage.count)}
                    {stage.costPerUnitCents != null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatMoney(stage.costPerUnitCents)}/un
                      </span>
                    )}
                  </span>
                </div>
                <Progress value={(stage.conversionFromTop ?? 0) * 100} />
              </li>
            ))}
          </ul>
        </Card>

        <ChartFrame
          title="Evolução do esforço"
          description="Leads, reuniões e contratos por dia"
          height={300}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColor('border')} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => value.slice(8, 10) + '/' + value.slice(5, 7)}
                tick={{ fontSize: 11, fill: chartColor('muted') }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartColor('muted') }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <RechartsTooltip
                content={<ChartTooltip formatter={(value) => formatNumber(value)} />}
                labelFormatter={(value: string) => formatDate(value)}
              />
              <Line
                type="monotone"
                dataKey="leads"
                name="Leads"
                stroke={chartColor('foreground')}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="meetings"
                name="Reuniões"
                stroke={chartColor('muted')}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="signed"
                name="Contratos"
                stroke={chartColor('positive')}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-medium">Registros do período</h3>
        </div>
        {metrics.period.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nenhum registro comercial no período selecionado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[104px]">Data</TableHead>
                <TableHead data-numeric>Leads</TableHead>
                <TableHead data-numeric>Calls</TableHead>
                <TableHead data-numeric>Reuniões</TableHead>
                <TableHead data-numeric className="hidden sm:table-cell">
                  No-show
                </TableHead>
                <TableHead data-numeric className="hidden md:table-cell">
                  Propostas
                </TableHead>
                <TableHead data-numeric className="hidden lg:table-cell">
                  Assinados
                </TableHead>
                <TableHead data-numeric className="hidden xl:table-cell">
                  Investimento
                </TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...metrics.period]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 40)
                .map((day) => (
                  <TableRow key={day.id}>
                    <TableCell className="text-muted-foreground">{formatDate(day.date)}</TableCell>
                    <TableCell data-numeric>{day.leads}</TableCell>
                    <TableCell data-numeric>{day.calls}</TableCell>
                    <TableCell data-numeric>{day.meetings}</TableCell>
                    <TableCell data-numeric className="hidden text-muted-foreground sm:table-cell">
                      {day.noShows}
                    </TableCell>
                    <TableCell data-numeric className="hidden md:table-cell">
                      {day.proposalsSent}
                    </TableCell>
                    <TableCell data-numeric className="hidden font-medium lg:table-cell">
                      {day.contractsSigned}
                    </TableCell>
                    <TableCell data-numeric className="hidden text-muted-foreground xl:table-cell">
                      {formatMoney(
                        day.adsInvestmentCents +
                          day.sdrInvestmentCents +
                          day.closerInvestmentCents +
                          day.toolsCents +
                          day.crmCents +
                          day.phoneCents +
                          day.internetCents +
                          day.softwareCents,
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ações do dia ${formatDate(day.date)}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(day)
                                setDialogOpen(true)
                              }}
                            >
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDeleting(day)}>
                              <Trash2 /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CommercialDayDialog open={dialogOpen} onOpenChange={setDialogOpen} day={editing} />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir este registro?"
        description={
          deleting
            ? `Os números de ${formatDate(deleting.date)} saem do funil, do CPL e do CAC do período.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await removeDay.mutateAsync(deleting.id)
            toast.success('Registro excluído.')
            setDeleting(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </>
  )
}

/**
 * Registro diário.
 *
 * O formulário é longo por natureza — são 18 campos. A separação em blocos
 * (funil, depois investimento) é o que mantém o preenchimento tolerável no
 * dia a dia.
 */
function CommercialDayDialog({
  open,
  onOpenChange,
  day = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando presente, corrige o registro em vez de criar outro. */
  day?: CommercialDay | null
}) {
  const { session } = useSession()
  const create = useCreate('commercialDays', data.commercialDays)
  const update = useUpdate('commercialDays', data.commercialDays)
  const isEditing = day != null

  const [date, setDate] = React.useState(today())
  const [counts, setCounts] = React.useState({
    leads: 0,
    calls: 0,
    meetings: 0,
    noShows: 0,
    proposalsSent: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    followUps: 0,
    contractsSent: 0,
    contractsSigned: 0,
  })
  const [investment, setInvestment] = React.useState({
    adsInvestmentCents: 0,
    sdrInvestmentCents: 0,
    closerInvestmentCents: 0,
    toolsCents: 0,
    crmCents: 0,
    phoneCents: 0,
    internetCents: 0,
    softwareCents: 0,
  })

  React.useEffect(() => {
    if (!open) return
    setDate(day?.date ?? today())
    setCounts({
      leads: day?.leads ?? 0,
      calls: day?.calls ?? 0,
      meetings: day?.meetings ?? 0,
      noShows: day?.noShows ?? 0,
      proposalsSent: day?.proposalsSent ?? 0,
      proposalsApproved: day?.proposalsApproved ?? 0,
      proposalsRejected: day?.proposalsRejected ?? 0,
      followUps: day?.followUps ?? 0,
      contractsSent: day?.contractsSent ?? 0,
      contractsSigned: day?.contractsSigned ?? 0,
    })
    setInvestment({
      adsInvestmentCents: day?.adsInvestmentCents ?? 0,
      sdrInvestmentCents: day?.sdrInvestmentCents ?? 0,
      closerInvestmentCents: day?.closerInvestmentCents ?? 0,
      toolsCents: day?.toolsCents ?? 0,
      crmCents: day?.crmCents ?? 0,
      phoneCents: day?.phoneCents ?? 0,
      internetCents: day?.internetCents ?? 0,
      softwareCents: day?.softwareCents ?? 0,
    })
  }, [open, day])

  const COUNT_FIELDS: { key: keyof typeof counts; label: string }[] = [
    { key: 'leads', label: 'Leads' },
    { key: 'calls', label: 'Calls' },
    { key: 'meetings', label: 'Reuniões' },
    { key: 'noShows', label: 'No-shows' },
    { key: 'proposalsSent', label: 'Propostas enviadas' },
    { key: 'proposalsApproved', label: 'Propostas aprovadas' },
    { key: 'proposalsRejected', label: 'Propostas recusadas' },
    { key: 'followUps', label: 'Follow-ups' },
    { key: 'contractsSent', label: 'Contratos enviados' },
    { key: 'contractsSigned', label: 'Contratos assinados' },
  ]

  const MONEY_FIELDS: { key: keyof typeof investment; label: string }[] = [
    { key: 'adsInvestmentCents', label: 'Tráfego' },
    { key: 'sdrInvestmentCents', label: 'SDR' },
    { key: 'closerInvestmentCents', label: 'Closer' },
    { key: 'crmCents', label: 'CRM' },
    { key: 'softwareCents', label: 'Softwares' },
    { key: 'toolsCents', label: 'Outras ferramentas' },
    { key: 'phoneCents', label: 'Telefone' },
    { key: 'internetCents', label: 'Internet' },
  ]

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (counts.noShows > counts.meetings) {
      toast.error('Não pode haver mais no-shows do que reuniões agendadas.')
      return
    }

    try {
      if (day) {
        await update.mutateAsync({
          id: day.id,
          patch: { date, ...counts, ...investment },
        })
        toast.success('Registro atualizado.')
      } else {
        await create.mutateAsync({
          workspaceId: session.workspaceId,
          date,
          ownerId: null,
          ...counts,
          ...investment,
          notes: null,
          createdBy: session.user.id,
        })
        toast.success('Dia registrado.')
      }
      onOpenChange(false)
    } catch {
      // A chave única (workspace + data + responsável) evita duplicar o dia.
      toast.error('Já existe um registro para esta data.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar dia comercial' : 'Registrar dia comercial'}
          </DialogTitle>
          <DialogDescription>
            Estes números alimentam o funil, o CPL, o custo por reunião e o CAC.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="commercial-date">Data</Label>
            <DateField id="commercial-date" value={date} onChange={setDate} className="sm:w-48" />
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium">Funil</p>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {COUNT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type="number"
                    min={0}
                    value={counts[field.key]}
                    onChange={(event) =>
                      setCounts((current) => ({
                        ...current,
                        [field.key]: Math.max(0, Number(event.target.value)),
                      }))
                    }
                    className="text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium">Investimento do dia</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {MONEY_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <MoneyInput
                    id={field.key}
                    value={investment[field.key]}
                    onChange={(cents) =>
                      setInvestment((current) => ({ ...current, [field.key]: cents }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEditing ? 'Salvar alterações' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
