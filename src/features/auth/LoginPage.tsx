import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { DEFAULT_USER } from '@/data/defaults'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/data/enums'
import type { Role } from '@/data/types'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Entrada no app.
 *
 * O MVP tem um usuário só. O que se escolhe aqui é o cargo com que se quer
 * entrar — serve para ver o produto pelos olhos de cada função antes de
 * convidar a equipe. O cargo é gravado de verdade, então o que aparece
 * depois é exatamente o que essa pessoa veria.
 */
const ROLES: Role[] = ['owner', 'admin', 'finance', 'sales', 'viewer']

export function LoginPage() {
  const { session, signIn, loading } = useSession()
  const [role, setRole] = React.useState<Role>('owner')
  const [error, setError] = React.useState<string | null>(null)
  const [entering, setEntering] = React.useState(false)

  if (loading) {
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (session) return <Navigate to="/" replace />

  async function enter() {
    setEntering(true)
    setError(null)
    try {
      await signIn(DEFAULT_USER.email, role)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
      setEntering(false)
    }
  }

  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-in-rise">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt=""
            className="mb-4 h-14 w-14 rounded-xl object-cover invert dark:invert-0"
          />
          <h1 className="text-xl font-semibold tracking-tight">Enjoy AI Finance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle financeiro e comercial da Enjoy Scale
          </p>
        </div>

        <Card glass>
          <CardContent className="p-5">
            <p className="mb-1 text-sm font-medium">Entrar como</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Escolha o cargo. Cada um vê e edita coisas diferentes.
            </p>

            <div className="space-y-2">
              {ROLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  aria-pressed={role === option}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    role === option
                      ? 'border-foreground/40 bg-accent'
                      : 'border-border hover:bg-accent/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors',
                        role === option ? 'border-foreground bg-foreground' : 'border-muted-foreground/50',
                      )}
                    />
                    <span className="text-sm font-medium">{ROLE_LABEL[option]}</span>
                  </span>
                  <span className="mt-1 block pl-5.5 text-xs leading-relaxed text-muted-foreground">
                    {ROLE_DESCRIPTION[option]}
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <Button className="mt-4 w-full" onClick={() => void enter()} disabled={entering}>
              {entering && <Loader2 className="animate-spin" />}
              Entrar
            </Button>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          Os dados ficam salvos neste navegador. Faça backup em Configurações → Dados.
        </p>
      </div>
    </div>
  )
}
