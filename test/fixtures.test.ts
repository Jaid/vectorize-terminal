import {describe, expect, test} from 'bun:test'

import {Resvg} from '@resvg/resvg-js'

import render from '../src/main.ts'
import {exportImages, fixtureIds, loadFixture} from './helpers.ts'

// Native SVG parsing plus PNG exports exercise the complete rendering pipeline.
describe.each(fixtureIds)('%s fixture', id => {
  test('renders deterministically and exports valid SVG and PNG', async () => {
    const options = await loadFixture(id)
    const svg = render(options)
    expect(svg).toBe(render(options))
    expect(svg).not.toContain('\u{1B}')
    expect(svg).not.toMatch(/(?:Infinity|NaN|undefined)/u)
    const image = new Resvg(svg, {font: {loadSystemFonts: false}})
    expect([image.width, image.height]).toEqual([3660, 2660])
    // Hashes keep regression snapshots compact. Geometry/color tests cover semantics.
    const hasher = new Bun.CryptoHasher('sha256')
    expect(hasher.update(svg).digest('hex')).toMatchSnapshot()
    await exportImages(id, svg)
    const png = await Bun.file(`out/fixtures/${id}.png`).bytes()
    expect(png.subarray(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
  })
})
