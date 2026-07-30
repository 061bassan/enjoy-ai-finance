/**
 * Campo de data do produto — substitui `<input type="date">`.
 *
 * O input nativo trazia o calendário do navegador junto, que não obedece a
 * nenhum token do design: azul do sistema, tipografia do sistema, cantos do
 * sistema. Fica no shadow DOM, então nem CSS resolvia.
 *
 * Mantém o que o nativo fazia bem: dá para DIGITAR a data, sem obrigar o
 * usuário a navegar no calendário. Quem sabe que é 05/03 digita 05032026 e
 * segue — mais rápido que qualquer popover.
 */

import * as React from 'react'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDate, fromIsoDate, today, type IsoDate } from '@/lib/date'
import { maskDate, parseTypedDate } from '@/lib/dateInput'
import { Calendar, MonthCalendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface DateFieldProps {
  value: IsoDate | null | undefined
  onChange: (value: IsoDate) => void
  id?: string
  min?: IsoDate
  max?: IsoDate
  disabled?: boolean
  placeholder?: string
  className?: string
  /** Mostra o "x" para esvaziar. Só faz sentido em campo opcional. */
  clearable?: boolean
  onClear?: () => void
}

export function DateField({
  value,
  onChange,
  id,
  min,
  max,
  disabled,
  placeholder = 'dd/mm/aaaa',
  className,
  clearable,
  onClear,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState(() => (value ? formatDate(value) : ''))
  const [focused, setFocused] = React.useState(false)

  // Enquanto o campo está focado, o texto é do usuário — não se sobrescreve
  // no meio da digitação. Fora de foco, o valor manda.
  React.useEffect(() => {
    if (!focused) setText(value ? formatDate(value) : '')
  }, [value, focused])

  function commit(raw: string) {
    const parsed = parseTypedDate(raw)
    if (parsed) {
      onChange(parsed)
    } else {
      // Digitação inválida volta para o último valor bom, sem alarde.
      setText(value ? formatDate(value) : '')
    }
  }

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(event) => setText(maskDate(event.target.value))}
        onBlur={(event) => {
          setFocused(false)
          commit(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(text)
            event.currentTarget.blur()
          }
        }}
        className={cn(
          'tabular flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-3 text-sm shadow-sm transition-colors',
          clearable && value ? 'pr-16' : 'pr-10',
          'placeholder:text-muted-foreground/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />

      {clearable && value && !disabled && (
        <button
          type="button"
          onClick={() => onClear?.()}
          aria-label="Limpar data"
          className="absolute right-8 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <Calendar
            value={value ?? null}
            min={min}
            max={max}
            onSelect={(iso) => {
              onChange(iso)
              setOpen(false)
            }}
          />
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                onChange(today())
                setOpen(false)
              }}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Fechar
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export interface MonthFieldProps {
  /** "YYYY-MM-01". */
  value: IsoDate
  onChange: (value: IsoDate) => void
  id?: string
  disabled?: boolean
  className?: string
}

/** Equivalente do `<input type="month">`, pelo mesmo motivo. */
export function MonthField({ value, onChange, id, disabled, className }: MonthFieldProps) {
  const [open, setOpen] = React.useState(false)
  const label = value
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
        fromIsoDate(value),
      )
    : ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm capitalize shadow-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span>{label}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <MonthCalendar
          value={value}
          onSelect={(iso) => {
            onChange(iso)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
