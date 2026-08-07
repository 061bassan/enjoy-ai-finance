-- =============================================================================
-- Enjoy AI Finance — semente do primeiro cadastro
-- =============================================================================
--
-- Estende `handle_new_user` (0002) para o caso do PRIMEIRO cadastro.
--
-- POR QUE PRECISA SER AQUI, no servidor e com security definer:
--
--   O primeiro dono não consegue criar o próprio espaço pela UI. As políticas
--   de escrita (workspaces_insert, members_write, *_write) exigem um vínculo
--   ATIVO que ainda não existe — é o problema do ovo e da galinha do RLS. A
--   0002 já resolvia metade (cria o perfil e, quando há empresa, o vínculo);
--   faltava semear a estrutura inicial quando NÃO há empresa nenhuma.
--
--   `handle_new_user` roda como security definer no insert de `auth.users`,
--   então enxerga a base inteira e escreve sem esbarrar no RLS. É o único
--   ponto autoritativo para decidir "esta pessoa é a primeira" — o cliente não
--   consegue: sob RLS, um segundo usuário também veria zero empresas (as dos
--   outros ficam escondidas) e tentaria semear de novo.
--
-- ESPELHO: o conteúdo semeado é o mesmo de `src/data/local/seed.ts`
-- (`seedWorkspacesFor`). É dado inicial estático e editável em Configurações;
-- se um dia mudar lá, muda aqui. É a única duplicação aceita entre os
-- providers, e é de dado, não de regra.
-- =============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace uuid;
  member_count     integer;
  wanted_role      member_role;
  company_id       uuid;
  personal_id      uuid;
  bills_board      uuid;
begin
  insert into profiles (id, name, email, cpf, birth_date, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), ''),
    (new.raw_user_meta_data->>'birth_date')::date,
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), '')
  );

  select id into target_workspace from workspaces where type = 'team' order by created_at limit 1;

  -- Empresa já existe: fluxo normal da fila de aprovação (idêntico à 0002).
  if target_workspace is not null then
    select count(*) into member_count from workspace_members where workspace_id = target_workspace;
    wanted_role := coalesce((new.raw_user_meta_data->>'requested_role')::member_role, 'viewer');

    -- Casts explícitos: um CASE de literais tem tipo `text`, e o Postgres não
    -- converte text→enum sozinho (só literal solto). Sem o cast, o insert
    -- falha com "column role is of type member_role but expression is text".
    insert into workspace_members (workspace_id, user_id, role, status, requested_role, decided_at)
    values (
      target_workspace,
      new.id,
      (case when member_count = 0 then 'owner' else 'viewer' end)::member_role,
      (case when member_count = 0 then 'active' else 'pending' end)::member_status,
      wanted_role,
      case when member_count = 0 then now() else null end
    );

    return new;
  end if;

  -- ===========================================================================
  -- Primeiro cadastro: semeia o esqueleto e entra como dono ativo.
  -- Nenhum dado de exemplo — só o que é necessário para operar.
  -- ===========================================================================

  -- gen_random_uuid() (nativa, em pg_catalog) e não uuid_generate_v4(): no
  -- Supabase a uuid-ossp vive no schema `extensions`, fora do search_path fixo
  -- desta função (`public`), e a chamada explícita não a encontraria.
  company_id  := gen_random_uuid();
  personal_id := gen_random_uuid();

  insert into workspaces (id, name, short_name, type, owner_id, currency) values
    (company_id,  'Enjoy Scale', 'Enjoy',   'team',     new.id, 'BRL'),
    (personal_id, 'Pessoal',     'Pessoal', 'personal', new.id, 'BRL');

  insert into workspace_members (workspace_id, user_id, role, status, requested_role, decided_at) values
    (company_id,  new.id, 'owner', 'active', 'owner', now()),
    (personal_id, new.id, 'owner', 'active', 'owner', now());

  insert into accounts (workspace_id, name, type, opening_balance_cents, archived) values
    (company_id,  'Conta principal', 'checking', 0, false),
    (personal_id, 'Conta principal', 'checking', 0, false);

  insert into categories (workspace_id, name, kind, cost_center, is_recurring_revenue, archived) values
    (company_id, 'Mensalidade',     'income',  null,             true,  false),
    (company_id, 'Implantação',     'income',  null,             false, false),
    (company_id, 'Projeto',         'income',  null,             false, false),
    (company_id, 'Consultoria',     'income',  null,             false, false),
    (company_id, 'Outras receitas', 'income',  null,             false, false),
    (company_id, 'Salários',        'expense', 'equipe',         false, false),
    (company_id, 'Pró-labore',      'expense', 'equipe',         false, false),
    (company_id, 'Freelancers',     'expense', 'producao',       false, false),
    (company_id, 'Tráfego pago',    'expense', 'marketing',      false, false),
    (company_id, 'Comissões',       'expense', 'comercial',      false, false),
    (company_id, 'Softwares',       'expense', 'tecnologia',     false, false),
    (company_id, 'Infraestrutura',  'expense', 'infraestrutura', false, false),
    (company_id, 'Aluguel',         'expense', 'administrativo', false, false),
    (company_id, 'Impostos',        'expense', 'impostos',       false, false),
    (company_id, 'Taxas bancárias', 'expense', 'financeiro',     false, false),
    (company_id, 'Operacional',     'expense', 'operacional',    false, false),
    (personal_id, 'Renda',       'income',  null, false, false),
    (personal_id, 'Moradia',     'expense', null, false, false),
    (personal_id, 'Alimentação', 'expense', null, false, false),
    (personal_id, 'Transporte',  'expense', null, false, false),
    (personal_id, 'Saúde',       'expense', null, false, false),
    (personal_id, 'Lazer',       'expense', null, false, false),
    (personal_id, 'Outros',      'expense', null, false, false);

  bills_board := gen_random_uuid();
  insert into boards (id, workspace_id, name, template, description)
  values (
    bills_board, company_id, 'Contas a pagar', 'bills',
    'Arraste um card até "Pago" para dar baixa no título e lançar no caixa.'
  );

  insert into board_columns (workspace_id, board_id, name, position, on_drop_action) values
    (company_id, bills_board, 'A pagar',               0, 'none'),
    (company_id, bills_board, 'Aguardando aprovação',  1, 'none'),
    (company_id, bills_board, 'Aprovado',              2, 'none'),
    (company_id, bills_board, 'Pago',                  3, 'settle_bill');

  return new;
end;
$$;
