-- =============================================================================
-- 0013 — Fecha duas escaladas de privilégio encontradas na auditoria pré-entrega
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- 1) TOMADA DE POSSE DO WORKSPACE (era: qualquer `admin` apagava a empresa).
--    `workspaces_update` (0001) usa `can_administer` — que inclui `admin`,
--    `ceo` e `socio` — e NÃO trava a coluna `owner_id`. Como `workspaces_delete`
--    só olha `owner_id = auth.uid()`, um `admin` fazia
--        PATCH /rest/v1/workspaces?id=eq.<ws>   { "owner_id": "<seu uuid>" }
--    e depois
--        DELETE /rest/v1/workspaces?id=eq.<ws>
--    apagando (em cascata) TODOS os dados do espaço. A matriz
--    (`src/data/rules/permissions.ts`) reserva `delete:workspace` só ao `owner`.
--    Correção: um gatilho impede trocar `owner_id` a menos que quem chama já
--    seja o dono atual. Transferência de posse não é feature — na prática o
--    gatilho nunca dispara no uso normal; ele só fecha o caminho de abuso.
--
-- 2) `sales` INJETAVA/APAGAVA TÍTULOS ARBITRÁRIOS via as RPC de venda (0012).
--    As quatro operações de venda são SECURITY DEFINER (ignoram o RLS) e o
--    portão `may_write_sale` libera o `sales` na PRÓPRIA venda. Mas os títulos,
--    custos e cards recebidos eram conferidos só por `workspace_id` — nunca por
--    pertencerem àquela venda. Um closer, autorizado na venda dele, passava
--    `p_delete_bill_ids`/`p_bill_ids` com ids de QUALQUER título do espaço
--    (contas a pagar/receber alheias, inclusive já baixadas) e os apagava, ou
--    anexava títulos falsos com qualquer valor. `sales` não tem `manage:bills`
--    na matriz; o RLS (`can_manage_finance`, que exclui `sales`) barraria tudo
--    isso, mas o DEFINER pula o RLS. Apagar um título já baixado deixa a
--    `Transaction` de caixa órfã — o estado que a invariante 18 proíbe.
--
--    Em vez de reescrever as quatro funções grandes (risco alto de erro de
--    transcrição num fluxo que já está em produção), o conserto é um gatilho
--    que só se aplica ao cargo `sales`: um closer só toca em título/custo
--    amarrado a uma venda que é dele (closer_id/sdr_id = auth.uid()). Roda
--    também dentro das funções DEFINER — defesa em profundidade que pega
--    qualquer caminho, presente ou futuro. Para todos os outros cargos o
--    gatilho sai na hora e quem governa segue sendo o RLS.
--
--    Cards ficam de fora de propósito: `sales` TEM `manage:kanban` na matriz,
--    então mexer em card está dentro da capacidade dele (ver a pendência #3 da
--    auditoria, que é conflito matriz×RLS, não escalada).
--
-- Idempotente: `create or replace function` + `drop trigger if exists`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Trava de posse do workspace
-- -----------------------------------------------------------------------------
create or replace function forbid_owner_takeover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só o próprio dono transfere a posse. Um `admin` (que passa em
  -- `workspaces_update`) tem old.owner_id <> auth.uid() e é barrado aqui.
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then
    raise exception 'Só o dono do espaço pode transferir a posse.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forbid_owner_takeover on workspaces;
create trigger trg_forbid_owner_takeover
  before update on workspaces
  for each row execute function forbid_owner_takeover();

-- -----------------------------------------------------------------------------
-- 2) `sales` só mexe em título/custo da própria venda
-- -----------------------------------------------------------------------------

-- Verdadeiro quando a venda existe e o chamador tem direito sobre ela — pela
-- MESMA base dupla que o `may_write_sale` (0012) usa para liberar o `sales`:
--   • é o closer ou o SDR da venda (op_create/update/delete_sale), OU
--   • é dono/criador do lead que virou a venda (op_convert_lead autoriza assim,
--     e ali o closer da venda pode ser outra pessoa — sem este ramo o gatilho
--     barraria a conversão legítima do próprio lead).
-- SECURITY DEFINER para enxergar `sales`/`leads` independentemente do RLS.
create or replace function sale_belongs_to_caller(target_sale uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_sale is not null and exists (
    select 1 from sales s
    where s.id = target_sale
      and (
        s.closer_id = auth.uid()
        or s.sdr_id = auth.uid()
        or exists (
          select 1 from leads l
          where l.id = s.lead_id
            and (l.owner_id = auth.uid() or l.created_by = auth.uid())
        )
      )
  )
$$;

-- Gatilho compartilhado por `bills` e `sale_costs` — ambas têm `workspace_id`
-- e `sale_id`. Só restringe o cargo `sales`; os demais seguem sob o RLS.
create or replace function guard_sales_sale_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  -- Fora do `sales`, quem decide é o RLS (e o finance+ pode mexer em título
  -- por definição). `owner` sem linha de membro devolve NULL aqui e também sai.
  if current_role_in(ws) is distinct from 'sales' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Linha nova (insert/update) e linha antiga (update/delete): nenhuma das duas
  -- pode apontar para venda que não seja do closer.
  if tg_op in ('INSERT', 'UPDATE') and not sale_belongs_to_caller(new.sale_id) then
    raise exception 'Um closer só cria/edita registro da própria venda.';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and not sale_belongs_to_caller(old.sale_id) then
    raise exception 'Um closer só edita/remove registro da própria venda.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_guard_sales_bill on bills;
create trigger trg_guard_sales_bill
  before insert or update or delete on bills
  for each row execute function guard_sales_sale_link();

drop trigger if exists trg_guard_sales_cost on sale_costs;
create trigger trg_guard_sales_cost
  before insert or update or delete on sale_costs
  for each row execute function guard_sales_sale_link();
