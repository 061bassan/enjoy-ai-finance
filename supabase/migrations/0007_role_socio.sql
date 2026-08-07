-- =============================================================================
-- Enjoy AI Finance — cargo Sócio (par do CEO)
-- =============================================================================
--
-- Espelho de `src/data/rules/permissions.ts`.
--
-- `socio` é PAR do `ceo`: mesma patente (`role_rank` = 1) e mesmas permissões.
-- Também libera acessos. Um não nomeia nem rebaixa o outro (patente igual), e
-- só o `owner` (Desenvolvedor) gerencia sócios e CEOs.
--
-- Só os predicados de permissão mudam (as policies da 0001/0006 os chamam por
-- nome, então o comportamento novo vale em todas elas sem recriar policy).
-- =============================================================================

-- Commitado à parte pelo runner (valor de enum novo não pode ser usado na
-- mesma transação em que nasce).
alter type member_role add value if not exists 'socio' after 'ceo';

-- Patente: socio empata com ceo (1). É o que faz "concede só abaixo de você"
-- impedir que um nomeie/rebaixe o outro, e que ambos parem no admin.
create or replace function role_rank(r member_role)
returns int
language sql
immutable
as $$
  select case r
    when 'owner'   then 0
    when 'ceo'     then 1
    when 'socio'   then 1
    when 'admin'   then 2
    when 'finance' then 3
    when 'sales'   then 4
    when 'viewer'  then 5
    else 9
  end
$$;

-- Opera o financeiro: owner, ceo, socio, admin, finance.
create or replace function can_manage_finance(target_workspace uuid)
returns boolean language sql stable as $$
  select current_role_in(target_workspace) in ('owner', 'ceo', 'socio', 'admin', 'finance')
$$;

-- Administra dados e configurações: owner, ceo, socio, admin.
create or replace function can_administer(target_workspace uuid)
returns boolean language sql stable as $$
  select current_role_in(target_workspace) in ('owner', 'ceo', 'socio', 'admin')
$$;

-- Libera/recusa acesso (gatekeepers): SÓ owner, ceo e socio.
create or replace function can_manage_members(target_workspace uuid)
returns boolean language sql stable as $$
  select current_role_in(target_workspace) in ('owner', 'ceo', 'socio')
$$;
