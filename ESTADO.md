# Estado do projeto — Enjoy AI Finance

> Fases 1 a 8 concluídas, mais a personalização visual, o cadastro com aprovação e o CRM
> de leads. Produto completo, sem dados de exemplo, pronto para uso real.

## Como rodar

```bash
npm run dev       # http://localhost:5180
npm run test      # 168 testes — domínio, provider local, validações
npm run typecheck # limpo
npm run lint      # 0 erros
npm run build     # produção
```

## Entrar

Conta de verdade, com senha. Cria-se o cadastro (nome completo, CPF, nascimento,
telefone, e-mail e senha) e **pede-se** um cargo. Até um sócio liberar em
**Configurações → Acessos**, a pessoa entra mas só vê a tela de espera.

O primeiro cadastro vira dono e já entra liberado — não existiria ninguém para aprovar o
primeiro pedido. E ninguém aprova o próprio cadastro, senão a fila viraria decoração.

Aprovar e recusar ficam gravados: quem pediu, qual cargo queria, quem decidiu e por quê.

## O app abre vazio

Não há nenhum dado de exemplo — e antes do primeiro cadastro o banco está literalmente
vazio. Os espaços **Enjoy Scale** e **Pessoal**, uma conta em cada, o plano de categorias
e o quadro de contas a pagar nascem junto com a conta do fundador. Tudo editável em
Configurações.

O painel mostra **Primeiros passos** enquanto nada foi lançado, em vez de uma parede de
zeros. Para recomeçar: **Configurações → Dados → Apagar dados locais**.

> Bases criadas por versões antigas (com 6 meses de dados fictícios) são detectadas e
> limpas automaticamente na abertura — ver `seedIfEmpty` em `src/data/local/index.ts`.

## Peso

Bundle inicial de **~180 kB gzip**. As telas carregam sob demanda e as bibliotecas pesadas
ficam em arquivos próprios (`react`, `charts`, `dnd`, `data`), então uma correção de texto
não invalida o cache delas. O Recharts (115 kB gzip) só baixa ao abrir uma tela com gráfico.

---

## Módulos entregues

| Rota | Módulo |
|---|---|
| `/` | Dashboard — 18 KPIs, alertas automáticos, meta do mês, gráficos |
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
| `/leads` | CRM — quadro por etapa, acompanhamento, conversão do lead em venda |
| `/configuracoes` | Contas, categorias, liberação de acessos, equipe, aparência, backup |

**105 arquivos, ~21.000 linhas.**

---

## Depois da fase 8 — personalização pelo sócio

O produto passou a se ajustar sem deploy. Em **Configurações → Aparência** dá para
escolher o acento e a densidade, decidir quais itens aparecem no menu e quais KPIs e
colunas cada tela mostra. O catálogo é declarativo (`src/customization/registry.ts`):
a tela de Aparência é construída a partir dele, então incluir algo na personalização é
acrescentar uma linha à lista.

Duas fronteiras deliberadas: **ocultar é apresentação, nunca filtro** — o KPI escondido
continua sendo calculado, senão "limpar a tela" viraria "sumir com a receita"; e **a cor
entra por acento, não por paleta livre** — só presets validados, para não destruir
contraste e hierarquia.

Entraram junto o **calendário próprio** nos campos de data (`src/components/DateField.tsx`,
com `src/lib/dateInput.ts` para digitação) e o **menu em grupos recolhíveis**, que
substituiu a barra lateral que encolhia.

---

## Cadastro com aprovação

O seletor de cargo da tela de entrada saiu. Em lugar dele há conta com senha, cadastro
com dados pessoais (nome, CPF, nascimento, telefone) e uma fila que o sócio decide.

Três regras sustentam o desenho:

1. **Quem pede não recebe o cargo na hora.** Fica `pending` com o cargo guardado em
   `requestedRole`; até a decisão, é tratado como visitante sem permissão nenhuma.
2. **Quem espera vê que o pedido chegou.** A tela de espera repete nome, e-mail, cargo
   pedido e data. Devolver ao login faria a pessoa achar que falhou e recadastrar.
3. **A decisão é um fato gravado.** Recusar faz `update`, nunca `delete` — senão a mesma
   pessoa se recadastraria sem ninguém lembrar da decisão anterior.

A senha é derivada com PBKDF2 antes de tocar o banco. Não protege de quem tem o
dispositivo — protege o **backup JSON**, que circula por e-mail e sai sem hash nenhum.

---

## CRM de leads

O funil comercial sempre teve o lugar da taxa de conversão, mas nunca conseguiu
calculá-la: os dois lados da conta vinham do mesmo formulário digitado, e nada nele
conhecia a tela de Vendas. O número existia e não significava nada.

Agora cada lead é uma linha com nome, telefone, responsável e etapa. Quando um lead é
marcado como ganho, ele passa pelo formulário de conversão e vira **cliente, venda e
títulos a receber** numa transação só (`convertLeadToSale`).

Com isso, **conversão = vendas registradas ÷ leads que entraram** — as duas pontas
apuradas, nenhuma digitada. O funil marca com "apurado" as etapas que vieram de fato
registrado, para separá-las das que ainda dependem do diário comercial.

O quadro não é filtrado pelo seletor de período: um lead aberto há três meses continua
sendo trabalho de hoje. O período recorta as métricas, não a carteira.

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
2. ~~**Fase 9 — Supabase.**~~ — **FEITA.** `src/data/supabase/` implementado contra os
   mesmos contratos; migrations `0001`–`0007` aplicadas num projeto real; app roda na
   nuvem com `VITE_DATA_PROVIDER=supabase`. **Nenhum arquivo de `src/features/` mudou.**
   Inclui os cargos `ceo`/`socio` (pares, gatekeepers) e o `owner` rotulado
   "Desenvolvedor". Detalhes no CLAUDE.md §4 e §8.
3. ~~**Code splitting**~~ — **feito.** Todas as rotas estão em `React.lazy`
   (`src/app/routes.tsx`) e o carregamento inicial caiu para ~180 kB gzip.
4. **Insights com LLM** — hoje o "AI" do nome se apoia em heurísticas (alertas do
   dashboard, diagnóstico executivo, projeções de meta e de compra).
5. **Testes de componente** — só lógica é testada (domínio, provider local, validações).
   Exigiria `jsdom` no Vitest.
6. ~~**`convert_lead_to_sale` no Postgres**~~ — **feito**, mas por outro caminho: em vez
   de portar `buildReceivables` para PL/pgSQL (o que garantiria divergência), a regra
   ficou só em TS e a RPC `op_convert_lead` apenas persiste as linhas prontas. Ver
   CLAUDE.md §8.
7. **Recuperação de senha** — no modo local não existe (sem servidor, sem e-mail). No
   Supabase, usar a recuperação por e-mail do próprio Auth.
8. ~~**Onde lançar a verba de marketing**~~ — **feito.** A tela `/marketing` recebe o
   investimento por mês e por canal, calcula CPL, CAC, ROAS, ROI e a sobra depois do
   marketing, e soma esse investimento ao custo por etapa do funil (Funil de vendas,
   Evolução, Visão dos sócios e Relatórios usam o mesmo `useMarketingInvestment`). O
   registro **não** cria despesa no caixa — em vez disso há um painel de conferência com
   as despesas de centro de custo Marketing. A migration `0015_marketing.sql` já foi
   aplicada em produção.

> Para continuar o trabalho, leia [`CLAUDE.md`](./CLAUDE.md) — traz a arquitetura, as
> invariantes e o roteiro da Fase 9 em detalhe.
