import * as React from 'react'
import { toast } from 'sonner'
import { formatMoney, formatMultiple, formatPercent, percentOf } from '@/lib/money'
import { today } from '@/lib/date'
import {
  LEAD_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
  SALE_MODEL_LABEL,
  SALE_STATUS_LABEL,
  optionsFrom,
} from '@/data/enums'
import type {
  Client,
  LeadSource,
  PaymentMethod,
  Profile,
  SaleModel,
  SaleStatus,
} from '@/data/types'
import { useSession } from '@/app/session'
import { useCreateSale } from '@/hooks/data'
import { MoneyInput } from '@/components/MoneyInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const NONE = '__none__'

/**
 * Registro de venda.
 *
 * Ao salvar, os títulos a receber nascem junto — setup vira um título, MRR
 * vira um por mês de contrato, e modelos sem recorrência dividem o valor nas
 * parcelas. Sem isso, alguém teria que lançar as cobranças à mão e o previsto
 * do fluxo de caixa nunca bateria com o que foi vendido.
 */
export function SaleDialog({
  open,
  onOpenChange,
  clients,
  profiles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  profiles: Profile[]
}) {
  const { session } = useSession()
  const createSale = useCreateSale()

  const [clientId, setClientId] = React.useState<string>(NONE)
  const [clientName, setClientName] = React.useState('')
  const [company, setCompany] = React.useState('')
  const [saleDate, setSaleDate] = React.useState(today())
  const [leadCreatedAt, setLeadCreatedAt] = React.useState('')
  const [closerId, setCloserId] = React.useState<string>(NONE)
  const [sdrId, setSdrId] = React.useState<string>(NONE)
  const [leadSource, setLeadSource] = React.useState<LeadSource | ''>('')
  const [model, setModel] = React.useState<SaleModel>('mrr')
  const [mrrCents, setMrrCents] = React.useState(0)
  const [setupCents, setSetupCents] = React.useState(0)
  const [oneOffCents, setOneOffCents] = React.useState(0)
  const [contractMonths, setContractMonths] = React.useState(12)
  const [installments, setInstallments] = React.useState(1)
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | ''>('pix')
  const [closerCommission, setCloserCommission] = React.useState(8)
  const [sdrCommission, setSdrCommission] = React.useState(3)
  const [status, setStatus] = React.useState<SaleStatus>('pendente')
  const [notes, setNotes] = React.useState('')
  const [generateReceivables, setGenerateReceivables] = React.useState(true)

  // Custos da venda
  const [adsCents, setAdsCents] = React.useState(0)
  const [operationalCents, setOperationalCents] = React.useState(0)
  const [teamHoursCents, setTeamHoursCents] = React.useState(0)
  const [freelancersCents, setFreelancersCents] = React.useState(0)
  const [productionCents, setProductionCents] = React.useState(0)
  const [platformFeeCents, setPlatformFeeCents] = React.useState(0)
  const [travelCents, setTravelCents] = React.useState(0)
  const [otherCents, setOtherCents] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setClientId(NONE)
    setClientName('')
    setCompany('')
    setSaleDate(today())
    setLeadCreatedAt('')
    setCloserId(NONE)
    setSdrId(NONE)
    setLeadSource('')
    setModel('mrr')
    setMrrCents(0)
    setSetupCents(0)
    setOneOffCents(0)
    setContractMonths(12)
    setInstallments(1)
    setPaymentMethod('pix')
    setCloserCommission(8)
    setSdrCommission(3)
    setStatus('pendente')
    setNotes('')
    setGenerateReceivables(true)
    setAdsCents(0)
    setOperationalCents(0)
    setTeamHoursCents(0)
    setFreelancersCents(0)
    setProductionCents(0)
    setPlatformFeeCents(0)
    setTravelCents(0)
    setOtherCents(0)
  }, [open])

  const hasRecurrence = model === 'mrr'
  const months = hasRecurrence ? Math.max(1, contractMonths) : 0

  // TCV: tudo que o contrato vale ao longo da vida dele.
  const amountCents = hasRecurrence ? mrrCents * months + setupCents : setupCents + oneOffCents

  const commissionBase = setupCents + mrrCents
  const commissionCents =
    percentOf(commissionBase, closerCommission) + percentOf(commissionBase, sdrCommission)

  const totalCostCents =
    adsCents +
    commissionCents +
    operationalCents +
    teamHoursCents +
    freelancersCents +
    productionCents +
    platformFeeCents +
    travelCents +
    otherCents

  const netProfitCents = amountCents - totalCostCents
  const margin = amountCents ? netProfitCents / amountCents : null
  const roas = adsCents ? amountCents / adsCents : null
  const acquisitionCents = adsCents + commissionCents + travelCents
  const paybackMonths = mrrCents ? acquisitionCents / mrrCents : null

  function handleClientChange(value: string) {
    setClientId(value)
    if (value === NONE) return
    const client = clients.find((c) => c.id === value)
    if (client) {
      setClientName(client.name)
      setCompany(client.company ?? '')
      if (client.source) setLeadSource(client.source)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (!clientName.trim()) {
      toast.error('Informe o cliente.')
      return
    }
    if (amountCents <= 0) {
      toast.error('A venda precisa ter um valor maior que zero.')
      return
    }

    try {
      const result = await createSale.mutateAsync({
        sale: {
          workspaceId: session.workspaceId,
          clientId: clientId === NONE ? null : clientId,
          clientName: clientName.trim(),
          company: company.trim() || null,
          saleDate,
          closerId: closerId === NONE ? null : closerId,
          sdrId: sdrId === NONE ? null : sdrId,
          leadSource: (leadSource || null) as LeadSource | null,
          model,
          amountCents,
          mrrCents: hasRecurrence ? mrrCents : 0,
          setupCents,
          contractMonths: hasRecurrence ? months : null,
          paymentMethod: (paymentMethod || null) as PaymentMethod | null,
          installments: Math.max(1, installments),
          closerCommissionPercent: closerCommission,
          sdrCommissionPercent: sdrCommission,
          status,
          leadCreatedAt: leadCreatedAt || null,
          notes: notes.trim() || null,
          createdBy: session.user.id,
        },
        costs: {
          workspaceId: session.workspaceId,
          adsCents,
          commissionCents,
          bankFeeCents: 0,
          platformFeeCents,
          operationalCents,
          teamHoursCents,
          freelancersCents,
          productionCents,
          travelCents,
          otherCents,
          notes: null,
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
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível registrar a venda.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Nova venda</DialogTitle>
          <DialogDescription>
            Ao salvar, os títulos a receber são gerados automaticamente e todos os indicadores —
            MRR, TCV, CAC, ROI e forecast — passam a considerar esta venda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <Tabs defaultValue="deal">
            <TabsList className="w-full">
              <TabsTrigger value="deal" className="flex-1">
                Negócio
              </TabsTrigger>
              <TabsTrigger value="costs" className="flex-1">
                Custos da venda
              </TabsTrigger>
            </TabsList>

            <TabsContent value="deal" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cliente cadastrado</Label>
                  <Select value={clientId} onValueChange={handleClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Novo cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Novo cliente</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sale-client">Nome do cliente</Label>
                  <Input
                    id="sale-client"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sale-company">Empresa</Label>
                  <Input
                    id="sale-company"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Opcional"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sale-date">Data da venda</Label>
                  <Input
                    id="sale-date"
                    type="date"
                    value={saleDate}
                    onChange={(event) => setSaleDate(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Closer</Label>
                  <Select value={closerId} onValueChange={setCloserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informado</SelectItem>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>SDR</Label>
                  <Select value={sdrId} onValueChange={setSdrId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informado</SelectItem>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Origem do lead</Label>
                  <Select
                    value={leadSource}
                    onValueChange={(value) => setLeadSource(value as LeadSource)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Não informada" />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsFrom(LEAD_SOURCE_LABEL).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lead-date">Entrada do lead</Label>
                  <Input
                    id="lead-date"
                    type="date"
                    value={leadCreatedAt}
                    onChange={(event) => setLeadCreatedAt(event.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Permite medir os dias até fechar.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

                {hasRecurrence && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-mrr">Mensalidade (MRR)</Label>
                      <MoneyInput id="sale-mrr" value={mrrCents} onChange={setMrrCents} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-months">Meses de contrato</Label>
                      <Input
                        id="sale-months"
                        type="number"
                        min={1}
                        value={contractMonths}
                        onChange={(event) => setContractMonths(Number(event.target.value))}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="sale-setup">Implantação / setup</Label>
                  <MoneyInput id="sale-setup" value={setupCents} onChange={setSetupCents} />
                </div>

                {!hasRecurrence && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-oneoff">Valor do projeto</Label>
                      <MoneyInput id="sale-oneoff" value={oneOffCents} onChange={setOneOffCents} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-installments">Parcelas</Label>
                      <Input
                        id="sale-installments"
                        type="number"
                        min={1}
                        value={installments}
                        onChange={(event) => setInstallments(Number(event.target.value))}
                      />
                    </div>
                  </>
                )}

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

                <div className="space-y-1.5">
                  <Label htmlFor="closer-commission">Comissão closer (%)</Label>
                  <Input
                    id="closer-commission"
                    type="number"
                    min={0}
                    step={0.5}
                    value={closerCommission}
                    onChange={(event) => setCloserCommission(Number(event.target.value))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sdr-commission">Comissão SDR (%)</Label>
                  <Input
                    id="sdr-commission"
                    type="number"
                    min={0}
                    step={0.5}
                    value={sdrCommission}
                    onChange={(event) => setSdrCommission(Number(event.target.value))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(value) => setStatus(value as SaleStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsFrom(SALE_STATUS_LABEL).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sale-notes">Observações</Label>
                <Textarea
                  id="sale-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-md border border-border bg-surface-1 p-3">
                <Checkbox
                  checked={generateReceivables}
                  onCheckedChange={(checked) => setGenerateReceivables(checked === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Gerar títulos a receber</span>
                  <span className="block text-xs text-muted-foreground">
                    {hasRecurrence
                      ? `${setupCents > 0 ? '1 título de implantação + ' : ''}${months} mensalidades`
                      : `${Math.max(1, installments)} ${installments > 1 ? 'parcelas' : 'parcela'}`}
                    , a partir de {saleDate.split('-').reverse().join('/')}.
                  </span>
                </span>
              </label>
            </TabsContent>

            <TabsContent value="costs" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Os custos atribuídos aqui alimentam o CAC individual, o ROI e a margem desta venda.
                A comissão é calculada sozinha a partir dos percentuais da aba anterior.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cost-ads">Investimento em anúncios</Label>
                  <MoneyInput id="cost-ads" value={adsCents} onChange={setAdsCents} />
                </div>
                <div className="space-y-1.5">
                  <Label>Comissões (calculada)</Label>
                  <Input value={formatMoney(commissionCents)} readOnly className="text-right tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-platform">Taxa de plataforma</Label>
                  <MoneyInput
                    id="cost-platform"
                    value={platformFeeCents}
                    onChange={setPlatformFeeCents}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-operational">Custos operacionais</Label>
                  <MoneyInput
                    id="cost-operational"
                    value={operationalCents}
                    onChange={setOperationalCents}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-team">Horas da equipe</Label>
                  <MoneyInput id="cost-team" value={teamHoursCents} onChange={setTeamHoursCents} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-freelancers">Freelancers</Label>
                  <MoneyInput
                    id="cost-freelancers"
                    value={freelancersCents}
                    onChange={setFreelancersCents}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-production">Produção</Label>
                  <MoneyInput
                    id="cost-production"
                    value={productionCents}
                    onChange={setProductionCents}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-travel">Deslocamento</Label>
                  <MoneyInput id="cost-travel" value={travelCents} onChange={setTravelCents} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-other">Outros</Label>
                  <MoneyInput id="cost-other" value={otherCents} onChange={setOtherCents} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Resumo sempre visível: mostra o efeito de cada campo em tempo real. */}
          <div className="mt-4 rounded-md border border-border bg-surface-1 p-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Metric label="Valor do contrato" value={formatMoney(amountCents)} />
              <Metric label="Custo total" value={formatMoney(totalCostCents)} />
              <Metric
                label="Lucro líquido"
                value={formatMoney(netProfitCents)}
                tone={netProfitCents >= 0 ? 'positive' : 'negative'}
              />
              <Metric label="Margem" value={margin != null ? formatPercent(margin) : '—'} />
              <Metric label="CAC" value={formatMoney(acquisitionCents)} />
              <Metric label="ROAS" value={roas != null ? formatMultiple(roas) : '—'} />
              <Metric
                label="Payback"
                value={paybackMonths != null ? `${paybackMonths.toFixed(1)} meses` : '—'}
              />
              <Metric label="MRR" value={formatMoney(hasRecurrence ? mrrCents : 0)} />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createSale.isPending}>
              Registrar venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          'font-medium tabular-nums ' +
          (tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : '')
        }
      >
        {value}
      </p>
    </div>
  )
}
