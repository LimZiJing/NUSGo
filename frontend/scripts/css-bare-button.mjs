// Detects selectors that style a bare `button` element. See docs/ui/controls.md for the rule.
// Dependency-free on purpose: a small tokeniser is enough for the selector shapes in this repo.

/** Replaces comments and string contents with spaces, keeping newlines so line numbers survive. */
function stripCommentsAndStrings(css) {
  let output = ''
  let index = 0
  while (index < css.length) {
    const char = css[index]
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      const stop = end === -1 ? css.length : end + 2
      output += css.slice(index, stop).replace(/[^\n]/g, ' ')
      index = stop
    } else if (char === '"' || char === "'") {
      let stop = index + 1
      while (stop < css.length && css[stop] !== char && css[stop] !== '\n') {
        stop += css[stop] === '\\' ? 2 : 1
      }
      output += char + ' '.repeat(Math.max(0, stop - index - 1)) + (css[stop] === char ? char : '')
      index = css[stop] === char ? stop + 1 : stop
    } else {
      output += char
      index += 1
    }
  }
  return output
}

/** Splits text on a separator character that is outside any (), [] pair. */
function splitTopLevel(text, isSeparator) {
  const parts = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    else if (depth === 0 && isSeparator(char)) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** Returns the text inside the parentheses that open at `openIndex`, and the index after them. */
function readParenthesised(text, openIndex) {
  let depth = 0
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1
    else if (text[index] === ')') {
      depth -= 1
      if (depth === 0) return { inner: text.slice(openIndex + 1, index), next: index + 1 }
    }
  }
  return { inner: text.slice(openIndex + 1), next: text.length }
}

const FORGIVING_PSEUDOS = new Set(['is', 'where', 'has', 'matches', '-webkit-any', '-moz-any'])

/**
 * A compound selector is a run of simple selectors with no combinator, such as `button.primary`.
 * It is a bare button when its type is `button` and it has no class, id, or attribute selector.
 * Pseudo-classes such as :hover or :not(.x) do not give a button an identity. The arguments of
 * :is(), :where(), and :has() are checked as selector lists of their own.
 */
function isBareButtonCompound(compound) {
  let type = null
  let hasIdentity = false
  let nestedBare = false
  let index = 0

  const typeMatch = /^(?:\*|-?[A-Za-z_][\w-]*)(?:\|(?:\*|-?[A-Za-z_][\w-]*))?/.exec(compound)
  if (typeMatch) {
    type = typeMatch[0].toLowerCase()
    index = typeMatch[0].length
  }

  while (index < compound.length) {
    const char = compound[index]
    if (char === '.' || char === '#') {
      hasIdentity = true
      index += 1
      while (index < compound.length && (compound[index] === '\\' || /[\w-]/.test(compound[index]))) {
        index += compound[index] === '\\' ? 2 : 1
      }
    } else if (char === '[') {
      hasIdentity = true
      let depth = 0
      while (index < compound.length) {
        if (compound[index] === '[') depth += 1
        else if (compound[index] === ']' && --depth === 0) break
        index += 1
      }
      index += 1
    } else if (char === ':') {
      index += compound[index + 1] === ':' ? 2 : 1
      const nameMatch = /^[\w-]+/.exec(compound.slice(index))
      const name = nameMatch ? nameMatch[0].toLowerCase() : ''
      index += name.length
      if (compound[index] === '(') {
        const { inner, next } = readParenthesised(compound, index)
        if (FORGIVING_PSEUDOS.has(name) && selectorListHasBareButton(inner)) nestedBare = true
        index = next
      }
    } else {
      index += 1
    }
  }

  return nestedBare || (type === 'button' && !hasIdentity)
}

function selectorListHasBareButton(selectorList) {
  return splitTopLevel(selectorList, (char) => char === ',').some((selector) => {
    const withoutCombinators = splitTopLevel(
      selector.replace(/\s*([>+~])\s*/g, ' $1 '),
      (char) => /\s/.test(char) || char === '>' || char === '+' || char === '~',
    )
    return withoutCombinators
      .map((compound) => compound.trim())
      .filter((compound) => compound !== '' && compound !== '&')
      .some(isBareButtonCompound)
  })
}

/**
 * Returns one violation per rule whose selector list styles a bare button:
 * `{ line, selector }`, where line is 1-based and selector is the rule's prelude text.
 */
export function findBareButtonSelectors(css) {
  const source = stripCommentsAndStrings(css)
  const violations = []
  let preludeStart = 0
  let preludeLine = 1
  let line = 1
  let parenDepth = 0

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\n') line += 1
    if (char === '(' || char === '[') parenDepth += 1
    if (char === ')' || char === ']') parenDepth = Math.max(0, parenDepth - 1)

    if (parenDepth > 0 || (char !== '{' && char !== '}' && char !== ';')) {
      if (source.slice(preludeStart, index).trim() === '' && !/\s/.test(char)) preludeLine = line
      continue
    }
    if (char === '{') {
      const selector = source.slice(preludeStart, index).trim()
      if (selector !== '' && !selector.startsWith('@') && selectorListHasBareButton(selector)) {
        violations.push({ line: preludeLine, selector: css.slice(preludeStart, index).replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ') })
      }
    }
    preludeStart = index + 1
  }
  return violations
}
