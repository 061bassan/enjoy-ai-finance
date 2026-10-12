-- =============================================================================
-- 0021 — Etiquetas renomeáveis (personalização)
-- =============================================================================
--
-- O time renomeia etiquetas na própria tela ("Perdida" → "Desistente"). O que
-- muda é só o TEXTO exibido; o valor gravado nas tabelas continua o mesmo, então
-- nenhuma métrica ou filtro percebe a troca.
--
-- Guarda em `customizations`, que já é a preferência do workspace (uma linha
-- por espaço, escrita por quem administra — RLS da 0003, inalterado). `jsonb`
-- pelo mesmo motivo de `brand`/`hidden`: a forma é definida em TypeScript
-- (grupo → valor → texto) e não vale virar coluna.
--
-- Idempotente (`add column if not exists`).
-- =============================================================================

alter table customizations
  add column if not exists labels jsonb not null default '{}'::jsonb;
