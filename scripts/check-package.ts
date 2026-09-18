import type {Options} from '../src/main.ts'

import assert from 'node:assert/strict'
import {join, resolve} from 'node:path'

import fs from 'fs-extra'

import vectorizeTerminal from '../src/main.ts'

const root = resolve(import.meta.dirname, '..')
const node = process.env.NODE_BIN ?? Bun.which('node')
if (!node) {
  throw new Error('Node.js 22+ is required for this check. Set NODE_BIN to choose its executable.')
}
await fs.ensureDir(join(root, 'temp'))
const directory = await fs.mkdtemp(join(root, 'temp/package-check-'))
const consumer = join(directory, 'consumer')
await fs.ensureDir(consumer)
const run = async (command: Array<string>, cwd: string, input = '') => {
  const child = Bun.spawn(command, {
    cwd,
    stdin: new Blob([input]),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const output = new Response(child.stdout)
  const errors = new Response(child.stderr)
  const [stdout, stderr, code] = await Promise.all([output.text(), errors.text(), child.exited])
  if (code !== 0) {
    throw new Error(`${command.join(' ')} exited with ${code}\n${stdout}\n${stderr}`)
  }
  return {
    stdout,
    stderr,
  }
}
// Packing runs the normal prepack checks, including a fresh production build.
const packed = await run([process.execPath, 'pm', 'pack', '--destination', directory], root)
console.info(packed.stdout)
const entries = await fs.readdir(directory)
const archive = entries.find(entry => entry.endsWith('.tgz'))
assert.ok(archive, 'No package archive was produced')
await Bun.write(join(consumer, 'package.json'), JSON.stringify({
  name: 'vectorize-terminal-consumer-check',
  private: true,
  type: 'module',
  dependencies: {'vectorize-terminal': `file:${join(directory, archive).replaceAll('\\', '/')}`},
}, null, 2))
await run([process.execPath, 'install', '--ignore-scripts'], consumer)
const cases: Array<Options> = [
  {},
  {
    content: ' ai                  ',
    columns: 21,
    rows: 1,
  },
  {content: 'e\u{301}界👩‍💻X\n\u{1B}[31mred\u{1B}[0m'},
  {
    content: '界\bX',
    decoration: {
      type: 'windowsTerminal',
      tabTitle: 'Unicode',
      tabIcon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="0" y="8">✓</text></svg>',
    },
  },
]
await Bun.write(join(consumer, 'cases.json'), JSON.stringify(cases.map(options => ({
  options,
  expected: vectorizeTerminal(options),
}))))
await Bun.write(join(consumer, 'consumer.mjs'), `import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import render, {vectorizeTerminal} from 'vectorize-terminal'
assert.equal(render, vectorizeTerminal)
const cases = JSON.parse(readFileSync(new URL('cases.json', import.meta.url), 'utf8'))
for (const {options, expected} of cases) assert.equal(render(options), expected)
console.log(JSON.stringify({engine: process.versions.bun ? 'Bun' : 'Node', version: process.versions.bun ?? process.version, cases: cases.length}))
`)
await Bun.write(join(consumer, 'consumer.ts'), `import render, {vectorizeTerminal, type Options, type WindowsTerminalDecoration} from 'vectorize-terminal'
const decoration: WindowsTerminalDecoration = {type: 'windowsTerminal', tabTitle: 'Type check'}
const options: Options = {content: 'ok', rows: 2, decoration}
export const svg: string = render(options)
export const named: typeof render = vectorizeTerminal
// @ts-expect-error Rows must be numeric.
render({rows: 'auto'})
`)
await Bun.write(join(consumer, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    types: [],
  },
  files: ['consumer.ts'],
}, null, 2))
const bun = await run([process.execPath, 'consumer.mjs'], consumer)
const native = await run([node, 'consumer.mjs'], consumer)
await run([process.execPath, join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumer)
const packageRoot = join(consumer, 'node_modules/vectorize-terminal')
const manifest = await Bun.file(join(packageRoot, 'package.json')).json() as {bin: Record<string, string>}
const binary = join(packageRoot, manifest.bin['vectorize-terminal']!)
const binarySource = await Bun.file(binary).text()
assert.ok(binarySource.startsWith('#!/usr/bin/env node'))
const cli = await run([node, binary, '--rows', '1'], consumer, ' ai                  ')
assert.equal(cli.stderr, '')
assert.equal(cli.stdout, vectorizeTerminal({
  content: ' ai                  ',
  rows: 1,
}))
const files = new Bun.Glob('**/*')
const shipped = [...files.scanSync({
  cwd: packageRoot,
  onlyFiles: true,
})].map(file => file.replaceAll('\\', '/')).toSorted()
for (const file of shipped) {
  assert.ok(file.startsWith('dist/') || file === 'docs/example.svg' || ['license.txt', 'package.json', 'readme.md'].includes(file), `Unexpected published file: ${file}`)
}
assert.ok(shipped.includes('license.txt'))
assert.ok(shipped.includes('dist/main.d.ts'))
const report = {
  archive: join(directory, archive),
  bun: JSON.parse(bun.stdout) as unknown,
  node: JSON.parse(native.stdout) as unknown,
  declarations: 'passed',
  cli: 'passed',
  files: shipped,
}
await Bun.write(join(root, 'out/package-check.json'), `${JSON.stringify(report, null, 2)}\n`)
console.info(JSON.stringify(report, null, 2))
