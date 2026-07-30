# Enjoy AI Finance — guia para continuar o trabalho

Documento de contexto para quem (pessoa ou agente) pega este projeto sem tê-lo escrito.
Diz **o que é**, **como está montado**, **por que está montado assim** e **o que fazer em
seguida**. Complementos: [`README.md`](./README.md) para a visão de produto e
[`ESTADO.md`](./ESTADO.md) para o histórico das fases 1–8.

---

## 1. O que é

Sistema de gestão financeira e comercial de uma agência (**Enjoy Scale**), rodando como
SPA. Não é um app de finanças pessoais com relatórios: é um painel de operação onde
registrar **um fato** — uma venda, uma baixa de título, um dia comercial — reprecifica
**todos** os indicadores na hora, porque nenhum indicador é armazenado.

Cobre três domínios que normalmente vivem em planilhas separadas:

- **Financeiro** — caixa, contas a pagar/receber, recorrências, transferências, metas.
- **Comercial** — vendas com closer/SDR/origem, funil diário, CPL, CAC, win rate, comissões.
- **Executivo** — ARR, churn, LTV, LTV/CAC, forecast, burn rate, runway, diagnóstico de saúde.

O "AI" do nome é, hoje, **heurística determinística** — alertas do dashboard, diagnóstico
executivo, projeção de data de meta e de compra. Nenhuma chamada a LLM existe no código.
Ver §8 se a intenção for mudar isso.

### Estado atual

Fases 1–8 concluídas. Produto completo e utilizável, **sem dados de exemplo**, rodando
100% no navegador (IndexedDB). A fase 9 — persistência real no Supabase — está
**escrita mas não executada**. É o próximo grande passo.

| Verificação | Estado |
|---|---|
| `npm run test` | 53 testes passando (3 arquivos, domínio) |
| `npm run typecheck` | limpo |
| `npm run lint` | 0 erros, 3 avisos `react-refresh/only-export-components` (inofensivos) |
| `npm run build` | ok, ~16 s |
| Bundle inicial | ~178 kB gzip (`react` 51 + `data` 48 + `index` 79) |

---

## 2. Rodar

```bash
npm install
npm run dev        # http://localhost:5180  (porta fixada em vite.config.ts)
npm run test       # vitest, só o domínio
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # typecheck + vite build
npm run preview    # serve o dist/
```

Sem `.env` obrigatório: `VITE_DATA_PROVIDER` cai em `local` quando ausente.
Ver [`.env.example`](./.env.example).

### Entrar no app

Um único usuário, sem senha real. A tela de entrada pede **com qual cargo** entrar —
Dono, Administrador, Financeiro, Comercial ou Visitante. O cargo é **gravado de verdade**
na tabela de membros, então o app se comporta exatamente como se comportaria para alguém
convidado naquele cargo — não é um truque de sessão. Trocar: menu do avatar →
**Trocar de cargo**.

Isso é o `signInAs` em `src/data/contracts.ts:85`. Quando houver equipe real, essa função
**sai** e o cargo passa a vir só do convite.

### O app abre vazio — de propósito

A primeira abertura cria só o esqueleto: o usuário, os espaços **Enjoy Scale** e
**Pessoal**, uma conta em cada, o plano de categorias e o quadro de contas a pagar.
O dashboard mostra **Primeiros passos** enquanto nada foi lançado, em vez de uma parede
de zeros. Recomeçar: **Configurações → Dados → Apagar dados locais**.

> Bases criadas por versões antigas (com 6 meses de dados fictícios) são detectadas e
> limpas na abertura — `seedIfEmpty` em `src/data/local/index.ts`.

---

## 3. Stack

| Camada | Escolha |
|---|---|
| Build | Vite 5 + TypeScript 5.6 (strict) |
| UI | React 18, Tailwind 3, Radix UI (primitivos headless no padrão shadcn) |
| Estado servidor | TanStack Query 5 |
| Rotas | React Router 6, todas as telas em `React.lazy` |
| Persistência | Dexie 4 (IndexedDB) — trocável por Supabase |
| Gráficos | Recharts 2 (chunk próprio, 115 kB gzip, só baixa em tela com gráfico) |
| Drag & drop | dnd-kit |
| Datas | date-fns 4 |
| Toasts | sonner |
| Testes | Vitest 2, ambiente `node`, só `src/**/*.test.ts` |

