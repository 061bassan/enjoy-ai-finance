-- =============================================================================
-- Enjoy AI Finance — schema inicial
-- =============================================================================
--
-- Esta migration é a fonte de verdade do modelo de dados. Ela ainda NÃO é
-- executada: o produto roda sobre IndexedDB (`src/data/local/`) até a Fase 9.
-- Existe desde já para que o modelo local e o Postgres não divirjam — o
-- schema Dexie em `src/data/local/db.ts` é o espelho direto do que está aqui.
--
-- Convenções:
--   * Dinheiro é `bigint` em CENTAVOS. Nunca `numeric`, nunca `float`.
--   * Datas de negócio são `date`. Timestamps de sistema são `timestamptz`.
--   * Toda tabela de negócio tem `workspace_id` — é a coluna que o RLS usa.
--   * Nada de valor derivado persistido: saldo, MRR, CAC e progresso de meta
--     são calculados na leitura (ver `src/domain/`).
--
-- As políticas RLS no fim do arquivo são o espelho exato de
-- `src/data/rules/permissions.ts`. Mudou lá, muda aqui.
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type workspace_type as enum ('team', 'personal');
create type member_role    as enum ('owner', 'admin', 'finance', 'sales', 'viewer');
create type member_status  as enum ('active', 'invited', 'suspended');

create type account_type as enum ('checking', 'savings', 'cash', 'credit_card', 'investment');
create type category_kind as enum ('income', 'expense');

create type cost_center as enum (
  'marketing', 'equipe', 'comercial', 'operacional', 'producao',
  'infraestrutura', 'tecnologia', 'impostos', 'administrativo', 'financeiro'
);

create type transaction_kind   as enum ('income', 'expense', 'transfer');
create type transaction_status as enum ('pending', 'cleared');
create type payment_method     as enum ('pix', 'boleto', 'credit_card', 'debit_card', 'transfer', 'cash', 'other');

create type bill_direction as enum ('receivable', 'payable');
-- "overdue" não existe de propósito: atraso é derivado de due_date vs. hoje.
create type bill_status    as enum ('open', 'partial', 'paid', 'canceled');

create type frequency as enum ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly');

create type client_status as enum ('lead', 'active', 'paused', 'churned');
create type lead_source   as enum ('inbound', 'outbound', 'indicacao', 'trafego_pago', 'organico', 'evento', 'parceria', 'outro');
create type sale_model    as enum ('mrr', 'setup', 'projeto', 'consultoria', 'servico', 'tcv');
create type sale_status   as enum ('pendente', 'pago', 'em_implantacao', 'finalizado', 'cancelado');

create type goal_type     as enum ('savings', 'reserve', 'debt_payoff');
create type goal_status   as enum ('active', 'reached', 'archived');
create type purchase_status as enum ('wishlist', 'saving', 'approved', 'bought', 'dropped');

create type board_template   as enum ('bills', 'approvals', 'sales_pipeline', 'custom');
create type card_link_type   as enum ('bill', 'transaction', 'sale', 'purchase_goal');
create type column_drop_action as enum ('none', 'settle_bill', 'mark_sale_paid');

create type activity_action as enum ('create', 'update', 'delete', 'settle', 'move');

-- -----------------------------------------------------------------------------
-- Identidade e workspaces
-- -----------------------------------------------------------------------------

