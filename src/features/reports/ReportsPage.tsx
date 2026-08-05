import * as React from 'react'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { formatDate, formatMonthLabel, monthsInRange } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent } from '@/lib/money'
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv'
import {
  BILL_DIRECTION_LABEL,
  COST_CENTER_LABEL,
  LEAD_SOURCE_LABEL,
  SALE_MODEL_LABEL,
  SALE_STATUS_LABEL,
  TRANSACTION_KIND_LABEL,
} from '@/data/enums'
import type { Bill, Sale, Transaction } from '@/data/types'
import { toBillViews } from '@/domain/bills'
import {
  expensesByCostCenter,
  grossRevenue,
  inRange,
  monthlySeries,
  netMargin,
  netProfit,
  totalExpenses,
} from '@/domain/finance'
import { saleEconomics, summarizeSales } from '@/domain/sales'
import { commercialKpis, daysInPeriod, totalizeCommercial } from '@/domain/commercial'
import { leadsInPeriod } from '@/domain/leads'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useAccounts,
  useBillPayments,
  useBills,
  useCategories,
  useClients,
  useCommercialDays,
  useLeads,
  useProfileMap,
  useSales,
  useSaleCosts,
  useTransactions,
} from '@/hooks/data'

/**
 * Relatórios.
 *
 * A exportação em PDF usa a impressão do navegador em vez de uma biblioteca:
 * o resultado é fiel ao que está na tela, não precisa de 300 kB de dependência
 * e o usuário escolhe "Salvar como PDF" no próprio diálogo. Para a necessidade
 * aqui — mandar o fechamento do mês para o contador — resolve.
 */
