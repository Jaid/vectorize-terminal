import {afterAll, expect, test} from 'bun:test'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import fs from 'fs-extra'

import packageJson from '../package.json' with {type: 'json'}
import vectorizeTerminal from '../src/main.ts'

const directory = await fs.mkdtemp(join(tmpdir(), 'vectorize-terminal-test-'))
afterAll(async () => fs.rm(directory, {
  recursive: true,
  force: true,
}))
const cli = resolve(import.meta.dirname, '../src/cli.ts')
async function run(args: Array<string>, content = '') {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    stdin: new Blob([content]),
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: directory,
  })
  const output = new Response(child.stdout)
  const errors = new Response(child.stderr)
  const [stdout, stderr, exitCode] = await Promise.all([
    output.text(),
    errors.text(),
    child.exited,
  ])
  return {
    stdout,
    stderr,
    exitCode,
  }
}
test('CLI reads stdin and emits only SVG to stdout', async () => {
  const content = '\u{1B}[31mHello\u{1B}[0m\n ai                  '
  const result = await run([], content)
  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toBe(vectorizeTerminal(content))
})
test('CLI reads a file, writes a file, and applies geometry and decoration', async () => {
  await fs.writeFile(join(directory, 'input.txt'), 'Hello')
  const result = await run(['input.txt', '--output', 'output.svg', '--columns', '20', '--rows', '3', '--padding', '4', '--cell-width', '9', '--cell-height', '20', '--title', 'Build', '--grid'])
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).toBe('')
  const svg = await fs.readFile(join(directory, 'output.svg'), 'utf8')
  expect(svg).toBe(vectorizeTerminal({
    content: 'Hello',
    columns: 20,
    rows: 3,
    padding: 4,
    cellWidth: 9,
    cellHeight: 20,
    grid: true,
    decoration: {
      type: 'windowsTerminal',
      tabTitle: 'Build',
    },
  }))
})
test('CLI supports custom SVG icons and explicit stdin/stdout', async () => {
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>'
  await fs.writeFile(join(directory, 'icon.svg'), icon)
  const result = await run(['-', '--output', '-', '--icon', 'icon.svg'], 'X')
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe(vectorizeTerminal({
    content: 'X',
    decoration: {
      type: 'windowsTerminal',
      tabTitle: 'Terminal',
      tabIcon: icon,
    },
  }))
})
test('CLI help and version do not render a screenshot', async () => {
  const help = await run(['--help'])
  expect(help.exitCode).toBe(0)
  expect(help.stdout).toContain('Usage:')
  expect(help.stdout).not.toContain('<svg')
  const version = await run(['--version'])
  expect(version.exitCode).toBe(0)
  expect(version.stdout).toBe(`${packageJson.version}\n`)
})
test.each([['--rows=0'], ['--columns=banana'], ['--padding='], ['--unknown'], ['one', 'two'], ['missing.txt']].map(args => ({args})))('CLI rejects invalid arguments %j', async ({args}) => {
  const result = await run(args)
  expect(result.exitCode).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('vectorize-terminal:')
})
