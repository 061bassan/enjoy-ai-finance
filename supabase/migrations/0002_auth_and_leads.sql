-- =============================================================================
-- Enjoy AI Finance — cadastro com aprovação e CRM de leads
-- =============================================================================
--
-- Segunda migration. Como a 0001, ainda NÃO foi executada: o produto roda
-- sobre IndexedDB até a Fase 9. Existe desde já para que o modelo local e o
-- Postgres não divirjam — `src/data/local/db.ts` (versão 3 do Dexie) é o
-- espelho direto do que está aqui.
--
-- Cobre duas mudanças:
--
--   1. **Fila de aprovação.** Quem se cadastra entra como `pending` e não vê
--      nada além da tela de espera. Um sócio libera, e só então o cargo
--      pedido vira cargo efetivo. Aprovações E recusas ficam gravadas.
--
--   2. **CRM de leads.** Cada lead é uma linha com nome e responsável, e o
--      "ganho" gera venda, cliente e títulos numa transação só. É o que faz a
--      taxa de conversão do funil ser apurada em vez de digitada.
--
-- Sobre senha: não há coluna de senha aqui. No Postgres quem guarda
-- credencial é o `auth.users` do Supabase — o PBKDF2 de
-- `src/lib/password.ts` existe apenas para o modo local e morre na migração.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Perfil — dados pessoais do cadastro
-- -----------------------------------------------------------------------------

alter table profiles
  add column cpf        text,
  add column birth_date date,
  add column phone      text;

-- CPF é a chave que identifica a pessoa na hora de aprovar. Único, mas
-- nullable: perfis criados antes desta tela não têm, e barrar o login deles
-- apagaria acesso a dados reais já lançados.
create unique index profiles_cpf_key on profiles (cpf) where cpf is not null;

-- Guardamos só dígitos, como no cliente (`onlyDigits` em @/lib/validators).
-- A máscara é apresentação e não pode virar dado: "111.444.777-35" e
-- "11144477735" seriam duas linhas diferentes no índice único acima.
alter table profiles
  add constraint profiles_cpf_digits check (cpf is null or cpf ~ '^\d{11}$'),
  add constraint profiles_phone_digits check (phone is null or phone ~ '^\d{10,11}$');

-- -----------------------------------------------------------------------------
-- 2. Vínculo — estados de aprovação
-- -----------------------------------------------------------------------------

-- `pending` é o estado inicial de todo cadastro que não é o do fundador.
-- `rejected` existe para que a recusa seja um FATO GRAVADO, não a ausência de
-- uma linha: apagar deixaria a mesma pessoa recadastrando na semana seguinte
-- sem ninguém lembrar da decisão.
alter type member_status add value if not exists 'pending'  before 'active';
alter type member_status add value if not exists 'rejected' after  'suspended';

alter table workspace_members
  add column requested_role member_role,
  add column decided_by     uuid references profiles(id) on delete set null,
  add column decided_at     timestamptz,
  add column decision_note  text;

-- A fila é consultada a cada abertura das Configurações.
create index workspace_members_pending_idx
  on workspace_members (workspace_id, status)
  where status = 'pending';

-- Um vínculo ativo sem registro de quem liberou parece legítimo e não é —
-- é o pior estado possível para uma tabela de permissão.
alter table workspace_members
  add constraint workspace_members_decision_complete
  check (
    status not in ('active', 'rejected')
    or decided_at is not null
    or requested_role is null
  );

-- -----------------------------------------------------------------------------
-- 3. Leads
-- -----------------------------------------------------------------------------

create type lead_stage as enum (
  'novo', 'contato', 'reuniao', 'proposta', 'negociacao', 'ganho', 'perdido'
);

create type lead_activity_kind as enum (
  'nota', 'ligacao', 'mensagem', 'email', 'reuniao', 'proposta', 'mudanca_etapa'
);

