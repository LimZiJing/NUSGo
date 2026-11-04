import test from 'node:test'
import assert from 'node:assert/strict'
import { publishWebsiteRelease } from './publish-website-release.mjs'

const sha = 'a'.repeat(40)
process.env.GITHUB_REPOSITORY = 'LimZiJing/NUSGo'
const releaseId = '2026-11-04.1'
const notes = { id: releaseId, title: 'A useful release', sections: { Added: ['A new feature.'], Improved: [], Fixed: [] } }
const run = {
  id: 42,
  run_number: 6,
  run_attempt: 1,
  workflow_id: 19,
  status: 'completed',
  conclusion: 'success',
  event: 'workflow_dispatch',
  head_sha: sha,
  head_repository: { full_name: 'LimZiJing/NUSGo' },
}
const deployedAt = '2026-11-04T12:34:56Z'

async function cloudflareApi() {
  return { success: true, result: [41, 42].map((id) => ({
    environment: 'production',
    deployment_trigger: { metadata: { branch: 'main', commit_hash: sha, commit_message: `NUSGo production run ${id} attempt 1` } },
    latest_stage: { name: 'deploy', status: 'success', ended_on: deployedAt },
  })), result_info: { total_pages: 1 } }
}

function event() {
  return { workflow_run: { ...run, display_title: `Production frontend release ${releaseId}` } }
}

function fakeApi({ runOverride = {}, existingReleases = [], tagSha, priorRuns = [], failedAttempts = [], failReleaseOnce = false } = {}) {
  const writes = []
  let createdTagSha = tagSha
  const api = async (path, options = {}, allowNotFound = false) => {
    if (path.startsWith('actions/workflows/19/runs?event=workflow_dispatch&per_page=100&page=')) return { workflow_runs: priorRuns }
    const runMatch = path.match(/^actions\/runs\/(\d+)$/)
    if (runMatch) return runMatch[1] === '42' ? { ...run, ...runOverride } : priorRuns.find((candidate) => candidate.id === Number(runMatch[1]))
    if (path === 'actions/workflows/19') return { path: '.github/workflows/deploy-frontend-production.yml' }
    const attemptMatch = path.match(/^actions\/runs\/\d+\/attempts\/(\d+)\/jobs\?per_page=100$/)
    if (attemptMatch) return { jobs: [{
      name: 'Build and deploy the production frontend (Cloudflare Pages)',
      conclusion: failedAttempts.includes(Number(attemptMatch[1])) ? 'failure' : 'success',
      steps: [{ name: 'Deploy to Cloudflare Pages', conclusion: failedAttempts.includes(Number(attemptMatch[1])) ? 'failure' : 'success', started_at: '2026-11-04T12:30:00Z', completed_at: deployedAt }],
    }] }
    if (path === `contents/frontend/releases?ref=${sha}`) return [{ name: `${releaseId}.json`, type: 'file' }]
    if (path === `contents/frontend/releases/${releaseId}.json?ref=${sha}`) return {
      encoding: 'base64',
      content: Buffer.from(JSON.stringify(notes)).toString('base64'),
    }
    if (path.startsWith('releases?per_page=100&page=')) return existingReleases
    if (path === `git/ref/tags/release-${releaseId}`) {
      if (!createdTagSha) {
        if (allowNotFound) return null
        throw new Error('Tag unexpectedly missing')
      }
      return { object: { type: 'commit', sha: createdTagSha } }
    }
    if (path === 'git/refs' && options.method === 'POST') {
      const body = JSON.parse(options.body)
      writes.push({ path, body })
      createdTagSha = body.sha
      return {}
    }
    if (path === 'releases' && options.method === 'POST') {
      writes.push({ path, body: JSON.parse(options.body) })
      if (failReleaseOnce) {
        failReleaseOnce = false
        throw new Error('Simulated GitHub release creation failure')
      }
      existingReleases.push({ ...JSON.parse(options.body), draft: false })
      return {}
    }
    throw new Error(`Unexpected API call: ${options.method ?? 'GET'} ${path}`)
  }
  return { api, writes }
}

