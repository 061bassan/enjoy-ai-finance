import * as React from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { data } from '@/data'
import { formatDate, today } from '@/lib/date'
import { formatPhone } from '@/lib/validators'
import {
  LEAD_ACTIVITY_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STAGE_LABEL,
  optionsFrom,
} from '@/data/enums'
import {
  OPEN_LEAD_STAGES,
  type Lead,
  type LeadActivityKind,
  type LeadSource,
  type LeadStage,
} from '@/data/types'
import { canManageLead } from '@/data/rules/permissions'
import { useSession } from '@/app/session'
import { DateField } from '@/components/DateField'
import { MoneyInput } from '@/components/MoneyInput'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import {
  useCreate,
  useInvalidate,
  useLeadActivities,
  useProfiles,
  useRemove,
  useUpdate,
} from '@/hooks/data'
import { LabelEditor } from '@/components/LabelEditor'

/**
 * Cadastro e acompanhamento de um lead.
 *
 * O formulário é curto porque a maior parte dos campos é opcional: exigir
 * e-mail, empresa e valor de quem acabou de mandar mensagem no Instagram
 * garantiria que ninguém cadastraria nada. Só o nome é obrigatório — o resto
 * se preenche ao longo da conversa.
 *
 * Editando, o diálogo mostra a linha do tempo e deixa registrar um toque. É o
 * que separa acompanhamento de lista de nomes.
 */
