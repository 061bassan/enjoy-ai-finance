/**
 * Derivação de senha para o modo local.
 *
 * **Isto não é segurança de verdade, e não pretende ser.** No modo local todo
 * o app roda no navegador da própria pessoa: quem tem o dispositivo tem o
 * IndexedDB, e nenhum esquema de hash muda isso. A segurança real chega com o
 * Supabase Auth, onde a senha nunca passa por este código.
 *
 * Então por que existe? Por duas razões concretas:
 *
 * 1. **A senha em claro nunca é gravada.** O backup JSON das Configurações é
 *    um arquivo que circula por e-mail e WhatsApp. Guardar `senha: "1234"`
 *    ali vazaria a senha que a pessoa provavelmente reusa no banco.
 * 2. **O fluxo fica idêntico ao do Supabase.** A tela chama `signIn(email,
 *    senha)` hoje e vai chamar a mesma coisa depois. Nenhuma tela muda.
 *
 * PBKDF2 com 100 mil iterações é o que a Web Crypto oferece nativamente sem
 * dependência — não é Argon2, mas encarece o ataque por lista de senhas
 * comuns, que é o cenário realista aqui.
 */

const ITERATIONS = 100_000
const KEY_BITS = 256
const SALT_BYTES = 16

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return toHex(bits)
}

/**
 * Gera o registro guardado no perfil: `pbkdf2$iterações$salt$hash`.
 *
 * O formato carrega os parâmetros junto de propósito — subir as iterações
 * amanhã não invalida as senhas de hoje, porque cada registro sabe como foi
 * derivado.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt)
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${hash}`
}

/** Confere a senha contra o registro guardado. Nunca lança. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterations, saltHex, expected] = stored.split('$')
    if (scheme !== 'pbkdf2' || !iterations || !saltHex || !expected) return false

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: fromHex(saltHex) as BufferSource,
        iterations: Number(iterations),
        hash: 'SHA-256',
      },
      key,
      KEY_BITS,
    )
    return timingSafeEqual(toHex(bits), expected)
  } catch {
    return false
  }
}

/**
 * Comparação de tempo constante.
 *
 * Exagero para o modo local — mas este arquivo é o molde do que roda no
 * servidor depois, e comparar hash com `===` é o tipo de atalho que
 * sobrevive à migração sem ninguém notar.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