Alias `@` → `src/` (em `vite.config.ts` **e** `tsconfig.json` — mudar nos dois).

---

## 4. Arquitetura

Quatro camadas, com dependência estritamente em uma direção:

```
src/features/  telas  ─┐
src/app/       shell   ├─→  src/hooks/data.ts  ─→  src/data/  ─→  Dexie
src/components/ UI    ─┘         (React Query)      (contratos)
                                      │
                                      └─→  src/domain/  (cálculo puro, sem I/O)
```

### `src/data/` — a fronteira

`contracts.ts` define `DataProvider`: `Repository<T>` para cada coleção, `AuthGateway`,
e `Operations` para o que precisa ser atômico. **Nenhum arquivo em `features/`, `app/` ou
`components/` importa Dexie.** Todos falam com as interfaces.

Por isso todo método é `async` mesmo quando a implementação local seria síncrona: a
assinatura precisa ser idêntica nos dois providers.

`src/data/index.ts` é o **único** ponto que decide onde os dados vivem, lendo
`VITE_DATA_PROVIDER`. Hoje só `local` existe; `supabase` lança erro explicativo.

**Regra de ouro:** trocar para Supabase **não deve tocar em `src/features/`**.
Se tocar, a camada de contratos falhou — o bug está nela, não na tela.

### `src/domain/` — cálculo puro

Funções sem I/O, sem React, sem data-de-hoje implícita (a data entra por parâmetro).
É a única camada com testes, e é onde vale escrever mais.

`money.ts` · `finance.ts` · `bills.ts` · `cashflow.ts` · `sales.ts` · `commercial.ts` ·
`goals.ts` · `recurrence.ts`

### `src/features/` — uma pasta por tela

Cada pasta traz a página e seus diálogos. Sem estado global além de sessão, tema e
período — que ficam em `src/app/` via context.

### `src/data/rules/permissions.ts` — matriz de papéis

Fonte única de verdade. A UI usa `can()` para esconder botões e bloquear rotas, e as
políticas RLS em `supabase/migrations/0001_init.sql` são o **espelho exato** desta tabela.
Mudou uma linha aqui? A migration muda junto.

> No modo local isto é a única barreira — e barreira de cliente **não é segurança**, é
> ergonomia. A segurança real chega com o RLS.

Poder decrescente: `owner` › `admin` › `finance` › `sales` › `viewer`. O papel `sales`
(closer/SDR) vê e edita **só o que é seu**, e não enxerga custo da empresa nem o
dashboard executivo. O filtro "apenas meus registros" mora nos **repositórios**, não na
matriz — a matriz guarda só a capacidade.

---

## 5. Invariantes — quebrar qualquer uma destas causa bug silencioso

1. **Dinheiro é inteiro em centavos** (`Cents`). Float não entra em nenhuma camada.
   Formatação só na borda de exibição, via `@/lib/money`.
2. **Datas de negócio são `IsoDate` (`"YYYY-MM-DD"`)**; timestamps de sistema são ISO
   completo. Nunca `Date` cru atravessando camadas — `@/lib/date`.
3. **Nenhum valor derivado é persistido.** Saldo, MRR, CAC, ARR, progresso de meta:
   sempre recalculados em `@/domain`. É isso que faz a automação funcionar sem job.
4. **`Bill` unifica** contas a receber, a pagar e custos futuros — mesma entidade, filtros
   diferentes. Evita triplicar lógica de atraso, baixa parcial e parcelamento.
5. **Atraso nunca é gravado.** É função de `dueDate` vs. hoje. Sem job de meia-noite.
   `status` guarda `open | partial | paid | canceled` — jamais "atrasado".
6. **Transferência entre contas não é receita nem despesa.** Duas transações amarradas
   pelo mesmo `transferGroupId`.
