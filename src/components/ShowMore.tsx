import * as React from 'react'
import { Button } from '@/components/ui/button'

/** Quantas linhas uma tabela mostra antes de pedir para continuar. */
export const PAGE_SIZE = 100

/**
 * Lista longa em pedaços.
 *
 * Uma tabela com mil lançamentos monta mil linhas de DOM, cada uma com
 * ícones, badges e um menu suspenso. No desktop passa despercebido; num
 * celular mediano, a tela trava por segundos e a rolagem engasga.
 *
 * Cortar em cem e oferecer o resto sob demanda resolve sem esconder nada: a
 * contagem total continua visível, então ninguém conclui que os lançamentos
 * sumiram. Paginação de verdade (com "página 2") seria pior aqui — obriga a
 * perder de vista o que já foi lido para procurar o resto.
 */
export function useVisibleCount(total: number) {
  const [count, setCount] = React.useState(PAGE_SIZE)

  // Mudou o filtro? Volta ao começo — manter 500 linhas visíveis depois de
  // uma busca que devolve 3 resultados não ajuda ninguém.
  React.useEffect(() => {
    setCount(PAGE_SIZE)
  }, [total])

  return {
    count,
    hasMore: total > count,
    showMore: () => setCount((current) => current + PAGE_SIZE),
  }
}

export function ShowMore({
  total,
  count,
  onShowMore,
  noun,
  nounPlural,
}: {
  total: number
  count: number
  onShowMore: () => void
  noun: string
  nounPlural: string
}) {
  if (total === 0) return null

  const shown = Math.min(count, total)

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {shown < total
          ? `Mostrando ${shown} de ${total} ${nounPlural}.`
          : `${total} ${total === 1 ? noun : nounPlural} no período.`}
      </p>
      {shown < total && (
        <Button variant="outline" size="sm" onClick={onShowMore}>
          Mostrar mais {Math.min(PAGE_SIZE, total - shown)}
        </Button>
      )}
    </div>
  )
}
