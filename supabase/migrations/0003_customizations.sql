-- =============================================================================
-- Enjoy AI Finance — personalização por workspace
-- =============================================================================
--
-- Espelha a tabela `customizations` do Dexie (`src/data/local/db.ts`, versão 2)
-- e o tipo `Customization` em `src/customization/types.ts`. Faltava por
-- completo: o módulo de personalização entrou depois da 0001/0002, e sem esta
-- tabela o repositório `customizations` no contrato não teria onde persistir.
--
-- Uma linha por workspace. A ausência de linha significa "preferências padrão"
-- — é o que faz um indicador novo aparecer sozinho para quem já personalizou.
--
-- `brand`, `hidden` e `hidden_nav` são `jsonb`: a forma deles é definida em
-- TypeScript (acento/intensidade/cantos/densidade; mapa de ocultos por tela;
-- rotas removidas do menu) e não vale explodir em colunas — mudaria o schema a
-- cada preset novo. O conteúdo camelCase mora dentro do jsonb, intocado.
-- =============================================================================

create table customizations (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand        jsonb not null default '{}'::jsonb,
  hidden       jsonb not null default '{}'::jsonb,
  hidden_nav   jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id)
);

create index on customizations (workspace_id);

create trigger customizations_touch before update on customizations
  for each row execute function touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: todo membro lê; só quem administra o workspace escreve
-- -----------------------------------------------------------------------------
--
-- Leitura para qualquer membro ativo porque a aparência é aplicada na tela de
-- todos. Escrita restrita a owner/admin — é a "personalização pelo sócio":
-- quem ajusta o produto para a equipe inteira, não cada um o seu. Espelha
-- `manage:workspace` em `src/data/rules/permissions.ts`.

alter table customizations enable row level security;

create policy customizations_select on customizations for select
  using (is_member_of(workspace_id));

create policy customizations_write on customizations for all
  using (can_administer(workspace_id))
  with check (can_administer(workspace_id));
