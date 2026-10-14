-- =============================================================================
-- 0023 — Região da reunião (Brasília × resto do Brasil)
-- =============================================================================
--
-- O time quer comparar quantas reuniões são marcadas com leads de Brasília (a
-- praça local) e quantas com leads do resto do Brasil. `region` guarda isso em
-- cada reunião; o painel de Métricas comerciais quebra as marcações por região,
-- mês a mês.
--
-- Texto com CHECK, não enum — como o `status` da 0019: acrescentar uma região
-- depois é uma linha, sem `ALTER TYPE … ADD VALUE`.
--
-- Reuniões já cadastradas ficam nulas ("Não informado"): não há dado na
-- planilha para classificá-las. Dá para preencher editando cada uma.
--
-- Idempotente (`add column if not exists`).
-- =============================================================================

alter table commercial_meetings
  add column if not exists region text
    check (region is null or region in ('brasilia', 'brasil'));
