/**
 * Exportação e leitura de CSV.
 *
 * Gerado para o Excel brasileiro: separador `;`, BOM UTF-8 e decimal com
 * vírgula. Sem o BOM, o Excel abre acentuação quebrada; sem o `;`, ele joga
 * a linha inteira numa célula só. Os dois detalhes decidem se o arquivo é
 * usável ou não pelo financeiro.
 */

/** Marca de ordem de byte. Escrito como escape para não virar um caractere invisível no fonte. */
const BOM = '\uFEFF'

export type CsvValue = string | number | null | undefined

export interface CsvColumn<T> {
  header: string
  value: (row: T) => CsvValue
  /** Valores monetários saem em reais com vírgula decimal, não em centavos. */
  money?: boolean
}

function escapeCell(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function formatCell(value: CsvValue, money: boolean): string {
  if (value == null) return ''
  if (typeof value === 'number') {
    if (money) return (value / 100).toFixed(2).replace('.', ',')
    return String(value).replace('.', ',')
  }
  return escapeCell(value)
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCell(column.header)).join(';')
  const body = rows
    .map((row) =>
      columns.map((column) => formatCell(column.value(row), column.money ?? false)).join(';'),
    )
    .join('\r\n')
  return `${header}\r\n${body}`
}

/** Dispara o download de um CSV já formatado. */
export function downloadCsv(filename: string, content: string) {
  // O BOM é o que faz o Excel reconhecer UTF-8.
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Lê um CSV em linhas de objetos.
 *
 * Detecta o separador (`;` ou `,`) pela primeira linha e respeita aspas —
 * o suficiente para os extratos que bancos e planilhas exportam. Não é um
 * parser completo de RFC 4180: quebras de linha dentro de célula não são
 * suportadas, e isso está documentado aqui de propósito.
 */
export function parseCsv(content: string): Record<string, string>[] {
  const text = content.startsWith(BOM) ? content.slice(1) : content
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []

  const first = lines[0] ?? ''
  const separator = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ','

  const headers = splitLine(first, separator).map((header) => header.trim())

  return lines.slice(1).map((line) => {
    const cells = splitLine(line, separator)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim()
    })
    return row
  })
}

function splitLine(line: string, separator: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      // Aspas duplicadas dentro de célula citada representam uma aspa literal.
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === separator && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}
