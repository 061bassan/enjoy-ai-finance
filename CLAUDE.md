# Enjoy AI Finance — guia para continuar o trabalho

Documento de contexto para quem (pessoa ou agente) pega este projeto sem tê-lo escrito.
Diz **o que é**, **como está montado**, **por que está montado assim** e **o que fazer em
seguida**. Complementos: [`README.md`](./README.md) para a visão de produto e
[`ESTADO.md`](./ESTADO.md) para o histórico das fases 1–8 e do que veio depois.

---

## 1. O que é

Sistema de gestão financeira e comercial de uma agência (**Enjoy Scale**), rodando como
SPA. Não é um app de finanças pessoais com relatórios: é um painel de operação onde
registrar **um fato** — uma venda, uma baixa de título, um dia comercial — reprecifica
**todos** os indicadores na hora, porque nenhum indicador é armazenado.

Cobre três domínios que normalmente vivem em planilhas separadas:

- **Financeiro** — caixa, contas a pagar/receber, recorrências, transferências, metas.
- **Comercial** — vendas com closer/SDR/origem, funil diário, CPL, CAC, win rate, comissões.
- **Marketing** — verba mensal por canal, CPL, CAC de marketing, ROAS, ROI.
- **Executivo** — ARR, churn, LTV, LTV/CAC, forecast, burn rate, runway, diagnóstico de saúde.

O "AI" do nome é, hoje, **heurística determinística** — alertas do dashboard, diagnóstico
executivo, projeção de data de meta e de compra. Nenhuma chamada a LLM existe no código.
Ver §8 se a intenção for mudar isso.

### Estado atual

Fases 1–8 concluídas, mais a personalização visual pelo sócio, o **cadastro com fila de
aprovação**, o **CRM de leads**, a **Fase 9 (Supabase) EXECUTADA** e — agora — o módulo de
**Marketing** (§4). O provider `src/data/supabase/` está implementado contra os mesmos
contratos, as migrations `0001`–`0015` foram aplicadas num projeto real, e o app roda na nuvem quando
`VITE_DATA_PROVIDER=supabase` (ver §8). O provider local (IndexedDB) continua existindo e
é o padrão sem `.env`. Produto completo e utilizável, **sem dados de exemplo**.

| Verificação | Estado |
|---|---|
| `npm run test` | 213 testes passando (13 arquivos: domínio, provider local, validações) |
| `npm run typecheck` | limpo |
| `npm run lint` | 0 erros, 6 avisos `react-refresh/only-export-components` (inofensivos) |
| `npm run build` | ok, ~18 s |
| Bundle inicial | ~197 kB gzip (`react` 51 + `data` 48 + `index` 98) |

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

### Entrar no app — cadastro com aprovação

Há conta de verdade, com senha. O fluxo:

1. **Criar conta** — nome completo, CPF, data de nascimento, telefone, e-mail e senha.
   Tudo validado em `src/lib/validators.ts` (o CPF confere os dígitos verificadores).
2. **Escolher o cargo desejado** — Administrador, Financeiro, Comercial ou Visitante.
   É um *pedido*, não uma escolha: fica em `requestedRole`.
3. **Enviar** — a pessoa entra, mas com vínculo `pending`. A única tela que vê é
   **Aguardando liberação** (`features/auth/PendingAccessPage.tsx`), que repete o que foi
   enviado. Sem esse recibo, quem se cadastra tenta de novo e a fila enche de duplicados.
4. **Um sócio decide** em **Configurações → Acessos**. Aprovar concede o cargo pedido (ou
   outro); recusar **mantém a linha no banco** com quem pediu, quem decidiu e por quê.

Duas regras que sustentam o desenho:

- **O primeiro cadastro vira dono e já entra liberado.** Não existiria ninguém para
  aprovar o primeiro pedido — o produto travaria no primeiro uso (`isFirstMember`).
- **Ninguém aprova o próprio cadastro.** Sem isso, quem entrasse com qualquer vínculo
  administrativo poderia se promover sozinho e a fila viraria decoração.

> O antigo `signInAs` — o seletor de cargo na tela de entrada — **saiu**. Para ver o
> produto pelos olhos de outra função, mude o cargo de um membro em
> **Configurações → Equipe**.

