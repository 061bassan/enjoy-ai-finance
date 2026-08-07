import { addMonths, fromIsoDate, toIsoDate, type IsoDate } from '@/lib/date'
import { splitCents } from '@/lib/money'
import type { NewEntity } from './contracts'
import type { Bill, Sale } from './types'

/**
 * Desenho dos títulos a receber de uma venda — a regra única dos dois mundos.
 *
 * Estava como método privado de `LocalOperations`. Saiu para cá porque o
 * provider Supabase precisa gerar EXATAMENTE os mesmos títulos: uma venda
 * digitada à mão e uma venda vinda do CRM (ou do Postgres) que parcelassem
 * diferente seriam um bug impossível de achar — os dois caminhos parecem
 * certos quando olhados separadamente. É por isso que a `0002` adiou o
 * `convert_lead_to_sale`: escrever esta conta uma segunda vez, em PL/pgSQL,
 * garantiria a divergência. Mantendo-a aqui, em TypeScript, ela é escrita
 * uma vez só, e cada provider apenas persiste o resultado.
 *
 * Puro e sem I/O de propósito. O `stamp` injetado carimba id/createdAt/
 * updatedAt: local usa `newId`+`nowIso`; Supabase usa `crypto.randomUUID`+
 * ISO. O groupId também entra por parâmetro pela mesma razão.
 *
 * O modelo comercial que ela materializa:
 * - `setupCents` vira um título único no primeiro vencimento;
 * - `mrrCents` vira um título por mês de contrato;
 * - modelos sem recorrência dividem o total no número de parcelas, com
 *   `splitCents` para não perder nem inventar centavo no arredondamento.
 */
export function buildReceivables(
  sale: Sale,
  firstDueDate: IsoDate | undefined,
  stamp: (draft: NewEntity<Bill>) => Bill,
  groupId: string,
): Bill[] {
  const firstDue = firstDueDate ?? sale.saleDate
  const drafts: NewEntity<Bill>[] = []

  const base = {
    workspaceId: sale.workspaceId,
    direction: 'receivable' as const,
    partyName: sale.clientName,
    clientId: sale.clientId,
    categoryId: null,
    costCenter: null,
    status: 'open' as const,
    saleId: sale.id,
    installmentGroupId: groupId,
    createdBy: sale.createdBy,
    issueDate: sale.saleDate,
  }

  if (sale.setupCents > 0) {
    drafts.push({
      ...base,
      description: `Implantação — ${sale.clientName}`,
      amountCents: sale.setupCents,
      dueDate: firstDue,
      installmentNumber: null,
      installmentTotal: null,
    })
  }

  if (sale.mrrCents > 0) {
    const months = Math.max(1, sale.contractMonths ?? 12)
    for (let i = 0; i < months; i++) {
      drafts.push({
        ...base,
        description: `Mensalidade ${i + 1}/${months} — ${sale.clientName}`,
        amountCents: sale.mrrCents,
        dueDate: toIsoDate(addMonths(fromIsoDate(firstDue), i)),
        installmentNumber: i + 1,
        installmentTotal: months,
      })
    }
  }

  // Modelos sem recorrência: o valor do contrato menos o que já virou setup.
  const oneOffTotal = sale.mrrCents > 0 ? 0 : sale.amountCents - sale.setupCents
  if (oneOffTotal > 0) {
    const parts = Math.max(1, sale.installments || 1)
    const amounts = splitCents(oneOffTotal, parts)
    amounts.forEach((amount, i) => {
      drafts.push({
        ...base,
        description:
          parts > 1
            ? `${sale.clientName} — parcela ${i + 1}/${parts}`
            : `${sale.clientName} — ${sale.model}`,
        amountCents: amount,
        dueDate: toIsoDate(addMonths(fromIsoDate(firstDue), i)),
        installmentNumber: parts > 1 ? i + 1 : null,
        installmentTotal: parts > 1 ? parts : null,
      })
    })
  }

  return drafts.map((draft) => stamp(draft))
}
