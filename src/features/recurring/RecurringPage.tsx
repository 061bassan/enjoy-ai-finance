import * as React from 'react'
import { toast } from 'sonner'
import { CalendarPlus, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { data } from '@/data'
import {
  addMonths,
  formatDate,
  formatMonthLong,
  fromIsoDate,
  rangeOfMonth,
  toIsoDate,
  today,
} from '@/lib/date'
import { formatMoney, formatPercent } from '@/lib/money'
import { COST_CENTER_LABEL, COST_CENTERS, FREQUENCY_LABEL, optionsFrom } from '@/data/enums'
import type { CostCenter, Frequency, RecurringRule } from '@/data/types'
import {
  installmentCorrections,
  installmentPlan,
  isInstallmentPlanFinished,
  lastInstallmentDate,
  monthlyEquivalent,
  scheduledOccurrences,
  totalMonthlyCost,
} from '@/domain/recurrence'
import { useSession } from '@/app/session'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DateField } from '@/components/DateField'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { MoneyInput } from '@/components/MoneyInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useAccounts,
  useBillPayments,
  useBills,
  useCategories,
  useCreate,
  useGenerateBillsFromRule,
  useRecurringRules,
  useRemove,
  useUpdate,
} from '@/hooks/data'

const NONE = '__none__'

/** Próxima ocorrência a partir de hoje, já com o número da parcela. */
function nextScheduled(rule: RecurringRule) {
  const from = today()
  const horizon = toIsoDate(addMonths(fromIsoDate(from), 24))
  return scheduledOccurrences(rule, from, horizon)[0] ?? null
}

/**
 * Custos recorrentes — a tela que responde "quanto custa manter a Enjoy de pé".
 *
 * O número do topo é a soma das regras ativas com cada frequência normalizada
 * para o mês. Uma anuidade de R$ 12.000 entra como R$ 1.000/mês, não como um
 * pico em janeiro — é assim que o custo de operação fica comparável entre meses.
 */