test('publishes an immutable GitHub tag and release only after the verified production step', async () => {
  const { api, writes } = fakeApi()
  await publishWebsiteRelease(event(), api, cloudflareApi)
  assert.equal(writes.length, 2)
  assert.equal(writes[0].body.ref, `refs/tags/release-${releaseId}`)
  assert.equal(writes[0].body.sha, sha)
  assert.match(writes[1].body.body, new RegExp(`deployed-at=${deployedAt.replace('Z', '.000Z')} sha=${sha} production-run=42`))
})

test('refuses to publish when the production run failed', async () => {
  const { api, writes } = fakeApi({ runOverride: { conclusion: 'failure' }, failedAttempts: [1] })
  await assert.rejects(publishWebsiteRelease(event(), api, cloudflareApi), /no successful Cloudflare Pages deployment step/)
  assert.deepEqual(writes, [])
})

test('refuses an immutable tag already assigned to a different commit', async () => {
  const { api, writes } = fakeApi({ tagSha: 'b'.repeat(40) })
  await assert.rejects(publishWebsiteRelease(event(), api, cloudflareApi), /Immutable tag .* resolves to/)
  assert.deepEqual(writes, [])
})

test('requires publication from the first successful production run for an ID and SHA', async () => {
  const priorRun = { ...run, id: 41, run_number: 5, display_title: `Production frontend release ${releaseId}`, created_at: '2026-11-04T12:00:00Z' }
  const { api, writes } = fakeApi({ priorRuns: [priorRun] })
  await assert.rejects(publishWebsiteRelease(event(), api, cloudflareApi), /deployed this release first/)
  assert.deepEqual(writes, [])
})

test('keeps the first successful attempt time after a failed production rerun', async () => {
  const retriedEvent = { workflow_run: { ...event().workflow_run, run_attempt: 2 } }
  const { api, writes } = fakeApi({ runOverride: { run_attempt: 2, conclusion: 'failure' }, failedAttempts: [2] })
  await publishWebsiteRelease(retriedEvent, api, cloudflareApi)
  assert.equal(writes[1].body.body.match(/deployed-at=([^ ]+)/)?.[1], '2026-11-04T12:34:56.000Z')
})


test('refuses a successful named step without an actual matching Cloudflare deployment', async () => {
  const { api, writes } = fakeApi()
  await assert.rejects(publishWebsiteRelease(event(), api, async () => ({ success: true, result: [] })), /No verified Cloudflare/)
  assert.deepEqual(writes, [])
})

test('refuses Cloudflare records for another commit, environment, run or failed deployment', async () => {
  for (const change of ['commit', 'environment', 'run', 'status', 'time']) {
    const { api, writes } = fakeApi()
    const verify = async () => {
      const response = await cloudflareApi()
      for (const deployment of response.result) {
        if (change === 'commit') deployment.deployment_trigger.metadata.commit_hash = 'b'.repeat(40)
        if (change === 'environment') deployment.environment = 'preview'
        if (change === 'run') deployment.deployment_trigger.metadata.commit_message = 'another run'
        if (change === 'status') deployment.latest_stage.status = 'failure'
        if (change === 'time') deployment.latest_stage.ended_on = '2026-11-03T12:34:56Z'
      }
      return response
    }
    await assert.rejects(publishWebsiteRelease(event(), api, verify), /No verified Cloudflare/)
    assert.deepEqual(writes, [])
  }
})


test('retries partial publication without recreating the tag or duplicating the release', async () => {
  const { api, writes } = fakeApi({ failReleaseOnce: true })
  await assert.rejects(publishWebsiteRelease(event(), api, cloudflareApi), /Simulated GitHub release creation failure/)
  assert.equal(writes.filter((write) => write.path === 'git/refs').length, 1)
  await publishWebsiteRelease(event(), api, cloudflareApi)
  assert.equal(writes.filter((write) => write.path === 'git/refs').length, 1)
  const attempts = writes.filter((write) => write.path === 'releases')
  assert.equal(attempts.length, 2)
  assert.deepEqual(attempts[0].body, attempts[1].body)
  await publishWebsiteRelease(event(), api, cloudflareApi)
  assert.equal(writes.filter((write) => write.path === 'releases').length, 2)
})
