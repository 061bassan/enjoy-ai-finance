-- =============================================================================
-- 0019 — Reuniões comerciais (painel de Métricas comerciais)
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- A planilha "Métricas Comercial" acompanha cada call com um lead: data, nome,
-- status, proposta, quem fez a call e o criativo que gerou a call. Era o único
-- lugar onde existia a ponte entre o tráfego (leads do Marketing) e a venda —
-- e por estar fora do sistema, o win rate era digitado à mão todo mês.
--
-- `commercial_meetings` traz essa lista para dentro. A venda NÃO é guardada
-- aqui: as métricas encontram a venda cadastrada em Vendas pelo nome (ou pelo
-- `sale_id`, quando alguém vincula à mão) — cadastrou a venda, o win rate muda.
--
-- Status em texto com CHECK, não enum: acrescentar um status depois é uma
-- linha, sem a dança do `ALTER TYPE … ADD VALUE` fora de transação.
--
-- RLS espelha o diário comercial (0001): qualquer membro ativo lê; quem opera
-- o financeiro escreve tudo; o cargo `sales` (closer/SDR) escreve as reuniões
-- que ele mesmo cadastrou — é ele quem faz as calls.
--
-- NÃO idempotente (`create table` puro): numa base que já a tem, não rode de novo.
-- =============================================================================

create table commercial_meetings (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  date          date not null,
  name          text not null,
  status        text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'no_show', 'proposta', 'fechada', 'perdida')),
  proposal      text,
  product       text
    check (product is null or product in ('enjoy_pro', 'enjoy_growth', 'enjoy_rec')),
  host_name     text,
  creative      text,
  sale_id       uuid references sales(id) on delete set null,
  notes         text,
  created_by    uuid not null references profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on commercial_meetings (workspace_id, date desc);

create trigger commercial_meetings_touch before update on commercial_meetings
  for each row execute function touch_updated_at();

alter table commercial_meetings enable row level security;

create policy commercial_meetings_select on commercial_meetings for select
  using (is_member_of(workspace_id));

create policy commercial_meetings_write on commercial_meetings for all
  using (
    can_manage_finance(workspace_id)
    or (current_role_in(workspace_id) = 'sales' and created_by = auth.uid())
  )
  with check (
    can_manage_finance(workspace_id)
    or (current_role_in(workspace_id) = 'sales' and created_by = auth.uid())
  );
