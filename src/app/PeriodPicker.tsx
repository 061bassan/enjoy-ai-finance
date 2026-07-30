import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/date'
import { PERIOD_LABEL, usePeriod, type PeriodPreset } from './period'

const PRESETS: PeriodPreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'thisMonth',
  'lastMonth',
  'thisYear',
]

/** Filtro de período global — comanda todas as telas de uma vez. */
export function PeriodPicker() {
  const { preset, range, setPreset, comparisonMode, setComparisonMode } = usePeriod()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarRange />
          <span className="hidden sm:inline">{PERIOD_LABEL[preset]}</span>
          <span className="hidden text-xs text-muted-foreground md:inline">
            {formatDate(range.from)} – {formatDate(range.to)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Período</DropdownMenuLabel>
        {PRESETS.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => setPreset(option)}>
            <span className="flex-1">{PERIOD_LABEL[option]}</span>
            {preset === option && <span className="text-xs text-muted-foreground">atual</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Comparar com</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setComparisonMode('previous')}>
          <span className="flex-1">Período anterior</span>
          {comparisonMode === 'previous' && (
            <span className="text-xs text-muted-foreground">atual</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setComparisonMode('lastYear')}>
          <span className="flex-1">Mesmo período no ano anterior</span>
          {comparisonMode === 'lastYear' && (
            <span className="text-xs text-muted-foreground">atual</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
