/* eslint-disable unicorn/prefer-code-point -- Escape grammar is ASCII; indexes deliberately count UTF-16 code units. */
import type {Style} from './types.ts'

import {defaultStyle} from './types.ts'

// Windows Terminal’s Campbell palette, followed by the standard xterm color cube.
export const palette = [
  '#0c0c0c',
  '#c50f1f',
  '#13a10e',
  '#c19c00',
  '#0037da',
  '#881798',
  '#3a96dd',
  '#cccccc',
  '#767676',
  '#e74856',
  '#16c60c',
  '#f9f1a5',
  '#3b78ff',
  '#b4009e',
  '#61d6d6',
  '#f2f2f2',
] as const
const byte = (value: number | undefined): value is number => value !== undefined && Number.isInteger(value) && value >= 0 && value <= 255
const rgb = (values: Array<number>): string | undefined => {
  if (values.length !== 3 || !values.every(byte)) {
    return undefined
  }
  return `#${values.map(value => value.toString(16).padStart(2, '0')).join('')}`
}

export type Token = {
  type: 'control' | 'sgr' | 'text'
  value: string
}

export function indexedColor(index: number): string | undefined {
  if (!byte(index)) {
    return undefined
  }
  if (index < 16) {
    return palette[index]
  }
  if (index >= 232) {
    const gray = 8 + (index - 232) * 10
    return rgb([gray, gray, gray])
  }
  const value = index - 16
  const levels = [0, 95, 135, 175, 215, 255]
  return rgb([levels[Math.floor(value / 36)]!, levels[Math.floor(value / 6) % 6]!, levels[value % 6]!])
}

/** Return a new style so already-painted cells are never mutated by later SGR. */
export function applySgr(parameters: string, previous: Style): Style {
  let style = {...previous}
  const groups = parameters.split(';')
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!
    const parts = group.split(':')
    const code = Number(parts[0] || 0)
    if ([38, 48, 58].includes(code)) {
      let color: string | undefined
      if (parts.length > 1) {
        const mode = Number(parts[1])
        if (mode === 5 && parts.length === 3 && parts[2] !== '') {
          color = indexedColor(Number(parts[2]))
        }
        if (mode === 2) {
          // ISO form includes an optional color-space ID. Only default/RGB is supported.
          let values: Array<string> = []
          if (parts.length === 6 && (parts[2] === '' || parts[2] === '0')) {
            values = parts.slice(3)
          } else if (parts.length === 5) {
            values = parts.slice(2)
          }
          if (values.every(value => value !== '')) {
            color = rgb(values.map(Number))
          }
        }
      } else {
        const mode = Number(groups[++i])
        const count = ({
          5: 1,
          2: 3,
        } as Record<number, number>)[mode] ?? 0
        const values = groups.slice(i + 1, i + 1 + count)
        i += count
        if (values.length === count && values.every(value => /^\d+$/u.test(value))) {
          if (mode === 5) {
            color = indexedColor(Number(values[0]))
          }
          if (mode === 2) {
            color = rgb(values.map(Number))
          }
        }
      }
      // Consume underline colors even though separate underline colors are not rendered.
      if (color && code !== 58) {
        style[code === 38 ? 'foreground' : 'background'] = color
      }
      continue
    }
    if (parts.length > 1 && code !== 4) {
      continue
    }
    if (code === 0) {
      style = defaultStyle()
    } else if (code === 1) {
      style.bold = true
    } else if (code === 2) {
      style.dim = true
    } else if (code === 3) {
      style.italic = true
    } else if (code === 4) {
      style.underline = parts[1] !== '0'
    } else if (code === 7) {
      style.inverse = true
    } else if (code === 8) {
      style.hidden = true
    } else if (code === 9) {
      style.strikethrough = true
    } else if (code === 22) {
      style.bold = false
      style.dim = false
    } else if (code === 23) {
      style.italic = false
    } else if (code === 24) {
      style.underline = false
    } else if (code === 27) {
      style.inverse = false
    } else if (code === 28) {
      style.hidden = false
    } else if (code === 29) {
      style.strikethrough = false
    } else if (code === 39) {
      style.foreground = undefined
    } else if (code === 49) {
      style.background = undefined
    } else if (code >= 30 && code <= 37) {
      style.foreground = palette[code - 30]
    } else if (code >= 40 && code <= 47) {
      style.background = palette[code - 40]
    } else if (code >= 90 && code <= 97) {
      style.foreground = palette[code - 90 + 8]
    } else if (code >= 100 && code <= 107) {
      style.background = palette[code - 100 + 8]
    }
  }
  return style
}

/** Consume unsupported terminal controls as units instead of leaking their payload into text. */
export function *tokenize(content: string): Generator<Token> {
  let index = 0
  while (index < content.length) {
    const start = index
    const code = content.charCodeAt(index)
    if (code >= 32 && !(code >= 127 && code <= 159)) {
      do {
        index++
      } while (index < content.length && !/[\u{0}-\u{1F}\u{7F}-\u{9F}]/u.test(content[index]!))
      yield {
        type: 'text',
        value: content.slice(start, index),
      }
      continue
    }
    index++
    if ([8, 9, 10, 13].includes(code)) {
      yield {
        type: 'control',
        value: content[start]!,
      }
      continue
    }
    let introducer = code
    if (code === 27) {
      if (index === content.length) {
        break
      }
      introducer = content.charCodeAt(index++)
    }
    if (introducer === 155 || code === 27 && introducer === 91) {
      const parameterStart = index
      while (index < content.length && /[\u{30}-\u{3F}]/u.test(content[index]!)) {
        index++
      }
      const parameters = content.slice(parameterStart, index)
      const intermediateStart = index
      while (index < content.length && /[\u{20}-\u{2F}]/u.test(content[index]!)) {
        index++
      }
      if (index < content.length && /[\u{40}-\u{7E}]/u.test(content[index]!)) {
        if (content[index] === 'm' && index === intermediateStart && /^[\d:;]*$/u.test(parameters)) {
          yield {
            type: 'sgr',
            value: parameters,
          }
        }
        index++
      }
    } else if ([144, 152, 157, 158, 159].includes(introducer) || code === 27 && [80, 88, 93, 94, 95].includes(introducer)) {
      const osc = introducer === 157 || introducer === 93
      while (index < content.length) {
        if (content.charCodeAt(index) === 156 || osc && content.charCodeAt(index) === 7) {
          index++
          break
        }
        if (content[index] === '\u{1B}' && content[index + 1] === '\\') {
          index += 2
          break
        }
        index++
      }
    } else if (code === 27 && introducer >= 32 && introducer <= 47) {
      // ESC intermediate sequences, for example charset selection ESC ( B.
      while (index < content.length && /[\u{20}-\u{2F}]/u.test(content[index]!)) {
        index++
      }
      if (index < content.length && /[\u{30}-\u{7E}]/u.test(content[index]!)) {
        index++
      }
    }
  }
}

export function plainText(content: string): string {
  return [...tokenize(content)].filter(token => token.type === 'text').map(token => token.value).join('')
}
