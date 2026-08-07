-- =============================================================================
-- Enjoy AI Finance — operações atômicas (RPC)
-- =============================================================================
--
-- As operações compostas do sistema — baixar título, criar venda com títulos,
-- converter lead, transferir entre contas — tocam mais de uma tabela e
-- precisam ser tudo-ou-nada. No provider local isso é uma transação Dexie
-- (`src/data/local/operations.ts`); aqui é uma função, que já roda numa
-- transação implícita.
--
-- DESENHO — por que estas funções são "finas":
--
--   A regra de negócio (quanto parcelar, qual status o título assume, quais
--   datas a recorrência gera) NÃO é reescrita aqui. Ela mora uma vez só, em
--   TypeScript (`src/data/receivables.ts`, `src/domain/bills.ts`,
--   `src/domain/recurrence.ts`), e é a MESMA que o provider local usa. O
--   provider Supabase calcula as linhas com essa lógica e manda para cá
--   prontas; estas funções só as PERSISTEM, de forma atômica.
--
--   Foi exatamente por isso que a 0002 adiou `convert_lead_to_sale`: portar
--   `buildReceivables` para PL/pgSQL garantiria que uma venda vinda do CRM
--   parcelasse diferente de uma digitada à mão. Mantendo o cálculo no TS e
--   só a escrita aqui, os dois caminhos são idênticos por construção.
--
-- SEGURANÇA:
--
--   Todas são SECURITY INVOKER (o padrão). Cada INSERT/UPDATE/DELETE aqui
--   dentro passa pelas políticas RLS da tabela como se a UI as tivesse feito
--   direto — ninguém escreve fora do próprio workspace nem além do cargo. A
--   validação de regra (ex.: "título cancelado não baixa") roda no TS antes
--   da chamada, igual ao modo local; o RLS é a trava que não se contorna.
--
--   As linhas chegam como jsonb com CHAVES EM snake_case (a camada
--   `src/data/supabase/serialization.ts` converte). `jsonb_populate_record`
--   materializa cada uma no tipo da tabela, castando enums, arrays e datas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- settleBill — baixa (total/parcial): transação de caixa + pagamento + status
-- -----------------------------------------------------------------------------

create or replace function op_settle_bill(
  p_transaction jsonb,
  p_payment     jsonb,
  p_bill_id     uuid,
  p_bill_status bill_status
)
returns void
language plpgsql
as $$
begin
  insert into transactions select * from jsonb_populate_record(null::transactions, p_transaction);
  insert into bill_payments select * from jsonb_populate_record(null::bill_payments, p_payment);
  update bills set status = p_bill_status, updated_at = now() where id = p_bill_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- unsettleBillPayment — estorna a baixa: apaga transação e pagamento, reabre
-- -----------------------------------------------------------------------------

create or replace function op_unsettle_payment(
  p_payment_id    uuid,
  p_transaction_id uuid,
  p_bill_id       uuid,
  p_bill_status   bill_status
)
returns void
language plpgsql
as $$
begin
  if p_transaction_id is not null then
    delete from transactions where id = p_transaction_id;
  end if;
  delete from bill_payments where id = p_payment_id;
  update bills set status = p_bill_status, updated_at = now() where id = p_bill_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- createSaleWithReceivables — venda (+ custo) + títulos a receber já desenhados
-- -----------------------------------------------------------------------------

create or replace function op_create_sale(
  p_sale  jsonb,
  p_cost  jsonb,
  p_bills jsonb
)
returns void
language plpgsql
as $$
begin
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
-- updateSaleWithReceivables — altera a venda e (opcional) refaz os títulos
-- -----------------------------------------------------------------------------
--
-- Os títulos antigos vêm por id para apagar (o TS já recusou a operação se
-- algum tinha baixa). Os novos vêm prontos. `p_delete_bill_ids` vazio +
-- `p_bills` vazio = edição sem regenerar títulos.

