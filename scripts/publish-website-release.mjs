import { readFile } from 'node:fs/promises'
import { assertReleaseIdentity, formatReleaseNotes, validateReleaseNotes } from './release-history.mjs'

const shaPattern = /^[0-9a-f]{40}$/i

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function apiUrl(path) {
  return `https://api.github.com/repos/${required('GITHUB_REPOSITORY')}/${path}`
}

function createApi() {
  return async function api(path, options = {}, allowNotFound = false) {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${required('GITHUB_TOKEN')}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        ...options.headers,
      },
    })
    if (allowNotFound && response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub API ${options.method ?? 'GET'} ${path} failed (HTTP ${response.status}): ${await response.text()}`)
    return response.status === 204 ? null : response.json()
  }
}


function createCloudflareApi() {
  return async function cloudflareApi(page) {
    const account = encodeURIComponent(required('CLOUDFLARE_ACCOUNT_ID'))
    const project = encodeURIComponent(required('CLOUDFLARE_PAGES_PROJECT'))
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments?env=production&per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}` },
    })
    if (!response.ok) throw new Error(`Cloudflare deployment verification failed (HTTP ${response.status})`)
    const result = await response.json()
    if (result.success !== true || !Array.isArray(result.result)) throw new Error('Cloudflare deployment history is invalid')
    return result
  }
}

export async function verifyCloudflareDeployment(run, attempt, step, cloudflareApi) {
  const marker = `NUSGo production run ${run.id} attempt ${attempt}`
  for (let page = 1; ; page += 1) {
    const response = await cloudflareApi(page)
    if (response.success !== true || !Array.isArray(response.result)) throw new Error('Cloudflare deployment history is invalid')
    const matches = response.result.filter((deployment) => {
      const metadata = deployment.deployment_trigger?.metadata
      const stage = deployment.latest_stage
      const endedAt = Date.parse(stage?.ended_on)
      return deployment.environment === 'production' && metadata?.branch === 'main'
        && metadata?.commit_hash?.toLowerCase() === run.head_sha.toLowerCase()
        && metadata?.commit_message === marker
        && stage?.name === 'deploy' && stage.status === 'success'
        && Number.isFinite(endedAt) && endedAt >= Date.parse(step.started_at) && endedAt <= Date.parse(step.completed_at)
    })
    if (matches.length > 1) throw new Error('Cloudflare has ambiguous production deployment records')
    if (matches.length === 1) return new Date(matches[0].latest_stage.ended_on).toISOString()
    const totalPages = response.result_info?.total_pages
    if (Number.isInteger(totalPages) ? page >= totalPages : response.result.length < 100) break
  }
  throw new Error(`No verified Cloudflare production deployment for run ${run.id} attempt ${attempt}`)
}

