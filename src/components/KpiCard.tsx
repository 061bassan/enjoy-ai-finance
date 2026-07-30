import * as React from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPercent } from '@/lib/money'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface KpiCardProps {
  label: string
  value: string
  /** Variação em razão (0.12 = +12%). `null` quando não há base de comparação. */
  variation?: number | null
  /** Para métricas em que cair é bom (custo, CAC, churn). */
  invertVariation?: boolean
  hint?: string
  secondary?: React.ReactNode
  className?: string
  loading?: boolean
}

/**
 * Card de indicador.
 *
 * A cor da variação respeita `invertVariation`: em CAC ou churn, uma queda é
 * boa notícia e precisa aparecer como positiva. Sem isso, metade do painel
 * comunicaria o oposto do que aconteceu.
 */
export function KpiCard({
  label,
  value,
  variation,
  invertVariation = false,
  hint,
  secondary,
  className,
  loading = false,
}: KpiCardProps) {
  const hasVariation = variation != null && Number.isFinite(variation)
  const isFlat = hasVariation && Math.abs(variation) < 0.0005
  const isUp = hasVariation && variation > 0
  const isGood = invertVariation ? !isUp : isUp

  const content = (
    <Card glass className={cn('p-4 animate-in-rise', className)}>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none tracking-tight">
          {value}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        {hasVariation && !loading && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
              isFlat ? 'text-muted-foreground' : isGood ? 'text-positive' : 'text-negative',
            )}
          >
            {isFlat ? (
              <Minus className="h-3 w-3" />
            ) : isUp ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {formatPercent(Math.abs(variation))}
          </span>
        )}
        {secondary && <span className="truncate text-xs text-muted-foreground">{secondary}</span>}
      </div>
    </Card>
  )

  if (!hint) return content

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{content}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  )
}

/** Grade responsiva padrão para os cards de KPI. */
export function KpiGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
