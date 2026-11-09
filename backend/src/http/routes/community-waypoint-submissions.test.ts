import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadBackendConfig } from '../../config.ts'
import { closeHttpServer, listenHttpServer } from '../../server.ts'
import { createApp } from '../app.ts'
import { parseCommunityWaypointSubmission } from '../validation/community-waypoint-submission.ts'
import {
  createPrivateSubmissionIssueDraft,
  createPrivateSubmissionIssueWriter,
  type PrivateSubmissionIssueWriter,
} from './community-waypoint-submissions.ts'

const validNewPlace = {
  kind: 'new-place',
  category: 'water_cooler',
  longitude: 103.78,
  latitude: 1.29,
  explanation: 'Near the west entrance.',
} as const

async function withServer(
  writer: PrivateSubmissionIssueWriter | null,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const config = loadBackendConfig({
    NODE_ENV: 'test',
    API_CORS_ORIGINS: 'http://localhost:5173',
  })
  const server = await listenHttpServer(
    createApp(config, null, null, null, writer),
    '127.0.0.1',
    0,
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not expose its port')
  try {
    await run('http://127.0.0.1:' + address.port)
  } finally {
    await closeHttpServer(server)
  }
}

function post(
  baseUrl: string,
  body: unknown,
  clientAddress = '198.51.100.20',
): Promise<Response> {
  return fetch(baseUrl + '/api/community-waypoint-submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': clientAddress,
    },
    body: JSON.stringify(body),
  })
}

