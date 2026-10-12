import * as React from 'react'
import { toast } from 'sonner'
import { Handshake, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/date'
import { formatMoney, formatMultiple, formatNumber, formatPercent } from '@/lib/money'
import {
  LEAD_SOURCE_LABEL,
  SALE_MODEL_LABEL,
  SALE_PRODUCT_LABEL,
  SALE_STATUS_LABEL,
} from '@/data/enums'
import type { Profile, Sale, SaleStatus } from '@/data/types'
import { cn } from '@/lib/cn'
import {
  closerCommission,
  saleEconomics,
  sdrCommission,
  summarizeSales,
  type SaleEconomics,
} from '@/domain/sales'
import { useCustomization } from '@/customization/context'
import { variation } from '@/domain/finance'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { useMarketingInvestment } from '@/hooks/marketing'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { ShowMore, useVisibleCount } from '@/components/ShowMore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
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
import {
  useClients,
  useDeleteSale,
  useProfileMap,
  useProfiles,
  useSaleCosts,
  useSales,
} from '@/hooks/data'
import { canManageSale } from '@/data/rules/permissions'
import { SaleDialog } from './SaleDialog'

const ALL = '__all__'

interface SaleColumn {
  id: string
  label: string
  numeric?: boolean
  headClassName?: string
  cellClassName?: string
  render: (sale: Sale, eco: SaleEconomics) => React.ReactNode
}

/**
 * Colunas da tabela.
 *
 * Declaradas em dados, e não em JSX solto, porque a personalização precisa
 * ligar e desligar cada uma pelo `id`. Os ids são os mesmos de
 * `src/customization/registry.ts` — se um sair de sincronia, a coluna deixa
 * de ser controlável (e o teste de contrato entre os dois quebra).
 */
function buildColumns(profileMap: Map<string, Profile>): SaleColumn[] {
  return [
    {
      id: 'date',
      label: 'Data',
      headClassName: 'w-[100px]',
      cellClassName: 'text-muted-foreground',
      render: (sale) => formatDate(sale.saleDate),
    },
    {
      id: 'client',
      label: 'Cliente',
      render: (sale) => (
        <>
          <span className="block max-w-[200px] truncate font-medium">{sale.clientName}</span>
          {sale.company && (
            <span className="block max-w-[200px] truncate text-xs text-muted-foreground">
              {sale.company}
            </span>
          )}
        </>
      ),
    },
    {
      id: 'closer',
      label: 'Closer',
      headClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden text-muted-foreground lg:table-cell',
      render: (sale) => (sale.closerId ? (profileMap.get(sale.closerId)?.name ?? '—') : '—'),
    },
    {
      id: 'sdr',
      label: 'SDR',
      headClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden text-muted-foreground lg:table-cell',
      render: (sale) => (sale.sdrId ? (profileMap.get(sale.sdrId)?.name ?? '—') : '—'),
    },
    {
      id: 'source',
      label: 'Origem',
      headClassName: 'hidden xl:table-cell',
      cellClassName: 'hidden xl:table-cell',
      render: (sale) =>
        sale.leadSource ? (
          <Badge variant="outline">{LEAD_SOURCE_LABEL[sale.leadSource]}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'model',
      label: 'Produto',
      headClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      // Mesmo id de coluna de antes (a personalização guarda quais colunas aparecem).
      render: (sale) => (
        <span className="flex flex-wrap gap-1">
          {sale.product && <Badge variant="outline">{SALE_PRODUCT_LABEL[sale.product]}</Badge>}
          <Badge variant="muted">{SALE_MODEL_LABEL[sale.model]}</Badge>
        </span>
      ),
    },
    {
      id: 'amount',
      label: 'Valor',
      numeric: true,
      cellClassName: 'font-medium',
      render: (sale) => formatMoney(sale.amountCents),
    },
    {
      id: 'mrr',
      label: 'MRR',
      numeric: true,
      headClassName: 'hidden md:table-cell',
      cellClassName: 'hidden text-muted-foreground md:table-cell',
      render: (sale) => (sale.mrrCents > 0 ? formatMoney(sale.mrrCents) : '—'),
    },
    {
      id: 'installments',
      label: 'Parcelas',
      numeric: true,
      headClassName: 'hidden xl:table-cell',
      cellClassName: 'hidden text-muted-foreground xl:table-cell',
      render: (sale) => (sale.installments > 1 ? `${sale.installments}×` : 'À vista'),
    },
    {
      id: 'commission',
      label: 'Comissão',
      numeric: true,
      headClassName: 'hidden xl:table-cell',
      cellClassName: 'hidden text-muted-foreground xl:table-cell',
      render: (sale) => formatMoney(closerCommission(sale) + sdrCommission(sale)),
    },
    {
      id: 'margin',
      label: 'Margem',
      numeric: true,
      headClassName: 'hidden xl:table-cell',
      cellClassName: 'hidden xl:table-cell',
      render: (_sale, eco) => (
        <span
          className={
            eco.margin == null
              ? 'text-muted-foreground'
              : eco.margin >= 0.3
                ? 'text-positive'
                : eco.margin < 0
                  ? 'text-negative'
                  : ''
          }
        >
          {eco.margin != null ? formatPercent(eco.margin) : '—'}
        </span>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      render: (sale) => <SaleStatusBadge status={sale.status} />,
    },
  ]
}

export function SalesPage() {
  const { range, comparisonRange } = usePeriod()
  const { session, role, allow } = useSession()
  // O CAC por venda (abaixo) só conhece o que foi lançado em cada venda. O
  // investimento lançado na tela de Marketing entra aqui pelo mesmo motivo
  // que entra no Funil de vendas e nos Relatórios: sem ele, o CAC mostrado
  // aqui diria que adquirir cliente é mais barato do que de fato é.
  const marketingCents = useMarketingInvestment(range)

  const canSeeAll = allow('manage:sales:all') || allow('view:sales:all')
  const canCreate = allow('manage:sales:all') || allow('manage:sales:own')

  const { data: sales = [], isLoading } = useSales()
  const { data: costs = [] } = useSaleCosts()
  const { data: clients = [] } = useClients()
  const { data: profiles = [] } = useProfiles()
  const profileMap = useProfileMap()
  const deleteSale = useDeleteSale()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<SaleStatus | typeof ALL>(ALL)
  const [closerFilter, setCloserFilter] = React.useState<string>(ALL)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Sale | null>(null)
  const [deleting, setDeleting] = React.useState<Sale | null>(null)

  const { isVisible } = useCustomization()

  const columns = React.useMemo(
    () => buildColumns(profileMap).filter((column) => isVisible('sales', 'columns', column.id)),
    [profileMap, isVisible],
  )

  /** Envolve um cartão no controle de visibilidade, preservando a chave. */
  const kpi = (id: string, node: React.ReactElement) =>
    isVisible('sales', 'kpis', id) ? React.cloneElement(node, { key: id }) : null

  const costsBySale = React.useMemo(
    () => new Map(costs.map((cost) => [cost.saleId, cost])),
    [costs],
  )

  /**
   * O papel `sales` enxerga apenas as próprias vendas. O filtro mora aqui, e
   * não na tela, porque é regra de acesso — a mesma que o RLS aplicará no
   * Postgres na Fase 9.
   */
  const visible = React.useMemo(() => {
    if (canSeeAll) return sales
    const me = session?.user.id
    return sales.filter(
      (sale) => sale.closerId === me || sale.sdrId === me || sale.createdBy === me,
    )
  }, [sales, canSeeAll, session?.user.id])

  const inPeriod = React.useMemo(
    () => visible.filter((sale) => sale.saleDate >= range.from && sale.saleDate <= range.to),
    [visible, range],
  )

  /**
   * Um filtro escondido não pode continuar filtrando.
   *
   * Se o sócio esconde o filtro de status enquanto ele está em "cancelado", a
   * tabela ficaria mostrando um recorte sem nenhum controle na tela que
   * explicasse por quê — e a pessoa concluiria que não há vendas. Some o
   * controle, some o recorte.
   */
  const effectiveStatus = isVisible('sales', 'filters', 'status') ? statusFilter : ALL
  const effectiveCloser = isVisible('sales', 'filters', 'closer') ? closerFilter : ALL
  const effectiveSearch = isVisible('sales', 'filters', 'search') ? search : ''

  const filtered = React.useMemo(() => {
    const term = effectiveSearch.trim().toLowerCase()
    return inPeriod
      .filter((sale) => (effectiveStatus === ALL ? true : sale.status === effectiveStatus))
      .filter((sale) => (effectiveCloser === ALL ? true : sale.closerId === effectiveCloser))
      .filter((sale) =>
        term
          ? sale.clientName.toLowerCase().includes(term) ||
            (sale.company ?? '').toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
  }, [inPeriod, effectiveStatus, effectiveCloser, effectiveSearch])

  /**
   * Quem pode mexer nesta venda.
   *
   * Mesma regra da leitura: closer e SDR mexem no que é deles. A checagem é
   * por linha, e não por tela, porque `manage:sales:own` só faz sentido diante
   * de um registro concreto — sem isso, um closer veria o botão em vendas de
   * colegas e descobriria a restrição só na mensagem de erro.
   */
  function canEditSale(sale: Sale) {
    const me = session?.user.id
    const mine = sale.closerId === me || sale.sdrId === me || sale.createdBy === me
    return canManageSale(role, mine)
  }

  const showActions = filtered.some((sale) => canEditSale(sale))

  // Os KPIs acima somam o período inteiro; o corte é só de exibição.
  const pagination = useVisibleCount(filtered.length)

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(sale: Sale) {
    setEditing(sale)
    setDialogOpen(true)
  }

  async function confirmDelete() {
    if (!deleting || !session) return
    try {
      await deleteSale.mutateAsync({ saleId: deleting.id, actorId: session.user.id })
      toast.success('Venda excluída.')
      setDeleting(null)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir a venda.')
    }
  }

  const showFilters =
    isVisible('sales', 'filters', 'search') ||
    isVisible('sales', 'filters', 'status') ||
    (canSeeAll && isVisible('sales', 'filters', 'closer'))

  const summary = React.useMemo(() => summarizeSales(inPeriod), [inPeriod])
  const previousSummary = React.useMemo(
    () =>
      summarizeSales(
        visible.filter(
          (sale) => sale.saleDate >= comparisonRange.from && sale.saleDate <= comparisonRange.to,
        ),
      ),
    [visible, comparisonRange],
  )

  // Economia agregada do período — a soma das vendas individuais.
  const economics = React.useMemo(() => {
    const rows = inPeriod.map((sale) => saleEconomics(sale, costsBySale.get(sale.id)))
    const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0)
    const totalAcquisition = rows.reduce((sum, row) => sum + row.cacCents, 0)
    const netProfit = rows.reduce((sum, row) => sum + row.netProfitCents, 0)
    // Soma, nunca substitui — mesma regra do Funil de vendas: o que foi
    // lançado em cada venda (anúncio atribuído, comissão, deslocamento) e o
    // que foi lançado em Marketing (verba mensal por canal) medem custos
    // diferentes e cobrem o mesmo CAC por ângulos distintos.
    const totalAcquisitionWithMarketing = totalAcquisition + marketingCents
    return {
      rows,
      totalCost,
      netProfit,
      margin: summary.totalCents ? netProfit / summary.totalCents : null,
      averageCac: rows.length ? Math.round(totalAcquisitionWithMarketing / rows.length) : 0,
      saleAcquisitionCents: totalAcquisition,
      roi: totalCost ? netProfit / totalCost : null,
    }
  }, [inPeriod, costsBySale, summary.totalCents, marketingCents])

  return (
    <>
      <PageHeader
        title="Vendas"
        description={
          canSeeAll
            ? 'Contratos fechados no período, com economia unitária de cada venda.'
            : 'Suas vendas no período.'
        }
        actions={
          canCreate && (
            <Button onClick={openNew}>
              <Plus /> Nova venda
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        {/* Cada cartão declara o próprio id para que a personalização possa
            escondê-lo. Esconder muda só o que aparece: o cálculo acima roda
            igual, então nenhum outro número muda de valor por causa disso. */}
        {kpi(
          'count',
          <KpiCard
            label="Vendas"
            value={formatNumber(summary.count)}
            variation={variation(summary.count, previousSummary.count)}
          />,
        )}
        {kpi(
          'total',
          <KpiCard
            label="Valor vendido"
            value={formatMoney(summary.totalCents)}
            variation={variation(summary.totalCents, previousSummary.totalCents)}
          />,
        )}
        {kpi(
          'ticket',
          <KpiCard
            label="Ticket médio"
            value={formatMoney(summary.averageTicketCents)}
            variation={variation(summary.averageTicketCents, previousSummary.averageTicketCents)}
          />,
        )}
        {kpi('mrr', <KpiCard label="MRR vendido" value={formatMoney(summary.mrrCents)} />)}
        {kpi(
          'setup',
          <KpiCard label="Implantação" value={formatMoney(summary.setupRevenueCents)} />,
        )}
        {kpi('largest', <KpiCard label="Maior venda" value={formatMoney(summary.largestCents)} />)}
        {kpi(
          'smallest',
          <KpiCard label="Menor venda" value={formatMoney(summary.smallestCents)} />,
        )}
        {kpi(
          'profit',
          <KpiCard
            label="Lucro das vendas"
            value={formatMoney(economics.netProfit)}
            secondary={economics.margin != null ? formatPercent(economics.margin) : undefined}
          />,
        )}
        {kpi(
          'cac',
          <KpiCard
            label="CAC médio"
            value={formatMoney(economics.averageCac)}
            invertVariation
            secondary={
              marketingCents > 0
                ? `${formatMoney(economics.saleAcquisitionCents)} nas vendas + ${formatMoney(marketingCents)} em Marketing`
                : undefined
            }
            hint="Anúncios + comissões + deslocamento lançados em cada venda, somados ao que a tela de Marketing registrou nos meses do período — tudo dividido pelo número de vendas."
          />,
        )}
        {kpi(
          'roi',
          <KpiCard
            label="ROI"
            value={economics.roi != null ? formatMultiple(economics.roi) : '—'}
            hint="Lucro líquido das vendas dividido pelo custo total atribuído a elas."
          />,
        )}
        {kpi(
          'daysToClose',
          <KpiCard
            label="Tempo de fechamento"
            value={summary.averageDaysToClose != null ? `${summary.averageDaysToClose} dias` : '—'}
            invertVariation
          />,
        )}
      </KpiGrid>

      {showFilters && (
        <Card className="mb-4 p-3">
          <div className="flex flex-wrap gap-2">
            {isVisible('sales', 'filters', 'search') && (
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por cliente ou empresa"
                  className="pl-9"
                />
              </div>
            )}

            {isVisible('sales', 'filters', 'status') && (
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as never)}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os status</SelectItem>
                  {(Object.keys(SALE_STATUS_LABEL) as SaleStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {SALE_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {canSeeAll && isVisible('sales', 'filters', 'closer') && (
              <Select value={closerFilter} onValueChange={setCloserFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os closers</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Handshake}
              title="Nenhuma venda no período"
              description="Ajuste o período no topo da tela ou registre uma nova venda."
              action={
                canCreate && (
                  <Button onClick={openNew}>
                    <Plus /> Nova venda
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    data-numeric={column.numeric || undefined}
                    className={cn(column.headClassName)}
                  >
                    {column.label}
                  </TableHead>
                ))}
                {/* A coluna de ações fica fora do catálogo de personalização:
                    esconder o caminho de correção deixaria uma venda errada
                    sem conserto, e "limpar a tela" não pode custar isso. */}
                {showActions && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, pagination.count).map((sale) => {
                const eco = saleEconomics(sale, costsBySale.get(sale.id))
                return (
                  <TableRow key={sale.id}>
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        data-numeric={column.numeric || undefined}
                        className={cn(column.cellClassName)}
                      >
                        {column.render(sale, eco)}
                      </TableCell>
                    ))}
                    {showActions && (
                      <TableCell>
                        {canEditSale(sale) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Ações da venda de ${sale.clientName}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEdit(sale)}>
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setDeleting(sale)}>
                                <Trash2 /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ShowMore
        total={filtered.length}
        count={pagination.count}
        onShowMore={pagination.showMore}
        noun="venda"
        nounPlural="vendas"
      />

      <SaleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={clients}
        profiles={profiles}
        sale={editing}
        saleCost={editing ? (costsBySale.get(editing.id) ?? null) : null}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir esta venda?"
        description={
          deleting
            ? `A venda de ${deleting.clientName} sai do sistema junto com os títulos a receber que ela gerou. Títulos já recebidos bloqueiam a exclusão — nesse caso, estorne a baixa primeiro. O cliente e os lançamentos de caixa permanecem.`
            : undefined
        }
        confirmLabel="Excluir venda"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  )
}

function SaleStatusBadge({ status }: { status: Sale['status'] }) {
  const label = SALE_STATUS_LABEL[status]
  if (status === 'pago' || status === 'finalizado') return <Badge variant="positive">{label}</Badge>
  if (status === 'cancelado') return <Badge variant="negative">{label}</Badge>
  return <Badge variant="muted">{label}</Badge>
}
