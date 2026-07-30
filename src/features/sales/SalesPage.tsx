import * as React from 'react'
import { Handshake, Plus, Search } from 'lucide-react'
import { formatDate } from '@/lib/date'
import { formatMoney, formatMultiple, formatNumber, formatPercent } from '@/lib/money'
import {
  LEAD_SOURCE_LABEL,
  SALE_MODEL_LABEL,
  SALE_STATUS_LABEL,
} from '@/data/enums'
import type { Sale, SaleStatus } from '@/data/types'
import { saleEconomics, summarizeSales } from '@/domain/sales'
import { variation } from '@/domain/finance'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { useClients, useProfileMap, useProfiles, useSaleCosts, useSales } from '@/hooks/data'
import { SaleDialog } from './SaleDialog'

const ALL = '__all__'

export function SalesPage() {
  const { range, comparisonRange } = usePeriod()
  const { session, allow } = useSession()

  const canSeeAll = allow('manage:sales:all') || allow('view:sales:all')
  const canCreate = allow('manage:sales:all') || allow('manage:sales:own')

  const { data: sales = [], isLoading } = useSales()
  const { data: costs = [] } = useSaleCosts()
  const { data: clients = [] } = useClients()
  const { data: profiles = [] } = useProfiles()
  const profileMap = useProfileMap()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<SaleStatus | typeof ALL>(ALL)
  const [closerFilter, setCloserFilter] = React.useState<string>(ALL)
  const [dialogOpen, setDialogOpen] = React.useState(false)

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
    return sales.filter((sale) => sale.closerId === me || sale.sdrId === me || sale.createdBy === me)
  }, [sales, canSeeAll, session?.user.id])

  const inPeriod = React.useMemo(
    () => visible.filter((sale) => sale.saleDate >= range.from && sale.saleDate <= range.to),
    [visible, range],
  )

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return inPeriod
      .filter((sale) => (statusFilter === ALL ? true : sale.status === statusFilter))
      .filter((sale) => (closerFilter === ALL ? true : sale.closerId === closerFilter))
      .filter((sale) =>
        term
          ? sale.clientName.toLowerCase().includes(term) ||
            (sale.company ?? '').toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
  }, [inPeriod, statusFilter, closerFilter, search])

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
    return {
      rows,
      totalCost,
      netProfit,
      margin: summary.totalCents ? netProfit / summary.totalCents : null,
      averageCac: rows.length ? Math.round(totalAcquisition / rows.length) : 0,
      roi: totalCost ? netProfit / totalCost : null,
    }
  }, [inPeriod, costsBySale, summary.totalCents])

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
            <Button onClick={() => setDialogOpen(true)}>
              <Plus /> Nova venda
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        <KpiCard
          label="Vendas"
          value={formatNumber(summary.count)}
          variation={variation(summary.count, previousSummary.count)}
        />
        <KpiCard
          label="Valor vendido"
          value={formatMoney(summary.totalCents)}
          variation={variation(summary.totalCents, previousSummary.totalCents)}
        />
        <KpiCard
          label="Ticket médio"
          value={formatMoney(summary.averageTicketCents)}
          variation={variation(summary.averageTicketCents, previousSummary.averageTicketCents)}
        />
        <KpiCard label="MRR vendido" value={formatMoney(summary.mrrCents)} />
        <KpiCard label="Implantação" value={formatMoney(summary.setupRevenueCents)} />
        <KpiCard label="Maior venda" value={formatMoney(summary.largestCents)} />
        <KpiCard label="Menor venda" value={formatMoney(summary.smallestCents)} />
        <KpiCard
          label="Lucro das vendas"
          value={formatMoney(economics.netProfit)}
          secondary={economics.margin != null ? formatPercent(economics.margin) : undefined}
        />
        <KpiCard
          label="CAC médio"
          value={formatMoney(economics.averageCac)}
          invertVariation
          hint="Anúncios + comissões + deslocamento, dividido pelo número de vendas do período."
        />
        <KpiCard
          label="ROI"
          value={economics.roi != null ? formatMultiple(economics.roi) : '—'}
          hint="Lucro líquido das vendas dividido pelo custo total atribuído a elas."
        />
        <KpiCard
          label="Tempo de fechamento"
          value={
            summary.averageDaysToClose != null ? `${summary.averageDaysToClose} dias` : '—'
          }
          invertVariation
        />
      </KpiGrid>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por cliente ou empresa"
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as never)}>
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

          {canSeeAll && (
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
                  <Button onClick={() => setDialogOpen(true)}>
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
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden lg:table-cell">Closer</TableHead>
                <TableHead className="hidden xl:table-cell">Origem</TableHead>
                <TableHead className="hidden sm:table-cell">Modelo</TableHead>
                <TableHead data-numeric>Valor</TableHead>
                <TableHead data-numeric className="hidden md:table-cell">
                  MRR
                </TableHead>
                <TableHead data-numeric className="hidden xl:table-cell">
                  Margem
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sale) => {
                const eco = saleEconomics(sale, costsBySale.get(sale.id))
                return (
                  <TableRow key={sale.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(sale.saleDate)}
                    </TableCell>

                    <TableCell>
                      <span className="block max-w-[200px] truncate font-medium">
                        {sale.clientName}
                      </span>
                      {sale.company && (
                        <span className="block max-w-[200px] truncate text-xs text-muted-foreground">
                          {sale.company}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {sale.closerId ? (profileMap.get(sale.closerId)?.name ?? '—') : '—'}
                    </TableCell>

                    <TableCell className="hidden xl:table-cell">
                      {sale.leadSource ? (
                        <Badge variant="outline">{LEAD_SOURCE_LABEL[sale.leadSource]}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="muted">{SALE_MODEL_LABEL[sale.model]}</Badge>
                    </TableCell>

                    <TableCell data-numeric className="font-medium">
                      {formatMoney(sale.amountCents)}
                    </TableCell>

                    <TableCell data-numeric className="hidden text-muted-foreground md:table-cell">
                      {sale.mrrCents > 0 ? formatMoney(sale.mrrCents) : '—'}
                    </TableCell>

                    <TableCell data-numeric className="hidden xl:table-cell">
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
                    </TableCell>

                    <TableCell>
                      <SaleStatusBadge status={sale.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <SaleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={clients}
        profiles={profiles}
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
