/**
 * Catálogo do que o sócio pode mostrar ou esconder.
 *
 * É declarativo de propósito: a tela de Aparência é construída a partir
 * daqui, então adicionar um item novo à personalização é acrescentar uma
 * linha nesta lista — nenhuma tela de configuração precisa mudar.
 *
 * `locked` marca o que não pode ser escondido. Não é capricho: sem cliente e
 * sem valor, a tabela de vendas deixa de responder "quem comprou quanto", que
 * é a única pergunta que ela existe para responder. Travar aqui é mais honesto
 * do que deixar esconder e entregar uma tela inútil.
 */

export interface CustomizableItem {
  id: string
  label: string
  /** Não pode ser ocultado — a tela perde o sentido sem ele. */
  locked?: boolean
  /** Nasce oculto para quem nunca personalizou. */
  hiddenByDefault?: boolean
  hint?: string
}

export interface CustomizableSection {
  id: string
  label: string
  description?: string
  items: CustomizableItem[]
}

export interface CustomizableScreen {
  id: string
  label: string
  sections: CustomizableSection[]
}

export const SCREENS: CustomizableScreen[] = [
  {
    id: 'sales',
    label: 'Vendas',
    sections: [
      {
        id: 'kpis',
        label: 'Indicadores',
        description: 'Cartões no topo da tela.',
        items: [
          { id: 'count', label: 'Vendas' },
          { id: 'total', label: 'Valor vendido' },
          { id: 'ticket', label: 'Ticket médio' },
          { id: 'mrr', label: 'MRR vendido' },
          { id: 'setup', label: 'Implantação' },
          { id: 'largest', label: 'Maior venda' },
          { id: 'smallest', label: 'Menor venda' },
          { id: 'profit', label: 'Lucro das vendas' },
          { id: 'cac', label: 'CAC médio' },
          { id: 'roi', label: 'ROI' },
          { id: 'daysToClose', label: 'Tempo de fechamento' },
        ],
      },
      {
        id: 'columns',
        label: 'Colunas da tabela',
        items: [
          { id: 'date', label: 'Data' },
          { id: 'client', label: 'Cliente', locked: true, hint: 'Sem ele a linha não identifica ninguém.' },
          { id: 'closer', label: 'Closer' },
          { id: 'source', label: 'Origem' },
          { id: 'model', label: 'Modelo' },
          { id: 'amount', label: 'Valor', locked: true, hint: 'É o número que a tela existe para mostrar.' },
          { id: 'mrr', label: 'MRR' },
          { id: 'margin', label: 'Margem' },
          { id: 'status', label: 'Status' },
          { id: 'sdr', label: 'SDR', hiddenByDefault: true },
          { id: 'installments', label: 'Parcelas', hiddenByDefault: true },
          { id: 'commission', label: 'Comissão', hiddenByDefault: true },
        ],
      },
      {
        id: 'filters',
        label: 'Filtros',
        items: [
          { id: 'search', label: 'Busca por cliente' },
          { id: 'status', label: 'Filtro de status' },
          { id: 'closer', label: 'Filtro de closer' },
        ],
      },
    ],
  },
]

const SCREEN_BY_ID = new Map(SCREENS.map((screen) => [screen.id, screen]))

export function findSection(screenId: string, sectionId: string): CustomizableSection | undefined {
  return SCREEN_BY_ID.get(screenId)?.sections.find((section) => section.id === sectionId)
}

/** Chave usada no mapa de ocultos. */
export function sectionKey(screenId: string, sectionId: string): string {
  return `${screenId}.${sectionId}`
}

/** Ids que nascem ocultos numa seção — aplicados quando não há preferência. */
export function defaultHidden(screenId: string, sectionId: string): string[] {
  const section = findSection(screenId, sectionId)
  if (!section) return []
  return section.items.filter((item) => item.hiddenByDefault).map((item) => item.id)
}
