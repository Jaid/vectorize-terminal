import type {Page} from 'playwright'

import assert from 'node:assert/strict'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import fs from 'fs-extra'
import {chromium} from 'playwright'

import vectorizeTerminal from '../src/main.ts'

// Kept separate from bun test: the ordinary suite needs no installed browser.
// Provision Chromium with `bun x playwright install chromium`, or set BROWSER_PATH.
await import('./export-fixtures.ts')
const root = resolve(import.meta.dirname, '..')
const outdir = join(root, 'out/browser')
await fs.mkdir(outdir, {recursive: true})
const assets = new Map<string, string>
const fixtures = new Bun.Glob('*.svg')
for await (const file of fixtures.scan({cwd: join(root, 'out/fixtures')})) {
  assets.set(`/fixtures/${file}`, await Bun.file(join(root, 'out/fixtures', file)).text())
}
const maliciousIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" onload="document.documentElement.setAttribute(\'data-icon-executed\',\'yes\')"><script>document.documentElement.setAttribute("data-icon-executed","yes")</script><rect width="16" height="16" fill="#ff0000"/></svg>'
assets.set('/icon-safety.svg', vectorizeTerminal({
  content: 'Safe icon',
  rows: 2,
  decoration: {
    type: 'windowsTerminal',
    tabTitle: 'Icon',
    tabIcon: maliciousIcon,
  },
}))
assets.set('/old-whitespace.svg', assets.get('/fixtures/whitespace.svg')!.replaceAll('&#xA0;', ' '))
const bundle = await Bun.build({
  entrypoints: [join(root, 'src/main.ts')],
  target: 'browser',
  format: 'esm',
})
if (!bundle.success) {
  throw new AggregateError(bundle.logs, 'Browser bundle failed')
}
const library = await bundle.outputs[0]!.text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname
    if (path === '/library.js') {
      return new Response(library, {headers: {'Content-Type': 'text/javascript'}})
    }
    if (assets.has(path)) {
      return new Response(assets.get(path), {headers: {'Content-Type': 'image/svg+xml'}})
    }
    if (path === '/') {
      return new Response('<!doctype html><meta charset="utf-8"><title>vectorize-terminal checks</title><style>body{margin:0}img{display:block}</style><main id="stage"></main>', {headers: {'Content-Type': 'text/html'}})
    }
    return new Response('Not found', {status: 404})
  },
})
const checks: Array<string> = []
const urlFor = (path: string) => {
  const url = new URL(path, server.url)
  return url.href
}
async function paddingMetrics(page: Page) {
  return page.evaluate(() => {
    const names = ['ai', 'dayjs', 'es-toolkit', '@opencode-ai/sdk']
    const nodes = [...document.querySelectorAll<SVGTextElement>('[data-layer="text"] text')]
    return names.map(name => {
      const node = nodes.find(element => element.textContent.replaceAll('\u{A0}', ' ').trim() === name)
      if (!node) {
        throw new Error(`Missing padded field ${name}`)
      }
      const text = node.textContent
      const index = text.indexOf(name)
      const x = node.x.baseVal.getItem(0).value
      const characters = node.getNumberOfChars()
      const renderedIndex = Math.max(0, Math.min(index, characters - name.length))
      const first = node.getStartPositionOfChar(renderedIndex).x
      const end = node.getEndPositionOfChar(renderedIndex + name.length - 1).x
      return {
        name,
        first,
        end,
        expectedFirst: x + index * 45,
        expectedEnd: x + (index + name.length) * 45,
        characters,
      }
    })
  })
}
function verifyPadding(metrics: Awaited<ReturnType<typeof paddingMetrics>>) {
  for (const metric of metrics) {
    assert.equal(metric.characters, 21, `${metric.name}: padding was discarded`)
    assert.ok(Math.abs(metric.first - metric.expectedFirst) < 1, `${metric.name}: first glyph moved`)
    assert.ok(Math.abs(metric.end - metric.expectedEnd) < 1, `${metric.name}: glyphs stretched`)
  }
}
try {
  await using browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH,
    headless: true,
  })
  const page = await browser.newPage({
    viewport: {
      width: 1100,
      height: 1000,
    },
    deviceScaleFactor: 1,
  })
  for (const path of assets.keys()) {
    if (!path.startsWith('/fixtures/')) {
      continue
    }
    await page.goto(urlFor(path))
    assert.equal(await page.locator('parsererror').count(), 0, `${path}: XML parse error`)
    assert.equal(await page.locator('svg').first().getAttribute('role'), 'img')
  }
  checks.push('All exported SVGs load without XML errors')
    // Test the exact file:// workflow that exposed the original bug, not just HTML.
  await page.goto(pathToFileURL(join(root, 'out/fixtures/isup-full.svg')).href)
  const standalone = await paddingMetrics(page)
  verifyPadding(standalone)
  checks.push('Padded isup-full fields retain exact cell advances in standalone SVG')
  await page.goto(urlFor('/old-whitespace.svg'))
  const negativeControl = await paddingMetrics(page)
  const negativeControlMaxError = Math.max(...negativeControl.flatMap(metric => [Math.abs(metric.first - metric.expectedFirst), Math.abs(metric.end - metric.expectedEnd)]))
  await page.goto(server.url.href)
  const inlineSvg = assets.get('/fixtures/whitespace.svg')!
  await page.locator('#stage').evaluate((element, svg) => {
    element.innerHTML = svg
  }, inlineSvg)
  verifyPadding(await paddingMetrics(page))
  checks.push('Inline SVG retains padded cell advances')
  await page.goto(urlFor('/icon-safety.svg'))
  assert.equal(await page.locator('script').count(), 0)
  assert.equal(await page.locator('svg').first().getAttribute('data-icon-executed'), null)
  const iconHref = await page.locator('image').getAttribute('href')
  assert.ok(iconHref?.startsWith('data:image/svg+xml;base64,'))
  checks.push('Custom SVG icon stays isolated from the outer document')
  await page.goto(server.url.href)
  const rendered = await page.evaluate(async url => {
    const browserLibrary = await import(url) as typeof import('../src/main.ts')
    const options = {
      content: ' e\u{301}界👩‍💻 \u{1B}[31mred \u{1B}[0m',
      rows: 3,
    }
    return {
      namedMatchesDefault: browserLibrary.default === browserLibrary.vectorizeTerminal,
      svg: browserLibrary.default(options),
    }
  }, urlFor('/library.js'))
  assert.equal(rendered.namedMatchesDefault, true)
  assert.equal(rendered.svg, vectorizeTerminal({
    content: ' e\u{301}界👩‍💻 \u{1B}[31mred \u{1B}[0m',
    rows: 3,
  }))
  checks.push('Browser bundle produces byte-identical output to Bun')
  await page.locator('#stage').evaluate((element, svg) => {
    element.innerHTML = svg + svg
  }, inlineSvg)
  assert.equal(await page.locator('[id]').count(), 1) // only the HTML stage
  assert.equal(await page.locator('[data-terminal]').count(), 2)
  checks.push('Multiple inline screenshots introduce no shared IDs')
  for (const name of ['isup-full', 'whitespace', 'styles', 'unicode']) {
    await page.goto(server.url.href)
    const dimensions = await page.evaluate(async src => {
      const image = new Image
      image.src = src
      image.width = 960
      document.querySelector('#stage')!.append(image)
      await image.decode()
      return [image.naturalWidth, image.naturalHeight]
    }, urlFor(`/fixtures/${name}.svg`))
    assert.ok(dimensions[0]! > 0 && dimensions[1]! > 0)
    await page.locator('img').screenshot({path: join(outdir, `${name}.png`)})
  }
  checks.push('Image embedding decodes and produces four browser PNG previews')
  const report = {
    browser: browser.version(),
    executable: process.env.BROWSER_PATH ?? 'Playwright Chromium',
    checks,
    standalone,
    negativeControlMaxError,
  }
  await Bun.write(join(outdir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.info(JSON.stringify(report, null, 2))
} finally {
  await server.stop(true)
}
