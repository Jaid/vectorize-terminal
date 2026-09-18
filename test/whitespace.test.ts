import {describe, expect, test} from 'bun:test'

import vectorizeTerminal from '../src/main.ts'
import {TerminalBuffer} from '../src/terminal/TerminalBuffer.ts'
import {rasterize} from './helpers.ts'

const nbsp = '&#xA0;'
describe('browser-safe terminal whitespace', () => {
  test.each(['ai', 'dayjs', 'es-toolkit', '@opencode-ai/sdk'])('preserves the entire padded %s field', name => {
    const field = ` ${name}`.padEnd(21)
    const svg = vectorizeTerminal({
      content: field,
      columns: 21,
      rows: 1,
    })
    expect(svg).toContain('textLength="945" lengthAdjust="spacingAndGlyphs"')
    expect(svg).toContain(`>${field.replaceAll(' ', () => nbsp)}</text>`)
  })
  test('keeps ordinary spaces in the terminal buffer and input', () => {
    const content = ' ai                  '
    const buffer = new TerminalBuffer(80, 24)
    buffer.write(content)
    expect(buffer.lines.get(0)!.values().map(cell => cell.text).toArray().join('')).toBe(content)
    const options = {content}
    vectorizeTerminal(options)
    expect(options.content).toBe(content)
    expect(content).not.toContain('\u{A0}')
  })
  test('preserves leading, interior and trailing spaces without double-escaping entities', () => {
    const svg = vectorizeTerminal(' <&>  &#xA0; ')
    expect(svg).toContain(`>${nbsp}&lt;&amp;&gt;${nbsp}${nbsp}&amp;#xA0;${nbsp}</text>`)
    expect(svg).not.toContain('&nbsp;')
    expect(svg).not.toContain('&amp;#xA0;dayjs')
  })
  test('ANSI style changes and tabs keep their padding', () => {
    const svg = vectorizeTerminal('a\t\u{1B}[31m b \u{1B}[0m c ')
    expect(svg).toContain(`>a${nbsp.repeat(7)}</text>`)
    expect(svg).toContain(`>${nbsp}b${nbsp}</text>`)
    expect(svg).toContain(`>${nbsp}c${nbsp}</text>`)
    expect(svg).toContain('x="390"')
  })
  test('whitespace-only cells still paint backgrounds and text decorations', () => {
    const svg = vectorizeTerminal('\u{1B}[41;4;9m    ')
    expect(svg).toContain('width="180" height="100" fill="#c50f1f"')
    expect(svg).toContain('data-text-decoration="underline"')
    expect(svg).toContain('data-text-decoration="strikethrough"')
    expect(svg).not.toContain(`${nbsp}</text>`)
  })
  test('rasterized padding positions the glyph without stretching it', () => {
    const image = rasterize(vectorizeTerminal({
      content: '   X        ',
      columns: 12,
      rows: 1,
      padding: 0,
    }))
    const pixels = image.pixels
    let left = Infinity
    let right = -1
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (!(pixels[(y * image.width + x) * 4]! > 80)) {
          continue
        }
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
    expect(left).toBeGreaterThanOrEqual(3 * 45)
    expect(right).toBeLessThan(4 * 45)
    expect(right - left).toBeGreaterThan(20)
  })
})
