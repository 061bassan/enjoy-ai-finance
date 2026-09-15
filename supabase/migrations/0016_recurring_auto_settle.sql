-- =============================================================================
-- 0016 — Débito automático em contas fixas
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- Contas fixas já gera os títulos sozinha (0005/hooks/recurring.ts), mas a
-- baixa sempre foi manual — vencimento chegar não é prova de pagamento
-- (invariante 22 do CLAUDE.md). Para o cliente, isso significa reabrir o
-- título toda vez que um custo repetido cai (aluguel, assinatura, software) e
-- baixar na mão, mesmo quando o valor sai sozinho da conta por débito
-- automático ou cobrança recorrente no cartão.
--
-- `auto_settle` é opt-in por regra e nasce `false`: por padrão nada muda, e a
-- invariante 22 continua valendo para quem não ligar o interruptor. Quando
-- ligado, `useAutoSettleRecurringBills` (src/hooks/recurring.ts) baixa
-- sozinho, na data de vencimento, os títulos que essa regra gerou — usando a
-- MESMA operação `settleBill` do botão manual, então o rastro (BillPayment +
-- Transaction) é idêntico ao de uma baixa feita à mão.
--
-- Sem `accountId` a regra não pode ligar o interruptor (a UI barra isso) —
-- `settleBill` precisa saber de qual conta debitar.
-- =============================================================================

alter table recurring_rules
  add column if not exists auto_settle boolean not null default false;
