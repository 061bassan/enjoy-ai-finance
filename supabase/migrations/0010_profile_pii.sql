-- =============================================================================
-- 0010 — Protege o PII do perfil (CPF, nascimento, telefone)
-- =============================================================================
--
-- CONTEXTO / porquê
--
-- A 0001 deixou `profiles_select` liberar o perfil INTEIRO para qualquer
-- membro ativo do mesmo workspace — e a 0002 acrescentou `cpf`, `birth_date`
-- e `phone` a essa linha. Resultado: qualquer colega (inclusive `sales` e
-- `viewer`) lia o CPF, o telefone e a data de nascimento de todo o time
-- chamando `GET /rest/v1/profiles`. CPF é dado pessoal regulado (LGPD); só
-- quem LIBERA acesso (owner/ceo/socio) precisa vê-lo, e só para conferir quem
-- está aprovando.
--
-- O app, porém, lê `profiles` o tempo todo para resolver NOMES de closer/SDR
-- em quase toda tela. Não dá para simplesmente fechar a tabela sem apagar os
-- nomes. A separação:
--
--   • `profiles_directory` (view) — o que o app LÊ. Devolve todas as linhas
--     visíveis (nome/e-mail/avatar/cargo), mas MASCARA cpf/birth_date/phone
--     para quem não é gatekeeper. Mesmas colunas do `Profile`, então o
--     TypeScript não muda — o repositório só passa a ler daqui.
--   • `profiles` (tabela) — o que o app ESCREVE (cada um edita o seu). O SELECT
--     direto na tabela agora é só do próprio dono, então o PostgREST não serve
--     mais o CPF alheio nem por baixo.
--
-- A view é SECURITY DEFINER (security_invoker = false) de propósito: ela roda
-- como dona, ignora o RLS da tabela e o próprio WHERE/CASE abaixo É o controle
-- de acesso. É a única forma de mascarar COLUNA (o RLS só filtra LINHA) sem
-- mexer no front. `auth.uid()` continua vindo do JWT de quem chamou.
-- =============================================================================

-- Quem pode ver o PII de um perfil: o próprio dono, ou um gatekeeper
-- (owner/ceo/socio) que compartilha workspace com ele — espelha
-- `can_manage_members` em permissions.ts.
create or replace function viewer_sees_pii(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    profile_id = auth.uid()
    or exists (
      select 1
      from workspace_members mine
      join workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and mine.role in ('owner', 'ceo', 'socio')
        and theirs.user_id = profile_id
    )
$$;

-- Diretório de membros: nomes para todos, PII só para quem pode ver.
create or replace view profiles_directory
with (security_invoker = false) as
  select
    p.id,
    p.name,
    p.email,
    p.avatar_url,
    p.job_title,
    p.created_at,
    p.updated_at,
    case when viewer_sees_pii(p.id) then p.cpf        else null end as cpf,
    case when viewer_sees_pii(p.id) then p.birth_date else null end as birth_date,
    case when viewer_sees_pii(p.id) then p.phone      else null end as phone
  from profiles p
  where
    p.id = auth.uid()
    or exists (
      select 1
      from workspace_members mine
      join workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = p.id
    );

grant select on profiles_directory to authenticated;

-- Fecha o SELECT direto na tabela: sobra só o próprio dono. Todo o resto
-- (nomes dos colegas) passa a vir da view mascarada acima.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid());
