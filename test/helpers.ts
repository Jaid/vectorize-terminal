import type {Options} from '../src/main.ts'

import {join} from 'node:path'

import {Resvg} from '@resvg/resvg-js'
import fs from 'fs-extra'

export const fontFiles = ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(face => join(import.meta.dirname, `font/JetBrainsMono-${face}.ttf`))
export const fixtureFolder = join(import.meta.dirname, 'fixture')
const entries = await fs.readdir(fixtureFolder, {withFileTypes: true})
export const fixtureIds = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).toSorted()

export async function loadFixture(id: string): Promise<Options> {
  const {default: config} = await import(join(fixtureFolder, id, 'config.ts')) as {default: Options}
  return {
    ...config,
    content: await Bun.file(join(fixtureFolder, id, 'content.txt')).text(),
  }
}

export function rasterize(svg: string, width?: number) {
  const renderer = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles,
      defaultFontFamily: 'JetBrains Mono',
      sansSerifFamily: 'JetBrains Mono',
      monospaceFamily: 'JetBrains Mono',
    },
    ...width === undefined ? {} : {fitTo: {
      mode: 'width' as const,
      value: width,
    }},
  })
  return renderer.render()
}

export function pixel(image: ReturnType<typeof rasterize>, x: number, y: number): Array<number> {
  const index = (y * image.width + x) * 4
  return [...image.pixels.subarray(index, index + 4)]
}

export async function exportImages(id: string, svg: string): Promise<void> {
  await Bun.write(`out/fixtures/${id}.svg`, svg)
  await Bun.write(`out/fixtures/${id}.png`, rasterize(svg, 960).asPng())
}
