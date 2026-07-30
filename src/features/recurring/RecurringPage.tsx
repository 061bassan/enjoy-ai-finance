import * as React from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Plus, Repeat } from 'lucide-react'
import { data } from '@/data'
import { addMonths, formatDate, fromIsoDate, toIsoDate, today } from '@/lib/date'
import { formatMoney, formatPercent } from '@/lib/money'
import {
  COST_CENTER_LABEL,
  COST_CENTERS,
  FREQUENCY_LABEL,
  optionsFrom,
} from '@/data/enums'
import type { CostCenter, Frequency, RecurringRule } from '@/data/types'
import { monthlyEquivalent, nextOccurrence, totalMonthlyCost } from '@/domain/recurrence'
import { useSession } from '@/app/session'
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
  useCategories,
  useCreate,
  useGenerateBillsFromRule,
  useRecurringRules,
  useUpdate,
} from '@/hooks/data'

const NONE = '__none__'

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
  const generate = useGenerateBillsFromRule()
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const categoryNames = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const metrics = React.useMemo(() => {
    const active = rules.filter((rule) => rule.active)
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
          label: key === 'sem-centro' ? 'Sem centro de custo' : COST_CENTER_LABEL[key as CostCenter],
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
                    <Button onClick={() => setDialogOpen(true)}>
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
                  const next = nextOccurrence(rule, today())
                  return (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <span className="block max-w-[200px] truncate font-medium">
                          {rule.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {rule.categoryId ? (categoryNames.get(rule.categoryId) ?? '—') : '—'}
                          {rule.costCenter && ` · ${COST_CENTER_LABEL[rule.costCenter]}`}
                        </span>
                      </TableCell>

                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="muted">{FREQUENCY_LABEL[rule.frequency]}</Badge>
                      </TableCell>

                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {next ? formatDate(next) : '—'}
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
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Gerar títulos dos próximos 3 meses"
                            onClick={() => void materialize(rule)}
                            disabled={generate.isPending}
                          >
                            <CalendarPlus />
                          </Button>
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: { id: string; name: string; kind: string; costCenter: CostCenter | null }[]
  accounts: { id: string; name: string }[]
  workspaceId: string
}) {
  const create = useCreate('recurringRules', data.recurringRules)

  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<'expense' | 'income'>('expense')
  const [amountCents, setAmountCents] = React.useState(0)
  const [frequency, setFrequency] = React.useState<Frequency>('monthly')
  const [dayOfMonth, setDayOfMonth] = React.useState(5)
  const [startDate, setStartDate] = React.useState(today())
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [costCenter, setCostCenter] = React.useState<CostCenter | ''>('')
  const [accountId, setAccountId] = React.useState(NONE)

  React.useEffect(() => {
    if (!open) return
    setName('')
    setKind('expense')
    setAmountCents(0)
    setFrequency('monthly')
    setDayOfMonth(5)
    setStartDate(today())
    setCategoryId(NONE)
    setCostCenter('')
    setAccountId(NONE)
  }, [open])

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

    await create.mutateAsync({
      workspaceId,
      name: name.trim(),
      kind,
      amountCents,
      categoryId: categoryId === NONE ? null : categoryId,
      costCenter: (costCenter || null) as CostCenter | null,
      accountId: accountId === NONE ? null : accountId,
      clientId: null,
      frequency,
      interval: 1,
      dayOfMonth,
      startDate,
      endDate: null,
      autoGenerate: true,
      active: true,
      notes: null,
    })

    toast.success('Regra criada. Use o botão de calendário para gerar os títulos.')
    onOpenChange(false)
  }

  const preview = amountCents
    ? monthlyEquivalent({ amountCents, frequency, interval: 1 })
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nova regra recorrente</DialogTitle>
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
              <Select value={kind} onValueChange={(value) => setKind(value as 'expense' | 'income')}>
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
              <Label htmlFor="rule-amount">Valor</Label>
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
              <Input
                id="rule-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Criar regra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
