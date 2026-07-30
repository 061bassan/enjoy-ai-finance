import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Datas de negócio circulam como string ISO "YYYY-MM-DD" (sem hora e sem
 * fuso). Isso evita o clássico bug de uma transação do dia 01 aparecer no
 * mês anterior por causa de UTC. Conversão para Date só acontece aqui.
 */
export type IsoDate = string

export function toIsoDate(date: Date): IsoDate {
  return format(date, 'yyyy-MM-dd')
}

export function fromIsoDate(iso: IsoDate): Date {
  return parseISO(`${iso}T00:00:00`)
}

export function today(): IsoDate {
  return toIsoDate(new Date())
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function formatDate(iso: IsoDate): string {
  return format(fromIsoDate(iso), 'dd/MM/yyyy')
}

export function formatDateLong(iso: IsoDate): string {
  return format(fromIsoDate(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export function formatMonthLabel(iso: IsoDate): string {
  return format(fromIsoDate(iso), 'MMM/yy', { locale: ptBR })
}

export function formatMonthLong(iso: IsoDate): string {
  return format(fromIsoDate(iso), "MMMM 'de' yyyy", { locale: ptBR })
}

/** Intervalo fechado de datas — o filtro de período global usa este tipo. */
export interface DateRange {
  from: IsoDate
  to: IsoDate
}

export function isWithinRange(iso: IsoDate, range: DateRange): boolean {
  return iso >= range.from && iso <= range.to
}

export function rangeOfMonth(reference: IsoDate = today()): DateRange {
  const date = fromIsoDate(reference)
  return { from: toIsoDate(startOfMonth(date)), to: toIsoDate(endOfMonth(date)) }
}

export function rangeOfYear(reference: IsoDate = today()): DateRange {
  const date = fromIsoDate(reference)
  return { from: toIsoDate(startOfYear(date)), to: toIsoDate(endOfYear(date)) }
}

export function rangeOfLastDays(days: number, reference: IsoDate = today()): DateRange {
  const date = fromIsoDate(reference)
  return { from: toIsoDate(subDays(date, days - 1)), to: toIsoDate(date) }
}

/**
 * Período equivalente imediatamente anterior — a base de todo comparativo
 * "▲ vs. período anterior". Preserva a duração exata do intervalo.
 */
export function previousRange(range: DateRange): DateRange {
  const from = fromIsoDate(range.from)
  const to = fromIsoDate(range.to)
  const days = differenceInCalendarDays(to, from) + 1
  return { from: toIsoDate(subDays(from, days)), to: toIsoDate(subDays(to, days)) }
}

/** Mesmo período no ano anterior — usado no comparativo anual. */
export function sameRangeLastYear(range: DateRange): DateRange {
  return {
    from: toIsoDate(subYears(fromIsoDate(range.from), 1)),
    to: toIsoDate(subYears(fromIsoDate(range.to), 1)),
  }
}

/** Lista os primeiros dias de cada mês dentro do intervalo. */
export function monthsInRange(range: DateRange): IsoDate[] {
  const months: IsoDate[] = []
  let cursor = startOfMonth(fromIsoDate(range.from))
  const last = startOfMonth(fromIsoDate(range.to))
  while (cursor <= last) {
    months.push(toIsoDate(cursor))
    cursor = addMonths(cursor, 1)
  }
  return months
}

/** Lista todos os dias do intervalo. */
export function daysInRange(range: DateRange): IsoDate[] {
  const days: IsoDate[] = []
  let cursor = fromIsoDate(range.from)
  const last = fromIsoDate(range.to)
  while (cursor <= last) {
    days.push(toIsoDate(cursor))
    cursor = addDays(cursor, 1)
  }
  return days
}

/** Chave "YYYY-MM" para agrupamentos mensais. */
export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7)
}

/** Dias de atraso em relação a hoje (0 quando ainda não venceu). */
export function daysOverdue(dueDate: IsoDate, reference: IsoDate = today()): number {
  const diff = differenceInCalendarDays(fromIsoDate(reference), fromIsoDate(dueDate))
  return diff > 0 ? diff : 0
}

/** Dias até o vencimento (negativo quando já venceu). */
export function daysUntil(dueDate: IsoDate, reference: IsoDate = today()): number {
  return differenceInCalendarDays(fromIsoDate(dueDate), fromIsoDate(reference))
}

export {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subMonths,
}
