import render from '../src/main.ts'
import {exportImages, fixtureIds, loadFixture} from '../test/helpers.ts'

for (const id of fixtureIds) {
  await exportImages(id, render(await loadFixture(id)))
  console.info(`Wrote out/fixtures/${id}.{svg,png}`)
}
await exportImages('isup-full', render({
  ...await loadFixture('isup'),
  rows: 43,
}))
await exportImages('grid', render({
  ...await loadFixture('pwd'),
  rows: 8,
  grid: true,
}))
await exportImages('styles', render({
  columns: 52,
  rows: 9,
  decoration: {
    type: 'windowsTerminal',
    tabTitle: 'Style gallery',
  },
  content: [
    '\u{1B}[1;93m$\u{1B}[0m bun x vectorize-terminal',
    '',
    '\u{1B}[1mBold\u{1B}[22m  \u{1B}[3mItalic\u{1B}[23m  \u{1B}[4mUnderline\u{1B}[24m  \u{1B}[9mStrikethrough\u{1B}[29m',
    '\u{1B}[2mDimmed\u{1B}[22m  \u{1B}[7m Inverse \u{1B}[27m  \u{1B}[38;2;103;214;255mTruecolor\u{1B}[39m',
    '',
    `${Array.from({length: 16}, (_, i) => `\u{1B}[48;5;${i}m   `).join('')}\u{1B}[0m`,
    `${Array.from({length: 16}, (_, i) => `\u{1B}[48;5;${16 + i * 13}m   `).join('')}\u{1B}[0m`,
    `${Array.from({length: 16}, (_, i) => `\u{1B}[48;5;${232 + i}m   `).join('')}\u{1B}[0m`,
    '\u{1B}[92m✓\u{1B}[0m Ready for your README.',
  ].join('\n'),
}))
console.info('Wrote out/fixtures/{isup-full,grid,styles}.{svg,png}')
const fields = [['@opencode-ai/sdk', '1.14.49'], ['ai', '6.0.182'], ['dayjs', '1.11.20'], ['es-toolkit', '1.46.1']]
await exportImages('whitespace', render({
  columns: 35,
  rows: 6,
  decoration: {
    type: 'windowsTerminal',
    tabTitle: 'Whitespace regression',
  },
  content: [
    `┌${'─'.repeat(21)}┬${'─'.repeat(11)}┐`,
    ...fields.map(([name, version]) => `│${` ${name!}`.padEnd(21)}│${` ${version!}`.padEnd(11)}│`),
    `└${'─'.repeat(21)}┴${'─'.repeat(11)}┘`,
  ].join('\n'),
}))
await exportImages('unicode', render({
  columns: 42,
  rows: 7,
  decoration: {
    type: 'windowsTerminal',
    tabTitle: 'Unicode and terminal cells',
  },
  content: [
    'Combining:  e\u{301}  a\u{308}  o\u{302}',
    'CJK:        界 日本語 中文',
    'Emoji:      👩‍💻 👨‍👩‍👧‍👦 🇩🇪',
    '',
    '\u{1B}[4mUnderline padded text   \u{1B}[0m',
    '\u{1B}[44;97m Background padding    \u{1B}[0m',
    '\u{1B}[92m✓\u{1B}[0m Unicode cells stay aligned.',
  ].join('\n'),
}))
await Bun.write('docs/example.svg', await Bun.file('out/fixtures/styles.svg').text())
console.info('Wrote out/fixtures/{whitespace,unicode}.{svg,png} and docs/example.svg')
