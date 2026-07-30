/**
 * Digitação de data no formato brasileiro.
 *
 * Separado do componente porque é lógica pura — e porque é exatamente o tipo
 * de coisa que precisa de teste: a diferença entre aceitar e rejeitar 31/02
 * é a diferença entre gravar a data certa e gravar 03/03 sem avisar ninguém.
 */

import { toIsoDate, type IsoDate } from './date'

/** Máscara progressiva: "05032026" vira "05/03/2026". */
export function maskDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/**
 * "dd/MM/yyyy" digitado → ISO. Devolve null enquanto estiver incompleto ou
 * quando a data não existe no calendário.
 */
export function parseTypedDate(text: string): IsoDate | null {
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 8) return null

  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))

  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (year < 1900 || year > 2200) return null

  /**
   * Rejeita 31/02 e afins. O construtor de Date normalizaria para 03/03 em
   * silêncio, e o usuário só descobriria depois de salvar — comparar de volta
   * é o que transforma isso em erro visível.
   */
  const date = new Date(year, month - 1, day)
  if (date.getDate() !== day || date.getMonth() !== month - 1) return null

  return toIsoDate(date)
}
