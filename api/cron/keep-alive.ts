/**
 * Roda 1x/semana via Vercel Cron (ver vercel.json) só para gerar atividade
 * real no banco: o Supabase free tier pausa o projeto depois de 7 dias sem
 * uso, o que derruba login e todas as telas (aconteceu em 2026-10).
 *
 * Usa a mesma URL e anon key do app (variáveis do painel da Vercel também
 * valem nas functions). A consulta passa pelo PostgREST até o Postgres; o RLS
 * devolve lista vazia para a anon key, e a atividade já conta do mesmo jeito.
 *
 * Autenticado com CRON_SECRET, que a Vercel manda como Bearer token nas
 * chamadas de cron. Sem a variável configurada, a rota recusa tudo.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return Response.json({ error: 'Supabase não configurado' }, { status: 500 })
  }

  const res = await fetch(`${url}/rest/v1/workspaces?select=id&limit=1`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
  })
  if (!res.ok) {
    return Response.json({ error: `Supabase respondeu ${res.status}` }, { status: 502 })
  }

  return Response.json({ ok: true, ranAt: new Date().toISOString() })
}
