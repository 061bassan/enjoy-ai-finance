import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  formatCpf,
  formatPhone,
  validateBirthDate,
  validateCpf,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  passwordStrength,
} from '@/lib/validators'
import { data } from '@/data'
import { AUTH_ERROR, isAuthError } from '@/data/errors'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/data/enums'
import type { Role } from '@/data/types'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Entrada e cadastro.
 *
 * Antes, esta tela era um seletor de cargo: escolhia-se "Dono" ou "Comercial"
 * e entrava. Servia para ver o produto pelos olhos de cada função, mas não era
 * um login — qualquer um assumia qualquer poder.
 *
 * Agora há conta de verdade. Quem se cadastra **pede** um cargo; quem decide é
 * o sócio, na fila de aprovação (Configurações → Acessos). Até lá a pessoa
 * entra e vê a tela de espera, e nada mais.
 *
 * Os cargos que aparecem na escolha excluem "Dono" de propósito: dono é quem
 * criou o espaço, não é algo que se peça num formulário.
 */
const REQUESTABLE_ROLES: Role[] = ['admin', 'finance', 'sales', 'viewer']

type Mode = 'entrar' | 'criar' | 'definir-senha'

export function LoginPage() {
  const { session, loading } = useSession()
  const [mode, setMode] = React.useState<Mode>('entrar')
  /** E-mail já digitado, reaproveitado ao trocar de formulário. */
  const [carriedEmail, setCarriedEmail] = React.useState('')

  if (loading) {
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (session) return <Navigate to="/" replace />

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
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão financeira e comercial da Enjoy Scale
          </p>
        </div>

        <Card glass>
          <CardContent className="p-5">
            {mode === 'entrar' && (
              <SignInForm
                onNeedPassword={(email) => {
                  setCarriedEmail(email)
                  setMode('definir-senha')
                }}
                onWantAccount={() => setMode('criar')}
              />
            )}
            {mode === 'criar' && <SignUpForm onBack={() => setMode('entrar')} />}
            {mode === 'definir-senha' && (
              <SetPasswordForm initialEmail={carriedEmail} onBack={() => setMode('entrar')} />
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

// ---------------------------------------------------------------------------
// Campos reaproveitados
// ---------------------------------------------------------------------------

/**
 * Campo com rótulo, erro e dica.
 *
 * O erro fica **abaixo** e reserva a linha mesmo vazio: sem isso o formulário
 * salta a cada validação e a pessoa perde o campo que estava preenchendo.
 */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string | null
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
}) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="pr-10"
      />
      {/* Ver a senha reduz erro de digitação, que é a causa mais comum de
          "não consigo entrar" — e o campo é o único do formulário em que a
          pessoa não consegue conferir o que escreveu. */}
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const strength = passwordStrength(password)
  const level = strength === 'fraca' ? 1 : strength === 'média' ? 2 : 3

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3].map((step) => (
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
        ))}
      </div>
      <span className="text-xs text-muted-foreground">Senha {strength}</span>
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------

