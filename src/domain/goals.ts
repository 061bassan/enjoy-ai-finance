import { addMonths, fromIsoDate, toIsoDate, today, type IsoDate } from '@/lib/date'
import { safeRatio, sumCents, type Cents } from '@/lib/money'
import type { Goal, GoalContribution, PurchaseGoal } from '@/data/types'

/**
 * Metas financeiras e de compra.
 *
 * O progresso de uma meta é SEMPRE a soma dos aportes — nunca um campo
 * guardado. Um aporte estornado reduz o progresso automaticamente; com campo
 * denormalizado, alguém teria que lembrar de descontar.
 */

export interface GoalProgress {
  goal: Goal
  savedCents: Cents
  remainingCents: Cents
  /** Razão entre 0 e 1 (pode passar de 1 quando a meta é superada). */
  ratio: number
  contributionCount: number
  /** Média mensal de aporte observada até aqui. */
  averageMonthlyCents: Cents | null
  /** Quando a meta será atingida no ritmo atual. */
  projectedDate: IsoDate | null
  /** Meses que faltam no ritmo atual. */
  monthsRemaining: number | null
  /** A meta chega no prazo definido? `null` quando não há prazo. */
  onTrack: boolean | null
}

export function goalProgress(
  goal: Goal,
  contributions: readonly GoalContribution[],
  reference: IsoDate = today(),
): GoalProgress {
  const own = contributions.filter((contribution) => contribution.goalId === goal.id)
  const saved = sumCents(own.map((contribution) => contribution.amountCents))
  const remaining = Math.max(0, goal.targetCents - saved)

  // Ritmo: total aportado dividido pelos meses decorridos desde o primeiro aporte.
  let averageMonthly: Cents | null = null
  if (own.length > 0) {
    const dates = own.map((c) => c.date).sort()
    const first = dates[0]
    if (first) {
      const monthsElapsed = Math.max(
        1,
        (fromIsoDate(reference).getFullYear() - fromIsoDate(first).getFullYear()) * 12 +
          (fromIsoDate(reference).getMonth() - fromIsoDate(first).getMonth()) +
          1,
      )
      averageMonthly = Math.round(saved / monthsElapsed)
    }
  }

  const monthsRemaining =
    averageMonthly && averageMonthly > 0 && remaining > 0 ? remaining / averageMonthly : null

  const projectedDate =
    monthsRemaining != null
      ? toIsoDate(addMonths(fromIsoDate(reference), Math.ceil(monthsRemaining)))
      : remaining === 0
        ? reference
        : null

  return {
    goal,
    savedCents: saved,
    remainingCents: remaining,
    ratio: goal.targetCents ? saved / goal.targetCents : 0,
    contributionCount: own.length,
    averageMonthlyCents: averageMonthly,
    projectedDate,
    monthsRemaining,
    onTrack: goal.targetDate && projectedDate ? projectedDate <= goal.targetDate : null,
  }
}

/** Quanto precisa ser aportado por mês para bater a meta no prazo. */
export function requiredMonthlyContribution(
  progress: GoalProgress,
  reference: IsoDate = today(),
): Cents | null {
  const targetDate = progress.goal.targetDate
  if (!targetDate || progress.remainingCents === 0) return null

  const months =
    (fromIsoDate(targetDate).getFullYear() - fromIsoDate(reference).getFullYear()) * 12 +
    (fromIsoDate(targetDate).getMonth() - fromIsoDate(reference).getMonth())

  if (months <= 0) return progress.remainingCents
  return Math.round(progress.remainingCents / months)
}

export interface PurchaseAffordability {
  purchase: PurchaseGoal
  remainingCents: Cents
  ratio: number
  /** Meses até juntar o que falta, dada a sobra mensal do negócio. */
  monthsToAfford: number | null
  /** Data estimada em que a compra cabe no caixa. */
  affordableAt: IsoDate | null
  /** Já dá para comprar agora com o caixa disponível. */
  affordableNow: boolean
}

