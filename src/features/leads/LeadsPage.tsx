import * as React from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, Plus, Search, UserPlus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDate, today } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent } from '@/lib/money'
import {
  conversionRate,
  leadsInPeriod,
  leadsNeedingAttention,
  leadsBySource,
  totalizeLeads,
  winRateFromLeads,
} from '@/domain/leads'
import { daysInPeriod, totalizeCommercial } from '@/domain/commercial'
import { LEAD_SOURCE_LABEL, LEAD_STAGE_DESCRIPTION, LEAD_STAGE_LABEL } from '@/data/enums'
import { OPEN_LEAD_STAGES, type Lead, type LeadStage } from '@/data/types'
import { canManageLead } from '@/data/rules/permissions'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { useCustomization } from '@/customization/context'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useCommercialDays,
  useLeads,
  useMoveLeadStage,
  useProfileMap,
  useSales,
} from '@/hooks/data'
import { ConvertLeadDialog } from './ConvertLeadDialog'
import { LeadDialog } from './LeadDialog'

/**
 * Acompanhamento de leads.
 *
 * Existe para responder uma pergunta que o produto não conseguia responder:
 * **de tudo que chegou, quanto virou venda?**
 *
 * O funil comercial já tinha o lugar dessa conta, mas os dois lados vinham do
 * mesmo formulário digitado — quem somava os leads do dia também somava os
 * contratos, e nada disso conversava com a tela de Vendas. O número existia
 * e não significava nada.
 *
 * Aqui cada lead é uma linha com nome, telefone e responsável. Quando um lead
 * é marcado como ganho, ele vira venda de verdade (`convertLeadToSale`), e a
 * conversão passa a ser apurada em vez de digitada.
 *
 * O quadro não filtra por período de propósito: um lead aberto há três meses
 * continua sendo trabalho de hoje, e sumir por causa do seletor de período
 * seria a forma mais rápida de perder negócio. O período recorta as métricas,
 * não a carteira.
 */
