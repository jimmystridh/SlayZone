/**
 * Tests for DOM picker snippet formatting
 * Run with: npx tsx packages/domains/task-browser/src/client/dom-picker.test.ts
 */
import { buildDomElementSnippet } from './dom-picker'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`✗ ${name}`)
    console.error(`  ${e}`)
    failed++
  }
}

function expect(actual: string) {
  return {
    toContain(expected: string) {
      if (!actual.includes(expected))
        throw new Error(`Expected "${actual}" to contain "${expected}"`)
    },
    notToContain(expected: string) {
      if (actual.includes(expected))
        throw new Error(`Expected "${actual}" not to contain "${expected}"`)
    }
  }
}

test('uses first selector candidate', () => {
  const snippet = buildDomElementSnippet({
    url: 'https://example.com',
    tagName: 'button',
    textSample: 'Checkout',
    selectorCandidates: ['[data-testid="checkout-btn"]', '#checkout-btn']
  })
  expect(snippet).toContain('Element target: [data-testid="checkout-btn"]')
})

test('falls back to tag name if no selectors', () => {
  const snippet = buildDomElementSnippet({
    url: 'https://example.com',
    tagName: 'input',
    textSample: '',
    selectorCandidates: []
  })
  expect(snippet).toContain('Element target: input on https://example.com')
})

test('normalizes and truncates text sample', () => {
  const snippet = buildDomElementSnippet({
    url: 'https://example.com',
    tagName: 'p',
    textSample: ` ${'A'.repeat(200)} \n \t ${'B'.repeat(30)}`,
    selectorCandidates: ['p.content']
  })
  expect(snippet).toContain('Element target: p.content (text="')
  expect(snippet).toContain('…")')
})

test('escapes quotes in text sample', () => {
  const snippet = buildDomElementSnippet({
    url: 'https://example.com',
    tagName: 'button',
    textSample: 'Say "hello"',
    selectorCandidates: ['button']
  })
  expect(snippet).toContain('text="Say \\"hello\\""')
})

test('appends optional note', () => {
  const snippet = buildDomElementSnippet({
    url: 'https://example.com',
    tagName: 'iframe',
    textSample: '',
    selectorCandidates: ['iframe[name="content"]'],
    note: 'Selection came from iframe boundary'
  })
  expect(snippet).toContain('[Selection came from iframe boundary]')
  expect(snippet).notToContain('text="')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
