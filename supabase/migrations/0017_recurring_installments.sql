-- =============================================================================
-- 0017 — Contas fixas parceladas (valor total, parcelas e parcela atual)
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- "Contas fixas" só sabia de custo sem fim (aluguel, software). Empréstimo e
-- compra parcelada também se repetem todo mês, mas acabam — e quem cadastra
-- quer ver "parcela 3 de 10" no título de "A pagar" e parar de gerar título
-- depois da última parcela.
--
-- Três colunas OPCIONAIS em `recurring_rules`, todas nulas por padrão: regra
-- existente continua exatamente como era (sem parcelas = sem fim).
--
--   installment_total   quantas parcelas existem no total
--   installment_start   número da parcela que vence na primeira ocorrência
--                       (permite cadastrar um parcelamento já no meio)
--   total_amount_cents  valor total do parcelamento (informativo; o título
--                       continua usando amount_cents, o valor da parcela)
--
-- O número da parcela de cada título vai para as colunas que `bills` já tinha
-- desde a 0001 (`installment_number`/`installment_total`) — nada muda lá.
--
-- Idempotente (`add column if not exists`): rodar duas vezes não quebra.
-- Nenhum dado existente é alterado ou apagado.
-- =============================================================================

alter table recurring_rules
  add column if not exists installment_total integer
    check (installment_total is null or installment_total > 0),
  add column if not exists installment_start integer
    check (installment_start is null or installment_start > 0),
  add column if not exists total_amount_cents bigint
    check (total_amount_cents is null or total_amount_cents > 0);
