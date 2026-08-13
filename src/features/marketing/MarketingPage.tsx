import * as React from 'react'
import { toast } from 'sonner'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { data } from '@/data'
import type { MarketingEntry } from '@/data/types'
import { MARKETING_CHANNEL_LABEL } from '@/data/enums'
import { formatMonthLabel, formatMonthLong } from '@/lib/date'
import { formatMoney, formatMultiple, formatNumber, formatPercent } from '@/lib/money'
import {
  entriesInPeriod,
  entryTotal,
  marketingKpis,
  marketingSeries,
  performanceByChannel,
  reconcileMarketingWithCash,
  totalizeMarketing,
} from '@/domain/marketing'
import { leadsInPeriod } from '@/domain/leads'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { useCustomization } from '@/customization/context'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartFrame, ChartTooltip, chartColor, moneyAxisTick } from '@/components/charts/primitives'
import { useLeads, useMarketingEntries, useRemove, useSales, useTransactions } from '@/hooks/data'
import { MarketingEntryDialog } from './MarketingEntryDialog'

/**
 * Marketing.
 *
 * Existe para responder uma pergunta que o sistema sabia calcular mas não
 * sabia receber: **quanto custa trazer um cliente**. A verba de anúncio só
 * tinha dois lugares — dentro de cada venda (rateio manual, sempre errado) ou
 * quebrada por dia no diário comercial (formato que a plataforma não entrega).
 * Aqui ela entra como o fato que é: um valor por mês, por canal.
 *
 * O que esta tela NÃO faz, de propósito: criar despesa no caixa. Quem já lança
 * a fatura do Meta em Entradas e saídas teria o custo contado duas vezes no
 * lucro da empresa. Em vez disso, o painel de conciliação mostra os dois lados
 * e deixa a diferença à vista.
 */
