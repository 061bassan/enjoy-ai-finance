import * as React from 'react'
import { addMonths, fromIsoDate, toIsoDate, today } from '@/lib/date'
import { useSession } from '@/app/session'
import { useGenerateBillsFromRule, useRecurringRules } from './data'

/** Meses de folga mantidos à frente — o mesmo intervalo do botão manual. */
const HORIZON_MONTHS = 3

/**
 * Mantém os títulos de cada regra recorrente ativa sempre gerados com meses
 * de folga, sem depender de alguém lembrar de clicar em "Gerar títulos".
 *
 * Roda uma vez por regra a cada sessão (o `Set` abaixo evita repetir a
 * chamada a cada refetch de `rules`) — `generateBillsFromRule` já é
 * idempotente, então uma chamada a mais nunca duplica título. O ganho de não
 * chamar toda hora é só evitar tráfego à toa.
 *
 * Isso NUNCA cria transação nem marca título como pago: só garante que o
 * título exista a tempo de aparecer em "A pagar" e no previsto do fluxo de
 * caixa. A baixa continua sendo uma decisão de quem confirma o pagamento.
 */
export function useAutoGenerateRecurringBills() {
  const { allow } = useSession()
  const canManage = allow('manage:recurring')
  const { data: rules = [] } = useRecurringRules()
  const generate = useGenerateBillsFromRule()

  const generateRef = React.useRef(generate.mutateAsync)
  generateRef.current = generate.mutateAsync

  const attempted = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (!canManage) return

    const throughDate = toIsoDate(addMonths(fromIsoDate(today()), HORIZON_MONTHS))

    for (const rule of rules) {
      if (!rule.active || attempted.current.has(rule.id)) continue
      attempted.current.add(rule.id)

      generateRef.current({ ruleId: rule.id, throughDate }).catch(() => {
        // Tenta de novo na próxima vez que a lista de regras mudar (ou na
        // próxima sessão) — um erro pontual de rede não pode travar a regra
        // fora do fluxo automático para sempre.
        attempted.current.delete(rule.id)
      })
    }
  }, [canManage, rules])
}
