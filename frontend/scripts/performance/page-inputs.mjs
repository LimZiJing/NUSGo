import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const inputNames = ['browser-metrics.mjs', 'fixtures.mjs', 'page-inputs.mjs', 'prepare-page.mjs', 'scenarios.mjs']

// Hash the complete page-generation boundary, with stable newlines across checkouts.
export async function fingerprintPageInputs(directory = new URL('./', import.meta.url), pageEntry = new URL('../../index.html', directory)) {
  const hash = createHash('sha256')
  const pageContents = await readFile(pageEntry, 'utf8')
  hash.update('frontend/index.html').update('\0').update(pageContents.replaceAll('\r\n', '\n')).update('\0')
  for (const name of inputNames) {
    const contents = await readFile(new URL(name, directory), 'utf8')
    hash.update(name).update('\0').update(contents.replaceAll('\r\n', '\n')).update('\0')
  }
  return { sha256: hash.digest('hex'), fileCount: inputNames.length + 1 }
}

export function assertPageInputs(actual, expectedSha256) {
  if (!expectedSha256 || actual?.sha256 !== expectedSha256) {
    throw new Error('Page-generation fingerprint mismatch; prepare the page with the recorded fixture, probe and scenario inputs before collecting evidence')
  }
}
