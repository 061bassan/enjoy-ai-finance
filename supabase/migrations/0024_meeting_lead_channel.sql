-- =============================================================================
-- 0024 — Canal do lead da reunião (LP × WhatsApp)
-- =============================================================================
--
-- O time quer comparar os leads que chegam pelo formulário da landing page com
-- os que chegam pelo WhatsApp: quantas reuniões cada canal marca e quantas
-- viram venda. `lead_channel` guarda isso em cada reunião; o painel de Métricas
-- comerciais quebra as marcações por canal, mês a mês.
--
-- Texto com CHECK, não enum — como a `region` da 0023: acrescentar um canal
-- depois é uma linha, sem `ALTER TYPE … ADD VALUE`.
--
-- Reuniões já cadastradas ficam nulas ("Não informado"): não há dado para
-- classificá-las. Dá para preencher editando cada uma.
--
-- Idempotente (`add column if not exists`).
-- =============================================================================

alter table commercial_meetings
  add column if not exists lead_channel text
    check (lead_channel is null or lead_channel in ('lp', 'whatsapp'));
