import {describe, expect, test} from 'bun:test'

import {applySgr, indexedColor, palette, tokenize} from '../src/ansi.ts'
import render from '../src/main.ts'
import {TerminalBuffer} from '../src/terminal/TerminalBuffer.ts'
import {colors, defaultStyle} from '../src/types.ts'

const cells = (input: string, columns = 80, rows = 24) => {
  const buffer = new TerminalBuffer(columns, rows)
  buffer.write(input)
  return [...buffer.lines].map(([row, line]) => ({
    row,
    cells: line.values().toArray().toSorted((a, b) => a.column - b.column),
  }))
}
const text = (input: string, columns = 80, rows = 24) => cells(input, columns, rows).map(line => line.cells.map(cell => cell.text).join(''))
const sgr = (parameters: string) => applySgr(parameters, defaultStyle())
describe('ANSI SGR', () => {
  test('all normal and bright foreground/background colors', () => {
    for (let index = 0; index < 16; index++) {
      const code = index < 8 ? index + 30 : index - 8 + 90
      expect(sgr(String(code)).foreground).toBe(palette[index])
      expect(sgr(String(code + 10)).background).toBe(palette[index])
      expect(indexedColor(index)).toBe(palette[index])
    }
  })
  test('the entire 256-color palette is valid', () => {
    for (let index = 0; index < 256; index++) {
      expect(indexedColor(index)).toMatch(/^#[\da-f]{6}$/u)
      expect(sgr(`38;5;${index}`).foreground).toBe(indexedColor(index))
      expect(sgr(`48;5;${index}`).background).toBe(indexedColor(index))
    }
    expect(indexedColor(16)).toBe('#000000')
    expect(indexedColor(21)).toBe('#0000ff')
    expect(indexedColor(196)).toBe('#ff0000')
    expect(indexedColor(231)).toBe('#ffffff')
    expect(indexedColor(232)).toBe('#080808')
    expect(indexedColor(255)).toBe('#eeeeee')
    for (const value of [-1, 256, 1.5, Infinity, NaN]) {
      expect(indexedColor(value)).toBeUndefined()
    }
  })
  test('truecolor and colon syntax', () => {
    for (const sequence of ['38;2;12;34;56', '38:2:12:34:56', '38:2::12:34:56', '38:2:0:12:34:56']) {
      expect(sgr(sequence).foreground).toBe('#0c2238')
    }
    expect(sgr('48:5:196').background).toBe('#ff0000')
    expect(sgr('48;2;1;2;3;1').background).toBe('#010203')
    expect(sgr('48;2;1;2;3;1').bold).toBe(true)
    expect(sgr('4:0').underline).toBe(false)
    expect(sgr('4:3').underline).toBe(true)
  })
  test('combined attributes and individual resets', () => {
    const style = sgr('1;2;3;4;7;8;9;31;44')
    for (const key of ['bold', 'dim', 'italic', 'underline', 'inverse', 'hidden', 'strikethrough'] as const) {
      expect(style[key]).toBe(true)
    }
    expect(applySgr('22;23;24;27;28;29;39;49', style)).toEqual(defaultStyle())
    expect(applySgr('', style)).toEqual(defaultStyle())
    expect(applySgr('0', style)).toEqual(defaultStyle())
    expect(colors(style)).toEqual(['#0037da', '#c50f1f'])
    expect(colors(sgr('7'))).toEqual(['#000000', '#cccccc'])
    expect(style.bold).toBe(true)
  })
  test('color resets preserve unrelated attributes', () => {
    expect(sgr('1;31;39').bold).toBe(true)
    expect(sgr('1;31;39').foreground).toBeUndefined()
    expect(sgr('31;1;22').foreground).toBe('#c50f1f')
    expect(sgr('31;48;2;2;3;4;49').background).toBeUndefined()
  })
  test('invalid/incomplete colors are ignored without becoming other SGR attributes', () => {
    for (const sequence of ['38;5;999', '38;5', '38;2;1;2', '38;2;1;2;999', '38:2:1:1:2:3', '38:5:', '38;5;', '48;2;1;;3']) {
      const style = sgr(sequence)
      expect(style.foreground).toBeUndefined()
      expect(style.background).toBeUndefined()
      expect(style.bold).toBe(false)
      expect(style.dim).toBe(false)
    }
    expect(sgr('58;2;1;2;3;31').foreground).toBe('#c50f1f')
    expect(sgr('999;1:5')).toEqual(defaultStyle())
  })
  test('styles persist across line breaks and are snapshots', () => {
    const result = cells('\u{1B}[31mA\nB\u{1B}[0mC')
    expect(result[0]!.cells[0]!.style.foreground).toBe('#c50f1f')
    expect(result[1]!.cells[0]!.style.foreground).toBe('#c50f1f')
    expect(result[1]!.cells[1]!.style.foreground).toBeUndefined()
  })
  test('bold, italic, dim, inverse and conceal reach SVG output', () => {
    const svg = render('\u{1B}[1;2;3;4;9mHi\u{1B}[0;8msecret')
    expect(svg).toContain('font-weight="700"')
    expect(svg).toContain('font-style="italic"')
    expect(svg).toContain('opacity="0.5"')
    expect(svg).toContain('data-text-decoration="underline"')
    expect(svg).toContain('data-text-decoration="strikethrough"')
    expect(svg).not.toContain('secret')
    expect(render('\u{1B}[7m ')).toContain('fill="#cccccc"')
  })
})
describe('control tokenizer', () => {
  test('OSC hyperlinks keep their labels, not their destinations', () => {
    expect(text('a\u{1B}]8;;https://example.com\u{1B}\\label\u{1B}]8;;\u{1B}\\b')).toEqual(['alabelb'])
    expect(text('a\u{1B}]0;hidden title\u{7}b')).toEqual(['ab'])
    expect(text('a\u{9D}hidden\u{9C}b')).toEqual(['ab'])
  })
  test('unsupported CSI, DCS, charset and single ESC sequences do not leak', () => {
    expect(text('a\u{1B}[?25l\u{1B}[2J\u{1B}Ppayload\u{1B}\\\u{1B}(B\u{1B}7b')).toEqual(['ab'])
    expect(text('a\u{90}payload\u{9C}b\u{98}payload\u{9C}c\u{1B}^payload\u{1B}\\d')).toEqual(['abcd'])
    expect(text('a\u{0}\u{7}\u{7F}b')).toEqual(['ab'])
    expect(cells('\u{9B}31mR')[0]!.cells[0]!.style.foreground).toBe('#c50f1f')
  })
  test('truncated controls are safely consumed and invalid CSI recovers', () => {
    for (const suffix of ['\u{1B}', '\u{1B}[', '\u{1B}[38;2', '\u{1B}]unterminated', '\u{1B}Punterminated', '\u{1B}(']) {
      expect(text(`a${suffix}`)).toEqual(['a'])
    }
    expect(text('a\u{1B}[31\nb')).toEqual(['a', 'b'])
    expect([...tokenize('a\u{1B}[1 qz')]).toEqual([{
      type: 'text',
      value: 'a',
    }, {
      type: 'text',
      value: 'z',
    }])
  })
})
describe('cell layout', () => {
  test('wraps at the right edge without adding a second newline', () => {
    expect(text('abcdX', 4)).toEqual(['abcd', 'X'])
    expect(text('abcd\nX', 4)).toEqual(['abcd', 'X'])
    expect(text('abcd\u{1B}[31mX', 4)).toEqual(['abcd', 'X'])
    expect(text('abcd\nX\nignored', 4, 2)).toEqual(['abcd', 'X'])
    expect(cells('\n\nA', 4)[0]!.row).toBe(2)
    expect(text('', 4)).toEqual([])
  })
  test('preserves spaces, supports CRLF, overwrite and backspace', () => {
    expect(text('ab\r\ncd')).toEqual(['ab', 'cd'])
    expect(text('abcd\rXY')).toEqual(['XYcd'])
    expect(text('ab\bC')).toEqual(['aC'])
    expect(text('\bA')).toEqual(['A'])
    expect(text(' a  b ')).toEqual([' a  b '])
    expect(text('abcd\rZ', 4)).toEqual(['Zbcd'])
  })
  test('tab stops every eight cells wrap like spaces', () => {
    expect(text('a\tb')).toEqual(['a       b'])
    expect(text('\tX', 4)).toEqual(['    ', '    ', 'X'])
    expect(text('\tX', 4, 1)).toEqual(['    '])
  })
  test('Unicode graphemes, CJK and emoji use terminal display width', () => {
    const line = cells('e\u{301}界👩‍💻X')[0]!.cells
    expect(line.map(cell => [cell.text, cell.column, cell.width])).toEqual([['é', 0, 1], ['界', 1, 2], ['👩‍💻', 3, 2], ['X', 5, 1]])
    expect(text('abc界', 4)).toEqual(['abc', '界'])
    expect(text('界', 1)).toEqual(['�'])
    expect(text('e\u{1B}[31m\u{301}')).toEqual(['é'])
    expect(text('\u{301}A')).toEqual(['A'])
  })
  test('overwriting either half of a wide glyph clears it', () => {
    expect(text('界\bX')).toEqual(['X'])
    expect(cells('界\bX')[0]!.cells[0]!.column).toBe(1)
    expect(text('界\rX')).toEqual(['X'])
    expect(text('abc\r界')).toEqual(['界c'])
  })
  test('clipped content cannot paint into padding or decoration', () => {
    const svg = render({
      content: 'A\nB\nC',
      rows: 1,
      columns: 1,
    })
    expect(svg).toContain('>A</text>')
    expect(svg).not.toContain('>B</text>')
    expect(svg).not.toContain('>C</text>')
    expect(svg).toContain('overflow="hidden" data-terminal="true"')
  })
})
