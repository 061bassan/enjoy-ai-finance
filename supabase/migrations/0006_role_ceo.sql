-- =============================================================================
-- Enjoy AI Finance — cargo CEO e a cadeia de liberação
-- =============================================================================
--
-- Espelho de `src/data/rules/permissions.ts` (a fonte de verdade dos cargos).
--
-- O que muda no modelo de papéis:
--
--   owner  → continua o topo (rótulo "Desenvolvedor" na UI). Faz tudo,
--            inclusive apagar o workspace. É o primeiro cadastro.
--   ceo    → NOVO. Dono do negócio: gerencia membros (libera acessos) e opera
--            tudo, mas não apaga o workspace. Só o owner concede este cargo.
--   admin  → deixa de gerenciar membros. Opera todos os dados e as
--            configurações, mas liberar acesso é só de owner/ceo — é o que
--            sustenta "Desenvolvedor libera o CEO, o CEO libera o resto".
--   finance/sales/viewer → inalterados.
--
-- A regra de concessão passa a ser por PATENTE: ninguém concede um cargo igual
-- ou acima do seu. `role_rank` define a patente (0 = mais alto).
-- =============================================================================

-- O runner de migrations commita este ADD VALUE numa transação à parte antes
-- do corpo (o Postgres proíbe usar um valor de enum novo na mesma transação).
alter type member_role add value if not exists 'ceo' after 'owner';

-- -----------------------------------------------------------------------------
-- Patente do cargo — base da regra "só concede abaixo de você"
-- -----------------------------------------------------------------------------

create or replace function role_rank(r member_role)
returns int
language sql
immutable
as $$
  select case r
    when 'owner'   then 0
    when 'ceo'     then 1
    when 'admin'   then 2
    when 'finance' then 3
    when 'sales'   then 4
    when 'viewer'  then 5
    else 9
  end
$$;

-- -----------------------------------------------------------------------------
-- Predicados de permissão (redefinidos — as policies da 0001 os chamam por
-- nome, então mudar o corpo já vale em todas elas)
-- -----------------------------------------------------------------------------

-- Opera o financeiro: owner, ceo, admin e finance.
create or replace function can_manage_finance(target_workspace uuid)
returns boolean language sql stable as $$
  select current_role_in(target_workspace) in ('owner', 'ceo', 'admin', 'finance')
$$;

-- Administra dados e configurações do workspace: owner, ceo e admin.
create or replace function can_administer(target_workspace uuid)
returns boolean language sql stable as $$
  select current_role_in(target_workspace) in ('owner', 'ceo', 'admin')
$$;

-- Gerencia MEMBROS (libera/recusa acesso): só owner e ceo. É o portão de
-- entrada da equipe, e ele tem apenas dois donos de propósito.
create or replace function can_manage_members(target_workspace uuid)
returns boolean language sql stable as $$
  select current_role_in(target_workspace) in ('owner', 'ceo')
$$;

-- -----------------------------------------------------------------------------
-- Escrita em workspace_members: só owner/ceo, e só sobre quem está ABAIXO
-- -----------------------------------------------------------------------------
--
-- Antes admin escrevia membros; agora não (troca can_administer → can_manage_members).
--
-- Além do gate de quem escreve, a regra de PATENTE mora aqui também, e não só
-- na RPC `approve_member`: promover/rebaixar um membro existente é um PATCH
-- direto nesta tabela, e sem esta trava um CEO poderia se auto-promover a
-- Desenvolvedor editando a própria linha, ou promover alguém acima de si.
--
--   using       → só age sobre linhas cujo cargo ATUAL está abaixo do seu.
--   with check  → o cargo NOVO também precisa ficar abaixo do seu.
--
-- Assim owner e ceo promovem/rebaixam livremente quem está abaixo (o pedido do
-- cliente), mas ninguém alcança o próprio nível ou acima. As inserções do
-- sistema (handle_new_user, approve_member) são security definer e passam por
-- fora do RLS, então a fila de aprovação continua funcionando normalmente.

drop policy if exists members_write on workspace_members;

create policy members_write on workspace_members for all
  using (
    can_manage_members(workspace_id)
    and role_rank(role) > role_rank(current_role_in(workspace_id))
  )
  with check (
    can_manage_members(workspace_id)
    and role_rank(role) > role_rank(current_role_in(workspace_id))
  );

-- -----------------------------------------------------------------------------
-- Aprovação/recusa: gate por can_manage_members + concessão por patente
-- -----------------------------------------------------------------------------

create or replace function approve_member(
  target_member uuid,
  granted_role  member_role,
  note          text default null
)
returns workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target workspace_members;
begin
  select * into target from workspace_members where id = target_member;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if not can_manage_members(target.workspace_id) then
    raise exception 'Só o Desenvolvedor ou o CEO pode liberar acessos.';
  end if;

  if target.user_id = auth.uid() then
    raise exception 'Ninguém pode aprovar o próprio cadastro.';
  end if;

  -- Só concede cargo estritamente abaixo do seu: ninguém promove alguém ao
  -- próprio nível ou acima. Espelha `assignableRoles`.
  if role_rank(granted_role) <= role_rank(current_role_in(target.workspace_id)) then
    raise exception 'Você não pode conceder um cargo igual ou acima do seu.';
  end if;

  update workspace_members
     set role = granted_role,
         status = 'active',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = note
   where id = target_member
   returning * into target;

  return target;
end;
$$;

create or replace function reject_member(target_member uuid, note text default null)
returns workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target workspace_members;
begin
  select * into target from workspace_members where id = target_member;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if not can_manage_members(target.workspace_id) then
    raise exception 'Só o Desenvolvedor ou o CEO pode decidir acessos.';
  end if;
  if target.user_id = auth.uid() then
    raise exception 'Ninguém pode decidir o próprio cadastro.';
  end if;

  update workspace_members
     set role = 'viewer',
         status = 'rejected',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = note
   where id = target_member
   returning * into target;

  return target;
end;
$$;
