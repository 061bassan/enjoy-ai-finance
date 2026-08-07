/**
 * Matriz de permissões por papel.
 *
 * Fonte única de verdade: a UI usa `can()` para esconder botões e bloquear
 * rotas, e as políticas RLS do Postgres (`supabase/migrations/0001_init.sql`)
 * são o espelho exato desta tabela. Se uma linha mudar aqui, a migration
 * correspondente precisa mudar junto — o comentário no SQL aponta de volta
 * para este arquivo.
 *
 * Importante: no modo local isto é a única barreira, e barreira de cliente
 * não é segurança — é ergonomia. A segurança real chega com o RLS na Fase 9.
 */

import type { Role } from '../types'

export type Permission =
  // Leitura
  | 'view:financials'
  | 'view:sales:all'
  | 'view:sales:own'
  | 'view:commercial'
  | 'view:executive'
  | 'view:members'
  | 'view:leads:all'
  | 'view:leads:own'
  // Escrita — financeiro
  | 'manage:transactions'
  | 'manage:bills'
  | 'manage:recurring'
  | 'manage:accounts'
  | 'manage:categories'
  // Escrita — comercial
  | 'manage:sales:all'
  | 'manage:sales:own'
  | 'manage:sale_costs'
  | 'manage:commercial'
  | 'manage:clients'
  | 'manage:leads:all'
  | 'manage:leads:own'
  // Planejamento
  | 'manage:goals'
  | 'manage:targets'
  | 'manage:purchases'
  | 'manage:kanban'
  // Administração
  | 'manage:members'
  | 'manage:workspace'
  | 'delete:workspace'
  | 'export:reports'

const VIEWER: Permission[] = [
  'view:financials',
  'view:sales:all',
  'view:commercial',
  'view:leads:all',
]

/**
 * `sales` é o papel mais restrito com escrita: enxerga e edita apenas o que
 * é seu. A filtragem "apenas meus registros" não mora aqui — mora nos
 * repositórios, que recebem a sessão. Aqui fica só a capacidade.
 */
const SALES: Permission[] = [
  'view:sales:own',
  'view:commercial',
  'view:leads:own',
  'manage:sales:own',
  'manage:leads:own',
  'manage:commercial',
  'manage:clients',
  'manage:kanban',
]

const FINANCE: Permission[] = [
  ...VIEWER,
  'view:executive',
  'view:members',
  'manage:transactions',
  'manage:bills',
  'manage:recurring',
  'manage:accounts',
  'manage:categories',
  'manage:sales:all',
  'manage:sale_costs',
  'manage:commercial',
  'manage:clients',
  'manage:leads:all',
  'manage:goals',
  'manage:targets',
  'manage:purchases',
  'manage:kanban',
  'export:reports',
]

/**
 * `admin` opera tudo, mas NÃO libera acessos — gerenciar membros é da alçada
 * de `owner`/`ceo`. É o que sustenta a cadeia "Desenvolvedor libera o CEO, o
 * CEO libera o resto": o portão de entrada tem só dois donos.
 */
const ADMIN: Permission[] = [...FINANCE, 'manage:workspace']

/** `ceo` = admin + o portão de acessos. Faz tudo do negócio, menos destruir o espaço. */
const CEO: Permission[] = [...ADMIN, 'manage:members']

/** `socio` é par do `ceo`: mesmas permissões. A diferença é só o rótulo. */
const SOCIO: Permission[] = CEO

/** `owner` (rótulo "Desenvolvedor") = CEO + a única tecla destrutiva. */
const OWNER: Permission[] = [...CEO, 'delete:workspace']

export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: OWNER,
  ceo: CEO,
  socio: SOCIO,
  admin: ADMIN,
  finance: FINANCE,
  sales: SALES,
  viewer: VIEWER,
}

/** A pessoa com este papel pode fazer isto? */
export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false
  return PERMISSIONS[role].includes(permission)
}

/** Atalho para "pode editar vendas", cobrindo tanto `all` quanto `own`. */
export function canManageSale(role: Role | undefined, isOwnSale: boolean): boolean {
  if (can(role, 'manage:sales:all')) return true
  return isOwnSale && can(role, 'manage:sales:own')
}

/** Mesma regra para leads: closer/SDR mexe no que é seu. */
export function canManageLead(role: Role | undefined, isOwnLead: boolean): boolean {
  if (can(role, 'manage:leads:all')) return true
  return isOwnLead && can(role, 'manage:leads:own')
}

/** Enxerga o funil inteiro, ou só a própria carteira? */
export function canSeeAllLeads(role: Role | undefined): boolean {
  return can(role, 'view:leads:all')
}

/**
 * Papéis que um usuário com este papel pode atribuir a outra pessoa.
 *
 * A regra é "só concede o que está estritamente abaixo de você": ninguém
 * promove alguém ao próprio nível ou acima. Só o `owner` (Desenvolvedor)
 * concede `ceo`; o `ceo` concede `admin` e abaixo. `admin` não gerencia
 * membros, então não concede nada.
 */
export function assignableRoles(role: Role | undefined): Role[] {
  if (role === 'owner') return ['ceo', 'socio', 'admin', 'finance', 'sales', 'viewer']
  // ceo e socio são pares: concedem admin-e-abaixo, mas não um ao outro.
  if (role === 'ceo' || role === 'socio') return ['admin', 'finance', 'sales', 'viewer']
  return []
}

/** Papéis que não devem ver o custo da empresa nem o dashboard executivo. */
export function isRestrictedRole(role: Role): boolean {
  return role === 'sales' || role === 'viewer'
}