create or replace function op_update_sale(
  p_sale            jsonb,
  p_cost            jsonb,
  p_delete_bill_ids uuid[],
  p_bills           jsonb
)
returns void
language plpgsql
as $$
declare
  s sales;
begin
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

  -- Custo: upsert pela venda (uma linha por venda, unique(sale_id)).
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
-- deleteSale — apaga venda, custos, títulos e cards; devolve o lead ao funil
-- -----------------------------------------------------------------------------
--
-- O TS já garantiu que nenhum título tinha baixa. Se a venda veio de um lead,
-- ele volta para "negociação" (a invariante "lead ganho tem venda atrás" não
-- pode sobreviver à exclusão) e o movimento fica na linha do tempo.

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
as $$
begin
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
-- deleteTransaction — apaga o lançamento (e o par, se for transferência)
-- -----------------------------------------------------------------------------
--
-- O TS já recusou apagar transação vinda de baixa de título e já resolveu o
-- par da transferência: aqui chega a lista final de ids a remover.

create or replace function op_delete_transactions(p_ids uuid[])
returns void
language plpgsql
as $$
begin
  if array_length(p_ids, 1) is not null then
    delete from transactions where id = any(p_ids);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- generateBillsFromRule — insere os títulos que faltavam da regra recorrente
-- -----------------------------------------------------------------------------
--
-- A idempotência (pular datas já geradas) é resolvida no TS com
-- `occurrencesBetween`; aqui chega só o que é novo.

create or replace function op_insert_bills(p_bills jsonb)
returns void
language plpgsql
as $$
begin
  if jsonb_array_length(coalesce(p_bills, '[]'::jsonb)) > 0 then
    insert into bills select * from jsonb_populate_recordset(null::bills, p_bills);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- createTransfer — as duas pernas da transferência, mesmo grupo
-- -----------------------------------------------------------------------------

create or replace function op_create_transfer(p_transactions jsonb)
returns void
language plpgsql
as $$
begin
  insert into transactions select * from jsonb_populate_recordset(null::transactions, p_transactions);
end;
$$;

-- -----------------------------------------------------------------------------
-- convertLeadToSale — o funil encosta no financeiro
-- -----------------------------------------------------------------------------
--
-- Cliente novo é inserido; cliente que voltou é reativado (limpa o churn);
-- cliente já ativo não é tocado — o TS decide qual caso e passa só o que se
-- aplica. Depois entram venda, custo e títulos, e o lead vira "ganho".

create or replace function op_convert_lead(
  p_client_new          jsonb,   -- cliente novo a inserir, ou null
  p_client_reactivate_id uuid,   -- cliente existente a reativar, ou null
  p_client_id           uuid,    -- id do cliente resolvido (novo ou existente)
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
as $$
begin
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

-- -----------------------------------------------------------------------------
-- moveCard — mover o card é um UPDATE simples; o efeito colateral (liquidar o
-- título / marcar a venda paga) o TS dispara chamando op_settle_bill ou um
-- update de venda depois, exatamente como o provider local encadeia moveCard →
-- settleBill. Não há função dedicada aqui de propósito: a atomicidade de cada
-- efeito já está garantida pela função que o executa.
-- =============================================================================

-- Execução exposta ao papel autenticado (PostgREST chama por aqui).
grant execute on function
  op_settle_bill(jsonb, jsonb, uuid, bill_status),
  op_unsettle_payment(uuid, uuid, uuid, bill_status),
  op_create_sale(jsonb, jsonb, jsonb),
  op_update_sale(jsonb, jsonb, uuid[], jsonb),
  op_delete_sale(uuid, uuid[], uuid[], uuid[], uuid, jsonb),
  op_delete_transactions(uuid[]),
  op_insert_bills(jsonb),
  op_create_transfer(jsonb),
  op_convert_lead(jsonb, uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid, date, jsonb)
to authenticated;
