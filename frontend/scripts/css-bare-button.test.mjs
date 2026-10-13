import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findBareButtonSelectors } from './css-bare-button.mjs'

const selectorsOf = (css) => findBareButtonSelectors(css).map(({ selector }) => selector)

describe('bare button selector detection', () => {
  it.each([
    ['a type selector', 'button { color: red; }'],
    ['an uppercase type selector', 'BUTTON { color: red; }'],
    ['a descendant button without a class', '.panel button { color: red; }'],
    ['a child button without a class', '.panel > button { color: red; }'],
    ['a button with only pseudo-classes', 'button:hover { color: red; }'],
    ['a button excluded by :not() classes', '.panel button:not(.primary):not(:disabled) { color: red; }'],
    ['a button wrapped in :where()', '.panel button:where(:not(.route-chip)) { color: red; }'],
    ['a button inside :is()', '.panel :is(button, a) { color: red; }'],
    ['a bare button later in a selector list', '.chip, .panel button { color: red; }'],
    ['a bare button in a nested at-rule', '@media (max-width: 768px) { .panel button { color: red; } }'],
    ['a bare button in a nested rule', '.panel { & button { color: red; } }'],
  ])('flags %s', (_name, css) => {
    expect(findBareButtonSelectors(css)).toHaveLength(1)
  })

  it.each([
    ['a button with a class', 'button.primary { color: red; }'],
    ['a descendant button with a class', '.panel button.primary { color: red; }'],
    ['a class on its own', '.button { color: red; }'],
    ['a button with an attribute selector', 'button[type="submit"] { color: red; }'],
    ['a button with an id', 'button#save { color: red; }'],
    ['a class with button in its name', '.button-row, .navigate-button:hover { color: red; }'],
    ['an element that only mentions button in a string', 'a[data-kind="button"] { color: red; }'],
    ['button in a declaration value', '.panel { content: "button {"; }'],
    ['button in a comment', '/* button { color: red; } */ .panel { color: red; }'],
    ['a keyframe block', '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }'],
    ['an input', 'input:focus-visible { color: red; }'],
    ['a button only inside :not()', '.panel :not(button) { color: red; }'],
  ])('allows %s', (_name, css) => {
    expect(findBareButtonSelectors(css)).toEqual([])
  })

  it('reports the 1-based line and the original selector text', () => {
    const css = [
      '.ok { color: red; }',
      '',
      '/* note */',
      ".panel button[aria-pressed='true'], .panel button:hover {",
      '  color: red;',
      '}',
    ].join('\n')

    expect(findBareButtonSelectors(css)).toEqual([
      { line: 4, selector: ".panel button[aria-pressed='true'], .panel button:hover" },
    ])
  })

  it('reports each offending rule once', () => {
    const css = '.a button { color: red; }\n.b { color: red; }\n.c button:hover { color: red; }'

    expect(selectorsOf(css)).toEqual(['.a button', '.c button:hover'])
  })
})

describe('bare button stylesheet check', () => {
  it('passes for the current stylesheets with the documented allowlist', () => {
    const script = resolve(dirname(fileURLToPath(import.meta.url)), 'lint-css.mjs')
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})
