import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { centsToDecimal, parseMoneyToCents, type Cents } from '@/lib/money'

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: Cents
  onChange: (cents: Cents) => void
}

/**
 * Campo de dinheiro.
 *
 * Guarda o texto digitado em estado próprio enquanto o campo está em foco, e
 * só reformata ao sair. Sem isso, digitar "1.2" viraria "1,20" no meio da
 * digitação e o cursor pularia — o clássico input de moeda que briga com
 * quem está preenchendo.
 *
 * O valor real que sai daqui é sempre inteiro em centavos.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => formatForEditing(value))
    const [focused, setFocused] = React.useState(false)

    // Reflete mudanças externas apenas quando o usuário não está digitando.
    React.useEffect(() => {
      if (!focused) setText(formatForEditing(value))
    }, [value, focused])

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          R$
        </span>
        <Input
          ref={ref}
          inputMode="decimal"
          className={cn('pl-9 text-right tabular-nums', className)}
          value={text}
          onFocus={(event) => {
            setFocused(true)
            props.onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            setText(formatForEditing(value))
            props.onBlur?.(event)
          }}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const cents = parseMoneyToCents(next)
            onChange(cents ?? 0)
          }}
          {...props}
        />
      </div>
    )
  },
)
MoneyInput.displayName = 'MoneyInput'

function formatForEditing(cents: Cents): string {
  if (!cents) return ''
  return centsToDecimal(cents).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
