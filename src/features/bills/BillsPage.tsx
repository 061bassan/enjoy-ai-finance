import * as React from 'react'
import { CheckCircle2, Inbox, Search } from 'lucide-react'
import { formatDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { BILL_STATUS_LABEL, COST_CENTER_LABEL } from '@/data/enums'
import type { BillDirection } from '@/data/types'
import {
  agingBuckets,
  toBillViews,
  totalOutstanding,
  totalOverdue,
  type BillView,
  type DisplayBillStatus,
} from '@/domain/bills'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAccounts, useBillPayments, useBills } from '@/hooks/data'
import { SettleBillDialog } from './SettleBillDialog'

const ALL = '__all__'

const STATUS_LABEL: Record<DisplayBillStatus, string> = {
  ...BILL_STATUS_LABEL,
  overdue: 'Vencido',
}

/**
 * Contas a receber e a pagar são a mesma tela, parametrizada pela direção.
 * A lógica de atraso, baixa parcial e aging é idêntica nos dois lados —
 * duplicar a página só criaria duas versões para divergirem com o tempo.
 */
export function BillsPage({ direction }: { direction: BillDirection }) {
  const { range } = usePeriod()
  const { allow } = useSession()
  const canManage = allow('manage:bills')

  const { data: bills = [], isLoading } = useBills()
  const { data: payments = [] } = useBillPayments()
  const { data: accounts = [] } = useAccounts()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<DisplayBillStatus | typeof ALL>(ALL)
  const [onlyPeriod, setOnlyPeriod] = React.useState(true)
  const [settling, setSettling] = React.useState<BillView | null>(null)

  const isReceivable = direction === 'receivable'

  const views = React.useMemo(
    () => toBillViews(bills.filter((bill) => bill.direction === direction), payments),
    [bills, payments, direction],
  )

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return views
      .filter((view) =>
        onlyPeriod ? view.bill.dueDate >= range.from && view.bill.dueDate <= range.to : true,
      )
      .filter((view) => (statusFilter === ALL ? true : view.status === statusFilter))
      .filter((view) =>
        term
          ? view.bill.partyName.toLowerCase().includes(term) ||
            view.bill.description.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate))
  }, [views, onlyPeriod, range, statusFilter, search])

  const summary = React.useMemo(() => {
    const open = views.filter((v) => v.status !== 'paid' && v.status !== 'canceled')
    return {
      outstanding: totalOutstanding(open),
      overdue: totalOverdue(open),
      aging: agingBuckets(open),
      countOpen: open.length,
    }
  }, [views])

  return (
    <>
      <PageHeader
        title={isReceivable ? 'Contas a receber' : 'Contas a pagar'}
        description={
          isReceivable
            ? 'Títulos emitidos para clientes, com atraso e recebimento parcial.'
            : 'Compromissos com fornecedores e custos programados, por vencimento e centro de custo.'
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card glass className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Em aberto
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatMoney(summary.outstanding)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.countOpen} títulos</p>
        </Card>

        <Card glass className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Vencido
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(summary.overdue)}</p>
        </Card>

        <Card className="p-4 sm:col-span-2">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Distribuição do atraso
          </p>
          <div className="space-y-1">
            {summary.aging
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => (
                <div key={bucket.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{bucket.label}</span>
                  <span className="tabular-nums">{formatMoney(bucket.totalCents)}</span>
                </div>
              ))}
            {summary.aging.every((bucket) => bucket.count === 0) && (
              <p className="text-sm text-muted-foreground">Nenhum título em aberto.</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isReceivable ? 'Buscar por cliente' : 'Buscar por fornecedor'}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as never)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os status</SelectItem>
              <SelectItem value="open">Em aberto</SelectItem>
              <SelectItem value="overdue">Vencido</SelectItem>
              <SelectItem value="partial">Parcial</SelectItem>
              <SelectItem value="paid">Quitado</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={onlyPeriod ? 'secondary' : 'outline'}
            onClick={() => setOnlyPeriod((value) => !value)}
          >
            {onlyPeriod ? 'Somente o período' : 'Todos os vencimentos'}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Inbox}
              title="Nenhum título encontrado"
              description="Ajuste os filtros ou o período no topo da tela."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[104px]">Vencimento</TableHead>
                <TableHead>{isReceivable ? 'Cliente' : 'Fornecedor'}</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead className="hidden xl:table-cell">Centro de custo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead data-numeric>Valor</TableHead>
                <TableHead data-numeric className="hidden sm:table-cell">
                  Em aberto
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((view) => (
                <TableRow key={view.bill.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(view.bill.dueDate)}
                  </TableCell>

                  <TableCell className="max-w-[180px] truncate font-medium">
                    {view.bill.partyName}
                  </TableCell>

                  <TableCell className="hidden max-w-[240px] truncate text-muted-foreground md:table-cell">
                    {view.bill.description}
                  </TableCell>

                  <TableCell className="hidden xl:table-cell">
                    {view.bill.costCenter ? (
                      <Badge variant="outline">{COST_CENTER_LABEL[view.bill.costCenter]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <StatusBadge view={view} />
                  </TableCell>

                  <TableCell data-numeric className="text-muted-foreground">
                    {formatMoney(view.bill.amountCents)}
                  </TableCell>

                  <TableCell data-numeric className="hidden font-medium sm:table-cell">
                    {formatMoney(view.outstandingCents)}
                  </TableCell>

                  <TableCell>
                    {canManage && view.status !== 'paid' && view.status !== 'canceled' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={isReceivable ? 'Registrar recebimento' : 'Registrar pagamento'}
                        onClick={() => setSettling(view)}
                      >
                        <CheckCircle2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <SettleBillDialog
        view={settling}
        accounts={accounts}
        open={settling != null}
        onOpenChange={(open) => {
          if (!open) setSettling(null)
        }}
      />
    </>
  )
}

function StatusBadge({ view }: { view: BillView }) {
  if (view.status === 'overdue') {
    return (
      <Badge variant="negative">
        {view.daysLate} {view.daysLate === 1 ? 'dia' : 'dias'}
      </Badge>
    )
  }
  if (view.status === 'paid') return <Badge variant="positive">Quitado</Badge>
  if (view.status === 'partial') return <Badge variant="outline">Parcial</Badge>
  return <Badge variant="muted">{STATUS_LABEL[view.status]}</Badge>
}
