/**
 * Validações de formato do cadastro.
 *
 * Ficam em `lib/` e não em `domain/` porque não são regra de negócio — são
 * regras de formato, iguais em qualquer tela e em qualquer provider.
 *
 * Todas devolvem `string | null`: a mensagem de erro em pt-BR, ou `null`
 * quando o valor passa. Esse formato é o que permite a tela escrever
 * `const erro = validateCpf(cpf)` sem inventar texto próprio — mensagem de
 * erro divergente entre telas é o jeito mais rápido de um produto parecer
 * amador.
 *
 * Nenhuma delas confia no `type=` do input: validação de cliente é
 * conveniência. As mesmas regras viram CHECK constraint no Postgres quando o
 * backend entrar.
 */

import { differenceInCalendarDays, fromIsoDate, today, type IsoDate } from './date'

/** Só os dígitos — CPF e telefone chegam com máscara da tela. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// ---------------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------------

/**
 * Verifica os dois dígitos verificadores do CPF.
 *
 * Vale a pena validar de verdade em vez de só contar 11 dígitos: o CPF é a
 * chave que identifica a pessoa na aprovação, e um dígito trocado só
 * apareceria muito depois, quando alguém tentasse cruzar com um contrato.
 */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return false

  // 111.111.111-11 e afins passam na conta dos dígitos, mas não existem.
  if (/^(\d)\1{10}$/.test(digits)) return false

  const checkDigit = (upTo: number): number => {
    let sum = 0
    for (let i = 0; i < upTo; i += 1) {
      sum += Number(digits[i]) * (upTo + 1 - i)
    }
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10])
}

export function validateCpf(value: string): string | null {
  const digits = onlyDigits(value)
  if (!digits) return 'Informe o CPF.'
  if (digits.length !== 11) return 'O CPF precisa ter 11 dígitos.'
  if (!isValidCpf(digits)) return 'Este CPF não é válido.'
  return null
}

/** 12345678909 → "123.456.789-09". Formata o que der, sem travar a digitação. */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

/**
 * DDDs em uso no Brasil. A lista fechada existe porque o erro mais comum não
 * é digitar letra — é esquecer o DDD e digitar o número com 9 dígitos, que
 * passaria em qualquer validação de tamanho.
 */
const AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export function validatePhone(value: string): string | null {
  const digits = onlyDigits(value)
  if (!digits) return 'Informe o telefone.'
  if (digits.length < 10 || digits.length > 11) {
    return 'O telefone precisa ter DDD + número (10 ou 11 dígitos).'
  }
  if (!AREA_CODES.has(Number(digits.slice(0, 2)))) return 'DDD inválido.'
  // Celular tem 11 dígitos e o nono sempre começa com 9.
  if (digits.length === 11 && digits[2] !== '9') return 'Celular deve começar com 9 após o DDD.'
  return null
}

/** 11987654321 → "(11) 98765-4321". */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits.replace(/^(\d{0,2})/, '($1')
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, '($1) $2')
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d+)/, '($1) $2-$3')
  return digits.replace(/^(\d{2})(\d{5})(\d+)/, '($1) $2-$3')
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

/**
 * Regra deliberadamente simples: um `@`, algo antes, um domínio com ponto
 * depois. Regex de e-mail "completo" (RFC 5322) rejeita endereços válidos e
 * aceita inválidos — quem valida de verdade é o e-mail de confirmação, que
 * chega junto com o Supabase Auth.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Informe o e-mail.'
  if (!EMAIL_PATTERN.test(trimmed)) return 'E-mail inválido.'
  return null
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Nome
// ---------------------------------------------------------------------------

/**
 * Nome completo — exigimos sobrenome porque é uma tela de aprovação: quem
 * decide precisa conseguir dizer quem é a pessoa lendo uma linha da fila.
 */
export function validateFullName(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Informe o nome completo.'
  if (trimmed.length < 5) return 'Nome muito curto.'
  if (!trimmed.includes(' ')) return 'Informe nome e sobrenome.'
  if (!/^[\p{L}\s'.-]+$/u.test(trimmed)) return 'O nome tem caracteres inválidos.'
  return null
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------------
// Data de nascimento
// ---------------------------------------------------------------------------

/** Idade mínima aceita. 16 é o mínimo para vínculo formal de trabalho. */
export const MINIMUM_AGE = 16

export function ageOn(birthDate: IsoDate, reference: IsoDate = today()): number {
  const birth = fromIsoDate(birthDate)
  const ref = fromIsoDate(reference)
  let age = ref.getFullYear() - birth.getFullYear()
  const monthDiff = ref.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age -= 1
  return age
}

export function validateBirthDate(value: string, reference: IsoDate = today()): string | null {
  if (!value) return 'Informe a data de nascimento.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Data inválida.'

  const parsed = fromIsoDate(value)
  if (Number.isNaN(parsed.getTime())) return 'Data inválida.'
  if (differenceInCalendarDays(parsed, fromIsoDate(reference)) > 0) {
    return 'A data de nascimento não pode ser no futuro.'
  }

  const age = ageOn(value, reference)
  if (age < MINIMUM_AGE) return `É preciso ter pelo menos ${MINIMUM_AGE} anos.`
  if (age > 120) return 'Data de nascimento improvável.'
  return null
}

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------

export const MINIMUM_PASSWORD_LENGTH = 8

/**
 * Exigimos comprimento + letra + número, e nada além disso.
 *
 * Regras barrocas (símbolo obrigatório, maiúscula obrigatória) empurram as
 * pessoas para "Senha@123" e para o post-it — pioram a segurança real. O que
 * protege de verdade é o comprimento, e é nele que a mensagem insiste.
 */
export function validatePassword(value: string): string | null {
  if (!value) return 'Informe uma senha.'
  if (value.length < MINIMUM_PASSWORD_LENGTH) {
    return `A senha precisa de pelo menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`
  }
  if (!/[A-Za-zÀ-ÿ]/.test(value)) return 'A senha precisa ter ao menos uma letra.'
  if (!/\d/.test(value)) return 'A senha precisa ter ao menos um número.'
  return null
}

export type PasswordStrength = 'fraca' | 'média' | 'forte'

/**
 * Força aproximada, só para dar retorno visual enquanto a pessoa digita.
 *
 * A escala é calibrada para que **uma senha que passa em `validatePassword`
 * nunca apareça como "fraca"**. Marcar de vermelho algo que o sistema acabou
 * de aceitar é uma contradição: ou a senha serve, ou não deveria ter sido
 * aceita. "Fraca" fica reservado ao que ainda não atende ao mínimo.
 */
export function passwordStrength(value: string): PasswordStrength {
  let score = 0
  if (value.length >= MINIMUM_PASSWORD_LENGTH) score += 1
  if (value.length >= 12) score += 1
  if (/[A-ZÀ-Þ]/.test(value) && /[a-zß-ÿ]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^\w\s]/.test(value)) score += 1

  if (score <= 1) return 'fraca'
  if (score <= 3) return 'média'
  return 'forte'
}
