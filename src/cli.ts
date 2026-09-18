#!/usr/bin/env node
import type {Options} from './main.ts'

import {readFileSync, writeFileSync} from 'node:fs'
import {parseArgs} from 'node:util'

import packageJson from '../package.json' with {type: 'json'}
import vectorizeTerminal from './main.ts'

const help = `vectorize-terminal — turn an ANSI transcript into an SVG

Usage:
  vectorize-terminal [input.txt|-] [options]
  vectorize-terminal --title Build --rows 12 < build.log > build.svg

Input defaults to stdin. Output defaults to stdout. No commands are executed.

Options:
  -o, --output FILE    Write SVG to a file (or - for stdout)
      --columns N     Terminal columns (default: 80)
      --rows N        Visible rows (default: 24; excess content is clipped)
      --padding N     Body padding (default: 30)
      --cell-width N  Cell width (default: 45)
      --cell-height N Cell height (default: 100)
      --title TEXT    Enable Windows Terminal decoration with this tab title
      --icon FILE     Read a self-contained SVG tab icon; also enables decoration
      --grid          Show the alignment grid
  -h, --help          Show this help
  -v, --version       Show the package version
`
try {
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      output: {
        type: 'string',
        short: 'o',
      },
      columns: {type: 'string'},
      rows: {type: 'string'},
      padding: {type: 'string'},
      'cell-width': {type: 'string'},
      'cell-height': {type: 'string'},
      title: {type: 'string'},
      icon: {type: 'string'},
      grid: {type: 'boolean'},
      help: {
        type: 'boolean',
        short: 'h',
      },
      version: {
        type: 'boolean',
        short: 'v',
      },
    },
  })
  if (values.help) {
    process.stdout.write(help)
  } else if (values.version) {
    process.stdout.write(`${packageJson.version}\n`)
  } else {
    if (positionals.length > 1) {
      throw new Error('Expected at most one input file')
    }
    const input = positionals[0] ?? '-'
    if (input === '-' && process.stdin.isTTY) {
      throw new Error('Supply an input file or pipe a transcript to stdin. Use --help for usage.')
    }
    const options: Options = {content: readFileSync(input === '-' ? 0 : input, 'utf8')}
    for (const [flag, key] of [
      ['columns', 'columns'],
      ['rows', 'rows'],
      ['padding', 'padding'],
      ['cell-width', 'cellWidth'],
      ['cell-height', 'cellHeight'],
    ] as const) {
      const value = values[flag]
      if (!(value !== undefined)) {
        continue
      }
      if (value.trim() === '') {
        throw new Error(`--${flag} needs a number`)
      }
      options[key] = Number(value)
    }
    if (values.grid) {
      options.grid = true
    }
    if (values.title !== undefined || values.icon !== undefined) {
      options.decoration = {
        type: 'windowsTerminal',
        tabTitle: values.title ?? 'Terminal',
        ...values.icon === undefined ? {} : {tabIcon: readFileSync(values.icon, 'utf8')},
      }
    }
    const svg = vectorizeTerminal(options)
    if (values.output === undefined || values.output === '-') {
      process.stdout.write(svg)
    } else {
      writeFileSync(values.output, svg, 'utf8')
    }
  }
} catch (error) {
  console.error(`vectorize-terminal: ${Error.isError(error) ? error.message : String(error)}`)
  process.exitCode = 1
}
