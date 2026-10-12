-- =============================================================================
-- 0018 — Venda com produto e modalidade de pagamento (TCV com entrada / MRR)
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- O cadastro de venda passa a dizer QUAL produto foi vendido (Enjoy Pro,
-- Enjoy Growth, Enjoy Rec) e COMO ele é pago, nas duas modalidades que a
-- Enjoy usa:
--   - TCV: valor total do projeto, à vista ou com entrada + restante;
--   - MRR: mensalidade × meses.
-- O cronograma de recebimento (`buildReceivables`, em TypeScript) precisa das
-- datas para refazer os títulos quando a venda é editada — por isso elas são
-- guardadas na venda, e não só passadas no momento do cadastro.
--
-- Quatro colunas OPCIONAIS em `sales`, nulas por padrão: venda antiga continua
-- exatamente como era.
--   product            enjoy_pro | enjoy_growth | enjoy_rec
--   down_payment_cents entrada do TCV (0/nulo = sem entrada)
--   down_payment_date  quando a entrada é paga
--   first_due_date     1ª mensalidade (MRR) ou 1º vencimento do restante (TCV)
--
-- `op_update_sale` lista as colunas uma a uma; sem recriá-la, editar a venda
-- descartaria os campos novos em silêncio. A função abaixo é a da 0012 com as
-- quatro linhas a mais — autorização e checagens de espaço idênticas.
--
-- Idempotente: `add column if not exists` + `create or replace`.
-- =============================================================================

alter table sales
  add column if not exists product text
    check (product is null or product in ('enjoy_pro', 'enjoy_growth', 'enjoy_rec')),
  add column if not exists down_payment_cents bigint
    check (down_payment_cents is null or down_payment_cents >= 0),
  add column if not exists down_payment_date date,
  add column if not exists first_due_date date;

-- -----------------------------------------------------------------------------
-- op_update_sale — altera a venda e (opcional) refaz os títulos
-- -----------------------------------------------------------------------------
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
    product                   = s.product,
    down_payment_cents        = s.down_payment_cents,
    down_payment_date         = s.down_payment_date,
    first_due_date            = s.first_due_date,
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

