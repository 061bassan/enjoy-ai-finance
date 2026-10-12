-- =============================================================================
-- Ajuste único de produção — out/2026 — contas fixas parceladas
-- =============================================================================
--
-- Contexto: até a correção 4fb10f0 nenhuma conta fixa gerava título em
-- produção (created_by inválido). Quando a correção for publicada, o app gera
-- de uma vez os títulos desde a data de início de cada regra — inclusive
-- setembro e outubro, que já foram pagos e lançados à mão em Entradas e saídas.
-- Seis regras têm débito automático: o título vencido seria baixado na hora,
-- DUPLICANDO a saída no caixa.
--
-- Numa transação só (tudo ou nada):
--   1. migration 0017 (3 colunas opcionais em recurring_rules);
--   2. marca as regras parceladas (lidas do próprio nome) e tira o "(1/3)" do
--      nome — a parcela agora aparece sozinha no título;
--   3. cria como CANCELADOS os títulos de set/out já pagos, para o gerador
--      pular essas datas e nada ser baixado de novo.
--
-- Fica para o app gerar EM ABERTO: Aluguel 15/10, IPTU 10/10, HD Externo
-- 28/10 (1/3), Empréstimo (Bruna) 30/10 (2/10) e, de novembro em diante, tudo.
--
-- Não apaga nada e não cria transação. Contagem diferente do esperado desfaz
-- a transação inteira.
-- =============================================================================

do $$
declare
  n integer;
begin
  alter table recurring_rules
    add column if not exists installment_total integer
      check (installment_total is null or installment_total > 0),
    add column if not exists installment_start integer
      check (installment_start is null or installment_start > 0),
    add column if not exists total_amount_cents bigint
      check (total_amount_cents is null or total_amount_cents > 0);

  update recurring_rules r
  set name = p.new_name,
      installment_total = p.total,
      installment_start = p.start,
      total_amount_cents = p.total_cents,
      updated_at = now()
  from (values
    ('HD Externo 2tb Toshiba (1/3)', 'HD Externo 2tb Toshiba', 3, 1, 72000),
    ('Microondas (1/3) (CARTÃO MERCADO LIVRE DIOGO)', 'Microondas (CARTÃO MERCADO LIVRE DIOGO)', 3, 1, 47955),
    ('Parcela Aparador - (1/10) - (Cartão Bruna)', 'Parcela Aparador (Cartão Bruna)', 10, 1, 49270),
    ('Parcela Cadeiras - (1/10) - (Cartão João - Bradesco)', 'Parcela Cadeiras (Cartão João - Bradesco)', 10, 1, 85900),
    ('Parcela Climatizador - (1/10) - (Cartão Diogo - PAGBANK)', 'Parcela Climatizador (Cartão Diogo - PAGBANK)', 10, 1, 114300),
    ('Parcela Filtro de água - 12 parcelas (Cartão Diogo - BB)', 'Parcela Filtro de água (Cartão Diogo - BB)', 12, 1, 80904),
    ('Parcela Insulfime Janela - (1/3) - (Cartão Diogo - PagBank)', 'Parcela Insulfime Janela (Cartão Diogo - PagBank)', 3, 1, 64800),
    ('Parcela Empréstimo Equipamento', 'Parcela Empréstimo Bruna (Equipamento)', 10, 1, 500000)
  ) as p(old_name, new_name, total, start, total_cents)
  where r.name = p.old_name;

  get diagnostics n = row_count;
  if n <> 8 then
    raise exception 'Esperava 8 regras parceladas, encontrei %. Nada foi alterado.', n;
  end if;

  insert into bills (
    workspace_id, direction, party_name, client_id, description, amount_cents,
    due_date, status, category_id, cost_center, account_id,
    installment_number, installment_total, recurring_rule_id, notes, created_by
  )
  select r.workspace_id, 'payable', r.name, r.client_id, r.name, r.amount_cents,
         p.due::date, 'canceled', r.category_id, r.cost_center, r.account_id,
         case when r.installment_total is not null then p.parcela end,
         r.installment_total, r.id,
         'Já pago e lançado em Entradas e saídas (ajuste de out/2026).',
         w.owner_id
  from (values
    ('Adobe Creative Cloud (Cartão Diogo - BB)', '2026-09-10', null::int),
    ('Adobe Creative Cloud (Cartão Diogo - BB)', '2026-10-10', null),
    ('Captions AI (Cartão Diogo - BB)', '2026-09-10', null),
    ('Captions AI (Cartão Diogo - BB)', '2026-10-10', null),
    ('Claude Pro(pagamento de outubro cartão martercard itaú) (Cartão João - Bradesco)', '2026-09-10', null),
    ('Claude Pro(pagamento de outubro cartão martercard itaú) (Cartão João - Bradesco)', '2026-10-10', null),
    ('Dropbox (Cartão Diogo - Inter)', '2026-10-10', null),
    ('Energia', '2026-10-10', null),
    ('InLead (Cartão Diogo - Inter)', '2026-10-10', null),
    ('Internet', '2026-10-10', null),
    ('IPTU (Escritório)', '2026-09-10', null),
    ('Pagamento MEI´s', '2026-10-07', null),
    ('Microondas (CARTÃO MERCADO LIVRE DIOGO)', '2026-10-10', 1),
    ('Parcela Aparador (Cartão Bruna)', '2026-10-10', 1),
    ('Parcela Cadeiras (Cartão João - Bradesco)', '2026-10-10', 1),
    ('Parcela Climatizador (Cartão Diogo - PAGBANK)', '2026-10-10', 1),
    ('Parcela Filtro de água (Cartão Diogo - BB)', '2026-10-10', 1),
    ('Parcela Insulfime Janela (Cartão Diogo - PagBank)', '2026-10-10', 1),
    ('Parcela Empréstimo Bruna (Equipamento)', '2026-09-30', 1)
  ) as p(rule_name, due, parcela)
  join recurring_rules r on r.name = p.rule_name
  join workspaces w on w.id = r.workspace_id
  where not exists (
    select 1 from bills b where b.recurring_rule_id = r.id and b.due_date = p.due::date
  );

  get diagnostics n = row_count;
  if n <> 19 then
    raise exception 'Esperava criar 19 títulos cancelados, criaria %. Nada foi alterado.', n;
  end if;
end $$;

-- Conferência (só lê)
select string_agg(r.name || ' [' || coalesce(r.installment_start || '/' || r.installment_total, 'fixa') || '] ' ||
       coalesce((select string_agg(b.due_date || '=' || b.status, ' ' order by b.due_date)
                   from bills b where b.recurring_rule_id = r.id), '-'), ' ### ' order by r.name) as resultado
from recurring_rules r;
