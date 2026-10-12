import * as React from 'react'
import { addMonths, fromIsoDate, toIsoDate, today } from '@/lib/date'
import { billsDueForAutoSettlement } from '@/domain/recurrence'
import { useSession } from '@/app/session'
import { useBills, useGenerateBillsFromRule, useRecurringRules, useSettleBill } from './data'

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
  const { session, allow } = useSession()
  const canManage = allow('manage:recurring')
  const { data: rules = [] } = useRecurringRules()
  const generate = useGenerateBillsFromRule()

  const generateRef = React.useRef(generate.mutateAsync)
  generateRef.current = generate.mutateAsync

  const attempted = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (!canManage || !session) return
    const actorId = session.user.id

    const throughDate = toIsoDate(addMonths(fromIsoDate(today()), HORIZON_MONTHS))

    for (const rule of rules) {
      if (!rule.active || attempted.current.has(rule.id)) continue
      attempted.current.add(rule.id)

      generateRef.current({ ruleId: rule.id, throughDate, actorId }).catch((cause: unknown) => {
        // Falha silenciosa foi o que escondeu que nenhum título nascia em
        // produção — fica pelo menos o rastro no console.
        console.error(`[contas fixas] não foi possível gerar títulos de "${rule.name}"`, cause)
        // Tenta de novo na próxima vez que a lista de regras mudar (ou na
        // próxima sessão) — um erro pontual de rede não pode travar a regra
        // fora do fluxo automático para sempre.
        attempted.current.delete(rule.id)
      })
    }
  }, [canManage, session, rules])
}

/**
 * Baixa sozinha, na data de vencimento, os títulos das regras com
 * `autoSettle` ligado — cria a saída em Entradas e saídas e liquida o
 * título, sem esperar clique.
 *
 * É opt-in por regra (ver `RecurringRule.autoSettle`): por padrão nada aqui
 * baixa nada, preservando a invariante de que vencimento chegar não é prova
 * de pagamento. Quem liga o interruptor está dizendo que aquele custo
 * específico sai sozinho (débito automático, assinatura no cartão) — a
 * automação só formaliza o que já ia acontecer de qualquer forma.
 *
 * Gate por `manage:bills`, não por `manage:recurring`: a ação de fato
 * executada é uma baixa de título, e é essa a permissão que a governa em
 * qualquer outro lugar do produto (`SettleBillDialog`).
 */
export function useAutoSettleRecurringBills() {
  const { session, allow } = useSession()
  const canSettle = allow('manage:bills')
  const { data: rules = [] } = useRecurringRules()
  const { data: bills = [] } = useBills()
  const settle = useSettleBill()

  const settleRef = React.useRef(settle.mutateAsync)
  settleRef.current = settle.mutateAsync

  const attempted = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (!canSettle || !session) return

    const due = billsDueForAutoSettlement(bills, rules, today())

    for (const bill of due) {
      if (attempted.current.has(bill.id)) continue
      attempted.current.add(bill.id)

      settleRef
        .current({
          billId: bill.id,
          amountCents: bill.amountCents,
          date: bill.dueDate,
          accountId: bill.accountId as string,
          actorId: session.user.id,
          notes: 'Baixa automática — conta fixa com débito automático ligado.',
        })
        .catch(() => {
          // Erro pontual (rede, conta arquivada) não pode travar a regra fora
          // do automático para sempre — tenta de novo na próxima mudança.
          attempted.current.delete(bill.id)
        })
    }
  }, [canSettle, session, bills, rules])
}