export function MarketingPage() {
  const { range } = usePeriod()
  const { allow } = useSession()
  const { isVisible } = useCustomization()

  const canManage = allow('manage:marketing')
  const canSeeCash = allow('view:financials')

  const { data: entries = [] } = useMarketingEntries()
  const { data: sales = [] } = useSales()
  const { data: leads = [] } = useLeads()
  const { data: transactions = [] } = useTransactions()
  const removeEntry = useRemove('marketingEntries', data.marketingEntries)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<MarketingEntry | null>(null)
  const [deleting, setDeleting] = React.useState<MarketingEntry | null>(null)

  const metrics = React.useMemo(() => {
    const period = entriesInPeriod(entries, range)
    const totals = totalizeMarketing(period)
    const periodSales = sales.filter(
      (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
    )

    return {
      period,
      totals,
      kpis: marketingKpis(totals, periodSales, {
        crmLeadCount: leadsInPeriod(leads, range).length,
      }),
      channels: performanceByChannel(period),
      series: marketingSeries(period),
      reconciliation: reconcileMarketingWithCash(entries, transactions, range),
    }
  }, [entries, sales, leads, transactions, range])

  const kpi = (id: string, node: React.ReactElement) =>
    isVisible('marketing', 'kpis', id) ? React.cloneElement(node, { key: id }) : null

  return (
    <>
      <PageHeader
        title="Marketing"
        description="Quanto foi investido para trazer gente, e quanto custou cada lead e cada cliente."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus /> Registrar investimento
            </Button>
          )
        }
      />

      {metrics.period.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhum investimento lançado neste período"
          description="Registre a verba do mês por canal — o custo por lead, o CAC e o ROAS saem sozinhos, e o custo por etapa do funil passa a considerar o marketing."
          action={
            canManage && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus /> Registrar investimento
              </Button>
            )
          }
        />
      ) : (
        <>
          <KpiGrid className="mb-4">
            {kpi(
              'investment',
              <KpiCard
                label="Investimento"
                value={formatMoney(metrics.kpis.investmentCents)}
                invertVariation
                secondary={`${formatMoney(metrics.kpis.mediaInvestmentCents)} em mídia`}
                hint="Verba de anúncios + agência + criativos + ferramentas + outros, dos meses tocados pelo período."
              />,
            )}
            {kpi(
              'cpl',
              <KpiCard
                label="Custo por lead"
                value={
                  metrics.kpis.cplCents != null ? formatMoney(metrics.kpis.cplCents) : '—'
                }
                invertVariation
                secondary={`${formatNumber(metrics.kpis.leadCount)} leads ${
                  metrics.kpis.cplOrigin === 'plataforma'
                    ? 'das plataformas'
                    : metrics.kpis.cplOrigin === 'crm'
                      ? 'do CRM'
                      : ''
                }`}
                hint={
                  metrics.kpis.cplOrigin === 'plataforma'
                    ? 'Investimento total dividido pelos leads informados no lançamento. Inclui agência e criativos — um CPL só de mídia mente para menos.'
                    : metrics.kpis.cplOrigin === 'crm'
                      ? 'Nenhum lead foi informado nos lançamentos, então o denominador vem dos leads cadastrados no CRM no período.'
                      : 'Sem leads informados e sem leads no CRM — não há denominador para a conta.'
                }
              />,
            )}
            {kpi(
              'cac',
              <KpiCard
                label="CAC de marketing"
                value={
                  metrics.kpis.cacCents != null ? formatMoney(metrics.kpis.cacCents) : '—'
                }
                invertVariation
                secondary={`${formatNumber(metrics.kpis.salesCount)} vendas no período`}
                hint="Investimento de marketing dividido pelas vendas fechadas. O CAC completo, com SDR e closer, está no Funil de vendas."
              />,
            )}
            {kpi(
              'roas',
              <KpiCard
                label="ROAS"
                value={metrics.kpis.roas != null ? formatMultiple(metrics.kpis.roas) : '—'}
                hint="Receita fechada dividida pela verba de mídia. Agência e criativos ficam de fora: não escalam com a campanha do mesmo jeito."
              />,
            )}
            {kpi(
              'profit',
              <KpiCard
                label="Sobra depois do marketing"
                value={formatMoney(metrics.kpis.profitCents)}
                secondary={`${formatMoney(metrics.kpis.revenueCents)} de receita`}
                hint="Receita fechada menos o investimento de marketing. Não é o lucro da empresa — entrega, equipe e impostos não entram aqui."
              />,
            )}
            {kpi(
              'roi',
              <KpiCard
                label="ROI"
                value={metrics.kpis.roi != null ? formatMultiple(metrics.kpis.roi) : '—'}
                hint="(Receita − investimento total) ÷ investimento total."
              />,
            )}
            {kpi(
              'share',
              <KpiCard
                label="% da receita"
                value={
                  metrics.kpis.investmentShare != null
                    ? formatPercent(metrics.kpis.investmentShare)
                    : '—'
                }
                invertVariation
                hint="Quanto de cada real vendido foi para marketing."
              />,
            )}
            {kpi(
              'leads',
              <KpiCard
                label="Leads gerados"
                value={formatNumber(metrics.totals.leads)}
                secondary="informados nos lançamentos"
              />,
            )}
            {kpi(
              'cpm',
              <KpiCard
                label="CPM"
                value={metrics.kpis.cpmCents != null ? formatMoney(metrics.kpis.cpmCents) : '—'}
                invertVariation
                hint="Custo por mil impressões, sobre a verba de mídia."
              />,
            )}
            {kpi(
              'cpc',
              <KpiCard
                label="CPC"
                value={metrics.kpis.cpcCents != null ? formatMoney(metrics.kpis.cpcCents) : '—'}
                invertVariation
              />,
            )}
            {kpi(
              'ctr',
              <KpiCard
                label="CTR"
                value={metrics.kpis.ctr != null ? formatPercent(metrics.kpis.ctr) : '—'}
                hint="Cliques sobre impressões."
              />,
            )}
            {kpi(
              'clickToLead',
              <KpiCard
                label="Clique → lead"
                value={
                  metrics.kpis.clickToLead != null
                    ? formatPercent(metrics.kpis.clickToLead)
                    : '—'
                }
                hint="Cliques que viraram lead. Quando cai, o problema costuma estar na página, não no anúncio."
              />,
            )}
          </KpiGrid>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            {isVisible('marketing', 'panels', 'channels') && (
              <Card className="p-4">
                <h3 className="mb-1 text-sm font-medium">Por canal</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Quanto cada canal levou e quanto custou o lead dele
                </p>

                <ul className="space-y-3">
                  {metrics.channels.map((channel) => (
                    <li key={channel.channel}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex items-baseline gap-2">
                          <span className="font-medium">
                            {MARKETING_CHANNEL_LABEL[channel.channel]}
                          </span>
                          {channel.leads > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {formatNumber(channel.leads)} leads
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(channel.investmentCents)}
                          {channel.cplCents != null && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {formatMoney(channel.cplCents)}/lead
                            </span>
                          )}
                        </span>
                      </div>
                      <Progress value={(channel.share ?? 0) * 100} />
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-muted-foreground">
                  Não há ROAS por canal: a venda guarda a origem do lead, não a campanha.
                  Ratear a receita entre canais daria um número apresentável e falso.
                </p>
              </Card>
            )}

            {isVisible('marketing', 'panels', 'evolution') && (
              <ChartFrame
                title="Evolução"
                description="Investimento por mês e o custo por lead correspondente"
                height={300}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={metrics.series}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColor('border')}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(value: string) => formatMonthLabel(value)}
                      tick={{ fontSize: 11, fill: chartColor('muted') }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={16}
                    />
                    <YAxis
                      yAxisId="investment"
                      tickFormatter={moneyAxisTick}
                      tick={{ fontSize: 11, fill: chartColor('muted') }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <YAxis
                      yAxisId="cpl"
                      orientation="right"
                      tickFormatter={moneyAxisTick}
                      tick={{ fontSize: 11, fill: chartColor('muted') }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <RechartsTooltip
                      content={<ChartTooltip />}
                      labelFormatter={(value: string) => formatMonthLong(value)}
                    />
                    <Bar
                      yAxisId="investment"
                      dataKey="investmentCents"
                      name="Investimento"
                      fill={chartColor('muted')}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="cpl"
                      type="monotone"
                      dataKey="cplCents"
                      name="Custo por lead"
                      stroke={chartColor('foreground')}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </div>

          {canSeeCash && isVisible('marketing', 'panels', 'reconciliation') && (
            <Card className="mb-4 p-4">
              <h3 className="mb-1 text-sm font-medium">Conferência com o caixa</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                O que foi informado aqui contra o que já saiu do caixa como despesa de
                Marketing, entre {formatMonthLong(metrics.reconciliation.range.from)} e{' '}
                {formatMonthLong(metrics.reconciliation.range.to)}
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Informado em Marketing</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {formatMoney(metrics.reconciliation.declaredCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lançado no caixa</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {formatMoney(metrics.reconciliation.cashCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Diferença</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {formatMoney(metrics.reconciliation.differenceCents)}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                {metrics.reconciliation.differenceCents > 0
                  ? 'Há investimento informado que ainda não apareceu no caixa. Lance a despesa em Entradas e saídas com o centro de custo Marketing para o lucro da empresa ficar certo.'
                  : metrics.reconciliation.differenceCents < 0
                    ? 'O caixa registra mais despesa de marketing do que foi informado aqui. Pode ser custo de outro tipo no mesmo centro de custo — ou lançamento faltando nesta tela.'
                    : 'As duas pontas batem.'}{' '}
                Registrar aqui não cria despesa: se criasse, quem já lança a fatura da
                plataforma teria o mesmo custo contado duas vezes no lucro.
              </p>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="text-sm font-medium">Lançamentos do período</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Mês</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead data-numeric>Investimento</TableHead>
                  <TableHead data-numeric className="hidden sm:table-cell">
                    Mídia
                  </TableHead>
                  <TableHead data-numeric className="hidden md:table-cell">
                    Leads
                  </TableHead>
                  <TableHead data-numeric className="hidden lg:table-cell">
                    CPL
                  </TableHead>
                  <TableHead data-numeric className="hidden xl:table-cell">
                    Cliques
                  </TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...metrics.period]
                  .sort(
                    (a, b) =>
                      b.month.localeCompare(a.month) || entryTotal(b) - entryTotal(a),
                  )
                  .map((entry) => {
                    const total = entryTotal(entry)
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground">
                          {formatMonthLong(entry.month)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {MARKETING_CHANNEL_LABEL[entry.channel]}
                        </TableCell>
                        <TableCell data-numeric>{formatMoney(total)}</TableCell>
                        <TableCell
                          data-numeric
                          className="hidden text-muted-foreground sm:table-cell"
                        >
                          {formatMoney(entry.adsCents)}
                        </TableCell>
                        <TableCell data-numeric className="hidden md:table-cell">
                          {entry.leads || '—'}
                        </TableCell>
                        <TableCell data-numeric className="hidden lg:table-cell">
                          {entry.leads ? formatMoney(Math.round(total / entry.leads)) : '—'}
                        </TableCell>
                        <TableCell
                          data-numeric
                          className="hidden text-muted-foreground xl:table-cell"
                        >
                          {entry.clicks ? formatNumber(entry.clicks) : '—'}
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Ações de ${MARKETING_CHANNEL_LABEL[entry.channel]} em ${formatMonthLong(entry.month)}`}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setEditing(entry)
                                    setDialogOpen(true)
                                  }}
                                >
                                  <Pencil /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setDeleting(entry)}>
                                  <Trash2 /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <MarketingEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        existing={entries}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir este lançamento?"
        description={
          deleting
            ? `${MARKETING_CHANNEL_LABEL[deleting.channel]} de ${formatMonthLong(deleting.month)} sai do CPL, do CAC, do ROAS e do custo por etapa do funil.`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await removeEntry.mutateAsync(deleting.id)
            toast.success('Lançamento excluído.')
            setDeleting(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </>
  )
}