function SignInForm({
  onNeedPassword,
  onWantAccount,
}: {
  onNeedPassword: (email: string) => void
  onWantAccount: () => void
}) {
  const { signIn } = useSession()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (cause) {
      // Conta legada, criada antes do login com senha: em vez de barrar, a
      // tela oferece o caminho de definir a senha agora.
      if (isAuthError(cause) && cause.code === AUTH_ERROR.passwordNotSet) {
        onNeedPassword(email)
        return
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm font-medium">Entrar</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Use o e-mail do seu cadastro.</p>
      </div>

      <Field id="login-email" label="E-mail">
        <Input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="voce@empresa.com.br"
        />
      </Field>

      <Field id="login-password" label="Senha">
        <PasswordInput
          id="login-password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
      </Field>

      <FormError message={error} />

      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        Entrar
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem acesso?{' '}
        <button
          type="button"
          onClick={onWantAccount}
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Criar conta
        </button>
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Criar conta
// ---------------------------------------------------------------------------

interface SignUpErrors {
  name?: string | null
  cpf?: string | null
  birthDate?: string | null
  phone?: string | null
  email?: string | null
  password?: string | null
}

function SignUpForm({ onBack }: { onBack: () => void }) {
  const { signUp } = useSession()

  const [name, setName] = React.useState('')
  const [cpf, setCpf] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [requestedRole, setRequestedRole] = React.useState<Role>('sales')

  const [errors, setErrors] = React.useState<SignUpErrors>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  function validate(): boolean {
    const next: SignUpErrors = {
      name: validateFullName(name),
      cpf: validateCpf(cpf),
      birthDate: validateBirthDate(birthDate),
      phone: validatePhone(phone),
      email: validateEmail(email),
      password: validatePassword(password),
    }
    setErrors(next)
    return !Object.values(next).some(Boolean)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!validate()) return

    setBusy(true)
    try {
      await signUp({ name, email, password, cpf, birthDate, phone, requestedRole })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm font-medium">Criar conta</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          O acesso passa pela aprovação de um sócio.
        </p>
      </div>

      <Field id="signup-name" label="Nome completo" error={errors.name}>
        <Input
          id="signup-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          placeholder="Maria Silva Santos"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="signup-cpf" label="CPF" error={errors.cpf}>
          <Input
            id="signup-cpf"
            value={formatCpf(cpf)}
            onChange={(event) => setCpf(event.target.value)}
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
        </Field>

        <Field id="signup-birth" label="Data de nascimento" error={errors.birthDate}>
          {/* `type=date` nativo em vez do calendário próprio: escolher uma
              data de nascimento exige navegar décadas para trás, e o seletor
              nativo do sistema faz isso melhor que qualquer calendário nosso. */}
          <Input
            id="signup-birth"
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            autoComplete="bday"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="signup-phone" label="Telefone" error={errors.phone}>
          <Input
            id="signup-phone"
            value={formatPhone(phone)}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 98765-4321"
          />
        </Field>

        <Field id="signup-email" label="E-mail" error={errors.email}>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="voce@gmail.com"
          />
        </Field>
      </div>

      <Field
        id="signup-password"
        label="Senha"
        error={errors.password}
        hint="Mínimo de 8 caracteres, com letra e número."
      >
        <PasswordInput
          id="signup-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
      </Field>
      <StrengthMeter password={password} />

      <div className="space-y-2">
        <Label>Cargo desejado</Label>
        <p className="text-xs text-muted-foreground">
          É um pedido. Quem libera decide o cargo final.
        </p>
        <div className="space-y-2">
          {REQUESTABLE_ROLES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRequestedRole(option)}
              aria-pressed={requestedRole === option}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                requestedRole === option
                  ? 'border-foreground/40 bg-accent'
                  : 'border-border hover:bg-accent/40',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors',
                    requestedRole === option
                      ? 'border-foreground bg-foreground'
                      : 'border-muted-foreground/50',
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
      </div>

      <FormError message={error} />

      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        Enviar cadastro
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <button
          type="button"
          onClick={onBack}
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Entrar
        </button>
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Definir senha de conta legada
// ---------------------------------------------------------------------------

function SetPasswordForm({
  initialEmail,
  onBack,
}: {
  initialEmail: string
  onBack: () => void
}) {
  const { setInitialPassword } = useSession()
  const [email, setEmail] = React.useState(initialEmail)
  const [password, setPassword] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [candidates, setCandidates] = React.useState<string[]>([])

  /**
   * Lista as contas que ainda não têm senha.
   *
   * Quem abriu o app há meses não lembra o e-mail que o sistema gerou sozinho
   * na época — e sem essa lista ficaria trancado para fora dos próprios
   * lançamentos, com os dados intactos do outro lado da tela.
   */
  React.useEffect(() => {
    let cancelled = false
    void data.auth.listAccountsWithoutPassword?.().then((emails) => {
      if (cancelled) return
      setCandidates(emails)
      if (!initialEmail && emails.length === 1) setEmail(emails[0] ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [initialEmail])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const invalid = validatePassword(password)
    setFieldError(invalid)
    if (invalid) return

    setBusy(true)
    try {
      await setInitialPassword(email, password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível definir a senha.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm font-medium">Definir senha</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Esta conta foi criada antes do login com senha. Escolha uma agora — seus dados continuam
          onde estavam.
        </p>
      </div>

      <Field
        id="set-email"
        label="E-mail da conta"
        hint={
          candidates.length > 1
            ? `Contas sem senha neste navegador: ${candidates.join(', ')}`
            : undefined
        }
      >
        <Input
          id="set-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </Field>

      <Field
        id="set-password"
        label="Nova senha"
        error={fieldError}
        hint="Mínimo de 8 caracteres, com letra e número."
      >
        <PasswordInput
          id="set-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
      </Field>
      <StrengthMeter password={password} />

      <FormError message={error} />

      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        Definir senha e entrar
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Voltar
        </button>
      </p>
    </form>
  )
}