create table leads (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,

  name                  text not null,
  company               text,
  email                 text,
  phone                 text,

  source                lead_source,
  stage                 lead_stage not null default 'novo',
  owner_id              uuid references profiles(id) on delete set null,

  estimated_value_cents bigint not null default 0 check (estimated_value_cents >= 0),

  entered_at            date not null,
  last_contact_at       date,
  next_action_at        date,
  next_action_note      text,

  closed_at             date,
  lost_reason           text,

  client_id             uuid references clients(id) on delete set null,
  sale_id               uuid references sales(id) on delete set null,

  notes                 text,
  created_by            uuid not null references profiles(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Sair do funil carimba a data; continuar nele não pode ter carimbo.
  -- Sem isto, "tempo médio até fechar" contaria leads que não fecharam.
  constraint leads_closed_consistency check (
    (stage in ('ganho', 'perdido') and closed_at is not null)
    or (stage not in ('ganho', 'perdido') and closed_at is null)
  ),
  -- Lead ganho sem venda seria uma etiqueta sem dinheiro atrás — exatamente
  -- o problema que este módulo existe para resolver.
  constraint leads_won_has_sale check (stage <> 'ganho' or sale_id is not null)
);

-- `entered_at` é o eixo do funil: a pergunta é sempre "de tudo que chegou no
-- período, quanto virou venda".
create index on leads (workspace_id, entered_at desc);
create index on leads (workspace_id, stage);
create index on leads (workspace_id, owner_id);
create index on leads (sale_id);
-- Cobrança de follow-up: só interessa quem ainda está em jogo.
create index leads_next_action_idx on leads (workspace_id, next_action_at)
  where stage not in ('ganho', 'perdido');

create table lead_activities (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id      uuid not null references leads(id) on delete cascade,
  kind         lead_activity_kind not null default 'nota',
  date         date not null,
  summary      text not null default '',
  from_stage   lead_stage,
  to_stage     lead_stage,
  created_by   uuid not null references profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on lead_activities (lead_id, date desc);
create index on lead_activities (workspace_id, date desc);

-- Fecha o ciclo: dá para perguntar quantos leads de uma origem viraram
-- receita, e não só quantos foram marcados como ganhos.
alter table sales add column lead_id uuid references leads(id) on delete set null;
create index on sales (lead_id);

-- updated_at automático nas tabelas novas.
do $$
declare
  target text;
begin
  foreach target in array array['leads', 'lead_activities']
  loop
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function touch_updated_at()',
      target, target
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
--
-- Espelho de `src/data/rules/permissions.ts`. Leads seguem a mesma regra de
-- vendas: `sales` (closer/SDR) enxerga e edita apenas a própria carteira.

alter table leads           enable row level security;
alter table lead_activities enable row level security;

create policy leads_select on leads for select
  using (
    is_member_of(workspace_id)
    and (
      current_role_in(workspace_id) <> 'sales'
      or owner_id = auth.uid()
      or created_by = auth.uid()
    )
  );

create policy leads_insert on leads for insert
  with check (
    can_manage_finance(workspace_id)
    or (
      current_role_in(workspace_id) = 'sales'
      and (owner_id = auth.uid() or created_by = auth.uid())
    )
  );

create policy leads_update on leads for update
  using (
    can_manage_finance(workspace_id)
    or (current_role_in(workspace_id) = 'sales' and owner_id = auth.uid())
  )
  with check (
    can_manage_finance(workspace_id)
    or (current_role_in(workspace_id) = 'sales' and owner_id = auth.uid())
  );

create policy leads_delete on leads for delete
  using (can_manage_finance(workspace_id));

-- Histórico é append-only: um toque registrado não se reescreve, senão a
-- linha do tempo deixa de servir para saber o que realmente aconteceu.
create policy lead_activities_select on lead_activities for select
  using (
    exists (select 1 from leads where leads.id = lead_activities.lead_id)
    and is_member_of(workspace_id)
  );

create policy lead_activities_insert on lead_activities for insert
  with check (is_member_of(workspace_id) and created_by = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Perfil criado a partir do Auth
-- -----------------------------------------------------------------------------
--
-- No Supabase quem cria a conta é o `auth.users`. Os dados do cadastro
-- (nome, CPF, nascimento, telefone, cargo pedido) chegam em `raw_user_meta_data`
-- pelo `signUp`, e este trigger os materializa em `profiles`.

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
  if target_workspace is null then
    return new; -- Sem empresa criada ainda: o app monta os espaços na sequência.
  end if;

  select count(*) into member_count from workspace_members where workspace_id = target_workspace;

  wanted_role := coalesce((new.raw_user_meta_data->>'requested_role')::member_role, 'viewer');

  -- Primeiro membro vira dono: não existiria ninguém para aprovar o primeiro
  -- pedido, e o produto travaria no primeiro uso.
  insert into workspace_members (workspace_id, user_id, role, status, requested_role, decided_at)
  values (
    target_workspace,
    new.id,
    case when member_count = 0 then 'owner' else 'viewer' end,
    case when member_count = 0 then 'active' else 'pending' end,
    wanted_role,
    case when member_count = 0 then now() else null end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- 6. Operações atômicas (RPC)
-- -----------------------------------------------------------------------------
--
-- Equivalentes das transações Dexie em `src/data/local/operations.ts`. A
-- semântica precisa ser idêntica: a UI chama as duas pelo mesmo nome, e uma
-- divergência aqui vira um bug que só aparece em produção.

create or replace function approve_member(
  target_member uuid,
  granted_role  member_role,
  note          text default null
)
returns workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target workspace_members;
begin
  select * into target from workspace_members where id = target_member;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if not can_administer(target.workspace_id) then
    raise exception 'Só o sócio ou um administrador pode liberar acessos.';
  end if;

  -- Sem esta linha, quem entrasse com qualquer vínculo administrativo
  -- poderia se promover sozinho e a fila viraria decoração.
  if target.user_id = auth.uid() then
    raise exception 'Ninguém pode aprovar o próprio cadastro.';
  end if;

  -- Um admin não cria outro admin: a fila não pode ser um caminho lateral
  -- para escalar privilégio. Espelha `assignableRoles`.
  if granted_role in ('owner', 'admin') and current_role_in(target.workspace_id) <> 'owner' then
    raise exception 'Você não pode conceder este cargo.';
  end if;

  update workspace_members
     set role = granted_role,
         status = 'active',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = note
   where id = target_member
   returning * into target;

  return target;
end;
$$;

create or replace function reject_member(target_member uuid, note text default null)
returns workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target workspace_members;
begin
  select * into target from workspace_members where id = target_member;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if not can_administer(target.workspace_id) then
    raise exception 'Só o sócio ou um administrador pode decidir acessos.';
  end if;
  if target.user_id = auth.uid() then
    raise exception 'Ninguém pode decidir o próprio cadastro.';
  end if;

  -- Update, nunca delete: a decisão é o dado que precisa sobreviver.
  update workspace_members
     set role = 'viewer',
         status = 'rejected',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = note
   where id = target_member
   returning * into target;

  return target;
end;
$$;

create or replace function move_lead_stage(
  target_lead uuid,
  to_stage    lead_stage,
  note        text default null,
  lost        text default null
)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lead leads;
  updated      leads;
begin
  select * into current_lead from leads where id = target_lead;
  if not found then raise exception 'Lead não encontrado.'; end if;
  if current_lead.stage = to_stage then return current_lead; end if;

  -- Ganhar exige criar a venda; use convert_lead_to_sale.
  if to_stage = 'ganho' then
    raise exception 'Use convert_lead_to_sale para fechar um lead.';
  end if;

  update leads
     set stage = to_stage,
         last_contact_at = current_date,
         closed_at = case when to_stage = 'perdido' then current_date else null end,
         lost_reason = case when to_stage = 'perdido' then coalesce(lost, lost_reason) else null end,
         -- Reabrir limpa a próxima ação: a combinada morreu com o fechamento.
         next_action_at = case when to_stage = 'perdido' then null else next_action_at end
   where id = target_lead
   returning * into updated;

  insert into lead_activities (workspace_id, lead_id, kind, date, summary, from_stage, to_stage, created_by)
  values (
    current_lead.workspace_id,
    current_lead.id,
    'mudanca_etapa',
    current_date,
    coalesce(note, current_lead.stage || ' → ' || to_stage),
    current_lead.stage,
    to_stage,
    auth.uid()
  );

  return updated;
end;
$$;

/*
 * `convert_lead_to_sale` fica de fora desta migration de propósito.
 *
 * Ela precisa gerar os títulos a receber com exatamente a mesma regra de
 * `buildReceivables` (setup + uma parcela por mês de contrato, com resto
 * distribuído nas primeiras parcelas). Escrever essa lógica duas vezes —
 * aqui e no TypeScript — garante divergência: uma venda vinda do CRM
 * parcelaria diferente de uma venda digitada, e ninguém descobriria porque
 * os dois caminhos parecem certos quando olhados separadamente.
 *
 * O caminho correto na Fase 9 é uma função só, chamada pelos dois fluxos.
 * Ver o roteiro em CLAUDE.md §8.
 */

-- -----------------------------------------------------------------------------
-- 7. Reforço nas políticas de vendas
-- -----------------------------------------------------------------------------
--
-- `sales` (closer/SDR) só enxerga as próprias vendas — a 0001 dava select a
-- qualquer membro, o que contradizia `view:sales:own` na matriz de permissões.

drop policy if exists sales_select on sales;

create policy sales_select on sales for select
  using (
    is_member_of(workspace_id)
    and (
      current_role_in(workspace_id) <> 'sales'
      or closer_id = auth.uid()
      or sdr_id = auth.uid()
      or created_by = auth.uid()
    )
  );
