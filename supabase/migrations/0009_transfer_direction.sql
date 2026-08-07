-- =============================================================================
-- 0009 — Marcador de direção nas pernas de transferência
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- Uma transferência entre contas grava DUAS transações com o mesmo `kind`
-- ('transfer') e o mesmo valor positivo, amarradas por `transfer_group_id`.
-- Cada conta enxerga só a sua perna, então `kind` não diz se aquela perna
-- soma ou subtrai no saldo. Antes deste campo, `accountBalance` (em
-- `src/domain/finance.ts`) subtraía as duas — a conta de DESTINO nunca era
-- creditada, e o "caixa total" caía 2× o valor a cada transferência interna.
--
-- `transfer_direction` carrega o sinal: 'out' na origem (debita), 'in' no
-- destino (credita). Nulo em income/expense (a direção deles vem de `kind`) e
-- em transferências legadas, criadas antes deste campo — que o TS trata como
-- 'out' (debita), preservando o saldo já exibido em vez de reescrevê-lo.
--
-- A coluna é preenchida pela mesma linha em TS (`createTransfer` nos dois
-- providers) e materializada por `op_create_transfer` via
-- `jsonb_populate_recordset`, que já copia todas as colunas da tabela — a RPC
-- não precisa mudar.
-- =============================================================================

alter table transactions
  add column if not exists transfer_direction text
  check (transfer_direction in ('out', 'in'));
