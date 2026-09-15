import { useMemo } from 'react'
import type { DateRange } from '@/lib/date'
import type { Cents } from '@/lib/money'
import {
  entriesInPeriod,
  entryTotal,
  marketingLeadCpl,
  totalizeMarketing,
  type MarketingLeadCpl,
} from '@/domain/marketing'
import { useMarketingEntries } from './data'

/**
 * Investimento de marketing do período, em centavos.
 *
 * Existe como hook único porque várias telas precisam do mesmo número —
 * Leads, Vendas, Funil de vendas, Visão dos sócios, Evolução e Relatórios —
 * e todas o usam para a mesma coisa: somar ao investimento comercial antes
 * de dividir por lead ou por venda. Se cada uma recortasse o período do seu
 * jeito, o CAC do relatório divergiria do CAC da tela, e a primeira reação
 * de quem visse a diferença seria deixar de confiar nos dois.
 *
 * O recorte é por MÊS (`entriesInPeriod`), não por dia: verba de campanha não
 * se rateia por data.
 */
export function useMarketingInvestment(range: DateRange): Cents {
  const { data: entries = [] } = useMarketingEntries()

  return useMemo(
    () => entriesInPeriod(entries, range).reduce((sum, entry) => sum + entryTotal(entry), 0),
    [entries, range],
  )
}

/**
 * CPL de marketing do período — investimento dividido pelos leads, preferindo
 * o número que a PLATAFORMA informou ao lançar o investimento e caindo para o
 * CRM só quando nenhuma plataforma informou (ver `resolveLeadCount`).
 *
 * Existe para que Leads e Relatórios enxerguem o MESMO número de leads que a
 * própria tela de Marketing calcula — sem isso, cada tela reimplementa a
 * preferência plataforma→CRM do zero e corre o risco de esquecer o lead que
 * a plataforma já informou, mostrando um CPL maior do que o real.
 */
export function useMarketingLeadCpl(range: DateRange, crmLeadCount: number): MarketingLeadCpl {
  const { data: entries = [] } = useMarketingEntries()

  return useMemo(
    () => marketingLeadCpl(totalizeMarketing(entriesInPeriod(entries, range)), crmLeadCount),
    [entries, range, crmLeadCount],
  )
}
