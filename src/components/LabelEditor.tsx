import * as React from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { defaultLabel, EDITABLE_LABEL_GROUPS, type LabelGroup } from '@/data/enums'
import { useSession } from '@/app/session'
import { useCustomization } from '@/customization/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Lápis ao lado de um campo de etiqueta: abre a lista de etiquetas do grupo
 * para renomear ali mesmo ("Perdida" → "Desistente").
 *
 * Só o texto muda — o valor gravado continua o mesmo, então métricas e
 * filtros não percebem. Aparece só para quem pode mexer na personalização do
 * espaço (a mesma permissão da tela de Aparência); os demais veem os nomes
 * novos, mas não o lápis.
 */
export function LabelEditor({ group }: { group: LabelGroup }) {
  const { allow } = useSession()
  const { labels, setLabel } = useCustomization()
  if (!allow('manage:workspace')) return null

  const { title, labels: current } = EDITABLE_LABEL_GROUPS[group]
  const custom = labels[group] ?? {}

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6 text-muted-foreground"
          aria-label={`Renomear etiquetas: ${title}`}
          title="Renomear etiquetas"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Muda só o nome que aparece. Os números e filtros continuam iguais.
        </p>
        <ul className="space-y-2">
          {Object.keys(current).map((value) => (
            <LabelRow
              key={`${value}:${current[value as keyof typeof current]}`}
              original={defaultLabel(group, value)}
              text={current[value as keyof typeof current] as string}
              customized={value in custom}
              onSave={(text) =>
                setLabel(group, value, text === defaultLabel(group, value) ? null : text)
              }
              onReset={() => setLabel(group, value, null)}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function LabelRow({
  original,
  text,
  customized,
  onSave,
  onReset,
}: {
  original: string
  text: string
  customized: boolean
  onSave: (text: string) => void
  onReset: () => void
}) {
  const [draft, setDraft] = React.useState(text)

  function commit() {
    const cleaned = draft.trim()
    if (!cleaned) {
      setDraft(text) // vazio não apaga etiqueta: volta ao que estava
      return
    }
    if (cleaned !== text) onSave(cleaned)
  }

  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          aria-label={`Novo nome para "${original}"`}
          className="h-8"
        />
        {customized && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            Original: {original}
          </span>
        )}
      </div>
      {customized && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onReset}
          aria-label={`Voltar "${text}" para "${original}"`}
          title="Voltar ao nome original"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  )
}
