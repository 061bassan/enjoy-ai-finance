# Estado do projeto — Enjoy AI Finance

> Fases 1 a 8 concluídas. Produto completo, sem dados de exemplo, pronto para uso real.

## Como rodar

```bash
npm run dev       # http://localhost:5180
npm run test      # 53 testes do domínio
npm run typecheck # limpo
npm run lint      # 0 erros
npm run build     # produção
```

## Entrar

Um único usuário. Na tela de entrada escolhe-se **com qual cargo** entrar — Dono,
Administrador, Financeiro, Comercial ou Visitante. O cargo é gravado de verdade na tabela
de membros, então o app se comporta exatamente como se comportaria para alguém convidado
com aquele cargo. Para trocar: menu do avatar → **Trocar de cargo**.

Quando houver equipe real, `signInAs` sai e o cargo passa a vir só do convite.

## O app abre vazio

Não há nenhum dado de exemplo. A primeira abertura cria só o esqueleto: o usuário, os
espaços **Enjoy Scale** e **Pessoal**, uma conta em cada, o plano de categorias e o quadro
de contas a pagar. Tudo editável em Configurações.

O painel mostra **Primeiros passos** enquanto nada foi lançado, em vez de uma parede de
zeros. Para recomeçar: **Configurações → Dados → Apagar dados locais**.

> Bases criadas por versões antigas (com 6 meses de dados fictícios) são detectadas e
> limpas automaticamente na abertura — ver `seedIfEmpty` em `src/data/local/index.ts`.

## Peso

Bundle inicial de **~178 kB gzip**. As telas carregam sob demanda e as bibliotecas pesadas
ficam em arquivos próprios (`react`, `charts`, `dnd`, `data`), então uma correção de texto
não invalida o cache delas. O Recharts (115 kB gzip) só baixa ao abrir uma tela com gráfico.

---

## Módulos entregues

| Rota | Módulo |
|---|---|
| `/` | Dashboard — 20 KPIs, alertas automáticos, meta do mês, gráficos |
| `/performance` | Séries temporais, receita por closer/SDR/canal, funil, centros de custo |
| `/executivo` | ARR, churn, LTV, LTV/CAC, forecast, burn, runway, diagnóstico de saúde |
| `/vendas` | Vendas com closer, SDR, origem, modelo, comissões e economia unitária |
| `/comercial` | Diário comercial, funil, CPL, custo por reunião, CAC, win rate, ROI |
| `/clientes` | Carteira, receita por cliente, churn |
| `/transacoes` | CRUD com filtros; exclusão bloqueada em transação vinda de baixa |
| `/fluxo-de-caixa` | Previsto vs. realizado, saldo projetado, capital de giro, burn, runway |
| `/a-receber` `/a-pagar` | Títulos com baixa parcial, aging, atraso derivado |
| `/recorrentes` | Custo de operação mensal com frequências normalizadas |
| `/metas` | Metas mensais do negócio + metas financeiras com projeção de data |
| `/compras` | Metas de compra com "quando cabe no caixa" |
| `/kanban` | Drag & drop; soltar em "Pago" liquida o título e lança no caixa |
| `/relatorios` | Exportação CSV (Excel pt-BR) e impressão/PDF |
| `/configuracoes` | Contas, categorias, equipe e papéis, tema, backup JSON |

**78 arquivos, ~15.600 linhas.**

---

## Decisões que valem lembrar

- **Dinheiro é sempre inteiro em centavos.** Float não entra em nenhuma camada.
- **`Bill` unifica** contas a receber, a pagar e custos futuros. É o que dá
  "previsto vs. realizado" sem duplicar lógica de atraso e baixa parcial.
- **Atraso nunca é gravado** — é função de `dueDate` vs. hoje. Sem job de meia-noite.
- **Nenhum KPI é persistido.** Registrar uma venda muda receita, MRR, CAC, ROI e forecast
  na hora, porque nenhum deles é cópia.
- **Transferência entre contas não é receita nem despesa.**
- **Cartão de crédito fica fora do "cash em caixa"** — o saldo dele é dívida.
- **Burn rate só conta meses negativos.** Um mês lucrativo não "compensa" a queima
  anterior no cálculo de runway.
- **Frequências são normalizadas por proporção anual**, não por aproximação: semanal
  é 52/12 por mês, não 4.
- **A troca para Supabase não deve tocar em `src/features/`.** Se tocar, a camada de
  contratos falhou.

---

## O que ficou de fora

1. **Importação CSV de transações** — `src/lib/csv.ts` já tem o `parseCsv`; falta a tela
   de mapeamento de colunas.
2. **Fase 9 — Supabase.** `supabase/migrations/0001_init.sql` está escrito com RLS
   espelhando `src/data/rules/permissions.ts`, mas **ainda não foi executado**.
   Para migrar: rodar a migration, implementar `src/data/supabase/` contra os mesmos
   contratos, trocar `VITE_DATA_PROVIDER=supabase`.
3. ~~**Code splitting**~~ — **feito.** Todas as rotas estão em `React.lazy`
   (`src/app/routes.tsx`) e o carregamento inicial caiu para ~178 kB gzip.
4. **Insights com LLM** — hoje o "AI" do nome se apoia em heurísticas (alertas do
   dashboard, diagnóstico executivo, projeções de meta e de compra).
5. **Testes de componente** — só o domínio é testado. Exigiria `jsdom` no Vitest.

> Para continuar o trabalho, leia [`CLAUDE.md`](./CLAUDE.md) — traz a arquitetura, as
> invariantes e o roteiro da Fase 9 em detalhe.
