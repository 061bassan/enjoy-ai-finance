import { describe, expect, it } from 'vitest'
import type { Role, WorkspaceMember } from '@/data/types'
import {
  canDecide,
  decidedRequests,
  grantableRoles,
  isFirstMember,
  pendingRequests,
  roleOnApproval,
} from './membership'

function member(overrides: Partial<WorkspaceMember> & { id: string }): WorkspaceMember {
  return {
    workspaceId: 'ws',
    userId: `user_${overrides.id}`,
    role: 'viewer',
    status: 'pending',
    invitedBy: null,
    requestedRole: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('fila de pedidos', () => {
  it('lista pendentes do mais antigo para o mais recente', () => {
    const members = [
      member({ id: 'b', createdAt: '2026-08-05T00:00:00.000Z' }),
      member({ id: 'a', createdAt: '2026-08-01T00:00:00.000Z' }),
      member({ id: 'ativo', status: 'active' }),
    ]

    // Quem espera há mais tempo aparece primeiro.
    expect(pendingRequests(members).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('mostra decididos do mais recente para o mais antigo', () => {
    const members = [
      member({ id: 'velho', status: 'rejected', decidedAt: '2026-08-01T00:00:00.000Z' }),
      member({ id: 'novo', status: 'active', decidedAt: '2026-08-10T00:00:00.000Z' }),
      member({ id: 'pendente' }),
    ]

    expect(decidedRequests(members).map((m) => m.id)).toEqual(['novo', 'velho'])
  })
})

describe('quem pode decidir', () => {
  const pedido = member({ id: 'p', userId: 'candidato' })

  it('permite a quem administra membros', () => {
    expect(canDecide('owner', 'socio', pedido).allowed).toBe(true)
    expect(canDecide('admin', 'gestor', pedido).allowed).toBe(true)
  })

  it('nega a quem não administra membros', () => {
    expect(canDecide('finance', 'fin', pedido).allowed).toBe(false)
    expect(canDecide('sales', 'closer', pedido).allowed).toBe(false)
    expect(canDecide('viewer', 'visita', pedido).allowed).toBe(false)
    expect(canDecide(undefined, 'ninguem', pedido).allowed).toBe(false)
  })

  it('impede aprovar o próprio cadastro', () => {
    // Sem esta regra, quem entrasse com qualquer vínculo administrativo
    // poderia se promover sozinho e a fila viraria decoração.
    const check = canDecide('owner', 'candidato', pedido)

    expect(check.allowed).toBe(false)
    expect(check.reason).toBe('Ninguém pode aprovar o próprio cadastro.')
  })

  it('impede decidir duas vezes', () => {
    const jaDecidido = member({ id: 'p', status: 'active', decidedAt: '2026-08-02T00:00:00.000Z' })
    const check = canDecide('owner', 'socio', jaDecidido)

    expect(check.allowed).toBe(false)
    expect(check.reason).toBe('Este pedido já foi decidido.')
  })
})

describe('cargos concedíveis', () => {
  it('dono concede tudo abaixo de dono', () => {
    expect(grantableRoles('owner')).toEqual<Role[]>(['admin', 'finance', 'sales', 'viewer'])
  })

  it('administrador não cria outro administrador', () => {
    expect(grantableRoles('admin')).toEqual<Role[]>(['finance', 'sales', 'viewer'])
  })

  it('quem não administra não concede nada', () => {
    expect(grantableRoles('finance')).toEqual([])
    expect(grantableRoles(undefined)).toEqual([])
  })
})

describe('cargo na aprovação', () => {
  it('concede o cargo pedido por padrão', () => {
    const pedido = member({ id: 'p', requestedRole: 'finance' })
    expect(roleOnApproval(pedido, 'owner')).toBe('finance')
  })

  it('respeita o cargo escolhido por quem aprova', () => {
    const pedido = member({ id: 'p', requestedRole: 'admin' })
    expect(roleOnApproval(pedido, 'owner', 'sales')).toBe('sales')
  })

  it('rebaixa para visitante quando o cargo pedido está fora do alcance', () => {
    // Um admin não pode promover ninguém a admin. Em vez de falhar, concede
    // o mínimo: dar poder demais por acidente é pior que dar de menos.
    const pedido = member({ id: 'p', requestedRole: 'admin' })
    expect(roleOnApproval(pedido, 'admin')).toBe('viewer')
  })

  it('usa visitante quando nenhum cargo foi pedido', () => {
    expect(roleOnApproval(member({ id: 'p' }), 'owner')).toBe('viewer')
  })
})

describe('primeiro membro', () => {
  it('reconhece workspace sem ninguém', () => {
    // Sem esta regra o produto trava no primeiro uso: não existiria ninguém
    // com poder para aprovar o primeiro pedido.
    expect(isFirstMember([])).toBe(true)
    expect(isFirstMember([member({ id: 'a' })])).toBe(false)
  })
})
