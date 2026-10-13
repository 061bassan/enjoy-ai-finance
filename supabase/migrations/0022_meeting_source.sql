-- =============================================================================
-- 0022 — Origem da reunião (tráfego pago, indicação, orgânico…)
-- =============================================================================
--
-- O campo "criativo" misturava o criativo do anúncio com a origem do lead
-- ("Orgânico", "Networking"). Reunião de indicação não tem lead da Meta nem
-- verba de anúncio por trás: contada junto, inflava o agendamento (reunião ÷
-- lead) e barateava o custo por reunião. `source` separa os funis; as métricas
-- de tráfego passam a usar só as reuniões de tráfego pago.
--
-- Reaproveita o enum `lead_source` (o mesmo de leads, clientes e vendas), para
-- a origem da reunião, do lead e da venda falarem a mesma língua.
--
-- Classificação das reuniões já importadas, pelo que estava em "criativo":
--   "Orgânico"   → organico (o detalhe fica vazio)
--   "Networking" → indicacao (o detalhe fica vazio)
--   qualquer criativo de anúncio → trafego_pago (o criativo continua no detalhe)
--   sem nada → fica nulo (tratado como tráfego pago, como antes)
-- Idempotente: só toca reunião ainda sem origem.
-- =============================================================================

alter table commercial_meetings add column if not exists source lead_source;

update commercial_meetings
set source = case
      when creative ilike 'org%nico%' then 'organico'::lead_source
      when creative ilike 'networking%' then 'indicacao'::lead_source
      else 'trafego_pago'::lead_source
    end,
    creative = case
      when creative ilike 'org%nico%' or creative ilike 'networking%' then null
      else creative
    end
where source is null and creative is not null;
