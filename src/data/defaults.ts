/**
 * Valores padrão compartilhados entre a camada de dados e as telas.
 *
 * Fica fora de `local/` de propósito: as telas não podem importar nada de
 * dentro de um provider específico, senão a troca para o Supabase deixa de
 * ser transparente.
 */

/** Usuário único do MVP. O cargo é escolhido na tela de entrada. */
export const DEFAULT_USER = {
  name: 'Administrador',
  email: 'admin@enjoyscale.com.br',
} as const

/** Nome da empresa exibido no seletor de espaços. */
export const DEFAULT_COMPANY = {
  name: 'Enjoy Scale',
  shortName: 'Enjoy',
} as const
