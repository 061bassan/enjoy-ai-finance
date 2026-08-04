import * as React from 'react'
import { toast } from 'sonner'
import { Check, Inbox, X } from 'lucide-react'
import { formatDate, formatDateLong } from '@/lib/date'
import { formatCpf, formatPhone } from '@/lib/validators'
import { MEMBER_STATUS_LABEL, ROLE_LABEL } from '@/data/enums'
import type { Role, WorkspaceMember } from '@/data/types'
import {
  canDecide,
  decidedRequests,
  grantableRoles,
  pendingRequests,
  roleOnApproval,
} from '@/domain/membership'
import { useSession } from '@/app/session'
import { EmptyState } from '@/components/PageHeader'
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { useApproveMember, useMembers, useProfileMap, useRejectMember } from '@/hooks/data'

/**
 * Fila de liberação de acesso.
 *
 * Mostra quem pediu, com os dados que a pessoa informou no cadastro — nome
 * completo, CPF, nascimento e telefone. Não é burocracia: quem libera precisa
 * conseguir dizer que aquela pessoa é mesmo quem diz ser, e um nome com
 * e-mail não basta para isso.
 *
 * Aprovar e recusar gravam os dois no banco. A recusa não apaga a linha — o
 * pedido, o cargo pretendido, quem decidiu e o motivo continuam registrados.
 * Sem isso, a mesma pessoa se cadastraria de novo na semana seguinte e
 * ninguém lembraria da decisão anterior.
 */