7. **Cartão de crédito fica fora do "cash em caixa"** — o saldo dele é dívida.
8. **Burn rate só conta meses negativos.** Um mês lucrativo não "compensa" a queima
   anterior no cálculo de runway.
9. **Frequências são normalizadas por proporção anual**, não por aproximação: semanal é
   52/12 por mês, não 4.
10. **Todo `workspaceId` é obrigatório** em entidade de negócio. Não existe leitura fora
    de escopo — é a chave de isolamento e a coluna que o RLS vai usar.
11. **Transação vinda de baixa de título não pode ser excluída** direto. Desfaz-se a baixa
    (`unsettleBillPayment`), que remove a transação e reabre o título.

---

## 6. Onde as coisas acontecem

| Rota | Arquivo | O que é |
|---|---|---|
| `/` | `features/dashboard/` | 20 KPIs, alertas automáticos, meta do mês |
| `/performance` | `features/performance/` | Séries temporais, receita por closer/SDR/canal, funil |
| `/executivo` | `features/executive/` | ARR, churn, LTV, LTV/CAC, forecast, burn, runway |
| `/vendas` | `features/sales/` | Vendas com comissões e economia unitária |
| `/comercial` | `features/commercial/` | Diário comercial, CPL, custo/reunião, CAC, win rate |
| `/clientes` | `features/clients/` | Carteira, receita por cliente, churn |
| `/transacoes` | `features/transactions/` | CRUD com filtros |
| `/fluxo-de-caixa` | `features/cashflow/` | Previsto vs. realizado, capital de giro, runway |
| `/a-receber` `/a-pagar` | `features/bills/` | Mesma página, prop `direction` |
| `/recorrentes` | `features/recurring/` | Custo de operação mensal |
| `/metas` | `features/goals/` | Metas mensais + financeiras com projeção de data |
| `/compras` | `features/purchases/` | Metas de compra com "quando cabe no caixa" |
| `/kanban` | `features/kanban/` | Soltar em "Pago" liquida o título e lança no caixa |
| `/relatorios` | `features/reports/` | CSV (Excel pt-BR) e impressão/PDF |
| `/configuracoes` | `features/settings/` | Contas, categorias, equipe, tema, backup JSON |

**Operações atômicas** (`src/data/contracts.ts:101`), o coração do sistema:

- `settleBill` — baixa total/parcial: cria `BillPayment`, gera a `Transaction` de caixa,
  atualiza o `Bill`. É o "previsto vira realizado".
- `createSaleWithReceivables` — venda + títulos a receber (setup + parcelas de MRR).
- `moveCard` — move o card e executa a ação da coluna de destino (`onDropAction`).
- `generateBillsFromRule` · `createTransfer` · `unsettleBillPayment` ·
  `exportWorkspace` / `importWorkspace`.

Cada provider implementa com a transação nativa (Dexie hoje, RPC no Postgres depois) —
**a semântica precisa ser idêntica**.

---

## 7. Convenções de código

- Português nos nomes de domínio visíveis (rotas, labels, enums de negócio como
  `LeadSource`, `CostCenter`); inglês na infraestrutura (tipos, funções, campos).
- Comentários explicam **por quê**, não o quê. O código existente tem densidade alta de
  comentário de decisão — manter esse padrão.
- Prettier: sem ponto-e-vírgula, aspas simples, 100 colunas
  ([`.prettierrc`](./.prettierrc)). Rodar `npm run format`.
- Componentes de UI em `src/components/ui/` seguem o padrão shadcn (Radix + CVA + `cn`).
  Não instalar shadcn CLI — copiar o estilo dos existentes.
- Teste novo vai em `src/domain/*.test.ts`. O ambiente Vitest é `node`: não há DOM,
  então não se testa componente hoje.

---

## 8. O que fazer em seguida

### Fase 9 — Supabase (o próximo passo real)

`supabase/migrations/0001_init.sql` está escrito, com RLS espelhando
`src/data/rules/permissions.ts`, mas **nunca foi executado**. Roteiro:

1. Criar o projeto no Supabase e rodar a migration.
2. Implementar `src/data/supabase/` contra os **mesmos contratos** — `repository.ts`,
   `auth.ts`, `operations.ts` (as atômicas viram funções RPC no Postgres).
