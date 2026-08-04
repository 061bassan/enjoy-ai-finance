import * as React from 'react'
import { Clock, LogOut, RefreshCw, ShieldX } from 'lucide-react'
import { formatDateLong } from '@/lib/date'
import { ROLE_LABEL } from '@/data/enums'
import { useSession } from '@/app/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

/**
 * A única tela de quem ainda não foi liberado.
 *
 * Ela existe para responder uma pergunta e só uma: "meu cadastro chegou?".
 * Quem se cadastra e cai numa tela vazia — ou pior, é devolvido ao login —
 * tenta de novo, e a fila enche de pedidos duplicados da mesma pessoa.
 *
 * Por isso a tela repete o que foi enviado: o cargo pedido, o e-mail e a
 * data. É o recibo do pedido.
 */
export function PendingAccessPage() {
  const { session, signOut, refreshSession } = useSession()
  const [checking, setChecking] = React.useState(false)

  if (!session) return null

  const rejected = session.status === 'rejected'
  const suspended = session.status === 'suspended'

  async function check() {
    setChecking(true)
    try {
      await refreshSession()
    } finally {
      setChecking(false)
    }
  }

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
        </div>

        <Card glass>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <span
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                  rejected ? 'bg-negative/10 text-negative' : 'bg-accent text-foreground'
                }`}
              >
                {rejected ? <ShieldX className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
              </span>

              {rejected ? (
                <>
                  <p className="text-base font-medium">Cadastro não aprovado</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Um sócio analisou seu pedido e não liberou o acesso.
                    {session.decisionNote
                      ? ' O motivo informado está abaixo.'
                      : ' Fale com a equipe para entender o próximo passo.'}
                  </p>
                  {session.decisionNote && (
                    <p className="mt-3 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-left text-sm">
                      {session.decisionNote}
                    </p>
                  )}
                </>
              ) : suspended ? (
                <>
                  <p className="text-base font-medium">Acesso suspenso</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Seu acesso foi pausado por um administrador. Os dados continuam salvos.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-medium">Cadastro enviado</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Seu acesso está aguardando a liberação de um sócio. Assim que for aprovado,
                    o sistema abre no cargo concedido.
                  </p>
                </>
              )}
            </div>

            <Separator className="my-5" />

            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="min-w-0 truncate font-medium">{session.user.name}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="min-w-0 truncate">{session.user.email}</dd>
              </div>
              {session.requestedRole && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Cargo pedido</dt>
                  <dd>
                    <Badge variant="muted">{ROLE_LABEL[session.requestedRole]}</Badge>
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Enviado em</dt>
                <dd>{formatDateLong(session.user.createdAt.slice(0, 10))}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col gap-2">
              {!rejected && (
                <Button onClick={() => void check()} disabled={checking}>
                  <RefreshCw className={checking ? 'animate-spin' : undefined} />
                  Já fui liberado
                </Button>
              )}
              <Button variant="ghost" onClick={() => void signOut()}>
                <LogOut /> Sair
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          Seus dados ficaram salvos e a decisão fica registrada, seja qual for.
        </p>
      </div>
    </div>
  )
}