function readRawSubmissionJson(body: string): unknown {
  const match = body.match(
    /<!-- NUSGO_SUBMISSION_JSON_V1_START -->\r?\n(`{3,})json\r?\n([\s\S]*?)\r?\n\1\r?\n<!-- NUSGO_SUBMISSION_JSON_V1_END -->/,
  )
  assert.ok(match, 'issue should include a marked JSON code block')
  return JSON.parse(match[2]) as unknown
}

describe('private submission issue creation', () => {
  it('formats submission details by report kind without empty placeholder fields', () => {
    const submission = parseCommunityWaypointSubmission(validNewPlace)
    const issue = createPrivateSubmissionIssueDraft(submission)
    assert.equal(issue.title, '[New place] Water cooler waypoint')
    assert.deepEqual(issue.labels, ['kind:new-place', 'review:new'])
    assert.match(issue.body, /## Summary/)
    assert.match(issue.body, /\| Category \| Water cooler \|/)
    assert.match(issue.body, /\| Location \| Latitude 1\.29, longitude 103\.78/)
    assert.match(issue.body, /\[open map\]\(https:\/\/www\.openstreetmap\.org/)
    assert.doesNotMatch(issue.body, /\| (?:Building|Floor) \|/)
    assert.match(issue.body, /## Submitted details \(unverified\)/)
    assert.match(issue.body, /\*\*Category:\*\* Water cooler/)
    assert.match(issue.body, /\*\*Coordinates \(latitude, longitude\):\*\* 1\.29, 103\.78/)
    assert.match(issue.body, /\*\*Submitter explanation \(unverified\):\*\*/)
    assert.match(issue.body, /<summary>Raw submission JSON — unverified/)
    assert.deepEqual(readRawSubmissionJson(issue.body), { schemaVersion: 1, submission })
    assert.doesNotMatch(issue.body, /N\/A|No change proposed/)
    assert.match(issue.body, /Photo retention and orphan cleanup/)
    assert.match(issue.body, /## Maintainer review/)
    assert.doesNotMatch(issue.body, /\*\*Reporter (name|email)/i)
    const markdownNote = parseCommunityWaypointSubmission({
      ...validNewPlace,
      explanation: 'Water ~~station~~',
    })
    const markdownIssue = createPrivateSubmissionIssueDraft(markdownNote)
    assert.match(markdownIssue.body, /Submitter explanation \(unverified\):\*\* Water \\~\\~station\\~\\~/)
    assert.deepEqual(readRawSubmissionJson(markdownIssue.body), { schemaVersion: 1, submission: markdownNote })
  })

  it('adds building and floor to the summary only when they are supplied', () => {
    const submission = parseCommunityWaypointSubmission({
      ...validNewPlace,
      building: 'Central Library',
      floor: 2,
    })
    const issue = createPrivateSubmissionIssueDraft(submission)
    assert.match(issue.body, /\| Building \| Central Library \|/)
    assert.match(issue.body, /\| Floor \| 2 \|/)

    const correction = parseCommunityWaypointSubmission({
      kind: 'correction',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      requestedChange: 'Clarify the floor.',
      floor: 1,
    })
    const correctionIssue = createPrivateSubmissionIssueDraft(correction)
    assert.match(correctionIssue.body, /\| Proposed floor \| 1 \|/)
    assert.doesNotMatch(correctionIssue.body, /\| Proposed building \|/)
  })

  it('uses the matching kind label for corrections and removals', () => {
    const correction = parseCommunityWaypointSubmission({
      kind: 'correction',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      requestedChange: 'Move the location to the north entrance.',
    })
    const removal = parseCommunityWaypointSubmission({
      kind: 'removal',
      waypointId: 'cw-123e4567-e89b-42d3-a456-426614174000',
      reason: 'The amenity has been removed.',
    })
    const correctionIssue = createPrivateSubmissionIssueDraft(correction)
    const removalIssue = createPrivateSubmissionIssueDraft(removal)
    assert.equal(correctionIssue.title, '[Correction] cw-123e4567-e89b-42d3-a456-426614174000')
    assert.match(correctionIssue.body, /\| Report \| Correction \|/)
    assert.match(correctionIssue.body, /\*\*Requested change \(unverified\):\*\*/)
    assert.doesNotMatch(correctionIssue.body, /No change proposed/)
    assert.equal(removalIssue.title, '[Removal] cw-123e4567-e89b-42d3-a456-426614174000')
    assert.match(removalIssue.body, /\*\*Removal reason \(unverified\):\*\*/)
    assert.deepEqual(correctionIssue.labels, ['kind:correction', 'review:new'])
    assert.deepEqual(removalIssue.labels, ['kind:removal', 'review:new'])
  })

  it('sends the server credential only to the fixed private repository endpoint', async () => {
    let requestUrl = ''
    let requestHeaders = new Headers()
    let requestBody: { title: string; body: string; labels: string[] } | undefined
    const fetcher: typeof fetch = async (input, init) => {
      requestUrl = String(input)
      requestHeaders = new Headers(init?.headers)
      requestBody = JSON.parse(String(init?.body)) as {
        title: string
        body: string
        labels: string[]
      }
      return new Response(null, { status: 201 })
    }
    const writer = createPrivateSubmissionIssueWriter('server-only-token', fetcher)
    assert.ok(writer)
    await writer(createPrivateSubmissionIssueDraft(parseCommunityWaypointSubmission(validNewPlace)), new AbortController().signal)

    assert.equal(
      requestUrl,
      'https://api.github.com/repos/LimZiJing/NUSGo-waypoint-submissions/issues',
    )
    assert.equal(requestHeaders.get('authorization'), 'Bearer server-only-token')
    assert.equal(requestHeaders.get('x-github-api-version'), '2022-11-28')
    assert.deepEqual(requestBody?.labels, ['kind:new-place', 'review:new'])
    assert.equal(createPrivateSubmissionIssueWriter(null), null)
  })

  it('treats GitHub API failures as failed submissions', async () => {
    const writer = createPrivateSubmissionIssueWriter('server-only-token', async () =>
      new Response(null, { status: 403 }),
    )
    assert.ok(writer)
    await assert.rejects(
      writer(createPrivateSubmissionIssueDraft(parseCommunityWaypointSubmission(validNewPlace)), new AbortController().signal),
      /could not be created/,
    )
  })
  it('returns a generic receipt and never exposes the private issue URL', async () => {
    let receivedTitle = ''
    const writer: PrivateSubmissionIssueWriter = async (issue) => {
      receivedTitle = issue.title
    }
    await withServer(writer, async (baseUrl) => {
      const response = await post(baseUrl, validNewPlace)
      assert.equal(response.status, 202)
      const receipt = await response.json() as Record<string, unknown>
      assert.deepEqual(receipt, { status: 'received' })
      assert.equal(receivedTitle, '[New place] Water cooler waypoint')
      assert.equal('issueUrl' in receipt, false)
      assert.equal('issueNumber' in receipt, false)
    })
  })

  it('rejects unsupported fields before creating an issue', async () => {
    let writes = 0
    const writer: PrivateSubmissionIssueWriter = async () => { writes += 1 }
    await withServer(writer, async (baseUrl) => {
      const response = await post(baseUrl, { ...validNewPlace, photoUrl: 'https://example.test/photo' })
      assert.equal(response.status, 400)
      assert.equal(writes, 0)
    })
  })

  it('rejects multipart photo files without creating an issue', async () => {
    let writes = 0
    const writer: PrivateSubmissionIssueWriter = async () => { writes += 1 }
    await withServer(writer, async (baseUrl) => {
      const form = new FormData()
      form.append('kind', 'new-place')
      form.append('photo', new Blob(['private image bytes'], { type: 'image/jpeg' }), 'evidence.jpg')
      const response = await fetch(baseUrl + '/api/community-waypoint-submissions', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '198.51.100.21' },
        body: form,
      })
      assert.equal(response.status, 400)
      assert.equal(writes, 0)
    })
  })
  it('returns a safe unavailable response when no credential or queue is configured', async () => {
    await withServer(null, async (baseUrl) => {
      const response = await post(baseUrl, validNewPlace)
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), {
        error: 'Submissions are not available',
        code: 'not_ready',
      })
    })
  })

  it('hides upstream errors from the public response', async () => {
    const writer: PrivateSubmissionIssueWriter = async () => {
      throw new Error('private token and issue URL must not leak')
    }
    await withServer(writer, async (baseUrl) => {
      const response = await post(baseUrl, validNewPlace)
      assert.equal(response.status, 503)
      const body = await response.text()
      assert.match(body, /Submission could not be received/)
      assert.doesNotMatch(body, /private token|issue URL/)
    })
  })

  it('rate-limits repeated anonymous submissions', async () => {
    const writer: PrivateSubmissionIssueWriter = async () => undefined
    await withServer(writer, async (baseUrl) => {
      const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.77' }
      for (let index = 0; index < 3; index += 1) {
        const accepted = await fetch(baseUrl + '/api/community-waypoint-submissions', {
          method: 'POST',
          headers,
          body: JSON.stringify(validNewPlace),
        })
        assert.equal(accepted.status, 202)
      }
      const limited = await fetch(baseUrl + '/api/community-waypoint-submissions', {
        method: 'POST',
        headers,
        body: JSON.stringify(validNewPlace),
      })
      assert.equal(limited.status, 429)
      assert.ok(Number(limited.headers.get('retry-after')) > 0)
    })
  })

  it('allows POST only', async () => {
    await withServer(async () => undefined, async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/community-waypoint-submissions')
      assert.equal(response.status, 405)
      assert.equal(response.headers.get('allow'), 'POST, OPTIONS')
    })
  })
})
