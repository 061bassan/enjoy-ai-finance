/**
 * Valores padrão compartilhados entre a camada de dados e as telas.
 *
 * Fica fora de `local/` de propósito: as telas não podem importar nada de
 * dentro de um provider específico, senão a troca para o Supabase deixa de
 * ser transparente.
 */

/** Nome da empresa exibido no seletor de espaços. */
export const DEFAULT_COMPANY = {
  name: 'Enjoy Scale',
  shortName: 'Enjoy',
} as const