export function ReportsPage() {
  const { range } = usePeriod()
  const { workspace } = useSession()

  const { data: transactions = [] } = useTransactions()
  const { data: bills = [] } = useBills()
  const { data: payments = [] } = useBillPayments()
  const { data: sales = [] } = useSales()
  const { data: saleCosts = [] } = useSaleCosts()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: clients = [] } = useClients()
  const { data: days = [] } = useCommercialDays()
  const { data: leads = [] } = useLeads()
  const profileMap = useProfileMap()

  const categoryNames = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )
  const accountNames = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  )
  const costsBySale = React.useMemo(
    () => new Map(saleCosts.map((cost) => [cost.saleId, cost])),
    [saleCosts],
  )

  const report = React.useMemo(() => {
    const periodTransactions = inRange(transactions, range)
    const periodSales = sales.filter(
      (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
    )
    const periodBills = bills.filter(
      (bill) => bill.dueDate >= range.from && bill.dueDate <= range.to,
    )
    const commercial = totalizeCommercial(daysInPeriod(days, range))

    return {
      transactions: periodTransactions,
      sales: periodSales,
      bills: periodBills,
      revenue: grossRevenue(periodTransactions),
      expenses: totalExpenses(periodTransactions),
      profit: netProfit(periodTransactions),
      margin: netMargin(periodTransactions),
      series: monthlySeries(transactions, monthsInRange(range)),
      costCenters: expensesByCostCenter(periodTransactions, COST_CENTER_LABEL),
      salesSummary: summarizeSales(periodSales),
      commercial,
      commercialKpis: commercialKpis(commercial, periodSales, {
        leadCount: leadsInPeriod(leads, range).length,
      }),
      billViews: toBillViews(periodBills, payments),
    }
  }, [transactions, sales, bills, payments, days, leads, range])

  const periodLabel = `${formatDate(range.from)} a ${formatDate(range.to)}`
  const fileSuffix = `${range.from}_${range.to}`

  function exportTransactions() {
    const columns: CsvColumn<Transaction>[] = [
      { header: 'Data', value: (row) => formatDate(row.date) },
      { header: 'Descrição', value: (row) => row.description },
      { header: 'Tipo', value: (row) => TRANSACTION_KIND_LABEL[row.kind] },
      {
        header: 'Categoria',
        value: (row) => (row.categoryId ? (categoryNames.get(row.categoryId) ?? '') : ''),
      },
      {
        header: 'Centro de custo',
        value: (row) => (row.costCenter ? COST_CENTER_LABEL[row.costCenter] : ''),
      },
      { header: 'Conta', value: (row) => accountNames.get(row.accountId) ?? '' },
      { header: 'Valor', value: (row) => row.amountCents, money: true },
    ]
    downloadCsv(`transacoes_${fileSuffix}`, toCsv(report.transactions, columns))
    toast.success('Relatório de transações exportado.')
  }

  function exportSales() {
    const columns: CsvColumn<Sale>[] = [
      { header: 'Data', value: (row) => formatDate(row.saleDate) },
      { header: 'Cliente', value: (row) => row.clientName },
      { header: 'Empresa', value: (row) => row.company ?? '' },
      {
        header: 'Closer',
        value: (row) => (row.closerId ? (profileMap.get(row.closerId)?.name ?? '') : ''),
      },
      { header: 'SDR', value: (row) => (row.sdrId ? (profileMap.get(row.sdrId)?.name ?? '') : '') },
      {
        header: 'Origem',
        value: (row) => (row.leadSource ? LEAD_SOURCE_LABEL[row.leadSource] : ''),
      },
      { header: 'Modelo', value: (row) => SALE_MODEL_LABEL[row.model] },
      { header: 'Valor do contrato', value: (row) => row.amountCents, money: true },
      { header: 'MRR', value: (row) => row.mrrCents, money: true },
      { header: 'Implantação', value: (row) => row.setupCents, money: true },
      {
        header: 'Custo total',
        value: (row) => saleEconomics(row, costsBySale.get(row.id)).costCents,
        money: true,
      },
      {
        header: 'Lucro líquido',
        value: (row) => saleEconomics(row, costsBySale.get(row.id)).netProfitCents,
        money: true,
      },
      {
        header: 'Margem',
        value: (row) => {
          const margin = saleEconomics(row, costsBySale.get(row.id)).margin
          return margin != null ? Number((margin * 100).toFixed(2)) : ''
        },
      },
      { header: 'Status', value: (row) => SALE_STATUS_LABEL[row.status] },
    ]
    downloadCsv(`vendas_${fileSuffix}`, toCsv(report.sales, columns))
    toast.success('Relatório de vendas exportado.')
  }

  function exportBills() {
    const columns: CsvColumn<Bill>[] = [
      { header: 'Vencimento', value: (row) => formatDate(row.dueDate) },
      { header: 'Direção', value: (row) => BILL_DIRECTION_LABEL[row.direction] },
      { header: 'Parte', value: (row) => row.partyName },
      { header: 'Descrição', value: (row) => row.description },
      {
        header: 'Centro de custo',
        value: (row) => (row.costCenter ? COST_CENTER_LABEL[row.costCenter] : ''),
      },
      { header: 'Valor', value: (row) => row.amountCents, money: true },
      {
        header: 'Em aberto',
        value: (row) =>
          report.billViews.find((view) => view.bill.id === row.id)?.outstandingCents ?? 0,
        money: true,
      },
      {
        header: 'Situação',
        value: (row) => {
          const view = report.billViews.find((item) => item.bill.id === row.id)
          if (!view) return ''
          return view.status === 'overdue' ? `Vencido há ${view.daysLate} dias` : view.status
        },
      },
    ]
    downloadCsv(`titulos_${fileSuffix}`, toCsv(report.bills, columns))
    toast.success('Relatório de títulos exportado.')
  }

  function exportCommercial() {
    const rows = daysInPeriod(days, range)
    downloadCsv(
      `comercial_${fileSuffix}`,
      toCsv(rows, [
        { header: 'Data', value: (row) => formatDate(row.date) },
        { header: 'Leads', value: (row) => row.leads },
        { header: 'Calls', value: (row) => row.calls },
        { header: 'Reuniões', value: (row) => row.meetings },
        { header: 'No-shows', value: (row) => row.noShows },
        { header: 'Propostas enviadas', value: (row) => row.proposalsSent },
        { header: 'Propostas aprovadas', value: (row) => row.proposalsApproved },
        { header: 'Contratos assinados', value: (row) => row.contractsSigned },
        { header: 'Investimento em tráfego', value: (row) => row.adsInvestmentCents, money: true },
        { header: 'Investimento SDR', value: (row) => row.sdrInvestmentCents, money: true },
        { header: 'Investimento Closer', value: (row) => row.closerInvestmentCents, money: true },
      ]),
    )
    toast.success('Relatório comercial exportado.')
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={`${workspace?.name ?? ''} · ${periodLabel}`}
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Imprimir / PDF
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <h3 className="mb-1 text-sm font-medium">Exportar</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          CSV com separador ponto e vírgula e acentuação UTF-8 — abre direto no Excel em português.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportTransactions}>
            <Download /> Transações ({report.transactions.length})
          </Button>
          <Button variant="outline" onClick={exportSales}>
            <Download /> Vendas ({report.sales.length})
          </Button>
          <Button variant="outline" onClick={exportBills}>
            <Download /> Títulos ({report.bills.length})
          </Button>
          <Button variant="outline" onClick={exportCommercial}>
            <FileSpreadsheet /> Comercial
          </Button>
        </div>
      </Card>

      {/* Relatório executivo em tela — é o que sai na impressão. */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Relatório do período</h2>
          <p className="text-sm text-muted-foreground">
            {workspace?.name} · {periodLabel}
          </p>
        </div>

        <Section title="Resultado financeiro">
          <SummaryGrid
            items={[
              { label: 'Receita bruta', value: formatMoney(report.revenue) },
              { label: 'Despesas', value: formatMoney(report.expenses) },
              { label: 'Lucro líquido', value: formatMoney(report.profit) },
              {
                label: 'Margem',
                value: report.margin != null ? formatPercent(report.margin) : '—',
              },
            ]}
          />
        </Section>

        <Section title="Resultado por mês">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead data-numeric>Receita</TableHead>
                <TableHead data-numeric>Despesa</TableHead>
                <TableHead data-numeric>Lucro</TableHead>
                <TableHead data-numeric>Acumulado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.series.map((point) => (
                <TableRow key={point.month}>
                  <TableCell>{formatMonthLabel(point.month)}</TableCell>
                  <TableCell data-numeric>{formatMoney(point.revenueCents)}</TableCell>
                  <TableCell data-numeric>{formatMoney(point.expenseCents)}</TableCell>
                  <TableCell data-numeric className="font-medium">
                    {formatMoney(point.profitCents)}
                  </TableCell>
                  <TableCell data-numeric className="text-muted-foreground">
                    {formatMoney(point.cumulativeProfitCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Despesas por centro de custo">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Centro de custo</TableHead>
                <TableHead data-numeric>Valor</TableHead>
                <TableHead data-numeric>Participação</TableHead>
                <TableHead data-numeric>Lançamentos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.costCenters.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell>{entry.label}</TableCell>
                  <TableCell data-numeric>{formatMoney(entry.totalCents)}</TableCell>
                  <TableCell data-numeric>{formatPercent(entry.share)}</TableCell>
                  <TableCell data-numeric className="text-muted-foreground">
                    {entry.count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Comercial">
          <SummaryGrid
            items={[
              { label: 'Vendas', value: formatNumber(report.salesSummary.count) },
              { label: 'Valor vendido', value: formatMoney(report.salesSummary.totalCents) },
              { label: 'Ticket médio', value: formatMoney(report.salesSummary.averageTicketCents) },
              { label: 'MRR vendido', value: formatMoney(report.salesSummary.mrrCents) },
              { label: 'Leads', value: formatNumber(report.commercialKpis.leadCount) },
              { label: 'Reuniões', value: formatNumber(report.commercial.meetings) },
              {
                label: 'Win rate (vendas ÷ leads)',
                value:
                  report.commercialKpis.winRate != null
                    ? formatPercent(report.commercialKpis.winRate)
                    : '—',
              },
              {
                label: 'CAC',
                value:
                  report.commercialKpis.cacCents != null
                    ? formatMoney(report.commercialKpis.cacCents)
                    : '—',
              },
            ]}
          />
        </Section>

        <p className="mt-6 text-xs text-muted-foreground">
          Gerado em {formatDate(new Date().toISOString().slice(0, 10))} ·{' '}
          {clients.filter((client) => client.status === 'active').length} clientes ativos na base.
        </p>
      </Card>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
      <Separator className="mt-6" />
    </div>
  )
}

function SummaryGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-base font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
