import * as React from 'react'
import { formatMoney, formatMoneyCompact } from '@/lib/money'

/**
 * Paleta dos gráficos.
 *
 * Cinzas para séries neutras, e os dois tokens semânticos apenas quando o
 * gráfico compara ganho contra perda. Ler de CSS variables (e não de hex
 * fixo) mantém os gráficos coerentes ao trocar de tema — e permite o
 * cliente subir a saturação depois mexendo só no CSS.
 */
export function chartColor(token: 'foreground' | 'muted' | 'positive' | 'negative' | 'border') {
  return `hsl(var(--${token}))`
}

export const CHART_SERIES = [
  'hsl(var(--foreground))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--foreground) / 0.55)',
  'hsl(var(--muted-foreground) / 0.6)',
  'hsl(var(--foreground) / 0.32)',
  'hsl(var(--muted-foreground) / 0.35)',
]

/** Eixo de valores em formato compacto: "R$ 1,2 mi". */
export function moneyAxisTick(value: number): string {
  return formatMoneyCompact(value)
}

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

/**
 * Tooltip padrão dos gráficos. O Recharts entrega tipos frouxos aqui, então
 * a normalização acontece neste ponto único em vez de em cada gráfico.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null
  const format = formatter ?? ((value: number) => formatMoney(value))

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      {label != null && <p className="mb-1 font-medium">{String(label)}</p>}
      <div className="space-y-0.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {typeof entry.value === 'number' ? format(entry.value) : String(entry.value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Moldura padrão de um gráfico.
 *
 * No celular a altura é fixa em 200px, independentemente do que a tela pedir:
 * um gráfico de 300px empurraria todo o resto para fora da dobra e obrigaria
 * a rolar antes de ver qualquer coisa. A altura do desktop entra a partir de
 * `sm`, via variável CSS.
 */
export function ChartFrame({
  title,
  description,
  action,
  height = 260,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  height?: number
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div
        className="h-[200px] sm:h-[var(--chart-height)]"
        style={{ '--chart-height': `${height}px` } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}
