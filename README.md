<div align="center">
  <img src="public/logo.png" alt="Enjoy" width="88" />
  <h1>Enjoy AI Finance</h1>
  <p><strong>Gestão financeira e comercial da Enjoy Scale.</strong><br/>
  Registrar um fato reprecifica todos os indicadores — porque nenhum indicador é armazenado.</p>
</div>

---

## O que é

Painel de operação que une três domínios que normalmente vivem em planilhas separadas:

- **Financeiro** — caixa, contas a pagar e receber, recorrências, transferências, metas.
- **Comercial** — vendas com closer/SDR/origem, funil diário, CPL, CAC, win rate, comissões.
- **Executivo** — ARR, churn, LTV, LTV/CAC, forecast, burn rate, runway, diagnóstico de saúde.

A diferença em relação a um app de finanças com relatórios: **nada é derivado e salvo**.
Lançar uma venda muda receita, MRR, CAC, ROI e forecast no mesmo instante, sem job nem
recálculo agendado, porque nenhum desses números é cópia de outro.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5180
```

Não precisa de `.env` nem de backend: os dados ficam no IndexedDB do navegador.
O app abre vazio, criando só o esqueleto — dois espaços (Enjoy Scale e Pessoal), uma conta
em cada, o plano de categorias e o quadro de contas a pagar. Tudo editável em Configurações.

Cria-se uma conta (nome completo, CPF, nascimento, telefone, e-mail e senha) e **pede-se**
um cargo. Até um sócio liberar em **Configurações → Acessos**, a pessoa só vê a tela de
espera. O primeiro cadastro vira dono e já entra liberado — não haveria quem aprovasse o
primeiro pedido.

| Comando | |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run test` | 168 testes — domínio, provider local e validações |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run build` | typecheck + build de produção |
| `npm run preview` | serve o `dist/` |

## Módulos

| Rota | |
|---|---|
| `/` | Dashboard — 18 KPIs, alertas automáticos, meta do mês |
| `/performance` | Séries temporais, receita por closer/SDR/canal, funil, centros de custo |
| `/executivo` | ARR, churn, LTV, LTV/CAC, forecast, burn, runway, diagnóstico |
| `/vendas` | Vendas com comissões e economia unitária |
| `/leads` | CRM — quadro por etapa, acompanhamento e conversão do lead em venda |
| `/comercial` | Diário comercial, funil, CPL, custo por reunião, CAC, win rate, ROI |
| `/clientes` | Carteira, receita por cliente, churn |
| `/transacoes` | Lançamentos com filtros |
| `/fluxo-de-caixa` | Previsto vs. realizado, saldo projetado, capital de giro, runway |
| `/a-receber` `/a-pagar` | Títulos com baixa parcial e aging |
| `/recorrentes` | Custo de operação mensal com frequências normalizadas |
| `/metas` | Metas mensais do negócio e metas financeiras com projeção de data |
| `/compras` | Metas de compra com "quando cabe no caixa" |
| `/kanban` | Drag & drop — soltar em "Pago" liquida o título e lança no caixa |
| `/relatorios` | Exportação CSV (Excel pt-BR) e impressão/PDF |
| `/configuracoes` | Contas, categorias, liberação de acessos, equipe, aparência, backup |

## Stack

Vite · React 18 · TypeScript strict · Tailwind · Radix UI · TanStack Query ·
React Router (rotas em `lazy`) · Dexie/IndexedDB · Recharts · dnd-kit · Vitest

Bundle inicial de ~189 kB gzip. As telas carregam sob demanda e as bibliotecas pesadas
ficam em arquivos próprios, então uma correção de texto não invalida o cache delas.

## Arquitetura em uma frase

`src/features/` (telas) → `src/hooks/data.ts` (React Query) → `src/data/` (contratos) →
Dexie, com `src/domain/` fazendo todo o cálculo de forma pura e testada.

Nenhuma tela importa Dexie. Trocar a persistência para Supabase é implementar
`DataProvider` de novo — sem tocar em `src/features/`.

## Documentação

- **[CLAUDE.md](./CLAUDE.md)** — guia completo para continuar o trabalho: arquitetura,
  invariantes que não podem ser quebradas, convenções, roadmap e armadilhas. **Comece aqui.**
- **[ESTADO.md](./ESTADO.md)** — histórico das fases 1 a 8 e do que veio depois.

## Status

Fases 1–8 concluídas: produto completo, sem dados de exemplo, pronto para uso real.
Somam-se a elas a personalização visual pelo sócio (acento, densidade, quais KPIs e
colunas cada tela mostra), o calendário próprio nos campos de data, o menu em grupos
recolhíveis, o **cadastro com fila de aprovação** e o **CRM de leads** — que fez a taxa
de conversão do funil passar a ser apurada em vez de digitada.

Fase 9 — persistência no Supabase — **está executada**: o provider `src/data/supabase/`
roda contra os mesmos contratos e as migrations `0001`–`0012` foram aplicadas num projeto
real (RLS espelhando a matriz de permissões). Com `VITE_DATA_PROVIDER=supabase` os dados
são do servidor; sem `.env`, o app volta ao IndexedDB por dispositivo. Ver `CLAUDE.md` §8.

---

<div align="center"><sub>Projeto privado · Enjoy Scale</sub></div>
