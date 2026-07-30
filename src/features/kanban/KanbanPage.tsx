import * as React from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, GripVertical, Trello, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { COST_CENTER_LABEL } from '@/data/enums'
import type { Card as CardEntity, CostCenter } from '@/data/types'
import { useSession } from '@/app/session'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBoardColumns, useBoards, useCards, useMoveCard, useProfileMap } from '@/hooks/data'

/**
 * Quadro kanban.
 *
 * O que separa este quadro de um post-it digital: soltar um card na coluna
 * marcada com `settle_bill` liquida o título vinculado de verdade — cria a
 * transação no caixa e muda o status do título. O efeito colateral está na
 * operação `moveCard`, não aqui, porque precisa valer igual quando a mesma
 * ação vier de outro lugar.
 */
export function KanbanPage() {
  const { session, allow } = useSession()
  const canManage = allow('manage:kanban')

  const { data: boards = [], isLoading } = useBoards()
  const { data: columns = [] } = useBoardColumns()
  const { data: cards = [] } = useCards()
  const profileMap = useProfileMap()
  const moveCard = useMoveCard()

  const [boardId, setBoardId] = React.useState<string>('')
  const [activeCard, setActiveCard] = React.useState<CardEntity | null>(null)

  React.useEffect(() => {
    if (!boardId && boards.length) setBoardId(boards[0]?.id ?? '')
  }, [boards, boardId])

  const board = boards.find((item) => item.id === boardId)

  const boardColumns = React.useMemo(
    () => columns.filter((column) => column.boardId === boardId).sort((a, b) => a.position - b.position),
    [columns, boardId],
  )

  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, CardEntity[]>()
    for (const column of boardColumns) map.set(column.id, [])
    for (const card of cards) {
      if (card.boardId !== boardId) continue
      const list = map.get(card.columnId)
      if (list) list.push(card)
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [cards, boardColumns, boardId])

  // Distância mínima antes de iniciar o arrasto: sem isso, um clique simples
  // no card já dispararia drag e o quadro ficaria impossível de usar no trackpad.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((item) => item.id === event.active.id)
    setActiveCard(card ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over || !session) return

    const card = cards.find((item) => item.id === active.id)
    if (!card) return

    // O alvo pode ser a coluna (área vazia) ou outro card dentro dela.
    const overCard = cards.find((item) => item.id === over.id)
    const targetColumnId = overCard ? overCard.columnId : String(over.id)
    if (!boardColumns.some((column) => column.id === targetColumnId)) return

    const targetCards = cardsByColumn.get(targetColumnId) ?? []
    const position = overCard
      ? targetCards.findIndex((item) => item.id === overCard.id)
      : targetCards.length

    if (card.columnId === targetColumnId && card.position === position) return

    try {
      const result = await moveCard.mutateAsync({
        cardId: card.id,
        toColumnId: targetColumnId,
        position,
        actorId: session.user.id,
      })

      if (result.sideEffect === 'settled_bill') {
        toast.success('Título baixado e lançado no caixa.')
      } else if (result.sideEffect === 'sale_paid') {
        toast.success('Venda marcada como paga.')
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível mover o cartão.')
    }
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Quadro de tarefas" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      </>
    )
  }

  if (!board) {
    return (
      <>
        <PageHeader title="Quadro de tarefas" />
        <EmptyState
          icon={Trello}
          title="Nenhum quadro criado"
          description="Nenhum quadro foi criado para este espaço ainda."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Quadro de tarefas"
        description={board.description ?? undefined}
        actions={
          boards.length > 1 && (
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {boards.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {boardColumns.map((column) => {
            const columnCards = cardsByColumn.get(column.id) ?? []
            const total = columnCards.reduce((sum, card) => sum + (card.amountCents ?? 0), 0)
            const overLimit = column.wipLimit != null && columnCards.length > column.wipLimit

            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                name={column.name}
                count={columnCards.length}
                totalCents={total}
                wipLimit={column.wipLimit ?? null}
                overLimit={overLimit}
                hasAction={column.onDropAction === 'settle_bill'}
                disabled={!canManage}
              >
                <SortableContext
                  items={columnCards.map((card) => card.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnCards.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      assigneeName={
                        card.assigneeId ? (profileMap.get(card.assigneeId)?.name ?? null) : null
                      }
                      disabled={!canManage}
                    />
                  ))}
                </SortableContext>

                {columnCards.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Arraste um card para cá
                  </p>
                )}
              </KanbanColumn>
            )
          })}
        </div>

        {/* Overlay: o card acompanha o cursor sem "pular" no layout original. */}
        <DragOverlay>
          {activeCard && (
            <div className="rotate-1 opacity-95">
              <CardBody card={activeCard} assigneeName={null} dragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  )
}

function KanbanColumn({
  id,
  name,
  count,
  totalCents,
  wipLimit,
  overLimit,
  hasAction,
  disabled,
  children,
}: {
  id: string
  name: string
  count: number
  totalCents: number
  wipLimit: number | null
  overLimit: boolean
  hasAction: boolean
  disabled: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[240px] flex-col rounded-lg border border-border bg-surface-1/60 p-2.5 transition-colors',
        isOver && 'border-foreground/30 bg-surface-2',
      )}
    >
      <div className="mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{name}</h3>
          {hasAction && (
            <span title="Soltar aqui baixa o título e lança no caixa">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
          <Badge variant={overLimit ? 'negative' : 'muted'}>
            {count}
            {wipLimit != null && `/${wipLimit}`}
          </Badge>
        </div>
        {totalCents > 0 && (
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatMoney(totalCents)}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  )
}

function KanbanCard({
  card,
  assigneeName,
  disabled,
}: {
  card: CardEntity
  assigneeName: string | null
  disabled: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : undefined}
      {...attributes}
      {...listeners}
    >
      <CardBody card={card} assigneeName={assigneeName} disabled={disabled} />
    </div>
  )
}

function CardBody({
  card,
  assigneeName,
  dragging = false,
  disabled = false,
}: {
  card: CardEntity
  assigneeName: string | null
  dragging?: boolean
  disabled?: boolean
}) {
  const daysLeft = card.dueDate ? daysUntil(card.dueDate) : null
  const isOverdue = daysLeft != null && daysLeft < 0
  const isDueSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 3

  return (
    <Card
      className={cn(
        'p-3 transition-shadow',
        !disabled && 'cursor-grab active:cursor-grabbing',
        dragging && 'shadow-2xl',
        isOverdue && 'border-negative/40',
      )}
    >
      <div className="flex items-start gap-2">
        {!disabled && (
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">{card.title}</p>

          {card.amountCents != null && (
            <p className="mt-1.5 text-sm font-medium tabular-nums">
              {formatMoney(card.amountCents)}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {card.dueDate && (
              <Badge variant={isOverdue ? 'negative' : isDueSoon ? 'outline' : 'muted'}>
                <CalendarClock className="h-3 w-3" />
                {isOverdue
                  ? `${Math.abs(daysLeft)}d atrás`
                  : daysLeft === 0
                    ? 'hoje'
                    : formatDate(card.dueDate)}
              </Badge>
            )}

            {card.labels.map((label) => (
              <Badge key={label} variant="outline">
                {COST_CENTER_LABEL[label as CostCenter] ?? label}
              </Badge>
            ))}
          </div>
        </div>

        {assigneeName && (
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback className="text-[10px]">{initialsOf(assigneeName)}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </Card>
  )
}