3. Preencher `.env` e trocar `VITE_DATA_PROVIDER=supabase`.
4. Migrar os dados locais com `exportWorkspace` → `importWorkspace`.
5. `signInAs` sai; o cargo passa a vir do convite.

Critério de sucesso: **nenhum arquivo de `src/features/` no diff**.

> Há um MCP do Supabase disponível na sessão — dá para listar tabelas, aplicar migration
> e gerar os tipos TypeScript sem sair do editor.

### Pendências menores

1. **Importação CSV de transações** — `src/lib/csv.ts` já tem o `parseCsv`; falta a tela
   de mapeamento de colunas.
2. **Testes de componente** — hoje só o domínio é testado. Exigiria `jsdom` e
   `@testing-library/react` no Vitest.
3. **Insights com LLM** — se o "AI" do nome for para virar literal, o ponto natural de
   entrada são os alertas do dashboard e o diagnóstico executivo, que hoje são
   heurísticas. Manter a heurística como fallback offline.
4. **Chunk `index` em 79 kB gzip** — o maior do carregamento inicial. Dá para reduzir,
   mas não é urgente.

> O `ESTADO.md` lista "code splitting" como pendente. **Já foi feito** — todas as rotas
> estão em `React.lazy` (`src/app/routes.tsx`). Aquele item está obsoleto.

---

## 9. Repositório, CI e deploy

Remoto: **`061bassan/enjoy-ai-finance`** (privado), branch única `main`.

### Deploy — adiado por decisão, não por esquecimento

**Não há ambiente publicado.** A escolha foi consciente: hoje os dados vivem no
IndexedDB do navegador, então um app publicado seria uma base por dispositivo — abrir a
URL no celular não mostraria nada do que foi lançado no desktop. Publicar antes da fase 9
entrega uma promessa que o produto ainda não cumpre.

**A ordem certa é: Supabase primeiro, deploy depois.** Com a persistência no servidor, o
deploy passa a valer de verdade — e é trivial, porque o build é estático.

Quando chegar a hora, o encaixe natural é a **Vercel** (free tier aceita repo privado,
detecta Vite sozinho, preview por branch). Duas coisas a lembrar:

- Configurar as variáveis `VITE_*` no painel do serviço — o build as embute, então
  **qualquer chave ali vira pública**. Só a `anon key` do Supabase pode ir; a proteção
  real é o RLS.
- SPA precisa de fallback para `index.html`, senão `/vendas` dá 404 no reload. A Vercel
  resolve sozinha em projeto Vite; Netlify e Cloudflare exigem `_redirects` ou
  `netlify.toml`.

### CI — pendência de permissão

`.github/workflows/ci.yml` está escrito (typecheck → lint → testes → build, com o `dist`
como artefato) mas **não foi commitado**: o token do `gh` nesta máquina não tem o escopo
`workflow`, e o GitHub recusa o push. Para resolver:

```bash
gh auth refresh -h github.com -s workflow
git add .github && git commit -m "Adiciona CI" && git push
```

---

## 10. Armadilhas conhecidas

- **O projeto vive dentro do OneDrive.** A sincronização pode competir com `node_modules`
  e com o `.git`. Se aparecer erro estranho de arquivo travado, pausar o OneDrive.
- **Porta 5180**, não 5173 — fixada em `vite.config.ts`.
- **`npm run build` roda typecheck antes.** Falha de tipo derruba o build; é intencional.
- **Alias `@` está em dois lugares** (`vite.config.ts` e `tsconfig.json`).
- **`.env` é ignorado pelo git**, `.env.example` não. Nunca comitar credencial do Supabase.
- **Dados vivem no IndexedDB do navegador.** Limpar dados do site apaga tudo, e um
  navegador diferente é uma base diferente. Backup: Configurações → backup JSON. Esse é
  o argumento mais forte para a fase 9.
- **Os 3 avisos de lint** são `react-refresh/only-export-components` em arquivos que
  exportam componente + hook/constante. Custo/benefício não justifica separar.
