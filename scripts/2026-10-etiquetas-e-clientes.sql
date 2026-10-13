-- =============================================================================
-- Ajuste único: migration 0021 (etiquetas) + vendas sem cliente
-- =============================================================================
-- 1. Coluna `labels` em customizations (etiquetas renomeáveis).
-- 2. Vendas cadastradas pelo formulário de Vendas com "Novo cliente" não
--    criavam cliente: ficavam fora da carteira, da meta "Novos clientes", do
--    churn e da receita por cliente. Para cada venda sem cliente: reaproveita o
--    cliente de mesmo nome (Dr Guilherme Fernandes já existe) ou cria um, e liga
--    a venda e os títulos a receber dela. Esperado: 3 vendas.
-- Transação única: contagem diferente desfaz tudo.
-- =============================================================================
begin;

alter table customizations
  add column if not exists labels jsonb not null default '{}'::jsonb;

do $$
declare
  r record;
  cid uuid;
  n integer := 0;
begin
  for r in select * from sales where client_id is null loop
    select id into cid from clients
      where workspace_id = r.workspace_id and lower(trim(name)) = lower(trim(r.client_name))
      limit 1;
    if cid is null then
      insert into clients (workspace_id, name, company, status, source, start_date)
      values (r.workspace_id, r.client_name, r.company, 'active', r.lead_source, r.sale_date)
      returning id into cid;
    end if;
    update sales set client_id = cid where id = r.id;
    update bills set client_id = cid where sale_id = r.id and client_id is null;
    n := n + 1;
  end loop;
  if n <> 3 then
    raise exception 'Esperava 3 vendas sem cliente, encontrei %. Nada foi alterado.', n;
  end if;
end $$;

commit;

-- Conferência (só lê)
select s.client_name as venda, c.name as cliente, c.start_date as cliente_desde,
       (select count(*) from bills b where b.sale_id = s.id and b.client_id = c.id) as titulos_ligados
from sales s left join clients c on c.id = s.client_id
order by s.sale_date;
