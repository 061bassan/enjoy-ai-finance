-- =============================================================================
-- 0008 — Fecha a leitura do financeiro para o cargo `sales`
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- A 0001 criou, num laço, a política de SELECT das tabelas financeiras como
-- `using (is_member_of(workspace_id))` — ou seja, QUALQUER membro ativo lê.
-- Mas a matriz em `src/data/rules/permissions.ts` (fonte única de verdade) diz
-- que `sales` NÃO tem `view:financials`: closer/SDR enxerga só as próprias
-- vendas, seus leads, clientes e o kanban — nunca o caixa, a folha, as contas
-- a pagar nem a margem por venda (`isRestrictedRole`).
--
-- Como o repositório filtra apenas por workspace (não por cargo), o RLS era a
-- ÚNICA barreira — e estava aberta. Um `sales` autenticado, chamando o
-- PostgREST direto (GET /rest/v1/transactions, /bills, /sale_costs, /accounts),
-- lia todo o financeiro da empresa contornando a UI. É o cargo menos confiável
-- (tipicamente terceirizado/comissionado), então é justamente onde não pode
-- vazar.
--
-- Correção: reescrever o SELECT dessas tabelas para excluir `sales`, no mesmo
-- padrão que a 0002 já aplicou a `sales`/`leads`. `viewer` continua lendo —
-- ele TEM `view:financials` na matriz; só `sales` é barrado aqui.
--
-- Não toca em `clients`, `boards`, `board_columns`, `cards`, `sales`, `leads`:
-- essas o cargo `sales` precisa ler para operar, e já têm o escopo certo.
-- =============================================================================

do $$
declare
  target text;
begin
  foreach target in array array[
    'accounts','categories','recurring_rules','bills','transactions',
    'bill_payments','monthly_targets','goals','goal_contributions',
    'purchase_goals','sale_costs'
  ]
  loop
    execute format('drop policy if exists %1$I_select on %1$I', target);
    execute format(
      'create policy %1$I_select on %1$I for select
         using (is_member_of(workspace_id) and current_role_in(workspace_id) <> ''sales'')',
      target
    );
  end loop;
end;
$$;
