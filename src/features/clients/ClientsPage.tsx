import * as React from 'react'
import { toast } from 'sonner'
import { Plus, Users } from 'lucide-react'
import { data } from '@/data'
import { formatDate, today } from '@/lib/date'
import { formatMoney, formatNumber, formatPercent } from '@/lib/money'
import { CLIENT_STATUS_LABEL, LEAD_SOURCE_LABEL, optionsFrom } from '@/data/enums'
import type { Client, ClientStatus, LeadSource } from '@/data/types'
import { activeSales, churnRate } from '@/domain/sales'
import { usePeriod } from '@/app/period'
import { useSession } from '@/app/session'
import { KpiCard, KpiGrid } from '@/components/KpiCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useClients, useCreate, useSales, useUpdate } from '@/hooks/data'

/**
 * Carteira de clientes.
 *
 * A receita por cliente vem das vendas, não de um campo — assim ela nunca
 * fica defasada em relação ao que foi efetivamente vendido.
 */
export function ClientsPage() {
  const { range } = usePeriod()
  const { allow } = useSession()
  const canManage = allow('manage:clients')

  const { data: clients = [], isLoading } = useClients()
  const { data: sales = [] } = useSales()
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const update = useUpdate('clients', data.clients)

  const rows = React.useMemo(() => {
    const byClient = new Map<string, { total: number; mrr: number; count: number }>()

    for (const sale of activeSales(sales)) {
      if (!sale.clientId) continue
      const bucket = byClient.get(sale.clientId) ?? { total: 0, mrr: 0, count: 0 }
      bucket.total += sale.amountCents
      bucket.mrr += sale.mrrCents
      bucket.count += 1
      byClient.set(sale.clientId, bucket)
    }

    return clients
      .map((client) => ({
        client,
        ...(byClient.get(client.id) ?? { total: 0, mrr: 0, count: 0 }),
      }))
      .sort((a, b) => b.total - a.total)
  }, [clients, sales])

  const metrics = React.useMemo(() => {
    const active = clients.filter((client) => client.status === 'active')
    const churned = clients.filter((client) => client.status === 'churned')
    const activeMrr = rows
      .filter((row) => row.client.status === 'active')
      .reduce((sum, row) => sum + row.mrr, 0)

    return {
      total: clients.length,
      active: active.length,
      churned: churned.length,
      activeMrr,
      averageTicket: active.length
        ? Math.round(rows.filter((r) => r.client.status === 'active').reduce((s, r) => s + r.total, 0) / active.length)
        : 0,
      churn: churnRate(clients, range),
    }
  }, [clients, rows, range])

  async function changeStatus(client: Client, status: ClientStatus) {
    await update.mutateAsync({
      id: client.id,
      patch: {
        status,
        // Registrar a data do churn é o que permite calcular a taxa por período.
        churnDate: status === 'churned' ? (client.churnDate ?? today()) : null,
      },
    })
    toast.success('Status atualizado.')
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Carteira, receita acumulada por cliente e churn."
        actions={
          canManage && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus /> Novo cliente
            </Button>
          )
        }
      />

      <KpiGrid className="mb-4">
        <KpiCard label="Clientes ativos" value={formatNumber(metrics.active)} />
        <KpiCard label="Total na base" value={formatNumber(metrics.total)} />
        <KpiCard label="MRR da carteira" value={formatMoney(metrics.activeMrr)} />
        <KpiCard label="Receita média por cliente" value={formatMoney(metrics.averageTicket)} />
        <KpiCard
          label="Churn no período"
          value={metrics.churn != null ? formatPercent(metrics.churn) : '—'}
          invertVariation
          hint="Clientes que cancelaram no período sobre a base existente no início dele."
        />
        <KpiCard label="Em churn" value={formatNumber(metrics.churned)} invertVariation />
      </KpiGrid>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Users} title="Nenhum cliente cadastrado" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden lg:table-cell">Origem</TableHead>
                <TableHead className="hidden md:table-cell">Desde</TableHead>
                <TableHead data-numeric>Receita</TableHead>
                <TableHead data-numeric className="hidden sm:table-cell">
                  MRR
                </TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ client, total, mrr, count }) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <span className="block max-w-[220px] truncate font-medium">{client.name}</span>
                    <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
                      {client.company ?? '—'}
                      {count > 0 && ` · ${count} ${count === 1 ? 'venda' : 'vendas'}`}
                    </span>
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    {client.source ? (
                      <Badge variant="outline">{LEAD_SOURCE_LABEL[client.source]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {client.startDate ? formatDate(client.startDate) : '—'}
                  </TableCell>

                  <TableCell data-numeric className="font-medium">
                    {formatMoney(total)}
                  </TableCell>

                  <TableCell data-numeric className="hidden text-muted-foreground sm:table-cell">
                    {mrr > 0 ? formatMoney(mrr) : '—'}
                  </TableCell>

                  <TableCell>
                    {canManage ? (
                      <Select
                        value={client.status}
                        onValueChange={(value) => void changeStatus(client, value as ClientStatus)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {optionsFrom(CLIENT_STATUS_LABEL).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={client.status === 'churned' ? 'negative' : 'muted'}>
                        {CLIENT_STATUS_LABEL[client.status]}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ClientDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}

function ClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { session } = useSession()
  const create = useCreate('clients', data.clients)

  const [name, setName] = React.useState('')
  const [company, setCompany] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [source, setSource] = React.useState<LeadSource | ''>('')
  const [status, setStatus] = React.useState<ClientStatus>('lead')

  React.useEffect(() => {
    if (!open) return
    setName('')
    setCompany('')
    setEmail('')
    setPhone('')
    setSource('')
    setStatus('lead')
  }, [open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    if (!name.trim()) {
      toast.error('Informe o nome do cliente.')
      return
    }

    await create.mutateAsync({
      workspaceId: session.workspaceId,
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      status,
      source: (source || null) as LeadSource | null,
      startDate: status === 'active' ? today() : null,
      churnDate: null,
      ownerId: session.user.id,
      notes: null,
    })

    toast.success('Cliente cadastrado.')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Nome</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-company">Empresa</Label>
            <Input
              id="client-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-email">E-mail</Label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Telefone</Label>
              <Input
                id="client-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={source} onValueChange={(value) => setSource(value as LeadSource)}>
                <SelectTrigger>
                  <SelectValue placeholder="Não informada" />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(LEAD_SOURCE_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ClientStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(CLIENT_STATUS_LABEL).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
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
            <Button type="submit" disabled={create.isPending}>
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
