import * as React from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { formatDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { COST_CENTER_LABEL, TRANSACTION_KIND_LABEL } from '@/data/enums'
import type { Transaction, TransactionKind } from '@/data/types'
import { grossRevenue, inRange, netProfit, totalExpenses } from '@/domain/finance'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { EmptyState, PageHeader } from '@/components/PageHeader'
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
import { useAccounts, useCategories, useDeleteTransaction, useTransactions } from '@/hooks/data'
import { TransactionDialog } from './TransactionDialog'

const ALL = '__all__'

export function TransactionsPage() {
  const { range } = usePeriod()
  const { allow } = useSession()
  const canManage = allow('manage:transactions')

  const { data: transactions = [], isLoading } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const remove = useDeleteTransaction()

  const [search, setSearch] = React.useState('')
  const [kindFilter, setKindFilter] = React.useState<TransactionKind | typeof ALL>(ALL)
  const [accountFilter, setAccountFilter] = React.useState<string>(ALL)
  const [categoryFilter, setCategoryFilter] = React.useState<string>(ALL)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Transaction | null>(null)

  const accountNames = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  )
  const categoryNames = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return inRange(transactions, range)
      .filter((t) => (kindFilter === ALL ? true : t.kind === kindFilter))
      .filter((t) => (accountFilter === ALL ? true : t.accountId === accountFilter))
      .filter((t) => (categoryFilter === ALL ? true : t.categoryId === categoryFilter))
      .filter((t) => (term ? t.description.toLowerCase().includes(term) : true))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, range, kindFilter, accountFilter, categoryFilter, search])

  const totals = React.useMemo(
    () => ({
      revenue: grossRevenue(filtered),
      expenses: totalExpenses(filtered),
      profit: netProfit(filtered),
    }),
    [filtered],
  )

  // Os totais acima somam a lista inteira; o corte abaixo é só de exibição.
  // Se o recorte mudasse a soma, "mostrar mais" alteraria a receita do mês.
  const pagination = useVisibleCount(filtered.length)

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(transaction: Transaction) {
    setEditing(transaction)
    setDialogOpen(true)
  }

  async function handleDelete(transaction: Transaction) {
    // As duas travas — baixa de título e par de transferência — moram na
    // operação, não aqui. A tela só reporta: uma regra que vive na tela vale
    // apenas enquanto ninguém escrever a segunda tela.
    try {
      await remove.mutateAsync(transaction.id)
      toast.success(
        transaction.transferGroupId
          ? 'Transferência excluída — as duas pontas saíram juntas.'
          : 'Lançamento excluído.',
      )
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
    }
  }

  return (
    <>
      <PageHeader
        title="Entradas e saídas"
        description="Tudo que realmente entrou ou saiu da conta no período escolhido."
        actions={
          canManage && (
            <Button onClick={openNew}>
              <Plus /> Novo lançamento
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Entradas
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(totals.revenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Saídas
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(totals.expenses)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Resultado
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(totals.profit)}</p>
        </Card>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              className="pl-9"
            />
          </div>

          <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as never)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              <SelectItem value="income">Entradas</SelectItem>
              <SelectItem value="expense">Saídas</SelectItem>
              <SelectItem value="transfer">Transferências</SelectItem>
            </SelectContent>
          </Select>

          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as contas</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ArrowLeftRight}
              title="Nada lançado neste período"
              description="Mude o período no topo da tela ou registre uma entrada ou saída."
              action={
                canManage && (
                  <Button onClick={openNew}>
                    <Plus /> Novo lançamento
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[104px]">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">Conta</TableHead>
                <TableHead className="hidden xl:table-cell">Centro de custo</TableHead>
                <TableHead data-numeric>Valor</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, pagination.count).map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(transaction.date)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <KindIcon kind={transaction.kind} />
                      <span className="min-w-0">
                        <span className="block truncate">{transaction.description}</span>
                        {transaction.billId && (
                          <Badge variant="muted" className="mt-0.5">
                            baixa de título
                          </Badge>
                        )}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {transaction.categoryId
                      ? (categoryNames.get(transaction.categoryId) ?? '—')
                      : '—'}
                  </TableCell>

                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {accountNames.get(transaction.accountId) ?? '—'}
                  </TableCell>

                  <TableCell className="hidden xl:table-cell">
                    {transaction.costCenter ? (
                      <Badge variant="outline">{COST_CENTER_LABEL[transaction.costCenter]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell data-numeric>
                    <span
                      className={
                        transaction.kind === 'income'
                          ? 'font-semibold text-foreground'
                          : 'text-muted-foreground'
                      }
                    >
                      {transaction.kind === 'expense'
                        ? '−'
                        : transaction.kind === 'income'
                          ? '+'
                          : ''}
                      {formatMoney(transaction.amountCents)}
                    </span>
                  </TableCell>

                  <TableCell>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEdit(transaction)}>
                            <Pencil /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void handleDelete(transaction)}>
                            <Trash2 /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
        noun="lançamento"
        nounPlural="lançamentos"
      />

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={editing}
        accounts={accounts}
        categories={categories}
      />
    </>
  )
}

function KindIcon({ kind }: { kind: TransactionKind }) {
  const className = 'h-3.5 w-3.5 shrink-0 text-muted-foreground'
  const title = TRANSACTION_KIND_LABEL[kind]

  if (kind === 'income') return <ArrowUpRight className={className} aria-label={title} />
  if (kind === 'expense') return <ArrowDownLeft className={className} aria-label={title} />
  return <ArrowLeftRight className={className} aria-label={title} />
}
