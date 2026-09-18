import type {Layout, WindowsTerminalDecoration} from './types.ts'

import {plainText} from './ansi.ts'
import {escapeXml, number as n, segmenter} from './types.ts'

// Avoid requiring Uint8Array.toBase64 in the public runtime API.
const encoder = new TextEncoder
const encodeIcon = (svg: string): string => btoa(Array.from(encoder.encode(svg), byte => String.fromCodePoint(byte)).join(''))

/** Dark Windows Terminal chrome in the reference screenshot’s 39-unit coordinate system. */
export function renderDecoration(decoration: WindowsTerminalDecoration, layout: Layout): string {
  // Below normal desktop widths, shrink the controls rather than overlap them.
  const scale = Math.min(layout.headerHeight / 39, layout.width / 360)
  const width = layout.width / scale
  const top = layout.headerHeight / scale - 39
  if (scale <= 0 || !Number.isFinite(width) || !Number.isFinite(top)) {
    throw new RangeError('Decoration geometry exceeds the representable numeric range.')
  }
  const tabRight = Math.min(247, width - 205)
  const titleWidth = tabRight - 90
  const maxTitle = Math.max(1, Math.floor(titleWidth / 7))
  const graphemes = [...segmenter.segment(plainText(decoration.tabTitle))].map(item => item.segment)
  const title = graphemes.length > maxTitle ? `${graphemes.slice(0, maxTitle - 1).join('')}…` : graphemes.join('')
  const icon = decoration.tabIcon === undefined ? '<g transform="translate(16 13)"><path d="M1 1h5l2 2h7a1 1 0 0 1 1 1v10H0V2a1 1 0 0 1 1-1" fill="#d89e13"/><path d="M0 5h16l-1 9H0Z" fill="#fcd53f"/></g>' : `<image x="16" y="12" width="16" height="16" preserveAspectRatio="xMidYMid meet" href="data:image/svg+xml;base64,${encodeIcon(decoration.tabIcon)}"/>`
  return `<svg width="${n(layout.width)}" height="${n(layout.headerHeight)}" viewBox="0 0 ${n(layout.width)} ${n(layout.headerHeight)}" overflow="hidden" data-decoration="windowsTerminal">
<rect width="${n(layout.width)}" height="${n(layout.headerHeight)}" fill="#2e2e2e"/>
<g transform="scale(${n(scale)}) translate(0 ${n(top)})">
<path d="M0 39H${n(width)}" stroke="#292929"/>
<path d="M0 39H2Q7 39 7 34V15Q7 7 15 7H${n(tabRight - 8)}Q${n(tabRight)} 7 ${n(tabRight)} 15V34Q${n(tabRight)} 39 ${n(tabRight + 7)} 39Z" fill="#000000"/>
${icon}
<svg x="40" y="7" width="${n(titleWidth)}" height="30" viewBox="0 0 ${n(titleWidth)} 30" overflow="hidden"><text x="0" y="19" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="12">${escapeXml(title)}</text></svg>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M${n(tabRight - 26)} 17l6 6m0-6-6 6" stroke="#a0a0a0"/>
<path d="M${n(tabRight + 18)} 20h8m-4-4v8" stroke="#cccccc"/>
<path d="M${n(tabRight + 37)} 12v16" stroke="#454545"/>
<path d="M${n(tabRight + 46)} 18l4 4 4-4" stroke="#cccccc"/>
<g stroke="#ffffff">
<path d="M${n(width - 119)} 20h10"/>
<rect x="${n(width - 73)}" y="15" width="9" height="9"/>
<path d="M${n(width - 27)} 15l10 10m0-10-10 10"/>
</g></g></g></svg>`
}

export function validateDecoration(decoration: unknown): asserts decoration is WindowsTerminalDecoration {
  if (typeof decoration !== 'object' || decoration === null || !('type' in decoration) || decoration.type !== 'windowsTerminal') {
    throw new TypeError('decoration.type must be “windowsTerminal”.')
  }
  if (!('tabTitle' in decoration) || typeof decoration.tabTitle !== 'string') {
    throw new TypeError('decoration.tabTitle must be a string.')
  }
  if ('tabIcon' in decoration && decoration.tabIcon !== undefined && (typeof decoration.tabIcon !== 'string' || !/^\s*(?:<\?xml[^?]*\?>\s*)?<svg[\s>]/u.test(decoration.tabIcon))) {
    throw new TypeError('decoration.tabIcon must be a complete SVG document, not a URL.')
  }
}
