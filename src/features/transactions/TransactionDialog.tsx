import * as React from 'react'
import { toast } from 'sonner'
import { data } from '@/data'
import { today } from '@/lib/date'
import type { Account, Category, CostCenter, PaymentMethod, Transaction, TransactionKind } from '@/data/types'
import {
  COST_CENTER_LABEL,
  COST_CENTERS,
  PAYMENT_METHOD_LABEL,
  optionsFrom,
} from '@/data/enums'
import { useSession } from '@/app/session'
import { useCreate, useUpdate } from '@/hooks/data'
import { MoneyInput } from '@/components/MoneyInput'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando presente, o diálogo edita em vez de criar. */
  transaction?: Transaction | null
  accounts: Account[]
  categories: Category[]
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
  categories,
}: TransactionDialogProps) {
  const { session } = useSession()
  const create = useCreate('transactions', data.transactions, ['bills', 'billPayments'])
  const update = useUpdate('transactions', data.transactions, ['bills', 'billPayments'])

  const isEditing = Boolean(transaction)
  const [kind, setKind] = React.useState<TransactionKind>('expense')
  const [amountCents, setAmountCents] = React.useState(0)
  const [date, setDate] = React.useState(today())
  const [description, setDescription] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [costCenter, setCostCenter] = React.useState<CostCenter | ''>('')
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | ''>('')
  const [notes, setNotes] = React.useState('')

  // Recarrega o formulário sempre que o diálogo abre.
  React.useEffect(() => {
    if (!open) return
    if (transaction) {
      setKind(transaction.kind)
      setAmountCents(transaction.amountCents)
      setDate(transaction.date)
      setDescription(transaction.description)
      setAccountId(transaction.accountId)
      setCategoryId(transaction.categoryId ?? '')
      setCostCenter(transaction.costCenter ?? '')
      setPaymentMethod(transaction.paymentMethod ?? '')
      setNotes(transaction.notes ?? '')
    } else {
      setKind('expense')
      setAmountCents(0)
      setDate(today())
      setDescription('')
      setAccountId(accounts[0]?.id ?? '')
      setCategoryId('')
      setCostCenter('')
      setPaymentMethod('')
      setNotes('')
    }
  }, [open, transaction, accounts])

  // Ao escolher a categoria, herda o centro de custo dela — poupa um passo
  // no caso comum, e continua editável.
  const availableCategories = categories.filter((category) => category.kind === kind)

  function handleCategoryChange(value: string) {
    setCategoryId(value)
    const category = categories.find((c) => c.id === value)
    if (category?.costCenter) setCostCenter(category.costCenter)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (amountCents <= 0) {
      toast.error('Informe um valor maior que zero.')
      return
    }
    if (!accountId) {
      toast.error('Selecione a conta.')
      return
    }
    if (!description.trim()) {
      toast.error('Informe uma descrição.')
      return
    }

    const payload = {
      workspaceId: session.workspaceId,
      accountId,
      categoryId: categoryId || null,
      kind,
      amountCents,
      date,
      description: description.trim(),
      status: 'cleared' as const,
      paymentMethod: (paymentMethod || null) as PaymentMethod | null,
      costCenter: (costCenter || null) as CostCenter | null,
      tags: [],
      notes: notes.trim() || null,
      createdBy: session.user.id,
    }

    try {
      if (transaction) {
        await update.mutateAsync({ id: transaction.id, patch: payload })
        toast.success('Transação atualizada.')
      } else {
        await create.mutateAsync(payload)
        toast.success('Transação registrada.')
      }
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar transação' : 'Nova transação'}</DialogTitle>
          <DialogDescription>
            Lançamento efetivo de caixa. Para algo que ainda vai vencer, use Contas a pagar ou a
            receber.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Tabs value={kind} onValueChange={(value) => setKind(value as TransactionKind)}>
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">
                Saída
              </TabsTrigger>
              <TabsTrigger value="income" className="flex-1">
                Entrada
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor</Label>
              <MoneyInput id="amount" value={amountCents} onChange={setAmountCents} autoFocus />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: Tráfego pago — campanha de setembro"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Não informada" />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(PAYMENT_METHOD_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEditing ? 'Salvar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
