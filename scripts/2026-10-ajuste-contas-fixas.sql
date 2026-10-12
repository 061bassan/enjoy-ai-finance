-- =============================================================================
-- Ajuste único de outubro/2026 — contas fixas já pagas por fora
-- =============================================================================
--
-- Situação: em outubro as contas fixas foram pagas e a saída já foi lançada
-- à mão em Entradas e saídas — menos Aluguel, IPTU, Empréstimo Bruna e a
-- parcela do HD externo. Mas o gerador automático criou em "A pagar" o título
-- de outubro de TODAS as regras. Dar baixa nesses títulos lançaria a despesa
-- de novo no caixa (saída duplicada).
--
-- O que este script faz: CANCELA (não apaga) os títulos de conta fixa ainda
-- em aberto, sem nenhuma baixa, que vencem até 31/10/2026 — exceto os quatro
-- acima. Cancelado sai do previsto, não lança nada no caixa e não é gerado
-- de novo (o gerador pula datas que já existem). Dá para reabrir pela tela
-- "A pagar" → menu do título → "Reabrir título".
--
-- Não toca em: títulos de novembro em diante, títulos pagos ou com baixa
-- parcial, títulos lançados à mão (sem regra) e nenhuma transação.
--
-- COMO RODAR (Supabase → SQL Editor):
--   1. Rode só o PASSO 1 e confira a lista. Se algum nome não bater (ex.: o
--      HD externo está cadastrado com outro nome), ajuste os padrões do
--      `not ilike` nos dois passos.
--   2. Rode o PASSO 2 inteiro (begin … commit). Ele mostra quantas linhas
--      mudou; se o número não for o esperado, troque `commit` por `rollback`.
-- =============================================================================

-- PASSO 1 — prévia (só lê) ----------------------------------------------------
select b.due_date, b.party_name, b.amount_cents / 100.0 as valor, b.status
from bills b
where b.direction = 'payable'
  and b.recurring_rule_id is not null
  and b.status = 'open'
  and b.due_date <= '2026-10-31'
  and not exists (select 1 from bill_payments p where p.bill_id = b.id)
  and b.party_name not ilike '%aluguel%'
  and b.party_name not ilike '%iptu%'
  and b.party_name not ilike '%bruna%'
  and b.party_name not ilike '%hd%'
order by b.due_date, b.party_name;

-- PASSO 2 — cancela os títulos da prévia --------------------------------------
begin;

update bills b
set status = 'canceled',
    notes = coalesce(b.notes || ' · ', '') ||
            'Cancelado no ajuste de out/2026: já pago e lançado em Entradas e saídas.',
    updated_at = now()
where b.direction = 'payable'
  and b.recurring_rule_id is not null
  and b.status = 'open'
  and b.due_date <= '2026-10-31'
  and not exists (select 1 from bill_payments p where p.bill_id = b.id)
  and b.party_name not ilike '%aluguel%'
  and b.party_name not ilike '%iptu%'
  and b.party_name not ilike '%bruna%'
  and b.party_name not ilike '%hd%';

commit;
