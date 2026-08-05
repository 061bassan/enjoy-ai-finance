import * as React from 'react'
import { toast } from 'sonner'
import { Download, MoreHorizontal, Pencil, Plus, Trash2, Upload, Wallet } from 'lucide-react'
import { data } from '@/data'
import { formatMoney } from '@/lib/money'
import {
  ACCOUNT_TYPE_LABEL,
  CATEGORY_KIND_LABEL,
  COST_CENTER_LABEL,
  COST_CENTERS,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  optionsFrom,
} from '@/data/enums'
import type { Account, AccountType, CategoryKind, CostCenter, Role } from '@/data/types'
import { assignableRoles } from '@/data/rules/permissions'
import { useSession } from '@/app/session'
import { useTheme } from '@/app/theme'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { MoneyInput } from '@/components/MoneyInput'
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useAccounts,
  useCategories,
  useCreate,
  useMembers,
  useProfileMap,
  useRemove,
  useTransactions,
  useUpdate,
} from '@/hooks/data'
import { accountBalance } from '@/domain/finance'
import { pendingRequests } from '@/domain/membership'
import { AccessRequestsTab } from './AccessRequestsTab'
import { AppearanceTab } from './AppearanceTab'

export function SettingsPage() {
  const { workspace, session, allow } = useSession()
  const canAdminister = allow('manage:members')
  const { data: members = [] } = useMembers()

  const pendingCount = React.useMemo(() => pendingRequests(members).length, [members])

  return (
    <>
      <PageHeader
        title="Configurações"
        description={workspace ? `Workspace ${workspace.name}` : undefined}
      />

      <Tabs defaultValue={pendingCount > 0 && canAdminister ? 'access' : 'accounts'}>
        <TabsList>
          <TabsTrigger value="accounts">Contas</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          {canAdminister && (
            <TabsTrigger value="access">
              Acessos
              {/* O contador é a única pista de que alguém está esperando —
                  sem ele, um pedido pode ficar semanas parado sem ninguém
                  abrir a aba. */}
              {pendingCount > 0 && (
                <Badge className="ml-1.5 h-4 min-w-4 justify-center px-1 text-[10px]">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canAdminister && <TabsTrigger value="members">Equipe</TabsTrigger>}
          <TabsTrigger value="appearance">Aparência</TabsTrigger>
          <TabsTrigger value="preferences">Preferências</TabsTrigger>
          <TabsTrigger value="data">Dados</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        {canAdminister && (
          <TabsContent value="access">
            <AccessRequestsTab />
          </TabsContent>
        )}
        {canAdminister && (
          <TabsContent value="members">
            <MembersTab />
          </TabsContent>
        )}
        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab workspaceId={session?.workspaceId ?? ''} />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ---------------------------------------------------------------------------

function AccountsTab() {
  const { session, allow } = useSession()
  const canManage = allow('manage:accounts')
  const { data: accounts = [] } = useAccounts()
  const { data: transactions = [] } = useTransactions()
  const create = useCreate('accounts', data.accounts)
  const update = useUpdate('accounts', data.accounts)
  const removeAccount = useRemove('accounts', data.accounts)

  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<AccountType>('checking')
  const [institution, setInstitution] = React.useState('')
  const [openingBalanceCents, setOpeningBalanceCents] = React.useState(0)
  const [editing, setEditing] = React.useState<Account | null>(null)
  const [deleting, setDeleting] = React.useState<Account | null>(null)

  /** Quantos lançamentos dependem de cada conta — trava a exclusão. */
  const movementsByAccount = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const transaction of transactions) {
      map.set(transaction.accountId, (map.get(transaction.accountId) ?? 0) + 1)
    }
    return map
  }, [transactions])

  function resetForm() {
    setEditing(null)
    setName('')
    setType('checking')
    setInstitution('')
    setOpeningBalanceCents(0)
  }

  function startEdit(account: Account) {
    setEditing(account)
    setName(account.name)
    setType(account.type)
    setInstitution(account.institution ?? '')
    setOpeningBalanceCents(account.openingBalanceCents)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    if (!name.trim()) {
      toast.error('Informe o nome da conta.')
      return
    }

    const fields = {
      name: name.trim(),
      type,
      institution: institution.trim() || null,
      openingBalanceCents,
    }

    if (editing) {
      await update.mutateAsync({ id: editing.id, patch: fields })
      toast.success('Conta atualizada.')
      resetForm()
      return
    }

    await create.mutateAsync({
      workspaceId: session.workspaceId,
      ...fields,
      archived: false,
    })
    resetForm()
    toast.success('Conta criada.')
  }

  async function toggleArchived(account: Account) {
    await update.mutateAsync({ id: account.id, patch: { archived: !account.archived } })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="overflow-hidden lg:col-span-2">
        {accounts.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Wallet} title="Nenhuma conta cadastrada" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead data-numeric>Saldo</TableHead>
                <TableHead className="w-24">Ativa</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <span className="block font-medium">{account.name}</span>
                    {account.institution && (
                      <span className="block text-xs text-muted-foreground">
                        {account.institution}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {ACCOUNT_TYPE_LABEL[account.type]}
                  </TableCell>
                  <TableCell data-numeric className="font-medium">
                    {formatMoney(accountBalance(account, transactions))}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={!account.archived}
                      disabled={!canManage}
                      onCheckedChange={() => void toggleArchived(account)}
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ações da conta ${account.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => startEdit(account)}>
                            <Pencil /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDeleting(account)}>
                            <Trash2 /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {canManage && (
        <Card className="p-4">
          {/* O mesmo formulário serve para criar e corrigir: uma segunda cópia
              só para editar sairia de sincronia no primeiro campo novo. */}
          <h3 className="mb-3 text-sm font-medium">{editing ? 'Editar conta' : 'Nova conta'}</h3>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Nome</Label>
              <Input
                id="account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Conta PJ — Inter"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(value) => setType(value as AccountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(ACCOUNT_TYPE_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-institution">Instituição</Label>
              <Input
                id="account-institution"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-balance">Saldo inicial</Label>
              <MoneyInput
                id="account-balance"
                value={openingBalanceCents}
                onChange={setOpeningBalanceCents}
              />
            </div>
            <div className="flex gap-2">
              {editing && (
                <Button type="button" variant="ghost" className="flex-1" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
              <Button
                type="submit"
                className="flex-1"
                disabled={create.isPending || update.isPending}
              >
                {editing ? (
                  'Salvar alterações'
                ) : (
                  <>
                    <Plus /> Criar conta
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Excluir esta conta?"
        description={
          deleting && (movementsByAccount.get(deleting.id) ?? 0) > 0
            ? `Esta conta tem ${movementsByAccount.get(deleting.id)} lançamentos. Excluí-la deixaria o caixa sem origem — desative-a no botão "Ativa" para tirá-la de circulação sem perder o histórico.`
            : 'A conta some das opções de lançamento. Como não há movimentação nela, nenhum saldo muda.'
        }
        confirmLabel="Excluir conta"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          if ((movementsByAccount.get(deleting.id) ?? 0) > 0) {
            toast.error('Conta com lançamentos não pode ser excluída. Desative-a.')
            return
          }
          try {
            await removeAccount.mutateAsync(deleting.id)
            toast.success('Conta excluída.')
            setDeleting(null)
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir.')
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function CategoriesTab() {
  const { session, allow } = useSession()
  const canManage = allow('manage:categories')
  const { data: categories = [] } = useCategories()
  const create = useCreate('categories', data.categories)
  const remove = useRemove('categories', data.categories)

  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<CategoryKind>('expense')
  const [costCenter, setCostCenter] = React.useState<CostCenter | ''>('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    if (!name.trim()) {
      toast.error('Informe o nome da categoria.')
      return
    }
    await create.mutateAsync({
      workspaceId: session.workspaceId,
      name: name.trim(),
      kind,
      costCenter: (costCenter || null) as CostCenter | null,
      parentId: null,
      isRecurringRevenue: false,
      archived: false,
    })
    setName('')
    setCostCenter('')
    toast.success('Categoria criada.')
  }

  const income = categories.filter((category) => category.kind === 'income')
  const expense = categories.filter((category) => category.kind === 'expense')

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {[
          { title: 'Receitas', items: income },
          { title: 'Despesas', items: expense },
        ].map((group) => (
          <Card key={group.title} className="p-4">
            <h3 className="mb-3 text-sm font-medium">{group.title}</h3>
            {group.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>
            ) : (
              <ul className="divide-y divide-border">
                {group.items.map((category) => (
                  <li key={category.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
                    {category.costCenter && (
                      <Badge variant="outline">{COST_CENTER_LABEL[category.costCenter]}</Badge>
                    )}
                    {category.isRecurringRevenue && <Badge variant="muted">MRR</Badge>}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void remove.mutateAsync(category.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      {canManage && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Nova categoria</h3>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Nome</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as CategoryKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(CATEGORY_KIND_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
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
            <Button type="submit" className="w-full" disabled={create.isPending}>
              <Plus /> Criar categoria
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function MembersTab() {
  const { session } = useSession()
  const { data: allMembers = [] } = useMembers()
  const profiles = useProfileMap()
  const update = useUpdate('members', data.members)

  const myRole = session?.role
  const canAssign = assignableRoles(myRole)

  // Quem está na equipe é quem já foi liberado. Pendentes e recusados vivem
  // na aba Acessos — misturar os dois faria a lista de equipe sugerir que
  // alguém já opera o sistema quando ainda está esperando decisão.
  const members = React.useMemo(
    () => allMembers.filter((member) => member.status === 'active'),
    [allMembers],
  )

  async function changeRole(memberId: string, role: Role) {
    await update.mutateAsync({ id: memberId, patch: { role } })
    toast.success('Papel atualizado.')
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead className="hidden sm:table-cell">E-mail</TableHead>
              <TableHead className="w-[190px]">Papel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const profile = profiles.get(member.userId)
              // O dono não pode ser rebaixado por ninguém, nem por si mesmo.
              const isOwner = member.role === 'owner'

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback>{initialsOf(profile?.name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {profile?.name ?? 'Usuário removido'}
                        </span>
                        {profile?.jobTitle && (
                          <span className="block text-xs text-muted-foreground">
                            {profile.jobTitle}
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {profile?.email ?? '—'}
                  </TableCell>
                  <TableCell>
                    {isOwner || canAssign.length === 0 ? (
                      <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
                    ) : (
                      <Select
                        value={member.role}
                        onValueChange={(value) => void changeRole(member.id, value as Role)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {canAssign.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium">O que cada papel pode fazer</h3>
        <dl className="space-y-2.5">
          {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
            <div key={role} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <dt className="w-28 shrink-0 text-sm font-medium">{ROLE_LABEL[role]}</dt>
              <dd className="text-sm text-muted-foreground">{ROLE_DESCRIPTION[role]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PreferencesTab() {
  const { theme, toggle } = useTheme()

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Tema escuro</p>
          <p className="text-sm text-muted-foreground">
            O produto foi desenhado para o escuro — a logo da Enjoy é branca sobre preto.
          </p>
        </div>
        <Switch checked={theme === 'dark'} onCheckedChange={toggle} />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function DataTab({ workspaceId }: { workspaceId: string }) {
  const [importing, setImporting] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)

  async function exportData() {
    try {
      const payload = await data.ops.exportWorkspace(workspaceId)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `enjoy-finance-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Backup gerado.')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível exportar.')
    }
  }

  async function importData(file: File) {
    setImporting(true)
    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>
      await data.ops.importWorkspace(payload)
      toast.success('Backup restaurado. Recarregue a página para ver os dados.')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Arquivo inválido.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-medium">Backup</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Os dados vivem no navegador (IndexedDB) enquanto o Supabase não entra. Limpar os dados do
          site apaga tudo — exporte antes.
        </p>
        <Separator className="my-4" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportData()}>
            <Download /> Exportar JSON
          </Button>
          <Button variant="outline" disabled={importing} onClick={() => fileInput.current?.click()}>
            <Upload /> Importar JSON
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importData(file)
              event.target.value = ''
            }}
          />
        </div>
      </Card>

      <Card className="border-negative/30 p-4">
        <h3 className="text-sm font-medium">Recomeçar do zero</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Apaga todos os dados deste navegador, inclusive as contas de acesso. Não há desfazer.
        </p>
        <Separator className="my-4" />
        <Button variant="destructive" onClick={() => setResetOpen(true)}>
          <Trash2 /> Apagar dados locais
        </Button>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        destructive
        title="Apagar todos os dados locais"
        description="Lançamentos, vendas, leads e contas de acesso deste navegador serão removidos. Exporte um backup antes se quiser guardar algo."
        confirmationText="APAGAR"
        confirmLabel="Apagar tudo"
        onConfirm={async () => {
          await data.reset?.()
          window.location.reload()
        }}
      />
    </div>
  )
}