export function AccessRequestsTab() {
  const { session, role } = useSession()
  const { data: members = [] } = useMembers()
  const profiles = useProfileMap()

  const approve = useApproveMember()
  const reject = useRejectMember()

  const [decidingOn, setDecidingOn] = React.useState<WorkspaceMember | null>(null)
  const [rejectingOn, setRejectingOn] = React.useState<WorkspaceMember | null>(null)

  const pending = React.useMemo(() => pendingRequests(members), [members])
  const decided = React.useMemo(() => decidedRequests(members), [members])

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Pedidos aguardando</h3>
          {pending.length > 0 && <Badge>{pending.length}</Badge>}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Quem se cadastra entra como visitante sem acesso até alguém liberar.
        </p>

        {pending.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhum pedido pendente"
            description="Novos cadastros aparecem aqui assim que forem enviados."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((request) => {
              const profile = profiles.get(request.userId)
              const check = canDecide(role, session?.user.id ?? '', request)

              return (
                <li key={request.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <Avatar className="mt-0.5 h-9 w-9 shrink-0">
                        <AvatarFallback>{initialsOf(profile?.name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {profile?.name ?? 'Perfil removido'}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {profile?.email ?? '—'}
                        </p>

                        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                          {profile?.cpf && (
                            <div className="flex gap-1.5">
                              <dt className="text-muted-foreground">CPF</dt>
                              <dd className="tabular-nums">{formatCpf(profile.cpf)}</dd>
                            </div>
                          )}
                          {profile?.phone && (
                            <div className="flex gap-1.5">
                              <dt className="text-muted-foreground">Telefone</dt>
                              <dd className="tabular-nums">{formatPhone(profile.phone)}</dd>
                            </div>
                          )}
                          {profile?.birthDate && (
                            <div className="flex gap-1.5">
                              <dt className="text-muted-foreground">Nascimento</dt>
                              <dd>{formatDate(profile.birthDate)}</dd>
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <dt className="text-muted-foreground">Pedido em</dt>
                            <dd>{formatDateLong(request.createdAt.slice(0, 10))}</dd>
                          </div>
                        </dl>

                        <p className="mt-2 flex items-center gap-1.5 text-xs">
                          <span className="text-muted-foreground">Cargo pedido:</span>
                          <Badge variant="muted">
                            {request.requestedRole ? ROLE_LABEL[request.requestedRole] : '—'}
                          </Badge>
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => setDecidingOn(request)}
                        disabled={!check.allowed || approve.isPending}
                        title={check.reason}
                      >
                        <Check /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingOn(request)}
                        disabled={!check.allowed || reject.isPending}
                        title={check.reason}
                      >
                        <X /> Recusar
                      </Button>
                    </div>
                  </div>

                  {!check.allowed && check.reason && (
                    <p className="mt-2 text-xs text-muted-foreground">{check.reason}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {decided.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-medium">Decisões anteriores</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Aprovados e recusados ficam registrados, com quem decidiu e quando.
          </p>

          <ul className="divide-y divide-border">
            {decided.map((request) => {
              const profile = profiles.get(request.userId)
              const decider = request.decidedBy ? profiles.get(request.decidedBy) : null

              return (
                <li key={request.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {profile?.name ?? 'Perfil removido'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {request.decidedAt ? formatDateLong(request.decidedAt.slice(0, 10)) : '—'}
                      {decider ? ` · por ${decider.name}` : ''}
                      {request.decisionNote ? ` · ${request.decisionNote}` : ''}
                    </span>
                  </span>
                  <Badge variant={request.status === 'active' ? 'secondary' : 'outline'}>
                    {request.status === 'active'
                      ? ROLE_LABEL[request.role]
                      : MEMBER_STATUS_LABEL[request.status]}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <ApproveDialog
        request={decidingOn}
        onOpenChange={(open) => !open && setDecidingOn(null)}
        onConfirm={async (grantedRole, note) => {
          if (!decidingOn || !session) return
          try {
            await approve.mutateAsync({
              memberId: decidingOn.id,
              grantedRole,
              actorId: session.user.id,
              note,
            })
            toast.success(`Acesso liberado como ${ROLE_LABEL[grantedRole]}.`)
            setDecidingOn(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível aprovar.')
          }
        }}
      />

      <RejectDialog
        request={rejectingOn}
        onOpenChange={(open) => !open && setRejectingOn(null)}
        onConfirm={async (note) => {
          if (!rejectingOn || !session) return
          try {
            await reject.mutateAsync({
              memberId: rejectingOn.id,
              actorId: session.user.id,
              note,
            })
            toast.success('Cadastro recusado. O registro foi mantido no histórico.')
            setRejectingOn(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível recusar.')
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function ApproveDialog({
  request,
  onOpenChange,
  onConfirm,
}: {
  request: WorkspaceMember | null
  onOpenChange: (open: boolean) => void
  onConfirm: (role: Role, note?: string) => Promise<void>
}) {
  const { role: myRole } = useSession()
  const options = grantableRoles(myRole)

  const [granted, setGranted] = React.useState<Role>('viewer')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!request) return
    // Já vem com o cargo pedido selecionado: aprovar concedendo o que a
    // pessoa pediu é o caminho comum, e deveria ser um clique só.
    setGranted(roleOnApproval(request, myRole))
    setNote('')
  }, [request, myRole])

  return (
    <Dialog open={request != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar acesso</DialogTitle>
          <DialogDescription>
            {request?.requestedRole
              ? `A pessoa pediu ${ROLE_LABEL[request.requestedRole]}. Você pode conceder outro cargo.`
              : 'Escolha o cargo que esta pessoa terá.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cargo concedido</Label>
            <Select value={granted} onValueChange={(value) => setGranted(value as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Observação</Label>
            <Input
              id="approve-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opcional — fica no histórico"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(granted, note.trim() || undefined)
              } finally {
                setBusy(false)
              }
            }}
          >
            <Check /> Liberar acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  request,
  onOpenChange,
  onConfirm,
}: {
  request: WorkspaceMember | null
  onOpenChange: (open: boolean) => void
  onConfirm: (note?: string) => Promise<void>
}) {
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (request) setNote('')
  }, [request])

  return (
    <Dialog open={request != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recusar cadastro</DialogTitle>
          <DialogDescription>
            O cadastro continua registrado com a decisão e o motivo. A pessoa vê o motivo ao
            entrar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="reject-note">Motivo</Label>
          <Input
            id="reject-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex.: pedido feito por engano"
          />
        </div>

        <Separator />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(note.trim() || undefined)
              } finally {
                setBusy(false)
              }
            }}
          >
            <X /> Recusar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
