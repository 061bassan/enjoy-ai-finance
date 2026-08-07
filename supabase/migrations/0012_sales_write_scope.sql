-- =============================================================================
-- 0012 — O cargo `sales` fecha a própria venda (opção A)
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- A matriz (`src/data/rules/permissions.ts`) dá ao `sales`: manage:sales:own,
-- manage:clients e manage:leads:own. Ou seja, um closer PODE criar/editar a
-- própria venda e converter o próprio lead — o que cria cliente, custo e
-- títulos a receber. Mas o RLS das tabelas financeiras (bills, sale_costs,
-- clients) é `can_manage_finance`, que EXCLUI `sales`. E as operações de venda
-- (op_create_sale, op_update_sale, op_delete_sale, op_convert_lead) eram
-- SECURITY INVOKER — passavam pelo RLS. Resultado: no Supabase, o closer batia
-- num erro de RLS ao fechar a própria venda, embora a UI (e o provider local)
-- deixassem. Os dois lados divergiam da matriz.
--
-- Correção (opção A): estas quatro operações viram SECURITY DEFINER com um
-- PORTÃO explícito — exatamente o padrão de approve_member/move_lead_stage.
-- Quem pode: finance+ em qualquer venda; `sales` só na venda/lead que é seu
-- (closer/sdr da venda, ou dono do lead). O RLS geral continua fechado: o
-- closer NÃO ganha leitura nem escrita livre em bills/clients — só consegue
-- rodar esta operação controlada.
--
-- Como DEFINER IGNORA o RLS, cada função também confere que TODA linha recebida
-- pertence ao mesmo workspace da venda/lead (o `WITH CHECK` que o RLS fazia de
-- graça). Sem isso, um chamador autenticado num espaço poderia injetar títulos
-- num espaço alheio. `ws` vem sempre de fonte confiável (o payload da venda
-- nova, ou a linha já existente no banco), e o resto é conferido contra ele.
-- =============================================================================

-- Pode escrever nesta venda/conversão? `owner_a`/`owner_b` são os dois "donos"
-- possíveis (closer/sdr de uma venda, ou owner/created_by de um lead). finance+
-- sempre pode; `sales` só quando é um dos donos. Espelha a matriz.
-- ATENÇÃO ao `coalesce(..., false)`: `can_manage_finance`/`current_role_in`
-- devolvem NULL para quem não é membro do workspace (não `false`). Sem o
-- coalesce, esta função retornaria NULL nesse caso, e o guard `if not
-- may_write_sale(...) then raise` trataria NULL como falso — NÃO dispararia a
-- exceção e deixaria escrever num espaço alheio. O coalesce fecha esse furo.
create or replace function may_write_sale(target_ws uuid, owner_a uuid, owner_b uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    target_ws is not null and (
      can_manage_finance(target_ws)
      or (
        current_role_in(target_ws) = 'sales'
        and (auth.uid() = owner_a or auth.uid() = owner_b)
      )
    ),
    false
  )
$$;

-- -----------------------------------------------------------------------------
-- op_create_sale — venda (+ custo) + títulos a receber
-- -----------------------------------------------------------------------------
create or replace function op_create_sale(
  p_sale  jsonb,
  p_cost  jsonb,
  p_bills jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := (p_sale->>'workspace_id')::uuid;
begin
  if not may_write_sale(ws, (p_sale->>'closer_id')::uuid, (p_sale->>'sdr_id')::uuid) then
    raise exception 'Sem permissão para registrar esta venda.';
  end if;
  if p_cost is not null and p_cost <> 'null'::jsonb
     and (p_cost->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Custo fora do espaço da venda.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_bills, '[]'::jsonb)) e
    where (e->>'workspace_id')::uuid is distinct from ws
  ) then
    raise exception 'Título fora do espaço da venda.';
  end if;

  insert into sales select * from jsonb_populate_record(null::sales, p_sale);

  if p_cost is not null and p_cost <> 'null'::jsonb then
    insert into sale_costs select * from jsonb_populate_record(null::sale_costs, p_cost);
  end if;

  if jsonb_array_length(coalesce(p_bills, '[]'::jsonb)) > 0 then
    insert into bills select * from jsonb_populate_recordset(null::bills, p_bills);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- op_update_sale — altera a venda e (opcional) refaz os títulos