/**
 * Quando uma meta de compra cabe no caixa.
 *
 * `monthlySurplusCents` é a sobra média mensal da operação. Se a operação não
 * sobra dinheiro, `monthsToAfford` é null — e a resposta honesta é "não cabe
 * no ritmo atual", não uma data inventada.
 */
export function purchaseAffordability(
  purchase: PurchaseGoal,
  monthlySurplusCents: Cents,
  availableCashCents: Cents,
  reference: IsoDate = today(),
): PurchaseAffordability {
  const remaining = Math.max(0, purchase.estimatedCents - purchase.savedCents)

  const monthsToAfford =
    remaining === 0 ? 0 : monthlySurplusCents > 0 ? remaining / monthlySurplusCents : null

  return {
    purchase,
    remainingCents: remaining,
    ratio: purchase.estimatedCents ? purchase.savedCents / purchase.estimatedCents : 0,
    monthsToAfford,
    affordableAt:
      monthsToAfford != null
        ? toIsoDate(addMonths(fromIsoDate(reference), Math.ceil(monthsToAfford)))
        : null,
    affordableNow: remaining <= availableCashCents,
  }
}

/** Ordena metas de compra por prioridade e, dentro dela, pelo que falta menos. */
export function sortPurchases(purchases: readonly PurchaseGoal[]): PurchaseGoal[] {
  return [...purchases].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const remainingA = a.estimatedCents - a.savedCents
    const remainingB = b.estimatedCents - b.savedCents
    return remainingA - remainingB
  })
}

export interface TargetProgress {
  label: string
  currentValue: number
  targetValue: number
  ratio: number | null
  format: 'money' | 'number' | 'percent'
}

/** Progresso de cada meta mensal, pronto para a lista de barras. */
export function monthlyTargetProgress(
  target: {
    revenueCents: Cents
    profitCents: Cents
    salesCount: number
    meetingsCount: number
    proposalsCount: number
    clientsCount: number
    mrrCents: Cents
    setupCents: Cents
    marginPercent: number
  },
  actual: {
    revenueCents: Cents
    profitCents: Cents
    salesCount: number
    meetingsCount: number
    proposalsCount: number
    newClientsCount: number
    mrrCents: Cents
    setupCents: Cents
    marginPercent: number
  },
): TargetProgress[] {
  const rows: TargetProgress[] = [
    {
      label: 'Faturamento',
      currentValue: actual.revenueCents,
      targetValue: target.revenueCents,
      format: 'money',
      ratio: safeRatio(actual.revenueCents, target.revenueCents),
    },
    {
      label: 'Lucro',
      currentValue: actual.profitCents,
      targetValue: target.profitCents,
      format: 'money',
      ratio: safeRatio(actual.profitCents, target.profitCents),
    },
    {
      label: 'MRR',
      currentValue: actual.mrrCents,
      targetValue: target.mrrCents,
      format: 'money',
      ratio: safeRatio(actual.mrrCents, target.mrrCents),
    },
    {
      label: 'Implantação',
      currentValue: actual.setupCents,
      targetValue: target.setupCents,
      format: 'money',
      ratio: safeRatio(actual.setupCents, target.setupCents),
    },
    {
      label: 'Vendas',
      currentValue: actual.salesCount,
      targetValue: target.salesCount,
      format: 'number',
      ratio: safeRatio(actual.salesCount, target.salesCount),
    },
    {
      label: 'Novos clientes',
      currentValue: actual.newClientsCount,
      targetValue: target.clientsCount,
      format: 'number',
      ratio: safeRatio(actual.newClientsCount, target.clientsCount),
    },
    {
      label: 'Reuniões',
      currentValue: actual.meetingsCount,
      targetValue: target.meetingsCount,
      format: 'number',
      ratio: safeRatio(actual.meetingsCount, target.meetingsCount),
    },
    {
      label: 'Propostas',
      currentValue: actual.proposalsCount,
      targetValue: target.proposalsCount,
      format: 'number',
      ratio: safeRatio(actual.proposalsCount, target.proposalsCount),
    },
    {
      label: 'Margem',
      currentValue: actual.marginPercent,
      targetValue: target.marginPercent,
      format: 'percent',
      ratio: safeRatio(actual.marginPercent, target.marginPercent),
    },
  ]

  // Metas não definidas (alvo zero) não viram barra — poluiriam a tela.
  return rows.filter((row) => row.targetValue > 0)
}

