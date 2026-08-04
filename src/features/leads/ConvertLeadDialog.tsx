import * as React from 'react'
import { toast } from 'sonner'
import { Trophy } from 'lucide-react'
import { today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { PAYMENT_METHOD_LABEL, SALE_MODEL_LABEL, optionsFrom } from '@/data/enums'
import type { Lead, PaymentMethod, SaleModel } from '@/data/types'
import { useSession } from '@/app/session'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useConvertLeadToSale } from '@/hooks/data'

/**
 * Fecha o lead: vira cliente, venda e títulos a receber.
 *
 * É o ponto em que o funil comercial encosta no financeiro — e a razão de a
 * taxa de conversão passar a ser apurada. Antes, marcar um lead como ganho
 * seria só uma etiqueta, e alguém teria de digitar a venda outra vez na tela
 * de Vendas para o dinheiro aparecer.
 *
 * O formulário é curto de propósito: só o necessário para o dinheiro entrar
 * certo. Custos por venda, comissões detalhadas e economia unitária ficam na
 * tela de Vendas, onde já existem — pedir tudo isso no momento de comemorar
 * um fechamento faria a pessoa fugir do formulário.
 */
export function ConvertLeadDialog({
  lead,
  onOpenChange,
}: {
  lead: Lead | null
  onOpenChange: (open: boolean) => void
}) {
  const { session } = useSession()
  const convert = useConvertLeadToSale()

  const [saleDate, setSaleDate] = React.useState(today())
  const [model, setModel] = React.useState<SaleModel>('mrr')
  const [mrrCents, setMrrCents] = React.useState(0)
  const [setupCents, setSetupCents] = React.useState(0)
  const [oneOffCents, setOneOffCents] = React.useState(0)
  const [contractMonths, setContractMonths] = React.useState(12)
  const [installments, setInstallments] = React.useState(1)
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | ''>('pix')
  const [closerCommission, setCloserCommission] = React.useState(8)
  const [sdrCommission, setSdrCommission] = React.useState(3)
  const [generateReceivables, setGenerateReceivables] = React.useState(true)

  const open = lead != null

  React.useEffect(() => {
    if (!lead) return
    setSaleDate(today())
    setModel('mrr')
    setMrrCents(0)
    setSetupCents(0)
    // O valor estimado do lead entra como ponto de partida do contrato: é a
    // informação que já foi coletada, e redigitá-la só cria oportunidade de
    // divergir do que foi combinado.
    setOneOffCents(lead.estimatedValueCents)
    setContractMonths(12)
    setInstallments(1)
    setPaymentMethod('pix')
    setCloserCommission(8)
    setSdrCommission(3)
    setGenerateReceivables(true)
  }, [lead])

  const hasRecurrence = model === 'mrr'
  const months = hasRecurrence ? Math.max(1, contractMonths) : 0
  const amountCents = hasRecurrence ? mrrCents * months + setupCents : setupCents + oneOffCents

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session || !lead) return

    if (amountCents <= 0) {
      toast.error('A venda precisa ter um valor maior que zero.')
      return
    }

    try {
      const result = await convert.mutateAsync({
        leadId: lead.id,
        actorId: session.user.id,
        sale: {
          workspaceId: session.workspaceId,
          clientId: lead.clientId ?? null,
          clientName: lead.name,
          company: lead.company ?? null,
          saleDate,
          closerId: lead.ownerId ?? null,
          sdrId: null,
          leadSource: lead.source,
          model,
          amountCents,
          mrrCents: hasRecurrence ? mrrCents : 0,
          setupCents,
          contractMonths: hasRecurrence ? months : null,
          paymentMethod: (paymentMethod || null) as PaymentMethod | null,
          installments: Math.max(1, installments),
          closerCommissionPercent: closerCommission,
          sdrCommissionPercent: sdrCommission,
          status: 'pendente',
          leadCreatedAt: lead.enteredAt,
          leadId: lead.id,
          notes: null,
          createdBy: session.user.id,
        },
        generateReceivables,
        firstDueDate: saleDate,
      })

      toast.success(
        result.bills.length
          ? `Venda registrada — ${result.bills.length} títulos a receber gerados.`
          : 'Venda registrada.',
      )
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível converter o lead.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Fechar negócio
          </DialogTitle>
          <DialogDescription>
            {lead
              ? `${lead.name} vira cliente, e a venda entra no financeiro com os títulos a receber.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="convert-date">Data da venda</Label>
              <DateField id="convert-date" value={saleDate} onChange={setSaleDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={(value) => setModel(value as SaleModel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(SALE_MODEL_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {hasRecurrence ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="convert-mrr">Mensalidade</Label>
                  <MoneyInput id="convert-mrr" value={mrrCents} onChange={setMrrCents} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="convert-months">Meses de contrato</Label>
                  <Input
                    id="convert-months"
                    type="number"
                    min={1}
                    value={contractMonths}
                    onChange={(event) => setContractMonths(Math.max(1, Number(event.target.value)))}
                    className="text-right tabular-nums"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="convert-oneoff">Valor do contrato</Label>
                <MoneyInput id="convert-oneoff" value={oneOffCents} onChange={setOneOffCents} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="convert-setup">Implantação</Label>
              <MoneyInput id="convert-setup" value={setupCents} onChange={setSetupCents} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
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

            {!hasRecurrence && (
              <div className="space-y-1.5">
                <Label htmlFor="convert-installments">Parcelas</Label>
                <Input
                  id="convert-installments"
                  type="number"
                  min={1}
                  value={installments}
                  onChange={(event) => setInstallments(Math.max(1, Number(event.target.value)))}
                  className="text-right tabular-nums"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="convert-closer-commission">Comissão closer (%)</Label>
              <Input
                id="convert-closer-commission"
                type="number"
                min={0}
                step={0.5}
                value={closerCommission}
                onChange={(event) => setCloserCommission(Number(event.target.value))}
                className="text-right tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="convert-sdr-commission">Comissão SDR (%)</Label>
              <Input
                id="convert-sdr-commission"
                type="number"
                min={0}
                step={0.5}
                value={sdrCommission}
                onChange={(event) => setSdrCommission(Number(event.target.value))}
                className="text-right tabular-nums"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-1 p-3">
            <div>
              <p className="text-sm font-medium">Gerar títulos a receber</p>
              <p className="text-xs text-muted-foreground">
                Cria a implantação e uma cobrança por mês de contrato.
              </p>
            </div>
            <Switch checked={generateReceivables} onCheckedChange={setGenerateReceivables} />
          </div>

          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-accent px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Valor total do contrato</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(amountCents)}</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={convert.isPending}>
              Registrar venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
