import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * O cliente supabase-js, criado uma vez.
 *
 * Lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — as duas embutidas no
 * build, o que é seguro porque a `anon key` só vale o que o RLS permitir. A
 * proteção real é a política no banco, nunca o segredo da chave.
 *
 * `persistSession` guarda a sessão do Auth no `localStorage`; `autoRefreshToken`
 * renova o JWT antes de expirar. Sem os dois, a pessoa cairia para fora a cada
 * hora e a cada recarga.
 */
let cached: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

  if (!url || !anonKey) {
    throw new Error(
      'Provider Supabase selecionado, mas VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY ' +
        'não estão no .env. Preencha os dois ou use VITE_DATA_PROVIDER=local.',
    )
  }

  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return cached
}
