import * as React from 'react'
import { toast } from 'sonner'
import { formatMoney, formatMultiple, formatPercent, percentOf } from '@/lib/money'
import { addMonths, formatDate, fromIsoDate, toIsoDate, today } from '@/lib/date'
import {
  LEAD_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
  SALE_PRODUCT_LABEL,
  SALE_STATUS_LABEL,
  optionsFrom,
} from '@/data/enums'
import type {
  Client,
  LeadSource,
  PaymentMethod,
  Profile,
  Sale,
  SaleCost,
  SaleModel,
  SaleProduct,
  SaleStatus,
} from '@/data/types'
import { useSession } from '@/app/session'
import { useAccounts, useCreate, useCreateSale, useSettleBill, useUpdateSale } from '@/hooks/data'
import { data } from '@/data'
import { nameTokens } from '@/domain/commercialMetrics'
import { buildReceivables } from '@/data/receivables'
import { commissionBase } from '@/domain/sales'
import { DateField } from '@/components/DateField'
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
import { LabelEditor } from '@/components/LabelEditor'

const NONE = '__none__'

type PayPlan = 'full' | 'installments' | 'entry'

const PAY_PLAN_LABEL: Record<PayPlan, string> = {
  full: 'À vista (pagamento completo)',
  installments: 'Parcelado, sem entrada',
  entry: 'Entrada + restante',
}

/**
 * Registro de venda — criação e edição no mesmo formulário.
 *
 * Ao criar, os títulos a receber nascem junto: setup vira um título, MRR vira
 * um por mês de contrato, e modelos sem recorrência dividem o valor nas
 * parcelas. Sem isso, alguém teria que lançar as cobranças à mão e o previsto
 * do fluxo de caixa nunca bateria com o que foi vendido.
 *
 * Um formulário só para os dois modos é deliberado: duplicá-lo garantiria que
 * a versão de edição ficasse para trás na primeira regra nova de comissão ou
 * de parcelamento, e a pessoa veria contas diferentes para a mesma venda.
 */
