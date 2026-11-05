import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { contact, runPreviewCheck, startGroup, stopGroup } from './servers.mjs'
import { stopTree } from './servers/process.mjs'

/** Poll observable shutdown rather than assuming a loaded runner meets a narrow timing margin. */
async function waitUntilGone(record, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!await contact(record)) return
    await new Promise((done) => setTimeout(done, 100))
  }
  assert.fail('Manager remained reachable after the shutdown deadline.')
}

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
  await waitUntilGone(first.record)
  assert.ok(Date.now() - Date.parse(first.record.startedAt) >= 15000, 'Preview must retain its lease before expiring.')
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
  await waitUntilGone(record)
  assert.equal(await contact(record), null)
  await assert.rejects(fetch(`http://127.0.0.1:${options.ports[0]}`))
})

test('preview cleanup preserves exit codes and spawn errors after its manager disappears', async (t) => {
  const options = await fixture(t, 'preview')
  const { record } = await startGroup(options)
  await stopGroup(record)
  assert.equal(await runPreviewCheck(record, ['node', '-e', 'process.exit(7)'], options.worktree), 7)
  await assert.rejects(
    runPreviewCheck(record, [join(options.worktree, 'missing-command')], options.worktree),
    { code: 'ENOENT' },
  )
})

test('cancellation during port and control-server acquisition cannot create orphaned services', async (t) => {
  for (const cancelAtListen of [1, 2]) {
    await t.test(`cancel at listener ${cancelAtListen}`, async (t) => {
      const options = await fixture(t)
      await mkdir(options.registry)
      const preload = join(options.worktree, 'cancel-startup.mjs')
      await writeFile(preload, `
import { Server } from 'node:net'
const listen = Server.prototype.listen
let count = 0
Server.prototype.listen = function (...args) {
  const callback = args.pop()
  const cancel = ++count === ${cancelAtListen}
  return listen.call(this, ...args, (...values) => {
    if (cancel) process.emit('SIGTERM')
    callback(...values)
  })
}
`)
      const child = spawn(process.execPath, [
        '--import', pathToFileURL(preload).href, fileURLToPath(new URL('./servers.mjs', import.meta.url)),
        'supervise', JSON.stringify({ ...options, identity: 'cancel-startup' }),
      ], { cwd: options.worktree, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'] })
      let errors = ''
      child.stderr.on('data', (chunk) => { errors += chunk })
      t.after(() => stopTree(child))
      const result = await new Promise((done, reject) => {
        const timeout = setTimeout(() => reject(new Error('Cancelled supervisor did not exit.')), 10000)
        child.once('error', (error) => { clearTimeout(timeout); reject(error) })
        child.once('exit', (code) => { clearTimeout(timeout); done(code) })
      })
      assert.equal(result, 0, errors)
      const files = await readdir(options.registry)
      assert.equal(files.some((file) => file.endsWith('.json') || file.endsWith('.lock')), false)
      await assert.rejects(fetch(`http://127.0.0.1:${options.ports[0]}`))
    })
  }
})

test('POSIX termination allows a delayed graceful shutdown before escalation', { skip: process.platform === 'win32' }, async (t) => {
  const options = await fixture(t)
  for (const group of [false, true]) {
    const marker = join(options.worktree, `graceful-${group}.txt`)
    const child = spawn(process.execPath, ['-e', `
const { writeFileSync } = require('node:fs')
process.on('SIGTERM', () => setTimeout(() => {
  writeFileSync(process.argv[1], 'drained')
  process.exit(0)
}, 700))
setInterval(() => {}, 1000)
console.log('ready')
`, marker], { detached: group, stdio: ['ignore', 'pipe', 'inherit'] })
    t.after(() => stopTree(child, { group }))
    const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })))
    await new Promise((done) => child.stdout.once('data', done))
    await stopTree(child, { group })
    assert.deepEqual(await exited, { code: 0, signal: null })
    assert.equal(await readFile(marker, 'utf8'), 'drained')
  }
})

test('POSIX termination escalates when an owned process ignores SIGTERM', { skip: process.platform === 'win32' }, async (t) => {
  const child = spawn(process.execPath, ['-e', `
process.on('SIGTERM', () => {})
setInterval(() => {}, 1000)
console.log('ready')
`], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => stopTree(child, { group: false }))
  const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })))
  await new Promise((done) => child.stdout.once('data', done))
  const started = Date.now()
  await stopTree(child, { group: false })
  assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' })
  assert.ok(Date.now() - started >= 5000, 'Escalation must allow the full grace period.')
})
