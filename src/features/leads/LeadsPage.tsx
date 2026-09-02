import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Search, UserPlus } from 'lucide-react'
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
import { LEAD_SOURCE_LABEL, LEAD_STAGE_LABEL } from '@/data/enums'
import type { Lead, LeadStage } from '@/data/types'
import { canManageLead } from '@/data/rules/permissions'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { useMarketingInvestment } from '@/hooks/marketing'
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
import { LeadBoard } from './LeadBoard'
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
  // O investimento lançado em Marketing entra aqui pelo mesmo motivo que
  // entra no Funil de vendas: sem ele, o custo por lead desta tela mostraria
  // só metade do que foi gasto para trazer quem está na lista abaixo.
  const marketingCents = useMarketingInvestment(range)
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

    const totals = totalizeLeads(inPeriod)

    return {
      inPeriod,
      totals,
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
      // Mesma conta do CPL do Funil de vendas: investimento do período dividido
      // pelos leads cadastrados aqui. Sem isso, "Custo por lead" não teria
      // como ser conferido por quem lançou o investimento em Marketing.
      cplCents: totals.total ? Math.round(marketingCents / totals.total) : null,
    }
  }, [visibleLeads, sales, commercialDays, marketingCents, range])

  /** A carteira de quem está olhando — o quadro usa para travar o arrasto. */
  const canMoveLead = React.useCallback(
    (lead: Lead) => canManageLead(role, lead.ownerId === session?.user.id),
    [role, session?.user.id],
  )

  /**
   * Mudança de etapa, venha do arrasto ou do menu "mover para".
   *
   * Os dois caminhos passam por aqui de propósito: a regra de "ganhar exige
   * criar a venda" não pode existir em um deles e faltar no outro, senão o
   * menu fecharia leads pela metade — marcados como ganhos, sem venda atrás,
   * quebrando a conversão apurada.
   */
  const handleMove = React.useCallback(
    async (lead: Lead, toStage: LeadStage) => {
      if (!session) return
      if (!canMoveLead(lead)) {
        toast.error('Você só pode mover os leads sob sua responsabilidade.')
        return
      }

      if (toStage === 'ganho') {
        setConverting(lead)
        return
      }

      try {
        await moveStage.mutateAsync({ leadId: lead.id, toStage, actorId: session.user.id })
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Não foi possível mover o lead.')
      }
    },
    [session, canMoveLead, moveStage],
  )

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
        {kpi('cpl') && (
          <KpiCard
            label="Custo por lead"
            value={metrics.cplCents != null ? formatMoney(metrics.cplCents) : '—'}
            invertVariation
            secondary={
              marketingCents > 0
                ? `${formatMoney(marketingCents)} em Marketing ÷ ${formatNumber(metrics.totals.total)} leads`
                : 'sem investimento lançado em Marketing no período'
            }
            hint="Investimento lançado em Marketing nos meses do período, dividido pelos leads cadastrados aqui. Cadastre o gasto na tela de Marketing para este número deixar de ficar em branco."
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
            {metrics.attention
              .slice(0, 6)
              .map(({ lead, reason, daysSilent, actionOverdueDays }) => (
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
            <LeadBoard
              leads={visibleLeads}
              onOpen={openEdit}
              onMove={handleMove}
              canMove={canMoveLead}
            />
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
                        {row.source === 'sem_origem' ? 'Sem origem' : LEAD_SOURCE_LABEL[row.source]}
                      </TableCell>
                      <TableCell data-numeric>{formatNumber(row.total)}</TableCell>
                      <TableCell data-numeric>{formatNumber(row.won)}</TableCell>
                      <TableCell data-numeric className="font-medium">
                        {row.conversion != null ? formatPercent(row.conversion) : '—'}
                      </TableCell>
                      <TableCell
                        data-numeric
                        className="hidden text-muted-foreground sm:table-cell"
                      >
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
