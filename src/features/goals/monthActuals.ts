import * as React from 'react'
import type { DateRange } from '@/lib/date'
import { grossRevenue, inRange, netMargin, netProfit } from '@/domain/finance'
import { summarizeSales } from '@/domain/sales'
import { daysInPeriod, totalizeCommercial } from '@/domain/commercial'
import { withMeetingRegistry } from '@/domain/commercialMetrics'
import {
  useClients,
  useCommercialDays,
  useCommercialMeetings,
  useSales,
  useTransactions,
} from '@/hooks/data'

/** O realizado de um intervalo, no formato que `monthlyTargetProgress` espera. */
export interface MonthActuals {
  revenueCents: number
  profitCents: number
  salesCount: number
  meetingsCount: number
  proposalsCount: number
  newClientsCount: number
  mrrCents: number
  setupCents: number
  marginPercent: number
}

/**
 * Fonte única do "realizado" das metas.
 *
 * A lista de metas e o painel de gráficos chamam a MESMA função — se cada um
 * somasse do seu jeito, o ponto final da curva do painel e o número do cartão
 * divergiriam por centavos e ninguém confiaria em nenhum dos dois. Cada linha
 * vem do módulo dono do dado: faturamento das transações, vendas do módulo de
 * vendas, reuniões do diário comercial.
 */
export function useMonthActuals() {
  const { data: transactions = [] } = useTransactions()
  const { data: sales = [] } = useSales()
  const { data: days = [] } = useCommercialDays()
  const { data: registeredMeetings = [] } = useCommercialMeetings()
  const { data: clients = [] } = useClients()

  return React.useCallback(
    (range: DateRange): MonthActuals => {
      const periodTransactions = inRange(transactions, range)
      const periodSales = sales.filter(
        (sale) => sale.saleDate >= range.from && sale.saleDate <= range.to,
      )
      const summary = summarizeSales(periodSales)
      const commercial = withMeetingRegistry(
        totalizeCommercial(daysInPeriod(days, range)),
        registeredMeetings,
        range,
      )
      const newClients = clients.filter(
        (client) =>
          client.startDate && client.startDate >= range.from && client.startDate <= range.to,
      ).length
      const margin = netMargin(periodTransactions)

      return {
        revenueCents: grossRevenue(periodTransactions),
        profitCents: netProfit(periodTransactions),
        salesCount: summary.count,
        meetingsCount: commercial.meetings,
        proposalsCount: commercial.proposalsSent,
        newClientsCount: newClients,
        mrrCents: summary.mrrCents,
        setupCents: summary.setupRevenueCents,
        marginPercent: margin != null ? margin * 100 : 0,
      }
    },
    [transactions, sales, days, clients, registeredMeetings],
  )
}