A senha é derivada com PBKDF2 (`src/lib/password.ts`) antes de tocar o banco. **Isso não
é segurança de verdade** e o arquivo diz isso na primeira linha: no modo local, quem tem
o dispositivo tem o IndexedDB. Existe por duas razões concretas — a senha em claro nunca
entra no backup JSON que circula por e-mail, e a assinatura `signIn(email, senha)` é a
mesma que o Supabase Auth vai ter.

### O app abre vazio — de propósito

Antes de qualquer cadastro **o banco está vazio**: nem usuário, nem espaços. Os espaços
**Enjoy Scale** e **Pessoal**, as contas, o plano de categorias e o quadro de contas a
pagar nascem no primeiro cadastro (`seedWorkspacesFor`). Antes o app criava um usuário
fantasma na primeira abertura — uma conta sem dono e sem senha, que perdeu o sentido
quando o cadastro passou a ser real.

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
| Testes | Vitest 2, ambiente `node`, só `src/**/*.test.ts` (+ `fake-indexeddb`) |

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

src/customization/     o que cada tela mostra e com que cara (transversal)
```

### `src/data/` — a fronteira

`contracts.ts` define `DataProvider`: `Repository<T>` para cada coleção, `AuthGateway`,
e `Operations` para o que precisa ser atômico. **Nenhum arquivo em `features/`, `app/` ou
`components/` importa Dexie.** Todos falam com as interfaces.

Por isso todo método é `async` mesmo quando a implementação local seria síncrona: a
assinatura precisa ser idêntica nos dois providers.

`src/data/index.ts` é o **único** ponto que decide onde os dados vivem, lendo
`VITE_DATA_PROVIDER`. Os **dois** providers existem e são intercambiáveis: `local`
(IndexedDB, padrão sem `.env`) e `supabase` (Postgres + RLS, com `VITE_DATA_PROVIDER=supabase`).

**Regra de ouro:** trocar para Supabase **não deve tocar em `src/features/`**.
Se tocar, a camada de contratos falhou — o bug está nela, não na tela.

### `src/domain/` — cálculo puro

Funções sem I/O, sem React, sem data-de-hoje implícita (a data entra por parâmetro).
É o núcleo testado do sistema, e é onde vale escrever mais.

`finance.ts` · `bills.ts` · `cashflow.ts` · `sales.ts` · `commercial.ts` · `marketing.ts` ·
`goals.ts` · `recurrence.ts` · `leads.ts` · `membership.ts` (o `money.ts` mora em
`src/lib/`, não aqui — é utilitário de centavos, não regra de negócio).

`marketing.ts` guarda as contas do investimento mensal: CPL, CAC de marketing, ROAS, ROI e
a conciliação com o caixa. Três regras moram ali e explicam o resto: **o mês é indivisível**
(verba não se rateia por dia — período parcial traz o mês inteiro), **lead de plataforma e
lead de CRM nunca se somam** (é a mesma pessoa contada de duas fontes; o CPL prefere a
plataforma e cai para o CRM, dizendo de onde veio) e **ROAS usa só a mídia enquanto o ROI
usa tudo** (agência e criativo não escalam com a campanha).

`leads.ts` é onde mora a **taxa de conversão** (`conversionRate`): vendas reais ÷ leads.
`commercial.ts` usa a mesma conta no **win rate** do funil (`commercialKpis`): vendas
registradas ÷ leads do período, com o CRM preferido sobre o total digitado no diário. A
métrica antiga — propostas aprovadas ÷ propostas decididas — continua existindo como
`proposalApprovalRate`, porque responde outra pergunta (a qualidade da proposta, não a do
funil inteiro).
`membership.ts` guarda as regras da fila de aprovação — as mesmas que a UI, o provider
local e a função RPC do Postgres precisam aplicar. Regra escrita três vezes diverge na
terceira.

### `src/customization/` — o que cada tela mostra

Deixa o sócio ajustar acento, densidade, itens do menu e quais KPIs/colunas aparecem,
sem pedir deploy. `registry.ts` é o catálogo declarativo: a tela de Aparência
(`features/settings/AppearanceTab.tsx`) é construída a partir dele, então incluir um
item novo na personalização é acrescentar uma linha à lista.

Duas fronteiras que este módulo **não cruza** — e que são o motivo de ele ser seguro:

- **Ocultar é apresentação, nunca filtro.** Um KPI escondido continua sendo calculado
  com os mesmos dados. Se ocultar mudasse o número, "limpar a tela" viraria "sumir com
  a receita" e alguém decidiria errado.
- **Cor entra por acento, não por paleta livre.** Só presets validados; um seletor RGB
  aberto destruiria hierarquia visual e contraste.

`locked` marca o que não pode ser escondido — sem cliente e sem valor, a tabela de
vendas deixa de responder a única pergunta que ela existe para responder.

### `src/features/` — uma pasta por tela

Cada pasta traz a página e seus diálogos. Sem estado global além de sessão, tema,
período e personalização — que ficam em `src/app/` e `src/customization/` via context.

### `src/data/rules/permissions.ts` — matriz de papéis

Fonte única de verdade. A UI usa `can()` para esconder botões e bloquear rotas, e as
políticas RLS nas migrations (`0001` + `0006`/`0007` para os cargos + `0008` que fecha a
leitura do financeiro para o `sales`) são o **espelho
exato** desta tabela. Mudou uma linha aqui? A migration muda junto.

> No modo local a matriz é a única barreira — e barreira de cliente **não é segurança**, é
> ergonomia. No Supabase a segurança real é o RLS, que espelha esta matriz no servidor.

Poder decrescente: `owner` › `ceo` = `socio` › `admin` › `finance` › `sales` › `viewer`.

- **`owner`** é rotulado **"Desenvolvedor"** na UI (ver `ROLE_LABEL`): o fundador técnico,
  primeiro cadastro, único que apaga o workspace. É o topo da cadeia de liberação.
- **`ceo`** e **`socio`** são **pares** (mesma patente, mesmas permissões): comandam o
  negócio e **liberam acessos**. Um não nomeia nem rebaixa o outro; só o `owner` gerencia
  os dois. `role_rank` no SQL define a patente; a regra é "só concede/gerencia quem está
  abaixo de você".
- **`admin`** opera todos os dados e configurações, mas **NÃO libera acessos** — o portão
  de entrada tem só três donos (owner/ceo/socio). É o que sustenta "Desenvolvedor libera
  o CEO/Sócio, e eles liberam o resto".
- **`sales`** (closer/SDR) vê e edita **só o que é seu**, e não enxerga custo da empresa
  nem o dashboard executivo — nem a tela de Marketing, pela mesma razão (`view:marketing`
  está em `VIEWER`, não em `SALES`). O filtro "apenas meus registros" mora nos
  **repositórios**, não na matriz — a matriz guarda só a capacidade.

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
   pelo mesmo `transferGroupId`, com o mesmo valor positivo. O sinal vem de
   `transferDirection` (`'out'` debita a origem, `'in'` credita o destino) — sem esse
   marcador, `accountBalance` subtraía as duas pernas e o destino nunca era creditado.
7. **Cartão de crédito fica fora do "cash em caixa"** — o saldo dele é dívida.
8. **Burn rate só conta meses negativos.** Um mês lucrativo não "compensa" a queima
   anterior no cálculo de runway.
9. **Frequências são normalizadas por proporção anual**, não por aproximação: semanal é
   52/12 por mês, não 4.
10. **Todo `workspaceId` é obrigatório** em entidade de negócio. Não existe leitura fora
    de escopo — é a chave de isolamento e a coluna que o RLS vai usar.
11. **Transação vinda de baixa de título não pode ser excluída** direto. Desfaz-se a baixa
    (`unsettleBillPayment`), que remove a transação e reabre o título.
12. **Lead e cliente são entidades diferentes.** Lead é quem talvez compre; cliente é quem
    já comprou. Misturar faria a carteira inflar com gente que nunca pagou, e todo
    indicador de receita por cliente ficaria errado. A ponte é `convertLeadToSale`.
13. **Lead marcado como ganho tem venda atrás.** O "ganho" nunca é só uma etiqueta —
    passa pelo formulário de conversão, que cria cliente, venda e títulos. É o que faz a
    conversão do funil ser apurada em vez de digitada.
14. **Cargo só vale com vínculo `active`.** Um pendente que pediu "Administrador" é
    tratado como visitante até a decisão, e `allow()` devolve `false` para tudo.
15. **Recusa não apaga linha.** Quem pediu, qual cargo queria, quem decidiu e por quê
    ficam no banco. Apagar deixaria a mesma pessoa recadastrando sem ninguém lembrar.
16. **O backup JSON não carrega senha.** `exportWorkspace` zera `passwordHash`, e o
    import preserva o hash de quem já está na base — senão reimportar o próprio backup
    trancaria a pessoa para fora.
17. **Tudo que se cria, se corrige.** Quem pode registrar um fato pode editá-lo e
    apagá-lo, na mesma tela e sob a mesma permissão. Criar sem poder corrigir empurra a
    pessoa para o duplicado: ela lança de novo "certo" e deixa o errado para trás.
18. **Registro com dinheiro atrás não se apaga por baixo.** Título com baixa bloqueia a
    exclusão do título, a exclusão da venda e a regeração dos recebíveis; conta com
    lançamento e cliente com venda idem. O caminho é sempre desfazer o que veio depois
    (estornar a baixa) e só então mexer no que veio antes. Apagar por cima deixaria
    dinheiro no caixa sem origem, que é a única coisa que o sistema não pode permitir.
19. **Investimento de marketing não vira despesa no caixa.** A tela de Marketing recebe um
    fato mensal (quanto foi para a mídia) e calcula sobre ele; a despesa continua sendo
    lançada em Entradas e saídas, como sempre. Se o registro criasse a transação, quem já
    lança a fatura da plataforma teria o mesmo custo contado duas vezes no lucro. O preço
    da escolha é as duas pontas se afastarem — e é isso que o painel de conferência mede.
20. **Custo comercial soma marketing + diário, nunca substitui.** As duas telas conhecem
    metades diferentes (mídia/agência de um lado, SDR/closer/ferramentas do outro). Toda
    tela que divide investimento por lead ou por venda usa `useMarketingInvestment` — se
    uma esquecer, o CAC do relatório diverge do CAC da tela e ninguém confia em nenhum dos
    dois.
21. **Esconder do menu não é proteger.** Toda rota com `requires` na navegação é barrada
    por `RequirePermission` em `src/app/routes.tsx` — o menu e o roteador leem a mesma
    lista. E o painel financeiro sequer é montado para quem não tem `view:financials`:
    esse papel recebe `OwnDashboard`, com a própria carteira.
22. **Título gerado sozinho não é título pago sozinho — a menos que a regra peça isso.**
    `useAutoGenerateRecurringBills` (`src/hooks/recurring.ts`, montado uma vez em
    `AppShell`) mantém as regras de "Contas fixas" com os próximos 3 meses de títulos
    sempre materializados, sem depender de alguém clicar em "Gerar títulos" — é isso que
    faz o previsto aparecer sozinho em "A pagar" e no Fluxo de caixa. Por padrão a baixa
    continua manual: vencimento chegar não é prova de pagamento, e um sistema que
    assumisse isso mentiria sobre o caixa exatamente na hora em que a pessoa mais precisa
    confiar nele. `RecurringRule.autoSettle` é a válvula de escape, opt-in e `false` por
    padrão: quando ligada numa regra específica (custo que realmente sai sozinho da
    conta — débito automático, assinatura no cartão), `useAutoSettleRecurringBills` baixa
    o título vencido sozinho, pela MESMA `settleBill` do botão manual — mesmo rastro
    (`BillPayment` + `Transaction`), mesma reversão via `unsettleBillPayment` se a baixa
    automática errar. Gate por `manage:bills` (a permissão que já governa qualquer baixa),
    não por `manage:recurring`.

---

## 6. Onde as coisas acontecem

| Rota | Arquivo | O que é |
|---|---|---|
| `/` | `features/dashboard/` | 18 KPIs, alertas automáticos, meta do mês |
| `/performance` | `features/performance/` | Séries temporais, receita por closer/SDR/canal, funil |
| `/executivo` | `features/executive/` | ARR, churn, LTV, LTV/CAC, forecast, burn, runway |
| `/vendas` | `features/sales/` | Vendas com comissões, economia unitária e CAC (venda + Marketing) |
| `/leads` | `features/leads/` | CRM: kanban por etapa (`LeadBoard`), acompanhamento, conversão, CPL |
| `/marketing` | `features/marketing/` | Investimento mensal por canal, CPL, CAC de marketing, ROAS, conferência com o caixa |
| `/comercial` | `features/commercial/` | Diário comercial, CPL, custo/reunião, CAC, win rate (vendas ÷ leads) |
| `/clientes` | `features/clients/` | Carteira, receita por cliente, churn |
| `/transacoes` | `features/transactions/` | CRUD com filtros |
| `/fluxo-de-caixa` | `features/cashflow/` | Previsto vs. realizado, capital de giro, runway |
| `/a-receber` `/a-pagar` | `features/bills/` | Mesma página, prop `direction` |
| `/recorrentes` | `features/recurring/` | Custo de operação mensal, títulos gerados sozinhos, baixa automática opcional por regra (ver invariante 22) |
| `/metas` | `features/goals/` | Metas mensais + financeiras com projeção de data |
| `/compras` | `features/purchases/` | Metas de compra com "quando cabe no caixa" |
| `/kanban` | `features/kanban/` | Soltar em "Pago" liquida o título e lança no caixa |
| `/relatorios` | `features/reports/` | CSV (Excel pt-BR) e impressão/PDF |
| `/configuracoes` | `features/settings/` | Contas, categorias, **acessos**, equipe, aparência, backup |

**Operações atômicas** (`src/data/contracts.ts:101`), o coração do sistema:

- `settleBill` — baixa total/parcial: cria `BillPayment`, gera a `Transaction` de caixa,
  atualiza o `Bill`. É o "previsto vira realizado".
- `createSaleWithReceivables` — venda + títulos a receber (setup + parcelas de MRR).
- `updateSaleWithReceivables` — corrige a venda e, se pedido, refaz os títulos. Recusa
  refazer quando algum já foi recebido: o dinheiro no caixa não pode ficar sem título.
- `deleteSale` — apaga venda, custos, títulos em aberto e cards ligados; devolve para
  `negociacao` o lead que tinha sido convertido, preservando a invariante 13.
- `deleteTransaction` — apaga as duas pernas de uma transferência juntas e recusa apagar
  a transação que nasceu de uma baixa.
- `moveCard` — move o card e executa a ação da coluna de destino (`onDropAction`).
- `convertLeadToSale` — lead ganho vira cliente + venda + títulos numa transação só.
  Reaproveita o cliente quando o lead já aponta para um, senão a carteira duplicaria.
- `moveLeadStage` — muda a etapa e grava a mudança na linha do tempo. O histórico é
  escrito pelo sistema para distinguir "lead parado" de "lead que ninguém anotou".
- `approveMember` / `rejectMember` — decisão sobre um pedido de acesso, com autor e data.
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
- Teste novo vai ao lado do que ele testa, como `*.test.ts` — hoje em `src/domain/`,
  `src/customization/`, `src/lib/` e `src/data/local/`. O ambiente Vitest é `node`: não
  há DOM, então não se testa componente. Os testes de `src/data/local/` usam
  `fake-indexeddb/auto` para rodar contra o banco de verdade — é onde os bugs de
  consistência aparecem, porque cada peça isolada parece correta.

---

## 8. O que fazer em seguida

### Fase 9 — Supabase (FEITA)

O provider `src/data/supabase/` está implementado contra os mesmos contratos, e as
migrations `0001`–`0007` foram aplicadas num projeto real. **Nenhum arquivo de
`src/features/` mudou por causa da troca** — o critério de sucesso foi cumprido.

> **As migrations `0008`–`0015` já foram aplicadas em produção** (RLS de `sales`, PII do
> perfil, autorização de `move_lead_stage`, marcador de transferência, a escrita escopada
> de venda pelo `sales`, o fechamento das duas escaladas de privilégio da 0013, a leitura
> do kanban na 0014 e a tabela de marketing na 0015). Da 0008 à 0014 são
> idempotentes (`drop policy if exists`, `create or replace`, `drop trigger if exists`,
> `add column if not exists`) — rode `scripts/apply-migrations.mjs` num projeto novo para
> replicá-las. A **0015 não é** (`create type`/`create table` puros): num projeto que já a
> tem, rodá-la de novo falha em "already exists".
>
> **A `0016` ainda NÃO foi aplicada em produção** — é `add column if not exists`
> (idempotente), então basta `SB_REF=… SB_PAT=… node scripts/apply-migrations.mjs
> 0016_recurring_auto_settle.sql` antes de qualquer regra usar o débito automático no
> Supabase. No modo local não há o que fazer: o campo `autoSettle` é lido direto do Dexie,
> sem índice, sem bump de versão.

As migrations (`supabase/migrations/`):

- `0001_init.sql` — schema base (24 tabelas), RLS espelhando `permissions.ts`.
- `0002_auth_and_leads.sql` — dados pessoais no perfil, estados `pending`/`rejected`,
  `leads`/`lead_activities`, trigger `handle_new_user`, RPCs `approve_member`,
  `reject_member`, `move_lead_stage`.
- `0003_customizations.sql` — tabela `customizations` (faltava por completo).
- `0004_operations.sql` — as operações atômicas como RPC **finas**: recebem as linhas já
  calculadas em TS e só as persistem (`op_settle_bill`, `op_create_sale`,
  `op_convert_lead`, …). Ver abaixo.
- `0005_bootstrap.sql` — estende `handle_new_user` para **semear o esqueleto** no primeiro
  cadastro (o primeiro dono não consegue criar o próprio espaço pela UI por causa do RLS).
- `0006_role_ceo.sql` / `0007_role_socio.sql` — cargos `ceo` e `socio`, `role_rank`, e as
  regras de gatekeeper (ver §4).
- `0008_sales_read_scope.sql` — **correção de segurança**: fecha a leitura das tabelas
  financeiras para o cargo `sales`. A 0001 abrira o SELECT delas a qualquer membro
  (`is_member_of`), mas `sales` não tem `view:financials` na matriz — sem isso, um closer
  lia caixa, folha e margens chamando o PostgREST direto, contornando a UI.
- `0009_transfer_direction.sql` — coluna `transfer_direction` nas transações (o marcador
  da invariante 6). Sem ela o saldo da conta de destino nunca era creditado.
- `0010_profile_pii.sql` — **correção de LGPD**: view `profiles_directory` que mascara
  CPF/telefone/nascimento para quem não é gatekeeper, e fecha o SELECT direto de `profiles`
  ao próprio dono. O app lê nomes pela view; só quem libera acesso vê o PII.
- `0011_move_lead_authz.sql` — **correção de autorização**: a RPC `move_lead_stage` era
  `SECURITY DEFINER` sem checar quem chama (qualquer autenticado movia qualquer lead).
  Ganhou guard espelhando a matriz (finance+ move qualquer lead; `sales` só o próprio;
  `viewer` nenhum). Fecha também a leitura de `activity_log` para o `sales`.
- `0012_sales_write_scope.sql` — **alinha o RLS à matriz para o `sales`**: as quatro
  operações de venda (`op_create_sale`, `op_update_sale`, `op_delete_sale`,
  `op_convert_lead`) viram `SECURITY DEFINER` com portão explícito (`may_write_sale`:
  finance+ em qualquer venda; `sales` só na própria — closer/sdr da venda, ou dono do
  lead). O closer passa a fechar a própria venda; antes o RLS financeiro barrava e o
  fluxo falhava só no Supabase. Como `DEFINER` ignora o RLS, cada função confere que toda
  linha recebida pertence ao mesmo workspace (o `WITH CHECK` que o RLS dava de graça).
- `0013_close_authz_gaps.sql` — **fecha duas escaladas de privilégio** achadas na auditoria
  de entrega. (1) `workspaces_update` usava `can_administer` (inclui `admin`) sem travar
  `owner_id`: um admin trocava o dono e apagava a empresa pela política de delete. Trigger
  `forbid_owner_takeover` só deixa o dono atual transferir a posse. (2) A 0012 conferia os
  títulos/custos das RPC de venda só por `workspace_id`: um `sales` autorizado na própria
  venda passava ids de qualquer conta a pagar/receber do espaço e os apagava (violando a
  invariante 18). Triggers `guard_sales_sale_link` em `bills`/`sale_costs` restringem o
  cargo `sales` a registros amarrados a uma venda dele (via `sale_belongs_to_caller`, que
  espelha a base dupla do `may_write_sale`: closer/sdr da venda ou dono do lead). Cards
  ficam de fora — `sales` tem `manage:kanban` na matriz.
- `0015_marketing.sql` — tabela `marketing_entries` (uma linha por workspace+mês+canal),
  enum `marketing_channel` e o RLS de `view:marketing`/`manage:marketing`: leitura para
  todo membro ativo **menos** `sales`, escrita para quem opera o financeiro. A cláusula de
  leitura é a MESMA da 0008/0014 (`is_member_of(...) and current_role_in(...) <> 'sales'`)
  — verba de anúncio é custo da empresa, e o cargo que não vê caixa não vê custo.
  **Já aplicada em produção.** No modo local não há o que fazer: o Dexie cria a tabela
  sozinho na v4, na primeira abertura.
- `0016_recurring_auto_settle.sql` — coluna `auto_settle` em `recurring_rules` (default
  `false`). Opt-in por regra: quando ligada, `useAutoSettleRecurringBills`
  (`src/hooks/recurring.ts`) baixa sozinho, na data de vencimento, os títulos que a regra
  gerou — ver invariante 22. **Ainda NÃO aplicada em produção** — precisa rodar antes de
  alguém ligar o débito automático numa regra com o provider Supabase.

**Decisão-chave (a razão de as RPC serem finas):** a matemática (parcelamento em
`buildReceivables`, status em `persistedStatus`, recorrência em `occurrencesBetween`) roda
**uma vez só, em TypeScript** (`src/data/receivables.ts` + `@/domain`), e é a MESMA que o
provider local usa. O Supabase calcula as linhas e manda prontas para a RPC, que só
escreve em transação. Foi assim que `convert_lead_to_sale` — adiada na 0002 exatamente por
esse risco de divergência — passou a funcionar sem reescrever a regra em PL/pgSQL.

**Rodar as migrations num projeto novo:** `scripts/apply-migrations.mjs` aplica todas em
ordem via Management API (`SB_REF=… SB_PAT=sbp_… node scripts/apply-migrations.mjs`) ou por
conexão direta (`SB_DB_URL=…`). **Numa base que já recebeu migrations, passe só os arquivos
novos como argumento** (`… node scripts/apply-migrations.mjs 0015_marketing.sql`): o script
não é idempotente, e o primeiro `create type` repetido aborta tudo antes de chegar no que
falta. Ele separa os `ALTER TYPE … ADD VALUE` numa transação à
parte — o Postgres proíbe usar um valor de enum novo na mesma transação em que ele nasce
(a CLI oficial esbarraria no mesmo ponto).

**Setup do projeto:** desligar a confirmação de e-mail (produto de um time só: o cadastro
precisa entrar direto). `.env` leva só `VITE_SUPABASE_URL` + a `anon key` (pública; a
proteção é o RLS). Migração de dados locais: `exportWorkspace` (no local) → `importWorkspace`
(no Supabase), lembrando que cada pessoa precisa ter se cadastrado antes (o perfil referencia
`auth.users`).

Os testes de `src/data/local/*.test.ts` são o contrato que o provider novo satisfaz.
`src/lib/password.ts` só vale no modo local; no Supabase quem guarda credencial é o
`auth.users` (e `setInitialPassword`/`listAccountsWithoutPassword` são no-ops lá).

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

### Deploy — Vercel, ligada ao repositório

A hospedagem é a **Vercel**, conectada ao repositório: cada push em `main` publica, e
cada branch ganha preview próprio. Não há mais Netlify no caminho — `netlify.toml` e
`public/_redirects` continuam no repositório apenas como plano B para trocar de serviço
sem redescobrir a configuração de SPA.

Três coisas a lembrar:

- **Toda variável `VITE_*` do painel vira pública.** O build as embute no JavaScript que
  vai para o navegador. Só a `anon key` do Supabase pode ir ali; a proteção real é o RLS.
  Nenhuma `service_role` key, nunca.
- **SPA precisa de fallback para `index.html`**, senão `/vendas` dá 404 no reload. A
  Vercel resolve sozinha em projeto Vite; se um dia mudar de serviço, o `netlify.toml`
  guarda a receita.
- **Com o Supabase ligado (`VITE_DATA_PROVIDER=supabase`), os dados são do servidor** —
  a mesma base em qualquer dispositivo, que é o que destrava o deploy de verdade. Sem
  `.env` (ou com `VITE_DATA_PROVIDER=local`) o app volta ao IndexedDB por dispositivo,
  útil para desenvolvimento offline.

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
  o argumento mais forte para a fase 9 — e agora vale também para as **contas de
  acesso**: um cadastro feito no desktop não existe no celular.
- **Não há recuperação de senha.** Sem servidor não há e-mail para enviar link. Se
  alguém esquecer a senha no modo local, o caminho é o dono apagar o perfil e a pessoa
  se cadastrar de novo. Some junto com a fase 9.
- **A validação de CPF confere os dígitos, não a existência.** Um CPF válido mas de
  outra pessoa passa. Quem confere isso é quem aprova, olhando a fila.
- **Os 6 avisos de lint** são `react-refresh/only-export-components` em arquivos que
  exportam componente + hook/constante. Custo/benefício não justifica separar.
