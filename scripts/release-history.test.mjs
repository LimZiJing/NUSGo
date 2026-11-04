import test from 'node:test'
import assert from 'node:assert/strict'
import { assertReleaseIdentity, assertReleasePromotionAvailable, buildReleaseHistory, formatReleaseNotes, validateReleaseNotes } from './release-history.mjs'

const sha = 'a'.repeat(40)
const nextSha = 'b'.repeat(40)
const earlierSha = 'c'.repeat(40)
const notes = {
  id: '2026-11-04.2',
  title: 'A useful release',
  sections: { Added: ['A new feature.'], Improved: [], Fixed: [] },
}

test('validates release notes and formats only populated sections', () => {
  const validated = validateReleaseNotes(notes, notes.id)
  assert.equal(validated.date, '2026-11-04')
  assert.match(formatReleaseNotes(validated), /## Added/)
  assert.doesNotMatch(formatReleaseNotes(validated), /## Improved|## Fixed/)
  assert.throws(() => validateReleaseNotes({ ...notes, id: '2026-02-30.1' }), /valid date/)
  assert.throws(() => validateReleaseNotes({ ...notes, sections: { ...notes.sections, Added: [' '] } }), /non-empty strings/)
})

test('keeps only the selected release plus previously published history in date order', () => {
  const history = buildReleaseHistory(notes, [
    {
      tag_name: 'release-2026-11-04.1', target_commitish: 'main', tag_commit_sha: nextSha,
      published_at: '2026-11-04T12:00:00Z',
      body: '# Earlier release\n\n## Fixed\n- A previous issue.\n\n<!-- release-meta: deployed-at=2026-11-04T11:55:00.000Z sha=' + nextSha + ' production-run=123 -->',
    },
    {
      tag_name: 'release-2026-11-03.3', target_commitish: sha, tag_commit_sha: earlierSha,
      published_at: '2026-11-03T12:00:00Z', body: '# An earlier release\n\n## Added\n- A real published change.\n\n<!-- release-meta: deployed-at=2026-11-03T10:00:00.000Z sha=' + earlierSha + ' production-run=100 -->',
    },
  ], sha)
  assert.deepEqual(history.releases.map(({ id }) => id), ['2026-11-04.2', '2026-11-04.1', '2026-11-03.3'])
  assert.equal(history.releases[0].deployedAt, undefined)
  assert.equal(history.releases[1].deployedAt, '2026-11-04T11:55:00.000Z')
  assert.equal(history.releases[1].sections.Fixed[0], 'A previous issue.')
})

test('rejects assigning a published release ID to another commit', () => {
  const existing = [{
    tag_name: 'release-2026-11-04.2', target_commitish: 'main', tag_commit_sha: sha,
    body: `${formatReleaseNotes(notes)}\n\n<!-- release-meta: deployed-at=2026-11-04T12:00:00.000Z sha=${sha} production-run=123 -->`,
  }]
  assert.equal(assertReleaseIdentity(existing, notes, sha), 'existing')
  assert.throws(() => assertReleaseIdentity(existing, notes, nextSha), /cannot be reassigned/)
  assert.throws(() => assertReleaseIdentity(existing, { ...notes, title: 'Changed notes' }, sha), /published notes are immutable/)
  assert.throws(() => assertReleaseIdentity([{
    tag_name: 'release-2026-11-04.1', target_commitish: 'main', tag_commit_sha: sha,
    body: `# Earlier\n\n## Fixed\n- A fix.\n\n<!-- release-meta: deployed-at=2026-11-04T12:00:00.000Z sha=${sha} production-run=123 -->`,
  }], notes, sha), /already belongs to another release ID/)
})

test('reserves a release ID for its first successful deployment while publication is pending', () => {
  const productionRuns = [{
    display_title: `Production frontend release ${notes.id}`,
    conclusion: 'success',
    head_sha: sha,
  }]
  assert.doesNotThrow(() => assertReleasePromotionAvailable(notes.id, sha, productionRuns))
  assert.throws(() => assertReleasePromotionAvailable(notes.id, nextSha, productionRuns), /already completed production for another commit/)
})

test('ignores failed promotions and successful runs for other release IDs', () => {
  assert.doesNotThrow(() => assertReleasePromotionAvailable(notes.id, nextSha, [
    { display_title: `Production frontend release ${notes.id}`, conclusion: 'failure', head_sha: sha },
    { display_title: 'Production frontend release 2026-11-03.1', conclusion: 'success', head_sha: sha },
  ]))
})

test('uses resolved tag commits and reuses a release identity on rollback', () => {
  const previous = [{
    tag_name: `release-${notes.id}`,
    target_commitish: 'main',
    tag_commit_sha: sha,
    body: `${formatReleaseNotes(notes)}\n\n<!-- release-meta: deployed-at=2026-11-04T12:00:00.000Z sha=${sha} production-run=123 -->`,
  }]
  assert.equal(buildReleaseHistory(notes, previous, sha).releases[0].commitSha, sha)
  assert.throws(() => buildReleaseHistory(notes, [{ ...previous[0], tag_commit_sha: nextSha }], sha), /does not match its resolved tag commit/)
  assert.throws(() => buildReleaseHistory(notes, [{ ...previous[0], tag_commit_sha: undefined }], sha), /does not match its resolved tag commit/)
  assert.throws(() => buildReleaseHistory(notes, [{ ...previous[0], tag_name: 'release-not-a-date', tag_commit_sha: sha }], sha), /Invalid website release tag/)
})

test('requires a new same-day ID to use the next sequence', () => {
  const prior = [{
    tag_name: 'release-2026-11-04.1',
    target_commitish: 'main',
    tag_commit_sha: nextSha,
    body: '# Earlier release\n\n## Fixed\n- A prior fix.\n\n<!-- release-meta: deployed-at=2026-11-04T11:55:00.000Z sha=' + nextSha + ' production-run=122 -->',
  }]
  assert.throws(() => buildReleaseHistory({ ...notes, id: '2026-11-04.3' }, prior, sha), /out of sequence/)
})
