import type { DataProvider } from './contracts'
import { createLocalProvider } from './local'

/**
 * Ponto único onde se decide onde os dados vivem.
 *
 * Hoje só existe o provider local. Quando o Supabase entrar (Fase 9), a
 * troca é `VITE_DATA_PROVIDER=supabase` no `.env` — e nada mais. Se algum
 * arquivo em `src/features/` precisar mudar por causa dessa troca, a
 * camada de contratos falhou e o problema está lá, não aqui.
 */
const providerKind = (import.meta.env.VITE_DATA_PROVIDER ?? 'local') as 'local' | 'supabase'

function build(): DataProvider {
  if (providerKind === 'supabase') {
    throw new Error(
      'O provider Supabase ainda não foi implementado (Fase 9). ' +
        'Use VITE_DATA_PROVIDER=local ou remova a variável do .env.',
    )
  }
  return createLocalProvider()
}

export const data: DataProvider = build()

export type { DataProvider } from './contracts'
export * from './types'
