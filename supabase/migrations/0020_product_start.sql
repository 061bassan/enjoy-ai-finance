-- =============================================================================
-- 0020 — Produto Enjoy Start (e PEAP passa a se chamar Enjoy Pro)
-- =============================================================================
--
-- O produto entra como valor novo nas duas colunas que guardam produto
-- (`sales.product`, 0018, e `commercial_meetings.product`, 0019). O CHECK é
-- recriado com a lista nova — nenhum dado existente muda de valor.
--
-- "PEAP" sempre foi o que hoje se chama Enjoy Pro: a reunião cuja proposta
-- começa com "PEAP" recebe o produto `enjoy_pro`; "Start…", `enjoy_start`;
-- "Rec…", `enjoy_rec`. "Start ou Rec" fica sem produto — ainda não se decidiu.
-- Só preenche reunião SEM produto: nada que alguém já escolheu é sobrescrito.
-- =============================================================================

alter table sales drop constraint if exists sales_product_check;
alter table sales add constraint sales_product_check
  check (product is null or product in ('enjoy_start', 'enjoy_pro', 'enjoy_growth', 'enjoy_rec'));

alter table commercial_meetings drop constraint if exists commercial_meetings_product_check;
alter table commercial_meetings add constraint commercial_meetings_product_check
  check (product is null or product in ('enjoy_start', 'enjoy_pro', 'enjoy_growth', 'enjoy_rec'));

update commercial_meetings
set product = case
    when proposal ilike 'peap%' then 'enjoy_pro'
    when proposal ilike 'start ou rec%' then null
    when proposal ilike 'start%' then 'enjoy_start'
    when proposal ilike 'rec%' then 'enjoy_rec'
  end
where product is null and proposal is not null;
