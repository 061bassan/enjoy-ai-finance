import type { SupabaseClient } from '@supabase/supabase-js'
import type { CrmBridge } from '../contracts'
import type { CrmLeadDay } from '../types'

interface FunnelRow {
  day: string
  leads: number
  real_leads: number
  qualified: number
}

/**
 * Ponte de leitura com o CRM.
 *
 * O CRM (`enjoy-crm`) mora no schema `crm` do MESMO projeto Supabase e expõe
 * uma única função para o financeiro: `crm.finance_lead_funnel` (migration
 * 0007 de lá). Ela devolve contagens por dia, nunca dados de pessoa, e checa
 * no banco se quem chama é membro deste workspace. O financeiro não lê
 * nenhuma tabela do CRM direto.
 *
 * Qualquer falha (função ainda não aplicada, schema fora da API, sem
 * permissão) vira `null`: a tela mostra a métrica como indisponível e o resto
 * do painel segue funcionando.
 */
export function createCrmBridge(client: SupabaseClient): CrmBridge {
  return {
    async leadFunnel({ workspaceId, from, to }) {
      const { data, error } = await client
        .schema('crm')
        .rpc('finance_lead_funnel', { p_workspace: workspaceId, p_from: from, p_to: to })
      if (error) {
        console.warn('[crm] funil de leads indisponível:', error.message)
        return null
      }
      return ((data ?? []) as FunnelRow[]).map(
        (row): CrmLeadDay => ({
          day: row.day,
          leads: Number(row.leads),
          realLeads: Number(row.real_leads),
          qualified: Number(row.qualified),
        }),
      )
    },
  }
}
