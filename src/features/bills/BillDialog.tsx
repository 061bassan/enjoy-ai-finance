import * as React from 'react'
import { toast } from 'sonner'
import { data } from '@/data'
import { today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { COST_CENTER_LABEL, optionsFrom } from '@/data/enums'
import type { Account, Bill, BillDirection, Category, Client, CostCenter } from '@/data/types'
import { useSession } from '@/app/session'
import { useCreate, useUpdate } from '@/hooks/data'
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
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

/**
 * Cadastro e correção de um título.
 *
 * A tela de contas sabia baixar e cobrar, mas não sabia criar nem corrigir:
 * todo título vinha de uma venda ou de uma regra recorrente. Uma conta de luz
 * fora do padrão, um vencimento renegociado ou um valor digitado errado não
 * tinham caminho nenhum — e "apagar e refazer" não existia porque apagar
 * também não existia.
 *
 * **O valor trava quando já houve baixa.** Reduzir o valor de um título com
 * recebimento parcial poderia deixá-lo com saldo negativo, e o resto do
 * sistema trata saldo como algo que não fica negativo. Quem precisa mesmo
 * mudar estorna a baixa primeiro — que é uma decisão consciente, com registro.
 */
export function BillDialog({
  open,
  onOpenChange,
  direction,
  bill = null,
  paidCents = 0,
  accounts,
  categories,
  clients,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  direction: BillDirection
  bill?: Bill | null
  /** Quanto já foi baixado — trava a edição do valor. */
  paidCents?: number
  accounts: Account[]
  categories: Category[]
  clients: Client[]
}) {
  const { session } = useSession()
  const create = useCreate('bills', data.bills)
  const update = useUpdate('bills', data.bills)

  const isEditing = bill != null
  const isReceivable = direction === 'receivable'
  const amountLocked = paidCents > 0

  const [partyName, setPartyName] = React.useState('')
  const [clientId, setClientId] = React.useState(NONE)
  const [description, setDescription] = React.useState('')
  const [amountCents, setAmountCents] = React.useState(0)
  const [dueDate, setDueDate] = React.useState(today())
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [costCenter, setCostCenter] = React.useState<CostCenter | typeof NONE>(NONE)
  const [accountId, setAccountId] = React.useState(NONE)
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (!open) return

    setPartyName(bill?.partyName ?? '')
    setClientId(bill?.clientId ?? NONE)
    setDescription(bill?.description ?? '')
    setAmountCents(bill?.amountCents ?? 0)
    setDueDate(bill?.dueDate ?? today())
    setCategoryId(bill?.categoryId ?? NONE)
    setCostCenter(bill?.costCenter ?? NONE)
    setAccountId(bill?.accountId ?? NONE)
    setNotes(bill?.notes ?? '')
  }, [open, bill])

  const relevantCategories = React.useMemo(
    () => categories.filter((category) => category.kind === (isReceivable ? 'income' : 'expense')),
    [categories, isReceivable],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (!partyName.trim()) {
      toast.error(isReceivable ? 'Informe o cliente.' : 'Informe o fornecedor.')
      return
    }
    if (amountCents <= 0) {
      toast.error('O valor precisa ser maior que zero.')
      return
    }
    if (amountLocked && amountCents < paidCents) {
      toast.error('O valor não pode ficar abaixo do que já foi baixado.')
      return
    }

    const fields = {
      partyName: partyName.trim(),
      clientId: clientId === NONE ? null : clientId,
      description: description.trim() || partyName.trim(),
      amountCents,
      dueDate,
      categoryId: categoryId === NONE ? null : categoryId,
      costCenter: costCenter === NONE ? null : costCenter,
      accountId: accountId === NONE ? null : accountId,
      notes: notes.trim() || null,
    }

    try {
      if (bill) {
        await update.mutateAsync({ id: bill.id, patch: fields })
        toast.success('Título atualizado.')
      } else {
        await create.mutateAsync({
          workspaceId: session.workspaceId,
          direction,
          issueDate: today(),
          status: 'open',
          installmentNumber: null,
          installmentTotal: null,
          createdBy: session.user.id,
          ...fields,
        })
        toast.success('Título criado.')
      }
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar o título.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar título' : isReceivable ? 'Novo recebimento' : 'Nova conta a pagar'}
          </DialogTitle>
          <DialogDescription>
            {isReceivable
              ? 'Um valor que a empresa tem a receber, com vencimento próprio. Entra no previsto do fluxo de caixa e sai de lá quando for baixado.'
              : 'Um compromisso a pagar. Entra no previsto do fluxo de caixa e vira saída de caixa quando for baixado.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bill-party">{isReceivable ? 'Cliente' : 'Fornecedor'}</Label>
              <Input
                id="bill-party"
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                autoFocus
              />
            </div>

            {isReceivable && clients.length > 0 && (
              <div className="space-y-1.5">
                <Label>Cliente cadastrado</Label>
                <Select
                  value={clientId}
                  onValueChange={(value) => {
                    setClientId(value)
                    const client = clients.find((item) => item.id === value)
                    if (client) setPartyName(client.name)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Não vincular" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vincular</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bill-description">Descrição</Label>
              <Input
                id="bill-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Do que se trata"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bill-amount">Valor</Label>
              <MoneyInput id="bill-amount" value={amountCents} onChange={setAmountCents} />
              {amountLocked && (
                <p className="text-[11px] text-muted-foreground">
                  {formatMoney(paidCents)} já baixado — o valor não pode ficar abaixo disso.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bill-due">Vencimento</Label>
              <DateField id="bill-due" value={dueDate} onChange={setDueDate} />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {relevantCategories.map((category) => (
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
                onValueChange={(value) => setCostCenter(value as CostCenter | typeof NONE)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem centro de custo</SelectItem>
                  {optionsFrom(COST_CENTER_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Conta prevista</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Definir na baixa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Definir na baixa</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-notes">Observações</Label>
            <Textarea
              id="bill-notes"
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
              {isEditing ? 'Salvar alterações' : 'Criar título'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