create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null,
  email      text not null unique,
  avatar_url text,
  job_title  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspaces (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  short_name text not null,
  type       workspace_type not null default 'team',
  owner_id   uuid not null references profiles(id) on delete restrict,
  currency   text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         member_role not null default 'viewer',
  status       member_status not null default 'active',
  invited_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index on workspace_members (user_id);
create index on workspace_members (workspace_id);

-- -----------------------------------------------------------------------------
-- Funções auxiliares do RLS
-- -----------------------------------------------------------------------------
--
-- `security definer` + `search_path` fixo: sem isso, a função consultaria
-- workspace_members sob RLS e entraria em recursão infinita.

create or replace function current_role_in(target_workspace uuid)
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from workspace_members
  where workspace_id = target_workspace
    and user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function is_member_of(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and status = 'active'
  )
$$;

-- Papéis que operam o financeiro: owner, admin e finance.
create or replace function can_manage_finance(target_workspace uuid)
returns boolean
language sql
stable
as $$
  select current_role_in(target_workspace) in ('owner', 'admin', 'finance')
$$;

-- Papéis que administram o workspace: owner e admin.
-- É o papel de admin pedido — enxerga e gerencia TUDO de um único workspace.
create or replace function can_administer(target_workspace uuid)
returns boolean
language sql
stable
as $$
  select current_role_in(target_workspace) in ('owner', 'admin')
$$;

-- -----------------------------------------------------------------------------
-- Estrutura financeira
-- -----------------------------------------------------------------------------

create table accounts (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  name                  text not null,
  type                  account_type not null default 'checking',
  institution           text,
  opening_balance_cents bigint not null default 0,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on accounts (workspace_id, archived);

create table categories (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  name                  text not null,
  kind                  category_kind not null,
  cost_center           cost_center,
  parent_id             uuid references categories(id) on delete set null,
  is_recurring_revenue  boolean not null default false,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on categories (workspace_id, kind);

create table clients (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  company      text,
  email        text,
  phone        text,
  status       client_status not null default 'lead',
  source       lead_source,
  start_date   date,
  churn_date   date,
  owner_id     uuid references profiles(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on clients (workspace_id, status);

-- -----------------------------------------------------------------------------
-- Vendas
-- -----------------------------------------------------------------------------

create table sales (
  id                        uuid primary key default uuid_generate_v4(),
  workspace_id              uuid not null references workspaces(id) on delete cascade,
  client_id                 uuid references clients(id) on delete set null,
  client_name               text not null,
  company                   text,
  sale_date                 date not null,
  closer_id                 uuid references profiles(id) on delete set null,
  sdr_id                    uuid references profiles(id) on delete set null,
  lead_source               lead_source,
  model                     sale_model not null,
  amount_cents              bigint not null default 0,
  mrr_cents                 bigint not null default 0,
  setup_cents               bigint not null default 0,
  contract_months           integer,
  payment_method            payment_method,
  installments              integer not null default 1,
  closer_commission_percent numeric(5,2) not null default 0,
  sdr_commission_percent    numeric(5,2) not null default 0,
  status                    sale_status not null default 'pendente',
  lead_created_at           date,
  notes                     text,
  created_by                uuid not null references profiles(id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint sales_amounts_non_negative
    check (amount_cents >= 0 and mrr_cents >= 0 and setup_cents >= 0)
);

create index on sales (workspace_id, sale_date desc);
create index on sales (workspace_id, status);
create index on sales (closer_id);
create index on sales (sdr_id);

create table sale_costs (
  id                uuid primary key default uuid_generate_v4(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  sale_id           uuid not null references sales(id) on delete cascade,
  ads_cents         bigint not null default 0,
  commission_cents  bigint not null default 0,
  bank_fee_cents    bigint not null default 0,
  platform_fee_cents bigint not null default 0,
  operational_cents bigint not null default 0,
  team_hours_cents  bigint not null default 0,
  freelancers_cents bigint not null default 0,
  production_cents  bigint not null default 0,
  travel_cents      bigint not null default 0,
  other_cents       bigint not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (sale_id)
);

-- -----------------------------------------------------------------------------
-- Títulos e caixa
-- -----------------------------------------------------------------------------

create table recurring_rules (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  kind          category_kind not null default 'expense',
  amount_cents  bigint not null,
  category_id   uuid references categories(id) on delete set null,
  cost_center   cost_center,
  account_id    uuid references accounts(id) on delete set null,
  client_id     uuid references clients(id) on delete set null,
  frequency     frequency not null default 'monthly',
  interval      integer not null default 1 check (interval > 0),
  day_of_month  integer check (day_of_month between 1 and 31),
  start_date    date not null,
  end_date      date,
  auto_generate boolean not null default true,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on recurring_rules (workspace_id, active);

create table bills (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  direction             bill_direction not null,
  party_name            text not null,
  client_id             uuid references clients(id) on delete set null,
  description           text not null default '',
  amount_cents          bigint not null check (amount_cents > 0),
  due_date              date not null,
  issue_date            date,
  status                bill_status not null default 'open',
  category_id           uuid references categories(id) on delete set null,
  cost_center           cost_center,
  account_id            uuid references accounts(id) on delete set null,
  installment_number    integer,
  installment_total     integer,
  installment_group_id  uuid,
  recurring_rule_id     uuid references recurring_rules(id) on delete set null,
  sale_id               uuid references sales(id) on delete set null,
  notes                 text,
  created_by            uuid not null references profiles(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on bills (workspace_id, direction, due_date);
create index on bills (workspace_id, status);
create index on bills (recurring_rule_id);
create index on bills (sale_id);

create table transactions (
  id                uuid primary key default uuid_generate_v4(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  account_id        uuid not null references accounts(id) on delete restrict,
  category_id       uuid references categories(id) on delete set null,
  kind              transaction_kind not null,
  amount_cents      bigint not null check (amount_cents > 0),
  date              date not null,
  description       text not null default '',
  status            transaction_status not null default 'cleared',
  payment_method    payment_method,
  cost_center       cost_center,
  tags              text[] not null default '{}',
  notes             text,
  created_by        uuid not null references profiles(id) on delete restrict,
  transfer_group_id uuid,
  bill_id           uuid references bills(id) on delete set null,
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  sale_id           uuid references sales(id) on delete set null,
  client_id         uuid references clients(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on transactions (workspace_id, date desc);
create index on transactions (workspace_id, kind);
create index on transactions (account_id);
create index on transactions (bill_id);
create index on transactions (transfer_group_id);

create table bill_payments (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  bill_id        uuid not null references bills(id) on delete cascade,
  amount_cents   bigint not null check (amount_cents > 0),
  date           date not null,
  account_id     uuid not null references accounts(id) on delete restrict,
  transaction_id uuid references transactions(id) on delete set null,
  notes          text,
  created_by     uuid not null references profiles(id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on bill_payments (bill_id);
create index on bill_payments (workspace_id, date desc);

-- -----------------------------------------------------------------------------
-- Comercial
-- -----------------------------------------------------------------------------

create table commercial_days (
  id                     uuid primary key default uuid_generate_v4(),
  workspace_id           uuid not null references workspaces(id) on delete cascade,
  date                   date not null,
  owner_id               uuid references profiles(id) on delete set null,
  leads                  integer not null default 0,
  calls                  integer not null default 0,
  meetings               integer not null default 0,
  no_shows               integer not null default 0,
  proposals_sent         integer not null default 0,
  proposals_approved     integer not null default 0,
  proposals_rejected     integer not null default 0,
  follow_ups             integer not null default 0,
  contracts_sent         integer not null default 0,
  contracts_signed       integer not null default 0,
  ads_investment_cents   bigint not null default 0,
  sdr_investment_cents   bigint not null default 0,
  closer_investment_cents bigint not null default 0,
  tools_cents            bigint not null default 0,
  crm_cents              bigint not null default 0,
  phone_cents            bigint not null default 0,
  internet_cents         bigint not null default 0,
  software_cents         bigint not null default 0,
  notes                  text,
  created_by             uuid not null references profiles(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (workspace_id, date, owner_id)
);

create index on commercial_days (workspace_id, date desc);

-- -----------------------------------------------------------------------------
-- Metas
-- -----------------------------------------------------------------------------

create table monthly_targets (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  month           date not null, -- sempre o dia 1
  revenue_cents   bigint not null default 0,
  profit_cents    bigint not null default 0,
  sales_count     integer not null default 0,
  meetings_count  integer not null default 0,
  proposals_count integer not null default 0,
  clients_count   integer not null default 0,
  mrr_cents       bigint not null default 0,
  setup_cents     bigint not null default 0,
  margin_percent  numeric(5,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, month)
);

create table goals (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  type         goal_type not null default 'savings',
  target_cents bigint not null check (target_cents > 0),
  target_date  date,
  account_id   uuid references accounts(id) on delete set null,
  status       goal_status not null default 'active',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on goals (workspace_id, status);

create table goal_contributions (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  goal_id        uuid not null references goals(id) on delete cascade,
  amount_cents   bigint not null,
  date           date not null,
  transaction_id uuid references transactions(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on goal_contributions (goal_id);

create table purchase_goals (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  name            text not null,
  description     text,
  estimated_cents bigint not null check (estimated_cents > 0),
  saved_cents     bigint not null default 0,
  priority        smallint not null default 3 check (priority between 1 and 5),
  target_date     date,
  product_url     text,
  cost_center     cost_center,
  status          purchase_status not null default 'wishlist',
  bought_at       date,
  transaction_id  uuid references transactions(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on purchase_goals (workspace_id, status);

-- -----------------------------------------------------------------------------
-- Kanban
-- -----------------------------------------------------------------------------

create table boards (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  template     board_template not null default 'custom',
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table board_columns (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  board_id       uuid not null references boards(id) on delete cascade,
  name           text not null,
  position       integer not null default 0,
  wip_limit      integer,
  on_drop_action column_drop_action not null default 'none',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on board_columns (board_id, position);

create table cards (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  board_id     uuid not null references boards(id) on delete cascade,
  column_id    uuid not null references board_columns(id) on delete cascade,
  title        text not null,
  description  text,
  position     integer not null default 0,
  amount_cents bigint,
  due_date     date,
  assignee_id  uuid references profiles(id) on delete set null,
  labels       text[] not null default '{}',
  link_type    card_link_type,
  link_id      uuid,
  created_by   uuid not null references profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on cards (board_id, column_id, position);

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------

create table activity_log (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id     uuid not null references profiles(id) on delete restrict,
  entity       text not null,
  entity_id    uuid not null,
  action       activity_action not null,
  summary      text not null default '',
  diff         jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on activity_log (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles','workspaces','workspace_members','accounts','categories','clients',
    'sales','sale_costs','recurring_rules','bills','transactions','bill_payments',
    'commercial_days','monthly_targets','goals','goal_contributions','purchase_goals',
    'boards','board_columns','cards','activity_log'
  ]
  loop
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function touch_updated_at()',
      target, target
    );
  end loop;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
--
-- Espelho de `src/data/rules/permissions.ts`:
--
--   owner   tudo, incluindo excluir o workspace
--   admin   tudo dentro do workspace + gestão de membros
--   finance todo o financeiro, sem tocar em membros
--   sales   apenas as próprias vendas e o próprio diário comercial
--   viewer  somente leitura
--
-- Regra geral aplicada abaixo: leitura para qualquer membro ativo, escrita
-- para quem opera o financeiro. As exceções (vendas e comercial, onde
-- `sales` escreve o que é seu) estão marcadas caso a caso.

alter table profiles           enable row level security;
alter table workspaces         enable row level security;
alter table workspace_members  enable row level security;
alter table accounts           enable row level security;
alter table categories         enable row level security;
alter table clients            enable row level security;
alter table sales              enable row level security;
alter table sale_costs         enable row level security;
alter table recurring_rules    enable row level security;
alter table bills              enable row level security;
alter table transactions       enable row level security;
alter table bill_payments      enable row level security;
alter table commercial_days    enable row level security;
alter table monthly_targets    enable row level security;
alter table goals              enable row level security;
alter table goal_contributions enable row level security;
alter table purchase_goals     enable row level security;
alter table boards             enable row level security;
alter table board_columns      enable row level security;
alter table cards              enable row level security;
alter table activity_log       enable row level security;

-- Perfis: cada um lê e edita o seu; membros do mesmo workspace se enxergam.
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from workspace_members mine
      join workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = profiles.id
    )
  );

create policy profiles_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Workspaces
create policy workspaces_select on workspaces for select
  using (is_member_of(id) or owner_id = auth.uid());

create policy workspaces_insert on workspaces for insert
  with check (owner_id = auth.uid());

create policy workspaces_update on workspaces for update
  using (can_administer(id)) with check (can_administer(id));

-- Só o dono apaga o workspace.
create policy workspaces_delete on workspaces for delete
  using (owner_id = auth.uid());

-- Membros: todos veem quem é do time; só owner/admin mexem.
create policy members_select on workspace_members for select
  using (is_member_of(workspace_id) or user_id = auth.uid());

create policy members_write on workspace_members for all
  using (can_administer(workspace_id)) with check (can_administer(workspace_id));

-- -----------------------------------------------------------------------------
-- Tabelas financeiras: leitura para membros, escrita para o financeiro
-- -----------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'accounts','categories','clients','recurring_rules','bills','transactions',
    'bill_payments','monthly_targets','goals','goal_contributions','purchase_goals',
    'boards','board_columns','cards','sale_costs'
  ]
  loop
    execute format(
      'create policy %1$I_select on %1$I for select using (is_member_of(workspace_id))',
      target
    );
    execute format(
      'create policy %1$I_write on %1$I for all
         using (can_manage_finance(workspace_id))
         with check (can_manage_finance(workspace_id))',
      target
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vendas: `sales` escreve apenas as próprias
-- -----------------------------------------------------------------------------

create policy sales_select on sales for select
  using (is_member_of(workspace_id));

create policy sales_insert on sales for insert
  with check (
    can_manage_finance(workspace_id)
    or (
      current_role_in(workspace_id) = 'sales'
      and (closer_id = auth.uid() or sdr_id = auth.uid() or created_by = auth.uid())
    )
  );

create policy sales_update on sales for update
  using (
    can_manage_finance(workspace_id)
    or (
      current_role_in(workspace_id) = 'sales'
      and (closer_id = auth.uid() or sdr_id = auth.uid())
    )
  )
  with check (
    can_manage_finance(workspace_id)
    or (
      current_role_in(workspace_id) = 'sales'
      and (closer_id = auth.uid() or sdr_id = auth.uid())
    )
  );

create policy sales_delete on sales for delete
  using (can_manage_finance(workspace_id));

-- -----------------------------------------------------------------------------
-- Diário comercial: `sales` escreve o próprio registro
-- -----------------------------------------------------------------------------

create policy commercial_select on commercial_days for select
  using (is_member_of(workspace_id));

create policy commercial_write on commercial_days for all
  using (
    can_manage_finance(workspace_id)
    or (current_role_in(workspace_id) = 'sales' and owner_id = auth.uid())
  )
  with check (
    can_manage_finance(workspace_id)
    or (current_role_in(workspace_id) = 'sales' and owner_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Auditoria: qualquer membro lê; escrita é append-only
-- -----------------------------------------------------------------------------

create policy activity_select on activity_log for select
  using (is_member_of(workspace_id));

create policy activity_insert on activity_log for insert
  with check (is_member_of(workspace_id) and actor_id = auth.uid());
