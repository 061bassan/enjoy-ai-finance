import { describe, expect, it } from 'vitest'
import { cumulativeSeries, goalPace } from './goals'

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