-- -----------------------------------------------------------------------------
create or replace function op_update_sale(
  p_sale            jsonb,
  p_cost            jsonb,
  p_delete_bill_ids uuid[],
  p_bills           jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s          sales;
  ws         uuid;
  cur_closer uuid;
  cur_sdr    uuid;
begin
  -- Autoriza pela venda JÁ existente (não pelo payload): senão um closer
  -- reescreveria closer_id e "adotaria" a venda de outro.
  select workspace_id, closer_id, sdr_id into ws, cur_closer, cur_sdr
  from sales where id = (p_sale->>'id')::uuid;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if not may_write_sale(ws, cur_closer, cur_sdr) then
    raise exception 'Sem permissão para editar esta venda.';
  end if;
  if (p_sale->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Não é permitido mover a venda de espaço.';
  end if;
  if p_cost is not null and p_cost <> 'null'::jsonb
     and (p_cost->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Custo fora do espaço da venda.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_bills, '[]'::jsonb)) e
    where (e->>'workspace_id')::uuid is distinct from ws
  ) then
    raise exception 'Título fora do espaço da venda.';
  end if;
  if p_delete_bill_ids is not null and exists (
    select 1 from bills where id = any(p_delete_bill_ids) and workspace_id is distinct from ws
  ) then
    raise exception 'Título a remover fora do espaço da venda.';
  end if;

  s := jsonb_populate_record(null::sales, p_sale);
  update sales set
    client_id                 = s.client_id,
    client_name               = s.client_name,
    company                   = s.company,
    sale_date                 = s.sale_date,
    closer_id                 = s.closer_id,
    sdr_id                    = s.sdr_id,
    lead_source               = s.lead_source,
    model                     = s.model,
    amount_cents              = s.amount_cents,
    mrr_cents                 = s.mrr_cents,
    setup_cents               = s.setup_cents,
    contract_months           = s.contract_months,
    payment_method            = s.payment_method,
    installments              = s.installments,
    closer_commission_percent = s.closer_commission_percent,
    sdr_commission_percent    = s.sdr_commission_percent,
    status                    = s.status,
    lead_created_at           = s.lead_created_at,
    lead_id                   = s.lead_id,
    notes                     = s.notes,
    updated_at                = now()
  where id = s.id;

  if p_cost is not null and p_cost <> 'null'::jsonb then
    insert into sale_costs select * from jsonb_populate_record(null::sale_costs, p_cost)
    on conflict (sale_id) do update set
      ads_cents          = excluded.ads_cents,
      commission_cents   = excluded.commission_cents,
      bank_fee_cents     = excluded.bank_fee_cents,
      platform_fee_cents = excluded.platform_fee_cents,
      operational_cents  = excluded.operational_cents,
      team_hours_cents   = excluded.team_hours_cents,
      freelancers_cents  = excluded.freelancers_cents,
      production_cents    = excluded.production_cents,
      travel_cents       = excluded.travel_cents,
      other_cents        = excluded.other_cents,
      notes              = excluded.notes,
      updated_at         = now();
  end if;

  if array_length(p_delete_bill_ids, 1) is not null then
    delete from bills where id = any(p_delete_bill_ids);
  end if;

  if jsonb_array_length(coalesce(p_bills, '[]'::jsonb)) > 0 then
    insert into bills select * from jsonb_populate_recordset(null::bills, p_bills);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- op_delete_sale — apaga venda, custos, títulos e cards; devolve o lead ao funil
