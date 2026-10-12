import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { data } from '@/data'
import { applyLabelOverrides, type LabelGroup, type LabelOverrides } from '@/data/enums'
import { useSession } from '@/app/session'
import { useTheme } from '@/app/theme'
import { defaultHidden, sectionKey } from './registry'
import { brandCssVars, MANAGED_VARS } from './theme'
import type { BrandPrefs, Customization } from './types'

export const DEFAULT_BRAND: BrandPrefs = {
  accent: 'grafite',
  intensity: 'equilibrado',
  corners: 'suave',
  density: 'confortavel',
}

interface CustomizationContextValue {
  brand: BrandPrefs
  /** Um item está visível nesta seção? */
  isVisible: (screenId: string, sectionId: string, itemId: string) => boolean
  /** A rota está escondida do menu? */
  isNavHidden: (to: string) => boolean
  setBrand: (patch: Partial<BrandPrefs>) => void
  toggleItem: (screenId: string, sectionId: string, itemId: string, visible: boolean) => void
  toggleNav: (to: string, hidden: boolean) => void
  resetAll: () => void
  /** Etiquetas renomeadas pelo time. Muda de identidade a cada troca — quem
   *  mostra etiqueta e depende disso para re-renderizar lê este campo. */
  labels: LabelOverrides
  /** Renomeia uma etiqueta; `null` (ou texto vazio) volta ao padrão. */
  setLabel: (group: LabelGroup, value: string, text: string | null) => void
  /** Falso enquanto a preferência ainda não chegou do banco. */
  ready: boolean
  saving: boolean
}

const CustomizationContext = React.createContext<CustomizationContextValue | null>(null)

/**
 * Personalização do workspace.
 *
 * Fica ACIMA das telas e ABAIXO da sessão: precisa do workspace ativo para
 * saber o que carregar, e as telas precisam dela para decidir o que mostrar.
 *
 * Enquanto não há sessão (tela de login), devolve os padrões sem consultar
 * nada — a tela de entrada não tem workspace para personalizar.
 */
export function CustomizationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession()
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const workspaceId = session?.workspaceId ?? null

  const { data: row, isPending } = useQuery({
    queryKey: ['customizations', workspaceId],
    enabled: workspaceId != null,
    queryFn: async () => {
      const rows = await data.customizations.list(workspaceId as string)
      return rows[0] ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (patch: Partial<Omit<Customization, keyof object>>) => {
      if (!workspaceId) return null
      if (row) return data.customizations.update(row.id, patch)
      return data.customizations.create({
        workspaceId,
        brand: DEFAULT_BRAND,
        hidden: {},
        hiddenNav: [],
        labels: {},
        ...patch,
      } as Omit<Customization, 'id' | 'createdAt' | 'updatedAt'>)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customizations'] })
    },
  })

  const brand = React.useMemo<BrandPrefs>(
    () => ({ ...DEFAULT_BRAND, ...(row?.brand ?? {}) }),
    [row?.brand],
  )

  /**
   * Aplica as variáveis no <html>.
   *
   * Limpa as gerenciadas antes de escrever, senão trocar de acento colorido
   * para "grafite" deixaria a cor anterior grudada — o mapa novo simplesmente
   * não traria as chaves de cor para sobrescrever.
   */
  React.useEffect(() => {
    const root = document.documentElement
    for (const name of MANAGED_VARS) root.style.removeProperty(name)

    const vars = brandCssVars(brand, theme)
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value)
    }
  }, [brand, theme])

  // Memoizados porque `?? {}` cria objeto novo a cada render, o que faria
  // todo useCallback abaixo mudar de identidade e re-renderizar as telas.
  const hidden = React.useMemo(() => row?.hidden ?? {}, [row?.hidden])
  const hiddenNav = React.useMemo(() => row?.hiddenNav ?? [], [row?.hiddenNav])

  const isVisible = React.useCallback(
    (screenId: string, sectionId: string, itemId: string) => {
      const key = sectionKey(screenId, sectionId)
      // Sem preferência gravada para a seção, valem os padrões do catálogo.
      const list = hidden[key] ?? defaultHidden(screenId, sectionId)
      return !list.includes(itemId)
    },
    [hidden],
  )

  const isNavHidden = React.useCallback((to: string) => hiddenNav.includes(to), [hiddenNav])

  const labels = React.useMemo<LabelOverrides>(() => row?.labels ?? {}, [row?.labels])
  // Aplicado DURANTE o render, não num efeito: as telas filhas leem os mapas
  // de etiqueta no mesmo render em que o valor do contexto muda. Num efeito,
  // elas pintariam uma vez com o texto antigo. É idempotente, então rodar de
  // novo no mesmo render não muda nada.
  React.useMemo(() => applyLabelOverrides(labels), [labels])

  const setLabel = React.useCallback(
    (group: LabelGroup, value: string, text: string | null) => {
      const groupLabels = { ...(labels[group] ?? {}) }
      const cleaned = text?.trim()
      if (cleaned) groupLabels[value] = cleaned
      else delete groupLabels[value]
      save.mutate({ labels: { ...labels, [group]: groupLabels } })
    },
    [labels, save],
  )

  const setBrand = React.useCallback(
    (patch: Partial<BrandPrefs>) => {
      save.mutate({ brand: { ...brand, ...patch } })
    },
    [brand, save],
  )

  const toggleItem = React.useCallback(
    (screenId: string, sectionId: string, itemId: string, visible: boolean) => {
      const key = sectionKey(screenId, sectionId)
      const current = hidden[key] ?? defaultHidden(screenId, sectionId)
      const next = visible
        ? current.filter((id) => id !== itemId)
        : current.includes(itemId)
          ? current
          : [...current, itemId]
      save.mutate({ hidden: { ...hidden, [key]: next } })
    },
    [hidden, save],
  )

  const toggleNav = React.useCallback(
    (to: string, hide: boolean) => {
      const next = hide
        ? hiddenNav.includes(to)
          ? hiddenNav
          : [...hiddenNav, to]
        : hiddenNav.filter((route) => route !== to)
      save.mutate({ hiddenNav: next })
    },
    [hiddenNav, save],
  )

  const resetAll = React.useCallback(() => {
    save.mutate({ brand: DEFAULT_BRAND, hidden: {}, hiddenNav: [] })
  }, [save])

  const value = React.useMemo<CustomizationContextValue>(
    () => ({
      brand,
      isVisible,
      isNavHidden,
      setBrand,
      toggleItem,
      toggleNav,
      resetAll,
      labels,
      setLabel,
      ready: workspaceId == null || !isPending,
      saving: save.isPending,
    }),
    [
      brand,
      isVisible,
      isNavHidden,
      setBrand,
      toggleItem,
      toggleNav,
      resetAll,
      labels,
      setLabel,
      workspaceId,
      isPending,
      save.isPending,
    ],
  )

  return <CustomizationContext.Provider value={value}>{children}</CustomizationContext.Provider>
}

export function useCustomization(): CustomizationContextValue {
  const context = React.useContext(CustomizationContext)
  if (!context) {
    throw new Error('useCustomization precisa estar dentro de <CustomizationProvider>.')
  }
  return context
}
