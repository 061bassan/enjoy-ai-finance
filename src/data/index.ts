import type { DataProvider } from './contracts'
import { createLocalProvider } from './local'
import { createSupabaseProvider } from './supabase'

/**
 * Ponto único onde se decide onde os dados vivem.
 *
 * A troca é `VITE_DATA_PROVIDER=supabase` no `.env` — e nada mais. Se algum
 * arquivo em `src/features/` precisar mudar por causa dessa troca, a camada de
 * contratos falhou e o problema está lá, não aqui.
 */
const providerKind = (import.meta.env.VITE_DATA_PROVIDER ?? 'local') as 'local' | 'supabase'

function build(): DataProvider {
  if (providerKind === 'supabase') {
    return createSupabaseProvider()
  }
  return createLocalProvider()
}

export const data: DataProvider = build()

export type { DataProvider } from './contracts'
export * from './types'
