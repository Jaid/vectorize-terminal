export type WindowsTerminalDecoration = {
  /** A complete SVG document, embedded as an isolated image (not inline markup). */
  tabIcon?: string
  tabTitle: string
  type: 'windowsTerminal'
}

export type Options = {
  /** @default 100 */
  cellHeight?: number
  /** @default 45 */
  cellWidth?: number
  /** @default 80 */
  columns?: number
  /** Plain text or ANSI-styled output. No shell commands are executed. */
  content?: string
  debug?: {grid?: boolean}
  /** Omitted by default. Adds exactly two cell heights above the body. */
  decoration?: WindowsTerminalDecoration
  /** Shorthand for debug.grid. An explicit debug.grid takes precedence. */
  grid?: boolean
  /** Padding on each side of the terminal body, in SVG units. @default 30 */
  padding?: number
  /** @default 24 */
  rows?: number
}

export type Layout = {
  cellHeight: number
  cellWidth: number
  columns: number
  contentHeight: number
  contentWidth: number
  headerHeight: number
  height: number
  padding: number
  rows: number
  width: number
}

export type Style = {
  background: Color
  bold: boolean
  dim: boolean
  foreground: Color
  hidden: boolean
  inverse: boolean
  italic: boolean
  strikethrough: boolean
  underline: boolean
}
export type Cell = {
  column: number
  style: Style
  text: string
  width: number
}

export type Line = Map<number, Cell>
type Color = string | undefined

export const background = '#000000'
export const foreground = '#cccccc'

export const defaultStyle = (): Style => ({
  foreground: undefined,
  background: undefined,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  strikethrough: false,
  inverse: false,
  hidden: false,
})

export function colors(style: Style): [string, string] {
  const fg = style.foreground ?? foreground
  const bg = style.background ?? background
  return style.inverse ? [bg, fg] : [fg, bg]
}

export function createLayout(options: Options): Layout {
  const columns = options.columns ?? 80
  const rows = options.rows ?? 24
  const padding = options.padding ?? 30
  const cellWidth = options.cellWidth ?? 45
  const cellHeight = options.cellHeight ?? 100
  for (const [name, value] of Object.entries({
    columns,
    rows,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer.`)
    }
  }
  for (const [name, value] of Object.entries({
    padding,
    cellWidth,
    cellHeight,
  })) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (name === 'padding' ? value < 0 : value <= 0)) {
      throw new RangeError(`${name} must be a finite ${name === 'padding' ? 'nonnegative' : 'positive'} number.`)
    }
  }
  if (cellWidth / 45 === 0 || cellHeight * 0.035 === 0) {
    throw new RangeError('Cell dimensions are too small to represent.')
  }
  const headerHeight = options.decoration ? cellHeight * 2 : 0
  const contentWidth = columns * cellWidth
  const contentHeight = rows * cellHeight
  const width = contentWidth + padding * 2
  const height = contentHeight + padding * 2 + headerHeight
  if (![width, height].every(value => Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('The resulting SVG dimensions exceed the safe numeric range.')
  }
  return {
    columns,
    rows,
    padding,
    cellWidth,
    cellHeight,
    width,
    height,
    headerHeight,
    contentWidth,
    contentHeight,
  }
}

/** Escape text and attributes, replacing code points forbidden by XML 1.0. */
export function escapeXml(value: string): string {
  return value.toWellFormed().replaceAll(/[\u{0}-\u{8}\v\f\u{E}-\u{1F}\u{FFFE}\u{FFFF}]/gu, '�')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export const segmenter = new Intl.Segmenter('en', {granularity: 'grapheme'})

/** Stable, compact geometry without rounding small positive cell sizes to zero. */
export const number = (value: number): string => String(Number(value.toPrecision(12)))
