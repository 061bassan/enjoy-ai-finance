/**
 * Calendário do produto.
 *
 * Existe porque o `<input type="date">` abre o calendário NATIVO do
 * navegador, que vive no shadow DOM e é inalcançável por CSS: mantém o azul
 * do sistema, a tipografia do sistema e os cantos do sistema, em qualquer
 * tema. Não havia como aproximá-lo do design — só substituí-lo.
 *
 * Construído sobre date-fns, que já era dependência. Sem biblioteca de
 * calendário nova: a grade de um mês é aritmética de sete colunas.
 */

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/cn'
import { fromIsoDate, toIsoDate, today, type IsoDate } from '@/lib/date'

/** Domingo a sábado, como no calendário brasileiro. */
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export interface CalendarProps {
  value?: IsoDate | null
  onSelect: (date: IsoDate) => void
  /** Datas fora deste intervalo ficam desabilitadas. */
  min?: IsoDate
  max?: IsoDate
  className?: string
}

export function Calendar({ value, onSelect, min, max, className }: CalendarProps) {
  const selected = value ? fromIsoDate(value) : null
  const [cursor, setCursor] = React.useState<Date>(() =>
    startOfMonth(selected ?? fromIsoDate(today())),
  )

  // Reposiciona o mês visível quando o valor muda por fora (ex.: "Hoje").
  React.useEffect(() => {
    if (value) setCursor(startOfMonth(fromIsoDate(value)))
  }, [value])

  const days = React.useMemo(() => {
    const first = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
    // 6 semanas fixas: evita a grade "pular de altura" ao trocar de mês.
    return Array.from({ length: 42 }, (_, index) => addDays(first, index))
  }, [cursor])

  const todayIso = today()

  function isDisabled(iso: IsoDate): boolean {
    if (min && iso < min) return true
    if (max && iso > max) return true
    return false
  }

  return (
    <div className={cn('w-[17.5rem] select-none p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setCursor((current) => subMonths(current, 1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium capitalize">
          {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>

        <button
          type="button"
          onClick={() => setCursor((current) => addMonths(current, 1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70"
          >
            {letter}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const iso = toIsoDate(day)
          const outside = !isSameMonth(day, cursor)
          const isSelected = selected ? isSameDay(day, selected) : false
          const isToday = iso === todayIso
          const disabled = isDisabled(iso)

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(iso)}
              className={cn(
                'tabular relative h-8 rounded-md text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                disabled && 'cursor-not-allowed opacity-30',
                !disabled && !isSelected && 'hover:bg-accent hover:text-accent-foreground',
                outside && !isSelected ? 'text-muted-foreground/40' : 'text-foreground',
                isSelected && 'bg-primary font-medium text-primary-foreground',
              )}
            >
              {day.getDate()}
              {/* Ponto do dia de hoje — some quando o dia está selecionado,
                  senão o marcador compete com o preenchimento. */}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-muted-foreground" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface MonthCalendarProps {
  /** "YYYY-MM-01". */
  value?: IsoDate | null
  onSelect: (month: IsoDate) => void
  className?: string
}

/** Seletor de mês — o equivalente do `<input type="month">`. */
export function MonthCalendar({ value, onSelect, className }: MonthCalendarProps) {
  const selected = value ? fromIsoDate(value) : null
  const [year, setYear] = React.useState<number>(
    () => (selected ?? fromIsoDate(today())).getFullYear(),
  )

  React.useEffect(() => {
    if (value) setYear(fromIsoDate(value).getFullYear())
  }, [value])

  const currentMonthIso = toIsoDate(startOfMonth(fromIsoDate(today())))

  return (
    <div className={cn('w-[17.5rem] select-none p-3', className)}>
      <div className="mb-3 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setYear((current) => current - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ano anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular text-sm font-medium">{year}</span>
        <button
          type="button"
          onClick={() => setYear((current) => current + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Próximo ano"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, index) => {
          const date = new Date(year, index, 1)
          const iso = toIsoDate(date)
          const isSelected = value === iso
          const isCurrent = iso === currentMonthIso

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              className={cn(
                'rounded-md py-1.5 text-sm capitalize transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
                !isSelected && isCurrent && 'font-medium',
              )}
            >
              {format(date, 'MMM', { locale: ptBR }).replace('.', '')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
