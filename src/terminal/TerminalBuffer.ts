import type {Cell, Line} from '../types.ts'

// eslint-disable-next-line no-restricted-imports -- The public library also runs in Node and browsers; Bun.stringWidth would make it Bun-only.
import stringWidth from 'string-width'

import {applySgr, tokenize} from '../ansi.ts'
import {defaultStyle, segmenter} from '../types.ts'

/** A bounded, top-anchored transcript, not a VT emulator with scrollback. */
export class TerminalBuffer {
  readonly lines = new Map<number, Line>
  private column = 0
  private occupied = new Map<number, number>
  private row = 0
  private style = defaultStyle()

  constructor(readonly columns: number, readonly rows: number) {}

  write(content: string): this {
    for (const token of tokenize(content.toWellFormed())) {
      if (this.row >= this.rows) {
        break
      }
      if (token.type === 'sgr') {
        this.style = applySgr(token.value, this.style)
      } else if (token.type === 'control') {
        this.control(token.value)
      } else {
        for (const {segment} of segmenter.segment(token.value)) {
          if (this.row >= this.rows) {
            break
          }
          this.paint(segment)
        }
      }
    }
    return this
  }

  private control(value: string): void {
    if (value === '\n') {
      this.nextLine()
    } else if (value === '\r') {
      this.column = 0
    } else if (value === '\b') {
      this.column = Math.max(0, this.column - 1)
    } else if (value === '\t') {
      const count = 8 - this.column % 8
      for (let i = 0; i < count && this.row < this.rows; i++) {
        this.paint(' ')
      }
    }
  }

  private nextLine(): void {
    this.row++
    this.column = 0
    this.occupied.clear()
  }

  private paint(text: string): void {
    let width = stringWidth(text, {ambiguousIsNarrow: true})
    if (width === 0) {
      // A combining mark separated from its base by an SGR still belongs to that cell.
      const line = this.lines.get(this.row)
      const origin = this.occupied.get(this.column - 1)
      const previous = origin === undefined ? undefined : line?.get(origin)
      if (previous && previous.column + previous.width === this.column) {
        previous.text += text
      }
      return
    }
    // A wide grapheme cannot fit a one-column terminal. Use an explicit replacement.
    if (width > this.columns) {
      text = '�'
      width = 1
    }
    if (this.column + width > this.columns) {
      this.nextLine()
    }
    if (this.row >= this.rows) {
      return
    }
    let line = this.lines.get(this.row)
    if (!line) {
      line = new Map
      this.lines.set(this.row, line)
    }
    // Overwriting either half of a wide glyph clears the entire previous glyph.
    for (let column = this.column; column < this.column + width; column++) {
      const origin = this.occupied.get(column)
      if (origin === undefined) {
        continue
      }
      const cell = line.get(origin)!
      line.delete(origin)
      for (let offset = 0; offset < cell.width; offset++) {
        this.occupied.delete(origin + offset)
      }
    }
    const cell: Cell = {
      text,
      column: this.column,
      width,
      style: this.style,
    }
    line.set(this.column, cell)
    for (let offset = 0; offset < width; offset++) {
      this.occupied.set(this.column + offset, this.column)
    }
    this.column += width
  }
}
