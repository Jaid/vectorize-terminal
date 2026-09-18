import type {Options} from './types.ts'

import {renderDecoration, validateDecoration} from './decoration.ts'
import {renderContent, renderGrid} from './render.ts'
import {TerminalBuffer} from './terminal/TerminalBuffer.ts'
import {background, createLayout, number as n} from './types.ts'

export type {Options, WindowsTerminalDecoration} from './types.ts'

const resolveOptions = (input: unknown): Options => {
  if (typeof input === 'string') {
    return {content: input}
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Expected terminal content or an options object.')
  }
  const options = input as Record<string, unknown>
  if (options.content !== undefined && typeof options.content !== 'string') {
    throw new TypeError('content must be a string.')
  }
  for (const name of ['columns', 'rows', 'padding', 'cellWidth', 'cellHeight']) {
    if (options[name] !== undefined && typeof options[name] !== 'number') {
      throw new TypeError(`${name} must be a number.`)
    }
  }
  const debug = options.debug
  if (debug !== undefined && (typeof debug !== 'object' || debug === null || Array.isArray(debug))) {
    throw new TypeError('debug must be an object.')
  }
  for (const [name, value] of [['grid', options.grid], ['debug.grid', (debug as Record<string, unknown> | undefined)?.grid]] as const) {
    if (value !== undefined && typeof value !== 'boolean') {
      throw new TypeError(`${name} must be a boolean.`)
    }
  }
  if (options.decoration !== undefined) {
    validateDecoration(options.decoration)
  }
  return options
}

/** Render a deterministic, standalone terminal SVG. This function performs no I/O. */
export function vectorizeTerminal(input: Options | string = {}): string {
  const options = resolveOptions(input)
  const layout = createLayout(options)
  const grid = options.debug?.grid ?? options.grid ?? false
  if (grid && layout.columns + layout.rows > 100_000) {
    throw new RangeError('A debug grid may contain at most 100 000 rows and columns combined.')
  }
  const terminal = new TerminalBuffer(layout.columns, layout.rows)
  terminal.write(options.content ?? '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(layout.width)}" height="${n(layout.height)}" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" role="img" aria-label="Terminal screenshot">
<title>Terminal screenshot</title>
<rect width="${n(layout.width)}" height="${n(layout.height)}" fill="${background}"/>
${options.decoration ? `${renderDecoration(options.decoration, layout)}\n` : ''}${renderContent(terminal.lines, layout)}${grid ? `\n${renderGrid(layout)}` : ''}
</svg>\n`
}

export default vectorizeTerminal
