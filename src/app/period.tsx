import * as React from 'react'
import {
  previousRange,
  rangeOfLastDays,
  rangeOfMonth,
  rangeOfYear,
  sameRangeLastYear,
  subMonths,
  fromIsoDate,
  toIsoDate,
  today,
  startOfMonth,
  endOfMonth,
  type DateRange,
} from '@/lib/date'

/**
 * Período global.
 *
 * Um único filtro no header comanda todas as telas. Guardar o preset (e não
 * só as datas) permite que o comparativo saiba o que significa "período
 * anterior": para "este mês" é o mês passado, para "últimos 30 dias" são os
 * 30 dias anteriores.
 */
export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  last90: 'Últimos 90 dias',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
  thisYear: 'Este ano',
  custom: 'Personalizado',
}

export function rangeForPreset(preset: PeriodPreset, reference = today()): DateRange {
  switch (preset) {
    case 'today':
      return { from: reference, to: reference }
    case 'yesterday': {
      const day = toIsoDate(new Date(fromIsoDate(reference).getTime() - 86_400_000))
      return { from: day, to: day }
    }
    case 'last7':
      return rangeOfLastDays(7, reference)
    case 'last30':
      return rangeOfLastDays(30, reference)
    case 'last90':
      return rangeOfLastDays(90, reference)
    case 'thisMonth':
      return rangeOfMonth(reference)
    case 'lastMonth': {
      const prev = subMonths(fromIsoDate(reference), 1)
      return { from: toIsoDate(startOfMonth(prev)), to: toIsoDate(endOfMonth(prev)) }
    }
    case 'thisYear':
      return rangeOfYear(reference)
    case 'custom':
      return rangeOfMonth(reference)
  }
}

interface PeriodContextValue {
  preset: PeriodPreset
  range: DateRange
  /** Intervalo equivalente anterior — base dos comparativos ▲▼. */
  comparisonRange: DateRange
  setPreset: (preset: PeriodPreset) => void
  setCustomRange: (range: DateRange) => void
  /** Alterna a base de comparação entre período anterior e ano anterior. */
  comparisonMode: 'previous' | 'lastYear'
  setComparisonMode: (mode: 'previous' | 'lastYear') => void
}

const PeriodContext = React.createContext<PeriodContextValue | null>(null)

const STORAGE_KEY = 'enjoy.period'

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = React.useState<PeriodPreset>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as PeriodPreset | null) ?? 'thisMonth'
  })
  const [customRange, setCustomRangeState] = React.useState<DateRange>(() => rangeOfMonth())
  const [comparisonMode, setComparisonMode] = React.useState<'previous' | 'lastYear'>('previous')

  const range = React.useMemo(
    () => (preset === 'custom' ? customRange : rangeForPreset(preset)),
    [preset, customRange],
  )

  const comparisonRange = React.useMemo(
    () => (comparisonMode === 'lastYear' ? sameRangeLastYear(range) : previousRange(range)),
    [range, comparisonMode],
  )

  const setPreset = React.useCallback((next: PeriodPreset) => {
    setPresetState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const setCustomRange = React.useCallback((next: DateRange) => {
    setCustomRangeState(next)
    setPresetState('custom')
    localStorage.setItem(STORAGE_KEY, 'custom')
  }, [])

  const value = React.useMemo<PeriodContextValue>(
    () => ({
      preset,
      range,
      comparisonRange,
      setPreset,
      setCustomRange,
      comparisonMode,
      setComparisonMode,
    }),
    [preset, range, comparisonRange, setPreset, setCustomRange, comparisonMode],
  )

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

export function usePeriod(): PeriodContextValue {
  const context = React.useContext(PeriodContext)
  if (!context) throw new Error('usePeriod precisa estar dentro de <PeriodProvider>.')
  return context
}