export function RecurringPage() {
  const { session, allow } = useSession()
  const canManage = allow('manage:recurring')

  const { data: rules = [], isLoading } = useRecurringRules()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()

  const update = useUpdate('recurringRules', data.recurringRules)
  const removeRule = useRemove('recurringRules', data.recurringRules)
  const generate = useGenerateBillsFromRule()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RecurringRule | null>(null)
  const [deleting, setDeleting] = React.useState<RecurringRule | null>(null)

  function openEdit(rule: RecurringRule) {
    setEditing(rule)
    setDialogOpen(true)
  }

  const categoryNames = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const metrics = React.useMemo(() => {
    // Parcelamento quitado sai do custo de operação mesmo com a regra ligada.
    const asOf = today()
    const active = rules.filter((rule) => rule.active && !isInstallmentPlanFinished(rule, asOf))
    const expenses = active.filter((rule) => rule.kind === 'expense')
    const incomes = active.filter((rule) => rule.kind === 'income')

    const monthlyCost = totalMonthlyCost(expenses)
    const monthlyRevenue = totalMonthlyCost(incomes)

    // Distribuição por centro de custo, em base mensal.
    const byCenter = new Map<string, number>()
    for (const rule of expenses) {
      const key = rule.costCenter ?? 'sem-centro'
      byCenter.set(key, (byCenter.get(key) ?? 0) + monthlyEquivalent(rule))
    }

    return {
      monthlyCost,
      monthlyRevenue,
      annualCost: monthlyCost * 12,
      activeCount: expenses.length,
      byCenter: [...byCenter.entries()]
        .map(([key, total]) => ({
          key,
          label:
            key === 'sem-centro' ? 'Sem centro de custo' : COST_CENTER_LABEL[key as CostCenter],
          total,
          share: monthlyCost ? total / monthlyCost : 0,
        }))
        .sort((a, b) => b.total - a.total),
    }
  }, [rules])

  async function toggleActive(rule: RecurringRule) {
    await update.mutateAsync({ id: rule.id, patch: { active: !rule.active } })
  }

  async function materialize(rule: RecurringRule) {
    // Gera os títulos dos próximos 3 meses. A operação é idempotente:
    // datas já geradas são puladas, então clicar duas vezes não duplica.
    const throughDate = toIsoDate(addMonths(fromIsoDate(today()), 3))
    const bills = await generate.mutateAsync({ ruleId: rule.id, throughDate })
    toast.success(
      bills.length
        ? `${bills.length} ${bills.length === 1 ? 'título gerado' : 'títulos gerados'}.`
        : 'Todos os títulos já estavam gerados.',
    )
  }

  return (
    <>
      <PageHeader
        title="Contas fixas"
        description="O que se repete todo mês. Contas anuais e trimestrais são convertidas para o valor mensal."
        actions={
          canManage && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus /> Nova regra
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        <KpiCard
          label="Custo de operação mensal"
          value={formatMoney(metrics.monthlyCost)}
          secondary={`${metrics.activeCount} regras ativas`}
          hint="Soma das regras de despesa ativas. Anuais viram 1/12, trimestrais 1/3, semanais 52/12 por mês."
        />
        <KpiCard label="Custo anualizado" value={formatMoney(metrics.annualCost)} />
        <KpiCard label="Receita recorrente prevista" value={formatMoney(metrics.monthlyRevenue)} />
        <KpiCard
          label="Resultado recorrente"
          value={formatMoney(metrics.monthlyRevenue - metrics.monthlyCost)}
          hint="Receita recorrente menos custo de operação. Negativo significa que a operação depende de vendas novas todo mês."
        />
      </KpiGrid>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Composição por centro de custo</h3>
          {metrics.byCenter.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma regra ativa.</p>
          ) : (
            <ul className="space-y-2.5">
              {metrics.byCenter.map((entry) => (
                <li key={entry.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{entry.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatMoney(entry.total)}
                      <span className="ml-1.5 text-xs">{formatPercent(entry.share)}</span>
                    </span>
                  </div>
                  <Progress value={entry.share * 100} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : rules.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Repeat}
                title="Nenhuma regra cadastrada"
                description="Cadastre salários, aluguel, softwares e verba fixa de tráfego para conhecer o custo real de operação."
                action={
                  canManage && (
                    <Button
                      onClick={() => {
                        setEditing(null)
                        setDialogOpen(true)
                      }}
                    >
                      <Plus /> Nova regra
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regra</TableHead>
                  <TableHead className="hidden lg:table-cell">Frequência</TableHead>
                  <TableHead className="hidden xl:table-cell">Próximo</TableHead>
                  <TableHead data-numeric>Valor</TableHead>
                  <TableHead data-numeric className="hidden sm:table-cell">
                    Por mês
                  </TableHead>
                  <TableHead className="w-16">Ativa</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const next = nextScheduled(rule)
                  const plan = installmentPlan(rule)
                  const finished = isInstallmentPlanFinished(rule, today())
                  return (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <span className="flex max-w-[200px] items-center gap-1.5 truncate font-medium">
                          {rule.name}
                          {rule.autoSettle && (
                            <Badge
                              variant="outline"
                              className="shrink-0"
                              title="Baixa sozinha no vencimento e lança a saída em Entradas e saídas"
                            >
                              Débito automático
                            </Badge>
                          )}
                          {plan && (
                            <Badge
                              variant={finished ? 'muted' : 'outline'}
                              className="shrink-0"
                              title="Conta parcelada — para de gerar títulos depois da última parcela"
                            >
                              {finished ? 'Quitado' : `${plan.total}x`}
                            </Badge>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {rule.categoryId ? (categoryNames.get(rule.categoryId) ?? '—') : '—'}
                          {rule.costCenter && ` · ${COST_CENTER_LABEL[rule.costCenter]}`}
                          {rule.totalAmountCents
                            ? ` · total ${formatMoney(rule.totalAmountCents)}`
                            : null}
                        </span>
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="muted">{FREQUENCY_LABEL[rule.frequency]}</Badge>
                      </TableCell>

                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {next ? formatDate(next.date) : '—'}
                        {next?.installmentNumber != null && (
                          <span className="block text-xs">
                            parcela {next.installmentNumber}/{next.installmentTotal}
                          </span>
                        )}
                      </TableCell>

                      <TableCell data-numeric>{formatMoney(rule.amountCents)}</TableCell>

                      <TableCell data-numeric className="hidden font-medium sm:table-cell">
                        {formatMoney(monthlyEquivalent(rule))}
                      </TableCell>

                      <TableCell>
                        <Switch
                          checked={rule.active}
                          disabled={!canManage}
                          onCheckedChange={() => void toggleActive(rule)}
                        />
                      </TableCell>

                      <TableCell>
                        {canManage && (
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Gerar títulos dos próximos 3 meses agora (o sistema já mantém isso em dia sozinho a cada acesso — use aqui só para adiantar)"
                              onClick={() => void materialize(rule)}
                              disabled={generate.isPending}
                            >
                              <CalendarPlus />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Ações da regra ${rule.name}`}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => openEdit(rule)}>
                                  <Pencil /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setDeleting(rule)}>
                                  <Trash2 /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        accounts={accounts}
        workspaceId={session?.workspaceId ?? ''}
        rule={editing}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir esta regra?"
        description="A regra some do custo de operação e para de gerar títulos novos. Os títulos já gerados continuam em Contas a pagar — apague-os por lá se também não valerem mais."
        confirmLabel="Excluir regra"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await removeRule.mutateAsync(deleting.id)
            toast.success('Regra excluída.')
            setDeleting(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </>
  )
}

function RuleDialog({
  open,
  onOpenChange,
  categories,
  accounts,
  workspaceId,
  rule = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: { id: string; name: string; kind: string; costCenter: CostCenter | null }[]
  accounts: { id: string; name: string }[]
  workspaceId: string
  /** Quando presente, corrige a regra existente. */
  rule?: RecurringRule | null
}) {
  const create = useCreate('recurringRules', data.recurringRules)
  const update = useUpdate('recurringRules', data.recurringRules)
  const updateBill = useUpdate('bills', data.bills)
  const { data: bills = [] } = useBills()
  const { data: payments = [] } = useBillPayments()

  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<'expense' | 'income'>('expense')
  const [amountCents, setAmountCents] = React.useState(0)
  const [frequency, setFrequency] = React.useState<Frequency>('monthly')
  const [dayOfMonth, setDayOfMonth] = React.useState(5)
  const [startDate, setStartDate] = React.useState(today())
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [costCenter, setCostCenter] = React.useState<CostCenter | ''>('')
  const [accountId, setAccountId] = React.useState(NONE)
  const [autoSettle, setAutoSettle] = React.useState(false)
  const [installments, setInstallments] = React.useState(false)
  const [totalAmountCents, setTotalAmountCents] = React.useState(0)
  const [installmentTotal, setInstallmentTotal] = React.useState(2)
  const [installmentStart, setInstallmentStart] = React.useState(1)

  React.useEffect(() => {
    if (!open) return
    setName(rule?.name ?? '')
    setKind(rule?.kind ?? 'expense')
    setAmountCents(rule?.amountCents ?? 0)
    setFrequency(rule?.frequency ?? 'monthly')
    setDayOfMonth(rule?.dayOfMonth ?? 5)
    setStartDate(rule?.startDate ?? today())
    setCategoryId(rule?.categoryId ?? NONE)
    setCostCenter(rule?.costCenter ?? '')
    setAccountId(rule?.accountId ?? NONE)
    setAutoSettle(rule?.autoSettle ?? false)
    setInstallments(Boolean(rule?.installmentTotal))
    setTotalAmountCents(rule?.totalAmountCents ?? 0)
    setInstallmentTotal(rule?.installmentTotal ?? 2)
    setInstallmentStart(rule?.installmentStart ?? 1)
  }, [open, rule])

  /** Valor total ÷ parcelas vira o valor da parcela — o que o título cobra. */
  function applyTotal(total: number, count: number) {
    if (total > 0 && count > 0) setAmountCents(Math.round(total / count))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Informe o nome da regra.')
      return
    }
    if (amountCents <= 0) {
      toast.error('Informe um valor maior que zero.')
      return
    }
    if (autoSettle && accountId === NONE) {
      toast.error('Selecione a conta antes de ligar o débito automático — é dela que a baixa sai.')
      return
    }
    if (installments) {
      if (!Number.isInteger(installmentTotal) || installmentTotal < 1) {
        toast.error('Informe quantas parcelas existem no total.')
        return
      }
      if (
        !Number.isInteger(installmentStart) ||
        installmentStart < 1 ||
        installmentStart > installmentTotal
      ) {
        toast.error(`A parcela inicial precisa estar entre 1 e ${installmentTotal}.`)
        return
      }
    }

    // As colunas de parcela só entram no payload quando a regra é (ou era)
    // parcelada. Regra comum salva exatamente os mesmos campos de antes — então
    // ela continua funcionando mesmo num banco que ainda não recebeu a 0017.
    const installmentFields =
      installments || rule?.installmentTotal
        ? {
            installmentTotal: installments ? installmentTotal : null,
            installmentStart: installments ? installmentStart : null,
            totalAmountCents: installments && totalAmountCents > 0 ? totalAmountCents : null,
          }
        : {}

    const fields = {
      name: name.trim(),
      kind,
      amountCents,
      categoryId: categoryId === NONE ? null : categoryId,
      costCenter: (costCenter || null) as CostCenter | null,
      accountId: accountId === NONE ? null : accountId,
      frequency,
      dayOfMonth,
      startDate,
      autoSettle,
      ...installmentFields,
    }

    if (rule) {
      try {
        await update.mutateAsync({ id: rule.id, patch: fields })
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar a regra.')
        return
      }

      // Numera (ou cancela, se passaram da última parcela) os títulos em aberto
      // que a regra já tinha gerado — sem isso, quem transforma "HD externo" em
      // parcelado só veria "3/10" a partir do próximo título gerado.
      const updated = { ...rule, ...fields }
      const paidBillIds = new Set(payments.map((payment) => payment.billId))
      const corrections = installmentCorrections(
        updated,
        bills.filter((bill) => bill.recurringRuleId === rule.id),
        paidBillIds,
      )
      for (const correction of corrections) {
        await updateBill.mutateAsync({ id: correction.id, patch: correction.patch })
      }

      // Os títulos já materializados não mudam de valor sozinhos — dizer isso
      // evita que alguém aumente o aluguel e ache que o previsto se ajustou.
      toast.success('Regra atualizada. Os títulos já gerados mantêm o valor antigo.')
      onOpenChange(false)
      return
    }

    try {
      await create.mutateAsync({
        workspaceId,
        ...fields,
        clientId: null,
        interval: 1,
        endDate: null,
        autoGenerate: true,
        active: true,
        notes: null,
      })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível criar a regra.')
      return
    }

    toast.success('Regra criada. Os títulos são gerados automaticamente em instantes.')
    onOpenChange(false)
  }

  const preview = amountCents ? monthlyEquivalent({ amountCents, frequency, interval: 1 }) : 0

  // Prévia do parcelamento: qual parcela cai neste mês e quando termina. É o
  // que deixa conferir "estamos na 3ª de 10" antes de salvar.
  const installmentPreview = React.useMemo(() => {
    if (!installments || installmentTotal < 1) return null
    const draft = {
      frequency,
      interval: 1,
      startDate,
      endDate: null,
      dayOfMonth,
      active: true,
      installmentTotal,
      installmentStart,
    }
    const month = rangeOfMonth(today())
    const first = scheduledOccurrences(
      draft,
      startDate,
      toIsoDate(addMonths(fromIsoDate(startDate), 24)),
    )[0]
    const thisMonth = scheduledOccurrences(draft, month.from, month.to)[0]
    return { first, thisMonth, last: lastInstallmentDate(draft) }
  }, [installments, installmentTotal, installmentStart, frequency, startDate, dayOfMonth])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar regra recorrente' : 'Nova regra recorrente'}</DialogTitle>
          <DialogDescription>
            Custos e receitas que se repetem. Entram no custo de operação mensal e geram títulos
            automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rule-name">Nome</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Folha de pagamento"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as 'expense' | 'income')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Despesa</SelectItem>
                  <SelectItem value="income">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-amount">{installments ? 'Valor da parcela' : 'Valor'}</Label>
              <MoneyInput id="rule-amount" value={amountCents} onChange={setAmountCents} />
            </div>

            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select value={frequency} onValueChange={(value) => setFrequency(value as Frequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(FREQUENCY_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-day">Dia do vencimento</Label>
              <Input
                id="rule-day"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(Number(event.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Meses mais curtos usam o último dia disponível.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-start">Início</Label>
              <DateField id="rule-start" value={startDate} onChange={setStartDate} />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {categories
                    .filter((category) => category.kind === kind)
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <Select
                value={costCenter}
                onValueChange={(value) => setCostCenter(value as CostCenter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  {COST_CENTERS.map((center) => (
                    <SelectItem key={center} value={center}>
                      {COST_CENTER_LABEL[center]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {preview > 0 && frequency !== 'monthly' && (
            <div className="rounded-md border border-border bg-surface-1 p-3 text-sm">
              Equivale a <strong className="tabular-nums">{formatMoney(preview)}</strong> por mês no
              custo de operação.
            </div>
          )}

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="rule-installments">Conta parcelada</Label>
                <p className="text-xs text-muted-foreground">
                  Empréstimo, compra em N vezes: cada título em "A pagar" mostra a parcela (ex.:
                  3/10) e a regra para de gerar títulos depois da última.
                </p>
              </div>
              <Switch
                id="rule-installments"
                checked={installments}
                onCheckedChange={setInstallments}
              />
            </div>

            {installments && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-total-amount">Valor total</Label>
                    <MoneyInput
                      id="rule-total-amount"
                      value={totalAmountCents}
                      onChange={(value) => {
                        setTotalAmountCents(value)
                        applyTotal(value, installmentTotal)
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-installment-total">Nº de parcelas</Label>
                    <Input
                      id="rule-installment-total"
                      type="number"
                      min={1}
                      value={installmentTotal}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        setInstallmentTotal(value)
                        applyTotal(totalAmountCents, value)
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-installment-start">Parcela no início</Label>
                    <Input
                      id="rule-installment-start"
                      type="number"
                      min={1}
                      max={installmentTotal || undefined}
                      value={installmentStart}
                      onChange={(event) => setInstallmentStart(Number(event.target.value))}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  "Parcela no início" é o número da parcela que vence na primeira data da regra
                  (campo Início). O valor da parcela é calculado do total, mas pode ser ajustado
                  acima.
                </p>
                {installmentPreview?.first && (
                  <div className="rounded-md bg-surface-1 p-2.5 text-sm">
                    {installmentPreview.thisMonth ? (
                      <>
                        Em {formatMonthLong(installmentPreview.thisMonth.date)} vence a parcela{' '}
                        <strong className="tabular-nums">
                          {installmentPreview.thisMonth.installmentNumber}/{installmentTotal}
                        </strong>
                        .{' '}
                      </>
                    ) : (
                      <>
                        Primeira parcela gerada:{' '}
                        <strong className="tabular-nums">
                          {installmentPreview.first.installmentNumber}/{installmentTotal}
                        </strong>{' '}
                        em {formatDate(installmentPreview.first.date)}.{' '}
                      </>
                    )}
                    {installmentPreview.last && (
                      <>Última parcela em {formatDate(installmentPreview.last)}.</>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="rule-auto-settle">Débito automático</Label>
              <p className="text-xs text-muted-foreground">
                Ligado, o título gerado por esta regra se baixa sozinho na data de vencimento: lança
                a saída em Entradas e saídas e entra no realizado do Fluxo de caixa, sem clique. Use
                só para custo que realmente sai sozinho da conta (assinatura no cartão, débito
                automático). Se o pagamento pode atrasar ou falhar, deixe desligado e baixe na mão
                quando confirmar no extrato.
              </p>
            </div>
            <Switch id="rule-auto-settle" checked={autoSettle} onCheckedChange={setAutoSettle} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {rule ? 'Salvar' : 'Criar regra'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
