-- =============================================================================
-- Importação única das planilhas "Métricas Comercial" e "Relatório Enjoy" (Meta Ads)
-- Gerado a partir da transcrição conferida: 36 reuniões (jun–out/2026) e o
-- Meta Ads de mai–out/2026 (investimento, leads e impostos em "outros").
-- Tudo numa transação: se qualquer contagem não bater, nada fica gravado.
-- Cria a tabela da migration 0019 — rodar UMA vez.
-- =============================================================================
begin;

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

do $$
declare
  ws uuid;
  owner uuid;
  vale uuid;
  n integer;
begin
  select id, owner_id into ws, owner from workspaces where name = 'Enjoy Scale' and type = 'team';
  if ws is null then raise exception 'Workspace Enjoy Scale não encontrado.'; end if;

  -- Marketing: substitui os números de mês já lançados pelos da planilha (fonte oficial).
  insert into marketing_entries (workspace_id, month, channel, ads_cents, other_cents, leads, notes, created_by)
  select ws, v.month, 'meta_ads', v.ads, v.tax, v.leads, v.notes, owner
  from (values
    ('2026-05-01'::date, 49300, 18, 6803, 'Importado do Relatório Meta Ads. Outros = impostos sobre anúncios (R$ 68,03).'),
    ('2026-06-01'::date, 175800, 50, 24260, 'Importado do Relatório Meta Ads. Outros = impostos sobre anúncios (R$ 242,60).'),
    ('2026-07-01'::date, 184208, 45, 25421, 'Importado do Relatório Meta Ads. Outros = impostos sobre anúncios (R$ 254,21).'),
    ('2026-08-01'::date, 132203, 28, 18244, 'Importado do Relatório Meta Ads. Outros = impostos sobre anúncios (R$ 182,44).'),
    ('2026-09-01'::date, 201325, 45, 27783, 'Importado do Relatório Meta Ads. Outros = impostos sobre anúncios (R$ 277,83).'),
    ('2026-10-01'::date, 141178, 50, 19483, 'Importado do Relatório Meta Ads. Outros = impostos sobre anúncios (R$ 194,83).')
  ) as v(month, ads, leads, tax, notes)
  on conflict (workspace_id, month, channel) do update set
    ads_cents = excluded.ads_cents,
    other_cents = excluded.other_cents,
    leads = excluded.leads,
    notes = excluded.notes;
  get diagnostics n = row_count;
  if n <> 6 then raise exception 'Marketing: esperava 6 meses, gravou %.', n; end if;

  -- Letícia (VENDA em 21/09, R$ 8.500 na planilha) = venda da Clínica Vale em 25/09.
  select id into vale from sales where workspace_id = ws and client_name = 'Clinica Vale' and sale_date = '2026-09-25';

  insert into commercial_meetings (workspace_id, date, name, status, proposal, host_name, creative, notes, sale_id, created_by)
  select ws, v.date, v.name, v.status, v.proposal, v.host, v.creative, v.notes,
         case when v.link = 'VALE' then vale end, owner
  from (values
    ('2026-06-06'::date, 'Kyoto', 'fechada', 'PEAP (9k)', 'João e Diogo', null, null, null),
    ('2026-06-18'::date, 'Aline', 'perdida', 'PEAP (9k)', 'Diogo', null, null, null),
    ('2026-06-18'::date, 'Danilla', 'perdida', 'PEAP (9k)', 'João', null, null, null),
    ('2026-06-22'::date, 'Ari', 'perdida', 'Rec (2k)', 'João e Diogo', null, null, null),
    ('2026-07-01'::date, 'Elen', 'no_show', null, 'João', 'Depoimento Rafaela', null, null),
    ('2026-07-02'::date, 'Jeana', 'proposta', 'Start (R$ 1.700)', 'João', 'Depoimento Rafaela', null, null),
    ('2026-07-02'::date, 'Catarina', 'fechada', 'Start + tráfego (R$ 1.700)', 'Duda', 'Depoimento Rafaela', 'Fechamento por mensagem.', null),
    ('2026-07-06'::date, 'Raphela', 'fechada', 'Start + studio (2,1k)', 'João', 'Depoimento Rafaela', 'Linha editorial, organização de perfil, 10 sessões de fotos, 10 vídeos, 5 posts.', null),
    ('2026-07-10'::date, 'Brunna', 'fechada', 'PEAP (R$ 2.400)', 'João', 'Depoimento Rafaela', '18 peças, tráfego e foto. Fechado aguardando pagamento.', null),
    ('2026-07-14'::date, 'Mayssa', 'proposta', 'PEAP Clínica + pessoal + site + Google Meu Negócio', 'João', 'Depoimento Rafaela', null, null),
    ('2026-07-27'::date, 'Thiago', 'proposta', 'Start', 'João', '15 - João Conteúdo', null, null),
    ('2026-07-28'::date, 'Felipe', 'agendada', 'Start ou Rec', 'Diogo', '16 - Antes e depois Kyoto', null, null),
    ('2026-07-28'::date, 'Paulo', 'no_show', 'PEAP', 'João', 'Follow up do anúncio personal', null, null),
    ('2026-07-28'::date, 'Hugo', 'agendada', 'Start ou Rec', 'João', '15 - João Conteúdo', null, null),
    ('2026-08-03'::date, 'Daniel', 'proposta', 'PEAP', 'João', '15 - João Conteúdo', null, null),
    ('2026-08-06'::date, 'Brenda', 'proposta', 'PEAP', 'João', '17 - Brasil', null, null),
    ('2026-08-14'::date, 'Larah', 'proposta', 'PEAP', 'João', 'Orgânico', null, null),
    ('2026-08-24'::date, 'Thiago', 'agendada', 'PEAP', null, null, null, null),
    ('2026-09-03'::date, 'Sthefany', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela', null, null),
    ('2026-09-03'::date, 'Thiago', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela', null, null),
    ('2026-09-10'::date, 'Camila', 'agendada', 'PEAP', 'João', 'Depoimento Rafaela', null, null),
    ('2026-09-18'::date, 'Cinthia', 'proposta', 'PEAP', 'João', 'Orgânico', null, null),
    ('2026-09-21'::date, 'Leticia', 'fechada', 'PEAP', 'João', 'Depoimento Guilherme', null, 'VALE'),
    ('2026-09-22'::date, 'SPX', 'proposta', 'PEAP', 'João', 'Networking', null, null),
    ('2026-09-28'::date, 'Isabella', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-09-28'::date, 'Larissa', 'agendada', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-09-29'::date, 'Karen', 'agendada', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-09-29'::date, 'Bruna', 'agendada', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-09-30'::date, 'Eloisa', 'agendada', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-09-30'::date, 'Renan', 'agendada', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-10-02'::date, 'Laune', 'proposta', 'Start', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-10-05'::date, 'Gabriel', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-10-08'::date, 'Adriana', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-10-08'::date, 'Maria', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-10-12'::date, 'Meire', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null),
    ('2026-10-13'::date, 'Rayssa', 'proposta', 'PEAP', 'João', 'Depoimento Rafaela V2', null, null)
  ) as v(date, name, status, proposal, host, creative, notes, link);
  get diagnostics n = row_count;
  if n <> 36 then raise exception 'Reuniões: esperava 36, gravou %.', n; end if;
end $$;

commit;

-- Conferência (só lê)
select to_char(date, 'YYYY-MM') as mes, count(*) as reunioes,
       count(*) filter (where sale_id is not null) as vinculadas
from commercial_meetings group by 1 order by 1;
