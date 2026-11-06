import { describe, expect, it } from 'vitest'
import { daysInRange, rangeOfMonth } from '@/lib/date'
import {
  cumulativeSeries,
  goalPace,
  splitTargetByWeeks,
  weeklyBreakdown,
  weeksOfMonth,
} from './goals'

describe('goalPace', () => {
  // Meta de R$ 30.000 num mês de 30 dias: a reta ideal anda R$ 1.000/dia.
  const base = { target: 30_000, totalDays: 30 }

  it('está no ritmo quando o realizado acompanha a reta ideal', () => {
    const pace = goalPace({ ...base, current: 10_000, elapsedDays: 10 })
    expect(pace.status).toBe('on_track')
    expect(pace.expectedRatio).toBeCloseTo(1 / 3)
    expect(pace.projectedValue).toBe(30_000)
  })

  it('tolera 5% abaixo da reta antes de acusar atraso', () => {
    expect(goalPace({ ...base, current: 9_600, elapsedDays: 10 }).status).toBe('on_track')
    expect(goalPace({ ...base, current: 9_000, elapsedDays: 10 }).status).toBe('behind')
  })

  it('calcula quanto falta por dia nos dias restantes', () => {
    const pace = goalPace({ ...base, current: 12_000, elapsedDays: 12 })
    expect(pace.remainingValue).toBe(18_000)
    expect(pace.daysLeft).toBe(18)
    expect(pace.requiredPerDay).toBe(1_000)
  })

  it('meta batida vale mesmo antes do fim do mês', () => {
    const pace = goalPace({ ...base, current: 31_000, elapsedDays: 20 })
    expect(pace.status).toBe('reached')
    expect(pace.requiredPerDay).toBeNull()
  })

  it('mês encerrado abaixo da meta fica como não atingida', () => {
    expect(goalPace({ ...base, current: 20_000, elapsedDays: 30 }).status).toBe('missed')
  })

  it('sem dia decorrido não inventa projeção', () => {
    expect(goalPace({ ...base, current: 0, elapsedDays: 0 }).projectedValue).toBeNull()
  })

  it('métrica que não acumula (margem) não usa ritmo', () => {
    const pace = goalPace({ ...base, target: 35, current: 30, elapsedDays: 10, cumulative: false })
    expect(pace.status).toBe('behind')
    expect(pace.projectedValue).toBeNull()
    expect(pace.requiredPerDay).toBeNull()
  })

  it('meta zero não divide por zero', () => {
    expect(goalPace({ current: 10, target: 0, elapsedDays: 5, totalDays: 30 }).ratio).toBe(0)
  })
})

describe('cumulativeSeries', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
  const entries: Record<string, number> = { '2026-10-01': 100, '2026-10-03': 50 }
  const valueUntil = (day: string) =>
    Object.entries(entries)
      .filter(([date]) => date <= day)
      .reduce((sum, [, value]) => sum + value, 0)

  it('acumula o realizado e para no dia de hoje', () => {
    const series = cumulativeSeries(days, 400, '2026-10-03', valueUntil)
    expect(series.map((p) => p.realized)).toEqual([100, 100, 150, null])
  })

  it('a reta ideal termina exatamente na meta', () => {
    const series = cumulativeSeries(days, 400, '2026-10-03', valueUntil)
    expect(series.map((p) => p.ideal)).toEqual([100, 200, 300, 400])
    expect(series.map((p) => p.day)).toEqual([1, 2, 3, 4])
  })
})

describe('weeksOfMonth', () => {
  it('começa cada semana na segunda e não sai do mês', () => {
    // Junho/2026 começa numa segunda e termina numa terça (2 dias, que se juntam).
    const weeks = weeksOfMonth('2026-06-01')
    expect(weeks.map((w) => [w.from, w.to])).toEqual([
      ['2026-06-01', '2026-06-07'],
      ['2026-06-08', '2026-06-14'],
      ['2026-06-15', '2026-06-21'],
      ['2026-06-22', '2026-06-30'],
    ])
  })

  it('junta a sobra de 1 ou 2 dias na semana vizinha, nas duas pontas', () => {
    // Novembro/2026 começa num domingo (1 dia) e termina numa segunda (1 dia).
    const weeks = weeksOfMonth('2026-11-15')
    expect(weeks.map((w) => [w.from, w.to, w.days])).toEqual([
      ['2026-11-01', '2026-11-08', 8],
      ['2026-11-09', '2026-11-15', 7],
      ['2026-11-16', '2026-11-22', 7],
      ['2026-11-23', '2026-11-30', 8],
    ])
  })

  it('mantém como semana própria um pedaço de 3 dias ou mais', () => {
    // Agosto/2024 começa numa quinta: quinta, sexta, sábado e domingo.
    expect(weeksOfMonth('2024-08-01')[0]).toMatchObject({ from: '2024-08-01', days: 4 })
  })

  it('cobre todos os dias de qualquer mês, sem furo nem repetição', () => {
    for (let month = 1; month <= 12; month++) {
      const reference = `2026-${String(month).padStart(2, '0')}-01`
      const weeks = weeksOfMonth(reference)
      const total = daysInRange(rangeOfMonth(reference)).length
      expect(weeks.reduce((sum, w) => sum + w.days, 0)).toBe(total)
      expect(weeks.length).toBeGreaterThanOrEqual(4)
      expect(weeks.length).toBeLessThanOrEqual(5)
    }
  })
})

