// Fails when a stylesheet under frontend/src styles a bare `button` element.
// Usage: node frontend/scripts/lint-css.mjs   (also run by the root `npm run lint`)
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BARE_BUTTON_ALLOWLIST } from './bare-button-allowlist.mjs'
import { findBareButtonSelectors } from './css-bare-button.mjs'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(frontendRoot, 'src')

function listCssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listCssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

const problems = []
const seenAllowlisted = new Set()

for (const file of listCssFiles(sourceRoot)) {
  const path = relative(frontendRoot, file).split('\\').join('/')
  const violations = findBareButtonSelectors(readFileSync(file, 'utf8'))
  const allowed = BARE_BUTTON_ALLOWLIST[path] ?? 0
  if (allowed > 0) seenAllowlisted.add(path)

  if (violations.length > allowed) {
    problems.push(
      `${path}: ${violations.length} bare button selector(s), ${allowed} allowed. Style a class instead (see docs/ui/controls.md).`,
      ...violations.map(({ line, selector }) => `  line ${line}: ${selector}`),
    )
  } else if (violations.length < allowed) {
    problems.push(
      `${path}: ${violations.length} bare button selector(s) remain but ${allowed} are allowed. Lower its count in frontend/scripts/bare-button-allowlist.mjs.`,
    )
  }
}

for (const path of Object.keys(BARE_BUTTON_ALLOWLIST)) {
  if (!seenAllowlisted.has(path)) {
    problems.push(`${path}: allowlisted but has no bare button selectors left or no longer exists. Remove it from frontend/scripts/bare-button-allowlist.mjs.`)
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('No new bare button selectors in frontend/src CSS.')
