-- =============================================================================
-- 0011 — Fecha a autorização de move_lead_stage e a leitura do log de auditoria
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- 1) `move_lead_stage` (0002) é SECURITY DEFINER e roda como dona, IGNORANDO o
--    RLS da tabela `leads` — mas, ao contrário de `approve_member`/`reject_member`,
--    nunca checava quem está chamando. Com EXECUTE em PUBLIC, qualquer usuário
--    autenticado — inclusive um `viewer` (só leitura) ou um `sales` mexendo no
--    lead de outro closer — podia mover qualquer lead e ainda gravar uma linha
--    em `lead_activities`. Isso furava a regra "sales edita só o que é seu" e o
--    status somente-leitura do viewer.
--
--    O guard abaixo espelha a matriz (`src/data/rules/permissions.ts`):
--      • manage:leads:all  → owner, ceo, socio, admin, finance (qualquer lead)
--      • manage:leads:own  → sales, só no próprio lead (owner_id/created_by)
--      • viewer             → nada
--    Usa o mesmo critério de "próprio lead" do `leads_select` (0002).
--
-- 2) `activity_log` (auditoria) tinha SELECT para qualquer membro; seus resumos
--    podem citar fatos financeiros (baixas, valores). Fecha para `sales`, no
--    mesmo espírito da 0008. Nada na UI lê essa tabela hoje, então é seguro.
-- =============================================================================

create or replace function move_lead_stage(
  target_lead uuid,
  to_stage    lead_stage,
  note        text default null,
  lost        text default null
)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lead leads;
  updated      leads;
  caller_role  member_role;
begin
  select * into current_lead from leads where id = target_lead;
  if not found then raise exception 'Lead não encontrado.'; end if;

  -- Autorização: sem isto, a função rodava como dona sem checar ninguém.
  caller_role := current_role_in(current_lead.workspace_id);
  if caller_role is null then
    raise exception 'Sem acesso a este lead.';
  end if;
  if not (
    caller_role in ('owner', 'ceo', 'socio', 'admin', 'finance')
    or (
      caller_role = 'sales'
      and (current_lead.owner_id = auth.uid() or current_lead.created_by = auth.uid())
    )
  ) then
    raise exception 'Você não tem permissão para mover este lead.';
  end if;

  if current_lead.stage = to_stage then return current_lead; end if;

  -- Ganhar exige criar a venda; use convert_lead_to_sale.
  if to_stage = 'ganho' then
    raise exception 'Use convert_lead_to_sale para fechar um lead.';
  end if;

  update leads
     set stage = to_stage,
         last_contact_at = current_date,
         closed_at = case when to_stage = 'perdido' then current_date else null end,
         lost_reason = case when to_stage = 'perdido' then coalesce(lost, lost_reason) else null end,
         -- Reabrir limpa a próxima ação: a combinada morreu com o fechamento.
         next_action_at = case when to_stage = 'perdido' then null else next_action_at end
   where id = target_lead
   returning * into updated;

  insert into lead_activities (workspace_id, lead_id, kind, date, summary, from_stage, to_stage, created_by)
  values (
    current_lead.workspace_id,
    current_lead.id,
    'mudanca_etapa',
    current_date,
    coalesce(note, current_lead.stage || ' → ' || to_stage),
    current_lead.stage,
    to_stage,
    auth.uid()
  );

  return updated;
end;
$$;

-- Auditoria fora do alcance do `sales`, como o resto do financeiro (0008).
drop policy if exists activity_select on activity_log;
create policy activity_select on activity_log for select
  using (is_member_of(workspace_id) and current_role_in(workspace_id) <> 'sales');
