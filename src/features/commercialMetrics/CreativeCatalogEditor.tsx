import * as React from 'react'
import { ListPlus, X } from 'lucide-react'
import { useSession } from '@/app/session'
import { useCustomization } from '@/customization/context'
import { addCreative, creativeOptions, removeCreative } from '@/domain/creativeCatalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Botão ao lado do campo de criativo: abre a lista para adicionar e retirar ali
 * mesmo, sem sair do cadastro da reunião.
 *
 * Aparece só para quem pode mexer na personalização do espaço, a permissão de
 * escrita de `customizations` (a mesma do lápis das etiquetas). Os demais
 * continuam vendo as sugestões e podem digitar um nome novo na reunião.
 */
export function CreativeCatalogEditor({ used }: { used: readonly string[] }) {
  const { allow } = useSession()
  const { creativeCatalog, updateCreativeCatalog } = useCustomization()
  const [draft, setDraft] = React.useState('')
  if (!allow('manage:workspace')) return null

  const options = creativeOptions(used, creativeCatalog)

  function add() {
    const name = draft
    if (!name.trim()) return
    updateCreativeCatalog((catalog) => addCreative(catalog, name))
    setDraft('')
  }

  return (
    // `modal`: dentro de um Dialog, sem ele a rolagem do mouse não chega à lista.
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6 text-muted-foreground"
          aria-label="Adicionar ou retirar criativos"
          title="Adicionar ou retirar criativos"
        >
          <ListPlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-sm font-medium">Criativos</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Retirar só tira da lista de sugestões. As reuniões já registradas e as métricas continuam
          iguais.
        </p>
        <div className="mb-3 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            placeholder="Novo criativo"
            aria-label="Nome do novo criativo"
            className="h-8"
          />
          <Button type="button" size="sm" onClick={add} disabled={!draft.trim()}>
            Adicionar
          </Button>
        </div>
        {options.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {options.map((name) => (
              <li key={name} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate" title={name}>
                  {name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 shrink-0 text-muted-foreground"
                  onClick={() => updateCreativeCatalog((catalog) => removeCreative(catalog, name))}
                  aria-label={`Retirar "${name}"`}
                  title="Retirar da lista"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum criativo na lista.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
