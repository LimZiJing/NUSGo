import { readFile, writeFile } from 'node:fs/promises'

const sectionNames = ['Added', 'Improved', 'Fixed']
const releaseIdPattern = /^(\d{4}-\d{2}-\d{2})\.([1-9]\d*)$/
const shaPattern = /^[0-9a-f]{40}$/i
const metaPattern = /^<!-- release-meta: deployed-at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) sha=([0-9a-f]{40}) production-run=(\d+) -->$/m

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function validateReleaseNotes(value, expectedId) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Release notes must be an object')
  const { id, title, sections } = value
  const match = typeof id === 'string' ? releaseIdPattern.exec(id) : null
  if (!match || !isDate(match[1])) throw new Error('Release ID must use YYYY-MM-DD.N with a valid date and sequence')
  if (expectedId && id !== expectedId) throw new Error(`Release notes ID ${id} does not match requested ID ${expectedId}`)
  if (typeof title !== 'string' || !title.trim() || title.trim().startsWith('#') || /[\r\n]/.test(title)) throw new Error('Release notes need a readable single-line title')
  if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) throw new Error('Release notes need Added, Improved and Fixed sections')
  for (const name of sectionNames) {
    const entries = sections[name]
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string' || !entry.trim() || /[\r\n]/.test(entry))) {
      throw new Error(`Release notes section ${name} must be an array of single-line non-empty strings`)
    }
  }
  if (!sectionNames.some((name) => sections[name].length > 0)) throw new Error('Release notes must describe at least one change')
  return { id, date: match[1], title: title.trim(), sections: Object.fromEntries(sectionNames.map((name) => [name, sections[name].map((entry) => entry.trim())])) }
}

export function formatReleaseNotes(notes) {
  const lines = [`# ${notes.title}`]
  for (const name of sectionNames) {
    if (notes.sections[name].length === 0) continue
    lines.push('', `## ${name}`, ...notes.sections[name].map((entry) => `- ${entry}`))
  }
  return lines.join('\n')
}

function parseReleaseBody(body) {
  if (typeof body !== 'string') throw new Error('Published release has no notes body')
  const metadata = metaPattern.exec(body)
  if (!metadata || Number.isNaN(Date.parse(metadata[1]))) throw new Error('Published release is missing valid deployment metadata')
  const lines = body.split(/\r?\n/)
  const title = lines.find((line) => line.startsWith('# '))?.slice(2)
  if (!title) throw new Error('Published release notes have no title')
  const sections = Object.fromEntries(sectionNames.map((name) => [name, []]))
  let activeSection
  for (const line of lines) {
    if (line.startsWith('## ')) {
      activeSection = sectionNames.includes(line.slice(3)) ? line.slice(3) : undefined
      continue
    }
    if (line.startsWith('<!-- release-meta:')) break
    if (/^#{1,6}\s/.test(line)) continue
    if (!line.trim()) continue
    const item = line.match(/^[-*] (.+)$/)?.[1]?.trim()
    if (!activeSection || !item || /[\r\n]/.test(item)) throw new Error('Published release notes contain content outside a supported section')
    sections[activeSection].push(item)
  }
  const notes = validateReleaseNotes({ id: '2000-01-01.1', title, sections })
  return { title: notes.title, sections: notes.sections, deployedAt: metadata[1], commitSha: metadata[2].toLowerCase(), productionRunId: metadata[3] }
}

function releaseIdFromTag(tagName) {
  if (typeof tagName !== 'string' || !tagName.startsWith('release-')) throw new Error('Release tag must start with release-')
  const id = tagName.slice('release-'.length)
  const match = releaseIdPattern.exec(id)
  if (!match || !isDate(match[1])) throw new Error(`Invalid website release tag: ${tagName}`)
  return id
}

export function validatePublishedReleases(releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub release history must be an array')
  const seenIds = new Set()
  const seenShas = new Set()
  return releases.filter((release) => !release.draft && release.tag_name?.startsWith('release-')).map((release) => {
    const id = releaseIdFromTag(release.tag_name)
    if (seenIds.has(id)) throw new Error(`GitHub has duplicate release records for ${id}`)
    seenIds.add(id)
    const notes = parseReleaseBody(release.body)
    if (typeof release.tag_commit_sha !== 'string' || !shaPattern.test(release.tag_commit_sha)
      || notes.commitSha !== release.tag_commit_sha.toLowerCase()) {
      throw new Error(`Release ${release.tag_name} metadata does not match its resolved tag commit`)
    }
    if (seenShas.has(notes.commitSha)) throw new Error(`Commit ${notes.commitSha} belongs to more than one website release`)
    seenShas.add(notes.commitSha)
    return {
      id,
      tag: release.tag_name,
      title: notes.title,
      date: id.slice(0, 10),
      deployedAt: notes.deployedAt,
      commitSha: notes.commitSha,
      sections: notes.sections,
      githubUrl: `https://github.com/LimZiJing/NUSGo/releases/tag/${release.tag_name}`,
    }
  })
}

export function buildReleaseHistory(currentNotes, previousReleases, currentSha) {
  if (!shaPattern.test(currentSha)) throw new Error('Release commit must be a full commit SHA')
  const current = validateReleaseNotes(currentNotes)
  const previous = validatePublishedReleases(previousReleases)
  const sameId = previous.find((release) => release.id === current.id)
  if (sameId) {
    if (sameId.commitSha !== currentSha.toLowerCase()) throw new Error(`Release ${current.id} is already published for another commit`)
    if (formatReleaseNotes(sameId) !== formatReleaseNotes(current)) throw new Error(`Release ${current.id} already has different published notes`)
    return { releases: previous.sort((a, b) => b.date.localeCompare(a.date) || Number(b.id.split('.')[1]) - Number(a.id.split('.')[1])) }
  }
  if (previous.some((release) => release.commitSha === currentSha.toLowerCase())) throw new Error(`Commit ${currentSha} already belongs to a published release`)
  const sequence = Number(current.id.split('.')[1])
  const sameDate = previous.filter((release) => release.date === current.date)
  const nextSequence = sameDate.length === 0 ? 1 : Math.max(...sameDate.map((release) => Number(release.id.split('.')[1]))) + 1
  if (sequence !== nextSequence) throw new Error(`Release ${current.id} is out of sequence; the next ID for ${current.date} is ${current.date}.${nextSequence}`)
  return { releases: [
    { ...current, tag: `release-${current.id}`, commitSha: currentSha.toLowerCase(), githubUrl: `https://github.com/LimZiJing/NUSGo/releases/tag/release-${current.id}` },
    ...previous,
  ].sort((a, b) => b.date.localeCompare(a.date) || Number(b.id.split('.')[1]) - Number(a.id.split('.')[1])) }
}

export function assertReleaseIdentity(existingReleases, notes, sha) {
  if (!shaPattern.test(sha)) throw new Error('Release commit must be a full commit SHA')
  const existing = validatePublishedReleases(existingReleases)
  const tag = `release-${notes.id}`
  const byTag = existing.find((release) => release.tag === tag)
  if (byTag) {
    if (byTag.commitSha !== sha.toLowerCase()) throw new Error(`Release ${tag} already targets ${byTag.commitSha}; it cannot be reassigned to ${sha}`)
    if (formatReleaseNotes({ title: byTag.title, sections: byTag.sections }) !== formatReleaseNotes(validateReleaseNotes(notes))) {
      throw new Error(`Release ${tag} already has different notes; published notes are immutable`)
    }
    return 'existing'
  }
  if (existing.some((release) => release.commitSha === sha.toLowerCase())) throw new Error(`Commit ${sha} already belongs to another release ID`)
  return 'new'
}

export function assertReleasePromotionAvailable(releaseId, sha, productionRuns) {
  if (typeof releaseId !== 'string' || !releaseIdPattern.test(releaseId)) throw new Error('Release ID must use YYYY-MM-DD.N')
  if (typeof sha !== 'string' || !shaPattern.test(sha)) throw new Error('Release commit must be a full commit SHA')
  if (!Array.isArray(productionRuns)) throw new Error('Production workflow history must be an array')

  const releaseTitle = `Production frontend release ${releaseId}`
  for (const run of productionRuns) {
    if (run?.display_title !== releaseTitle || run.conclusion !== 'success') continue
    if (typeof run.head_sha !== 'string' || !shaPattern.test(run.head_sha)) {
      throw new Error(`Successful production run for ${releaseId} has no valid commit SHA`)
    }
    if (run.head_sha.toLowerCase() !== sha.toLowerCase()) {
      throw new Error(
        `Release ${releaseId} already completed production for another commit (${run.head_sha}); retry publication from that run instead of deploying this ID`,
      )
    }
  }
}

async function listProductionRuns(repository, token) {
  const runs = []
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/deploy-frontend-production.yml/runs?event=workflow_dispatch&per_page=100&page=${page}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
      },
    )
    if (!response.ok) throw new Error(`Unable to read production workflow history (HTTP ${response.status})`)
    const result = await response.json()
    if (!Array.isArray(result.workflow_runs)) throw new Error('Production workflow history is invalid')
    runs.push(...result.workflow_runs)
    if (result.workflow_runs.length < 100) return runs
  }
}