// ---------------------------------------------------------------------------
// Painel de metas — ritmo, projeção e curva acumulada do mês
// ---------------------------------------------------------------------------

export type PaceStatus = 'reached' | 'on_track' | 'behind' | 'missed'

export interface GoalPace {
  /** Realizado ÷ meta (pode passar de 1). */
  ratio: number
  /** Onde o realizado "deveria" estar hoje, se o mês fosse linear (0–1). */
  expectedRatio: number
  /** Valor no fim do mês mantendo o ritmo atual. `null` sem dia decorrido. */
  projectedValue: number | null
  /** Quanto precisa entrar por dia, nos dias que restam, para bater a meta. */
  requiredPerDay: number | null
  remainingValue: number
  daysLeft: number
  status: PaceStatus
}

/**
 * Situação de uma meta do mês contra o calendário.
 *
 * "No ritmo" compara com a reta ideal (meta × dias decorridos ÷ dias do mês),
 * com 5% de folga: no dia 3 ninguém está exatamente em 10%, e um painel que
 * pinta de vermelho por R$ 50 de diferença ensina a ignorar o vermelho.
 *
 * Métrica que não acumula (margem) não tem ritmo — só bateu ou não.
 */
export function goalPace(input: {
  current: number
  target: number
  elapsedDays: number
  totalDays: number
  cumulative?: boolean
}): GoalPace {
  const { current, target, totalDays } = input
  const cumulative = input.cumulative ?? true
  const elapsed = Math.min(Math.max(0, input.elapsedDays), totalDays)
  const ratio = target > 0 ? current / target : 0
  const expectedRatio = cumulative && totalDays > 0 ? elapsed / totalDays : 1
  const daysLeft = totalDays - elapsed
  const remainingValue = Math.max(0, target - current)

  const projectedValue =
    cumulative && elapsed > 0 ? Math.round((current / elapsed) * totalDays) : null
  const requiredPerDay =
    cumulative && remainingValue > 0 && daysLeft > 0 ? remainingValue / daysLeft : null

  let status: PaceStatus
  if (ratio >= 1) status = 'reached'
  else if (daysLeft === 0) status = 'missed'
  else if (!cumulative) status = 'behind'
  else status = ratio >= expectedRatio * 0.95 ? 'on_track' : 'behind'

  return { ratio, expectedRatio, projectedValue, requiredPerDay, remainingValue, daysLeft, status }
}

export interface CumulativePoint {
  date: IsoDate
  /** Dia do mês (1–31), o rótulo do eixo. */
  day: number
  /** Realizado acumulado até o dia. `null` nos dias que ainda não chegaram. */
  realized: number | null
  /** Reta ideal até a meta. */
  ideal: number
}

/**
 * Curva do mês: realizado acumulado dia a dia contra a reta ideal.
 *
 * `valueUntil(dia)` devolve o realizado do primeiro dia do mês até `dia` — o
 * painel passa a MESMA conta da lista de metas, então o ponto final da curva
 * é sempre igual ao número que aparece no cartão.
 */
export function cumulativeSeries(
  days: readonly IsoDate[],
  target: number,
  asOf: IsoDate,
  valueUntil: (day: IsoDate) => number,
): CumulativePoint[] {
  const total = days.length
  return days.map((date, index) => ({
    date,
    day: Number(date.slice(8, 10)),
    realized: date <= asOf ? valueUntil(date) : null,
    // Sem arredondar: em metas pequenas (6 vendas) a reta viraria escada.
    ideal: total ? (target * (index + 1)) / total : 0,
  }))
}
