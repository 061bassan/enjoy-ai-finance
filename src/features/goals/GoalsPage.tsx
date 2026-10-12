import * as React from 'react'
import { toast } from 'sonner'
import { Flag, MoreHorizontal, Pencil, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import { data } from '@/data'
import { formatDate, formatMonthLong, monthKey, rangeOfMonth, today } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent } from '@/lib/money'
import { GOAL_TYPE_LABEL, optionsFrom } from '@/data/enums'
import type { Goal, GoalType, MonthlyTarget } from '@/data/types'
import { goalProgress, monthlyTargetProgress, requiredMonthlyContribution } from '@/domain/goals'
import { useSession } from '@/app/session'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DateField, MonthField } from '@/components/DateField'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useAccounts,
  useCreate,
  useGoalContributions,
  useGoals,
  useMonthlyTargets,
  useRemove,
  useUpdate,
} from '@/hooks/data'
import { useMonthActuals } from './monthActuals'
import { GoalsDashboard } from './GoalsDashboard'

export function GoalsPage() {
  const { workspace } = useSession()
  const isTeam = workspace?.type === 'team'

  return (
    <>
      <PageHeader
        title="Metas"
        description="Metas mensais do negócio e metas financeiras de acúmulo."
      />

      {isTeam ? (
        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard">Painel</TabsTrigger>
            <TabsTrigger value="monthly">Metas do mês</TabsTrigger>
            <TabsTrigger value="financial">Metas financeiras</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <GoalsDashboard />
          </TabsContent>
          <TabsContent value="monthly">
            <MonthlyTargetsTab />
          </TabsContent>
          <TabsContent value="financial">
            <FinancialGoalsTab />
          </TabsContent>
        </Tabs>
      ) : (
        <FinancialGoalsTab />
      )}
    </>
  )
}

/**
 * Metas mensais.
 *
 * O realizado de cada linha vem de uma fonte diferente — faturamento das
 * transações, vendas do módulo de vendas, reuniões do diário comercial. É o
 * que garante que a meta reflita o mesmo número que a pessoa vê na tela
 * daquele módulo, sem consolidação manual no meio.
 */
