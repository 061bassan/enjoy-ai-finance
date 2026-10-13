import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { GripVertical, MoveRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { today } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { LEAD_SOURCE_LABEL, LEAD_STAGE_DESCRIPTION, LEAD_STAGE_LABEL } from '@/data/enums'
import { OPEN_LEAD_STAGES, type Lead, type LeadStage } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LabelEditor } from '@/components/LabelEditor'

/** Ordem das colunas: o funil aberto, depois os dois desfechos. */
const BOARD_STAGES = [...OPEN_LEAD_STAGES, 'ganho', 'perdido'] as LeadStage[]

/**
 * Quadro kanban dos leads.
 *
 * Três decisões carregam esta tela, e todas vêm do celular:
 *
 * 1. **As colunas rolam na horizontal**, uma ao lado da outra, em vez de
 *    empilharem. Empilhado, o quadro vira uma lista comprida e some a única
 *    coisa que um kanban entrega — ver o funil inteiro de uma vez. O
 *    `snap` faz cada coluna parar centralizada, então o polegar navega o
 *    funil como quem passa fotos.
 *
 * 2. **Arrastar no toque exige um toque longo** (`TouchSensor` com atraso).
 *    Sem o atraso, qualquer rolagem com o dedo em cima de um card viraria
 *    arrasto e o quadro ficaria impossível de percorrer.
 *
 * 3. **Existe um caminho sem arrasto.** Cada card tem "Mover para", e é ele
 *    que atende teclado, leitor de tela e o dedo grosso no ônibus. Arrastar
 *    é o atalho, não o único caminho — se fosse, mover um lead dependeria de
 *    precisão motora.
 */
export function LeadBoard({
  leads,
  onOpen,
  onMove,
  canMove,
}: {
  leads: Lead[]
  onOpen: (lead: Lead) => void
  onMove: (lead: Lead, toStage: LeadStage) => void
  /** Closer e SDR só mexem na própria carteira. */
  canMove: (lead: Lead) => boolean
}) {
  const [dragging, setDragging] = React.useState<Lead | null>(null)

  const byStage = React.useMemo(() => {
    const map = new Map<LeadStage, Lead[]>()
    for (const stage of BOARD_STAGES) map.set(stage, [])
    for (const lead of leads) map.get(lead.stage)?.push(lead)
    // Mais antigo primeiro: quem espera há mais tempo aparece no topo, que é
    // onde o olho bate.
    for (const list of map.values()) list.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
    return map
  }, [leads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null)
    const { active, over } = event
    if (!over) return

    const lead = leads.find((item) => item.id === active.id)
    if (!lead) return

    const toStage = String(over.id) as LeadStage
    if (lead.stage === toStage) return
    onMove(lead, toStage)
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging(leads.find((item) => item.id === event.active.id) ?? null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {/* Faixa rolável no celular, grade fixa a partir de xl. O padding
          lateral negativo faz a faixa sangrar até a borda da tela: sem isso,
          a última coluna parece cortada por engano em vez de "há mais ali". */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0 xl:overflow-visible">
        <div className="flex snap-x snap-mandatory gap-3 xl:grid xl:grid-cols-4 xl:snap-none">
          {BOARD_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              leads={byStage.get(stage) ?? []}
              onOpen={onOpen}
              onMove={onMove}
              canMove={canMove}
            />
          ))}
        </div>
      </div>

      {/* O card segue o dedo por cima de tudo. Dentro da coluna, que tem
          rolagem própria, ele ficaria cortado na borda. */}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="w-[264px] rotate-1 rounded-md border border-border bg-surface-2 p-2.5 shadow-lg">
            <span className="block truncate text-sm font-medium">{dragging.name}</span>
            {dragging.company && (
              <span className="block truncate text-xs text-muted-foreground">
                {dragging.company}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function StageColumn({
  stage,
  leads,
  onOpen,
  onMove,
  canMove,
}: {
  stage: LeadStage
  leads: Lead[]
  onOpen: (lead: Lead) => void
  onMove: (lead: Lead, toStage: LeadStage) => void
  canMove: (lead: Lead) => boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = leads.reduce((sum, lead) => sum + lead.estimatedValueCents, 0)

  return (
    <section
      ref={setNodeRef}
      aria-label={LEAD_STAGE_LABEL[stage]}
      className={cn(
        'flex w-[280px] shrink-0 snap-start flex-col rounded-lg border border-border bg-surface-1/60 transition-colors xl:w-auto',
        isOver && 'border-foreground/40 bg-accent/40',
      )}
    >
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-0.5">
            <span className="truncate text-sm font-medium">{LEAD_STAGE_LABEL[stage]}</span>
            <LabelEditor group="leadStage" />
          </span>
          <Badge variant="muted" className="shrink-0">
            {leads.length}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {total > 0 ? formatMoney(total) : LEAD_STAGE_DESCRIPTION[stage]}
        </p>
      </div>

      {/* Altura máxima com rolagem própria: uma coluna com 40 leads não pode
          empurrar as outras três para fora da tela. */}
      <div className="max-h-[60vh] min-h-[140px] flex-1 space-y-2 overflow-y-auto p-2">
        {leads.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
            Solte um lead aqui
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onOpen={onOpen}
              onMove={onMove}
              movable={canMove(lead)}
            />
          ))
        )}
      </div>
    </section>
  )
}

function LeadCard({
  lead,
  onOpen,
  onMove,
  movable,
}: {
  lead: Lead
  onOpen: (lead: Lead) => void
  onMove: (lead: Lead, toStage: LeadStage) => void
  movable: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: !movable,
  })

  const overdue = lead.nextActionAt != null && lead.nextActionAt < today()

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-border bg-surface-2 p-2.5 text-left shadow-sm',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(lead)}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-sm font-medium">{lead.name}</span>
        {lead.company && (
          <span className="block truncate text-xs text-muted-foreground">{lead.company}</span>
        )}
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.estimatedValueCents > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatMoney(lead.estimatedValueCents)}
          </span>
        )}
        {lead.source && (
          <Badge variant="outline" className="text-[10px]">
            {LEAD_SOURCE_LABEL[lead.source]}
          </Badge>
        )}
        {overdue && (
          <Badge variant="outline" className="border-negative/40 text-[10px] text-negative">
            atrasado
          </Badge>
        )}
      </div>

      {movable && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
          {/* A alça é uma área própria porque o card inteiro arrastável
              impediria clicar para abrir — e abrir é a ação mais frequente.
              `touch-none` desliga a rolagem nativa só dentro dela. */}
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={`Arrastar ${lead.name}`}
            className="flex h-8 flex-1 cursor-grab touch-none items-center gap-1 rounded text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GripVertical className="h-3.5 w-3.5" />
            <span className="text-[10px]">arrastar</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Mover ${lead.name} de etapa`}>
                <MoveRight />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mover para</DropdownMenuLabel>
              {BOARD_STAGES.filter((stage) => stage !== lead.stage).map((stage) => (
                <DropdownMenuItem key={stage} onSelect={() => onMove(lead, stage)}>
                  {LEAD_STAGE_LABEL[stage]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
