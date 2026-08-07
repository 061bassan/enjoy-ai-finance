/**
 * Aplica as migrations de `supabase/migrations/` no projeto Supabase, em ordem.
 *
 * Não guarda segredo nenhum: lê a credencial do ambiente. Dois caminhos:
 *
 *   1) Personal Access Token (recomendado) — Management API:
 *        SB_REF=<ref> SB_PAT=sbp_xxx node scripts/apply-migrations.mjs
 *
 *   2) String de conexão do Postgres (precisa do pacote `pg`):
 *        SB_DB_URL="postgresql://postgres:...@...:5432/postgres" node scripts/apply-migrations.mjs
 *
 * Idempotência NÃO é garantida: rode uma vez numa base limpa. Se precisar
 * repetir, recrie o projeto ou limpe o schema `public` antes.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(HERE, '..', 'supabase', 'migrations')

async function loadMigrations() {
  // Argumentos = rodar só estes arquivos, na ordem dada. Sem argumentos = todos.
  const only = process.argv.slice(2)
  const all = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const files = only.length ? only : all
  const out = []
  for (const file of files) {
    out.push({ file, sql: await readFile(join(MIGRATIONS_DIR, file), 'utf8') })
  }
  return out
}

/**
 * Separa os `ALTER TYPE ... ADD VALUE ...;` do resto.
 *
 * O Postgres proíbe usar um valor de enum recém-adicionado na MESMA transação
 * em que ele foi criado. Rodar cada arquivo numa transação (é o que a
 * Management API e a CLI do Supabase fazem) esbarra nisso quando o mesmo
 * arquivo adiciona e usa o valor. A solução é commitar os ADD VALUE numa
 * transação à parte, antes do corpo. São statements de uma linha só — extrair
 * por linha é seguro (não há dollar-quote neles).
 */
function splitEnumAdds(sql) {
  const enumLines = []
  const bodyLines = []
  for (const line of sql.split('\n')) {
    if (/^\s*alter\s+type\s+\S+\s+add\s+value\b/i.test(line)) enumLines.push(line)
    else bodyLines.push(line)
  }
  return { enumSql: enumLines.join('\n'), bodySql: bodyLines.join('\n') }
}

async function runQuery(endpoint, pat, sql) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`)
}

async function runViaManagementApi(migrations, ref, pat) {
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`
  for (const { file, sql } of migrations) {
    process.stdout.write(`→ ${file} ... `)
    try {
      const { enumSql, bodySql } = splitEnumAdds(sql)
      if (enumSql.trim()) await runQuery(endpoint, pat, enumSql) // commita os ADD VALUE
      await runQuery(endpoint, pat, bodySql)
    } catch (err) {
      console.log('FALHOU')
      throw new Error(`${file}: ${err.message}`)
    }
    console.log('ok')
  }
}

async function runViaPostgres(migrations, dbUrl) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    for (const { file, sql } of migrations) {
      process.stdout.write(`→ ${file} ... `)
      await client.query(sql)
      console.log('ok')
    }
  } finally {
    await client.end()
  }
}

const migrations = await loadMigrations()
console.log(`Encontradas ${migrations.length} migrations.\n`)

if (process.env.SB_PAT) {
  const ref = process.env.SB_REF
  if (!ref) throw new Error('Defina SB_REF (o ref do projeto) junto com SB_PAT.')
  await runViaManagementApi(migrations, ref, process.env.SB_PAT)
} else if (process.env.SB_DB_URL) {
  await runViaPostgres(migrations, process.env.SB_DB_URL)
} else {
  throw new Error(
    'Nenhuma credencial. Defina SB_PAT (+SB_REF) para a Management API, ou SB_DB_URL para conexão direta.',
  )
}

console.log('\n✓ Todas as migrations aplicadas.')