function MonthlyTargetsTab() {
  const { allow } = useSession()
  const canManage = allow('manage:targets')

  const { data: targets = [] } = useMonthlyTargets()
  const actualsFor = useMonthActuals()

  const currentMonth = `${today().slice(0, 7)}-01`
  const [selectedMonth, setSelectedMonth] = React.useState(currentMonth)
  const [targetDialogOpen, setTargetDialogOpen] = React.useState(false)
  const [deletingTarget, setDeletingTarget] = React.useState(false)
  const removeTarget = useRemove('monthlyTargets', data.monthlyTargets)

  const target = targets.find((row) => row.month === selectedMonth)

  const progress = React.useMemo(() => {
    if (!target) return null
    return monthlyTargetProgress(target, actualsFor(rangeOfMonth(selectedMonth)))
  }, [target, selectedMonth, actualsFor])

  const months = React.useMemo(
    () => [...targets].sort((a, b) => b.month.localeCompare(a.month)),
    [targets],
  )

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
          {months.length > 0 ? (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((row) => (
                  <SelectItem key={row.month} value={row.month}>
                    {formatMonthLong(row.month)}
                    {monthKey(row.month) === monthKey(currentMonth) && ' · atual'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">Nenhuma meta cadastrada ainda</span>
          )}
          {canManage && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setTargetDialogOpen(true)}>
                {target ? (
                  <>
                    <Pencil /> Editar meta do mês
                  </>
                ) : (
                  <>
                    <Plus /> Definir meta do mês
                  </>
                )}
              </Button>
              {target && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Excluir a meta deste mês"
                  onClick={() => setDeletingTarget(true)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {!target ? (
        <EmptyState
          icon={Target}
          title="Sem meta para este mês"
          description="Defina quanto a Enjoy quer faturar, lucrar e vender no mês. O progresso é calculado sozinho conforme você lança as vendas e as despesas."
          action={
            canManage && (
              <Button onClick={() => setTargetDialogOpen(true)}>
                <Plus /> Definir meta do mês
              </Button>
            )
          }
        />
      ) : (
        <Card className="p-5">
          <ul className="space-y-4">
            {progress?.map((row) => {
              const ratio = row.ratio ?? 0
              const format = (value: number) =>
                row.format === 'money'
                  ? formatMoney(value)
                  : row.format === 'percent'
                    ? `${formatNumber(value)}%`
                    : formatNumber(value)

              return (
                <li key={row.label}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="text-sm tabular-nums">
                      {format(row.currentValue)}
                      <span className="ml-1.5 text-muted-foreground">
                        de {format(row.targetValue)}
                      </span>
                      <Badge
                        variant={ratio >= 1 ? 'positive' : ratio >= 0.7 ? 'muted' : 'negative'}
                        className="ml-2"
                      >
                        {formatPercent(ratio)}
                      </Badge>
                    </span>
                  </div>
                  <Progress
                    value={ratio * 100}
                    tone={ratio >= 1 ? 'positive' : ratio < 0.5 ? 'negative' : 'auto'}
                  />
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <MonthlyTargetDialog
        open={targetDialogOpen}
        onOpenChange={setTargetDialogOpen}
        month={selectedMonth}
        target={target ?? null}
        onSaved={setSelectedMonth}
      />

      <ConfirmDialog
        open={deletingTarget}
        onOpenChange={setDeletingTarget}
        title="Excluir a meta deste mês?"
        description="As barras de progresso do mês somem. Os lançamentos, as vendas e os registros comerciais não são afetados."
        confirmLabel="Excluir meta"
        destructive
        onConfirm={async () => {
          if (!target) return
          try {
            await removeTarget.mutateAsync(target.id)
            toast.success('Meta excluída.')
            setDeletingTarget(false)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </div>
  )
}

/**
 * Define a meta de um mês.
 *
 * Campos deixados em zero não viram barra de progresso — quem só quer
 * acompanhar faturamento preenche um campo e ignora o resto.
 */
function MonthlyTargetDialog({
  open,
  onOpenChange,
  month,
  target = null,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
  /** Meta já existente do mês selecionado — o diálogo então corrige em vez de criar. */
  target?: MonthlyTarget | null
  onSaved: (month: string) => void
}) {
  const { session } = useSession()
  const create = useCreate('monthlyTargets', data.monthlyTargets)
  const update = useUpdate('monthlyTargets', data.monthlyTargets)

  const [targetMonth, setTargetMonth] = React.useState(month)
  const [revenueCents, setRevenueCents] = React.useState(0)
  const [profitCents, setProfitCents] = React.useState(0)
  const [mrrCents, setMrrCents] = React.useState(0)
  const [setupCents, setSetupCents] = React.useState(0)
  const [salesCount, setSalesCount] = React.useState(0)
  const [clientsCount, setClientsCount] = React.useState(0)
  const [meetingsCount, setMeetingsCount] = React.useState(0)
  const [proposalsCount, setProposalsCount] = React.useState(0)
  const [marginPercent, setMarginPercent] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setTargetMonth(target?.month ?? month)
    setRevenueCents(target?.revenueCents ?? 0)
    setProfitCents(target?.profitCents ?? 0)
    setMrrCents(target?.mrrCents ?? 0)
    setSetupCents(target?.setupCents ?? 0)
    setSalesCount(target?.salesCount ?? 0)
    setClientsCount(target?.clientsCount ?? 0)
    setMeetingsCount(target?.meetingsCount ?? 0)
    setProposalsCount(target?.proposalsCount ?? 0)
    setMarginPercent(target?.marginPercent ?? 0)
  }, [open, month, target])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return

    if (revenueCents === 0 && profitCents === 0 && salesCount === 0) {
      toast.error('Preencha ao menos uma meta.')
      return
    }

    const normalizedMonth = `${targetMonth.slice(0, 7)}-01`

    const fields = {
      month: normalizedMonth,
      revenueCents,
      profitCents,
      salesCount,
      meetingsCount,
      proposalsCount,
      clientsCount,
      mrrCents,
      setupCents,
      marginPercent,
    }

    try {
      if (target) {
        await update.mutateAsync({ id: target.id, patch: fields })
        toast.success('Meta atualizada.')
      } else {
        await create.mutateAsync({ workspaceId: session.workspaceId, ...fields })
        toast.success('Meta definida.')
      }
      onSaved(normalizedMonth)
      onOpenChange(false)
    } catch {
      toast.error('Já existe uma meta para este mês.')
    }
  }

  const NUMBER_FIELDS = [
    { label: 'Vendas', value: salesCount, set: setSalesCount },
    { label: 'Novos clientes', value: clientsCount, set: setClientsCount },
    { label: 'Reuniões', value: meetingsCount, set: setMeetingsCount },
    { label: 'Propostas', value: proposalsCount, set: setProposalsCount },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{target ? 'Editar meta do mês' : 'Meta do mês'}</DialogTitle>
          <DialogDescription>
            Deixe em branco o que você não quer acompanhar. Só aparece o que for preenchido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="target-month">Mês</Label>
            <MonthField
              id="target-month"
              value={targetMonth}
              onChange={setTargetMonth}
              className="sm:w-48"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="target-revenue">Faturamento</Label>
              <MoneyInput id="target-revenue" value={revenueCents} onChange={setRevenueCents} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-profit">Lucro</Label>
              <MoneyInput id="target-profit" value={profitCents} onChange={setProfitCents} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-mrr">Mensalidades novas (MRR)</Label>
              <MoneyInput id="target-mrr" value={mrrCents} onChange={setMrrCents} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-setup">Implantações</Label>
              <MoneyInput id="target-setup" value={setupCents} onChange={setSetupCents} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            {NUMBER_FIELDS.map((field) => (
              <div key={field.label} className="space-y-1.5">
                <Label htmlFor={`target-${field.label}`}>{field.label}</Label>
                <Input
                  id={`target-${field.label}`}
                  type="number"
                  min={0}
                  value={field.value}
                  onChange={(event) => field.set(Math.max(0, Number(event.target.value)))}
                  className="text-right tabular-nums"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5 sm:w-48">
            <Label htmlFor="target-margin">Margem desejada (%)</Label>
            <Input
              id="target-margin"
              type="number"
              min={0}
              max={100}
              value={marginPercent}
              onChange={(event) => setMarginPercent(Number(event.target.value))}
              className="text-right tabular-nums"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              Salvar meta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FinancialGoalsTab() {
  const { session, allow } = useSession()
  const canManage = allow('manage:goals')

  const { data: goals = [] } = useGoals()
  const { data: contributions = [] } = useGoalContributions()
  const { data: accounts = [] } = useAccounts()

  const createGoal = useCreate('goals', data.goals)
  const updateGoal = useUpdate('goals', data.goals)
  const removeGoal = useRemove('goals', data.goals, ['goalContributions'])
  const removeContribution = useRemove('goalContributions', data.goalContributions, ['goals'])
  const createContribution = useCreate('goalContributions', data.goalContributions, ['goals'])

  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false)
  const [editingGoal, setEditingGoal] = React.useState<Goal | null>(null)
  const [deletingGoal, setDeletingGoal] = React.useState<Goal | null>(null)
  const [contributingTo, setContributingTo] = React.useState<string | null>(null)
  const [contributionCents, setContributionCents] = React.useState(0)

  const rows = React.useMemo(
    () =>
      goals
        .filter((goal) => goal.status !== 'archived')
        .map((goal) => goalProgress(goal, contributions))
        .sort((a, b) => b.ratio - a.ratio),
    [goals, contributions],
  )

  async function submitContribution() {
    if (!session || !contributingTo) return
    if (contributionCents <= 0) {
      toast.error('Informe um valor maior que zero.')
      return
    }

    await createContribution.mutateAsync({
      workspaceId: session.workspaceId,
      goalId: contributingTo,
      amountCents: contributionCents,
      date: today(),
      transactionId: null,
      notes: null,
    })

    toast.success('Aporte registrado.')
    setContributingTo(null)
    setContributionCents(0)
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditingGoal(null)
              setGoalDialogOpen(true)
            }}
          >
            <Plus /> Nova meta
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="Nenhuma meta ativa"
          description="Crie uma meta de reserva ou de acúmulo para acompanhar o progresso."
          action={
            canManage && (
              <Button onClick={() => setGoalDialogOpen(true)}>
                <Plus /> Nova meta
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((progress) => {
            const required = requiredMonthlyContribution(progress)
            return (
              <Card key={progress.goal.id} glass className="p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{progress.goal.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {GOAL_TYPE_LABEL[progress.goal.type]}
                      {progress.goal.targetDate && ` · até ${formatDate(progress.goal.targetDate)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {progress.onTrack != null && (
                      <Badge variant={progress.onTrack ? 'positive' : 'negative'}>
                        {progress.onTrack ? 'No ritmo' : 'Atrasada'}
                      </Badge>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ações da meta ${progress.goal.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditingGoal(progress.goal)
                              setGoalDialogOpen(true)
                            }}
                          >
                            <Pencil /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDeletingGoal(progress.goal)}>
                            <Trash2 /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMoney(progress.savedCents)}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    de {formatMoney(progress.goal.targetCents)}
                  </span>
                </div>

                <Progress
                  value={progress.ratio * 100}
                  tone={progress.ratio >= 1 ? 'positive' : 'auto'}
                />

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Falta</dt>
                    <dd className="tabular-nums">{formatMoney(progress.remainingCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Ritmo atual
                    </dt>
                    <dd className="tabular-nums">
                      {progress.averageMonthlyCents != null
                        ? `${formatMoney(progress.averageMonthlyCents)}/mês`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Previsão
                    </dt>
                    <dd className="tabular-nums">
                      {progress.projectedDate ? formatDate(progress.projectedDate) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Necessário
                    </dt>
                    <dd className="tabular-nums">
                      {required != null ? `${formatMoney(required)}/mês` : '—'}
                    </dd>
                  </div>
                </dl>

                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => setContributingTo(progress.goal.id)}
                  >
                    <TrendingUp /> Registrar aporte
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Aporte */}
      <Dialog
        open={contributingTo != null}
        onOpenChange={(open) => {
          if (!open) {
            setContributingTo(null)
            setContributionCents(0)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar aporte</DialogTitle>
            <DialogDescription>
              O progresso da meta é a soma dos aportes — estornar um aporte reduz o progresso
              automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="contribution">Valor</Label>
            <MoneyInput
              id="contribution"
              value={contributionCents}
              onChange={setContributionCents}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContributingTo(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void submitContribution()}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        accounts={accounts}
        goal={editingGoal}
        onSubmit={async (input) => {
          if (!session) return
          if (editingGoal) {
            await updateGoal.mutateAsync({ id: editingGoal.id, patch: input })
            toast.success('Meta atualizada.')
            return
          }
          await createGoal.mutateAsync({ ...input, workspaceId: session.workspaceId })
          toast.success('Meta criada.')
        }}
      />

      <ConfirmDialog
        open={deletingGoal != null}
        onOpenChange={(open) => {
          if (!open) setDeletingGoal(null)
        }}
        title="Excluir esta meta?"
        description="Os aportes registrados nela também saem. O dinheiro em conta não é afetado — a meta é só o acompanhamento."
        confirmLabel="Excluir meta"
        destructive
        onConfirm={async () => {
          if (!deletingGoal) return
          try {
            // Aportes primeiro: uma meta apagada com aportes órfãos deixaria
            // linhas invisíveis no banco, que só apareceriam no backup.
            const orphans = contributions.filter((row) => row.goalId === deletingGoal.id)
            for (const row of orphans) await removeContribution.mutateAsync(row.id)
            await removeGoal.mutateAsync(deletingGoal.id)
            toast.success('Meta excluída.')
            setDeletingGoal(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </div>
  )
}

function GoalDialog({
  open,
  onOpenChange,
  accounts,
  goal = null,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: { id: string; name: string }[]
  goal?: Goal | null
  onSubmit: (input: {
    name: string
    type: GoalType
    targetCents: number
    targetDate: string | null
    accountId: string | null
    status: 'active'
    notes: null
  }) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<GoalType>('reserve')
  const [targetCents, setTargetCents] = React.useState(0)
  const [targetDate, setTargetDate] = React.useState('')
  const [accountId, setAccountId] = React.useState('__none__')

  React.useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setType(goal?.type ?? 'reserve')
    setTargetCents(goal?.targetCents ?? 0)
    setTargetDate(goal?.targetDate ?? '')
    setAccountId(goal?.accountId ?? '__none__')
  }, [open, goal])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Informe o nome da meta.')
      return
    }
    if (targetCents <= 0) {
      toast.error('Informe o valor alvo.')
      return
    }
    await onSubmit({
      name: name.trim(),
      type,
      targetCents,
      targetDate: targetDate || null,
      accountId: accountId === '__none__' ? null : accountId,
      status: 'active',
      notes: null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? 'Editar meta financeira' : 'Nova meta financeira'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Nome</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Reserva de emergência"
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(value) => setType(value as GoalType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(GOAL_TYPE_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Valor alvo</Label>
              <MoneyInput id="goal-target" value={targetCents} onChange={setTargetCents} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Prazo</Label>
              <DateField
                id="goal-date"
                value={targetDate}
                onChange={setTargetDate}
                clearable
                onClear={() => setTargetDate('')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conta vinculada</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Criar meta</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
