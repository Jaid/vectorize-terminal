import type {Options} from '../src/main.ts'

import {describe, expect, test} from 'bun:test'

import render, {vectorizeTerminal} from '../src/main.ts'
import {pixel, rasterize} from './helpers.ts'

const size = (svg: string) => /^<svg[^>]*width="([^"]+)" height="([^"]+)"/.exec(svg)?.slice(1)
describe('public API and layout', () => {
  test('default and named exports match, including string shorthand', () => {
    expect(render).toBe(vectorizeTerminal)
    expect(render('echo hi\nhi')).toBe(render({content: 'echo hi\nhi'}))
    expect(size(render())).toEqual(['3660', '2460'])
    expect(render()).toBe(render({}))
    expect(render('x')).toContain('font-family="JetBrains Mono, monospace"')
    expect(render('x')).not.toContain('data-decoration')
  })
  test('decoration adds exactly two rows, not extra padding', () => {
    expect(size(render({decoration: {
      type: 'windowsTerminal',
      tabTitle: 'Desktop',
    }}))).toEqual(['3660', '2660'])
    expect(size(render({
      columns: 10,
      rows: 3,
      padding: 2.5,
      cellWidth: 9,
      cellHeight: 20,
      decoration: {
        type: 'windowsTerminal',
        tabTitle: 'Tiny',
      },
    }))).toEqual(['95', '105'])
    expect(size(render({
      columns: 1,
      rows: 1,
      padding: 0,
      cellWidth: 0.001,
      cellHeight: 0.002,
    }))).toEqual(['0.001', '0.002'])
  })
  test('debug grid aliases and precedence', () => {
    expect(render({grid: true})).toBe(render({debug: {grid: true}}))
    expect(render({grid: true})).toContain('data-grid="true"')
    expect(render({
      grid: true,
      debug: {grid: false},
    })).not.toContain('data-grid')
    expect(() => render({
      columns: 100_000,
      grid: true,
    })).toThrow(RangeError)
  })
  test('does not mutate caller-owned options or leak state between calls', () => {
    const options = Object.freeze({
      content: '\u{1B}[31mred',
      debug: Object.freeze({grid: true}),
    })
    const first = render(options)
    render('\u{1B}[32mgreen')
    expect(render(options)).toBe(first)
    expect(render('plain')).not.toContain('#c50f1f')
  })
  test.each(['columns', 'rows'] as const)('%s must be a positive safe integer', key => {
    for (const value of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => render({[key]: value})).toThrow(RangeError)
    }
  })
  test.each(['cellWidth', 'cellHeight', 'padding'] as const)('%s rejects invalid geometry', key => {
    for (const value of [-1, NaN, Infinity]) {
      expect(() => render({[key]: value})).toThrow(RangeError)
    }
    if (key !== 'padding') {
      expect(() => render({[key]: 0})).toThrow(RangeError)
    }
    expect(() => render({[key]: null})).toThrow(TypeError)
  })
  test('runtime validation is useful to JavaScript callers', () => {
    for (const input of [null, [], 3, true, {content: 2}, {grid: 'yes'}, {debug: null}, {debug: {grid: 2}}, {decoration: null}, {decoration: {}}, {decoration: {
      type: 'windowsTerminal',
      tabTitle: 0,
    }}, {decoration: {
      type: 'windowsTerminal',
      tabTitle: 'x',
      tabIcon: 'https://example.com/a.svg',
    }}]) {
      expect(() => render(input as Options)).toThrow(TypeError)
    }
    expect(() => render({cellHeight: Number.MAX_VALUE})).toThrow(RangeError)
  })
})
describe('safe standalone SVG', () => {
  test('escapes markup, invalid XML characters and unpaired surrogates', () => {
    const svg = render({
      content: '<script>&"\'\u{D800}\u{FFFE}',
      decoration: {
        type: 'windowsTerminal',
        tabTitle: '<>&"\'\u{D800}',
      },
    })
    expect(svg).toContain('&lt;script&gt;&amp;&quot;&apos;')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('�')
    expect(() => rasterize(svg, 400)).not.toThrow()
  })
  test('SVG icons are isolated images, never injected into the outer document', () => {
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" fill="red"/></svg>'
    const svg = render({decoration: {
      type: 'windowsTerminal',
      tabTitle: '💻 Desktop',
      tabIcon: icon,
    }})
    expect(svg).toContain('href="data:image/svg+xml;base64,')
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('alert(1)')
    expect(svg).not.toContain('id=')
    expect(() => rasterize(svg, 400)).not.toThrow()
  })
  test('long titles and tiny windows remain valid', () => {
    const svg = render({
      columns: 1,
      rows: 1,
      decoration: {
        type: 'windowsTerminal',
        tabTitle: 'Desktop'.repeat(100),
      },
    })
    expect(svg).toContain('…')
    expect(svg).not.toMatch(/(?:Infinity|NaN)/u)
    expect(() => rasterize(svg, 200)).not.toThrow()
  })
})
describe('rasterized geometry', () => {
  test('background cells occupy exactly their allotted space, including spaces', () => {
    const image = rasterize(render({
      content: '\u{1B}[41m  \u{1B}[0mX',
      columns: 3,
      rows: 1,
      padding: 5,
      cellWidth: 20,
      cellHeight: 40,
    }))
    expect([image.width, image.height]).toEqual([70, 50])
    expect(pixel(image, 4, 5)).toEqual([0, 0, 0, 255])
    expect(pixel(image, 5, 5)).toEqual([197, 15, 31, 255])
    expect(pixel(image, 44, 44)).toEqual([197, 15, 31, 255])
    expect(pixel(image, 45, 5)).toEqual([0, 0, 0, 255])
    expect(pixel(image, 5, 45)).toEqual([0, 0, 0, 255])
  })
  test('text actually renders, while padding remains untouched', () => {
    const image = rasterize(render({
      content: 'Hello!',
      columns: 6,
      rows: 1,
      padding: 10,
      cellWidth: 18,
      cellHeight: 40,
    }))
    let lit = 0
    const pixels = image.pixels
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const red = pixels[(y * image.width + x) * 4]!
        if (x < 10 || x >= 118 || y < 10 || y >= 50) {
          expect(red).toBe(0)
        } else if (red) {
          lit++
        }
      }
    }
    expect(lit).toBeGreaterThan(300)
  })
  test('chrome colors match the reference and the terminal begins below it', () => {
    const image = rasterize(render({
      content: '\u{1B}[41m ',
      columns: 80,
      rows: 1,
      padding: 6,
      cellWidth: 9,
      cellHeight: 20,
      decoration: {
        type: 'windowsTerminal',
        tabTitle: 'Desktop',
      },
    }))
    expect(pixel(image, 500, 1)).toEqual([46, 46, 46, 255])
    expect(pixel(image, 500, 40)).toEqual([0, 0, 0, 255])
    expect(pixel(image, 6, 46)).toEqual([197, 15, 31, 255])
  })
  test('underline and strikethrough render even on blank cells', () => {
    const image = rasterize(render({
      content: '\u{1B}[4;9m ',
      columns: 1,
      rows: 1,
      padding: 0,
    }))
    expect(pixel(image, 20, 49)[0]).toBeGreaterThan(100)
    expect(pixel(image, 20, 89)[0]).toBeGreaterThan(100)
    expect(pixel(image, 20, 20)[0]).toBe(0)
  })
  test('grid overlays the whole body but not the decoration', () => {
    const options: Options = {
      content: '\u{1B}[41m ',
      columns: 2,
      rows: 1,
      padding: 5,
      cellWidth: 20,
      cellHeight: 40,
      decoration: {
        type: 'windowsTerminal',
        tabTitle: 'Grid',
      },
    }
    const plain = rasterize(render(options))
    const grid = rasterize(render({
      ...options,
      grid: true,
    }))
    expect(pixel(grid, 5, 82)).not.toEqual(pixel(plain, 5, 82))
    expect(pixel(grid, 20, 10)).toEqual(pixel(plain, 20, 10))
  })
})
