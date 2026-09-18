import {expect, test} from 'bun:test'

const {default: vectorizeTerminal} = await import('#src/main.ts')

test('should run', () => {
  const result = vectorizeTerminal()
  expect(result).toBe('vectorize-terminal') // TODO Test actual functionality
})
