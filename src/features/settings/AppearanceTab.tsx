/**
 * Aparência — a tela onde o sócio personaliza o produto sem pedir deploy.
 *
 * É construída a partir de `src/customization/registry.ts`: acrescentar um
 * item personalizável lá faz ele aparecer aqui sozinho. Nada nesta tela
 * conhece Vendas especificamente.
 */

import { Check, Eye, EyeOff, Lock, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { useSession } from '@/app/session'
import { useCustomization } from '@/customization/context'
import { SCREENS } from '@/customization/registry'
import {
  ACCENT_LABEL,
  CORNER_LABEL,
  DENSITY_LABEL,
  INTENSITY_LABEL,
} from '@/customization/theme'
import type {
  AccentIntensity,
  AccentName,
  CornerStyle,
  Density,
} from '@/customization/types'
import { NAVIGATION } from '@/app/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

/** Amostra de cor de cada acento, para escolher pelo olho e não pelo nome. */
const SWATCH: Record<AccentName, string> = {
  grafite: 'hsl(0 0% 55%)',
  azul: 'hsl(217 48% 52%)',
  violeta: 'hsl(262 48% 58%)',
  verde: 'hsl(152 48% 42%)',
  ambar: 'hsl(38 62% 50%)',
  rosa: 'hsl(330 48% 55%)',
  ciano: 'hsl(190 48% 45%)',
  vermelho: 'hsl(6 52% 52%)',
}

const ACCENTS = Object.keys(ACCENT_LABEL) as AccentName[]
const INTENSITIES = Object.keys(INTENSITY_LABEL) as AccentIntensity[]
const CORNERS = Object.keys(CORNER_LABEL) as CornerStyle[]
const DENSITIES = Object.keys(DENSITY_LABEL) as Density[]

export function AppearanceTab() {
  const { allow } = useSession()
  const { brand, setBrand, isVisible, toggleItem, isNavHidden, toggleNav, resetAll } =
    useCustomization()

  const canEdit = allow('manage:workspace')

  if (!canEdit) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Só o dono e os administradores podem alterar a aparência do espaço. As mudanças valem
          para todo mundo que acessa este workspace.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Cor de acento</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              O acento pinta o botão principal, o item ativo do menu e o foco dos campos. Fundo e
              texto seguem neutros de propósito — é o que mantém os números legíveis.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ACCENTS.map((accent) => {
            const active = brand.accent === accent
            return (
              <button
                key={accent}
                type="button"
                onClick={() => setBrand({ accent })}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-foreground/30 bg-surface-2 font-medium'
                    : 'border-border hover:bg-surface-1',
                )}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-border/50"
                  style={{ background: SWATCH[accent] }}
                />
                {ACCENT_LABEL[accent]}
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            )
          })}
        </div>

        <Separator className="my-4" />

        <div className="grid gap-4 sm:grid-cols-3">
          <OptionGroup
            label="Intensidade"
            hint="Quanto o acento aparece."
            options={INTENSITIES.map((value) => ({ value, label: INTENSITY_LABEL[value] }))}
            value={brand.intensity}
            onChange={(intensity) => setBrand({ intensity })}
            disabled={brand.accent === 'grafite'}
            disabledHint="O grafite não tem cor para intensificar."
          />
          <OptionGroup
            label="Cantos"
            hint="Arredondamento de cards e botões."
            options={CORNERS.map((value) => ({ value, label: CORNER_LABEL[value] }))}
            value={brand.corners}
            onChange={(corners) => setBrand({ corners })}
          />
          <OptionGroup
            label="Densidade"
            hint="Compacto cabe mais linhas na tela."
            options={DENSITIES.map((value) => ({ value, label: DENSITY_LABEL[value] }))}
            value={brand.density}
            onChange={(density) => setBrand({ density })}
          />
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium">Itens do menu</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Esconder um item tira ele da barra lateral. A rota continua funcionando por link direto,
          e Configurações nunca some — é o caminho de volta.
        </p>

        <div className="mt-4 space-y-4">
          {NAVIGATION.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
                {group.label}
              </p>
              <ul className="divide-y divide-border">
                {group.items.map((item) => {
                  const locked = item.to === '/configuracoes'
                  const hidden = isNavHidden(item.to)
                  return (
                    <li key={item.to} className="flex items-center gap-3 py-2">
                      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                      {locked ? (
                        <Badge variant="muted" className="gap-1">
                          <Lock className="h-3 w-3" /> Fixo
                        </Badge>
                      ) : (
                        <Switch
                          checked={!hidden}
                          onCheckedChange={(checked) => toggleNav(item.to, !checked)}
                          aria-label={`Mostrar ${item.label}`}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {SCREENS.map((screen) => (
        <Card key={screen.id} className="p-4">
          <h3 className="text-sm font-medium">Tela de {screen.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Esconder um item muda só o que aparece. Todo cálculo continua usando os mesmos dados —
            nenhum número muda de valor por isso.
          </p>

          <div className="mt-4 space-y-5">
            {screen.sections.map((section) => (
              <div key={section.id}>
                <div className="mb-2 flex items-baseline gap-2">
                  <p className="text-sm font-medium">{section.label}</p>
                  {section.description && (
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  )}
                </div>

                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => {
                    const visible = isVisible(screen.id, section.id, item.id)
                    return (
                      <div key={item.id} className="flex items-center gap-2 py-1.5">
                        {visible ? (
                          <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            !visible && 'text-muted-foreground',
                          )}
                          title={item.hint}
                        >
                          {item.label}
                        </span>
                        {item.locked ? (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                            aria-label="Sempre visível"
                          />
                        ) : (
                          <Switch
                            checked={visible}
                            onCheckedChange={(checked) =>
                              toggleItem(screen.id, section.id, item.id, checked)
                            }
                            aria-label={`Mostrar ${item.label}`}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="p-4">
        <h3 className="text-sm font-medium">Voltar ao padrão</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Restaura cor, densidade, menu e todos os itens de tela. Não mexe em nenhum dado.
        </p>
        <Separator className="my-4" />
        <Button
          variant="outline"
          onClick={() => {
            resetAll()
            toast.success('Aparência restaurada.')
          }}
        >
          <RotateCcw /> Restaurar aparência
        </Button>
      </Card>
    </div>
  )
}

function OptionGroup<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
  disabledHint,
}: {
  label: string
  hint?: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        {disabled && disabledHint ? disabledHint : hint}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-40',
              value === option.value
                ? 'border-foreground/30 bg-surface-2 font-medium'
                : 'border-border hover:bg-surface-1',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
