import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { validatePassword, passwordStrength } from '@/lib/validators'
import { cn } from '@/lib/cn'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Redefinição de senha — o destino do link enviado por e-mail.
 *
 * O Supabase manda a pessoa para cá com `access_token`/`refresh_token` de
 * recuperação no fragmento da URL (`#...`). Como o cliente não consome o hash
 * sozinho (`detectSessionInUrl: false`), esta tela extrai os tokens e os passa
 * para `completePasswordReset`, que abre a sessão de recuperação, grava a senha
 * nova e já entra — a pessoa não digita duas vezes a senha que acabou de criar.
 *
 * Fica FORA do portão de sessão (é uma rota pública): o link precisa abrir
 * mesmo com o app "deslogado", e é a única tela que trata a sessão de
 * recuperação.
 */
interface RecoveryTokens {
  accessToken: string
  refreshToken: string
}

/** Lê os tokens do fragmento da URL uma vez, na montagem. */
function readRecoveryTokens(): { tokens: RecoveryTokens | null; errorDescription: string | null } {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const params = new URLSearchParams(hash)

  // Link expirado/já usado volta como erro no próprio hash.
  const error = params.get('error_description') ?? params.get('error')
  if (error) return { tokens: null, errorDescription: error }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const type = params.get('type')
  if (type === 'recovery' && accessToken && refreshToken) {
    return { tokens: { accessToken, refreshToken }, errorDescription: null }
  }
  return { tokens: null, errorDescription: null }
}

export function RecoveryPage() {
  const { canResetPassword, completePasswordReset } = useSession()
  const navigate = useNavigate()

  // Lê o hash uma vez só, no init: o efeito abaixo limpa o fragmento da URL, e
  // reler depois devolveria vazio — a tela piscaria "link inválido".
  const [{ tokens, errorDescription }] = React.useState(readRecoveryTokens)

  const [password, setPassword] = React.useState('')
  const [visible, setVisible] = React.useState(false)
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Higiene de token: tira o access_token/refresh_token da barra de endereço
  // assim que capturados. Sem isso o token fica visível — e ainda válido —
  // enquanto a pessoa digita a senha nova (shoulder-surfing, cópia acidental).
  React.useEffect(() => {
    if (tokens) window.history.replaceState(null, '', window.location.pathname)
  }, [tokens])

  // Modo sem e-mail (local) não tem para onde este link apontar.
  if (!canResetPassword) return <Navigate to="/login" replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!tokens) return
    setError(null)

    const invalid = validatePassword(password)
    setFieldError(invalid)
    if (invalid) return

    setBusy(true)
    try {
      await completePasswordReset({ ...tokens, newPassword: password })
      toast.success('Senha redefinida. Você já está dentro.')
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível redefinir a senha.')
    } finally {
      setBusy(false)
    }
  }

  const linkBroken = !tokens

  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-in-rise">
        <div className="mb-7 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt=""
            className="mb-4 h-14 w-14 rounded-xl object-cover invert dark:invert-0"
          />
          <h1 className="text-xl font-semibold tracking-tight">Enjoy AI Finance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Redefinição de senha</p>
        </div>

        <Card glass>
          <CardContent className="p-5">
            {linkBroken ? (
              <div className="space-y-4 text-center">
                <p className="text-sm font-medium">Link inválido ou expirado</p>
                <p className="text-sm text-muted-foreground">
                  {errorDescription ??
                    'Este link de redefinição não é mais válido. Peça um novo na tela de entrada.'}
                </p>
                <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                  Voltar para a entrada
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Escolha uma nova senha</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Depois de salvar, você entra direto.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="recovery-password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="recovery-password"
                      type={visible ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setVisible((current) => !current)}
                      aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldError ? (
                    <p className="text-xs text-destructive">{fieldError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Mínimo de 8 caracteres, com letra e número.
                    </p>
                  )}
                </div>

                {password && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 gap-1" aria-hidden>
                      {[1, 2, 3].map((step) => {
                        const strength = passwordStrength(password)
                        const level = strength === 'fraca' ? 1 : strength === 'média' ? 2 : 3
                        return (
                          <span
                            key={step}
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors',
                              step <= level
                                ? level === 1
                                  ? 'bg-negative'
                                  : level === 2
                                    ? 'bg-muted-foreground'
                                    : 'bg-positive'
                                : 'bg-border',
                            )}
                          />
                        )
                      })}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Senha {passwordStrength(password)}
                    </span>
                  </div>
                )}

                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  Salvar senha e entrar
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Sua senha é guardada cifrada. Nunca em texto puro.
        </p>
      </div>
    </div>
  )
}