async function main() {
  const notesPath = process.env.RELEASE_NOTES_PATH
  const outputPath = process.env.RELEASE_HISTORY_OUTPUT
  const releaseId = process.env.RELEASE_ID
  const sha = process.env.RELEASE_SHA
  const token = process.env.GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  if (!notesPath || !outputPath || !releaseId || !sha || !token || !repository) throw new Error('Release history inputs are incomplete')
  const notes = validateReleaseNotes(JSON.parse(await readFile(notesPath, 'utf8')), releaseId)
  const productionRuns = await listProductionRuns(repository, token)
  assertReleasePromotionAvailable(releaseId, sha, productionRuns)
  const releases = []
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
    })
    if (!response.ok) throw new Error(`Unable to read GitHub releases (HTTP ${response.status})`)
    const batch = await response.json()
    if (!Array.isArray(batch)) throw new Error('GitHub release history is invalid')
    releases.push(...batch)
    if (batch.length < 100) break
  }
  const resolved = []
  for (const release of releases.filter((item) => !item.draft && item.tag_name?.startsWith('release-'))) {
    const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(release.tag_name)}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
    })
    if (!response.ok) throw new Error(`Unable to resolve ${release.tag_name} (HTTP ${response.status})`)
    let object = (await response.json()).object
    const seen = new Set()
    while (object?.type === 'tag') {
      if (seen.has(object.sha)) throw new Error(`Annotated tag ${release.tag_name} contains a cycle`)
      seen.add(object.sha)
      const tagResponse = await fetch(`https://api.github.com/repos/${repository}/git/tags/${object.sha}`, {
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
      })
      if (!tagResponse.ok) throw new Error(`Unable to resolve annotated tag ${release.tag_name} (HTTP ${tagResponse.status})`)
      object = (await tagResponse.json()).object
    }
    if (object?.type !== 'commit' || !shaPattern.test(object.sha)) throw new Error(`Release tag ${release.tag_name} does not resolve to a commit`)
    resolved.push({ ...release, tag_commit_sha: object?.type === 'commit' ? object.sha : undefined })
  }
  await writeFile(outputPath, `${JSON.stringify(buildReleaseHistory(notes, resolved, sha), null, 2)}\n`)
}

if (process.argv[1]?.endsWith('release-history.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
