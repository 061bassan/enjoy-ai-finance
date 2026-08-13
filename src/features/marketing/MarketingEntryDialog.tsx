import * as React from 'react'
import { toast } from 'sonner'
import { data } from '@/data'
import type { MarketingChannel, MarketingEntry } from '@/data/types'
import {
  MARKETING_CHANNEL_DESCRIPTION,
  MARKETING_CHANNEL_LABEL,
  MARKETING_CHANNELS,
} from '@/data/enums'
import { formatMonthLong, today, type IsoDate } from '@/lib/date'
import { formatMoney, formatNumber } from '@/lib/money'
import { useSession } from '@/app/session'
import { MonthField } from '@/components/DateField'
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
import { useCreate, useUpdate } from '@/hooks/data'

/** Primeiro dia do mês de uma data — o formato em que o mês é guardado. */
function firstDayOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`
}

const EMPTY_INVESTMENT = {
  adsCents: 0,
  agencyCents: 0,
  creativeCents: 0,
  toolsCents: 0,
  otherCents: 0,
}

const EMPTY_VOLUME = { impressions: 0, clicks: 0, leads: 0 }

/**
 * Lançamento de marketing do mês.
 *
 * O formulário pede **exatamente** o que a plataforma de anúncios mostra no
 * relatório do mês: verba, impressões, cliques e leads. Nada de CPL, CAC ou
 * ROAS — esses saem da conta e pedir os dois seria convidar a divergência
 * entre o que foi digitado e o que o sistema calcula.
 */
export function MarketingEntryDialog({
  open,
  onOpenChange,
  entry = null,
  existing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando presente, corrige o lançamento em vez de criar outro. */
  entry?: MarketingEntry | null
  /** Lançamentos já existentes — usados para barrar mês+canal duplicado. */
  existing: readonly MarketingEntry[]
}) {
  const { session } = useSession()
  const create = useCreate('marketingEntries', data.marketingEntries)
  const update = useUpdate('marketingEntries', data.marketingEntries)
  const isEditing = entry != null

  const [month, setMonth] = React.useState<IsoDate>(() => firstDayOfMonth(today()))
  const [channel, setChannel] = React.useState<MarketingChannel>('meta_ads')
  const [investment, setInvestment] = React.useState(EMPTY_INVESTMENT)
  const [volume, setVolume] = React.useState(EMPTY_VOLUME)
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setMonth(firstDayOfMonth(entry?.month ?? today()))
    setChannel(entry?.channel ?? 'meta_ads')
    setInvestment({
      adsCents: entry?.adsCents ?? 0,
      agencyCents: entry?.agencyCents ?? 0,
      creativeCents: entry?.creativeCents ?? 0,
      toolsCents: entry?.toolsCents ?? 0,
      otherCents: entry?.otherCents ?? 0,
    })
    setVolume({
      impressions: entry?.impressions ?? 0,
      clicks: entry?.clicks ?? 0,
      leads: entry?.leads ?? 0,
    })
    setNotes(entry?.notes ?? '')
  }, [open, entry])

  const MONEY_FIELDS: { key: keyof typeof investment; label: string; hint?: string }[] = [
    { key: 'adsCents', label: 'Verba de anúncios', hint: 'O que foi para a plataforma.' },
    { key: 'agencyCents', label: 'Agência / gestor' },
    { key: 'creativeCents', label: 'Criativos' },
    { key: 'toolsCents', label: 'Ferramentas' },
    { key: 'otherCents', label: 'Outros' },
  ]

  const COUNT_FIELDS: { key: keyof typeof volume; label: string }[] = [
    { key: 'impressions', label: 'Impressões' },
    { key: 'clicks', label: 'Cliques' },
    { key: 'leads', label: 'Leads gerados' },
  ]

  const total =
    investment.adsCents +
    investment.agencyCents +
    investment.creativeCents +
    investment.toolsCents +
    investment.otherCents

  // Prévia ao vivo: quem digita a verba vê o CPL antes de salvar, que é o
  // número pelo qual ele decide manter ou cortar o canal.
  const cpl = volume.leads ? Math.round(total / volume.leads) : null

  /**
   * Mês + canal já lançado.
   *
   * Bloquear é mais honesto que somar em silêncio: dois lançamentos do mesmo
   * Meta Ads em agosto dobrariam o investimento e cortariam o CPL pela metade,
   * e ninguém descobriria olhando o cartão.
   */
  const duplicate = existing.find(
    (row) => row.id !== entry?.id && row.month === month && row.channel === channel,
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (duplicate) {
      toast.error(
        `${MARKETING_CHANNEL_LABEL[channel]} já foi lançado em ${formatMonthLong(duplicate.month)}. Edite o registro existente.`,
      )
      return
    }

    const payload = {
      month,
      channel,
      ...investment,
      ...volume,
      notes: notes.trim() || null,
    }

    try {
      if (entry) {
        await update.mutateAsync({ id: entry.id, patch: payload })
        toast.success('Lançamento atualizado.')
      } else {
        await create.mutateAsync({
          workspaceId: session.workspaceId,
          ...payload,
          createdBy: session.user.id,
        })
        toast.success('Investimento registrado.')
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
          <DialogTitle>
            {isEditing ? 'Editar investimento' : 'Registrar investimento do mês'}
          </DialogTitle>
          <DialogDescription>
            Um lançamento por canal, por mês. Estes números alimentam o CPL, o CAC, o ROAS e o
            custo por etapa do funil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="marketing-month">Mês</Label>
              {/*
                `MonthField`, não `<input type="month">`: o seletor nativo mora
                no shadow DOM e mantém azul, fonte e cantos do sistema em
                qualquer tema — o mesmo motivo que fez o produto ter calendário
                próprio. E é campo de MÊS, não de data: a verba é um fato
                mensal, e um seletor de dia convidaria a lançar "12/08", que
                viraria um segundo registro do mesmo mês.
              */}
              <MonthField id="marketing-month" value={month} onChange={setMonth} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="marketing-channel">Canal</Label>
              <Select
                value={channel}
                onValueChange={(value) => setChannel(value as MarketingChannel)}
              >
                <SelectTrigger id="marketing-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_CHANNELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MARKETING_CHANNEL_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MARKETING_CHANNEL_DESCRIPTION[channel]}
              </p>
            </div>
          </div>

          {duplicate && (
            <p className="rounded-md border border-border bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
              Já existe um lançamento de {MARKETING_CHANNEL_LABEL[channel]} em{' '}
              {formatMonthLong(duplicate.month)}. Feche e edite aquele registro — somar dois
              lançamentos do mesmo canal cortaria o CPL pela metade.
            </p>
          )}

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium">Investimento do mês</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {MONEY_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <MoneyInput
                    id={field.key}
                    value={investment[field.key]}
                    onChange={(cents) =>
                      setInvestment((current) => ({ ...current, [field.key]: cents }))
                    }
                  />
                  {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-1 text-sm font-medium">O que a mídia entregou</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Opcional. Deixe em zero o que a plataforma não informa — o indicador
              correspondente aparece como “—” em vez de fingir precisão.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {COUNT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type="number"
                    min={0}
                    value={volume[field.key]}
                    onChange={(event) =>
                      setVolume((current) => ({
                        ...current,
                        [field.key]: Math.max(0, Number(event.target.value)),
                      }))
                    }
                    className="text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marketing-notes">Observações</Label>
            <Input
              id="marketing-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Campanha, público, o que mudou no mês"
            />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-md border border-border bg-accent/40 px-3 py-2 text-sm">
            <span>
              <span className="text-muted-foreground">Investimento: </span>
              <span className="font-medium tabular-nums">{formatMoney(total)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Custo por lead: </span>
              <span className="font-medium tabular-nums">
                {cpl != null ? formatMoney(cpl) : '—'}
              </span>
            </span>
            {volume.leads > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatNumber(volume.leads)} leads informados
              </span>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEditing ? 'Salvar alterações' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
