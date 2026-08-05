import * as React from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { data } from '@/data'
import { formatDate, monthsInRange, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import {
  COST_CENTER_LABEL,
  COST_CENTERS,
  PRIORITY_LABEL,
  PURCHASE_STATUS_LABEL,
  optionsFrom,
} from '@/data/enums'
import type { CostCenter, PurchaseGoal, PurchaseStatus } from '@/data/types'
import { purchaseAffordability, sortPurchases } from '@/domain/goals'
import { monthlySeries, totalCash } from '@/domain/finance'
import { useSession } from '@/app/session'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DateField } from '@/components/DateField'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { MoneyInput } from '@/components/MoneyInput'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAccounts,
  useCreate,
  usePurchaseGoals,
  useRemove,
  useTransactions,
  useUpdate,
} from '@/hooks/data'

/**
 * Metas de compra.
 *
 * O diferencial em relação a uma lista de desejos: cada item responde "quando
 * isso cabe no caixa". A resposta usa a sobra média mensal real da operação —
 * se a operação não sobra dinheiro, a tela diz isso em vez de inventar uma data.
 */
export function PurchasesPage() {
  const { session, allow } = useSession()
  const canManage = allow('manage:purchases')

  const { data: purchases = [], isLoading } = usePurchaseGoals()
  const { data: transactions = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()

  const update = useUpdate('purchaseGoals', data.purchaseGoals)
  const removePurchase = useRemove('purchaseGoals', data.purchaseGoals)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PurchaseGoal | null>(null)
  const [deleting, setDeleting] = React.useState<PurchaseGoal | null>(null)

  const context = React.useMemo(() => {
    const cash = totalCash(accounts, transactions)

    // Sobra mensal: média do resultado dos últimos 6 meses.
    const months = monthsInRange({
      from: `${Number(today().slice(0, 4))}-${today().slice(5, 7)}-01`,
      to: today(),
    })
    const lastSixMonths = monthsInRange({
      from: shiftMonths(today(), -5),
      to: today(),
    })
    const series = monthlySeries(transactions, lastSixMonths.length ? lastSixMonths : months)
    const surplus = series.length
      ? Math.round(series.reduce((sum, point) => sum + point.profitCents, 0) / series.length)
      : 0

    return { cash, surplus }
  }, [accounts, transactions])

  const rows = React.useMemo(
    () =>
      sortPurchases(purchases.filter((purchase) => purchase.status !== 'dropped')).map((purchase) =>
        purchaseAffordability(purchase, context.surplus, context.cash),
      ),
    [purchases, context],
  )

  async function changeStatus(id: string, status: PurchaseStatus) {
    await update.mutateAsync({
      id,
      patch: { status, boughtAt: status === 'bought' ? today() : null },
    })
    toast.success('Status atualizado.')
  }

  return (
    <>
      <PageHeader
        title="Compras planejadas"
        description="O que você quer comprar, por ordem de urgência, e quando isso cabe no caixa."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus /> Nova meta de compra
            </Button>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Caixa disponível
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(context.cash)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Sobra mensal média
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {context.surplus > 0 ? formatMoney(context.surplus) : 'sem sobra'}
            </p>
            <p className="text-xs text-muted-foreground">média dos últimos 6 meses</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total desejado
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(rows.reduce((sum, row) => sum + row.remainingCents, 0))}
            </p>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nenhuma meta de compra"
          description="Cadastre equipamentos, licenças ou qualquer aquisição planejada."
          action={
            canManage && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setDialogOpen(true)
                }}
              >
                <Plus /> Nova meta de compra
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.purchase.id} glass className="flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{row.purchase.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {PRIORITY_LABEL[row.purchase.priority]}
                    {row.purchase.costCenter && ` · ${COST_CENTER_LABEL[row.purchase.costCenter]}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {row.affordableNow ? (
                    <Badge variant="positive">Cabe no caixa</Badge>
                  ) : (
                    <Badge variant="muted">{PURCHASE_STATUS_LABEL[row.purchase.status]}</Badge>
                  )}
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ações de ${row.purchase.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(row.purchase)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDeleting(row.purchase)}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {row.purchase.description && (
                <p className="mb-3 text-sm text-muted-foreground">{row.purchase.description}</p>
              )}

              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney(row.purchase.savedCents)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  de {formatMoney(row.purchase.estimatedCents)}
                </span>
              </div>

              <Progress value={row.ratio * 100} tone={row.ratio >= 1 ? 'positive' : 'auto'} />

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Falta</dt>
                  <dd className="tabular-nums">{formatMoney(row.remainingCents)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Cabe no caixa em
                  </dt>
                  <dd className="tabular-nums">
                    {row.affordableNow
                      ? 'agora'
                      : row.affordableAt
                        ? formatDate(row.affordableAt)
                        : 'sem sobra atual'}
                  </dd>
                </div>
                {row.purchase.targetDate && (
                  <div className="col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Prazo desejado
                    </dt>
                    <dd className="tabular-nums">{formatDate(row.purchase.targetDate)}</dd>
                  </div>
                )}
              </dl>

              {canManage && (
                <div className="mt-4 pt-1">
                  <Select
                    value={row.purchase.status}
                    onValueChange={(value) =>
                      void changeStatus(row.purchase.id, value as PurchaseStatus)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsFrom(PURCHASE_STATUS_LABEL).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <PurchaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={session?.workspaceId ?? ''}
        purchase={editing}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir esta meta de compra?"
        description="A meta some da lista. Nenhum lançamento de caixa é afetado — a meta é só planejamento."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await removePurchase.mutateAsync(deleting.id)
            toast.success('Meta de compra excluída.')
            setDeleting(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </>
  )
}

/** Desloca uma data ISO em N meses, preservando o dia 1. */
function shiftMonths(iso: string, delta: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7)) + delta
  const targetYear = year + Math.floor((month - 1) / 12)
  const targetMonth = ((((month - 1) % 12) + 12) % 12) + 1
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
}

function PurchaseDialog({
  open,
  onOpenChange,
  workspaceId,
  purchase = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Quando presente, corrige a meta em vez de criar outra. */
  purchase?: PurchaseGoal | null
}) {
  const create = useCreate('purchaseGoals', data.purchaseGoals)
  const update = useUpdate('purchaseGoals', data.purchaseGoals)

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [estimatedCents, setEstimatedCents] = React.useState(0)
  const [savedCents, setSavedCents] = React.useState(0)
  const [priority, setPriority] = React.useState<1 | 2 | 3 | 4 | 5>(3)
  const [targetDate, setTargetDate] = React.useState('')
  const [costCenter, setCostCenter] = React.useState<CostCenter | ''>('')

  React.useEffect(() => {
    if (!open) return
    setName(purchase?.name ?? '')
    setDescription(purchase?.description ?? '')
    setEstimatedCents(purchase?.estimatedCents ?? 0)
    setSavedCents(purchase?.savedCents ?? 0)
    setPriority(purchase?.priority ?? 3)
    setTargetDate(purchase?.targetDate ?? '')
    setCostCenter(purchase?.costCenter ?? '')
  }, [open, purchase])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Informe o que você quer comprar.')
      return
    }
    if (estimatedCents <= 0) {
      toast.error('Informe o valor estimado.')
      return
    }

    const fields = {
      name: name.trim(),
      description: description.trim() || null,
      estimatedCents,
      savedCents,
      priority,
      targetDate: targetDate || null,
      costCenter: (costCenter || null) as CostCenter | null,
    }

    if (purchase) {
      await update.mutateAsync({ id: purchase.id, patch: fields })
      toast.success('Meta de compra atualizada.')
      onOpenChange(false)
      return
    }

    await create.mutateAsync({
      workspaceId,
      ...fields,
      productUrl: null,
      status: 'wishlist',
      boughtAt: null,
      transactionId: null,
    })

    toast.success('Meta de compra criada.')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova meta de compra</DialogTitle>
          <DialogDescription>
            A tela calcula sozinha quando o item cabe no caixa, com base na sobra mensal real.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="purchase-name">O que</Label>
            <Input
              id="purchase-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="MacBook Pro para edição"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchase-description">Por quê</Label>
            <Textarea
              id="purchase-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Opcional — ajuda a decidir na hora de priorizar"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="purchase-estimated">Valor estimado</Label>
              <MoneyInput
                id="purchase-estimated"
                value={estimatedCents}
                onChange={setEstimatedCents}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-saved">Já reservado</Label>
              <MoneyInput id="purchase-saved" value={savedCents} onChange={setSavedCents} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={String(priority)}
                onValueChange={(value) => setPriority(Number(value) as 1 | 2 | 3 | 4 | 5)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {([1, 2, 3, 4, 5] as const).map((level) => (
                    <SelectItem key={level} value={String(level)}>
                      {PRIORITY_LABEL[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-date">Prazo desejado</Label>
              <DateField
                id="purchase-date"
                value={targetDate}
                onChange={setTargetDate}
                clearable
                onClear={() => setTargetDate('')}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Centro de custo</Label>
              <Select
                value={costCenter}
                onValueChange={(value) => setCostCenter(value as CostCenter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  {COST_CENTERS.map((center) => (
                    <SelectItem key={center} value={center}>
                      {COST_CENTER_LABEL[center]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
