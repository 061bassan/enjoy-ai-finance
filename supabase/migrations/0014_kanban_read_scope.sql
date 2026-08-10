-- =============================================================================
-- 0014 — Fecha a leitura do kanban financeiro para o cargo `sales`
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- A 0008 fechou o SELECT das tabelas financeiras para `sales`, mas deixou de
-- fora `boards`, `board_columns` e `cards` — com a justificativa (errada) de
-- que "sales precisa do kanban para operar". Só que o único quadro que nasce no
-- bootstrap (0005) é o "Contas a pagar" (`template = 'bills'`, onde soltar um
-- card em "Pago" liquida o título e lança no caixa). Os cards carregam
-- `amount_cents`, o nome do fornecedor e o vínculo com o título — ou seja, dado
-- financeiro puro. Como o SELECT dessas três tabelas continuava em
-- `is_member_of(workspace_id)`, um `sales` autenticado lia
--     GET /rest/v1/cards
-- e via os valores a pagar da empresa, contornando a UI — o mesmo furo que a
-- 0008 corrigiu nas outras tabelas. `sales` não tem `view:financials` na matriz.
--
-- A ESCRITA de card já estava correta desde a 0001 (write = `can_manage_finance`,
-- que exclui `sales`), então `manage:kanban` no cargo `sales` nunca funcionou
-- para operar nada — só abria a leitura. Ele foi removido da matriz
-- (`src/data/rules/permissions.ts`) junto com esta migration; o kanban passa a
-- ser, na matriz e no servidor, uma ferramenta do financeiro.
--
-- Correção: reescrever o SELECT no MESMO padrão da 0008 — exclui `sales` e
-- mantém `viewer` (que TEM `view:financials`). Idempotente
-- (`drop policy if exists`).
-- =============================================================================

do $$
declare
  target text;
begin
  foreach target in array array['boards', 'board_columns', 'cards']
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
