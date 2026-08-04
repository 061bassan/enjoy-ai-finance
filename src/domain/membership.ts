import type { Id, Role, WorkspaceMember } from '@/data/types'
import { assignableRoles, can } from '@/data/rules/permissions'

/**
 * Regras da fila de aprovação.
 *
 * Ficam aqui, e não dentro da tela, porque a mesma decisão precisa ser tomada
 * em três lugares: na UI (para habilitar o botão), no provider local (para
 * gravar) e no Postgres (na função RPC de aprovação). Uma regra escrita três
 * vezes diverge na terceira.
 *
 * Tudo é função pura sobre dados já carregados — nenhuma consulta acontece
 * aqui.
 */

export interface DecisionCheck {
  allowed: boolean
  /** Motivo em pt-BR quando não é permitido. Vai direto para a tela. */
  reason?: string
}

/** Pedidos ainda sem decisão, do mais antigo para o mais recente. */
export function pendingRequests(members: readonly WorkspaceMember[]): WorkspaceMember[] {
  return members
    .filter((member) => member.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Pedidos já decididos — a aba de histórico mostra os dois desfechos. */
export function decidedRequests(members: readonly WorkspaceMember[]): WorkspaceMember[] {
  return members
    .filter((member) => member.decidedAt != null && member.status !== 'pending')
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
}

/**
 * Esta pessoa pode decidir sobre este pedido?
 *
 * A regra que mais importa é a terceira: **ninguém aprova o próprio pedido.**
 * Sem ela, alguém que entrasse com um vínculo administrativo qualquer poderia
 * se promover sozinho, e a fila de aprovação viraria decoração.
 */
export function canDecide(
  actorRole: Role | undefined,
  actorId: Id,
  request: WorkspaceMember,
): DecisionCheck {
  if (!can(actorRole, 'manage:members')) {
    return { allowed: false, reason: 'Só o sócio ou um administrador pode liberar acessos.' }
  }
  if (request.status !== 'pending') {
    return { allowed: false, reason: 'Este pedido já foi decidido.' }
  }
  if (request.userId === actorId) {
    return { allowed: false, reason: 'Ninguém pode aprovar o próprio cadastro.' }
  }
  return { allowed: true }
}

/**
 * Cargos que quem decide pode conceder.
 *
 * Reaproveita `assignableRoles`: um administrador não promove ninguém a
 * administrador nem a dono. Assim a fila de aprovação não vira um caminho
 * lateral para escalar privilégio — o limite é o mesmo da tela de equipe.
 */
export function grantableRoles(actorRole: Role | undefined): Role[] {
  return assignableRoles(actorRole)
}

/**
 * Cargo que a pessoa recebe ao ser aprovada.
 *
 * Por padrão é o que ela pediu — foi o pedido explícito do cliente: "após a
 * aprovação o mesmo já recebe a setagem do cargo solicitado". Mas quem
 * aprova pode conceder outro, e o pedido continua registrado em
 * `requestedRole` para o histórico mostrar a diferença.
 *
 * Se o cargo pedido estiver fora do que quem decide pode conceder, cai para
 * `viewer` em vez de falhar: aprovar alguém com poder a mais por acidente é
 * pior do que aprovar com poder de menos, que se corrige em um clique.
 */
export function roleOnApproval(
  request: WorkspaceMember,
  actorRole: Role | undefined,
  override?: Role,
): Role {
  const allowed = grantableRoles(actorRole)
  const wanted = override ?? request.requestedRole ?? 'viewer'
  return allowed.includes(wanted) ? wanted : 'viewer'
}

/**
 * O primeiro cadastro do workspace vira dono automaticamente.
 *
 * Não é conveniência: sem isso o produto trava no primeiro uso, porque não
 * existe ninguém com poder para aprovar o primeiro pedido. Quem instala é
 * quem manda — é o mesmo desenho de qualquer ferramenta autoinstalada.
 */
export function isFirstMember(existingMembers: readonly WorkspaceMember[]): boolean {
  return existingMembers.length === 0
}

/** Texto curto do desfecho, usado no histórico e no log de auditoria. */
export function describeDecision(member: WorkspaceMember, roleLabel: (role: Role) => string): string {
  if (member.status === 'active') {
    const requested = member.requestedRole
    if (requested && requested !== member.role) {
      return `Aprovado como ${roleLabel(member.role)} (pediu ${roleLabel(requested)})`
    }
    return `Aprovado como ${roleLabel(member.role)}`
  }
  if (member.status === 'rejected') {
    return member.decisionNote ? `Recusado — ${member.decisionNote}` : 'Recusado'
  }
  return ''
}
