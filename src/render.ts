import type {Cell, Layout, Line} from './types.ts'

import {background, colors, escapeXml, number as n} from './types.ts'

// XML escaping comes first: literal entity-like input must remain literal text.
// NBSP keeps leading/trailing padding in browser textLength measurement.
// This is serialization only; the terminal buffer still stores ordinary spaces.
const escapeTerminalText = (text: string): string => escapeXml(text).replaceAll(' ', '&#xA0;')

type Run = Cell & {key: string}

const runs = function *(line: Line): Generator<Run> {
  let run: Run | undefined
  for (const cell of line.values().toArray().toSorted((a, b) => a.column - b.column)) {
    const key = JSON.stringify(cell.style)
    // Keep Unicode grapheme clusters intact and independently positioned. ASCII runs
    // reduce SVG size while retaining monospace advances and disabling ligatures.
    const simple = /^[\u{20}-\u{7E}]+$/u.test(cell.text)
    if (run && simple && /^[\u{20}-\u{7E}]+$/u.test(run.text) && run.key === key && run.column + run.width === cell.column) {
      run.text += cell.text
      run.width += cell.width
    } else {
      if (run) {
        yield run
      }
      run = {
        ...cell,
        key,
      }
    }
  }
  if (run) {
    yield run
  }
}

export function renderContent(lines: Map<number, Line>, layout: Layout): string {
  const backgrounds: Array<string> = []
  const glyphs: Array<string> = []
  const {cellWidth, cellHeight, padding, headerHeight} = layout
  for (const [row, line] of lines) {
    for (const run of runs(line)) {
      const x = padding + run.column * cellWidth
      const y = headerHeight + padding + row * cellHeight
      const width = run.width * cellWidth
      const [fg, bg] = colors(run.style)
      if (bg !== background) {
        backgrounds.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(cellHeight)}" fill="${bg}"/>`)
      }
      if (run.style.hidden) {
        continue
      }
      const opacity = run.style.dim ? ' opacity="0.5"' : ''
      if (run.text.trim() !== '') {
        glyphs.push(`<text x="${n(x)}" y="${n(y + cellHeight * 0.76)}" textLength="${n(width)}" lengthAdjust="spacingAndGlyphs" fill="${fg}"${run.style.bold ? ' font-weight="700"' : ''}${run.style.italic ? ' font-style="italic"' : ''}${opacity}>${escapeTerminalText(run.text)}</text>`)
      }
      for (const [enabled, offset, kind] of [[run.style.underline, 0.89, 'underline'], [run.style.strikethrough, 0.49, 'strikethrough']] as const) {
        if (enabled) {
          glyphs.push(`<path data-text-decoration="${kind}" d="M${n(x)} ${n(y + cellHeight * offset)}h${n(width)}" stroke="${fg}" stroke-width="${n(cellHeight * 0.035)}"${opacity}/>`)
        }
      }
    }
  }
  // A nested SVG viewport supplies clipping without global IDs that could collide
  // when several screenshots are inserted inline into the same document.
  return `<svg x="${n(padding)}" y="${n(headerHeight + padding)}" width="${n(layout.contentWidth)}" height="${n(layout.contentHeight)}" viewBox="${n(padding)} ${n(headerHeight + padding)} ${n(layout.contentWidth)} ${n(layout.contentHeight)}" overflow="hidden" data-terminal="true">
<g data-layer="backgrounds">${backgrounds.join('')}</g>
<g data-layer="text" font-family="JetBrains Mono, monospace" font-size="${n(cellHeight * 0.75)}" font-weight="400" font-variant-ligatures="none" style="font-feature-settings: 'liga' 0, 'calt' 0; white-space: pre" xml:space="preserve">${glyphs.join('')}</g>
</svg>`
}

export function renderGrid(layout: Layout): string {
  const {padding, headerHeight, cellWidth, cellHeight, columns, rows, contentWidth, contentHeight} = layout
  // A nested, self-contained pattern is avoided: no IDs means safe inline composition.
  const commands: Array<string> = []
  for (let column = 0; column <= columns; column++) {
    commands.push(`M${n(padding + column * cellWidth)} ${n(headerHeight)}v${n(layout.height - headerHeight)}`)
  }
  for (let row = 0; row <= rows; row++) {
    commands.push(`M0 ${n(headerHeight + padding + row * cellHeight)}h${n(layout.width)}`)
  }
  return `<svg x="0" y="${n(headerHeight)}" width="${n(layout.width)}" height="${n(layout.height - headerHeight)}" viewBox="0 ${n(headerHeight)} ${n(layout.width)} ${n(layout.height - headerHeight)}" overflow="hidden" data-grid="true"><path d="${commands.join('')}" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="${n(Math.min(cellWidth, cellHeight) / 45)}"/><rect x="${n(padding)}" y="${n(headerHeight + padding)}" width="${n(contentWidth)}" height="${n(contentHeight)}" fill="none" stroke="#61d6d6" stroke-opacity="0.35" stroke-width="${n(Math.min(cellWidth, cellHeight) / 45)}"/></svg>`
}