export function LeadDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: Lead | null
}) {
  const { session, role } = useSession()
  const invalidate = useInvalidate()

  const create = useCreate('leads', data.leads)
  const update = useUpdate('leads', data.leads)
  const remove = useRemove('leads', data.leads)
  const createActivity = useCreate('leadActivities', data.leadActivities)

  const { data: profiles = [] } = useProfiles()
  const { data: activities = [] } = useLeadActivities()

  const [name, setName] = React.useState('')
  const [company, setCompany] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [source, setSource] = React.useState<LeadSource | ''>('')
  const [stage, setStage] = React.useState<LeadStage>('novo')
  const [ownerId, setOwnerId] = React.useState<string>('')
  const [estimatedValueCents, setEstimatedValueCents] = React.useState(0)
  const [enteredAt, setEnteredAt] = React.useState(today())
  const [nextActionAt, setNextActionAt] = React.useState<string>('')
  const [nextActionNote, setNextActionNote] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const [activityKind, setActivityKind] = React.useState<LeadActivityKind>('ligacao')
  const [activitySummary, setActivitySummary] = React.useState('')

  const isEditing = lead != null
  const canEdit = canManageLead(role, lead ? lead.ownerId === session?.user.id : true)

  React.useEffect(() => {
    if (!open) return
    setName(lead?.name ?? '')
    setCompany(lead?.company ?? '')
    setEmail(lead?.email ?? '')
    setPhone(lead?.phone ?? '')
    setSource(lead?.source ?? '')
    setStage(lead?.stage ?? 'novo')
    setOwnerId(lead?.ownerId ?? session?.user.id ?? '')
    setEstimatedValueCents(lead?.estimatedValueCents ?? 0)
    setEnteredAt(lead?.enteredAt ?? today())
    setNextActionAt(lead?.nextActionAt ?? '')
    setNextActionNote(lead?.nextActionNote ?? '')
    setNotes(lead?.notes ?? '')
    setActivityKind('ligacao')
    setActivitySummary('')
  }, [open, lead, session?.user.id])

  const timeline = React.useMemo(
    () =>
      activities
        .filter((activity) => activity.leadId === lead?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [activities, lead?.id],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (!name.trim()) {
      toast.error('Informe o nome do lead.')
      return
    }

    const payload = {
      workspaceId: session.workspaceId,
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: (source || null) as LeadSource | null,
      stage,
      ownerId: ownerId || null,
      estimatedValueCents,
      enteredAt,
      nextActionAt: nextActionAt || null,
      nextActionNote: nextActionNote.trim() || null,
      notes: notes.trim() || null,
    }

    try {
      if (lead) {
        await update.mutateAsync({ id: lead.id, patch: payload })
        toast.success('Lead atualizado.')
      } else {
        await create.mutateAsync({
          ...payload,
          lastContactAt: null,
          closedAt: null,
          lostReason: null,
          clientId: null,
          saleId: null,
          createdBy: session.user.id,
        })
        toast.success('Lead cadastrado.')
      }
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar.')
    }
  }

  /**
   * Registrar um toque atualiza `lastContactAt` junto.
   *
   * Sem isso, alguém anotaria "liguei hoje" e o lead continuaria aparecendo na
   * lista de esquecidos — e a lista perderia a credibilidade na primeira
   * semana.
   */
  async function addActivity() {
    if (!session || !lead) return
    if (!activitySummary.trim()) {
      toast.error('Descreva o que aconteceu.')
      return
    }

    try {
      await createActivity.mutateAsync({
        workspaceId: session.workspaceId,
        leadId: lead.id,
        kind: activityKind,
        date: today(),
        summary: activitySummary.trim(),
        fromStage: null,
        toStage: null,
        createdBy: session.user.id,
      })
      await update.mutateAsync({ id: lead.id, patch: { lastContactAt: today() } })
      invalidate(['leads', 'leadActivities'])
      setActivitySummary('')
      toast.success('Registrado.')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível registrar.')
    }
  }

  async function removeLead() {
    if (!lead) return
    if (lead.saleId) {
      toast.error('Este lead virou venda. Cancele a venda antes de excluir.')
      return
    }
    try {
      await remove.mutateAsync(lead.id)
      toast.success('Lead excluído.')
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Lead' : 'Novo lead'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize os dados, combine o próximo passo e registre o que já aconteceu.'
              : 'Só o nome é obrigatório. O resto se completa ao longo da conversa.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Nome</Label>
              <Input
                id="lead-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-company">Empresa</Label>
              <Input
                id="lead-company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                disabled={!canEdit}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-phone">Telefone</Label>
              <Input
                id="lead-phone"
                value={formatPhone(phone)}
                onChange={(event) => setPhone(event.target.value)}
                disabled={!canEdit}
                inputMode="tel"
                placeholder="(11) 98765-4321"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">E-mail</Label>
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!canEdit}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <span className="flex items-center gap-1">
                <Label>Etapa</Label>
                <LabelEditor group="leadStage" />
              </span>
              <Select
                value={stage}
                onValueChange={(value) => setStage(value as LeadStage)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* "Ganho" fica fora: virar venda passa pelo formulário de
                      conversão, que cria cliente e títulos. Deixar marcar aqui
                      produziria um lead ganho sem venda nenhuma. */}
                  {[...OPEN_LEAD_STAGES, 'perdido' as LeadStage].map((option) => (
                    <SelectItem key={option} value={option}>
                      {LEAD_STAGE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="flex items-center gap-1">
                <Label>Origem</Label>
                <LabelEditor group="leadSource" />
              </span>
              <Select
                value={source}
                onValueChange={(value) => setSource(value as LeadSource)}
                disabled={!canEdit}
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
              <Label>Responsável</Label>
              <Select value={ownerId} onValueChange={setOwnerId} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-value">Valor estimado</Label>
              <MoneyInput
                id="lead-value"
                value={estimatedValueCents}
                onChange={setEstimatedValueCents}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-entered">Entrou em</Label>
              <DateField
                id="lead-entered"
                value={enteredAt}
                onChange={setEnteredAt}
                disabled={!canEdit}
                max={today()}
              />
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium">Próximo passo</p>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="lead-next">Quando</Label>
                <DateField
                  id="lead-next"
                  value={nextActionAt || null}
                  onChange={setNextActionAt}
                  disabled={!canEdit}
                  clearable
                  onClear={() => setNextActionAt('')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-next-note">O quê</Label>
                <Input
                  id="lead-next-note"
                  value={nextActionNote}
                  onChange={(event) => setNextActionNote(event.target.value)}
                  disabled={!canEdit}
                  placeholder="Ligar para confirmar a proposta"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">Observações</Label>
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={!canEdit}
              rows={2}
            />
          </div>

          <DialogFooter>
            {isEditing && canEdit && (
              <Button type="button" variant="ghost" onClick={() => void removeLead()}>
                <Trash2 /> Excluir
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canEdit || create.isPending || update.isPending}>
              {isEditing ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>

        {isEditing && (
          <>
            <Separator />
            <div>
              <p className="mb-3 text-sm font-medium">Acompanhamento</p>

              {canEdit && (
                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={activityKind}
                    onValueChange={(value) => setActivityKind(value as LeadActivityKind)}
                  >
                    <SelectTrigger className="sm:w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        ['ligacao', 'mensagem', 'email', 'reuniao', 'proposta', 'nota'] as const
                      ).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {LEAD_ACTIVITY_KIND_LABEL[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={activitySummary}
                    onChange={(event) => setActivitySummary(event.target.value)}
                    placeholder="O que aconteceu?"
                    className="flex-1"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void addActivity()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => void addActivity()}>
                    Registrar
                  </Button>
                </div>
              )}

              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum registro ainda. Cada toque anotado aqui vira histórico de quem cuidou deste
                  lead.
                </p>
              ) : (
                <ul className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
                  {timeline.map((activity) => (
                    <li key={activity.id} className="flex gap-2.5 text-sm">
                      <Badge variant="muted" className="mt-0.5 shrink-0">
                        {LEAD_ACTIVITY_KIND_LABEL[activity.kind]}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block">{activity.summary}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(activity.date)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
