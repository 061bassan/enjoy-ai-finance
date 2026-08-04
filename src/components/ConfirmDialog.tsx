import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Confirmação de ação destrutiva.
 *
 * Substitui o `confirm()` do navegador, que tem três problemas concretos:
 * usa a cara do sistema operacional em vez da do produto, trava a aba
 * inteira enquanto está aberto, e não distingue "apagar um rascunho" de
 * "apagar tudo" — o mesmo diálogo cinza para os dois.
 *
 * `confirmationText` existe para o segundo caso: quando a ação não tem
 * desfazer, exigir que a pessoa digite a palavra transforma um clique
 * distraído em um ato deliberado.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  confirmationText,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Quando definido, o botão só habilita depois que a pessoa digitar isto. */
  confirmationText?: string
  onConfirm: () => void | Promise<void>
}) {
  const [typed, setTyped] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const ready = !confirmationText || typed.trim().toUpperCase() === confirmationText.toUpperCase()

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="h-4 w-4 text-negative" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {confirmationText && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-text">
              Digite <span className="font-semibold">{confirmationText}</span> para confirmar
            </Label>
            <Input
              id="confirm-text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={!ready || busy}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
