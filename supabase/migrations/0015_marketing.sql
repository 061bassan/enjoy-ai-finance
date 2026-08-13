-- =============================================================================
-- Enjoy AI Finance — Marketing (investimento mensal por canal)
-- =============================================================================
--
-- Espelho de `MarketingEntry` em `src/data/types.ts` e da matriz em
-- `src/data/rules/permissions.ts`.
--
-- Por que a tabela existe: verba de anúncio é um fato MENSAL, e até aqui só
-- havia dois lugares para ela — o custo por venda (`sale_costs.ads_cents`) e o
-- diário comercial (`commercial_days.ads_investment_cents`). O primeiro obriga
-- a ratear a campanha do mês venda a venda; o segundo pede o número quebrado
-- por dia. Nenhum dos dois é o formato em que a informação existe.
--
-- Nenhum indicador é coluna aqui (CPL, CAC, ROAS, ROI, lucro): todos são
-- calculados em `src/domain/marketing.ts`, como manda a invariante 3.
-- =============================================================================

create type marketing_channel as enum (
  'geral',
  'meta_ads',
  'google_ads',
  'tiktok_ads',
  'linkedin_ads',
  'youtube_ads',
  'influenciador',
  'email',
  'organico',
  'outro'
);

create table marketing_entries (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  -- Sempre o dia 1, como em `monthly_targets`.
  month           date not null,
  channel         marketing_channel not null default 'geral',

  -- Verba de plataforma, separada das demais: é a única base honesta do ROAS.
  ads_cents       bigint not null default 0 check (ads_cents >= 0),
  agency_cents    bigint not null default 0 check (agency_cents >= 0),
  creative_cents  bigint not null default 0 check (creative_cents >= 0),
  tools_cents     bigint not null default 0 check (tools_cents >= 0),
  other_cents     bigint not null default 0 check (other_cents >= 0),

  -- O que a mídia entregou. Zero = não informado; a UI mostra "—".
  impressions     integer not null default 0 check (impressions >= 0),
  clicks          integer not null default 0 check (clicks >= 0),
  leads           integer not null default 0 check (leads >= 0),

  notes           text,
  created_by      uuid not null references profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Uma linha por canal por mês. Sem isto, dois lançamentos do mesmo Meta Ads
  -- em agosto dobrariam o investimento e cortariam o CPL pela metade.
  unique (workspace_id, month, channel)
);

create index on marketing_entries (workspace_id, month desc);

create trigger marketing_entries_touch
  before update on marketing_entries
  for each row execute function touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
--
-- Leitura para todo membro ativo MENOS `sales`: verba de marketing é custo da
-- empresa, e closer/SDR não enxerga custo da empresa (mesma regra que já tira
-- `sales` do dashboard executivo). Escrita para quem opera o financeiro.
--
-- Espelha `view:marketing` e `manage:marketing` em permissions.ts.

alter table marketing_entries enable row level security;

create policy marketing_entries_select on marketing_entries for select
  using (is_member_of(workspace_id) and current_role_in(workspace_id) <> 'sales');

create policy marketing_entries_write on marketing_entries for all
  using (can_manage_finance(workspace_id))
  with check (can_manage_finance(workspace_id));
