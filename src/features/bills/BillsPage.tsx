import * as React from 'react'
import { toast } from 'sonner'
import {
  Ban,
  CheckCircle2,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react'
import { data } from '@/data'
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
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ShowMore, useVisibleCount } from '@/components/ShowMore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useAccounts,
  useBillPayments,
  useBills,
  useCategories,
  useClients,
  useRemove,
  useUnsettleBillPayment,
  useUpdate,
} from '@/hooks/data'
import { BillDialog } from './BillDialog'
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
  const { data: categories = [] } = useCategories()
  const { data: clients = [] } = useClients()
  const removeBill = useRemove('bills', data.bills)
  const updateBill = useUpdate('bills', data.bills)
  const unsettle = useUnsettleBillPayment()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<DisplayBillStatus | typeof ALL>(ALL)
  const [onlyPeriod, setOnlyPeriod] = React.useState(true)
  const [settling, setSettling] = React.useState<BillView | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<BillView | null>(null)
  const [deleting, setDeleting] = React.useState<BillView | null>(null)
  const [reversing, setReversing] = React.useState<BillView | null>(null)
  const [canceling, setCanceling] = React.useState<BillView | null>(null)

  const isReceivable = direction === 'receivable'

  /** Baixas de cada título — o estorno precisa saber qual foi a última. */
  const paymentsByBill = React.useMemo(() => {
    const map = new Map<string, typeof payments>()
    for (const payment of payments) {
      const list = map.get(payment.billId) ?? []
      list.push(payment)
      map.set(payment.billId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date))
    return map
  }, [payments])

  const views = React.useMemo(
    () =>
      toBillViews(
        bills.filter((bill) => bill.direction === direction),
        payments,
      ),
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

  // Os totais do topo somam a lista inteira; o corte é só de exibição.
  const pagination = useVisibleCount(filtered.length)

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(view: BillView) {
    setEditing(view)
    setDialogOpen(true)
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await removeBill.mutateAsync(deleting.bill.id)
      toast.success('Título excluído.')
      setDeleting(null)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
    }
  }

  /**
   * Estorno da última baixa.
   *
   * A mensagem "estorne a baixa na tela do título" já existia em outras telas,
   * mas o botão não — o caminho apontava para o vazio. Estornar apaga a
   * transação de caixa gerada e reabre o título, que é a única forma correta
   * de desfazer: apagar a transação sozinha deixaria o título quitado sem
   * dinheiro nenhum atrás dele.
   */
  /**
   * Cancelar é diferente de excluir: o título fica no banco com status
   * `canceled`, sai do previsto e NÃO gera saída no caixa. É o caminho para a
   * conta que já foi paga e lançada em Entradas e saídas por fora — dar baixa
   * contaria a despesa duas vezes, e excluir não adianta num título de conta
   * fixa: o gerador recriaria a mesma data na próxima abertura.
   */
  async function setCanceled(view: BillView, canceled: boolean) {
    try {
      await updateBill.mutateAsync({
        id: view.bill.id,
        patch: { status: canceled ? 'canceled' : 'open' },
      })
      toast.success(canceled ? 'Título cancelado.' : 'Título reaberto.')
      setCanceling(null)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível alterar o título.')
    }
  }

  async function confirmReverse() {
    if (!reversing) return
    const list = paymentsByBill.get(reversing.bill.id) ?? []
    const last = list[list.length - 1]
    if (!last) {
      setReversing(null)
      return
    }
    try {
      await unsettle.mutateAsync(last.id)
      toast.success('Baixa estornada — o título voltou a ficar em aberto.')
      setReversing(null)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível estornar.')
    }
  }

  return (
    <>
      <PageHeader
        title={isReceivable ? 'Contas a receber' : 'Contas a pagar'}
        description={
          isReceivable
            ? 'Títulos emitidos para clientes, com atraso e recebimento parcial.'
            : 'Compromissos com fornecedores e custos programados, por vencimento e centro de custo.'
        }
        actions={
          canManage && (
            <Button onClick={openNew}>
              <Plus /> {isReceivable ? 'Novo recebimento' : 'Nova conta'}
            </Button>
          )
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
              {filtered.slice(0, pagination.count).map((view) => (
                <TableRow key={view.bill.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(view.bill.dueDate)}
                  </TableCell>

                  <TableCell className="max-w-[180px] truncate font-medium">
                    {view.bill.partyName}
                    {/* Parcela no nome, não na descrição: a coluna de descrição some no celular. */}
                    {view.bill.installmentNumber != null && view.bill.installmentTotal != null && (
                      <Badge variant="outline" className="ml-1.5 tabular-nums">
                        {view.bill.installmentNumber}/{view.bill.installmentTotal}
                      </Badge>
                    )}
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
                    {canManage && (
                      <div className="flex items-center justify-end gap-0.5">
                        {view.status !== 'paid' && view.status !== 'canceled' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={isReceivable ? 'Registrar recebimento' : 'Registrar pagamento'}
                            onClick={() => setSettling(view)}
                          >
                            <CheckCircle2 />
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ações do título ${view.bill.description}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(view)}>
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            {view.paidCents > 0 && (
                              <DropdownMenuItem onSelect={() => setReversing(view)}>
                                <RotateCcw /> Estornar última baixa
                              </DropdownMenuItem>
                            )}
                            {view.paidCents === 0 && view.status !== 'canceled' && (
                              <DropdownMenuItem onSelect={() => setCanceling(view)}>
                                <Ban /> Cancelar título
                              </DropdownMenuItem>
                            )}
                            {view.status === 'canceled' && (
                              <DropdownMenuItem onSelect={() => void setCanceled(view, false)}>
                                <Undo2 /> Reabrir título
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setDeleting(view)}>
                              <Trash2 /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ShowMore
        total={filtered.length}
        count={pagination.count}
        onShowMore={pagination.showMore}
        noun="título"
        nounPlural="títulos"
      />

      <SettleBillDialog
        view={settling}
        accounts={accounts}
        open={settling != null}
        onOpenChange={(open) => {
          if (!open) setSettling(null)
        }}
      />

      <BillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        direction={direction}
        bill={editing?.bill ?? null}
        paidCents={editing?.paidCents ?? 0}
        accounts={accounts}
        categories={categories}
        clients={clients}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir este título?"
        description={
          deleting?.paidCents
            ? 'Este título já tem baixa registrada. Excluí-lo deixaria a entrada de caixa sem origem — estorne a baixa antes.'
            : 'O título sai do previsto do fluxo de caixa. Se ele veio de uma venda ou de uma regra recorrente, pode ser gerado de novo por ali.'
        }
        confirmLabel="Excluir título"
        destructive
        onConfirm={async () => {
          if (deleting?.paidCents) {
            toast.error('Estorne a baixa antes de excluir o título.')
            return
          }
          await confirmDelete()
        }}
      />

      <ConfirmDialog
        open={reversing != null}
        onOpenChange={(open) => {
          if (!open) setReversing(null)
        }}
        title="Estornar a última baixa?"
        description="A transação de caixa gerada por ela é apagada e o título volta a ficar em aberto pelo valor correspondente."
        confirmLabel="Estornar"
        destructive
        onConfirm={confirmReverse}
      />

      <ConfirmDialog
        open={canceling != null}
        onOpenChange={(open) => {
          if (!open) setCanceling(null)
        }}
        title="Cancelar este título?"
        description="Ele sai do previsto e não lança nada em Entradas e saídas — use quando a conta já foi paga e lançada por fora, ou não vale mais. O título continua no histórico e pode ser reaberto."
        confirmLabel="Cancelar título"
        onConfirm={async () => {
          if (canceling) await setCanceled(canceling, true)
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
