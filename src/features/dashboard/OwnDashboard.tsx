import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { formatDate, today } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent } from '@/lib/money'
import { LEAD_STAGE_LABEL } from '@/data/enums'
import { activeSales, summarizeSales } from '@/domain/sales'
import { leadsNeedingAttention, openLeads, totalizeLeads } from '@/domain/leads'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useLeads, useSales } from '@/hooks/data'

/**
 * Painel de quem trabalha o comercial.
 *
 * O painel padrão é financeiro de ponta a ponta — caixa, lucro, runway, custo
 * de operação. Ele era servido a **todos os papéis**, inclusive a closer e
 * SDR, que na matriz de permissões não têm `view:financials`. A restrição
 * existia em toda parte, menos na primeira tela que a pessoa abre.
 *
 * Em vez de mostrar a mesma tela com metade dos cartões apagados, esta
 * responde a pergunta que interessa a quem vende: **o que é meu, e o que
 * está esperando por mim hoje.**
 */
export function OwnDashboard() {
  const { range } = usePeriod()
  const { session } = useSession()

  const { data: sales = [], isLoading } = useSales()
  const { data: leads = [] } = useLeads()

  const me = session?.user.id

  const metrics = React.useMemo(() => {
    const mySales = sales.filter(
      (sale) => sale.closerId === me || sale.sdrId === me || sale.createdBy === me,
    )
    const inPeriod = activeSales(mySales).filter(
      (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
    )
    const myLeads = leads.filter((lead) => lead.ownerId === me)
    const periodLeads = myLeads.filter(
      (lead) => lead.enteredAt >= range.from && lead.enteredAt <= range.to,
    )

    return {
      summary: summarizeSales(inPeriod),
      totals: totalizeLeads(periodLeads),
      open: openLeads(myLeads),
      attention: leadsNeedingAttention(myLeads, today()),
      // Win rate pessoal, na mesma conta do funil: vendas ÷ leads.
      winRate: periodLeads.length ? inPeriod.length / periodLeads.length : null,
    }
  }, [sales, leads, me, range])

  return (
    <>
      <PageHeader
        title="Seu painel"
        description="Suas vendas no período e os leads que estão esperando por você."
      />

      <KpiGrid className="mb-4">
        <KpiCard
          label="Suas vendas"
          value={formatNumber(metrics.summary.count)}
          secondary={formatMoney(metrics.summary.totalCents)}
          loading={isLoading}
        />
        <KpiCard
          label="Ticket médio"
          value={formatMoney(metrics.summary.averageTicketCents)}
          loading={isLoading}
        />
        <KpiCard label="MRR vendido" value={formatMoney(metrics.summary.mrrCents)} />
        <KpiCard
          label="Win rate"
          value={metrics.winRate != null ? formatPercent(metrics.winRate) : '—'}
          secondary={`${formatNumber(metrics.summary.count)} vendas ÷ ${formatNumber(
            metrics.totals.total,
          )} leads`}
          hint="Suas vendas no período divididas pelos leads que entraram na sua carteira."
        />
        <KpiCard
          label="Leads em aberto"
          value={formatNumber(metrics.open.length)}
          secondary="na sua carteira"
        />
        <KpiCard
          label="Em negociação"
          value={formatMoney(metrics.open.reduce((sum, lead) => sum + lead.estimatedValueCents, 0))}
          secondary="valor estimado"
        />
      </KpiGrid>

      {metrics.attention.length > 0 && (
        <Card className="mb-4 border-negative/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-negative" />
            <h2 className="text-sm font-medium">
              {metrics.attention.length === 1
                ? '1 lead precisa de atenção'
                : `${metrics.attention.length} leads precisam de atenção`}
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {metrics.attention
              .slice(0, 6)
              .map(({ lead, reason, daysSilent, actionOverdueDays }) => (
                <li key={lead.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{lead.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {reason === 'acao_atrasada'
                        ? `Ação combinada atrasada há ${actionOverdueDays} ${
                            actionOverdueDays === 1 ? 'dia' : 'dias'
                          }`
                        : `Sem contato há ${daysSilent} dias`}
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {LEAD_STAGE_LABEL[lead.stage]}
                  </Badge>
                </li>
              ))}
          </ul>
          <Link
            to="/leads"
            className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Abrir o quadro de leads <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">Próximas ações combinadas</h2>
        {metrics.open.filter((lead) => lead.nextActionAt).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ação agendada. Abra um lead no quadro e combine o próximo passo — é o campo que
            faz o acompanhamento cobrar sozinho.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {metrics.open
              .filter((lead) => lead.nextActionAt)
              .sort((a, b) => (a.nextActionAt ?? '').localeCompare(b.nextActionAt ?? ''))
              .slice(0, 8)
              .map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{lead.name}</span>
                    {lead.nextActionNote && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {lead.nextActionNote}
                      </span>
                    )}
                  </span>
                  <span
                    className={
                      'shrink-0 text-xs tabular-nums ' +
                      ((lead.nextActionAt ?? '') < today()
                        ? 'text-negative'
                        : 'text-muted-foreground')
                    }
                  >
                    {formatDate(lead.nextActionAt as string)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </>
  )
}
