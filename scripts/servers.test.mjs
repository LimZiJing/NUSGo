import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { contact, runPreviewCheck, startGroup, stopGroup } from './servers.mjs'

async function freePort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  await new Promise((done) => server.close(done))
  return port
}

async function fixture(t, mode = 'dev') {
  const root = await mkdtemp(join(tmpdir(), 'nusgo-servers-'))
  const ports = [await freePort()]
  const child = join(root, 'listener.mjs')
  await writeFile(child, `
import { createServer } from 'node:http'
createServer((req, res) => res.end('fixture')).listen(Number(process.env.NUSGO_FRONTEND_PORT), '127.0.0.1')
`)
  const parent = join(root, 'parent.mjs')
  await writeFile(parent, `
import { spawn } from 'node:child_process'
spawn(process.execPath, [${JSON.stringify(child)}], { stdio: 'inherit' })
setInterval(() => {}, 1000)
`)
  const options = { registry: join(root, 'registry'), worktree: root, mode, ports, command: [parent] }
  t.after(async () => {
    const files = await readdir(options.registry).catch(() => [])
    for (const file of files.filter((file) => file.endsWith('.json'))) {
      const record = JSON.parse(await readFile(join(options.registry, file), 'utf8'))
      if (await contact(record)) await stopGroup(record)
    }
    // Only remove the verified temporary fixture directory, never repository state.
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  return options
}

test('start reuses a healthy worktree group and stop releases its descendant listener', async (t) => {
  const options = await fixture(t)
  const first = await startGroup(options)
  assert.equal(first.reused, false)
  assert.equal((await fetch(`http://127.0.0.1:${options.ports[0]}`)).status, 200)
  const second = await startGroup(options)
  assert.equal(second.reused, true)
  assert.equal(second.record.pid, first.record.pid)
  await stopGroup(first.record)
  await assert.rejects(fetch(`http://127.0.0.1:${options.ports[0]}`))
  assert.equal((await readdir(options.registry)).some((file) => file.endsWith('.json.lock')), false)
})

test('concurrent starts converge on one manager', async (t) => {
  const options = await fixture(t)
  const results = await Promise.all([startGroup(options), startGroup(options)])
  assert.equal(results[0].record.pid, results[1].record.pid)
  assert.equal(results.filter((result) => !result.reused).length, 1)
})

test('occupied ports fail without stopping the existing listener', async (t) => {
  const options = await fixture(t)
  const occupied = createServer()
  await new Promise((done) => occupied.listen(options.ports[0], '127.0.0.1', done))
  t.after(() => new Promise((done) => occupied.close(done)))
  await assert.rejects(startGroup(options), /exited/)
  assert.equal(occupied.listening, true)
  assert.equal((await readdir(options.registry)).some((file) => file.endsWith('.json.lock')), false)
})

test('an unverified registry PID is never used for termination', async (t) => {
  const options = await fixture(t)
  const first = await startGroup(options)
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true })
  t.after(() => unrelated.kill())
  const stale = { ...first.record, token: 'invalid', pid: unrelated.pid }
  await assert.rejects(stopGroup(stale), /no PID was killed/)
  assert.equal(unrelated.exitCode, null)
  assert.equal((await contact(first.record)).state, 'ready')
  const file = (await readdir(options.registry)).find((name) => name.endsWith('.json'))
  await writeFile(join(options.registry, file), JSON.stringify(stale))
  await assert.rejects(startGroup(options), /Unverified registry entry/)
  await writeFile(join(options.registry, file), JSON.stringify(first.record))
})

test('temporary preview rejects another group and expires without its wrapper lease', async (t) => {
  const options = await fixture(t, 'preview')
  const first = await startGroup(options)
  await assert.rejects(startGroup(options), /already owns this worktree/)
  await new Promise((done) => setTimeout(done, 16500))
  assert.equal(await contact(first.record), null)
  await assert.rejects(fetch(`http://127.0.0.1:${options.ports[0]}`))
})

test('a failing preview check preserves its exit code and stops the preview tree', async (t) => {
  const options = await fixture(t, 'preview')
  const { record } = await startGroup(options)
  const code = await runPreviewCheck(record, ['node', '-e', 'process.exit(process.env.NUSGO_PREVIEW_URL ? 7 : 9)'], options.worktree)
  assert.equal(code, 7)
  assert.equal(await contact(record), null)
  await assert.rejects(fetch(`http://127.0.0.1:${options.ports[0]}`))
})

test('immediate launcher exit leaves neither registry ownership nor a running manager', async (t) => {
  const options = await fixture(t)
  options.command = ['-e', 'process.exit(1)']
  await assert.rejects(startGroup(options), /exited/)
  const files = await readdir(options.registry)
  assert.equal(files.some((file) => file.endsWith('.json') || file.endsWith('.lock')), false)
})

test('launcher exit also stops its descendant HTTP listener', async (t) => {
  const options = await fixture(t)
  const parent = options.command[0]
  const source = await readFile(parent, 'utf8')
  await writeFile(parent, source.replace('setInterval(() => {}, 1000)', 'setTimeout(() => process.exit(1), 2000)'))
  const { record } = await startGroup(options)
  await new Promise((done) => setTimeout(done, 3000))
  assert.equal(await contact(record), null)
  await assert.rejects(fetch(`http://127.0.0.1:${options.ports[0]}`))
})
