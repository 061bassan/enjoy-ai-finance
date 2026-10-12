import type { DataProvider, Repository } from '../contracts'
import type { Profile } from '../types'
import { LocalAuth } from './auth'
import { db, TABLE_NAMES } from './db'
import { LocalOperations } from './operations'
import { createRepository } from './repository'

/**
 * Perfis sem o hash da senha.
 *
 * A UI lê a lista inteira de perfis para resolver nomes de closer, SDR e
 * responsável — e recebia junto o `passwordHash` de todo mundo. Ele não é a
 * senha, mas é material para ataque offline por lista de senhas comuns, e
 * viajava para dentro de qualquer componente, log de erro ou estado
 * serializado.
 *
 * A autenticação continua lendo `db.profiles` direto, que é onde o hash
 * precisa mesmo estar. Este filtro vale para o resto do aplicativo, que
 * nunca teve motivo para conhecê-lo.
 */
function createProfileRepository(): Repository<Profile> {
  const base = createRepository(db.profiles, 'profiles', { scoped: false })
  const strip = (profile: Profile): Profile => ({ ...profile, passwordHash: null })

  return {
    ...base,
    async list(workspaceId, query) {
      return (await base.list(workspaceId, query)).map(strip)
    },
    async get(id) {
      const profile = await base.get(id)
      return profile ? strip(profile) : null
    },
    async findBy(workspaceId, where) {
      return (await base.findBy(workspaceId, where)).map(strip)
    },
    /**
     * Atualizar um perfil **nunca** mexe na senha por este caminho: um patch
     * vindo da UI carregaria o `passwordHash: null` que ela recebeu na
     * leitura e apagaria a credencial da pessoa sem que ninguém pedisse.
     */
    async update(id, patch) {
      const { passwordHash: _ignored, ...safe } = patch as Partial<Profile>
      return strip(await base.update(id, safe))
    },
  }
}

/**
 * Provider local — IndexedDB via Dexie.
 *
 * É o provider padrão enquanto o Supabase não entra. Implementa o mesmo
 * `DataProvider` que o provider remoto vai implementar, então nenhuma tela
 * sabe qual dos dois está rodando.
 */
export function createLocalProvider(): DataProvider {
  return {
    kind: 'local',

    auth: new LocalAuth(),
    ops: new LocalOperations(),

    profiles: createProfileRepository(),
    workspaces: createRepository(db.workspaces, 'workspaces', { scoped: false }),
    members: createRepository(db.members, 'members'),

    accounts: createRepository(db.accounts, 'accounts'),
    categories: createRepository(db.categories, 'categories'),
    transactions: createRepository(db.transactions, 'transactions'),
    bills: createRepository(db.bills, 'bills'),
    billPayments: createRepository(db.billPayments, 'billPayments'),
    recurringRules: createRepository(db.recurringRules, 'recurringRules'),

    clients: createRepository(db.clients, 'clients'),
    leads: createRepository(db.leads, 'leads'),
    leadActivities: createRepository(db.leadActivities, 'leadActivities'),
    sales: createRepository(db.sales, 'sales'),
    saleCosts: createRepository(db.saleCosts, 'saleCosts'),
    commercialDays: createRepository(db.commercialDays, 'commercialDays'),
    commercialMeetings: createRepository(db.commercialMeetings, 'commercialMeetings'),
    marketingEntries: createRepository(db.marketingEntries, 'marketingEntries'),

    monthlyTargets: createRepository(db.monthlyTargets, 'monthlyTargets'),
    goals: createRepository(db.goals, 'goals'),
    goalContributions: createRepository(db.goalContributions, 'goalContributions'),
    purchaseGoals: createRepository(db.purchaseGoals, 'purchaseGoals'),

    boards: createRepository(db.boards, 'boards'),
    boardColumns: createRepository(db.boardColumns, 'boardColumns'),
    cards: createRepository(db.cards, 'cards'),

    activity: createRepository(db.activity, 'activity'),
    customizations: createRepository(db.customizations, 'customizations'),

    /**
     * Limpeza de bases antigas na abertura.
     *
     * Não cria mais nada: os espaços nascem do primeiro cadastro
     * (`signUp` → `seedWorkspacesFor`). Antes, o app criava um usuário
     * fantasma na primeira abertura — uma conta sem dono e sem senha, que
     * deixou de fazer sentido quando o cadastro passou a ser real.
     */
    async seedIfEmpty() {
      /**
       * Versões anteriores do app abriam com 6 meses de dados fictícios.
       * Quem usou o app naquela fase ainda tem essa base no navegador, e ela
       * não pode se misturar com lançamentos reais. A presença de qualquer um
       * dos perfis de demonstração identifica essa base com certeza — aqueles
       * e-mails nunca existiram fora dela.
       */
      const demoEmails = [
        'rafael@enjoyscale.com.br',
        'marina@enjoyscale.com.br',
        'carla@enjoyscale.com.br',
        'diego@enjoyscale.com.br',
        'bruna@enjoyscale.com.br',
      ]
      const demoProfile = await db.profiles.where('email').anyOf(demoEmails).first()
      if (!demoProfile) return

      await db.transaction(
        'rw',
        TABLE_NAMES.map((name) => db.table(name)),
        async () => {
          for (const name of TABLE_NAMES) await db.table(name).clear()
        },
      )
      localStorage.removeItem('enjoy.session')
    },

    async reset() {
      await db.transaction(
        'rw',
        TABLE_NAMES.map((name) => db.table(name)),
        async () => {
          for (const name of TABLE_NAMES) await db.table(name).clear()
        },
      )
      localStorage.removeItem('enjoy.session')
    },
  }
}