describe('splitTargetByWeeks', () => {
  const weeks = weeksOfMonth('2026-11-01')

  it('divide proporcional aos dias', () => {
    // 30 dias: R$ 3.000,00 são 10.000 centavos por dia.
    expect(splitTargetByWeeks(300_000, weeks)).toEqual([80_000, 70_000, 70_000, 80_000])
  })

  it('a soma fecha exatamente na meta, sem sobrar centavo', () => {
    const shares = splitTargetByWeeks(100_001, weeks)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100_001)
    expect(shares.every(Number.isInteger)).toBe(true)
  })

  it('meta pequena continua inteira e fechando', () => {
    const shares = splitTargetByWeeks(3, weeks)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(3)
    expect(shares.every(Number.isInteger)).toBe(true)
  })
})

describe('weeklyBreakdown', () => {
  // Novembro/2026: 8, 7, 7 e 8 dias. Meta 30.000, ou seja, 1.000 por dia.
  const realized: Record<string, number> = { '2026-11-01': 8_000, '2026-11-09': 3_500 }
  const base = {
    month: '2026-11-01',
    target: 30_000,
    cumulative: true,
    valueFor: (range: { from: string }) => realized[range.from] ?? 0,
  }

  it('classifica semana encerrada, atual e futura', () => {
    const rows = weeklyBreakdown({ ...base, asOf: '2026-11-12' })
    expect(rows.map((r) => r.status)).toEqual(['reached', 'behind', 'upcoming', 'upcoming'])
    expect(rows.map((r) => r.isCurrent)).toEqual([false, true, false, false])
    expect(rows.map((r) => r.target)).toEqual([8_000, 7_000, 7_000, 8_000])
  })

  it('semana encerrada abaixo da meta fica como não atingida', () => {
    const rows = weeklyBreakdown({ ...base, asOf: '2026-11-20' })
    expect(rows[1]).toMatchObject({ current: 3_500, status: 'missed' })
  })

  it('semana futura não mostra realizado', () => {
    const rows = weeklyBreakdown({ ...base, asOf: '2026-11-02' })
    expect(rows[3]).toMatchObject({ current: 0, status: 'upcoming', isCurrent: false })
  })

  it('redistribui o que faltou nos dias restantes, só na semana atual', () => {
    // Antes da 3ª semana: 11.500 de 30.000. Faltam 18.500 em 15 dias (7 nesta semana).
    const rows = weeklyBreakdown({ ...base, asOf: '2026-11-17' })
    expect(rows[2]?.catchUpTarget).toBe(Math.round((18_500 * 7) / 15))
    expect(rows[0]?.catchUpTarget).toBeNull()
    expect(rows[3]?.catchUpTarget).toBeNull()
  })

  it('mês encerrado não deixa semana em aberto', () => {
    const rows = weeklyBreakdown({ ...base, asOf: '2026-12-05' })
    expect(rows[3]?.status).toBe('missed')
    expect(rows.some((r) => r.status === 'upcoming' || r.isCurrent)).toBe(false)
  })

  it('mês futuro fica inteiro como "ainda não começou"', () => {
    const rows = weeklyBreakdown({ ...base, asOf: '2026-10-15' })
    expect(rows.every((r) => r.status === 'upcoming' && !r.isCurrent)).toBe(true)
  })

  it('métrica que não acumula não se divide', () => {
    const rows = weeklyBreakdown({
      ...base,
      target: 35,
      cumulative: false,
      valueFor: () => 40,
      asOf: '2026-11-12',
    })
    expect(rows.map((r) => r.target)).toEqual([35, 35, 35, 35])
    expect(rows[0]?.status).toBe('reached')
    expect(rows[1]?.catchUpTarget).toBeNull()
  })

  it('semana sem parte na meta não aparece como perdida', () => {
    const rows = weeklyBreakdown({ ...base, target: 1, valueFor: () => 0, asOf: '2026-11-12' })
    expect(rows[0]).toMatchObject({ target: 0, ratio: null, status: 'reached' })
  })
})
