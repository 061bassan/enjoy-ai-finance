/**
 * Erros que atravessam a fronteira de dados.
 *
 * Ficam aqui, junto dos contratos, e não dentro de `local/` — as telas
 * precisam distinguir um caso do outro, e importar de dentro de um provider
 * quebraria a regra que permite trocar Dexie por Supabase sem tocar em
 * `src/features/`.
 *
 * A separação entre `code` e `message` é o ponto: a mensagem é para a pessoa
 * e vai mudar de redação; o código é para o fluxo e não muda. Comparar texto
 * de erro é o tipo de acoplamento que quebra no dia em que alguém melhora uma
 * frase.
 */

export const AUTH_ERROR = {
  /** Conta criada antes do login com senha — precisa definir uma agora. */
  passwordNotSet: 'PASSWORD_NOT_SET',
  invalidCredentials: 'INVALID_CREDENTIALS',
  emailTaken: 'EMAIL_TAKEN',
  cpfTaken: 'CPF_TAKEN',
  noWorkspace: 'NO_WORKSPACE',
  noSession: 'NO_SESSION',
  noAccess: 'NO_ACCESS',
} as const

export type AuthErrorCode = (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR]

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Type guard — evita `'code' in cause` espalhado pelas telas. */
export function isAuthError(value: unknown): value is AuthError {
  return value instanceof Error && value.name === 'AuthError' && 'code' in value
}
