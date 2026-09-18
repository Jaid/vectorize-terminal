import {join, resolve} from 'node:path'

import fs from 'fs-extra'

const root = resolve(import.meta.dirname, '..')
const outdir = join(root, 'dist')
await fs.rm(outdir, {
  recursive: true,
  force: true,
})
await fs.mkdir(outdir, {recursive: true})
for (const [entry, target] of [['main', 'browser'], ['cli', 'node']] as const) {
  const result = await Bun.build({
    entrypoints: [join(root, `src/${entry}.ts`)],
    outdir,
    naming: '[name].js',
    target,
    format: 'esm',
    packages: 'external',
    sourcemap: 'linked',
  })
  if (!result.success) {
    throw new AggregateError(result.logs, `Failed to build ${entry}`)
  }
  for (const output of result.outputs) {
    console.info(`${output.path}: ${output.size} bytes`)
  }
}
// Invoke this repository's pinned TypeScript Classic compiler, not a global tsc.
const compiler = Bun.spawn([process.execPath, join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
})
if (await compiler.exited !== 0) {
  throw new Error('Declaration generation failed')
}
await fs.chmod(join(outdir, 'cli.js'), 0o755)