async function allReleases(api) {
  const releases = []
  for (let page = 1; ; page += 1) {
    const batch = await api(`releases?per_page=100&page=${page}`)
    if (!Array.isArray(batch)) throw new Error('GitHub release history is invalid')
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
}

async function resolvedTagCommit(tag, api) {
  const reference = await api(`git/ref/tags/${encodeURIComponent(tag)}`, {}, true)
  if (!reference) return null
  let object = reference.object
  const seen = new Set()
  while (object?.type === 'tag') {
    if (seen.has(object.sha)) throw new Error(`Annotated tag ${tag} contains a cycle`)
    seen.add(object.sha)
    object = (await api(`git/tags/${object.sha}`)).object
  }
  if (object?.type !== 'commit' || !shaPattern.test(object.sha)) throw new Error(`Tag ${tag} does not resolve to a commit`)
  return object.sha.toLowerCase()
}

async function resolveReleaseTags(releases, api) {
  const resolved = []
  for (const release of releases.filter((item) => !item.draft && item.tag_name?.startsWith('release-'))) {
    const tagCommitSha = await resolvedTagCommit(release.tag_name, api)
    if (!tagCommitSha) throw new Error(`Published release tag ${release.tag_name} is missing`)
    resolved.push({ ...release, tag_commit_sha: tagCommitSha })
  }
  return resolved
}

async function findProductionSuccess(runId, api, cloudflareApi) {
  if (!/^\d+$/.test(runId)) throw new Error('Production run ID must be numeric')
  const run = await api(`actions/runs/${runId}`)
  if (run.status !== 'completed') throw new Error(`Production run ${runId} has not completed`)
  if (run.head_repository?.full_name !== required('GITHUB_REPOSITORY')) throw new Error('Production run belongs to a different repository')
  if (run.event !== 'workflow_dispatch' || !shaPattern.test(run.head_sha ?? '')) throw new Error('Production run has an invalid event or commit SHA')
  const workflow = await api(`actions/workflows/${run.workflow_id}`)
  if (workflow.path !== '.github/workflows/deploy-frontend-production.yml') throw new Error('Run did not use the production frontend deployment workflow')
  if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Production run has no valid attempt history')
  for (let attempt = 1; attempt <= run.run_attempt; attempt += 1) {
    const jobs = await api(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`)
    if (!Array.isArray(jobs.jobs)) throw new Error(`Production jobs response for attempt ${attempt} is invalid`)
    const deploy = jobs.jobs.find((job) => job.name === 'Build and deploy the production frontend (Cloudflare Pages)')
    if (!deploy || deploy.conclusion !== 'success') continue
    const deployStep = deploy.steps?.find((step) => step.name === 'Deploy to Cloudflare Pages')
    if (!deployStep || deployStep.conclusion !== 'success') continue
    const deployedAt = deployStep.completed_at
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(deployedAt ?? '') || Number.isNaN(Date.parse(deployedAt))) {
      throw new Error(`Production deployment step on attempt ${attempt} has no valid completion time`)
    }
    const verifiedAt = await verifyCloudflareDeployment(run, attempt, deployStep, cloudflareApi)
    return { run, deployedAt: verifiedAt }
  }
  return null
}

async function assertFirstSuccessfulPromotion(run, deployedAt, releaseTitle, api, cloudflareApi) {
  for (let page = 1; ; page += 1) {
    const result = await api(`actions/workflows/${run.workflow_id}/runs?event=workflow_dispatch&per_page=100&page=${page}`)
    if (!Array.isArray(result.workflow_runs)) throw new Error('Production workflow history response is invalid')
    for (const candidate of result.workflow_runs) {
      if (candidate.id === run.id || candidate.event !== 'workflow_dispatch'
        || candidate.display_title !== releaseTitle) continue
      if (typeof candidate.head_sha !== 'string' || !shaPattern.test(candidate.head_sha)) throw new Error(`Production run ${candidate.id} has no valid commit SHA`)
      const candidateResult = await findProductionSuccess(String(candidate.id), api, cloudflareApi)
      if (!candidateResult) continue
      if (candidate.head_sha.toLowerCase() !== run.head_sha.toLowerCase()) {
        throw new Error(`Release ID in ${releaseTitle} already completed production for another commit (${candidate.head_sha})`)
      }
      const candidateRun = candidateResult.run
      const candidateTime = Date.parse(candidateResult.deployedAt)
      const thisTime = Date.parse(deployedAt)
      if (candidateTime < thisTime || (candidateTime === thisTime && candidateRun.run_number < run.run_number)) {
        throw new Error(`Production run ${candidate.id} deployed this release first; retry publication from that run`)
      }
    }
    if (result.workflow_runs.length < 100) return
  }
}

export async function publishWebsiteRelease(event, api, cloudflareApi) {
  const sourceRun = event.workflow_run
  if (!sourceRun) throw new Error('Publisher must run from a workflow_run event')
  const sha = sourceRun.head_sha
  if (!shaPattern.test(sha ?? '')) throw new Error('Production event must include a full commit SHA')
  const runId = String(sourceRun.id)
  const productionSuccess = await findProductionSuccess(runId, api, cloudflareApi)
  if (!productionSuccess) throw new Error(`Production run ${runId} has no successful Cloudflare Pages deployment step`)
  const { run, deployedAt } = productionSuccess
  if (run.head_sha.toLowerCase() !== sha.toLowerCase()) throw new Error('Production run SHA does not match the workflow_run event')
  if (run.id !== sourceRun.id || run.head_sha.toLowerCase() !== sha.toLowerCase()) throw new Error('Production run identity changed during verification')

  const files = await api(`contents/frontend/releases?ref=${sha}`)
  if (!Array.isArray(files)) throw new Error('Release notes directory is missing from the deployed commit')
  const notesFiles = files.filter((file) => file.type === 'file' && /^\d{4}-\d{2}-\d{2}\.[1-9]\d*\.json$/.test(file.name))
  const notes = []
  for (const file of notesFiles) {
    const content = await api(`contents/frontend/releases/${encodeURIComponent(file.name)}?ref=${sha}`)
    if (content.encoding !== 'base64' || typeof content.content !== 'string') throw new Error(`Cannot read deployed release notes ${file.name}`)
    const parsed = validateReleaseNotes(JSON.parse(Buffer.from(content.content, 'base64').toString('utf8')))
    if (file.name !== `${parsed.id}.json`) throw new Error(`Release notes path ${file.name} does not match ID ${parsed.id}`)
    notes.push(parsed)
  }
  const releaseId = sourceRun.display_title?.match(/^Production frontend release (\d{4}-\d{2}-\d{2}\.[1-9]\d*)$/)?.[1]
  if (!releaseId) throw new Error('Production run title does not identify a valid release ID')
  const selected = notes.find((item) => item.id === releaseId)
  if (!selected) throw new Error('The production run must select exactly one release ID in its dispatch inputs')

  const tag = `release-${selected.id}`
  const releases = await allReleases(api)
  const matchingReleases = releases.filter((release) => release.tag_name === tag)
  if (matchingReleases.length > 1) throw new Error(`GitHub has duplicate release records for ${tag}`)
  const existing = matchingReleases[0]
  const tagSha = await resolvedTagCommit(tag, api)
  if (tagSha && tagSha !== sha.toLowerCase()) throw new Error(`Immutable tag ${tag} resolves to ${tagSha}, not ${sha}`)
  const resolvedReleases = await resolveReleaseTags(releases, api)
  if (existing) {
    if (existing.draft) throw new Error(`Release ${tag} already exists as a draft and needs manual review`)
    if (tagSha !== sha.toLowerCase()) throw new Error(`Release ${tag} does not resolve to the deployed commit`)
    if (assertReleaseIdentity(resolvedReleases, selected, sha) !== 'existing') throw new Error(`Release ${tag} has conflicting identity`)
    if (!existing.body?.startsWith(formatReleaseNotes(selected))) throw new Error(`Release ${tag} has different published notes`)
    return
  }
  await assertFirstSuccessfulPromotion(run, deployedAt, sourceRun.display_title, api, cloudflareApi)
  assertReleaseIdentity(resolvedReleases, selected, sha)

  if (!tagSha) await api('git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/tags/${tag}`, sha }) })
  const confirmedSha = await resolvedTagCommit(tag, api)
  if (confirmedSha !== sha.toLowerCase()) throw new Error(`Created tag ${tag} does not resolve to the deployed commit`)
  const body = `${formatReleaseNotes(selected)}\n\n<!-- release-meta: deployed-at=${deployedAt} sha=${sha.toLowerCase()} production-run=${runId} -->`
  await api('releases', {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, target_commitish: sha, name: `${selected.id} — ${selected.title}`, body, draft: false, prerelease: false, make_latest: 'true' }),
  })
}

async function main() {
  const event = JSON.parse(await readFile(required('GITHUB_EVENT_PATH'), 'utf8'))
  await publishWebsiteRelease(event, createApi(), createCloudflareApi())
}

if (process.argv[1]?.endsWith('publish-website-release.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
