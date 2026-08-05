import * as React from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { data } from '@/data'
import type { BoardColumn, Card as CardEntity, Profile } from '@/data/types'
import { useSession } from '@/app/session'
import { useCreate, useRemove, useUpdate } from '@/hooks/data'
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
 * Cartão do quadro de tarefas.
 *
 * O quadro sabia mover cartões e liquidar títulos ao soltá-los na coluna
 * certa — mas não sabia **criar** nenhum. Os únicos cartões existentes vinham
 * dos dados de demonstração, que saíram do produto; desde então o quadro
 * abria vazio, com quatro colunas pedindo "arraste um card para cá" e nada
 * para arrastar.
 *
 * Cartão criado aqui é uma tarefa solta, sem título nem venda por trás. Os
 * cartões que liquidam algo continuam nascendo do vínculo (`linkType`), que é
 * o que faz a coluna "Pago" mexer no caixa de verdade.
 */
export function CardDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  profiles,
  card = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardId: string
  columns: BoardColumn[]
  profiles: Profile[]
  card?: CardEntity | null
}) {
  const { session } = useSession()
  const create = useCreate('cards', data.cards)
  const update = useUpdate('cards', data.cards)
  const remove = useRemove('cards', data.cards)

  const isEditing = card != null

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [columnId, setColumnId] = React.useState('')
  const [assigneeId, setAssigneeId] = React.useState(NONE)
  const [dueDate, setDueDate] = React.useState('')
  const [amountCents, setAmountCents] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setTitle(card?.title ?? '')
    setDescription(card?.description ?? '')
    setColumnId(card?.columnId ?? columns[0]?.id ?? '')
    setAssigneeId(card?.assigneeId ?? NONE)
    setDueDate(card?.dueDate ?? '')
    setAmountCents(card?.amountCents ?? 0)
  }, [open, card, columns])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (!title.trim()) {
      toast.error('Informe o título do cartão.')
      return
    }
    if (!columnId) {
      toast.error('Selecione a coluna.')
      return
    }

    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      columnId,
      assigneeId: assigneeId === NONE ? null : assigneeId,
      dueDate: dueDate || null,
      amountCents: amountCents > 0 ? amountCents : null,
    }

    try {
      if (card) {
        await update.mutateAsync({ id: card.id, patch: fields })
        toast.success('Cartão atualizado.')
      } else {
        await create.mutateAsync({
          workspaceId: session.workspaceId,
          boardId,
          ...fields,
          // Entra no fim da coluna: um cartão novo no topo empurraria para
          // baixo o que já estava priorizado.
          position: Number.MAX_SAFE_INTEGER,
          labels: [],
          linkType: null,
          linkId: null,
          createdBy: session.user.id,
        })
        toast.success('Cartão criado.')
      }
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar o cartão.')
    }
  }

  async function handleDelete() {
    if (!card) return
    try {
      await remove.mutateAsync(card.id)
      toast.success('Cartão excluído.')
      onOpenChange(false)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar cartão' : 'Novo cartão'}</DialogTitle>
          <DialogDescription>
            {card?.linkType
              ? 'Este cartão está ligado a um título ou venda. Mover para a coluna de conclusão dispara a ação correspondente.'
              : 'Uma tarefa do quadro. Cartões ligados a títulos nascem do próprio título, não daqui.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-title">Título</Label>
            <Input
              id="card-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="card-description">Descrição</Label>
            <Textarea
              id="card-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Coluna</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="card-due">Prazo</Label>
              <DateField
                id="card-due"
                value={dueDate}
                onChange={setDueDate}
                clearable
                onClear={() => setDueDate('')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="card-amount">Valor</Label>
              <MoneyInput id="card-amount" value={amountCents} onChange={setAmountCents} />
              <p className="text-[11px] text-muted-foreground">
                Opcional. Aparece no total da coluna.
              </p>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-negative"
                onClick={() => void handleDelete()}
                disabled={remove.isPending}
              >
                <Trash2 /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {isEditing ? 'Salvar' : 'Criar cartão'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
