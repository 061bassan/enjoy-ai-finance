import * as React from 'react'
import { toast } from 'sonner'
import { ArrowDown } from 'lucide-react'
import { today } from '@/lib/date'
import type { Account } from '@/data/types'
import { useSession } from '@/app/session'
import { useCreateTransfer } from '@/hooks/data'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Transferência entre contas.
 *
 * Gera duas transações amarradas pelo mesmo `transferGroupId`. Elas afetam o
 * saldo das contas envolvidas, mas nunca entram em receita ou despesa — mover
 * dinheiro entre contas próprias não é faturamento nem gasto.
 */
export function TransferDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
}) {
  const { session } = useSession()
  const transfer = useCreateTransfer()

  const [fromAccountId, setFromAccountId] = React.useState('')
  const [toAccountId, setToAccountId] = React.useState('')
  const [amountCents, setAmountCents] = React.useState(0)
  const [date, setDate] = React.useState(today())
  const [description, setDescription] = React.useState('Transferência entre contas')

  React.useEffect(() => {
    if (!open) return
    setFromAccountId(accounts[0]?.id ?? '')
    setToAccountId(accounts[1]?.id ?? '')
    setAmountCents(0)
    setDate(today())
    setDescription('Transferência entre contas')
  }, [open, accounts])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (!fromAccountId || !toAccountId) {
      toast.error('Selecione as duas contas.')
      return
    }
    if (fromAccountId === toAccountId) {
      toast.error('A conta de origem e a de destino precisam ser diferentes.')
      return
    }
    if (amountCents <= 0) {
      toast.error('Informe um valor maior que zero.')
      return
    }

    try {
      await transfer.mutateAsync({
        workspaceId: session.workspaceId,
        fromAccountId,
        toAccountId,
        amountCents,
        date,
        description: description.trim() || 'Transferência entre contas',
        actorId: session.user.id,
      })
      toast.success('Transferência registrada.')
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível transferir.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>
            Move saldo entre contas próprias. Não conta como receita nem como despesa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>De</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Conta de origem" />
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

          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <Label>Para</Label>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Conta de destino" />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((account) => account.id !== fromAccountId)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-amount">Valor</Label>
              <MoneyInput id="transfer-amount" value={amountCents} onChange={setAmountCents} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-date">Data</Label>
              <Input
                id="transfer-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transfer-description">Descrição</Label>
            <Input
              id="transfer-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={transfer.isPending}>
              Transferir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