export function SaleDialog({
  open,
  onOpenChange,
  clients,
  profiles,
  sale = null,
  saleCost = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  profiles: Profile[]
  /** Quando presente, o diálogo edita em vez de criar. */
  sale?: Sale | null
  saleCost?: SaleCost | null
}) {
  const { session } = useSession()
  const createSale = useCreateSale()
  const updateSale = useUpdateSale()
  const settleBill = useSettleBill()
  const createClient = useCreate('clients', data.clients)
  const { data: accounts = [] } = useAccounts()
  const isEditing = sale != null

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

  // Produto e forma de pagamento
  const [product, setProduct] = React.useState<SaleProduct | ''>('')
  /** TCV: à vista (um pagamento), parcelado (sem entrada) ou entrada + restante parcelado. */
  const [payPlan, setPayPlan] = React.useState<PayPlan>('full')
  const [downPaymentCents, setDownPaymentCents] = React.useState(0)
  const [downPaymentDate, setDownPaymentDate] = React.useState(today())
  const [firstDueDate, setFirstDueDate] = React.useState(today())
  /** O 1º recebimento já caiu na conta: baixa o título e lança em Entradas e saídas. */
  const [alreadyReceived, setAlreadyReceived] = React.useState(false)
  const [receiveAccountId, setReceiveAccountId] = React.useState<string>(NONE)

  // Custos da venda
  const [adsCents, setAdsCents] = React.useState(0)
  const [operationalCents, setOperationalCents] = React.useState(0)
  const [teamHoursCents, setTeamHoursCents] = React.useState(0)
  const [freelancersCents, setFreelancersCents] = React.useState(0)
  const [productionCents, setProductionCents] = React.useState(0)
  const [platformFeeCents, setPlatformFeeCents] = React.useState(0)
  const [travelCents, setTravelCents] = React.useState(0)
  const [otherCents, setOtherCents] = React.useState(0)

  /**
   * Preenche o formulário toda vez que ele abre.
   *
   * Criar zera; editar carrega a venda. Fica num efeito só porque o estado a
   * ser preenchido é exatamente o mesmo — dois efeitos separados divergiriam
   * assim que um campo novo entrasse em apenas um deles.
   */
  React.useEffect(() => {
    if (!open) return

    if (!sale) {
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
      setProduct('')
      setPayPlan('full')
      setDownPaymentCents(0)
      setDownPaymentDate(today())
      setFirstDueDate(today())
      setAlreadyReceived(false)
      setReceiveAccountId(NONE)
      setAdsCents(0)
      setOperationalCents(0)
      setTeamHoursCents(0)
      setFreelancersCents(0)
      setProductionCents(0)
      setPlatformFeeCents(0)
      setTravelCents(0)
      setOtherCents(0)
      return
    }

    setClientId(sale.clientId ?? NONE)
    setClientName(sale.clientName)
    setCompany(sale.company ?? '')
    setSaleDate(sale.saleDate)
    setLeadCreatedAt(sale.leadCreatedAt ?? '')
    setCloserId(sale.closerId ?? NONE)
    setSdrId(sale.sdrId ?? NONE)
    setLeadSource(sale.leadSource ?? '')
    setModel(sale.model)
    setMrrCents(sale.mrrCents)
    setSetupCents(sale.setupCents)
    // O projeto sem recorrência não é guardado num campo próprio: é o que
    // sobra do contrato depois do setup. Reconstituir aqui evita duplicar o
    // valor no banco e as duas versões saírem de sincronia.
    setOneOffCents(sale.mrrCents > 0 ? 0 : Math.max(0, sale.amountCents - sale.setupCents))
    setContractMonths(sale.contractMonths ?? 12)
    setInstallments(sale.installments || 1)
    setPaymentMethod(sale.paymentMethod ?? '')
    setCloserCommission(sale.closerCommissionPercent)
    setSdrCommission(sale.sdrCommissionPercent)
    setStatus(sale.status)
    setNotes(sale.notes ?? '')
    // Refazer títulos é destrutivo: nunca vem marcado por padrão na edição.
    setGenerateReceivables(false)
    setProduct(sale.product ?? '')
    {
      // Venda antiga não guardava a entrada: sem ela, o que existia era "tudo
      // parcelado a partir da data da venda" — que é um TCV sem entrada.
      const total = Math.max(0, sale.amountCents - sale.setupCents)
      const down = sale.downPaymentCents ?? 0
      setPayPlan(
        down > 0 && down < total
          ? 'entry'
          : down === 0 && (sale.installments || 1) > 1
            ? 'installments'
            : 'full',
      )
      setDownPaymentCents(down)
    }
    setDownPaymentDate(sale.downPaymentDate ?? sale.saleDate)
    setFirstDueDate(sale.firstDueDate ?? sale.saleDate)
    setAlreadyReceived(false)
    setReceiveAccountId(NONE)
    setAdsCents(saleCost?.adsCents ?? 0)
    setOperationalCents(saleCost?.operationalCents ?? 0)
    setTeamHoursCents(saleCost?.teamHoursCents ?? 0)
    setFreelancersCents(saleCost?.freelancersCents ?? 0)
    setProductionCents(saleCost?.productionCents ?? 0)
    setPlatformFeeCents(saleCost?.platformFeeCents ?? 0)
    setTravelCents(saleCost?.travelCents ?? 0)
    setOtherCents(saleCost?.otherCents ?? 0)
  }, [open, sale, saleCost])

  const hasRecurrence = model === 'mrr'
  // Meses de contrato (MRR) ou duração do projeto (TCV) — guardado nos dois casos.
  const months = Math.max(1, contractMonths || 1)

  // TCV: tudo que o contrato vale ao longo da vida dele.
  const amountCents = hasRecurrence ? mrrCents * months + setupCents : setupCents + oneOffCents

  /**
   * Como a venda é paga, no formato que `buildReceivables` lê. MRR só precisa
   * do 1º pagamento; no TCV o plano escolhido vira entrada, parcelas e datas.
   * À vista é "entrada = total": um título só, na data do pagamento.
   */
  const payment = hasRecurrence
    ? {
        downPaymentCents: null,
        downPaymentDate: null,
        firstDueDate,
        installments: Math.max(1, installments),
      }
    : payPlan === 'full'
      ? {
          downPaymentCents: oneOffCents,
          downPaymentDate,
          firstDueDate: downPaymentDate,
          installments: 1,
        }
      : payPlan === 'installments'
        ? {
            downPaymentCents: null,
            downPaymentDate: null,
            firstDueDate,
            installments: Math.max(1, installments),
          }
        : {
            downPaymentCents,
            downPaymentDate,
            firstDueDate,
            installments: Math.max(1, installments),
          }
  const balanceCents = Math.max(0, oneOffCents - downPaymentCents)

  /** Prévia exata do que vai para "A receber" — a mesma função que o salvamento usa. */
  const schedule = React.useMemo(() => {
    if (amountCents <= 0) return []
    let seq = 0
    const draft = {
      id: 'preview',
      workspaceId: session?.workspaceId ?? '',
      clientId: null,
      clientName: clientName.trim() || 'Cliente',
      saleDate,
      closerId: null,
      sdrId: null,
      leadSource: null,
      model,
      product: product || null,
      amountCents,
      mrrCents: hasRecurrence ? mrrCents : 0,
      setupCents,
      contractMonths: months,
      paymentMethod: null,
      closerCommissionPercent: 0,
      sdrCommissionPercent: 0,
      status: 'pendente' as const,
      createdBy: '',
      createdAt: '',
      updatedAt: '',
      ...payment,
    }
    return buildReceivables(
      draft,
      payment.firstDueDate,
      (bill) => ({ ...bill, id: `p${++seq}`, createdAt: '', updatedAt: '' }),
      'preview',
    )
    // `payment` é recriado a cada render; as dependências reais são os campos dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amountCents,
    clientName,
    saleDate,
    model,
    product,
    mrrCents,
    setupCents,
    months,
    hasRecurrence,
    payPlan,
    downPaymentCents,
    downPaymentDate,
    firstDueDate,
    installments,
    oneOffCents,
    session?.workspaceId,
  ])

  const receiveAccount = receiveAccountId === NONE ? accounts[0]?.id : receiveAccountId

  const commissionBaseCents = commissionBase({
    mrrCents: hasRecurrence ? mrrCents : 0,
    setupCents,
    amountCents,
  })
  const commissionCents =
    percentOf(commissionBaseCents, closerCommission) + percentOf(commissionBaseCents, sdrCommission)

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

  /**
   * Com entrada, o restante começa um mês depois dela — o padrão de quase todo
   * contrato. Só ajusta quando a data do restante ainda não passou da entrada,
   * para não desfazer uma data que a pessoa já escolheu.
   */
  function choosePayPlan(plan: PayPlan) {
    setPayPlan(plan)
    if (plan === 'entry' && firstDueDate <= downPaymentDate) {
      setFirstDueDate(toIsoDate(addMonths(fromIsoDate(downPaymentDate), 1)))
    }
  }

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
    if (!product) {
      toast.error('Escolha o produto vendido.')
      return
    }
    if (!hasRecurrence && payPlan === 'entry') {
      if (downPaymentCents <= 0) {
        toast.error('Informe o valor da entrada.')
        return
      }
      if (downPaymentCents >= oneOffCents) {
        toast.error('A entrada cobre o valor todo — escolha "À vista".')
        return
      }
    }
    if (!isEditing && alreadyReceived && !receiveAccount) {
      toast.error('Cadastre uma conta em Configurações para registrar o recebimento.')
      return
    }

    // Toda venda pertence a um cliente. Sem isto, venda com "Novo cliente"
    // ficava fora da carteira, da meta "Novos clientes", do churn e da receita
    // por cliente — só a conversão de lead criava o cliente. Reaproveita o
    // cliente de MESMO nome (sem acento/maiúscula) antes de criar outro, para a
    // carteira não duplicar quem já existe.
    let resolvedClientId = clientId === NONE ? null : clientId
    if (!resolvedClientId) {
      const key = nameTokens(clientName).join(' ')
      const existing = clients.find((client) => nameTokens(client.name).join(' ') === key)
      if (existing) {
        resolvedClientId = existing.id
      } else {
        try {
          const created = await createClient.mutateAsync({
            workspaceId: session.workspaceId,
            name: clientName.trim(),
            company: company.trim() || null,
            status: 'active',
            source: (leadSource || null) as LeadSource | null,
            startDate: saleDate,
          })
          resolvedClientId = created.id
        } catch {
          // Sem permissão de criar cliente (ou falha de rede): a venda sai do
          // mesmo jeito, como antes — melhor venda sem cliente que venda perdida.
          toast.warning('Venda salva sem cliente vinculado — cadastre o cliente em Clientes.')
        }
      }
    }

    const fields = {
      clientId: resolvedClientId,
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
      contractMonths: months,
      paymentMethod: (paymentMethod || null) as PaymentMethod | null,
      product: product || null,
      ...payment,
      closerCommissionPercent: closerCommission,
      sdrCommissionPercent: sdrCommission,
      status,
      leadCreatedAt: leadCreatedAt || null,
      notes: notes.trim() || null,
    }

    const costs = {
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
    }

    try {
      if (sale) {
        const result = await updateSale.mutateAsync({
          saleId: sale.id,
          patch: fields,
          costs,
          regenerateReceivables: generateReceivables,
          firstDueDate: payment.firstDueDate,
        })

        toast.success(
          result.bills.length
            ? `Venda atualizada — ${result.bills.length} títulos refeitos.`
            : 'Venda atualizada.',
        )
        onOpenChange(false)
        return
      }

      const result = await createSale.mutateAsync({
        sale: {
          workspaceId: session.workspaceId,
          ...fields,
          createdBy: session.user.id,
        },
        costs,
        generateReceivables,
        firstDueDate: payment.firstDueDate,
      })

      // O 1º recebimento já caiu: baixa o título pela MESMA operação do botão
      // "Registrar recebimento" — vira entrada no caixa com o rastro de sempre.
      // Entrada/à vista no TCV; 1ª mensalidade no MRR.
      let received = false
      if (alreadyReceived && receiveAccount && result.bills.length) {
        const first = hasRecurrence
          ? result.bills.find((bill) => bill.installmentNumber === 1)
          : (result.bills.find((bill) => bill.description.startsWith('Entrada')) ??
            result.bills.find((bill) => bill.description.endsWith('(à vista)')) ??
            [...result.bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0])
        if (first) {
          try {
            await settleBill.mutateAsync({
              billId: first.id,
              amountCents: first.amountCents,
              // Recebido hoje se o vencimento ainda não chegou; senão, no vencimento.
              date: first.dueDate > today() ? today() : first.dueDate,
              accountId: receiveAccount,
              actorId: session.user.id,
              notes: 'Recebido no cadastro da venda.',
            })
            received = true
          } catch (cause) {
            toast.error(
              `Venda salva, mas o recebimento não foi registrado: ${
                cause instanceof Error ? cause.message : 'erro desconhecido'
              }. Registre em "A receber".`,
            )
          }
        }
      }

      toast.success(
        result.bills.length
          ? `Venda registrada — ${result.bills.length} títulos a receber gerados${
              received ? ', o 1º já recebido' : ''
            }.`
          : 'Venda registrada.',
      )
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar a venda.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar venda' : 'Nova venda'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Os indicadores recalculam sozinhos ao salvar. Os títulos a receber só mudam se você pedir explicitamente abaixo.'
              : 'Ao salvar, os títulos a receber são gerados automaticamente e todos os indicadores — MRR, TCV, CAC, ROI e forecast — passam a considerar esta venda.'}
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: sem ele, um texto que não quebra (o cronograma) alarga o diálogo inteiro. */}
        <form onSubmit={submit} className="min-w-0">
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
                  <DateField id="sale-date" value={saleDate} onChange={setSaleDate} />
                </div>
              </div>

              <Separator />

              {/* Produto e modalidade: o que foi vendido e como ele é cobrado. */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Produto e modalidade</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1">
                      <Label>Produto</Label>
                      <LabelEditor group="saleProduct" />
                    </span>
                    <ChoiceGroup
                      value={product}
                      onChange={(value) => setProduct(value as SaleProduct)}
                      options={optionsFrom(SALE_PRODUCT_LABEL)}
                      ariaLabel="Produto"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modalidade</Label>
                    <ChoiceGroup
                      value={model === 'mrr' ? 'mrr' : 'tcv'}
                      onChange={(value) =>
                        // Venda antiga com outro modelo (projeto, consultoria…) mantém o
                        // dela enquanto continuar não recorrente.
                        setModel(
                          value === 'mrr'
                            ? 'mrr'
                            : sale && sale.model !== 'mrr'
                              ? sale.model
                              : 'tcv',
                        )
                      }
                      options={[
                        { value: 'tcv', label: 'TCV' },
                        { value: 'mrr', label: 'MRR' },
                      ]}
                      ariaLabel="Modalidade"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {hasRecurrence
                        ? 'MRR: mensalidade cobrada todo mês, por um número de meses.'
                        : 'TCV: valor total do projeto, à vista ou com entrada + restante.'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Pagamento: vira o cronograma de "A receber" logo abaixo. */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Pagamento</h3>

                {hasRecurrence ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-mrr">Valor da mensalidade</Label>
                      <MoneyInput id="sale-mrr" value={mrrCents} onChange={setMrrCents} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-months">Quantos meses</Label>
                      <Input
                        id="sale-months"
                        type="number"
                        min={1}
                        value={contractMonths}
                        onChange={(event) => setContractMonths(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-first-due">1º pagamento</Label>
                      <DateField
                        id="sale-first-due"
                        value={firstDueDate}
                        onChange={setFirstDueDate}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-setup">Implantação (opcional)</Label>
                      <MoneyInput id="sale-setup" value={setupCents} onChange={setSetupCents} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="sale-oneoff">Valor total do projeto</Label>
                        <MoneyInput
                          id="sale-oneoff"
                          value={oneOffCents}
                          onChange={setOneOffCents}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="sale-months">Meses do projeto</Label>
                        <Input
                          id="sale-months"
                          type="number"
                          min={1}
                          value={contractMonths}
                          onChange={(event) => setContractMonths(Number(event.target.value))}
                        />
                      </div>
                      {/* Só aparece em venda antiga que tinha implantação separada. */}
                      {setupCents > 0 && (
                        <div className="space-y-1.5">
                          <Label htmlFor="sale-setup">Implantação</Label>
                          <MoneyInput id="sale-setup" value={setupCents} onChange={setSetupCents} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Como foi pago</Label>
                      <ChoiceGroup
                        value={payPlan}
                        onChange={(value) => choosePayPlan(value as PayPlan)}
                        options={optionsFrom(PAY_PLAN_LABEL)}
                        ariaLabel="Como foi pago"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {payPlan === 'full' && (
                        <div className="space-y-1.5">
                          <Label htmlFor="sale-pay-date">Data do pagamento</Label>
                          <DateField
                            id="sale-pay-date"
                            value={downPaymentDate}
                            onChange={setDownPaymentDate}
                          />
                        </div>
                      )}

                      {payPlan === 'entry' && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="sale-down">Valor da entrada</Label>
                            <MoneyInput
                              id="sale-down"
                              value={downPaymentCents}
                              onChange={setDownPaymentCents}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="sale-down-date">Data da entrada</Label>
                            <DateField
                              id="sale-down-date"
                              value={downPaymentDate}
                              onChange={setDownPaymentDate}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Valor restante</Label>
                            <Input
                              value={formatMoney(balanceCents)}
                              readOnly
                              className="tabular-nums"
                            />
                          </div>
                        </>
                      )}

                      {payPlan !== 'full' && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="sale-installments">
                              {payPlan === 'entry' ? 'Restante em quantas vezes' : 'Parcelas'}
                            </Label>
                            <Input
                              id="sale-installments"
                              type="number"
                              min={1}
                              value={installments}
                              onChange={(event) => setInstallments(Number(event.target.value))}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="sale-first-due">
                              {payPlan === 'entry'
                                ? installments > 1
                                  ? '1ª parcela do restante'
                                  : 'Data do restante'
                                : '1ª parcela'}
                            </Label>
                            <DateField
                              id="sale-first-due"
                              value={firstDueDate}
                              onChange={setFirstDueDate}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <Schedule bills={schedule} />

                {!isEditing && generateReceivables && schedule.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                    <label className="flex flex-1 items-start gap-2.5">
                      <Checkbox
                        checked={alreadyReceived}
                        onCheckedChange={(checked) => setAlreadyReceived(checked === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {hasRecurrence
                            ? '1ª mensalidade já recebida'
                            : payPlan === 'full'
                              ? 'Pagamento já recebido'
                              : payPlan === 'entry'
                                ? 'Entrada já recebida'
                                : '1ª parcela já recebida'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Dá baixa no título e lança a entrada em Entradas e saídas.
                        </span>
                      </span>
                    </label>
                    {alreadyReceived && (
                      <Select value={receiveAccount ?? NONE} onValueChange={setReceiveAccountId}>
                        <SelectTrigger
                          className="w-full sm:w-[200px]"
                          aria-label="Conta que recebeu"
                        >
                          <SelectValue placeholder="Conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </section>

              <Separator />
              <h3 className="text-sm font-medium">Comercial</h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <span className="flex items-center gap-1">
                    <Label>Origem do lead</Label>
                    <LabelEditor group="leadSource" />
                  </span>
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
                  <DateField
                    id="lead-date"
                    value={leadCreatedAt}
                    onChange={setLeadCreatedAt}
                    clearable
                    onClear={() => setLeadCreatedAt('')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Permite medir os dias até fechar.
                  </p>
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
                  <span className="flex items-center gap-1">
                    <Label>Status</Label>
                    <LabelEditor group="saleStatus" />
                  </span>
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
                  <span className="block text-sm font-medium">
                    {isEditing ? 'Refazer os títulos a receber' : 'Gerar títulos a receber'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {schedule.length} {schedule.length === 1 ? 'título' : 'títulos'}, conforme o
                    cronograma acima.
                  </span>
                  {isEditing && (
                    <span className="mt-1 block text-xs text-negative">
                      Apaga os títulos atuais desta venda e gera novos. Só é possível se nenhum
                      deles tiver recebimento registrado.
                    </span>
                  )}
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
                  <Input
                    value={formatMoney(commissionCents)}
                    readOnly
                    className="text-right tabular-nums"
                  />
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
            <Button type="submit" disabled={createSale.isPending || updateSale.isPending}>
              {isEditing ? 'Salvar alterações' : 'Registrar venda'}
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

/**
 * Escolha única em botões lado a lado — produto, modalidade, forma de
 * pagamento. Com 2–3 opções, ver todas de uma vez é mais rápido que abrir um
 * select, e a escolha atual fica visível sem clicar.
 */
function ChoiceGroup({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={
              'rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
              (selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-muted')
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Cronograma que vai para "A receber" — calculado pela mesma regra que salva. */
function Schedule({
  bills,
}: {
  bills: { id: string; dueDate: string; description: string; amountCents: number }[]
}) {
  if (!bills.length) return null
  const total = bills.reduce((sum, bill) => sum + bill.amountCents, 0)
  const visible = bills.length > 6 ? [...bills.slice(0, 5), null, bills[bills.length - 1]!] : bills
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-surface-1 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Vai para "A receber" ({bills.length} {bills.length === 1 ? 'título' : 'títulos'})
      </p>
      <ul className="space-y-1 text-sm">
        {visible.map((bill, index) =>
          bill ? (
            <li key={bill.id} className="flex items-baseline gap-3">
              <span className="w-[84px] shrink-0 tabular-nums text-muted-foreground">
                {formatDate(bill.dueDate)}
              </span>
              <span className="min-w-0 flex-1 truncate">{bill.description}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatMoney(bill.amountCents)}
              </span>
            </li>
          ) : (
            <li key={`gap-${index}`} className="pl-[96px] text-xs text-muted-foreground">
              … mais {bills.length - 6} {bills.length - 6 === 1 ? 'título' : 'títulos'}
            </li>
          ),
        )}
      </ul>
      <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
      </div>
    </div>
  )
}