-- -----------------------------------------------------------------------------
create or replace function op_delete_sale(
  p_sale_id      uuid,
  p_bill_ids     uuid[],
  p_cost_ids     uuid[],
  p_card_ids     uuid[],
  p_lead_id      uuid,
  p_activity     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws         uuid;
  cur_closer uuid;
  cur_sdr    uuid;
begin
  select workspace_id, closer_id, sdr_id into ws, cur_closer, cur_sdr
  from sales where id = p_sale_id;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if not may_write_sale(ws, cur_closer, cur_sdr) then
    raise exception 'Sem permissão para excluir esta venda.';
  end if;
  -- Tudo que vai ser apagado/alterado precisa ser do mesmo espaço da venda.
  if p_bill_ids is not null and exists (
    select 1 from bills where id = any(p_bill_ids) and workspace_id is distinct from ws
  ) then raise exception 'Título fora do espaço da venda.'; end if;
  if p_cost_ids is not null and exists (
    select 1 from sale_costs where id = any(p_cost_ids) and workspace_id is distinct from ws
  ) then raise exception 'Custo fora do espaço da venda.'; end if;
  if p_card_ids is not null and exists (
    select 1 from cards where id = any(p_card_ids) and workspace_id is distinct from ws
  ) then raise exception 'Card fora do espaço da venda.'; end if;
  if p_lead_id is not null and exists (
    select 1 from leads where id = p_lead_id and workspace_id is distinct from ws
  ) then raise exception 'Lead fora do espaço da venda.'; end if;

  if array_length(p_bill_ids, 1) is not null then
    delete from bills where id = any(p_bill_ids);
  end if;
  if array_length(p_cost_ids, 1) is not null then
    delete from sale_costs where id = any(p_cost_ids);
  end if;
  if array_length(p_card_ids, 1) is not null then
    delete from cards where id = any(p_card_ids);
  end if;

  if p_lead_id is not null then
    update leads set
      stage      = 'negociacao',
      sale_id    = null,
      closed_at  = null,
      updated_at = now()
    where id = p_lead_id;

    if p_activity is not null and p_activity <> 'null'::jsonb then
      insert into lead_activities select * from jsonb_populate_record(null::lead_activities, p_activity);
    end if;
  end if;

  delete from sales where id = p_sale_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- op_convert_lead — lead ganho vira cliente + venda + títulos
-- -----------------------------------------------------------------------------
create or replace function op_convert_lead(
  p_client_new          jsonb,
  p_client_reactivate_id uuid,
  p_client_id           uuid,
  p_sale                jsonb,
  p_cost                jsonb,
  p_bills               jsonb,
  p_lead_id             uuid,
  p_sale_id             uuid,
  p_stamp_date          date,
  p_activity            jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws           uuid;
  lead_owner   uuid;
  lead_creator uuid;
begin
  -- Autoriza pelo LEAD que está sendo convertido (é dele que vem o direito do
  -- closer, via manage:leads:own).
  select workspace_id, owner_id, created_by into ws, lead_owner, lead_creator
  from leads where id = p_lead_id;
  if not found then raise exception 'Lead não encontrado.'; end if;
  if not may_write_sale(ws, lead_owner, lead_creator) then
    raise exception 'Sem permissão para converter este lead.';
  end if;
  -- Consistência de espaço em tudo que será inserido/alterado.
  if p_client_new is not null and p_client_new <> 'null'::jsonb
     and (p_client_new->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Cliente fora do espaço do lead.';
  end if;
  if p_client_reactivate_id is not null and not exists (
    select 1 from clients where id = p_client_reactivate_id and workspace_id = ws
  ) then raise exception 'Cliente a reativar fora do espaço do lead.'; end if;
  if (p_sale->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Venda fora do espaço do lead.';
  end if;
  if p_cost is not null and p_cost <> 'null'::jsonb
     and (p_cost->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Custo fora do espaço do lead.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_bills, '[]'::jsonb)) e
    where (e->>'workspace_id')::uuid is distinct from ws
  ) then raise exception 'Título fora do espaço do lead.'; end if;
  if p_activity is not null and p_activity <> 'null'::jsonb
     and (p_activity->>'workspace_id')::uuid is distinct from ws then
    raise exception 'Atividade fora do espaço do lead.';
  end if;

  if p_client_new is not null and p_client_new <> 'null'::jsonb then
    insert into clients select * from jsonb_populate_record(null::clients, p_client_new);
  elsif p_client_reactivate_id is not null then
    update clients set status = 'active', churn_date = null, updated_at = now()
    where id = p_client_reactivate_id;
  end if;

  insert into sales select * from jsonb_populate_record(null::sales, p_sale);

  if p_cost is not null and p_cost <> 'null'::jsonb then
    insert into sale_costs select * from jsonb_populate_record(null::sale_costs, p_cost);
  end if;

  if jsonb_array_length(coalesce(p_bills, '[]'::jsonb)) > 0 then
    insert into bills select * from jsonb_populate_recordset(null::bills, p_bills);
  end if;

  update leads set
    stage           = 'ganho',
    client_id       = p_client_id,
    sale_id         = p_sale_id,
    closed_at       = p_stamp_date,
    last_contact_at = p_stamp_date,
    next_action_at  = null,
    lost_reason     = null,
    updated_at      = now()
  where id = p_lead_id;

  insert into lead_activities select * from jsonb_populate_record(null::lead_activities, p_activity);
end;
$$;
