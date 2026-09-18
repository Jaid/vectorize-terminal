import {expect, test} from 'bun:test'

import {Resvg} from '@resvg/resvg-js'

import render from '../src/main.ts'
import {TerminalBuffer} from '../src/terminal/TerminalBuffer.ts'

// Some decomposed Hangul graphemes can occupy more than two cells.
test('overwriting a cell inside an unusually wide grapheme removes the whole glyph', () => {
  const terminal = new TerminalBuffer(10, 1)
  terminal.write('\u{1100}\u{1100}\u{1161}\bX')
  expect(terminal.lines.get(0)!.values().map(cell => [cell.text, cell.column]).toArray()).toEqual([['X', 3]])
})
test('rejects unrepresentable internal geometry instead of emitting NaN or Infinity', () => {
  expect(() => render({cellWidth: Number.MIN_VALUE})).toThrow(RangeError)
  expect(() => render({cellHeight: Number.MIN_VALUE})).toThrow(RangeError)
  expect(() => render({
    cellHeight: 1e-300,
    cellWidth: 1e12,
    decoration: {
      type: 'windowsTerminal',
      tabTitle: '',
    },
  })).toThrow(RangeError)
})
test('mixed random input always produces parseable, deterministic SVG', () => {
  const alphabet = ['A', ' ', '<', '&', '"', '\u{D800}', '界', '👩‍💻', '\u{301}', '\u{FFFF}', '\u{1B}[31m', '\u{1B}[0m', '\u{1B}[48;5;200m', '\u{1B}[1;3;4;9m', '\n', '\r', '\t', '\b', '\u{1B}]8;;https://example.com\u{7}', '\u{1B}Pdiscard\u{1B}\\']
  let seed = 12_345
  for (let trial = 0; trial < 100; trial++) {
    let content = ''
    for (let index = 0; index < 100; index++) {
      seed = Math.imul(seed, 1_664_525) + 1_013_904_223 >>> 0
      content += alphabet[seed % alphabet.length]
    }
    const options = {
      content,
      columns: 1 + trial % 20,
      rows: 1 + trial % 10,
      grid: trial % 2 === 0,
    }
    const svg = render(options)
    expect(svg).toBe(render(options))
    expect(() => new Resvg(svg, {font: {loadSystemFonts: false}})).not.toThrow()
    expect(svg).not.toContain('\u{1B}')
  }
})
