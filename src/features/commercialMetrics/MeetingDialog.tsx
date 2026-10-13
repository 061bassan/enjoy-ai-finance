import * as React from 'react'
import { toast } from 'sonner'
import { data } from '@/data'
import {
  LEAD_SOURCE_LABEL,
  MEETING_STATUS_LABEL,
  SALE_PRODUCT_LABEL,
  optionsFrom,
} from '@/data/enums'
import type { CommercialMeeting, LeadSource, MeetingStatus, Sale, SaleProduct } from '@/data/types'
import { formatDate, type IsoDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { namesMatch } from '@/domain/commercialMetrics'
import { useSession } from '@/app/session'
import { DateField } from '@/components/DateField'
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
import { useCreate, useUpdate } from '@/hooks/data'
import { LabelEditor } from '@/components/LabelEditor'

const AUTO = '__auto__'
const NONE = '__none__'

/** Valores já usados num campo, para sugerir enquanto digita — a planilha tinha 3 grafias por criativo. */
function distinctValues(
  meetings: readonly CommercialMeeting[],
  pick: (m: CommercialMeeting) => string | null | undefined,
) {
  const seen = new Map<string, string>()
  for (const meeting of meetings) {
    const value = pick(meeting)?.trim()
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Cadastro de reunião — uma linha da planilha "Métricas Comercial".
 *
 * A venda NÃO é escolhida aqui por padrão: as métricas a encontram pelo nome.
 * O seletor de venda existe só para quando o nome não bate ("Leticia" × a
 * empresa dela) — e mostra, enquanto se digita, qual venda o nome já encontra.
 */
export function MeetingDialog({
  open,
  onOpenChange,
  meeting,
  meetings,
  sales,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meeting: CommercialMeeting | null
  meetings: readonly CommercialMeeting[]
  sales: readonly Sale[]
  defaultDate: IsoDate
}) {
  const { session } = useSession()
  const create = useCreate('commercialMeetings', data.commercialMeetings)
  const update = useUpdate('commercialMeetings', data.commercialMeetings)

  const [date, setDate] = React.useState(defaultDate)
  const [name, setName] = React.useState('')
  const [status, setStatus] = React.useState<MeetingStatus>('agendada')
  const [product, setProduct] = React.useState<SaleProduct | typeof NONE>(NONE)
  const [proposal, setProposal] = React.useState('')
  const [hostName, setHostName] = React.useState('')
  const [creative, setCreative] = React.useState('')
  // Padrão tráfego pago: é o funil principal e o que a planilha acompanhava.
  const [source, setSource] = React.useState<LeadSource>('trafego_pago')
  const [saleId, setSaleId] = React.useState<string>(AUTO)
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setDate(meeting?.date ?? defaultDate)
    setName(meeting?.name ?? '')
    setStatus(meeting?.status ?? 'agendada')
    setProduct(meeting?.product ?? NONE)
    setProposal(meeting?.proposal ?? '')
    setHostName(meeting?.hostName ?? '')
    setCreative(meeting?.creative ?? '')
    setSource(meeting?.source ?? 'trafego_pago')
    setSaleId(meeting?.saleId ?? AUTO)
    setNotes(meeting?.notes ?? '')
  }, [open, meeting, defaultDate])

  const hosts = React.useMemo(() => distinctValues(meetings, (m) => m.hostName), [meetings])
  const creatives = React.useMemo(() => distinctValues(meetings, (m) => m.creative), [meetings])
  const sortedSales = React.useMemo(
    () => [...sales].sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    [sales],
  )
  // Prévia do casamento automático: o que o nome digitado já encontra.
  const nameMatches = React.useMemo(
    () =>
      name.trim().length >= 3 ? sortedSales.filter((s) => namesMatch(name, s.clientName)) : [],
    [name, sortedSales],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    if (!name.trim()) {
      toast.error('Informe o nome do lead.')
      return
    }

    const fields = {
      date,
      name: name.trim(),
      status,
      product: product === NONE ? null : product,
      proposal: proposal.trim() || null,
      hostName: hostName.trim() || null,
      creative: creative.trim() || null,
      source,
      saleId: saleId === AUTO ? null : saleId,
      notes: notes.trim() || null,
    }

    try {
      if (meeting) {
        await update.mutateAsync({ id: meeting.id, patch: fields })
        toast.success('Reunião atualizada.')
      } else {
        await create.mutateAsync({
          workspaceId: session.workspaceId,
          createdBy: session.user.id,
          ...fields,
        })
        toast.success('Reunião registrada.')
      }
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar a reunião.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{meeting ? 'Editar reunião' : 'Nova reunião'}</DialogTitle>
          <DialogDescription>
            Uma linha por call com lead. A venda é encontrada pelo nome quando for cadastrada em
            Vendas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-name">Nome do lead</Label>
              <Input
                id="meeting-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Data da call</Label>
              <DateField id="meeting-date" value={date} onChange={setDate} />
            </div>

            <div className="space-y-1.5">
              <span className="flex items-center gap-1">
                <Label>Status</Label>
                <LabelEditor group="meetingStatus" />
              </span>
              <Select value={status} onValueChange={(value) => setStatus(value as MeetingStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(MEETING_STATUS_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1">
                <Label>Produto</Label>
                <LabelEditor group="saleProduct" />
              </span>
              <Select value={product} onValueChange={(value) => setProduct(value as SaleProduct)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não definido</SelectItem>
                  {optionsFrom(SALE_PRODUCT_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meeting-proposal">Proposta</Label>
              <Input
                id="meeting-proposal"
                value={proposal}
                onChange={(event) => setProposal(event.target.value)}
                placeholder='Ex.: "PEAP 9k", "Start + tráfego"'
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meeting-host">Quem fez a call</Label>
              <Input
                id="meeting-host"
                list="meeting-hosts"
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
              />
              <datalist id="meeting-hosts">
                {hosts.map((host) => (
                  <option key={host} value={host} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1">
                <Label>Origem</Label>
                <LabelEditor group="leadSource" />
              </span>
              <Select value={source} onValueChange={(value) => setSource(value as LeadSource)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(LEAD_SOURCE_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {source === 'trafego_pago'
                  ? 'Entra no funil do tráfego: agendamento, custo por reunião, win rate e CAC.'
                  : 'Conta nas reuniões e vendas do mês, mas fica fora das taxas do tráfego — não veio de lead nem de verba de anúncio.'}
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meeting-creative">
                {source === 'trafego_pago'
                  ? 'Criativo que gerou a call'
                  : source === 'indicacao'
                    ? 'Quem indicou'
                    : 'Detalhe da origem'}
              </Label>
              <Input
                id="meeting-creative"
                list="meeting-creatives"
                value={creative}
                onChange={(event) => setCreative(event.target.value)}
                placeholder={
                  source === 'trafego_pago'
                    ? 'Ex.: Depoimento Rafaela V2'
                    : source === 'indicacao'
                      ? 'Ex.: cliente Kyoto'
                      : 'Opcional'
                }
              />
              <datalist id="meeting-creatives">
                {creatives.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Venda</Label>
              <Select value={saleId} onValueChange={setSaleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Automático — encontrar pelo nome</SelectItem>
                  {sortedSales.map((sale) => (
                    <SelectItem key={sale.id} value={sale.id}>
                      {sale.clientName} · {formatDate(sale.saleDate)} ·{' '}
                      {formatMoney(sale.amountCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {saleId === AUTO && (
                <p className="text-[11px] text-muted-foreground">
                  {nameMatches.length
                    ? `O nome já encontra: ${nameMatches
                        .slice(0, 3)
                        .map((s) => `${s.clientName} (${formatDate(s.saleDate)})`)
                        .join(', ')}. Conta como venda se for até 120 dias depois da call.`
                    : 'Nenhuma venda com esse nome ainda. Quando for cadastrada em Vendas, entra sozinha.'}
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="meeting-notes">Observações</Label>
              <Textarea
                id="meeting-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {meeting ? 'Salvar' : 'Registrar reunião'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