export function LeadsPage() {
  const { range } = usePeriod()
  const { session, role } = useSession()
  const { isVisible } = useCustomization()

  const { data: leads = [], isLoading } = useLeads()
  const { data: sales = [] } = useSales()
  const { data: commercialDays = [] } = useCommercialDays()
  const profiles = useProfileMap()
  const moveStage = useMoveLeadStage()

  const [dialogLead, setDialogLead] = React.useState<Lead | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [converting, setConverting] = React.useState<Lead | null>(null)

  const [search, setSearch] = React.useState('')
  const [ownerFilter, setOwnerFilter] = React.useState<string>('todos')

  const canCreate = canManageLead(role, true)

  // A conversão não passa por aqui: é `locked` no catálogo, porque é a
  // pergunta que a tela existe para responder.
  const kpi = (id: string) => isVisible('leads', 'kpis', id)

  /**
   * Leads visíveis.
   *
   * Closer e SDR veem só a própria carteira. O filtro mora aqui, e não na
   * matriz de permissões, porque a matriz guarda capacidade — "pode editar o
   * que é seu" — e não recorte de dados.
   */
  const visibleLeads = React.useMemo(() => {
    const mine = canManageLead(role, false)
      ? leads
      : leads.filter((lead) => lead.ownerId === session?.user.id)

    const term = search.trim().toLowerCase()
    return mine.filter((lead) => {
      if (ownerFilter !== 'todos' && (lead.ownerId ?? '') !== ownerFilter) return false
      if (!term) return true
      return (
        lead.name.toLowerCase().includes(term) ||
        (lead.company ?? '').toLowerCase().includes(term) ||
        (lead.email ?? '').toLowerCase().includes(term) ||
        (lead.phone ?? '').includes(term)
      )
    })
  }, [leads, role, session?.user.id, search, ownerFilter])

  const metrics = React.useMemo(() => {
    const inPeriod = leadsInPeriod(visibleLeads, range)
    const diary = totalizeCommercial(daysInPeriod(commercialDays, range))

    return {
      inPeriod,
      totals: totalizeLeads(inPeriod),
      carteira: totalizeLeads(visibleLeads),
      conversion: conversionRate({
        leads: visibleLeads,
        sales,
        range,
        diaryLeadCount: diary.leads,
      }),
      winRate: winRateFromLeads(inPeriod),
      attention: leadsNeedingAttention(visibleLeads, today()),
      bySource: leadsBySource(inPeriod),
    }
  }, [visibleLeads, sales, commercialDays, range])

  const byStage = React.useMemo(() => {
    const map = new Map<LeadStage, Lead[]>()
    for (const stage of [...OPEN_LEAD_STAGES, 'ganho', 'perdido'] as LeadStage[]) {
      map.set(stage, [])
    }
    for (const lead of visibleLeads) {
      map.get(lead.stage)?.push(lead)
    }
    // Mais antigo primeiro dentro da coluna: quem está esperando há mais
    // tempo aparece no topo, que é onde o olho bate.
    for (const list of map.values()) list.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
    return map
  }, [visibleLeads])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !session) return

    const lead = leads.find((item) => item.id === active.id)
    if (!lead) return

    const toStage = String(over.id) as LeadStage
    if (lead.stage === toStage) return
    if (!canManageLead(role, lead.ownerId === session.user.id)) {
      toast.error('Você só pode mover os leads sob sua responsabilidade.')
      return
    }

    // Ganhar exige criar a venda — não é uma simples mudança de coluna, então
    // o arrasto abre o formulário em vez de fechar o lead pela metade.
    if (toStage === 'ganho') {
      setConverting(lead)
      return
    }

    try {
      await moveStage.mutateAsync({ leadId: lead.id, toStage, actorId: session.user.id })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível mover o lead.')
    }
  }

  function openNew() {
    setDialogLead(null)
    setDialogOpen(true)
  }

  function openEdit(lead: Lead) {
    setDialogLead(lead)
    setDialogOpen(true)
  }

  const ownerOptions = React.useMemo(() => {
    const ids = new Set(leads.map((lead) => lead.ownerId).filter(Boolean) as string[])
    return [...ids].map((id) => ({ id, name: profiles.get(id)?.name ?? 'Sem nome' }))
  }, [leads, profiles])

  return (
    <>
      <PageHeader
        title="Leads"
        description="Quem chegou, em que pé está e quanto disso virou venda."
        actions={
          canCreate && (
            <Button onClick={openNew}>
              <Plus /> Novo lead
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        {kpi('total') && (
          <KpiCard
            label="Leads no período"
            value={formatNumber(metrics.totals.total)}
            secondary={`${formatNumber(metrics.carteira.open)} em aberto na carteira`}
          />
        )}
        <KpiCard
          label="Conversão em venda"
          value={metrics.conversion.ratio != null ? formatPercent(metrics.conversion.ratio) : '—'}
          secondary={`${formatNumber(metrics.conversion.saleCount)} vendas ÷ ${formatNumber(
            metrics.conversion.leadCount,
          )} leads`}
          hint={
            metrics.conversion.origin === 'crm'
              ? 'Vendas registradas no período divididas pelos leads que entraram. As duas pontas são fatos: a venda vem da tela de Vendas, o lead vem daqui.'
              : metrics.conversion.origin === 'diario'
                ? 'Ainda não há leads cadastrados no período, então o total vem do diário comercial. Cadastre os leads aqui para o número sair sozinho.'
                : 'Sem leads no período — não há denominador para a conta.'
          }
        />
        {kpi('winRate') && (
          <KpiCard
            label="Taxa de ganho"
            value={metrics.winRate != null ? formatPercent(metrics.winRate) : '—'}
            hint="Ganhos sobre os leads já decididos (ganhos + perdidos). Ignora quem ainda está em jogo."
          />
        )}
        {kpi('pipeline') && (
          <KpiCard
            label="Em negociação"
            value={formatMoney(metrics.carteira.pipelineCents)}
            secondary="valor estimado em aberto"
          />
        )}
        {kpi('won') && (
          <KpiCard
            label="Ganhos no período"
            value={formatNumber(metrics.totals.won)}
            secondary={formatMoney(metrics.totals.wonCents)}
          />
        )}
        {kpi('daysToWin') && (
          <KpiCard
            label="Tempo até fechar"
            value={
              metrics.totals.averageDaysToWin != null
                ? `${formatNumber(metrics.totals.averageDaysToWin)} dias`
                : '—'
            }
            hint="Média entre a entrada do lead e o fechamento."
          />
        )}
      </KpiGrid>

      {isVisible('leads', 'panels', 'attention') && metrics.attention.length > 0 && (
        <Card className="mb-4 border-negative/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-negative" />
            <h3 className="text-sm font-medium">
              {metrics.attention.length === 1
                ? '1 lead precisa de atenção'
                : `${metrics.attention.length} leads precisam de atenção`}
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {metrics.attention.slice(0, 6).map(({ lead, reason, daysSilent, actionOverdueDays }) => (
              <li key={lead.id} className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  onClick={() => openEdit(lead)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block truncate text-sm font-medium">{lead.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {reason === 'acao_atrasada'
                      ? `Ação combinada atrasada há ${actionOverdueDays} ${
                          actionOverdueDays === 1 ? 'dia' : 'dias'
                        }${lead.nextActionNote ? ` — ${lead.nextActionNote}` : ''}`
                      : `Sem contato há ${daysSilent} dias`}
                  </span>
                </button>
                <Badge variant="outline" className="shrink-0">
                  {LEAD_STAGE_LABEL[lead.stage]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, empresa ou contato"
            className="pl-8"
            aria-label="Buscar leads"
          />
        </div>
        {ownerOptions.length > 0 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              {ownerOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? null : visibleLeads.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Nenhum lead cadastrado"
          description="Cadastre quem chega e o funil passa a calcular a conversão sozinho, sem ninguém digitar totais."
          action={
            canCreate && (
              <Button onClick={openNew}>
                <Plus /> Cadastrar o primeiro lead
              </Button>
            )
          }
        />
      ) : (
        <Tabs defaultValue="quadro">
          <TabsList>
            <TabsTrigger value="quadro">Quadro</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="origem">Por origem</TabsTrigger>
          </TabsList>

          <TabsContent value="quadro">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {([...OPEN_LEAD_STAGES, 'ganho', 'perdido'] as LeadStage[]).map((stage) => (
                  <StageColumn
                    key={stage}
                    stage={stage}
                    leads={byStage.get(stage) ?? []}
                    onOpen={openEdit}
                  />
                ))}
              </div>
            </DndContext>
          </TabsContent>

          <TabsContent value="lista">
            <LeadTable leads={visibleLeads} onOpen={openEdit} profiles={profiles} />
          </TabsContent>

          <TabsContent value="origem">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead data-numeric>Leads</TableHead>
                    <TableHead data-numeric>Ganhos</TableHead>
                    <TableHead data-numeric>Conversão</TableHead>
                    <TableHead data-numeric className="hidden sm:table-cell">
                      Em aberto
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.bySource.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium">
                        {row.source === 'sem_origem'
                          ? 'Sem origem'
                          : LEAD_SOURCE_LABEL[row.source]}
                      </TableCell>
                      <TableCell data-numeric>{formatNumber(row.total)}</TableCell>
                      <TableCell data-numeric>{formatNumber(row.won)}</TableCell>
                      <TableCell data-numeric className="font-medium">
                        {row.conversion != null ? formatPercent(row.conversion) : '—'}
                      </TableCell>
                      <TableCell data-numeric className="hidden text-muted-foreground sm:table-cell">
                        {formatMoney(row.pipelineCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <LeadDialog open={dialogOpen} onOpenChange={setDialogOpen} lead={dialogLead} />
      <ConvertLeadDialog
        lead={converting}
        onOpenChange={(open) => {
          if (!open) setConverting(null)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Quadro
// ---------------------------------------------------------------------------

function StageColumn({
  stage,
  leads,
  onOpen,
}: {
  stage: LeadStage
  leads: Lead[]
  onOpen: (lead: Lead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = leads.reduce((sum, lead) => sum + lead.estimatedValueCents, 0)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[220px] flex-col rounded-lg border border-border bg-surface-1/60 transition-colors',
        isOver && 'border-foreground/40 bg-accent/40',
      )}
    >
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{LEAD_STAGE_LABEL[stage]}</span>
          <Badge variant="muted" className="shrink-0">
            {leads.length}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {total > 0 ? formatMoney(total) : LEAD_STAGE_DESCRIPTION[stage]}
        </p>
      </div>

      <div className="flex-1 space-y-2 p-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: (lead: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })

  const overdue = lead.nextActionAt != null && lead.nextActionAt < today()

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'rounded-md border border-border bg-surface-2 p-2.5 text-left shadow-sm transition-shadow',
        isDragging && 'opacity-50',
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

      {/* A alça de arrasto é uma faixa própria: o card inteiro arrastável
          impediria clicar para abrir, e abrir é a ação mais frequente. */}
      <div
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={-1}
        aria-label={`Arrastar ${lead.name}`}
        className="mt-2 h-1.5 cursor-grab rounded-full bg-border transition-colors hover:bg-muted-foreground/40 active:cursor-grabbing"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

function LeadTable({
  leads,
  onOpen,
  profiles,
}: {
  leads: Lead[]
  onOpen: (lead: Lead) => void
  profiles: Map<string, { name: string }>
}) {
  const sorted = React.useMemo(
    () => [...leads].sort((a, b) => b.enteredAt.localeCompare(a.enteredAt)),
    [leads],
  )

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead className="hidden sm:table-cell">Etapa</TableHead>
            <TableHead className="hidden lg:table-cell">Responsável</TableHead>
            <TableHead className="hidden md:table-cell">Origem</TableHead>
            <TableHead data-numeric>Valor</TableHead>
            <TableHead className="hidden xl:table-cell">Entrada</TableHead>
            <TableHead className="hidden xl:table-cell">Próxima ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((lead) => (
            <TableRow
              key={lead.id}
              onClick={() => onOpen(lead)}
              className="cursor-pointer"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onOpen(lead)
              }}
            >
              <TableCell>
                <span className="block font-medium">{lead.name}</span>
                {lead.company && (
                  <span className="block text-xs text-muted-foreground">{lead.company}</span>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant={lead.stage === 'ganho' ? 'secondary' : 'muted'}>
                  {LEAD_STAGE_LABEL[lead.stage]}
                </Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {lead.ownerId ? (profiles.get(lead.ownerId)?.name ?? '—') : '—'}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {lead.source ? LEAD_SOURCE_LABEL[lead.source] : '—'}
              </TableCell>
              <TableCell data-numeric>
                {lead.estimatedValueCents > 0 ? formatMoney(lead.estimatedValueCents) : '—'}
              </TableCell>
              <TableCell className="hidden text-muted-foreground xl:table-cell">
                {formatDate(lead.enteredAt)}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {lead.nextActionAt ? (
                  <span className={lead.nextActionAt < today() ? 'text-negative' : undefined}>
                    {formatDate(lead.nextActionAt)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
