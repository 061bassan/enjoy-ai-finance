import * as React from 'react'
import { toast } from 'sonner'
import { formatDate, today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import type { Account } from '@/data/types'
import type { BillView } from '@/domain/bills'
import { useSession } from '@/app/session'
import { useSettleBill } from '@/hooks/data'
import { DateField } from '@/components/DateField'
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
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Baixa de título.
 *
 * O valor vem preenchido com o saldo em aberto porque baixa total é o caso
 * dominante; baixa parcial é digitar por cima. Confirmar aqui cria a
 * transação de caixa — é o momento em que "previsto" vira "realizado".
 */
export function SettleBillDialog({
  view,
  accounts,
  open,
  onOpenChange,
}: {
  view: BillView | null
  accounts: Account[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { session } = useSession()
  const settle = useSettleBill()

  const [amountCents, setAmountCents] = React.useState(0)
  const [date, setDate] = React.useState(today())
  const [accountId, setAccountId] = React.useState('')
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (!open || !view) return
    setAmountCents(view.outstandingCents)
    setDate(today())
    setAccountId(view.bill.accountId ?? accounts[0]?.id ?? '')
    setNotes('')
  }, [open, view, accounts])

  if (!view) return null

  const isReceivable = view.bill.direction === 'receivable'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session || !view) return

    if (amountCents <= 0) {
      toast.error('Informe um valor maior que zero.')
      return
    }
    if (amountCents > view.outstandingCents) {
      toast.error('O valor é maior que o saldo em aberto do título.')
      return
    }
    if (!accountId) {
      toast.error('Selecione a conta.')
      return
    }

    try {
      await settle.mutateAsync({
        billId: view.bill.id,
        amountCents,
        date,
        accountId,
        actorId: session.user.id,
        notes: notes.trim() || undefined,
      })
      toast.success(isReceivable ? 'Recebimento registrado.' : 'Pagamento registrado.')
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível dar baixa.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReceivable ? 'Registrar recebimento' : 'Registrar pagamento'}</DialogTitle>
          <DialogDescription>
            {view.bill.description} · vencimento {formatDate(view.bill.dueDate)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border border-border bg-surface-1 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor do título</span>
              <span className="tabular-nums">{formatMoney(view.bill.amountCents)}</span>
            </div>
            {view.paidCents > 0 && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Já baixado</span>
                <span className="tabular-nums">{formatMoney(view.paidCents)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between font-medium">
              <span>Em aberto</span>
              <span className="tabular-nums">{formatMoney(view.outstandingCents)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">Valor</Label>
              <MoneyInput
                id="settle-amount"
                value={amountCents}
                onChange={setAmountCents}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settle-date">Data</Label>
              <DateField id="settle-date" value={date} onChange={setDate} />
            </div>
          </div>

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
            <Label htmlFor="settle-notes">Observações</Label>
            <Textarea
              id="settle-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={settle.isPending}>
              Confirmar baixa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
